// Carrier logistics (YunExpress / 4PX): signing, adapters against mocked HTTP, flag gating, fee rules (default = current
// checkout behaviour), admin API end-to-end in mock mode, customer tracking on order lookup.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-logi-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
  APP_ENCRYPTION_KEY: "y".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com", LOGISTICS_LABEL_DIR: path.join(tmp, "labels") });
delete process.env.LOGISTICS_ENABLED; delete process.env.LOGISTICS_MOCK;

const { sign4px, createFourPx } = await import("./logistics/fourpx.js");
const { signYun, createYunExpress } = await import("./logistics/yunexpress.js");
import crypto from "node:crypto";
const require_hmac = (k, m) => crypto.createHmac("sha256", k).update(m).digest("base64");
const { setFetch } = await import("./logistics/http.js");
const L = await import("./logistics/index.js");

// 1. 4PX signature = official doc example.
assert.equal(sign4px({ app_key: "16081f05-e8fc-4250-b9c4-0660d1ecbb28", method: "ds.xms.order.create", timestamp: "1532592413187", v: "1.0", body: '{"aa":"bb"}', secret: "7eebf328-8e5a-4030-904d-ec6e89174fbc" }), "ff4af77c062a9b97d98aa29777621c4a");
assert.equal(signYun("s", { method: "GET", path: "/x", date: "1" }), require_hmac("s", "date=1&method=GET&uri=/x"));

const ship = { reference: "POD-T1", service: "P1", weight_kg: 0.5, currency: "CHF", declared_value: 20, dims: null,
  to: { first_name: "Anna", last_name: "M", address1: "Str 1", city: "Berlin", postal_code: "10115", country: "DE", phone: "1", email: "a@x.de" },
  from: { name: "Wed.AI", country: "CN", city: "Shenzhen", address1: "A", postal_code: "518000" }, items: [{ sku: "menu", name_en: "Menu card", quantity: 2, unit_value: 10, unit_weight_kg: 0.12, hs_code: "4909" }] };
const res = (body, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });

