// Storefront checkout: server quote → internal order → PayPal order → capture on return / webhook.
import crypto from "node:crypto";
import { addRecord, findRecord, findWhere, updateRecord } from "../saas-store.js";
import { quoteCart, round2, currencyForCountry, rateFor } from "./pricing-service.js";
import { studioCatalog } from "./studio-service.js";
import { createPayPalOrder, capturePayPalOrder, approvalUrl, paypalConfigured } from "../connectors/paypal.js";
import { twintConfigured, twintStatus, startTwintOrder, monitorTwintOrder } from "../connectors/twint.js";
import { createProofForOrder } from "./proof-service.js";
import { quoteShipping } from "./shipping-service.js";
import { getConnectorCredentials } from "./connector-config-service.js";
import { HttpError } from "../http/middleware.js";
import { ensureCustomer } from "./account-service.js";
import { sendEmail, renderTemplate } from "./email-service.js";
import { hmacHex, timingSafeHexEqual } from "../utils/crypto.js";
import { baseUrl as publicBaseUrl } from "../config.js";
import { isProjectId, projectExpired, retention, mockupUrl, hasMockup, ownsProject } from "./studio-service.js";
import { getFees, vatRate, shippingAmount, carrierDays, packagingPrice, pricesIncludeVat, addBusinessDays } from "./fees-service.js";
import { evaluatePromo, redeemPromo } from "./promo-service.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);

const STOREFRONT_MARGIN = Number(process.env.STOREFRONT_MARGIN || 0.4); // same default margin as index.html HOME_MARGIN

/**
 * Homepage products are Studio products (cart lines carry product_id). They are priced with the shared
 * studio-pricing.js in the market currency (CH → CHF, EU → EUR), so the drawer, checkout and charge agree.
 */
function quoteStudioLines(raws, cur) {
  if (!raws.length) return [];
  const cat = studioCatalog(), byId = new Map((cat.products || []).map(p => [p.id, p]));
  const market = cur === "CHF" ? "CH" : "EU";
  const items = raws.map(r => {
    const qty = Number(r.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 10000) throw new HttpError(400, "invalid_quantity", `Invalid quantity for ${r.product_id}`);
    const prod = byId.get(r.product_id);
    const mat = (prod.materials || []).find(m => m.id === r.material_id);
    return { product_id: prod.id, qty, ...(mat ? { material_id: mat.id } : {}) };
  });
  // Sell prices come from the admin price list attached to studioCatalog() (StudioPricing.listPrice).
  const q = StudioPricing.quote(cat, { market, margin: STOREFRONT_MARGIN, items });
  if (q.lines.length !== items.length) throw new HttpError(400, "product_unavailable", `Product not available for this market: ${q.warnings.join(", ")}`);
  // CNY (internal) requests: convert the EUR market price back to the base currency.
  const back = cur === "CNY" ? 1 / rateFor("EUR") : 1;
  return q.lines.map((l, i) => {
    const prod = byId.get(l.product_id), mat = (prod.materials || []).find(m => m.id === l.material_id);
    const unit = round2(l.price * back);
    return {
      sku: String(prod.id).toUpperCase(), product_id: prod.id, name: prod.name?.en || prod.id, quantity: l.qty,
      material: mat?.name?.en || raws[i].material || "", material_id: l.material_id || "", unit_price: unit, discount: 0,
      line_total: round2(unit * l.qty), customization: String(raws[i].customization || "").slice(0, 2000)
    };
  });
}

/** Merchandise lines in the charge currency: Studio products via studio-pricing.js, legacy SKUs via the price list. */
function quoteMerch(cart, cur) {
  if (!Array.isArray(cart) || cart.length === 0) throw new HttpError(400, "empty_cart", "Cart is empty");
  if (cart.length > 50) throw new HttpError(400, "cart_too_large", "At most 50 cart lines");
  if (cart.some(r => !r || typeof r !== "object" || Array.isArray(r))) throw new HttpError(400, "invalid_cart_line", "Invalid cart line");
  const ids = new Set((studioCatalog().products || []).map(p => p.id));
  const unknown = cart.find(r => r.product_id && !ids.has(r.product_id));
  if (unknown) throw new HttpError(400, "unknown_product", `Unknown product: ${String(unknown.product_id).slice(0, 60)}`);
  const isStudio = r => r && r.product_id && ids.has(r.product_id);
  const studio = quoteStudioLines(cart.filter(isStudio), cur);
  const legacyRaw = cart.filter(r => !isStudio(r));
  const legacy = legacyRaw.length ? quoteCart(legacyRaw, cur).lines : [];
  let si = 0, li = 0;
  const lines = cart.map(r => (isStudio(r) ? studio[si++] : legacy[li++]));
  return { lines, total: round2(lines.reduce((a, l) => a + l.line_total, 0)) };
}

