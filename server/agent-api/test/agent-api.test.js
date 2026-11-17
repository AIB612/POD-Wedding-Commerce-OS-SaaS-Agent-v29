// Pod.AI agent API (server/agent-api): public read-only REST + MCP per store for external AI agents.
// WooCommerce (catalogue pushed by the plugin) and Shopify (mocked Admin GraphQL): only in-stock products with real prices,
// product details, checkout links (Woo ?podai_cart= / Shopify /cart/<variant>:<qty>), merchant opt-out, unknown stores 404,
// MCP initialize / tools/list / tools/call / notifications / errors, OpenAPI + discovery, rate limits, no payment fields.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podai-agentapi-"));
for (const k of ["LLM_PROVIDER", "LLM_ENABLED", "OPENAI_API_KEY", "SENDGRID_API_KEY", "PADDLE_API_KEY", "PADDLE_ENABLED"]) delete process.env[k];
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"), APP_ENCRYPTION_KEY: "a".repeat(40),
  AGENT_SHOPIFY_API_KEY: "agentkey", AGENT_SHOPIFY_API_SECRET: "agentsecret", AGENT_APP_URL: "https://app.test", TEST_EMAIL_ALLOWLIST: "sherry.branny@gmail.com", PODAI_ACCESS_LOG_DIR: path.join(tmp, "acc"), PODAI_PUBLIC_URL: "https://podai.test" });
const { createApp } = await import("../../create-app.js");
const woo = await import("../../woo-agent/core.js");
const { saveToken } = await import("../../shopify-agent/core.js");
const { saveSettings } = await import("../../shopify-agent/engine/store.js");
const { resetAgentLimits } = await import("../routes.js");
const { getState } = await import("../../saas-store.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;

// ---- mocked WordPress site (registration) + Shopify Admin GraphQL ----
let wpNonce = null;
const SHOP = "demo-shop.myshopify.com";
const SP = [
  { id: "gid://shopify/Product/101", title: "Linen Apron", handle: "linen-apron", status: "ACTIVE", onlineStoreUrl: "https://demo.example/products/linen-apron", productType: "Kitchen", tags: ["linen"], featuredImage: { url: "https://cdn.test/a.jpg" },
    priceRangeV2: { minVariantPrice: { amount: "35.0", currencyCode: "EUR" }, maxVariantPrice: { amount: "39.0", currencyCode: "EUR" } }, collections: { nodes: [{ title: "Kitchen" }] },
    variants: { nodes: [{ id: "gid://shopify/ProductVariant/1011", title: "Natural", price: "35.0", availableForSale: true }, { id: "gid://shopify/ProductVariant/1012", title: "Black", price: "39.0", availableForSale: false }] }, metafields: { nodes: [] } },
  { id: "gid://shopify/Product/102", title: "Linen Napkins (sold out)", handle: "napkins", status: "ACTIVE", onlineStoreUrl: null, productType: "Kitchen", tags: [], featuredImage: null,
    priceRangeV2: { minVariantPrice: { amount: "12.0", currencyCode: "EUR" }, maxVariantPrice: { amount: "12.0", currencyCode: "EUR" } }, collections: { nodes: [] },
    variants: { nodes: [{ id: "gid://shopify/ProductVariant/1021", title: "Default Title", price: "12.0", availableForSale: false }] }, metafields: { nodes: [] } }];
const variantNode = id => { for (const p of SP) for (const v of p.variants.nodes) if (v.id === id) return { ...v, product: { id: p.id, title: p.title, status: p.status } }; return null; };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.host === "woo-shop.test") return Response.json({ nonce: u.searchParams.get("nonce") === wpNonce ? wpNonce : "x" });
  if (u.host === SHOP && u.pathname.endsWith("/graphql.json")) {
    const { query, variables } = JSON.parse(init.body);
    if (query.includes("shop {")) return Response.json({ data: { shop: { name: "Demo Linen", contactEmail: "s@demo.example", currencyCode: "EUR", taxesIncluded: true, primaryDomain: { url: "https://demo.example" }, shopPolicies: [] } } });
    if (query.includes("nodes(ids")) return Response.json({ data: { nodes: variables.ids.map(variantNode) } });
    if (query.includes("product(id")) { const p = SP.find(x => x.id === variables.id); return Response.json({ data: { product: p ? { ...p, description: "Soft linen." } : null } }); }
    if (query.includes("products(")) return Response.json({ data: { products: { nodes: SP } } });
  }
  return realFetch(url, init);
};
const get = async p => { const r = await realFetch(base + p); return { status: r.status, d: await r.json().catch(() => ({})), h: r.headers }; };
const post = async (p, body, headers = {}) => { const r = await realFetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }); const t = await r.text(); let d = {}; try { d = JSON.parse(t); } catch { /* empty */ } return { status: r.status, d, h: r.headers }; };
let rpcId = 0;
const mcp = (store, method, params, headers) => post(`/agent/v1/stores/${store}/mcp`, { jsonrpc: "2.0", id: ++rpcId, method, ...(params ? { params } : {}) }, headers);