// 2. 4PX adapter against mocked HTTP.
{
  const calls = [];
  setFetch(async (url, opt) => { calls.push({ url, opt }); const m = new URL(url).searchParams.get("method");
    if (m === "ds.xms.order.create") return res({ result: "1", data: { "4px_tracking_no": "4PX123", logistics_channel_no: "LX999DE" } });
    if (m === "ds.xms.label.get") return res({ result: "1", data: { label_url_info: { logistics_label: "https://label/x.pdf" } } });
    if (m === "tr.order.tracking.get") return res({ result: "1", data: { trackingList: [{ occurDatetime: "2026-10-26 10:00", trackingContent: "Delivered", businessLinkCode: "FPX_S_OK" }] } });
    return res({ result: "0", msg: "bad" }); });
  const a = createFourPx({ env: { FOURPX_APP_KEY: "key", FOURPX_APP_SECRET: "sec", FOURPX_BASE_URL: "https://open-test.4px.com" }, mode: "sandbox" });
  const c = await a.createShipment(ship);
  assert.deepEqual(c, { carrier_order_id: "4PX123", tracking_number: "LX999DE", raw_status: "created" });
  const u = new URL(calls[0].url), q = Object.fromEntries(u.searchParams);
  assert.equal(u.origin + u.pathname, "https://open-test.4px.com/router/api/service"); assert.equal(q.v, "1.1.0");
  assert.equal(q.sign, sign4px({ app_key: "key", method: q.method, timestamp: q.timestamp, v: q.v, body: calls[0].opt.body, secret: "sec" }));
  const body = JSON.parse(calls[0].opt.body); assert.equal(body.ref_no, "POD-T1"); assert.equal(body.parcel_list[0].weight, 500); assert.equal(body.recipient_info.country, "DE");
  assert.equal((await a.getLabel("4PX123")).url, "https://label/x.pdf");
  assert.equal((await a.track("LX999DE")).status, "delivered");
  await assert.rejects(a.cancel("x"), /fourpx: bad/);
  await assert.rejects(createFourPx({ env: {} }).createShipment(ship), /not_configured/);
  assert.equal(q.access_token, undefined, "no token unless configured"); assert.equal(body.sender.state, "");
  // Optional access_token: sent as a query param, excluded from the signature; IOSS passed through when set.
  const t = createFourPx({ env: { FOURPX_APP_KEY: "key", FOURPX_APP_SECRET: "sec", FOURPX_ACCESS_TOKEN: "tok32", FOURPX_IOSS_NO: "IM123", FOURPX_PROD_BASE_URL: "https://open.4px.com" }, mode: "production" });
  const n = calls.length; await t.createShipment({ ...ship, from: { ...ship.from, state: "Guangdong" } });
  const u2 = new URL(calls[n].url), q2 = Object.fromEntries(u2.searchParams), b2 = JSON.parse(calls[n].opt.body);
  assert.equal(u2.origin + u2.pathname, "https://open.4px.com/router/api/service"); assert.equal(q2.access_token, "tok32");
  assert.equal(q2.sign, sign4px({ app_key: "key", method: q2.method, timestamp: q2.timestamp, v: q2.v, body: calls[n].opt.body, secret: "sec" }));
  assert.equal(b2.ioss_no, "IM123"); assert.equal(b2.sender.state, "Guangdong");
  assert.ok(!JSON.stringify(calls).includes('"sec"') && !calls.some(c => c.url.includes("=sec")), "secret is never sent");
}
// 3. YunExpress adapter: token exchange (cached) + signed calls; response shapes from the official docs / sandbox.
{
  const calls = [];
  setFetch(async (url, opt) => { calls.push({ url, opt }); const p = new URL(url).pathname;
    if (p === "/openapi/oauth2/token") return res({ accessToken: "TOK", expiresIn: 7200 });
    if (p === "/v1/order/package/create") return res({ t: 1, success: true, result: { customer_order_number: "POD-T1", track_type: "W", waybill_number: "YT2629921272000063", tracking_number: null, remote_area: "N" } });
    if (p === "/v1/order/label/get") return res({ t: 1, success: true, result: { order_number: "YT2629921272000063", url: "https://yun/label.pdf", label_type: "PDF", label_string: "" } });
    if (p === "/v1/track-service/info/get") return res({ success: true, result: [{ order_number: "YT2629921272000063", package_status: "T", track_Info: { tracking_number: "LM123", track_events: [{ process_time: "2026-10-26T08:00:00Z", process_content: "Departed", process_location: "SZ", track_node_code: "FIRST_MILE_DEPART" }] } }] });
    if (p === "/v1/order/cancel") return JSON.parse(opt.body).waybill_number === "YT2629921272000063" ? res({ t: 1, success: true, result: null }) : res({ success: false, code: "02039001", msg: "nope" }, 400);
    return res({ success: false, msg: "nope" }, 400); });
  const y = createYunExpress({ env: { YUNEXPRESS_APP_ID: "id", YUNEXPRESS_APP_SECRET: "ysec", YUNEXPRESS_SOURCEKEY: "sk", YUNEXPRESS_BASE_URL: "https://openapi-sbx.yunexpress.cn/" }, mode: "sandbox" });
  assert.deepEqual(await y.createShipment(ship), { carrier_order_id: "YT2629921272000063", tracking_number: "YT2629921272000063", last_mile_number: "", raw_status: "created" });
  const tok = calls[0]; assert.deepEqual(JSON.parse(tok.opt.body), { grantType: "client_credentials", appId: "id", appSecret: "ysec", sourceKey: "sk" }, "SOURCEKEY alias");
  const create = calls.find(c => c.url.endsWith("/v1/order/package/create"));
  assert.ok(create.url.startsWith("https://openapi-sbx.yunexpress.cn/v1")); assert.equal(create.opt.headers.token, "TOK"); assert.equal(create.opt.headers["accept-language"], "en-US");
  assert.equal(create.opt.headers.sign, signYun("ysec", { method: "POST", path: "/v1/order/package/create", date: create.opt.headers.date, body: create.opt.body }));
  const cb = JSON.parse(create.opt.body);
  assert.equal(cb.receiver.country_code, "DE"); assert.equal(cb.product_code, "P1"); assert.equal(cb.label_type, "PDF"); assert.deepEqual(cb.receiver.address_lines, ["Str 1"]); assert.equal(cb.declaration_info[0].unit_price, 10);
  // Production mode: prod base URL + PROD_APP_ID/SECRET, fallback to sandbox names; default product THPHR.
  {
    const pc = []; setFetch(async (url, opt) => { pc.push({ url, opt }); return new URL(url).pathname.includes("oauth2") ? res({ accessToken: "PT", expiresIn: 7200 }) : res({ success: true, result: { waybill_number: "YTP" } }); });
    const yp = createYunExpress({ env: { YUNEXPRESS_APP_ID: "id", YUNEXPRESS_APP_SECRET: "ysec", YUNEXPRESS_PROD_APP_ID: "pid", YUNEXPRESS_PROD_APP_SECRET: "psec", YUNEXPRESS_PROD_BASE_URL: "https://prod.example" }, mode: "production" });
    await yp.createShipment({ ...ship, service: "" });
    assert.equal(JSON.parse(pc[0].opt.body).appId, "pid"); assert.equal(JSON.parse(pc[0].opt.body).appSecret, "psec"); assert.ok(pc[1].url.startsWith("https://prod.example/"));
    assert.equal(JSON.parse(pc[1].opt.body).product_code, "THPHR");
    assert.equal(pc[1].opt.headers.sign, signYun("psec", { method: "POST", path: "/v1/order/package/create", date: pc[1].opt.headers.date, body: pc[1].opt.body }));
    const pf = []; setFetch(async (url, opt) => { pf.push(opt); return res({ accessToken: "FT", expiresIn: 7200 }); });
    await createYunExpress({ env: { YUNEXPRESS_APP_ID: "id2", YUNEXPRESS_APP_SECRET: "s2", YUNEXPRESS_PROD_BASE_URL: "https://prod2.example" }, mode: "production" }).getLabel("x").catch(() => {});
    assert.equal(JSON.parse(pf[0].body).appId, "id2", "falls back to sandbox names");
    setFetch(async (url, opt) => { calls.push({ url, opt }); const p = new URL(url).pathname;
      if (p === "/v1/order/label/get") return res({ t: 1, success: true, result: { order_number: "YT2629921272000063", url: "https://yun/label.pdf", label_type: "PDF", label_string: "" } });
      if (p === "/v1/track-service/info/get") return res({ success: true, result: [{ order_number: "YT2629921272000063", package_status: "T", track_Info: { tracking_number: "LM123", track_events: [{ process_time: "2026-10-26T08:00:00Z", process_content: "Departed", process_location: "SZ", track_node_code: "FIRST_MILE_DEPART" }] } }] });
      if (p === "/v1/order/cancel") return JSON.parse(opt.body).waybill_number === "YT2629921272000063" ? res({ t: 1, success: true, result: null }) : res({ success: false, code: "02039001", msg: "nope" }, 400);
      return res({ success: false, msg: "nope" }, 400); });
  }
  assert.equal((await y.getLabel("YT2629921272000063")).url, "https://yun/label.pdf");
  const lab = calls.find(c => c.url.includes("/label/get")); assert.ok(lab.url.endsWith("?order_number=YT2629921272000063"));
  assert.equal(lab.opt.headers.sign, signYun("ysec", { method: "GET", path: "/v1/order/label/get", date: lab.opt.headers.date }), "GET signs without body");
  const t = await y.track("YT2629921272000063"); assert.equal(t.status, "in_transit"); assert.equal(t.events[0].location, "SZ"); assert.equal(t.last_mile_number, "LM123");
  assert.equal(calls.filter(c => c.url.includes("oauth2")).length, 1, "token cached");
  assert.deepEqual(await y.cancel("YT2629921272000063"), { cancelled: true });
  await assert.rejects(y.cancel("OTHER"), /yunexpress: 02039001 nope/);
}
setFetch(null);