/** Charge currency: explicit "CNY" (internal / legacy callers) is honoured; otherwise CHF for CH/LI and EUR for EU. */
export function storefrontCurrency(requested, country) {
  const r = String(requested || "").toUpperCase();
  if (r === "CNY") return "CNY";
  return currencyForCountry(country);
}

/** Production lead days for one line: Studio products use the facility for the market (catalog facilities[].days); legacy SKUs the admin default. */
function productionDays(line, cur) {
  const cat = studioCatalog(), prod = line.product_id && cat.products.find(p => p.id === line.product_id);
  if (!prod) return Number(getFees().default_production_days ?? 3);
  const region = cur === "CHF" ? "CH" : "EU", facs = (prod.facilities || []).map(id => cat.facilities.find(f => f.id === id)).filter(Boolean);
  const f = facs.find(x => x.region === region) || facs.sort((a, b) => a.days - b.days)[0];
  return Number(f?.days ?? getFees().default_production_days ?? 3);
}
export const PROOF_CHOICES = ["proof", "approve"];
export function defaultProofChoice(cart) { return (Array.isArray(cart) ? cart : []).some(r => r && r.project_id) ? "proof" : "approve"; }

/** Packaging add-ons chosen in the Studio project (admin price per unit, 0 = free) + expired-project warnings for the cart. */
async function packagingAndWarnings(cart, items, cur) {
  const warnings = [];
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    const raw = cart[i] || {}, item = items[i];
    if (raw.project_id == null || raw.project_id === "") continue;
    const pid = String(raw.project_id), p = isProjectId(pid) ? await findRecord("studio_projects", pid) : null;
    if (!p || projectExpired(p)) { warnings.push({ index: i, code: "project_expired", project_id: pid.slice(0, 40) }); continue; }
    const prod = studioCatalog().products.find(x => x.id === item.product_id) || {};
    const ids = (p.packaging_mode === "none" ? [] : (p.packaging || [])).filter(id => (prod.packaging || []).includes(id));
    const unit = round2(ids.reduce((a, id) => a + packagingPrice(id, cur), 0));
    if (unit > 0) { item.packaging = { ids, unit_price: unit, amount: round2(unit * item.quantity) }; total = round2(total + item.packaging.amount); }
  }
  return { total, warnings };
}

