// Shopify app (Phase 1): OAuth install with persisted state, offline token (encrypted at rest),
// webhook HMAC + dedupe, orders/create -> local order, app/uninstalled, GDPR topics,
// product push via productSet, fulfillment via fulfillmentCreate. Admin GraphQL API only.
// All HTTP goes through globalThis.fetch (tests replace it).
import crypto from "node:crypto";
import fs from "node:fs";
import * as repo from "./repo.js";
import { addRecord, updateRecord, getState } from "../saas-store.js";
import { getPriceList } from "../services/price-list-service.js";

const TIMEOUT_MS = 15_000;
export const DEFAULT_SCOPES = "write_products,read_orders,write_orders,write_fulfillments,read_fulfillments,write_merchant_managed_fulfillment_orders";
export const WEBHOOK_TOPICS = { "orders/create": "ORDERS_CREATE", "app/uninstalled": "APP_UNINSTALLED" };
export const GDPR_TOPICS = ["customers/data_request", "customers/redact", "shop/redact"];

export const config = () => ({
  apiKey: process.env.SHOPIFY_API_KEY || process.env.SHOPIFY_CLIENT_ID || "",
  apiSecret: process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET || "",
  scopes: process.env.SHOPIFY_SCOPES || DEFAULT_SCOPES,
  appUrl: String(process.env.APP_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/$/, ""),
  apiVersion: process.env.SHOPIFY_ADMIN_API_VERSION || "2025-10"
});
export const isConfigured = () => { const c = config(); return !!(c.apiKey && c.apiSecret && c.appUrl); };
export const redirectUri = () => `${config().appUrl}/api/shopify/app/callback`;
export const webhookUri = () => `${config().appUrl}/api/shopify/app/webhooks`;

export function normalizeShop(shop = "") {
  const s = String(shop).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null;
}

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** OAuth / app-launch query HMAC: hex SHA-256 over sorted "k=v" pairs (excluding hmac/signature). */
export function verifyQueryHmac(query = {}, secret = config().apiSecret) {
  const { hmac, signature, ...rest } = query;
  if (!hmac || !secret) return false;
  const msg = Object.keys(rest).sort().map(k => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`).join("&");
  return safeEq(crypto.createHmac("sha256", secret).update(msg).digest("hex"), String(hmac).toLowerCase());
}
/** Webhook HMAC: base64 SHA-256 over the raw request body bytes. */
export function verifyWebhookHmac(rawBody, header, secret = config().apiSecret) {
  if (!secret || !header || !Buffer.isBuffer(rawBody)) return false;
  return safeEq(crypto.createHmac("sha256", secret).update(rawBody).digest("base64"), header);
}

/** Step 1: build the authorize URL and persist the state nonce. */
export async function beginInstall({ shop, tenantId }) {
  const s = normalizeShop(shop);
  if (!s) throw Object.assign(new Error("invalid_shop_domain"), { status: 400 });
  if (!isConfigured()) throw Object.assign(new Error("shopify_app_not_configured"), { status: 503 });
  await repo.pruneOAuthStates();
  const nonce = crypto.randomBytes(16).toString("hex");
  await repo.saveOAuthState({ nonce, shop: s, tenantId });
  const q = new URLSearchParams({ client_id: config().apiKey, scope: config().scopes, redirect_uri: redirectUri(), state: nonce });
  return { shop: s, state: nonce, url: `https://${s}/admin/oauth/authorize?${q}` };
}

/** Step 2: callback. Verifies HMAC, state (single use, expiry, shop match), exchanges code for an offline token. */
export async function completeInstall(query = {}) {
  const shop = normalizeShop(query.shop);
  if (!shop) throw Object.assign(new Error("invalid_shop_domain"), { status: 400 });
  if (!verifyQueryHmac(query)) throw Object.assign(new Error("invalid_hmac"), { status: 401 });
  const st = await repo.consumeOAuthState(query.state);
  if (!st || st.shop !== shop) throw Object.assign(new Error("invalid_oauth_state"), { status: 401 });
  const r = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ client_id: config().apiKey, client_secret: config().apiSecret, code: String(query.code || "") }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw Object.assign(new Error(`token_exchange_failed:${r.status}`), { status: 502 });
  const data = await r.json();
  if (!data.access_token) throw Object.assign(new Error("token_missing"), { status: 502 });
  await repo.saveShop({ shop, tenantId: st.tenant_id, accessToken: data.access_token, scopes: data.scope || "" });
  let webhooks = [];
  try { webhooks = await registerWebhooks(shop); } catch (e) { console.error("[shopify] webhook registration failed:", e.message); webhooks = [{ error: e.message }]; }
  return { shop, tenant_id: st.tenant_id, scopes: data.scope || "", webhooks };
}

