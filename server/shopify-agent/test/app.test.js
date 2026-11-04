// Shopify Chat Agent app (server/shopify-agent): signed App Proxy chat, session-token admin API, per-shop isolation,
// Shopify data (orders/products/policies, mocked Admin API), handoff, GDPR + uninstall webhooks, POD.AI checkout unchanged.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-shopagent-"));
for (const k of ["LLM_PROVIDER", "OPENAI_API_KEY", "XAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"), APP_ENCRYPTION_KEY: "z".repeat(40),
  AGENT_SHOPIFY_API_KEY: "agentkey", AGENT_SHOPIFY_API_SECRET: "agentsecret", AGENT_APP_URL: "https://app.test" });
const { createApp } = await import("../../create-app.js");
const core = await import("../core.js");
const { quoteStorefront } = await import("../../services/checkout-service.js");
const { getState } = await import("../../saas-store.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;
const A = "shop-a.myshopify.com", B = "shop-b.myshopify.com";

// ---- mocked Shopify (token exchange + Admin GraphQL) ----
const gql = [];
const SHOPS = {
  [A]: { name: "Alpine Tees", policies: [{ type: "REFUND_POLICY", title: "Refund policy", body: "<p>Returns accepted within <b>30 days</b> of delivery.</p>", url: "https://shop-a.example/policies/refund-policy" },
    { type: "SHIPPING_POLICY", title: "Shipping policy", body: "<p>We ship within 2 business days from Zurich.</p>", url: "https://shop-a.example/policies/shipping-policy" }],
    orders: { "1001": { name: "#1001", createdAt: "2026-10-01T10:00:00Z", email: "Buyer@Example.com", cancelledAt: null, displayFinancialStatus: "PAID", displayFulfillmentStatus: "FULFILLED",
      totalPriceSet: { shopMoney: { amount: "39.0", currencyCode: "CHF" } }, lineItems: { nodes: [{ title: "Mountain Tee", quantity: 2 }] }, fulfillments: [{ status: "SUCCESS", trackingInfo: [{ company: "Swiss Post", number: "99.00.123456.78901234", url: "https://post.ch/t" }] }] } },
    products: [{ id: "gid://shopify/Product/1", title: "Mountain Tee", handle: "mountain-tee", onlineStoreUrl: null, status: "ACTIVE", productType: "T-Shirt", featuredImage: { url: "https://cdn.example/tee.jpg" }, priceRangeV2: { minVariantPrice: { amount: "19.5", currencyCode: "CHF" }, maxVariantPrice: { amount: "24.0", currencyCode: "CHF" } }, collections: { nodes: [{ title: "Summer" }] }, variants: { nodes: [{ title: "S", price: "19.50", availableForSale: true }, { title: "XL", price: "24.00", availableForSale: false }] }, metafields: { nodes: [{ namespace: "custom", key: "material", value: "Organic cotton", type: "single_line_text_field" }] } }] },
  [B]: { name: "Bern Mugs", policies: [], orders: {}, products: [] }
};
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (/api\.51tracking\.com\/v4\/trackings\/get/.test(u)) return new Response(JSON.stringify({ meta: { code: 200 }, data: { success: [{ tracking_number: "99.00.123456.78901234", courier_code: "swiss-post", delivery_status: "delivered",
    origin_info: { trackinfo: [{ checkpoint_date: "2026-11-03 14:05", location: "8001 Zürich", tracking_detail: "Delivered" }, { checkpoint_date: "2026-11-02 07:10", location: "Härkingen", tracking_detail: "Sorted" }] } }] } }), { status: 200 });
  const m = u.match(/^https:\/\/([a-z0-9-]+\.myshopify\.com)\/admin\/(.*)$/);
  if (!m) return realFetch(url, init);
  const shop = m[1], body = JSON.parse(init.body || "{}"), json = d => new Response(JSON.stringify(d), { status: 200, headers: { "Content-Type": "application/json" } });
  if (m[2] === "oauth/access_token") { assert.equal(body.client_id, "agentkey"); assert.match(body.grant_type, /token-exchange/); return json({ access_token: `tok_${shop}`, scope: core.SCOPES }); }
  assert.equal(init.headers["X-Shopify-Access-Token"], `tok_${shop}`, "token of the same shop");
  gql.push({ shop, q: body.query.slice(0, 30), v: body.variables });
  const s = SHOPS[shop];
  if (/shopPolicies/.test(body.query)) return json({ data: { shop: { name: s.name, contactEmail: "team@" + shop, currencyCode: "CHF", taxesIncluded: true, primaryDomain: { url: `https://${shop}` }, shopPolicies: s.policies } } });
  if (/deliveryProfiles/.test(body.query)) return json({ data: { deliveryProfiles: { nodes: shop === A ? [{ name: "General", default: true, profileLocationGroups: [{ locationGroupZones: { nodes: [
    { zone: { name: "Europe", countries: [{ name: "Germany", code: { countryCode: "DE", restOfWorld: false } }, { name: "Switzerland", code: { countryCode: "CH", restOfWorld: false } }] },
      methodDefinitions: { nodes: [{ name: "Standard", active: true, rateProvider: { __typename: "DeliveryRateDefinition", price: { amount: "7.9", currencyCode: "CHF" } }, methodConditions: [] },
        { name: "Free shipping", active: true, rateProvider: { __typename: "DeliveryRateDefinition", price: { amount: "0.0", currencyCode: "CHF" } }, methodConditions: [{ field: "TOTAL_PRICE", operator: "GREATER_THAN_OR_EQUAL_TO", conditionCriteria: { __typename: "MoneyV2", amount: "80.0", currencyCode: "CHF" } }] },
        { name: "Old", active: false, rateProvider: { __typename: "DeliveryRateDefinition", price: { amount: "1.0", currencyCode: "CHF" } }, methodConditions: [] }] } }] } }] }] : [] } } });
  if (/codeDiscountNodes/.test(body.query)) { const c = body.variables.q.replace("code:", ""); return json({ data: { codeDiscountNodes: { nodes: shop === A && c === "ALPS10" ? [{ codeDiscount: { __typename: "DiscountCodeBasic", title: "Alps", status: "ACTIVE", summary: "10% off entire order", endsAt: null } }] : shop === A && c === "OLD5" ? [{ codeDiscount: { __typename: "DiscountCodeBasic", title: "Old", status: "EXPIRED", summary: "5% off" } }] : [] } } }); }
  if (/orders\(/.test(body.query)) { const n = body.variables.q.replace("name:#", ""); return json({ data: { orders: { nodes: s.orders[n] ? [s.orders[n]] : [] } } }); }
  if (/products\(/.test(body.query)) return json({ data: { products: { nodes: /tee/i.test(body.variables.q) || body.variables.q === "status:active" ? s.products : [] } } });
  return json({ errors: [{ message: "unexpected" }] });
};

const call = async (p, { method = "GET", body, headers = {} } = {}) => {
  const r = await realFetch(base + p, { method, headers: { "Content-Type": "application/json", ...headers }, body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  let json = null; const text = await r.text(); try { json = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, json, text, headers: r.headers };
};
const signedQuery = (shop, extra = {}) => { const q = { shop, logged_in_customer_id: "", path_prefix: "/apps/podai", timestamp: String(Math.floor(Date.now() / 1000)), ...extra }; q.signature = core.proxySignature(q, "agentsecret"); return new URLSearchParams(q).toString(); };
const proxy = (shop, message, conversation_id, lang = "en") => call(`/shopify-agent/proxy/chat?${signedQuery(shop)}`, { method: "POST", body: { message, conversation_id, lang } });
const adm = (shop, p, opt = {}) => call(`/shopify-agent/api${p}`, { ...opt, headers: { Authorization: `Bearer ${core.signSession(shop)}` } });
const hook = (topic, shop, payload, { bad = false, id = crypto.randomUUID() } = {}) => {
  const raw = JSON.stringify(payload), h = crypto.createHmac("sha256", bad ? "wrong" : "agentsecret").update(raw).digest("base64");
  return call("/shopify-agent/webhooks", { method: "POST", body: raw, headers: { "X-Shopify-Hmac-Sha256": h, "X-Shopify-Topic": topic, "X-Shopify-Shop-Domain": shop, "X-Shopify-Webhook-Id": id } });
};
const result = {};
try {
  // 1. Requests without Shopify proof are refused
  assert.equal((await call(`/shopify-agent/proxy/chat?shop=${A}`, { method: "POST", body: { message: "hi" } })).status, 401);
  const forged = signedQuery(A).replace(/signature=[0-9a-f]+/, "signature=" + "0".repeat(64));
  assert.equal((await call(`/shopify-agent/proxy/chat?${forged}`, { method: "POST", body: { message: "hi" } })).status, 401);
  assert.equal((await call(`/shopify-agent/proxy/chat?${signedQuery(A, { timestamp: "1000" })}`, { method: "POST", body: { message: "hi" } })).status, 401, "stale");
  assert.equal((await call("/shopify-agent/api/overview")).status, 401);
  const wrongKey = core.signJwt({ shop: A, apiKey: "agentkey", secret: "other" });
  assert.equal((await call("/shopify-agent/api/overview", { headers: { Authorization: `Bearer ${wrongKey}` } })).status, 401);
  assert.equal((await proxy(A, "hi")).status, 404, "not installed yet");
  result.auth = "pass";

  // 2. Install: embedded page (frame headers) + token exchange via bootstrap
  const page = await call(`/shopify-agent?shop=${A}&host=x&embedded=1`);
  assert.equal(page.status, 200); assert.match(page.text, /name="shopify-api-key" content="agentkey"/); assert.match(page.text, /app-bridge\.js/);
  assert.match(page.headers.get("content-security-policy"), new RegExp(`frame-ancestors https://${A.replace(/\./g, "\\.")} https://admin\\.shopify\\.com`));
  assert.equal(page.headers.get("x-frame-options"), null);
  for (const s of [A, B]) { const b = await adm(s, "/bootstrap", { method: "POST" }); assert.equal(b.status, 200); assert.equal(b.json.shop, s); assert.equal(b.json.exchanged, true); }
  assert.equal((await adm(A, "/bootstrap", { method: "POST" })).json.exchanged, false, "idempotent");
  const row = (await getState()).podai_shops.find(r => r.id === A);
  assert.ok(row.access_token_enc && !JSON.stringify(row).includes(`tok_${A}`), "token encrypted at rest");
  result.install = "pass";

  // 3. Storefront chat: greeting, local policy answers, products, order lookup with e-mail check, handoff
  let r = await proxy(A, "Hello");
  assert.equal(r.status, 200); assert.match(r.json.answer, /Alpine Tees/);
  const conv = r.json.conversation_id;
  r = await proxy(A, "What is your return policy?", conv); assert.match(r.json.answer, /30 days/); assert.doesNotMatch(r.json.answer, /Wed\.AI|invitation/i);
  // shipping from the shop's delivery profiles (zones / rates), inactive methods hidden, conditions shown
  r = await proxy(A, "How much is shipping to Germany?", conv);
  assert.match(r.json.answer, /Europe: Standard CHF 7\.90; Free shipping free \[order ≥ 80\.0 CHF\]/, r.json.answer); assert.doesNotMatch(r.json.answer, /Old/);
  r = await proxy(A, "How much is shipping to Japan?"); assert.match(r.json.answer, /don't ship to JP/, r.json.answer);
  r = await proxy(B, "How much is shipping to Germany?"); assert.match(r.json.answer, /calculated at checkout/, "no zones → policy / checkout note");
  // discount codes: read-only check, never listed
  r = await proxy(A, "Is the discount code ALPS10 valid?"); assert.match(r.json.answer, /ALPS10 is valid: 10% off entire order/, r.json.answer);
  r = await proxy(A, "promo code OLD5"); assert.match(r.json.answer, /OLD5 isn't active/);
  r = await proxy(A, "do you have any discount?"); assert.match(r.json.answer, /Send it and I'll check/); assert.doesNotMatch(r.json.answer, /ALPS10/);
  r = await proxy(A, "Do you have a mountain tee?", conv); const cards = r.json.ui.find(u => u.type === "products");
  assert.ok(cards && cards.items[0].name === "Mountain Tee" && cards.items[0].unit_price === 19.5 && cards.items[0].link === "/products/mountain-tee", JSON.stringify(r.json));
  assert.match(r.json.answer, /Prices include tax/); const it = cards.items[0];
  assert.deepEqual(it.variants, [{ title: "S", price: 19.5, available: true }, { title: "XL", price: 24, available: false }]); assert.deepEqual(it.collections, ["Summer"]);
  assert.deepEqual(it.details, [{ key: "material", value: "Organic cotton" }]); assert.equal(it.max_price, 24);
  r = await proxy(A, "Where is my order #1001?", conv); assert.match(r.json.answer, /e-mail/i);
  r = await proxy(A, "wrong@example.com", conv); assert.match(r.json.answer, /couldn't find/);
  r = await proxy(A, "Where is my order #1001? buyer@example.com", conv);
  assert.match(r.json.answer, /#1001/); assert.match(r.json.answer, /Swiss Post 99\.00\.123456\.78901234/); assert.match(r.json.answer, /fulfilled/);
  assert.doesNotMatch(JSON.stringify(r.json), /Buyer@Example\.com/, "order e-mail not echoed");
  assert.match(r.json.answer, /https:\/\/post\.ch\/t/, "no tracking source configured → Shopify tracking link");
  // with 51Tracking configured: Swiss Post (not integrated) → 51Tracking status, latest event, timeline
  process.env.TRACKING51_API_KEY = "k51"; (await import("../tracking.js")).clearTrackingCache();
  r = await proxy(A, "Where is my order #1001? buyer@example.com", conv);
  assert.match(r.json.answer, /Delivered \(2026-11-03 14:05, 8001 Zürich, Delivered\)/, r.json.answer);
  const tl = r.json.ui.find(u => u.type === "tracking"); assert.equal(tl.source, "51tracking"); assert.equal(tl.events.length, 2);
  delete process.env.TRACKING51_API_KEY;
  // lockout after 5 failures
  for (let i = 0; i < 5; i++) await proxy(A, `order #1001 x${i}@example.com`);
  r = await proxy(A, "order #1001 buyer@example.com"); assert.match(r.json.answer, /Too many attempts/);
  (await import("../profile.js")).resetOrderLocks();
  // handoff
  const hc = (await proxy(A, "Hi")).json.conversation_id;
  r = await proxy(A, "I want to talk to a person please, my email is anna@example.com", hc); assert.ok(r.json.handoff, JSON.stringify(r.json));
  result.storefront_chat = "pass";

  // 3b. Generic product browsing (EN / DE / ZH) lists the shop's products; no refund policy → fallback, not a dead end
  for (const [q, head, lg] of [["Show me some products", /Here are some of our products/], ["What do you sell?", /Here are some/], ["Bestsellers?", /Here are some/], ["Zeig mir eure Produkte", /Hier sind einige/, "de"], ["你们有什么商品", /部分商品/, "zh"]]) {
    r = await proxy(A, q, undefined, lg); assert.match(r.json.answer, head, `${q} → ${r.json.answer}`);
    const pc = r.json.ui.find(u => u.type === "products"); assert.ok(pc && pc.items[0].name === "Mountain Tee" && pc.items[0].image && pc.items[0].link && pc.items[0].unit_price === 19.5, q);
  }
  for (const [q, lg, btn] of [["Show me some products", "en", "Talk to a person"], ["你们有什么商品", "zh", "转人工"], ["Zeig mir eure Produkte", "de", "Mit einem Menschen sprechen"]]) {
    r = await proxy(A, q, undefined, lg);
    assert.doesNotMatch(r.json.answer, /fully answer|完全解答|nicht ganz beantwortet|talk to a person"|转人工”/, `no trailing handoff sentence (${lg}): ${r.json.answer}`);
    assert.equal(r.json.ui.filter(u => u.type === "chips" && u.items.includes(btn)).length, 1, `one handoff button (${lg})`);
  }
  assert.ok(gql.some(g => g.v?.q === "status:active" && g.v.sort === "UPDATED_AT"));
  r = await proxy(B, "Show me some products"); assert.match(r.json.answer, /no products in the shop yet/);
  r = await proxy(B, "What is your return policy?");
  assert.match(r.json.answer, /hasn't published a return \/ refund policy/); assert.match(r.json.answer, /team@shop-b\.myshopify\.com/); assert.match(r.json.answer, /pass your question to the team/);
  assert.ok(r.json.ui.some(u => u.type === "chips"));
  // 4. Isolation: shop B sees nothing of shop A; B gets no POD.AI or shop-A data; x-tenant-id cannot reach shop tenants
  r = await proxy(B, "What is your return policy?"); assert.doesNotMatch(r.json.answer, /30 days|Wed\.AI/);
  r = await proxy(B, "Where is my order #1001? buyer@example.com"); assert.match(r.json.answer, /couldn't find/);
  r = await proxy(B, "hello", conv); assert.notEqual(r.json.conversation_id, conv, "conversation of shop A not reused by B");
  assert.ok(gql.some(g => g.shop === B), "shop B queried with its own token (mock asserts token per shop)");
  const ovA = (await adm(A, "/overview")).json, ovB = (await adm(B, "/overview")).json, kv = (o, id) => o.kpis.find(k => k.id === id)?.value;
  assert.ok(kv(ovA, "conversations") >= 2); assert.equal(kv(ovA, "open_handoffs"), 1); assert.ok(kv(ovA, "order_lookups") >= 2); assert.equal(kv(ovB, "open_handoffs"), 0);
  assert.ok(!ovA.kpis.some(k => k.id === "quotes" || k.id === "discounts_issued"));
  assert.equal((await adm(B, "/handoffs")).json.length, 0);
  const hoA = (await adm(A, "/handoffs")).json; assert.equal(hoA.length, 1);
  assert.equal((await adm(B, `/handoffs/${hoA[0].id}`, { method: "PATCH", body: { status: "resolved" } })).status, 404, "B cannot touch A's handoff");
  const leak = await call("/api/pod-agent/chat", { method: "POST", body: { message: "hi" }, headers: { "x-tenant-id": `shopagent_${A}` } });
  assert.equal(leak.status, 200);
  assert.ok(!((await getState()).podai_conversations || []).some(c => c.id === leak.json.conversation_id), "site chat (any x-tenant-id) never writes Pod.AI data");
  result.isolation = "pass";

  // 5. Embedded admin: knowledge (no POD.AI built-ins), settings, handoff resolve, preview
  assert.deepEqual((await adm(A, "/knowledge")).json, { custom: [] });
  assert.equal((await adm(A, "/knowledge", { method: "POST", body: { question: "Do you ship to Austria?", answer: "Yes, Austria in 3-5 days.", tags: "austria", lang: "en" } })).status, 200);
  r = await proxy(A, "Do you ship to Austria?"); assert.match(r.json.answer, /Austria in 3-5 days/);
  r = await proxy(B, "Do you ship to Austria?"); assert.doesNotMatch(r.json.answer, /3-5 days/);
  assert.equal((await adm(A, `/handoffs/${hoA[0].id}`, { method: "PATCH", body: { status: "resolved" } })).json.status, "resolved");
  assert.equal((await adm(A, "/settings", { method: "PUT", body: { enabled: true, greeting: { en: "Grüezi from Alpine Tees!" }, human_reply_hours: 12 } })).json.human_reply_hours, 12);
  r = await adm(A, "/preview", { method: "POST", body: { message: "hi" } }); assert.match(r.json.answer, /Grüezi from Alpine Tees/);
  result.admin = "pass";

  // 6. Webhooks: HMAC required; GDPR topics + uninstall return 200 and act
  assert.equal((await hook("customers/redact", A, {}, { bad: true })).status, 401);
  const st = await getState(), before = st.podai_conversations.filter(c => c.tenant_id === `shopagent_${A}`).length;
  assert.equal((await hook("customers/data_request", A, { shop_domain: A, customer: { email: "anna@example.com" }, data_request: { id: 9 } })).status, 200);
  const log = (await adm(A, "/privacy")).json; assert.equal(log[0].type, "customers/data_request"); assert.equal(log[0].handoffs.length, 1); assert.ok(!JSON.stringify(log).includes("anna@"));
  assert.equal((await hook("customers/redact", A, { shop_domain: A, customer: { email: "anna@example.com" } })).status, 200);
  const after = (await getState()).podai_conversations.filter(c => c.tenant_id === `shopagent_${A}`);
  assert.ok(after.length < before && !JSON.stringify(after).includes("anna@example.com")); assert.ok(!(await getState()).podai_handoffs.some(h => h.customer_email === "anna@example.com"));
  assert.equal((await hook("app/uninstalled", A, { domain: A })).status, 200);
  assert.equal((await proxy(A, "hi")).status, 404, "chat off after uninstall");
  const id = crypto.randomUUID();
  assert.equal((await hook("shop/redact", A, { shop_domain: A }, { id })).status, 200);
  assert.equal((await hook("shop/redact", A, { shop_domain: A }, { id })).status, 200, "duplicate delivery ok");
  const s2 = await getState();
  for (const col of ["podai_conversations", "podai_handoffs", "podai_settings", "podai_shops", "podai_gdpr"]) assert.ok(!(s2[col] || []).some(x => x.tenant_id === `shopagent_${A}` || x.id === A), col);
  assert.ok(s2.podai_shops.some(x => x.id === B), "other shop untouched");
  result.webhooks = "pass";

  // 7. POD.AI storefront + checkout unchanged
  const q = await quoteStorefront({ tenantId: "tenant_demo", cart: [{ product_id: "invitation", quantity: 10 }], country: "CH" });
  const std = q.shipping_options.find(o => o.id === "standard").amount, exp = q.shipping_options.find(o => o.id === "express").amount;
  r = await call("/api/pod-agent/chat", { method: "POST", body: { message: "How much is shipping to Switzerland for 10 invitations?", lang: "en" } });
  assert.ok(r.json.answer.includes(std.toFixed(2)) && r.json.answer.includes(exp.toFixed(2)));
  result.wedai_unchanged = { standard: std, express: exp };
  console.log(JSON.stringify({ ok: true, ...result }, null, 1));
} finally { server.close(); globalThis.fetch = realFetch; }