/** Full storefront quote: merchandise (+ packaging) − promo + shipping + VAT, in the charge currency. All fees from the admin "Fees & tax" settings. */
export async function quoteStorefront({ tenantId, cart, currency, country, postal_code, shipping_method, promo_code, proof_choice }) {
  const cc = String(country || "").toUpperCase().slice(0, 2);
  const cur = storefrontCurrency(currency, cc);
  const rate = rateFor(cur); // legacy shipping zones + free-shipping thresholds are kept in the base currency (CNY)
  const merch = quoteMerch(cart, cur);
  const items = merch.lines.reduce((a, l) => a + l.quantity, 0);
  const weight = Math.max(0.2, items * 0.12);
  let ship;
  try {
    ship = await quoteShipping({
      tenantId, country: cc, postal_code: String(postal_code || "").slice(0, 16),
      subtotal: round2(merch.total / rate), weight_kg: weight, item_count: items, currency: "CNY",
      shipping_method: shipping_method === "express" ? "express" : "standard"
    });
  } catch (e) {
    if (e.message === "shipping_zone_not_found") throw new HttpError(400, "shipping_zone_not_found", "Shipping is not available for this destination");
    throw e;
  }
  const lines = merch.lines.map(l => ({ ...l }));
  const pack = await packagingAndWarnings(cart, lines, cur);
  const choice = PROOF_CHOICES.includes(proof_choice) ? proof_choice : defaultProofChoice(cart);
  const prodDays = lines.reduce((a, l) => Math.max(a, productionDays(l, cur)), 0) + (choice === "proof" ? Number(studioCatalog().proof_buffer_days || 0) : 0);
  const today = new Date();
  const zoneId = ship.zone?.id;
  const options = ship.shipping_options.map(o => {
    const managed = ship.rate_engine === "regional_rules" ? shippingAmount(zoneId, o.id, cur, { weight_kg: ship.weight_kg, subtotal: merch.total }) : null;
    const amount = managed ? managed.amount : round2(o.amount * rate);
    const days = carrierDays(zoneId, o.id);
    return { ...o, amount, ...(managed ? { free_applied: managed.free } : {}), carrier_days: days,
      delivery: { production_days: prodDays, from: addBusinessDays(today, prodDays + days[0]), to: addBusinessDays(today, prodDays + days[1]) } };
  });
  const selected = options.find(o => o.id === ship.selected_shipping) || options[0];
  let discount = null;
  if (promo_code) discount = await evaluatePromo(tenantId, promo_code, { subtotal: merch.total, currency: cur });
  const disc = discount ? discount.amount : 0;
  const vat = ship.tax_engine === "avalara" ? Number(ship.tax.rate || 0) : vatRate(cc, zoneId, ship.tax.rate);
  const incl = pricesIncludeVat();
  const taxable = round2(merch.total + pack.total - disc + selected.amount);
  const tax = incl ? round2(taxable * vat / (1 + vat)) : round2(taxable * vat);
  return {
    ...ship, currency: cur, base_currency: "CNY", fx_rate: rate,
    shipping_options: options, shipping_amount: selected.amount,
    tax: { ...ship.tax, rate: vat, amount: tax, included: incl }, prices_include_vat: incl,
    items: lines, subtotal: merch.total, packaging_amount: pack.total, discount: discount ? { code: discount.code, id: discount.id, type: discount.type, value: discount.value, amount: disc } : null,
    item_count: items, line_warnings: pack.warnings, proof_choice: choice, delivery: selected.delivery,
    grand_total: incl ? taxable : round2(taxable + tax)
  };
}

/** PayPal amounts: item_total = Σ items (merch + packaging line); value = item_total + shipping + tax_total − discount.
 *  With prices incl. VAT the tax is already inside the item amounts, so tax_total is 0. */
export function paypalBreakdown(q) {
  return { item_total: round2(q.subtotal + (q.packaging_amount || 0)), shipping: q.shipping_amount, tax_total: q.prices_include_vat ? 0 : q.tax.amount, discount: q.discount?.amount || 0 };
}
export function paypalItems(q) {
  const items = q.items.map(l => ({ name: l.name, sku: l.sku, quantity: l.quantity, unit_amount: l.unit_price, description: l.material }));
  if (q.packaging_amount > 0) items.push({ name: "Packaging add-ons", sku: "PACKAGING", quantity: 1, unit_amount: q.packaging_amount });
  return items;
}

/** Customer cancelled at PayPal: the unpaid draft is cancelled and they go back to the Review step (cart is untouched in the browser). */
export async function handlePayPalCancel({ orderId, token }) {
  const o = orderId && verifyOrderToken(orderId, token) ? await findRecord("orders", String(orderId)) : null;
  if (o && o.payment_status !== "paid") await updateRecord("orders", o.id, { status: "Cancelled", payment_status: "cancelled", cancelled_reason: "paypal_cancel", updated_at: new Date().toISOString() });
  return { ok: !!o };
}

const paypalCreds = tenantId => getConnectorCredentials(tenantId, "paypal");