export async function graphql(shop, query, variables = {}) {
  const token = await repo.shopToken(shop);
  if (!token) throw Object.assign(new Error("shop_not_connected"), { status: 409 });
  const r = await fetch(`https://${shop}/admin/api/${config().apiVersion}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`shopify_graphql_${r.status}`);
  const d = await r.json();
  if (d.errors) throw new Error(`shopify_graphql:${JSON.stringify(d.errors).slice(0, 500)}`);
  return d.data;
}
const userErrors = (p, what) => { if (p?.userErrors?.length) throw new Error(`${what}:${p.userErrors.map(e => e.message).join("; ")}`); return p; };

const WEBHOOK_CREATE = `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) { webhookSubscription { id topic } userErrors { field message } } }`;
/** GDPR compliance topics cannot be subscribed via the API; they are declared in shopify.app.toml. */
export async function registerWebhooks(shop) {
  const out = [];
  for (const topic of Object.values(WEBHOOK_TOPICS)) {
    const d = await graphql(shop, WEBHOOK_CREATE, { topic, webhookSubscription: { uri: webhookUri(), format: "JSON" } });
    const p = d?.webhookSubscriptionCreate;
    const dup = p?.userErrors?.some(e => /already been taken|already exists/i.test(e.message));
    out.push({ topic, id: p?.webhookSubscription?.id || null, ok: !!p?.webhookSubscription?.id || dup, errors: dup ? [] : (p?.userErrors || []).map(e => e.message) });
  }
  return out;
}

// ---------------- Webhooks ----------------
/** Entry point for every webhook delivery. Returns {status, body}. HMAC already verified by the caller (route) or here. */
export async function handleWebhook({ rawBody, headers }) {
  const h = k => headers[k] ?? headers[k.toLowerCase()];
  if (!verifyWebhookHmac(rawBody, h("x-shopify-hmac-sha256"))) return { status: 401, body: "invalid_hmac" };
  let payload; try { payload = JSON.parse(rawBody.toString("utf8")); } catch { return { status: 400, body: "invalid_json" }; }
  const topic = String(h("x-shopify-topic") || "").toLowerCase(), shop = normalizeShop(h("x-shopify-shop-domain") || payload.shop_domain);
  const id = String(h("x-shopify-webhook-id") || h("x-shopify-event-id") || crypto.createHash("sha256").update(rawBody).digest("hex"));
  if (!shop) return { status: 400, body: "invalid_shop" };
  if (!(await repo.logWebhook({ id, topic, shop }))) return { status: 200, body: "duplicate" };
  try {
    const note = await dispatch(topic, shop, payload);
    await repo.setWebhookStatus(id, "processed", note || "");
  } catch (e) {
    console.error(`[shopify webhook] ${topic} ${shop}:`, e.message);
    await repo.setWebhookStatus(id, "error", e.message);
  }
  return { status: 200, body: "ok" }; // always 200 once verified+logged so Shopify does not retry a poison payload
}

async function dispatch(topic, shop, p) {
  switch (topic) {
    case "orders/create": return onOrderCreate(shop, p);
    case "app/uninstalled": await repo.markUninstalled(shop); return "token_deleted";
    case "customers/data_request": return onDataRequest(shop, p);
    case "customers/redact": return onCustomerRedact(shop, p);
    case "shop/redact": return onShopRedact(shop);
    default: return "ignored";
  }
}

const newOrderId = () => `POD-${new Date().getUTCFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
const gidNum = g => String(g ?? "").split("/").pop();

export async function onOrderCreate(shop, o) {
  const shopRow = await repo.getShop(shop);
  const tenantId = shopRow?.tenant_id || process.env.DEFAULT_TENANT_ID || "tenant_demo";
  const shopifyOrderId = gidNum(o.admin_graphql_api_id || o.id);
  const localId = newOrderId();
  if (!(await repo.claimOrderLink({ shop, shopifyOrderId, localOrderId: localId }))) return `already_linked`;
  const sa = o.shipping_address || {}, now = new Date().toISOString();
  const items = (o.line_items || []).map(li => ({ name: li.title || li.name, sku: li.sku || "", quantity: Number(li.quantity || 1), unit_price: Number(li.price || 0), variant_title: li.variant_title || "", shopify_line_item_id: String(li.id || ""), shopify_variant_id: String(li.variant_id || "") }));
  const paid = /paid/i.test(o.financial_status || "");
  await addRecord("orders", {
    id: localId, tenant_id: tenantId, store_id: `shopify:${shop}`, channel: "shopify", source: "shopify",
    external_order_id: shopifyOrderId, external_order_name: o.name || "", status: paid ? "Production" : "Order requested",
    payment_status: paid ? "paid" : String(o.financial_status || "pending"), payment_provider: "shopify",
    customer_email: o.email || o.contact_email || "", customer_name: [sa.first_name, sa.last_name].filter(Boolean).join(" ") || o.customer?.first_name || "",
    customer_phone: sa.phone || "", shipping_address: { name: [sa.first_name, sa.last_name].filter(Boolean).join(" "), address1: sa.address1 || "", address2: sa.address2 || "", city: sa.city || "", zip: sa.zip || "", country: sa.country_code || "" },
    shopify_customer_id: o.customer?.id ? String(o.customer.id) : "",
    items, currency: o.currency || "CHF", subtotal: Number(o.subtotal_price || 0), tax: Number(o.total_tax || 0), grand_total: Number(o.total_price || 0),
    revenue: Number(o.total_price || 0) - Number(o.total_tax || 0), created_at: now, updated_at: now
  });
  await addRecord("tasks", { id: `prod_${localId}`, tenant_id: tenantId, type: "production_job", title: `Produce Shopify order ${o.name || shopifyOrderId}`, status: paid ? "open" : "waiting_payment", risk: "low", payload: { order_id: localId, shop, shopify_order_id: shopifyOrderId }, created_at: now });
  return `order:${localId}`;
}

const REDACTED = "[redacted]";
async function redactOrders(pred) {
  const rows = ((await getState()).orders || []).filter(o => o.channel === "shopify" && pred(o));
  for (const o of rows) await updateRecord("orders", o.id, { customer_email: "", customer_name: REDACTED, customer_phone: "", shipping_address: { name: REDACTED, country: o.shipping_address?.country || "" }, shopify_customer_id: "", redacted_at: new Date().toISOString() });
  return rows.length;
}
export async function onDataRequest(shop, p) {
  const tenantId = (await repo.getShop(shop))?.tenant_id || process.env.DEFAULT_TENANT_ID || "tenant_demo";
  await addRecord("tasks", { id: `gdpr_${crypto.randomBytes(6).toString("hex")}`, tenant_id: tenantId, type: "gdpr_data_request", title: `Shopify data request (${shop})`, status: "open", risk: "high", payload: { shop, customer_id: p.customer?.id, orders_requested: p.orders_requested || [], data_request_id: p.data_request?.id }, created_at: new Date().toISOString() });
  return "task_created";
}
export async function onCustomerRedact(shop, p) {
  const ids = new Set((p.orders_to_redact || []).map(String)), email = String(p.customer?.email || "").toLowerCase(), cid = p.customer?.id ? String(p.customer.id) : "";
  const n = await redactOrders(o => o.store_id === `shopify:${shop}` && (ids.has(String(o.external_order_id)) || (email && String(o.customer_email).toLowerCase() === email) || (cid && o.shopify_customer_id === cid)));
  return `redacted:${n}`;
}
export async function onShopRedact(shop) {
  const n = await redactOrders(o => o.store_id === `shopify:${shop}`);
  await repo.deleteShopData(shop);
  return `shop_redacted:${n}`;
}

// ---------------- Product push (productSet) ----------------
let catalogCache = null;
export function catalog() { return catalogCache || (catalogCache = JSON.parse(fs.readFileSync(new URL("../data/studio-catalog.json", import.meta.url), "utf8"))); }
export const catalogProducts = () => catalog().products.map(p => ({ id: p.id, name: p.name?.en || p.id, category: p.category, materials: (p.materials || []).length }));
const en = v => (typeof v === "object" && v ? v.en || Object.values(v)[0] : v) || "";
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Pure: build the ProductSetInput for a local catalog product. CHF price = admin price list, lowest qty tier. */
export function buildProductSetInput(product, { priceList = getPriceList(), appUrl = config().appUrl, existing = null } = {}) {
  const prices = priceList.products?.[product.id] || {};
  const mats = product.materials?.length ? product.materials : [null];
  const chf = mid => { const v = prices[mid || "_"]?.CHF?.[0]; return v == null ? null : Number(v).toFixed(2); };
  const optName = product.materials?.length ? "Material" : "Title";
  const variants = mats.map(m => ({ name: m ? en(m.name) : "Default Title", mid: m?.id || "_" })).filter(v => chf(v.mid === "_" ? null : v.mid) != null)
    .map(v => ({ optionValues: [{ optionName: optName, name: v.name }], price: chf(v.mid === "_" ? null : v.mid), sku: `${product.id}${v.mid === "_" ? "" : `-${v.mid}`}`, inventoryPolicy: "CONTINUE", taxable: true }));
  if (!variants.length) throw Object.assign(new Error("no_chf_price"), { status: 422 });
  const publicBase = /^https:\/\//.test(appUrl) && !/localhost|127\.0\.0\.1/.test(appUrl) ? appUrl : "";
  const img = product.mockup_photo?.src;
  const input = {
    title: en(product.name),
    descriptionHtml: `<p>${escHtml(en(product.name))} — ${escHtml(product.technique || "print")} personalised wedding product, printed on demand.</p>`,
    vendor: "POD Wedding Studio", productType: product.category || "", status: existing ? undefined : "DRAFT",
    tags: ["pod-wedding", product.category, ...(product.eco_tags || [])].filter(Boolean),
    productOptions: [{ name: optName, position: 1, values: variants.map(v => ({ name: v.optionValues[0].name })) }],
    variants: variants.map(v => { const id = existing?.variant_ids?.[v.sku]; return id ? { ...v, id } : v; })
  };
  if (publicBase && img) input.files = [{ originalSource: `${publicBase}/${img.replace(/^\//, "")}`, contentType: "IMAGE", alt: en(product.name) }];
  if (input.status === undefined) delete input.status;
  return input;
}
const PRODUCT_SET = `mutation productSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers, $synchronous: Boolean!) {
  productSet(input: $input, identifier: $identifier, synchronous: $synchronous) {
    product { id handle variants(first: 100) { nodes { id sku } } }
    userErrors { field message code } } }`;
export function buildProductSetVariables(product, opts = {}) {
  const input = buildProductSetInput(product, opts);
  return { input, synchronous: true, ...(opts.existing?.shopify_product_id ? { identifier: { id: opts.existing.shopify_product_id } } : {}) };
}
export async function pushProduct(shop, localProductId) {
  const s = normalizeShop(shop); if (!s) throw Object.assign(new Error("invalid_shop_domain"), { status: 400 });
  const product = catalog().products.find(p => p.id === localProductId);
  if (!product) throw Object.assign(new Error("product_not_found"), { status: 404 });
  const existing = await repo.getProductLink(s, product.id);
  const d = await graphql(s, PRODUCT_SET, buildProductSetVariables(product, { existing }));
  const p = userErrors(d?.productSet, "product_set");
  const variantIds = Object.fromEntries((p.product?.variants?.nodes || []).map(v => [v.sku, v.id]));
  await repo.saveProductLink({ shop: s, localProductId: product.id, shopifyProductId: p.product.id, variantIds });
  return { shop: s, local_product_id: product.id, shopify_product_id: p.product.id, handle: p.product.handle, variants: Object.keys(variantIds).length, updated: !!existing };
}

// ---------------- Fulfillment ----------------
const FULFILLMENT_ORDERS = `query fo($id: ID!) { order(id: $id) { id fulfillmentOrders(first: 20) { nodes { id status supportedActions { action } } } } }`;
const FULFILLMENT_CREATE = `mutation fulfillmentCreate($fulfillment: FulfillmentInput!, $message: String) {
  fulfillmentCreate(fulfillment: $fulfillment, message: $message) { fulfillment { id status trackingInfo { number company url } } userErrors { field message } } }`;
/** Pure: FulfillmentInput for all open fulfillment orders of an order. */
export function buildFulfillmentInput(fulfillmentOrders, { tracking_number, carrier, tracking_url, notify = true } = {}) {
  const open = (fulfillmentOrders || []).filter(f => ["OPEN", "IN_PROGRESS"].includes(f.status) && (!f.supportedActions || f.supportedActions.some(a => a.action === "CREATE_FULFILLMENT")));
  if (!open.length) return null;
  const trackingInfo = {}; if (tracking_number) trackingInfo.number = String(tracking_number); if (carrier) trackingInfo.company = String(carrier); if (tracking_url) trackingInfo.url = String(tracking_url);
  return { lineItemsByFulfillmentOrder: open.map(f => ({ fulfillmentOrderId: f.id })), notifyCustomer: !!notify, ...(Object.keys(trackingInfo).length ? { trackingInfo } : {}) };
}
/** Called when a local order becomes Shipped. No-op ({status:"not_linked"}) for non-Shopify orders. */
export async function fulfillLocalOrder(localOrderId, tracking = {}) {
  const link = await repo.orderLinkByLocal(localOrderId);
  if (!link) return { status: "not_linked" };
  if (link.fulfillment_id) return { status: "already_fulfilled", fulfillment_id: link.fulfillment_id };
  const gid = `gid://shopify/Order/${link.shopify_order_id}`;
  const d = await graphql(link.shop, FULFILLMENT_ORDERS, { id: gid });
  const fulfillment = buildFulfillmentInput(d?.order?.fulfillmentOrders?.nodes, tracking);
  if (!fulfillment) { await repo.updateOrderLink(link.shop, link.shopify_order_id, { status: "nothing_to_fulfill" }); return { status: "nothing_to_fulfill" }; }
  const r = userErrors((await graphql(link.shop, FULFILLMENT_CREATE, { fulfillment }))?.fulfillmentCreate, "fulfillment_create");
  await repo.updateOrderLink(link.shop, link.shopify_order_id, { status: "fulfilled", fulfillment_id: r.fulfillment?.id || null });
  return { status: "fulfilled", fulfillment_id: r.fulfillment?.id || null };
}
