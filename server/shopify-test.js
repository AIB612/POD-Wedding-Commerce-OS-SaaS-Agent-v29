// npm run test:shopify — Shopify app Phase 1 (no network: Shopify HTTP is mocked via globalThis.fetch).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SHOPIFY_API_KEY = "test_key";
process.env.SHOPIFY_API_SECRET = "test_secret";
process.env.APP_URL = "https://app.example.com";
process.env.STORE_PERSIST_PATH = "";
process.env.ADMIN_API_KEY = "change-me";

const { openDb, setDb, memoryDriver } = await import("./db/index.js");
const shopify = await import("./shopify/app.js");
const repo = await import("./shopify/repo.js");
const { getState, findRecord, addRecord } = await import("./saas-store.js");
const { createApp } = await import("./create-app.js");

let pass = 0;
const test = async (name, fn) => { await fn(); pass++; console.log(`  ok  ${name}`); };
const SHOP = "dropkingdev.myshopify.com";
const sign = q => { const msg = Object.keys(q).sort().map(k => `${k}=${q[k]}`).join("&"); return { ...q, hmac: crypto.createHmac("sha256", "test_secret").update(msg).digest("hex") }; };
const whSig = buf => crypto.createHmac("sha256", "test_secret").update(buf).digest("base64");

// Mock Shopify HTTP: records calls, answers token exchange + GraphQL by operation name.
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (!/^https:\/\/[^/]+\.myshopify\.com\//.test(url)) return realFetch(url, opt);
  const body = opt.body ? JSON.parse(opt.body) : null; calls.push({ url, body, headers: opt.headers });
  const ok = data => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  if (url.endsWith("/admin/oauth/access_token") && body.grant_type === "urn:ietf:params:oauth:grant-type:token-exchange") return ok(body.expiring === "1" ? { access_token: "shpat_exp_1", scope: "write_products", expires_in: 3600, refresh_token: "shprt_1", refresh_token_expires_in: 7776000 } : { access_token: "shpat_te_1", scope: "write_products,read_orders" });
  if (url.endsWith("/admin/oauth/access_token") && body.grant_type === "refresh_token") return ok({ access_token: "shpat_exp_2", scope: "write_products", expires_in: 3600, refresh_token: "shprt_2", refresh_token_expires_in: 7776000 });
  if (url.endsWith("/admin/oauth/access_token")) return body.code === "good" ? ok({ access_token: "shpat_offline_123", scope: shopify.DEFAULT_SCOPES }) : new Response("bad", { status: 400 });
  const q = body.query;
  if (q.includes("webhookSubscriptionCreate")) return ok({ data: { webhookSubscriptionCreate: { webhookSubscription: { id: `gid://shopify/WebhookSubscription/${body.variables.topic}`, topic: body.variables.topic }, userErrors: [] } } });
  if (q.includes("productSet")) { const inp = body.variables.input; return ok({ data: { productSet: { product: { id: body.variables.identifier?.id || "gid://shopify/Product/1001", handle: "tee", variants: { nodes: inp.variants.map((v, i) => ({ id: v.id || `gid://shopify/ProductVariant/${2000 + i}`, sku: v.sku })) } }, userErrors: [] } } }); }
  if (q.includes("fulfillmentOrders")) return ok({ data: { order: { id: body.variables.id, fulfillmentOrders: { nodes: [{ id: "gid://shopify/FulfillmentOrder/1", status: "OPEN", supportedActions: [{ action: "CREATE_FULFILLMENT" }] }, { id: "gid://shopify/FulfillmentOrder/2", status: "CLOSED", supportedActions: [] }] } } } });
  if (q.includes("fulfillmentCreate")) return ok({ data: { fulfillmentCreate: { fulfillment: { id: "gid://shopify/Fulfillment/9", status: "SUCCESS" }, userErrors: [] } } });
  return ok({ errors: [{ message: "unmocked" }] });
};

console.log("shopify-test");
await setDb(await openDb({ driver: "memory" }));