function newOrderId() {
  return `POD-${new Date().getUTCFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function shippingAddress(body = {}) {
  const sh = body.shipping || {};
  return {
    name: clean(sh.name || body.customer?.name), address1: clean(sh.address1), address2: clean(sh.address2),
    city: clean(sh.city, 100), postal_code: clean(sh.postal_code, 32), country: clean(sh.country, 2).toUpperCase(), phone: clean(sh.phone || body.customer?.phone, 40)
  };
}

/** Validates the customer and re-quotes on the server (nothing is stored yet). Shared by PayPal and TWINT. */
async function prepareCheckout({ tenantId, user, guestId = null, body, provider }) {
  const email = clean(body.customer?.email, 320);
  if (!EMAIL.test(email)) throw new HttpError(400, "invalid_email", "Please enter a valid e-mail address");
  const address = shippingAddress(body);
  const quote = await quoteStorefront({ tenantId, cart: body.cart, currency: body.currency, country: address.country, postal_code: address.postal_code, shipping_method: body.shipping_method, promo_code: body.promo_code, proof_choice: body.proof_choice });
  quote.items = await attachDesigns({ tenantId, user, guestId, cart: body.cart, items: quote.items });
  // Price changed since the customer reviewed it (e.g. admin edit or expired promo) → ask them to review again.
  if (body.expected_total != null && Number(body.expected_total) !== quote.grand_total) throw new HttpError(409, "price_changed", "Prices were updated — please review your order again");
  return { email, address, quote };
}

/**
 * Studio cart lines carry project_id: the project must exist in this tenant, not be expired, belong to the
 * signed-in customer (projects are always saved by a signed-in user) and contain the product. The design
 * reference, placement and size breakdown are copied onto the order item so production has everything.
 */
export async function attachDesigns({ tenantId, user, guestId = null, cart, items }) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const raw = cart[i] || {}, item = { ...items[i] };
    if (raw.project_id != null && raw.project_id !== "") {
      const pid = String(raw.project_id);
      if (!isProjectId(pid)) throw new HttpError(400, "invalid_project", "Invalid design project");
      const p = await findRecord("studio_projects", pid);
      if (!p || projectExpired(p) || (tenantId && p.tenant_id !== tenantId)) throw new HttpError(400, "project_not_found", "The design project for this cart line no longer exists — please reopen it in the Studio");
      if (!ownsProject(p, { userId: user?.id || null, guestId }) || (!user && !p.guest_id)) throw new HttpError(403, "project_forbidden", "This design project belongs to another account — please sign in with the account that created it");
      if (!p.design_url) throw new HttpError(409, "design_required", "A design is required for this product");
      const pi = (p.items || []).find(x => x.product_id === item.product_id);
      if (!pi) throw new HttpError(400, "project_product_mismatch", "This product is not part of the design project");
      const prod = studioCatalog().products.find(x => x.id === item.product_id) || {};
      const sizes = prod.sizes ? Object.fromEntries(prod.sizes.map(z => [z, Math.max(0, Math.round(Number(raw.sizes?.[z] ?? 0)) || 0)]).filter(([, n]) => n > 0)) : {};
      const sizeSum = Object.values(sizes).reduce((a, b) => a + b, 0);
      if (sizeSum && sizeSum !== item.quantity) throw new HttpError(400, "size_mismatch", `Size breakdown (${sizeSum}) does not match quantity (${item.quantity}) for ${item.name}`);
      Object.assign(item, { studio_project_id: p.id, design_url: p.design_url, placement: pi.placement || null, sizes: sizeSum ? sizes : (pi.sizes || {}),
        thumb_url: (await hasMockup(p.id, item.product_id)) ? mockupUrl(p.id, item.product_id) : "" });
    }
    out.push(item);
  }
  return out;
}

/** Signed, non-expiring per-order token for the confirmation page / return URLs (HMAC over the order id). */
function tokenSecret() { return `order-token:${process.env.APP_ENCRYPTION_KEY || process.env.ADMIN_API_KEY || "development-only-key-change-me"}`; }
export function orderToken(orderId) { return hmacHex(tokenSecret(), String(orderId)).slice(0, 40); }
export function verifyOrderToken(orderId, token) { return /^[a-f0-9]{40}$/.test(String(token || "")) && timingSafeHexEqual(orderToken(orderId), String(token)); }

/** Confirmation page data (token-protected; no internal fields). */
export async function orderConfirmation(id, token) {
  if (!verifyOrderToken(id, token)) throw new HttpError(403, "invalid_token", "This confirmation link is invalid");
  const o = await findRecord("orders", String(id));
  if (!o) throw new HttpError(404, "order_not_found", "Order not found");
  const proofRec = await findWhere("proofs", p => p.order_id === o.id);
  const t = orderToken(o.id), withTok = u => (u ? `${u}${u.includes("?") ? "&" : "?"}ot=${t}` : "");
  return {
    id: o.id, status: o.status, payment_status: o.payment_status, currency: o.currency, created_at: o.created_at, paid_at: o.paid_at || null,
    email: o.customer_email, shipping_address: o.shipping_address, shipping_method: o.shipping_method,
    items: (o.items || []).map(l => ({ name: l.name, product_id: l.product_id || "", material: l.material, quantity: l.quantity, unit_price: l.unit_price, line_total: l.line_total, sizes: l.sizes || {}, has_design: !!l.design_url, thumb_url: withTok(l.thumb_url), image: productImage(l.product_id) })),
    totals: { subtotal: o.subtotal, packaging: o.packaging_amount || 0, discount: o.discount_amount || 0, promo_code: o.promo?.code || "", shipping: o.shipping_charged, tax: o.tax, tax_rate: o.tax_rate ?? null, prices_include_vat: !!o.prices_include_vat, grand_total: o.grand_total },
    proof_choice: o.proof_choice || "proof", production_blocked: !!o.production_blocked, delivery_estimate: o.delivery_estimate || null,
    proof: proofRec ? { status: proofRec.status, ready: !!proofRec.proof_url, review_url: proofRec.proof_url && proofRec.status !== "Approved" ? `/proof.html?token=${proofRec.token}` : "" } : null,
    timeline: [
      { id: "paid", done: o.payment_status === "paid" },
      { id: "proof", choice: o.proof_choice || "proof", waiting: !!o.production_blocked && o.payment_status === "paid", preparing: !!o.production_blocked && o.payment_status === "paid" && !proofRec?.proof_url, done: (o.proof_choice === "approve" && o.payment_status === "paid") || ["AwaitingApproval", "Approved", "Production", "Shipped", "Delivered"].includes(o.status) },
      { id: "production", done: ["Production", "Shipped", "Delivered"].includes(o.status) },
      { id: "shipping", done: ["Shipped", "Delivered"].includes(o.status) }
    ],
    account_url: `/account.html#orders/${encodeURIComponent(o.id)}`
  };
}
function productImage(pid) { const p = pid && studioCatalog().products.find(x => x.id === pid); return p?.mockup_photo?.src ? `/${p.mockup_photo.src}` : ""; }

