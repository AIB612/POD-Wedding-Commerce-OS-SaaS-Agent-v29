// POD Studio: data sync, shared pricing, project save / reopen / quote request over HTTP.
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import zlib from "node:zlib";
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true" });
delete process.env.STORE_PERSIST_PATH;
await import("../studio-pricing.js");
const { createApp } = await import("./create-app.js");
const { financeSummary } = await import("./services/finance-service.js");
const data = JSON.parse(fs.readFileSync(new URL("./data/studio-catalog.json", import.meta.url), "utf8"));
const result = {};

// 1. studio-data.js (browser) is generated from the JSON (server) — they must not drift
const js = fs.readFileSync(new URL("../studio-data.js", import.meta.url), "utf8");
assert.deepEqual(JSON.parse(js.slice(js.indexOf("=") + 1).trim().replace(/;$/, "")), data, "run npm run build:studio-data");
for (const sc of data.scenarios) for (const k of sc.kits) for (const pid of k.items) assert.ok(data.products.some(p => p.id === pid), pid);
result.data_in_sync = "pass";

// Focused v24 architecture: one storefront wedding scene; six business scenarios live in the studio.
const home = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.ok(home.includes('Cream Garden Wedding'), "storefront keeps the first wedding scene");
assert.ok(!home.includes('French Indoor Wedding'), "extra storefront wedding scenes removed");
assert.deepEqual(data.scenarios.map(s => s.id), ["creator", "community", "corporate", "art", "gifts", "seasonal"]);
assert.equal(data.products.length, 97);
assert.equal(data.category_order.length, 16);
assert.ok(!data.products.some(p => p.category === "wedding"));
assert.ok(data.products.some(p => (p.eco_tags || []).length), "eco labels exist on products");
for (const sc of data.scenarios) assert.ok(sc.scene_image && fs.existsSync(new URL(`../${sc.scene_image.src}`, import.meta.url)), `scene image for ${sc.id}`);
result.scenes_consistent = "pass";