await test("OAuth query HMAC verification", () => {
  const q = sign({ shop: SHOP, timestamp: "1700000000", code: "x", state: "s" });
  assert.equal(shopify.verifyQueryHmac(q), true);
  assert.equal(shopify.verifyQueryHmac({ ...q, shop: "evil.myshopify.com" }), false);
  assert.equal(shopify.verifyQueryHmac({ ...q, hmac: "00" }), false);
  assert.equal(shopify.verifyQueryHmac({ shop: SHOP }), false);
});
await test("webhook HMAC verification on raw body", () => {
  const buf = Buffer.from('{"id":1}');
  assert.equal(shopify.verifyWebhookHmac(buf, whSig(buf)), true);
  assert.equal(shopify.verifyWebhookHmac(Buffer.from('{"id":2}'), whSig(buf)), false);
  assert.equal(shopify.verifyWebhookHmac(buf, ""), false);
});
await test("shop domain validation", () => {
  assert.equal(shopify.normalizeShop("https://DropKingDev.myshopify.com/"), SHOP);
  for (const bad of ["evil.com", "a.myshopify.com.evil.com", "-x.myshopify.com", ""]) assert.equal(shopify.normalizeShop(bad), null);
});
await test("OAuth state persisted in DB (SQLite file survives reopen), single use, shop-bound", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "shopdb-")), "app.db");
  await setDb(await openDb({ sqlitePath: file, url: "", driver: "" }));
  const { state, url } = await shopify.beginInstall({ shop: SHOP, tenantId: "tenant_demo" });
  assert.match(url, /^https:\/\/dropkingdev\.myshopify\.com\/admin\/oauth\/authorize\?/);
  assert.match(url, /write_merchant_managed_fulfillment_orders/);
  await setDb(await openDb({ sqlitePath: file, url: "", driver: "" })); // "restart"
  const r = await shopify.completeInstall(sign({ shop: SHOP, code: "good", state, timestamp: "1" }));
  assert.equal(r.shop, SHOP);
  assert.equal(r.webhooks.length, 2); assert.ok(r.webhooks.every(w => w.ok));
  const reg = calls.filter(c => c.body?.query?.includes("webhookSubscriptionCreate"));
  assert.equal(reg[0].body.variables.webhookSubscription.uri, "https://app.example.com/api/shopify/app/webhooks");
  assert.match(reg[0].url, /\/admin\/api\/2025-10\/graphql\.json$/);
  const row = await repo.getShop(SHOP);
  assert.ok(row.access_token_enc && !row.access_token_enc.includes("shpat_"), "token stored encrypted");
  assert.equal(await repo.shopToken(SHOP), "shpat_offline_123");
  await assert.rejects(shopify.completeInstall(sign({ shop: SHOP, code: "good", state, timestamp: "1" })), /invalid_oauth_state/); // reused
  const s2 = await shopify.beginInstall({ shop: SHOP, tenantId: "t" });
  await assert.rejects(shopify.completeInstall(sign({ shop: "other.myshopify.com", code: "good", state: s2.state })), /invalid_oauth_state/);
  const s3 = await shopify.beginInstall({ shop: SHOP, tenantId: "t" });
  await assert.rejects(shopify.completeInstall({ shop: SHOP, code: "good", state: s3.state, hmac: "deadbeef" }), /invalid_hmac/);
  await setDb(await openDb({ sqlitePath: file, url: "", driver: "" }));
  assert.equal(await repo.shopToken(SHOP), "shpat_offline_123", "token persisted across restart");
});

const deliver = (topic, payload, id = crypto.randomUUID(), shop = SHOP) => {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return shopify.handleWebhook({ rawBody, headers: { "x-shopify-hmac-sha256": whSig(rawBody), "x-shopify-topic": topic, "x-shopify-shop-domain": shop, "x-shopify-webhook-id": id } });
};
const ORDER = { id: 5550001, admin_graphql_api_id: "gid://shopify/Order/5550001", name: "#1001", email: "anna@example.com", financial_status: "paid", currency: "CHF", total_price: "49.90", subtotal_price: "45.00", total_tax: "4.90", customer: { id: 777 },
  shipping_address: { first_name: "Anna", last_name: "Muster", address1: "Bahnhofstr. 1", city: "Zürich", zip: "8001", country_code: "CH" }, line_items: [{ id: 1, title: "Organic cotton tee", sku: "tee-organic_180", quantity: 2, price: "22.50", variant_id: 2000 }] };