/** Order has at least one personalised (Studio / uploaded design) line → needs a proof record. */
export function hasDesignItems(order) { return (order?.items || []).some(l => l && (l.design_url || l.studio_project_id || l.project_id)); }
/** Proof sentence for the confirmation e-mail: a review link only once admin has uploaded the proof, otherwise "in preparation". */
export function proofNote(order, proof, base) {
  if (!proof || (order.proof_choice || "proof") !== "proof") return "You approved the mockup at checkout — production starts right away.";
  if (proof.proof_url && proof.token) return `Your proof is ready: ${base}/proof.html?token=${proof.token} — production starts once you approve it.`;
  return "Your proof is in preparation — we will e-mail you a review link as soon as it is ready. Production starts once you approve it.";
}
const money = (n, cur) => `${cur} ${Number(n || 0).toFixed(2)}`;
/** Order confirmation e-mail (itemised, absolute URLs). */
export async function sendOrderConfirmation(order) {
  if (!order?.customer_email) return null;
  const proof = await findWhere("proofs", p => p.order_id === order.id);
  const base = publicBaseUrl(), url = `${base}/payment-success.html?order=${encodeURIComponent(order.id)}&t=${orderToken(order.id)}`;
  const a = order.shipping_address || {};
  const rows = (order.items || []).map(l => ({ name: l.name, material: l.material || "", quantity: l.quantity, line_total: money(l.line_total, order.currency), image: productImage(l.product_id) ? base + productImage(l.product_id) : "", sizes: Object.entries(l.sizes || {}).map(([k, v]) => `${k}×${v}`).join(", ") }));
  const est = order.delivery_estimate, fmtD = d => new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const vars = { order_id: order.id, customer_name: order.customer_name || "", items: rows, subtotal: money(order.subtotal, order.currency),
    packaging: order.packaging_amount > 0 ? money(order.packaging_amount, order.currency) : "", discount: order.discount_amount > 0 ? `− ${money(order.discount_amount, order.currency)}` : "", promo_code: order.promo?.code || "",
    tax_label: order.prices_include_vat ? "incl. VAT" : "VAT", delivery: est ? `${fmtD(est.from)} – ${fmtD(est.to)}` : "",
    proof_note: proofNote(order, proof, base), shipping: money(order.shipping_charged, order.currency), tax: money(order.tax, order.currency), total: money(order.grand_total, order.currency),
    address: [a.name, a.address1, a.address2, [a.postal_code, a.city].filter(Boolean).join(" "), a.country].filter(Boolean).join(", "), order_url: url, account_url: `${base}/account.html`, shop_url: `${base}/` };
  const r = await renderTemplate("order-confirmation", vars);
  return sendEmail({ tenantId: order.tenant_id, userId: order.user_id || null, to: order.customer_email, type: "order_confirmation", related_id: order.id, subject: `Order confirmed · ${order.id}`, text: r.text, html: r.html });
}