let WS;
test("setup: Woo store connected with a catalogue, Shopify shop installed", async () => {
  wpNonce = crypto.randomBytes(16).toString("hex");
  const reg = await (await realFetch(`${base}/woo-agent/v1/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site_url: "http://woo-shop.test", rest_url: "http://woo-shop.test/wp-json/", name: "Alpine Gifts", nonce: wpNonce, currency: "CHF" }) })).json();
  WS = reg.site_id; assert.ok(woo.validSiteId(WS));
  const signed = async (route, body) => { const raw = JSON.stringify(body); return realFetch(`${base}/woo-agent/v1${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...woo.signedHeaders(WS, reg.secret, { route: `/woo-agent/v1${route}`, body: raw }) }, body: raw }); };
  const P = (id, name, price, x = {}) => ({ id, name, price, regular_price: price, currency: "CHF", url: `http://woo-shop.test/p/${id}`, image: null, in_stock: true, type: "simple", categories: ["Gifts"], tags: [], ...x });
  assert.equal((await signed("/products/sync", { mode: "full", sync_id: "s1", done: true, products: [P(14, "Alpine Wool Scarf", 49, { categories: ["Accessories"], short_description: "Merino wool scarf" }), P(15, "Edelweiss Mug", 24),
    P(16, "Hiking Socks", 18, { type: "variable", variations: [{ id: 161, title: "S", price: 18, in_stock: true }, { id: 162, title: "L", price: 18, in_stock: false }] }),
    P(17, "Sold-out Scarf", 39, { in_stock: false }), P(18, "Free Sticker", 0)] })).status, 200);
  assert.equal((await signed("/store", { plugin_version: "1.1.0", store: { name: "Alpine Gifts", currency: "CHF", url: "http://woo-shop.test/", checkout_url: "http://woo-shop.test/checkout/", shipping: [{ name: "Switzerland", countries: ["CH"], methods: [{ name: "Flat rate", cost: 7 }] }] }, settings: { enabled: true } })).status, 200);
  await saveToken(SHOP, "tok", "read_products", { expires_in: 86400, refresh_token: "r", refresh_token_expires_in: 7776000 });
});

test("discovery + OpenAPI + store manifest", async () => {
  const d = await get("/.well-known/pod-ai-agent.json");
  assert.equal(d.status, 200); assert.match(d.d.mcp_url_template, /\/agent\/v1\/stores\/\{store\}\/mcp$/); assert.equal(d.h.get("access-control-allow-origin"), "*");
  const o = await get("/agent/v1/openapi.json");
  assert.equal(o.d.openapi, "3.1.0"); assert.ok(o.d.paths["/stores/{store}/checkout-link"].post);
  const m = await get(`/agent/v1/stores/${WS}`);
  assert.equal(m.status, 200); assert.equal(m.d.store.name, "Alpine Gifts"); assert.equal(m.d.mcp.url, `https://podai.test/agent/v1/stores/${WS}/mcp`); assert.match(m.d.payment, /never takes payment/i);
  assert.equal((await get("/agent/v1/stores/ws_0000000000000000")).status, 404);
  assert.equal((await get("/agent/v1/stores/nope.myshopify.com")).status, 404, "not installed");
  assert.equal((await get("/agent/v1/stores/../../etc")).status, 404);
  const pre = await realFetch(`${base}/agent/v1/stores/${WS}/mcp`, { method: "OPTIONS", headers: { Origin: "https://claude.ai", "Access-Control-Request-Method": "POST" } });
  assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "*");
});

test("Woo REST: search only sellable products with real prices, details, price filter", async () => {
  const all = await get(`/agent/v1/stores/${WS}/products`);
  assert.deepEqual(all.d.products.map(p => p.id).sort(), ["14", "15", "16"], "no sold-out / free products");
  const s = await get(`/agent/v1/stores/${WS}/products?query=wool%20scarf`);
  assert.equal(s.d.products[0].title, "Alpine Wool Scarf"); assert.equal(s.d.products[0].price, 49); assert.equal(s.d.currency, "CHF");
  assert.ok(!(await get(`/agent/v1/stores/${WS}/products?query=scarf`)).d.products.some(p => p.id === "17"));
  assert.deepEqual((await get(`/agent/v1/stores/${WS}/products?max_price=30`)).d.products.map(p => p.id).sort(), ["15", "16"]);
  const socks = await get(`/agent/v1/stores/${WS}/products/16`);
  assert.deepEqual(socks.d.product.variants.map(v => v.id), ["161"], "only in-stock variants"); assert.equal(socks.d.product.purchase, "choose a variant_id");
  assert.equal((await get(`/agent/v1/stores/${WS}/products/17`)).status, 404);
  assert.equal((await get(`/agent/v1/stores/${WS}/products?limit=500`)).status, 400);
});