await test("orders/create creates one local order + production job (idempotent)", async () => {
  const id = "wh-order-1";
  assert.deepEqual(await deliver("orders/create", ORDER, id), { status: 200, body: "ok" });
  assert.deepEqual(await deliver("orders/create", ORDER, id), { status: 200, body: "duplicate" });
  assert.equal((await deliver("orders/create", ORDER, "wh-order-1-retry-other-id")).status, 200); // new delivery id, same order
  const orders = (await getState()).orders.filter(o => o.external_order_id === "5550001");
  assert.equal(orders.length, 1);
  assert.equal(orders[0].source, "shopify"); assert.equal(orders[0].channel, "shopify"); assert.equal(orders[0].status, "Production");
  assert.ok(await findRecord("tasks", `prod_${orders[0].id}`));
  const log = await repo.recentWebhooks();
  assert.equal(log.filter(w => w.id === id).length, 1);
  assert.match(log.find(w => w.id === "wh-order-1-retry-other-id").note, /already_linked/);
});
await test("webhook with bad HMAC is rejected and not logged", async () => {
  const rawBody = Buffer.from(JSON.stringify(ORDER));
  const r = await shopify.handleWebhook({ rawBody, headers: { "x-shopify-hmac-sha256": whSig(Buffer.from("x")), "x-shopify-topic": "orders/create", "x-shopify-shop-domain": SHOP, "x-shopify-webhook-id": "bad-1" } });
  assert.equal(r.status, 401);
  assert.ok(!(await repo.recentWebhooks()).some(w => w.id === "bad-1"));
});

await test("productSet payload: title, description, CHF variants from price list, images", () => {
  const product = shopify.catalog().products.find(p => p.id === "tee");
  const priceList = { products: { tee: { organic_180: { CHF: [21.9, 19.9], EUR: [20] }, heavy_240: { CHF: [24.9], EUR: [23] } } } };
  const v = shopify.buildProductSetVariables(product, { priceList, appUrl: "https://shop.example.com" });
  assert.equal(v.synchronous, true); assert.equal(v.identifier, undefined);
  assert.equal(v.input.title, "Organic cotton tee"); assert.match(v.input.descriptionHtml, /^<p>/); assert.equal(v.input.status, "DRAFT");
  assert.equal(v.input.productOptions[0].name, "Material");
  assert.deepEqual(v.input.variants.map(x => [x.sku, x.price]), [["tee-organic_180", "21.90"], ["tee-heavy_240", "24.90"]]);
  assert.equal(v.input.files[0].originalSource, "https://shop.example.com/assets/mockups/tee.jpg");
  const upd = shopify.buildProductSetVariables(product, { priceList, appUrl: "http://localhost:3000", existing: { shopify_product_id: "gid://shopify/Product/1001", variant_ids: { "tee-organic_180": "gid://shopify/ProductVariant/2000" } } });
  assert.deepEqual(upd.identifier, { id: "gid://shopify/Product/1001" });
  assert.equal(upd.input.variants[0].id, "gid://shopify/ProductVariant/2000"); assert.equal(upd.input.files, undefined); assert.equal(upd.input.status, undefined);
});
await test("pushProduct saves product_links and re-push updates", async () => {
  const a = await shopify.pushProduct(SHOP, "tee");
  assert.equal(a.updated, false); assert.equal(a.shopify_product_id, "gid://shopify/Product/1001");
  const link = await repo.getProductLink(SHOP, "tee"); assert.ok(Object.keys(link.variant_ids).length >= 1);
  const b = await shopify.pushProduct(SHOP, "tee");
  assert.equal(b.updated, true);
  assert.deepEqual(calls.filter(c => c.body?.query?.includes("productSet")).at(-1).body.variables.identifier, { id: "gid://shopify/Product/1001" });
  await assert.rejects(shopify.pushProduct(SHOP, "nope"), /product_not_found/);
});

await test("fulfillment payload + fulfillLocalOrder", async () => {
  const fi = shopify.buildFulfillmentInput([{ id: "fo1", status: "OPEN" }, { id: "fo2", status: "CLOSED" }, { id: "fo3", status: "IN_PROGRESS", supportedActions: [{ action: "CREATE_FULFILLMENT" }] }], { tracking_number: "99.00.123", carrier: "Swiss Post", tracking_url: "https://t.example/1" });
  assert.deepEqual(fi, { lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: "fo1" }, { fulfillmentOrderId: "fo3" }], notifyCustomer: true, trackingInfo: { number: "99.00.123", company: "Swiss Post", url: "https://t.example/1" } });
  assert.equal(shopify.buildFulfillmentInput([{ id: "x", status: "CLOSED" }]), null);
  const local = (await getState()).orders.find(o => o.external_order_id === "5550001");
  const r = await shopify.fulfillLocalOrder(local.id, { tracking_number: "99.00.123", carrier: "Swiss Post" });
  assert.deepEqual(r, { status: "fulfilled", fulfillment_id: "gid://shopify/Fulfillment/9" });
  const call = calls.filter(c => c.body?.query?.includes("fulfillmentCreate")).at(-1);
  assert.deepEqual(call.body.variables.fulfillment.lineItemsByFulfillmentOrder, [{ fulfillmentOrderId: "gid://shopify/FulfillmentOrder/1" }]);
  assert.equal((await shopify.fulfillLocalOrder(local.id)).status, "already_fulfilled");
  assert.equal((await shopify.fulfillLocalOrder("POD-NOT-LINKED")).status, "not_linked");
});