/** Hook for fulfilment / admin: "your order has shipped" with tracking (call when status → Shipped). */
export async function sendShippedEmail(order, { carrier = "", tracking_number = "", tracking_url = "" } = {}) {
  if (!order?.customer_email) return null;
  const base = publicBaseUrl();
  const r = await renderTemplate("order-shipped", { order_id: order.id, customer_name: order.customer_name || "", carrier, tracking_number, tracking_url, order_url: `${base}/payment-success.html?order=${encodeURIComponent(order.id)}&t=${orderToken(order.id)}`, account_url: `${base}/account.html` });
  return sendEmail({ tenantId: order.tenant_id, userId: order.user_id || null, to: order.customer_email, type: "order_shipped", related_id: order.id, subject: `Your order has shipped · ${order.id}`, text: r.text, html: r.html });
}

/** Paid orders: every Studio design used is marked ordered and kept for 90 days (production + reprints). */
async function markProjectsOrdered(order) {
  const ids = [...new Set((order.items || []).map(l => l.studio_project_id).filter(Boolean))];
  const until = new Date(Date.now() + retention().quoteDays * 864e5).toISOString();
  for (const id of ids) await updateRecord("studio_projects", id, { status: "ordered", order_id: order.id, expires_at: until, updated_at: new Date().toISOString() });
}

async function saveDraftOrder({ tenantId, user, email, address, quote, provider, name }) {
  const id = newOrderId();
  const now = new Date().toISOString();
  const feeRate = Number(process.env.DEFAULT_PAYMENT_FEE_RATE || 0);
  const order = await addRecord("orders", {
    id, tenant_id: tenantId, user_id: user?.id || null, store_id: "direct_storefront", channel: "storefront",
    external_order_id: "", status: "Draft", payment_status: "pending", payment_provider: provider,
    customer_email: email, customer_name: clean(name || address.name), customer_phone: address.phone,
    shipping_address: address,
    items: quote.items, currency: quote.currency,
    subtotal: quote.subtotal, packaging_amount: quote.packaging_amount || 0, discount_amount: quote.discount?.amount || 0, promo: quote.discount ? { id: quote.discount.id, code: quote.discount.code, type: quote.discount.type, value: quote.discount.value } : null,
    proof_choice: quote.proof_choice, delivery_estimate: quote.delivery || null, prices_include_vat: !!quote.prices_include_vat,
    shipping_method: quote.selected_shipping, shipping_charged: quote.shipping_amount,
    tax: quote.tax.amount, tax_rate: Number(quote.tax.rate || 0), tax_engine: quote.tax_engine, rate_engine: quote.rate_engine, grand_total: quote.grand_total,
    revenue: round2(quote.grand_total - quote.tax.amount), // tax is collected for the authorities, not revenue
    cogs: 0, shipping_cost: 0, payment_fee: round2(quote.grand_total * feeRate), affiliate_commission: 0, ad_attributed_cost: 0,
    created_at: now, updated_at: now
  });
  if (user) { const customer = await ensureCustomer(tenantId, user); await updateRecord("customers", customer.id, { name: order.customer_name || customer.name || user.name || "", last_seen: now }); }
  return order;
}