// 4. Fee rules: inactive / flag-off → null (= current checkout price).
const rules = L.validateRules({ active: true, markup_pct: 10, markup_fixed: 1, rules: [{ carrier: "yunexpress", countries: "DE,FR", tiers: [{ max_kg: 0.5, price: 10 }, { max_kg: 2, price: 20 }] }, { carrier: "yunexpress", countries: ["*"], tiers: [{ max_kg: 2, price: 30 }] }] });
const settings = await L.getSettings("tenant_demo");
assert.equal(L.ruleFee(rules, settings, { country: "DE", weight_kg: 0.4 }), null, "flag off → no override");
process.env.LOGISTICS_ENABLED = "true";
assert.equal(L.ruleFee(rules, settings, { country: "DE", weight_kg: 0.4 }).amount_chf, 12);
assert.equal(L.ruleFee(rules, settings, { country: "DE", weight_kg: 1 }).amount_chf, 23);
assert.equal(L.ruleFee(rules, settings, { country: "US", weight_kg: 1 }).amount_chf, 34);
assert.equal(L.ruleFee(rules, settings, { country: "US", weight_kg: 5 }), null, "no tier → current price");
assert.equal(L.ruleFee({ ...rules, active: false }, settings, { country: "DE", weight_kg: 0.4 }), null);
assert.throws(() => L.validateRules({ rules: [{ carrier: "dhl", countries: "DE", tiers: [{ max_kg: 1, price: 1 }] }] }), /unknown_carrier/);
delete process.env.LOGISTICS_ENABLED;