// 2. Pricing rules
const Q = (items, o = {}) => StudioPricing.quote(data, { market: "EU", margin: 0.4, items, ...o });
let q = Q([{ product_id: "tee", qty: 1 }]);
const tee = data.products.find(p => p.id === "tee");
assert.equal(q.lines[0].unit_cost, Math.round(tee.base_cost_eur * 100) / 100, "product price excludes delivery (priced by fulfillment)");
assert.ok(q.lines[0].price >= q.lines[0].unit_cost / 0.6 && String(q.lines[0].price).endsWith(".9"), "charm price ≥ raw");
assert.ok(Q([{ product_id: "tee", qty: 100 }]).lines[0].unit_cost < q.lines[0].unit_cost, "quantity tiers lower cost");
assert.equal(Q([{ product_id: "leggings", qty: 1 }], { market: "CH" }).lines[0].facility, "f_lv", "CH routes to the near EU facility, not the US");
assert.equal(Q([{ product_id: "leggings", qty: 1 }], { market: "US" }).lines[0].cross_border, false);
assert.ok(Q([{ product_id: "espresso", qty: 1 }], { margin: 0.8 }).lines[0].reachable === false, "price above market ceiling is flagged");
q = Q([{ product_id: "tee", qty: 1 }], { packaging: ["neck_label"] });
assert.ok(q.lines[0].unit_cost > Q([{ product_id: "tee", qty: 1 }]).lines[0].unit_cost, "packaging adds cost where supported");
assert.equal(Q([{ product_id: "mug", qty: 1 }], { packaging: ["neck_label"] }).lines[0].unit_cost, Q([{ product_id: "mug", qty: 1 }]).lines[0].unit_cost, "unsupported option is free");
assert.ok(StudioPricing.effectiveDpi(1000, 1000, [300, 400], "contain", 1) < StudioPricing.effectiveDpi(4000, 4000, [300, 400], "contain", 1));
const kit = [{ product_id: "polo_emb", qty: 30 }, { product_id: "thermos", qty: 30 }, { product_id: "notebook", qty: 30 }];
const bulk = StudioPricing.fulfillment(data, { mode: "bulk", market: "CH", items: kit, address_country: "CH" });
assert.equal(bulk.parcels, 1); assert.ok(bulk.total_cost > 0 && bulk.lead_days > 0);
const rec = [...Array(10)].map((_, i) => ({ country: i < 6 ? "CH" : i < 9 ? "DE" : "JP" }));
const multi = StudioPricing.fulfillment(data, { mode: "multi", market: "CH", items: kit, recipients: rec });
assert.equal(multi.recipients, 9); assert.deepEqual(multi.unsupported, ["JP"]); assert.ok(multi.total_cost > bulk.total_cost, "per-person parcels cost more than one bulk parcel");
const ds = StudioPricing.fulfillment(data, { mode: "dropship", market: "EU", items: [{ product_id: "tee", qty: 1 }], sample_country: "FR" });
assert.ok(ds.per_order[0].regions.CH && ds.per_order[0].regions.US && ds.sample.cost > 0);
assert.equal(StudioPricing.regionOf(data, "AT"), "EU"); assert.equal(StudioPricing.regionOf(data, "JP"), null);
assert.equal(StudioPricing.deliveryDate(data, 3, "2026-10-09T10:00:00Z"), "2026-10-16", "business days incl. proof buffer");
// Materials: selectable, priced, default = first
const mq = m => StudioPricing.quote(data, { market: "EU", items: [{ product_id: "tee", qty: 1, material_id: m }] }).lines[0];
assert.equal(mq(undefined).material_id, "organic_180"); assert.ok(mq("heavy_240").unit_cost > mq("organic_180").unit_cost);
assert.equal(mq("nope").material_id, "organic_180", "unknown material falls back to the default");
assert.ok(data.products.filter(p => p.category === "stationery").some(p => (p.eco_tags || []).includes("FSC Paper")), "stationery carries sustainability labels");
result.pricing_rules = "pass";