/** Which payment methods the storefront may offer right now (no secrets). */
export async function paymentMethods(tenantId) {
  return {
    paypal: { configured: paypalConfigured(await paypalCreds(tenantId)), currencies: ["CHF", "EUR"] },
    twint: { configured: twintConfigured(), currencies: ["CHF"], ...twintStatus() }
  };
}

export async function createStorefrontCheckout({ tenantId, user = null, guestId = null, body = {}, baseUrl }) {
  const { email, address, quote } = await prepareCheckout({ tenantId, user, guestId, body });
  const creds = await paypalCreds(tenantId);
  if (!paypalConfigured(creds)) throw new HttpError(503, "paypal_not_configured", "PayPal is not configured: add PayPal credentials in Admin → API / Protocols or set PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env");
  const order = await saveDraftOrder({ tenantId, user, email, address, quote, provider: "paypal", name: body.customer?.name });
  const id = order.id;
  try {
    const pp = await createPayPalOrder({
      amount: quote.grand_total, currency: quote.currency, referenceId: id, creds,
      description: `Wedding order ${id}`,
      breakdown: paypalBreakdown(quote),
      items: paypalItems(quote),
      shipping: address.address1 ? address : null,
      returnUrl: `${baseUrl}/api/payments/paypal/return?order=${encodeURIComponent(id)}`,
      cancelUrl: `${baseUrl}/api/payments/paypal/cancel?order=${encodeURIComponent(id)}&t=${orderToken(id)}`
    });
    const url = approvalUrl(pp);
    if (!url) throw new Error("paypal_missing_approval_url");
    await updateRecord("orders", id, { paypal_order_id: pp.id, updated_at: new Date().toISOString() });
    return { order_id: order.id, order_token: orderToken(order.id), total: quote.grand_total, currency: quote.currency, approval_url: url, quote };
  } catch (e) {
    console.error("[checkout] PayPal order creation failed:", e.message);
    await updateRecord("orders", id, { status: "Cancelled", payment_status: "failed", updated_at: new Date().toISOString() });
    throw new HttpError(502, "paypal_create_failed", "PayPal payment could not be created, please try again");
  }
}

/** TWINT (direct merchant integration with TWINT AG). Fails closed until the connector is configured AND implemented. */
export async function createTwintCheckout({ tenantId, user = null, guestId = null, body = {}, baseUrl }) {
  const { email, address, quote } = await prepareCheckout({ tenantId, user, guestId, body });
  if (!twintConfigured()) throw new HttpError(503, "twint_not_configured", "TWINT is not configured: set TWINT_STORE_UUID, TWINT_CASH_REGISTER_ID, TWINT_CERT_PATH and TWINT_CERT_PASSWORD (see .env.example)");
  if (quote.currency !== "CHF") throw new HttpError(400, "twint_chf_only", "TWINT is only available for payments in CHF (Switzerland / Liechtenstein)");
  const order = await saveDraftOrder({ tenantId, user, email, address, quote, provider: "twint", name: body.customer?.name });
  try {
    const tw = await startTwintOrder({ amount: quote.grand_total, currency: quote.currency, merchantReference: order.id });
    await updateRecord("orders", order.id, { twint_order_uuid: tw.orderUuid, updated_at: new Date().toISOString() });
    return { order_id: order.id, order_token: orderToken(order.id), total: quote.grand_total, currency: quote.currency, twint: { token: tw.token, qr_code: tw.qrCode, app_url: tw.twintUrl }, status_url: `${baseUrl}/api/payments/twint/status?order=${encodeURIComponent(order.id)}` };
  } catch (e) {
    console.error("[checkout] TWINT order start failed:", e.message);
    await updateRecord("orders", order.id, { status: "Cancelled", payment_status: "failed", updated_at: new Date().toISOString() });
    if (e.message === "twint_not_implemented") throw new HttpError(501, "twint_not_implemented", "TWINT connector is a skeleton: the SOAP StartOrder call is not implemented yet");
    throw new HttpError(502, "twint_create_failed", "TWINT payment could not be started, please try again");
  }
}