// 5. HTTP: gated off by default; then full mock-mode flow.
const { createApp } = await import("./create-app.js");
const { addRecord, findRecord } = await import("./saas-store.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}`;
const H = { "Content-Type": "application/json", "x-admin-api-key": "k", "x-action-approved": "true", "x-tenant-id": "tenant_demo" };
const call = async (method, p, body) => { const r = await fetch(base + p, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) }; };
const quote = async () => (await (await fetch(base + "/api/storefront/shipping/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cart: [{ name: "Menu card", product_id: "menu_card", quantity: 1 }], currency: "CHF", country: "DE" }) })).json());
try {
  assert.equal((await call("GET", "/api/saas/carriers/shipments")).status, 404, "flag off → 404");
  assert.equal((await call("GET", "/api/saas/carriers/status")).body.enabled, false);
  const before = await quote();
  process.env.LOGISTICS_ENABLED = "true"; process.env.LOGISTICS_MOCK = "true";
  assert.equal((await call("GET", "/api/saas/carriers/shipments")).status, 200);
  const noAuth = await fetch(base + "/api/saas/carriers/shipments"); assert.equal(noAuth.status, 401);
  // Rules saved but inactive → checkout unchanged; active → overrides.
  assert.equal((await call("PUT", "/api/saas/carriers/rules", { active: false, rules: [{ carrier: "yunexpress", countries: "DE", tiers: [{ max_kg: 5, price: 7.5 }] }] })).status, 200);
  if (before.shipping_options) {
    assert.deepEqual((await quote()).shipping_options.map(o => o.amount), before.shipping_options.map(o => o.amount), "inactive rules keep current prices");
    await call("PUT", "/api/saas/carriers/rules", { active: true, rules: [{ carrier: "yunexpress", countries: "DE", tiers: [{ max_kg: 5, price: 7.5 }] }] });
    const q2 = await quote(), std = q2.shipping_options.find(o => o.id === "standard");
    if (std && !std.free_applied) { const fx = L.CARRIERS && (await import("./services/fees-service.js")).effectiveFx()[q2.currency]; assert.equal(std.amount, Math.round(7.5 * fx * 100) / 100); assert.equal(std.carrier, "yunexpress"); }
    await call("PUT", "/api/saas/carriers/rules", { active: false, rules: [] });
  }
  // Settings
  const st = await call("PUT", "/api/saas/carriers/settings", { default_carrier: "yunexpress", default_by_country: { DE: "fourpx" }, carriers: { yunexpress: { enabled: true, mode: "sandbox" }, fourpx: { enabled: true, mode: "production" } } });
  assert.equal(st.body.settings.default_by_country.DE, "fourpx"); assert.equal(st.body.settings.carriers.fourpx.mode, "production");
  // Orders
  const now = new Date().toISOString(), addr = { name: "Anna Muster", address1: "Str 1", city: "Berlin", postal_code: "10115", country: "DE" };
  for (const id of ["POD-L1", "POD-L2", "POD-L3"]) await addRecord("orders", { id, tenant_id: "tenant_demo", status: "Paid", payment_status: "paid", created_at: now, customer_email: "anna@example.com", currency: "CHF", subtotal: 20, shipping_address: { ...addr, country: id === "POD-L3" ? "FR" : "DE" }, items: [{ name: "Menu card", product_id: "menu_card", quantity: 2, unit_price: 10 }] });
  await addRecord("orders", { id: "POD-L4", tenant_id: "tenant_demo", status: "Draft", payment_status: "pending", created_at: now, customer_email: "x@example.com", shipping_address: addr, items: [] });
  const shippable = (await call("GET", "/api/saas/carriers/shippable-orders")).body.map(o => o.id);
  assert.ok(shippable.includes("POD-L1") && !shippable.includes("POD-L4"));
  const one = await call("POST", "/api/saas/carriers/shipments", { order_id: "POD-L1" });
  assert.equal(one.status, 200); assert.equal(one.body.carrier, "fourpx", "default per destination"); assert.match(one.body.tracking_number, /^4PX/);
  assert.equal((await call("POST", "/api/saas/carriers/shipments", { order_id: "POD-L1" })).status, 409, "no duplicates");
  assert.equal((await call("POST", "/api/saas/carriers/shipments", { order_id: "POD-L4" })).body.error, "order_not_paid");
  const batch = await call("POST", "/api/saas/carriers/shipments/batch", { order_ids: ["POD-L2", "POD-L3", "NOPE"] });
  assert.equal(batch.body.created, 2); assert.equal(batch.body.failed, 1);
  assert.equal((await call("GET", "/api/saas/carriers/shipments?carrier=yunexpress")).body.length, 1, "FR → default yunexpress");
  assert.equal((await call("GET", "/api/saas/carriers/shipments?q=POD-L2")).body.length, 1);
  // Label
  const lab = await call("GET", `/api/saas/carriers/shipments/${one.body.id}/label`);
  assert.equal(lab.status, 200); assert.ok(lab.body.subarray(0, 5).toString() === "%PDF-");
  // Tracking refresh → order status + lookup
  const tr = await call("POST", `/api/saas/carriers/shipments/${one.body.id}/refresh`);
  assert.equal(tr.body.status, "in_transit");
  assert.equal((await findRecord("orders", "POD-L1")).status, "Shipped");
  const lk = await (await fetch(base + "/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: "POD-L1", email: "anna@example.com" }) })).json();
  assert.equal(lk.order.tracking.number, one.body.tracking_number); assert.equal(lk.order.tracking.status, "in_transit"); assert.ok(lk.order.tracking.last_event.text);
  assert.ok(!JSON.stringify(lk).includes("Str 1"), "lookup leaks no address");
  // Detail, poll, alerts
  const det = await call("GET", `/api/saas/carriers/shipments/${one.body.id}`); assert.equal(det.body.events.length, 1);
  assert.equal((await call("POST", "/api/saas/carriers/poll")).body.polled, 3);
  assert.equal(L.alertFor({ status: "in_transit", created_at: "2026-01-01T00:00:00Z", events: [] }, await L.getSettings("tenant_demo"), Date.parse("2026-03-01")).type, "delayed");
  assert.equal(L.alertFor({ status: "exception", created_at: now }, await L.getSettings("tenant_demo")).type, "exception");
  // Cancel the FR one (no events yet) → order tracking cleared
  const fr = (await call("GET", "/api/saas/carriers/shipments?q=POD-L3")).body[0];
  assert.equal((await call("POST", `/api/saas/carriers/shipments/${fr.id}/cancel`)).body.status, "cancelled");
  assert.equal((await findRecord("orders", "POD-L3")).tracking_number, "");
  // Disabled carrier is refused
  await call("PUT", "/api/saas/carriers/settings", { carriers: { yunexpress: { enabled: false }, fourpx: { enabled: true } } });
  assert.equal((await call("POST", "/api/saas/carriers/shipments", { order_id: "POD-L3", carrier: "yunexpress" })).body.error, "carrier_disabled");
  // Without mock and without keys: clean carrier error, stored as error shipment
  delete process.env.LOGISTICS_MOCK;
  const bad = await call("POST", "/api/saas/carriers/shipments", { order_id: "POD-L3", carrier: "fourpx" });
  assert.equal(bad.status, 502); assert.match(bad.body.error, /not_configured/);
  // Admin UI wiring
  const html = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8"), js = fs.readFileSync(new URL("../admin-sections.js", import.meta.url), "utf8");
  assert.ok(html.includes('id="carriersSection"') && html.includes('data-page="carriers"') && js.includes("/api/saas/carriers/rules"));
  console.log("logistics-test: all passed");
} finally { server.close(); delete process.env.LOGISTICS_ENABLED; delete process.env.LOGISTICS_MOCK; }