await test("GDPR: data_request logged as task, customers/redact scrubs PII, shop/redact deletes shop data", async () => {
  assert.equal((await deliver("customers/data_request", { shop_domain: SHOP, customer: { id: 777, email: "anna@example.com" }, orders_requested: [5550001], data_request: { id: 1 } })).status, 200);
  assert.ok((await getState()).tasks.some(t => t.type === "gdpr_data_request" && t.payload.shop === SHOP));
  await deliver("customers/redact", { shop_domain: SHOP, customer: { id: 777, email: "anna@example.com" }, orders_to_redact: [5550001] });
  const o = (await getState()).orders.find(x => x.external_order_id === "5550001");
  assert.equal(o.customer_email, ""); assert.equal(o.customer_name, "[redacted]"); assert.equal(o.shipping_address.address1, undefined);
  await deliver("shop/redact", { shop_domain: SHOP, shop_id: 1 });
  assert.equal(await repo.getShop(SHOP), null); assert.equal(await repo.getProductLink(SHOP, "tee"), null);
  assert.ok((await repo.recentWebhooks()).filter(w => /redact|data_request/.test(w.topic)).every(w => w.status === "processed"));
});

await test("HTTP: webhook route uses raw body, app/uninstalled deletes token; admin status + Shipped hook", async () => {
  await setDb(await openDb({ driver: "memory" }));
  await repo.saveShop({ shop: SHOP, tenantId: "tenant_demo", accessToken: "shpat_x", scopes: "write_products" });
  const app = await createApp();
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const raw = Buffer.from(JSON.stringify({ id: 1, domain: SHOP }));
    let r = await fetch(`${base}/api/shopify/app/webhooks`, { method: "POST", body: raw, headers: { "Content-Type": "application/json", "X-Shopify-Hmac-Sha256": "nope", "X-Shopify-Topic": "app/uninstalled", "X-Shopify-Shop-Domain": SHOP, "X-Shopify-Webhook-Id": "u1" } });
    assert.equal(r.status, 401);
    r = await fetch(`${base}/api/shopify/app/webhooks`, { method: "POST", body: raw, headers: { "Content-Type": "application/json", "X-Shopify-Hmac-Sha256": whSig(raw), "X-Shopify-Topic": "app/uninstalled", "X-Shopify-Shop-Domain": SHOP, "X-Shopify-Webhook-Id": "u1" } });
    assert.equal(r.status, 200);
    const row = await repo.getShop(SHOP); assert.equal(row.access_token_enc, null); assert.ok(row.uninstalled_at);
    r = await fetch(`${base}/api/shopify/app/status`); assert.equal(r.status, 401);
    r = await fetch(`${base}/api/shopify/app/status`, { headers: { "x-admin-api-key": "change-me" } }); const st = await r.json();
    assert.equal(st.shops[0].status, "uninstalled"); assert.equal(st.webhooks[0].topic, "app/uninstalled"); assert.ok(!JSON.stringify(st).includes("access_token_enc"));
    r = await fetch(`${base}/api/shopify/app/install?shop=${SHOP}&timestamp=1&hmac=bad`, { redirect: "manual" }); assert.equal(r.status, 401);
    const q = new URLSearchParams(sign({ shop: SHOP, timestamp: "1" }));
    r = await fetch(`${base}/api/shopify/app/install?${q}`, { redirect: "manual" }); assert.equal(r.status, 302); assert.match(r.headers.get("location"), /admin\/oauth\/authorize/);
    r = await fetch(`${base}/api/shopify/app/connect`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-api-key": "change-me" }, body: JSON.stringify({ shop: "bad domain" }) }); assert.equal(r.status, 400);
    // Shipped on a linked order -> fulfillmentCreate
    await repo.saveShop({ shop: SHOP, tenantId: "tenant_demo", accessToken: "shpat_y", scopes: "" });
    await addRecord("orders", { id: "POD-2026-SHOPIFYHTTP", tenant_id: "tenant_demo", channel: "shopify", status: "Production", created_at: new Date().toISOString() });
    await repo.claimOrderLink({ shop: SHOP, shopifyOrderId: "8880001", localOrderId: "POD-2026-SHOPIFYHTTP" });
    r = await fetch(`${base}/api/saas/orders/POD-2026-SHOPIFYHTTP/status`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-api-key": "change-me", "x-action-approved": "true", "x-tenant-id": "tenant_demo" }, body: JSON.stringify({ status: "Shipped", tracking_number: "TRK1", carrier: "Swiss Post" }) });
    const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); assert.equal(j.shopify_fulfillment?.status, "fulfilled");
    assert.equal(calls.filter(c => c.body?.query?.includes("fulfillmentCreate")).at(-1).body.variables.fulfillment.trackingInfo.number, "TRK1");
  } finally { srv.close(); }
});