test("Woo checkout link: prefilled cart, variants required, invalid input rejected, no payment", async () => {
  const r = await post(`/agent/v1/stores/${WS}/checkout-link`, { items: [{ product_id: "14", quantity: 2 }, { product_id: "16", variant_id: "161" }], coupon: "WELCOME10" });
  assert.equal(r.status, 200);
  const u = new URL(r.d.checkout_url);
  assert.equal(u.origin, "http://woo-shop.test"); assert.equal(u.searchParams.get("podai_cart"), "14:2,16_161:1"); assert.equal(u.searchParams.get("coupon"), "WELCOME10");
  assert.equal(r.d.subtotal, 116); assert.equal(r.d.currency, "CHF"); assert.match(r.d.payment, /never takes payment/i);
  assert.ok(!/card|iban|cvc/i.test(JSON.stringify(r.d)));
  const v = await post(`/agent/v1/stores/${WS}/checkout-link`, { items: [{ product_id: "16" }] });
  assert.equal(v.status, 422); assert.equal(v.d.errors[0].error, "variant_id_required"); assert.deepEqual(v.d.errors[0].variants.map(x => x.id), ["161"]);
  assert.equal((await post(`/agent/v1/stores/${WS}/checkout-link`, { items: [{ product_id: "17" }] })).status, 422, "sold out");
  const part = await post(`/agent/v1/stores/${WS}/checkout-link`, { items: [{ product_id: "15" }, { product_id: "17" }] });
  assert.equal(part.status, 200); assert.equal(part.d.skipped[0].product_id, "17");
  for (const bad of [{}, { items: [] }, { items: [{ product_id: "14", quantity: 0 }] }, { items: [{ product_id: "14", quantity: 1000 }] }, { items: [{ product_id: "14" }], coupon: "<script>" }, { items: Array.from({ length: 21 }, (_, i) => ({ product_id: String(i + 1) })) }])
    assert.equal((await post(`/agent/v1/stores/${WS}/checkout-link`, bad)).status, 400, JSON.stringify(bad).slice(0, 60));
  assert.equal((await post(`/agent/v1/stores/${WS}/checkout-link`, "{oops")).status, 400);
  const ev = (await getState()).podai_events.filter(e => e.type === "agent_checkout_link" && e.tenant_id === woo.tenantFor(WS));
  assert.ok(ev.length >= 2, "checkout links counted for the merchant dashboard");
});