/** Status polling for a TWINT order. Never reports success unless TWINT confirmed the payment. */
export async function twintOrderStatus(orderId) {
  const order = orderId ? await findRecord("orders", String(orderId)) : null;
  if (!order || order.payment_provider !== "twint") throw new HttpError(404, "order_not_found", "Order not found");
  if (order.payment_status === "paid") return { order_id: order.id, status: "COMPLETED" };
  if (!twintConfigured()) throw new HttpError(503, "twint_not_configured", "TWINT is not configured");
  const st = await monitorTwintOrder(order.twint_order_uuid); // TODO: on SUCCESS → ConfirmOrder (if deferred) → markPaid(order, { captureId: st.orderUuid, source: "twint_monitor" })
  return { order_id: order.id, status: st.status };
}

async function markPaid(order, { captureId, source }) {
  if (order.payment_status === "paid") return order;
  const now = new Date().toISOString();
  // Proof-first orders wait for the customer's approval in proof.html; "approve mockup" orders go straight to production.
  const proofFirst = (order.proof_choice || "proof") === "proof";
  // Orders without design items that go straight to production ("approve", the default for plain catalogue carts) get no proof
  // record at all; an explicit proof-first choice still creates one (production is blocked on it).
  const needsProof = proofFirst || hasDesignItems(order);
  const updated = await updateRecord("orders", order.id, { status: proofFirst ? "Needs approval" : "Production", production_blocked: proofFirst, production_at: proofFirst ? null : now,
    payment_status: "paid", paypal_capture_id: captureId || order.paypal_capture_id || "", paid_at: now, updated_at: now, paid_via: source });
  const proof = needsProof ? await createProofForOrder(updated) : null;
  if (!proofFirst && proof && proof.status === "Pending") await updateRecord("proofs", proof.id, { status: "Approved", approved_at: now, auto_approved: true, note: "Customer approved the mockup at checkout" });
  try { await redeemPromo(updated); } catch (e) { console.error("[checkout] promo redeem failed:", e.message); }
  await markProjectsOrdered(updated);
  try { await sendOrderConfirmation(updated); } catch (e) { console.error("[checkout] confirmation e-mail failed:", e.message); }
  return updated;
}

/** Customer returns from PayPal: capture once, then send them to the status page. */
const inflightCaptures = new Map(); // order id → capture promise (one capture per order even when return + retry race)

export async function handlePayPalReturn({ orderId, paypalToken }) {
  const key = String(orderId || "");
  if (inflightCaptures.has(key)) return inflightCaptures.get(key);
  const p = doPayPalReturn({ orderId, paypalToken }).finally(() => inflightCaptures.delete(key));
  inflightCaptures.set(key, p);
  return p;
}

async function doPayPalReturn({ orderId, paypalToken }) {
  const order = orderId ? await findRecord("orders", String(orderId)) : null;
  if (!order || !order.paypal_order_id || (paypalToken && paypalToken !== order.paypal_order_id)) {
    return { orderId, status: "UNKNOWN" };
  }
  if (order.payment_status === "paid") return { orderId: order.id, status: "COMPLETED" };
  if (order.paypal_capture_id) return { orderId: order.id, status: "COMPLETED" };
  try {
    const result = await capturePayPalOrder(order.paypal_order_id, await paypalCreds(order.tenant_id));
    const capture = result?.purchase_units?.[0]?.payments?.captures?.[0];
    if (result?.status === "COMPLETED") {
      const fresh = await findRecord("orders", order.id);
      if (fresh?.payment_status === "paid") return { orderId: order.id, status: "COMPLETED" };
      await markPaid(order, { captureId: capture?.id, source: "return_capture" });
      return { orderId: order.id, status: "COMPLETED" };
    }
    return { orderId: order.id, status: result?.status || "PENDING" };
  } catch (e) {
    console.error("[checkout] capture failed:", e.message);
    return { orderId: order.id, status: "PENDING" }; // webhook will reconcile
  }
}

/** PayPal webhook reconciliation (idempotent). */
export async function handlePayPalEvent(event = {}) {
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return null;
  const ppOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
  if (!ppOrderId) return null;
  const order = await findWhere("orders", o => o.paypal_order_id === ppOrderId);
  return order ? markPaid(order, { captureId: event.resource?.id, source: "webhook" }) : null;
}

export async function publicOrderStatus(id) {
  const order = await findRecord("orders", String(id || ""));
  if (!order) throw new HttpError(404, "order_not_found", "Order not found");
  return { id: order.id, status: order.status, financial_status: order.payment_status || "" };
}