await test("session token JWT verification (sig, aud, dest, exp, nbf, alg)", () => {
  const tok = shopify.signSessionToken({ shop: SHOP });
  assert.equal(shopify.verifySessionToken(tok).shop, SHOP);
  const bad = (t, re) => assert.throws(() => shopify.verifySessionToken(t), re);
  bad(shopify.signSessionToken({ shop: SHOP, secret: "other" }), /signature/);
  bad(shopify.signSessionToken({ shop: SHOP, apiKey: "other_key" }), /aud/);
  bad(shopify.signSessionToken({ shop: SHOP, now: Date.now() - 3600_000 }), /expired/);
  bad(shopify.signSessionToken({ shop: SHOP, now: Date.now() + 3600_000, ttlSec: 7200 }), /not_yet_valid/);
  bad(shopify.signSessionToken({ shop: "evil.com" }), /dest/);
  const [h, p, sig] = tok.split(".");
  bad(`${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${p}.`, /alg|signature/);
  const forged = JSON.parse(Buffer.from(p, "base64url")); forged.dest = "https://other.myshopify.com";
  bad(`${h}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`, /signature/);
  bad("garbage", /format/);
});
await test("token-exchange request building", () => {
  const { url, init } = shopify.buildTokenExchangeRequest(SHOP, "ID.TOK.EN", { expiring: false });
  assert.equal(url, `https://${SHOP}/admin/oauth/access_token`);
  assert.deepEqual(JSON.parse(init.body), { client_id: "test_key", client_secret: "test_secret", grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token: "ID.TOK.EN", subject_token_type: "urn:ietf:params:oauth:token-type:id_token", requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token" });
  assert.equal(JSON.parse(shopify.buildTokenExchangeRequest(SHOP, "x", { expiring: true }).init.body).expiring, "1");
  assert.deepEqual(JSON.parse(shopify.buildRefreshRequest(SHOP, "rt").init.body), { client_id: "test_key", client_secret: "test_secret", grant_type: "refresh_token", refresh_token: "rt" });
});
await test("ensureOfflineToken: exchange once, store encrypted, register webhooks; idempotent; expiring tokens refresh", async () => {
  await setDb(await openDb({ driver: "memory" }));
  const n0 = calls.length, idt = shopify.signSessionToken({ shop: SHOP });
  const a = await shopify.ensureOfflineToken(SHOP, idt);
  assert.equal(a.exchanged, true); assert.equal(a.webhooks.length, 2);
  assert.equal(await repo.shopToken(SHOP), "shpat_te_1");
  const b = await shopify.ensureOfflineToken(SHOP, idt);
  assert.equal(b.exchanged, false); assert.equal(b.webhooks, null);
  assert.equal(calls.slice(n0).filter(c => c.url.endsWith("/access_token")).length, 1);
  assert.equal(calls.slice(n0).filter(c => c.body?.query?.includes("webhookSubscriptionCreate")).length, 2);
  // expiring offline token
  process.env.SHOPIFY_EXPIRING_OFFLINE_TOKENS = "true";
  await shopify.ensureOfflineToken(SHOP, idt, { force: true });
  delete process.env.SHOPIFY_EXPIRING_OFFLINE_TOKENS;
  let row = await repo.getShop(SHOP);
  assert.ok(row.refresh_token_enc && !row.refresh_token_enc.includes("shprt")); assert.ok(Number(row.token_expires_at) > Date.now());
  assert.equal(await shopify.accessToken(SHOP), "shpat_exp_1");
  const { getDb, update } = await import("./db/index.js");
  await update(await getDb(), "shopify_shops", { shop: SHOP }, { token_expires_at: Date.now() + 60_000 }); // near expiry
  assert.equal(await shopify.accessToken(SHOP), "shpat_exp_2");
  row = await repo.getShop(SHOP); assert.equal(repo.decryptField(row.refresh_token_enc), "shprt_2");
});
await test("embedded launch detection + frame-ancestors header", () => {
  assert.equal(shopify.embeddedLaunchShop({ embedded: "1", shop: SHOP, host: "x" }), SHOP);
  assert.equal(shopify.embeddedLaunchShop(sign({ shop: SHOP, host: "x", timestamp: "1" })), SHOP);
  assert.equal(shopify.embeddedLaunchShop({ embedded: "1", shop: SHOP, hmac: "bad" }), null);
  assert.equal(shopify.embeddedLaunchShop({ embedded: "1", shop: "evil.com" }), null);
  assert.equal(shopify.embeddedLaunchShop({}), null);
  const h = {}; const res = { setHeader: (k, v) => (h[k] = v), removeHeader: k => delete h[k] };
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  shopify.setEmbeddedFrameHeaders(res, SHOP);
  assert.equal(h["X-Frame-Options"], undefined);
  assert.equal(h["Content-Security-Policy"], `frame-ancestors https://${SHOP} https://admin.shopify.com;`);
  assert.throws(() => shopify.setEmbeddedFrameHeaders(res, "evil.com; script-src *"));
});
await test("HTTP: embedded page headers, storefront unchanged, session-token API", async () => {
  await setDb(await openDb({ driver: "memory" }));
  const app = await createApp();
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    let r = await fetch(`${base}/?${new URLSearchParams(sign({ embedded: "1", host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvZHJvcGtpbmdkZXY", shop: SHOP, timestamp: "1", id_token: "x" }))}`);
    let html = await r.text();
    assert.equal(r.status, 200); assert.equal(r.headers.get("x-frame-options"), null);
    assert.equal(r.headers.get("content-security-policy"), `frame-ancestors https://${SHOP} https://admin.shopify.com;`);
    assert.match(html, /<meta name="shopify-api-key" content="test_key">/); assert.match(html, /cdn\.shopify\.com\/shopifycloud\/app-bridge\.js/);
    r = await fetch(`${base}/`); html = await r.text();
    assert.equal(r.headers.get("x-frame-options"), "SAMEORIGIN"); assert.equal(r.headers.get("content-security-policy"), null); assert.doesNotMatch(html, /shopify-api-key/);
    r = await fetch(`${base}/shopify/embedded?shop=evil.com`); assert.equal(r.status, 400);
    r = await fetch(`${base}/api/shopify/embedded/state`); assert.equal(r.status, 401);
    r = await fetch(`${base}/api/shopify/embedded/state`, { headers: { Authorization: `Bearer ${shopify.signSessionToken({ shop: SHOP, secret: "nope" })}` } }); assert.equal(r.status, 401);
    const auth = { Authorization: `Bearer ${shopify.signSessionToken({ shop: SHOP })}`, "Content-Type": "application/json" };
    r = await fetch(`${base}/api/shopify/embedded/session`, { method: "POST", headers: auth, body: "{}" }); assert.equal(r.status, 200); assert.equal((await r.json()).exchanged, true);
    r = await fetch(`${base}/api/shopify/embedded/session`, { method: "POST", headers: auth, body: "{}" }); assert.equal((await r.json()).exchanged, false);
    r = await fetch(`${base}/api/shopify/embedded/products/tee/push`, { method: "POST", headers: auth, body: JSON.stringify({ shop: "other.myshopify.com" }) });
    const pj = await r.json(); assert.equal(r.status, 200, JSON.stringify(pj)); assert.equal(pj.shop, SHOP);
    r = await fetch(`${base}/api/shopify/embedded/state`, { headers: auth }); const st = await r.json();
    assert.equal(st.connected, true); assert.equal(st.links[0].local_product_id, "tee"); assert.ok(st.products.length > 0); assert.ok(!JSON.stringify(st).includes("_enc"));
  } finally { srv.close(); }
});

console.log(`shopify-test: ${pass} passed`);
process.exit(0);