test("MCP (streamable HTTP): initialize, tools/list, tools/call, notifications, errors", async () => {
  const init = await mcp(WS, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.equal(init.status, 200); assert.equal(init.d.result.protocolVersion, "2025-06-18"); assert.ok(init.d.result.capabilities.tools); assert.match(init.d.result.instructions, /Alpine Gifts/);
  assert.equal((await mcp(WS, "initialize", { protocolVersion: "1999-01-01" })).d.result.protocolVersion, "2025-06-18", "falls back to latest");
  const note = await post(`/agent/v1/stores/${WS}/mcp`, { jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(note.status, 202);
  const list = await mcp(WS, "tools/list", {}, { "MCP-Protocol-Version": "2025-06-18" });
  assert.deepEqual(list.d.result.tools.map(t => t.name), ["get_store_info", "search_products", "get_product", "create_checkout_link"]);
  for (const t of list.d.result.tools) { assert.equal(t.inputSchema.type, "object"); assert.equal(t.annotations.readOnlyHint, true); }
  const s = await mcp(WS, "tools/call", { name: "search_products", arguments: { query: "mug" } });
  assert.equal(s.d.result.isError, undefined); assert.equal(s.d.result.structuredContent.products[0].title, "Edelweiss Mug"); assert.equal(JSON.parse(s.d.result.content[0].text).products[0].price, 24);
  const info = await mcp(WS, "tools/call", { name: "get_store_info", arguments: {} });
  assert.equal(info.d.result.structuredContent.currency, "CHF"); assert.equal(info.d.result.structuredContent.shipping[0].zone, "Switzerland");
  const co = await mcp(WS, "tools/call", { name: "create_checkout_link", arguments: { items: [{ product_id: "15", quantity: 3 }] } });
  assert.match(co.d.result.structuredContent.checkout_url, /podai_cart=15%3A3/);
  const bad = await mcp(WS, "tools/call", { name: "get_product", arguments: { product_id: "17" } });
  assert.equal(bad.d.result.isError, true); assert.match(bad.d.result.content[0].text, /product_not_available/);
  assert.equal((await mcp(WS, "tools/call", { name: "delete_store", arguments: {} })).d.error.code, -32602);
  assert.equal((await mcp(WS, "resources/read", {})).d.error.code, -32601);
  assert.equal((await mcp(WS, "ping")).d.result && true, true);
  assert.equal((await post(`/agent/v1/stores/${WS}/mcp`, "{bad")).d.error.code, -32700);
  assert.equal((await post(`/agent/v1/stores/${WS}/mcp`, { jsonrpc: "1.0", id: 1, method: "ping" })).d.error.code, -32600);
  assert.equal((await mcp(WS, "ping", undefined, { "MCP-Protocol-Version": "2000-01-01" })).status, 400);
  assert.equal((await realFetch(`${base}/agent/v1/stores/${WS}/mcp`)).status, 405, "no SSE stream (stateless)");
  const batch = await post(`/agent/v1/stores/${WS}/mcp`, [{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }]);
  assert.equal(batch.d.length, 1);
  assert.equal((await mcp("ws_0000000000000000", "tools/list")).status, 404);
});

test("Shopify store via the same API: in-stock variants, product details, cart permalink checkout", async () => {
  const m = await get(`/agent/v1/stores/${SHOP}`);
  assert.equal(m.status, 200); assert.equal(m.d.store.platform, "shopify"); assert.equal(m.d.store.url, "https://demo.example");
  const s = await get(`/agent/v1/stores/${SHOP}/products?query=linen`);
  assert.deepEqual(s.d.products.map(p => p.id), ["101"], "sold-out product hidden"); assert.deepEqual(s.d.products[0].variants.map(v => v.id), ["1011"]); assert.equal(s.d.products[0].price, 35);
  const p = await get(`/agent/v1/stores/${SHOP}/products/101`);
  assert.equal(p.d.product.description, "Soft linen."); assert.equal((await get(`/agent/v1/stores/${SHOP}/products/102`)).status, 404);
  const co = await post(`/agent/v1/stores/${SHOP}/checkout-link`, { items: [{ product_id: "101", variant_id: "1011", quantity: 2 }], coupon: "SPRING" });
  assert.equal(co.status, 200); assert.equal(co.d.checkout_url, "https://demo.example/cart/1011:2?discount=SPRING&ref=pod-ai-agent"); assert.equal(co.d.subtotal, 70);
  const by = await post(`/agent/v1/stores/${SHOP}/checkout-link`, { items: [{ product_id: "101" }] });
  assert.equal(by.d.checkout_url.split("?")[0], "https://demo.example/cart/1011:1", "single in-stock variant picked");
  assert.equal((await post(`/agent/v1/stores/${SHOP}/checkout-link`, { items: [{ product_id: "101", variant_id: "1012" }] })).status, 422, "sold-out variant");
  assert.equal((await post(`/agent/v1/stores/${SHOP}/checkout-link`, { items: [{ product_id: "999", variant_id: "1011" }] })).status, 422, "variant of another product");
  const t = await mcp(SHOP, "tools/call", { name: "search_products", arguments: { query: "apron", max_price: 30 } });
  assert.equal(t.d.result.structuredContent.count, 0, "price filter");
});

test("merchant opt-out hides the store; rate limits apply", async () => {
  await saveSettings(woo.tenantFor(WS), { agent_api: false });
  assert.equal((await get(`/agent/v1/stores/${WS}/products`)).status, 404);
  await saveSettings(woo.tenantFor(WS), { agent_api: true });
  assert.equal((await get(`/agent/v1/stores/${WS}/products`)).status, 200);
  await saveSettings(`shopagent_${SHOP}`, { agent_api: false });
  assert.equal((await mcp(SHOP, "tools/list")).status, 404);
  await saveSettings(`shopagent_${SHOP}`, { agent_api: true });
  process.env.RATE_LIMIT_DISABLED = "false"; resetAgentLimits();
  let last; for (let i = 0; i < 61; i++) last = await get(`/agent/v1/stores/${WS}/products`);
  assert.equal(last.status, 429); assert.ok(Number(last.h.get("retry-after")) > 0);
  resetAgentLimits(); process.env.RATE_LIMIT_DISABLED = "true";
});

test("Shopify webhook still rejects unsigned calls", async () => {
  const r = await realFetch(`${base}/shopify-agent/webhooks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(r.status, 401);
});

test.after(() => { server.close(); globalThis.fetch = realFetch; });