// 3. HTTP
function png(w = 64, h = 64) { // minimal valid PNG
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-studio-"));
const app = await createApp({ generatedDir: tmp }); const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
const post = (p, b) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
try {
  for (const f of ["/studio.html", "/studio.js", "/studio-data.js", "/studio-pricing.js", "/studio-mockups.js"]) assert.equal((await fetch(base + f)).status, 200, f);
  assert.equal((await (await fetch(base + "/api/studio/catalog")).json()).products.length, data.products.length);
  const live = await (await post("/api/studio/quote", { market: "CH", margin: 0.45, items: [{ product_id: "mug", qty: 10 }] })).json();
  assert.deepEqual(live.totals, StudioPricing.quote(data, { market: "CH", margin: 0.45, items: [{ product_id: "mug", qty: 10 }] }).totals, "server and browser use the same pricing");
  result.studio_routes = "pass";

  const plan = { buyer_type: "merchant", scenario_id: "corporate", kit_id: "corp_cafe", market: "CH", margin: 0.6, packaging: ["insert_card", "sticker"], brand: { name: "Café <b>Lumière</b>" },
    items: [{ product_id: "apron", qty: 10, placement: { mode: "tile", scale: 9, dx: 5 } }, { product_id: "mug", qty: 10 }, { product_id: "espresso", qty: 10 }, { product_id: "not_a_product", qty: 1 }],
    design_meta: { name: "logo.png", width: 64, height: 64 } };
  // invalid images are rejected
  assert.equal((await post("/api/studio/projects", { ...plan, design_data_url: "data:image/png;base64," + Buffer.from("GIF89a....").toString("base64") })).status, 400);
  assert.equal((await post("/api/studio/projects", { ...plan, kit_id: "nope" })).status, 400);
  const saved = await (await post("/api/studio/projects", { ...plan, design_data_url: "data:image/png;base64," + png().toString("base64") })).json();
  assert.match(saved.id, /^sp_[a-f0-9]{20}$/); assert.equal(saved.link, `/studio.html?project=${saved.id}`);
  assert.equal((await fetch(base + saved.design_url)).status, 200, "design stored under /generated/studio");
  assert.equal(saved.quote.lines.length, 3, "unknown products dropped");
  const proj = await (await fetch(`${base}/api/studio/projects/${saved.id}`)).json();
  assert.equal(proj.items[0].placement.scale, 3, "placement values are clamped"); assert.equal(proj.items[0].placement.dx, 1);
  assert.equal((await fetch(`${base}/api/studio/projects/sp_${"0".repeat(20)}`)).status, 404);
  assert.equal((await fetch(`${base}/api/studio/projects/../../etc`)).status, 404);
  // privacy: stored encrypted outside the public folder, served decrypted only via the project URL
  const served = Buffer.from(await (await fetch(base + saved.design_url)).arrayBuffer());
  assert.ok(served.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "design served decrypted");
  const enc = fs.readdirSync(path.join(tmp, ".private-studio")).find(f => f.startsWith(saved.id));
  const raw = fs.readFileSync(path.join(tmp, ".private-studio", enc));
  assert.equal(raw.subarray(0, 5).toString(), "WCOS1"); assert.ok(!raw.includes(Buffer.from("IHDR")), "file on disk is encrypted");
  assert.equal((await fetch(`${base}/generated/.private-studio/${enc}`)).status, 404, "private folder is not public");
  result.project_save = "pass";

  // quote request → order (pending, not revenue) + proof; unreachable lines skipped; idempotent
  const revenueBefore = (await financeSummary("tenant_demo")).revenue;
  assert.equal((await post(`/api/studio/projects/${saved.id}/request-quote`, { contact: { email: "nope" } })).status, 400);
  const req = await (await post(`/api/studio/projects/${saved.id}/request-quote`, { contact: { email: "owner@cafe.ch", name: "Lea", company: "Café Lumière" } })).json();
  assert.match(req.order_id, /^STU-\d{4}-[0-9A-F]{8}$/); assert.equal(req.status, "quote_requested"); assert.equal(req.skipped, 1, "merchant: espresso exceeds the retail ceiling at 60 %");
  const again = await (await post(`/api/studio/projects/${saved.id}/request-quote`, { contact: { email: "owner@cafe.ch" } })).json();
  assert.equal(again.status, "already_requested");
  const orders = await (await fetch(base + "/api/saas/orders", { headers: { "x-admin-api-key": "k" } })).json();
  const o = orders.find(x => x.id === req.order_id);
  assert.ok(o && o.status === "Quote requested" && o.payment_status === "pending" && o.channel === "studio" && o.items.length === 2 && o.currency === "CHF");
  assert.equal(o.buyer_type, "merchant"); assert.ok(o.items.every(i => i.quantity === 1 && i.suggested_retail > i.unit_price), "merchant: one sample each at base price");
  assert.equal(o.fulfillment.mode, "dropship");
  const proofs = await (await fetch(base + "/api/saas/proofs", { headers: { "x-admin-api-key": "k" } })).json();
  assert.ok(proofs.some(p => p.order_id === req.order_id), "proof created for the quote");
  assert.equal((await financeSummary("tenant_demo")).revenue, revenueBefore, "unpaid quote requests are not revenue");
  const pub = await (await fetch(`${base}/api/studio/projects/${saved.id}`)).text();
  assert.ok(!pub.includes("owner@cafe.ch") && !pub.includes(req.order_id), "share link does not expose contact or order");
  result.quote_request = "pass";
  const recipients = [["Lea", "CH", "M"], ["Jonas", "DE", "L"], ["Sam", "US", "XL"], ["Kenji", "JP", "M"]].map(([name, country, size]) => ({ name, country, size }));
  const co = await (await post("/api/studio/projects", { buyer_type: "company", kit_id: "corp_onboarding", scenario_id: "corporate", market: "CH",
    fulfillment: { mode: "multi", recipients, deadline: "2099-01-01" }, items: [{ product_id: "polo_emb", qty: 999, per_person: 1 }, { product_id: "thermos", qty: 999, per_person: 2 }] })).json();
  assert.deepEqual(co.quote.lines.map(l => l.qty), [3, 6], "qty = served recipients × per person (JP not served)");
  const coReq = await (await post(`/api/studio/projects/${co.id}/request-quote`, { contact: { email: "hr@acme.ch", company: "ACME", vat_id: "CHE-123.456.789" } })).json();
  const coOrder = (await (await fetch(base + "/api/saas/orders", { headers: { "x-admin-api-key": "k" } })).json()).find(x => x.id === coReq.order_id);
  assert.equal(coOrder.fulfillment.mode, "multi"); assert.equal(coOrder.fulfillment.recipients, 3); assert.ok(coOrder.shipping_charged > 0);
  assert.equal(coOrder.revenue, Math.round((co.quote.totals.cost + coOrder.shipping_charged) * 100) / 100, "company pays base price × qty + delivery");
  assert.equal(coOrder.vat_id, "CHE-123.456.789");
  const coPub = await (await fetch(`${base}/api/studio/projects/${co.id}`)).text();
  assert.ok(!coPub.includes("Jonas") && coPub.includes('"country":"DE"'), "share link keeps countries / sizes, drops recipient names");
  assert.equal((await post("/api/studio/projects", { buyer_type: "individual", items: [{ product_id: "mug", qty: 4 }] })).status, 200, "custom selection without a kit");
  result.company_multi_delivery = "pass";
  // ---- store connections (merchant)
  const conn = (b) => post("/api/studio/connections", b);
  assert.equal((await conn({ platform: "shopify", store: "not a shop" })).status, 400);
  assert.equal((await conn({ platform: "woocommerce", store: "http://shop.example.com" })).status, 400, "WooCommerce needs https");
  assert.equal((await conn({ platform: "woocommerce", store: "https://localhost" })).status, 400);
  const req1 = await (await conn({ platform: "shopify", store: "https://Demo-Shop.myshopify.com/" })).json();
  assert.equal(req1.connection.status, "requested"); assert.equal(req1.connection.store, "demo-shop.myshopify.com"); assert.ok(!req1.authorize_url, "safe default: no public OAuth");
  const tasks = await (await fetch(base + "/api/saas/tasks", { headers: { "x-admin-api-key": "k" } })).json();
  assert.ok(tasks.some(t => t.type === "store_connection_request" && t.payload.connection_id === req1.connection.id), "admin gets a connection task");
  Object.assign(process.env, { STUDIO_PUBLIC_CONNECT: "true", SHOPIFY_CLIENT_ID: "cid", SHOPIFY_REDIRECT_URI: "https://shop.example.com/api/shopify/oauth/callback", PUBLIC_BASE_URL: "https://shop.example.com" });
  const sh = await (await conn({ platform: "shopify", store: "demo-shop.myshopify.com" })).json();
  assert.match(sh.authorize_url, /^https:\/\/demo-shop\.myshopify\.com\/admin\/oauth\/authorize\?/); assert.equal(sh.connection.status, "pending_authorization");
  const wc = await (await conn({ platform: "woocommerce", store: "shop.example.org/store/" })).json();
  const wurl = new URL(wc.authorize_url);
  assert.equal(wurl.origin + wurl.pathname, "https://shop.example.org/store/wc-auth/v1/authorize");
  assert.equal(wurl.searchParams.get("user_id"), wc.connection.id); assert.equal(wurl.searchParams.get("callback_url"), "https://shop.example.com/api/studio/connections/woocommerce/callback");
  const cb = b => post("/api/studio/connections/woocommerce/callback", b);
  assert.equal((await cb({ user_id: wc.connection.id, consumer_key: "nope", consumer_secret: "cs_" + "a".repeat(40) })).status, 400);
  assert.equal((await cb({ user_id: "sc_" + "0".repeat(16), consumer_key: "ck_" + "a".repeat(40), consumer_secret: "cs_" + "b".repeat(40) })).status, 400);
  assert.equal((await cb({ user_id: wc.connection.id, key_id: 1, consumer_key: "ck_" + "a".repeat(40), consumer_secret: "cs_" + "b".repeat(40), key_permissions: "read_write" })).status, 200);
  assert.equal((await (await fetch(`${base}/api/studio/connections/${wc.connection.id}`)).json()).status, "connected");
  assert.equal((await cb({ user_id: wc.connection.id, consumer_key: "ck_" + "a".repeat(40), consumer_secret: "cs_" + "b".repeat(40) })).status, 400, "callback is single-use");
  const stores = await (await fetch(base + "/api/saas/stores", { headers: { "x-admin-api-key": "k" } })).json();
  const ws = stores.find(x => x.provider === "woocommerce" && x.domain === "https://shop.example.org/store");
  assert.ok(ws && !JSON.stringify(stores).includes("cs_bbbb"), "store created; keys never returned");
  for (const k of ["STUDIO_PUBLIC_CONNECT", "SHOPIFY_CLIENT_ID", "SHOPIFY_REDIRECT_URI", "PUBLIC_BASE_URL"]) delete process.env[k];
  // merchant project remembers the publish target; the quote request carries it
  const mp = await (await post("/api/studio/projects", { buyer_type: "merchant", items: [{ product_id: "tee", qty: 1 }], publish_store: { platform: "woocommerce", connection_id: wc.connection.id, store: "https://shop.example.org/store" } })).json();
  const mq = await (await post(`/api/studio/projects/${mp.id}/request-quote`, { contact: { email: "m@shop.org" } })).json();
  const mo = (await (await fetch(base + "/api/saas/orders", { headers: { "x-admin-api-key": "k" } })).json()).find(x => x.id === mq.order_id);
  assert.equal(mo.publish_store.connection_id, wc.connection.id);
  result.store_connections = "pass";

  // materials travel with the project and into the order
  const matp = await (await post("/api/studio/projects", { buyer_type: "individual", items: [{ product_id: "invitation", qty: 40, material_id: "pearl" }, { product_id: "mug", qty: 2, material_id: "bogus" }] })).json();
  assert.deepEqual(matp.quote.lines.map(l => l.material_id), ["pearl", "gloss"]);
  const mreq = await (await post(`/api/studio/projects/${matp.id}/request-quote`, { contact: { email: "x@y.ch" } })).json();
  const mord = (await (await fetch(base + "/api/saas/orders", { headers: { "x-admin-api-key": "k" } })).json()).find(x => x.id === mreq.order_id);
  assert.equal(mord.items[0].material, "Pearl shimmer");
  result.materials = "pass";

  // automatic deletion
  const { updateRecord } = await import("./saas-store.js");
  const { purgeExpired } = await import("./services/studio-service.js");
  const old = await (await post("/api/studio/projects", { buyer_type: "company", items: [{ product_id: "mug", qty: 5 }], design_data_url: "data:image/png;base64," + png().toString("base64") })).json();
  await updateRecord("studio_projects", old.id, { expires_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await fetch(`${base}/api/studio/projects/${old.id}`)).status, 404, "expired projects are hidden immediately");
  assert.ok(await purgeExpired({ generatedDir: tmp }) >= 1);
  assert.ok(!fs.readdirSync(path.join(tmp, ".private-studio")).some(f => f.startsWith(old.id)), "design file deleted");
  const fresh = await (await fetch(`${base}/api/studio/projects/${matp.id}`)).json();
  assert.ok(Date.parse(fresh.expires_at) > Date.now() + 80 * 864e5, "quote requests are kept 90 days");
  result.retention = "pass";
} finally { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, result }, null, 2));
