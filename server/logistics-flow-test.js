// Logistics end to end (mock carriers): order ⇄ shipment status sync, customer tracking, channel quotes, CSV/labels,
// Excel bulk ordering, shipped e-mail draft (never auto-sent), settings (sender, IOSS, handover, price tables).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-lf-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "s.json"), LOGISTICS_ENABLED: "true", LOGISTICS_MOCK: "true",
  APP_ENCRYPTION_KEY: "z".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com", LOGISTICS_LABEL_DIR: path.join(tmp, "labels"), ADMIN_AUTH_PATH: path.join(tmp, "aa.json") });
for (const k of ["SENDGRID_API_KEY", "POSTMARK_SERVER_TOKEN", "LOGISTICS_TEST_EMAIL_TO"]) delete process.env[k];
const { createApp } = await import("./create-app.js");
const { addRecord, findRecord, listForTenant, updateRecord } = await import("./saas-store.js");
const L = await import("./logistics/index.js");
const Bulk = await import("./logistics/bulk.js");
const { parseXlsx } = await import("./services/data-exchange-service.js");
const app = await createApp({ generatedDir: tmp }); const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
const H = { "x-admin-api-key": "k", "x-action-approved": "true", "Content-Type": "application/json" };
const call = async (method, p, body, h = {}) => { const r = await fetch(base + p, { method, headers: { ...H, ...h }, body: body == null ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) });
  const ct = r.headers.get("content-type") || ""; return { status: r.status, ct, body: ct.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer()) }; };
const T = "tenant_demo", now = new Date().toISOString(), addr = { name: "Anna Muster", address1: "Str 1", city: "Berlin", postal_code: "10115", country: "DE" };
try {
  await addRecord("orders", { id: "POD-F1", tenant_id: T, status: "Paid", payment_status: "paid", created_at: now, customer_email: "anna@example.com", currency: "CHF", shipping_charged: 12, shipping_address: addr, items: [{ name: "Card", quantity: 3, unit_price: 4 }] });

  // Settings: sender, IOSS, handover, sync, price tables
  let r = await call("PUT", "/api/saas/carriers/settings", { sender: { name: "Wed.AI Studio", address1: "Room 1", city: "Shenzhen", postal_code: "518000", country: "cn", phone: "123" }, ioss_no: "IM1234567890",
    carriers: { yunexpress: { enabled: true, mode: "sandbox" }, fourpx: { enabled: true, mode: "sandbox", handover: "dropoff" } }, sync_minutes: 30,
    price_tables: [{ carrier: "yunexpress", product: "TABLEONLY", countries: "DE", currency: "CHF", first_kg: 0.5, first_price: 1, add_kg: 0.5, add_price: 1 }] });
  assert.equal(r.status, 200); assert.equal(r.body.settings.sender.country, "CN"); assert.equal(r.body.settings.carriers.fourpx.handover, "dropoff");
  assert.equal((await call("PUT", "/api/saas/carriers/settings", { ioss_no: "bad" })).status, 400);
  assert.equal(r.body.settings.notify_customer_on_status, false, "customer status e-mails default OFF");
  assert.equal((await call("PUT", "/api/saas/carriers/settings", { notify_customer_on_status: true })).body.settings.notify_customer_on_status, true);
  assert.equal((await call("PUT", "/api/saas/carriers/settings", { notify_customer_on_status: false })).body.settings.notify_customer_on_status, false);
  assert.equal((await call("GET", "/api/saas/carriers/settings")).body.settings.notify_customer_on_status, false);
  const st = await L.getSettings(T), req = L.shipmentRequest({ items: [], shipping_address: addr }, st, "fourpx");
  assert.equal(req.from.name, "Wed.AI Studio"); assert.equal(req.ioss_no, "IM1234567890"); assert.equal(req.handover, "dropoff");
  assert.equal(L.tablePrice({ first_kg: 0.5, first_price: 10, add_kg: 0.5, add_price: 4, fixed_fee: 0 }, 1.2), 18);

  // Channel quotes: live (mock) + price table, cheapest, margin vs. the order's shipping charge
  r = await call("GET", "/api/saas/carriers/quotes?order_id=POD-F1");
  assert.equal(r.status, 200); assert.ok(r.body.channels.length >= 5); assert.equal(r.body.sources.yunexpress, "live_api");
  assert.ok(r.body.channels.some(c => c.product === "TABLEONLY" && c.source === "price_table" && c.cost_chf === 1));
  assert.deepEqual(r.body.cheapest, { carrier: "yunexpress", product: "TABLEONLY" }); assert.equal(r.body.customer_fee_chf, 12);
  assert.equal(r.body.channels.find(c => c.product === "TABLEONLY").margin_chf, 11);

  // Create (cheapest) → order "Label created"; label → label_ready; tracking (mock: in_transit) → "Shipped" + e-mail DRAFT only
  r = await call("POST", "/api/saas/carriers/shipments", { order_id: "POD-F1", carrier: "cheapest" });
  assert.equal(r.status, 200, JSON.stringify(r.body)); const sid = r.body.id; assert.equal(r.body.product, "TABLEONLY");
  let o = await findRecord("orders", "POD-F1"); assert.equal(o.status, "Label created"); assert.equal(o.logistics_status, "created"); assert.ok(o.tracking_number);
  await L.getLabel(T, sid, { refresh: true }); o = await findRecord("orders", "POD-F1"); assert.equal(o.logistics_status, "label_ready");
  r = await call("POST", `/api/saas/carriers/shipments/${sid}/refresh`); assert.equal(r.body.status, "in_transit");
  o = await findRecord("orders", "POD-F1"); assert.equal(o.status, "Shipped"); assert.ok(o.shipped_at);
  const notes = (await listForTenant("notifications", T)).filter(n => n.related_id === "POD-F1");
  assert.equal(notes.length, 1); assert.equal(notes[0].status, "draft");
  // admin list + customer lookup show status + timeline
  r = await call("GET", "/api/saas/carriers/shipments?order_id=POD-F1");; assert.equal(r.body.length, 1);
  r = await fetch(base + "/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: "POD-F1", email: "anna@example.com" }) }).then(x => x.json());
  assert.equal(r.order.stage, "shipped"); assert.equal(r.order.tracking.status, "in_transit"); assert.equal(r.order.tracking.status_label.zh, "运输中"); assert.ok(r.order.tracking.events.length >= 1);
  // delivered → "Delivered"; never downgraded by a later stale scan
  await L.syncOrder({ ...(await findRecord("carrier_shipments", sid)), status: "delivered" }, "test"); o = await findRecord("orders", "POD-F1"); assert.equal(o.status, "Delivered");
  await L.syncOrder({ ...(await findRecord("carrier_shipments", sid)), status: "in_transit" }, "test"); assert.equal((await findRecord("orders", "POD-F1")).status, "Delivered");
  // Shipped e-mail preview (draft, not sent) and the test e-mail needs a configured test recipient
  r = await call("GET", "/api/saas/carriers/orders/POD-F1/shipped-email"); assert.equal(r.body.sent, false); assert.match(r.body.html, /已发货/);
  assert.equal((await call("POST", "/api/saas/carriers/test-shipped-email")).status, 409);
  process.env.LOGISTICS_TEST_EMAIL_TO = "owner@example.com";
  r = await call("POST", "/api/saas/carriers/test-shipped-email"); assert.equal(r.status, 200); assert.equal(r.body.to_masked, "o***@example.com");
  const sentTo = (await listForTenant("notifications", T)).filter(n => n.type === "order_shipped_test").map(n => n.to); assert.deepEqual(sentTo, ["owner@example.com"]);

  // Exception flag, cancel → "Ready to ship", order cancelled → shipment cancelled
  await addRecord("orders", { id: "POD-F2", tenant_id: T, status: "Paid", payment_status: "paid", created_at: now, customer_email: "b@example.com", currency: "CHF", shipping_address: addr, items: [{ name: "Card", quantity: 1, unit_price: 4 }] });
  r = await call("POST", "/api/saas/carriers/shipments", { order_id: "POD-F2", carrier: "fourpx" }); const s2 = r.body.id;
  await L.syncOrder({ ...(await findRecord("carrier_shipments", s2)), status: "exception" }, "test"); o = await findRecord("orders", "POD-F2"); assert.equal(o.logistics_flag, "exception"); assert.equal(o.status, "Label created");
  await updateRecord("carrier_shipments", s2, { status: "created" });
  r = await call("POST", `/api/saas/carriers/shipments/${s2}/cancel`); assert.equal(r.status, 200);
  o = await findRecord("orders", "POD-F2"); assert.equal(o.status, "Ready to ship"); assert.equal(o.tracking_number, ""); assert.equal(o.shipment_id, "");
  r = await call("POST", "/api/saas/carriers/shipments", { order_id: "POD-F2", carrier: "fourpx" }); const s3 = r.body.id;
  r = await call("POST", "/api/saas/orders/POD-F2/status", { status: "Cancelled" }); assert.equal(r.status, 200); assert.equal(r.body.logistics.cancelled, true);
  assert.equal((await findRecord("carrier_shipments", s3)).status, "cancelled"); assert.equal((await findRecord("orders", "POD-F2")).status, "Cancelled");

  // CSV export + bulk labels ZIP
  r = await call("GET", "/api/saas/carriers/shipments/export.csv"); assert.match(r.ct, /text\/csv/); assert.match(r.body.toString(), /tracking_number/);
  r = await call("GET", `/api/saas/carriers/shipments/labels.zip?ids=${sid}`); assert.equal(r.status, 200); assert.equal(r.body.subarray(0, 2).toString(), "PK");

  // Excel bulk: template → preview (one invalid parcel) → commit → results workbook
  r = await call("GET", "/api/saas/carriers/bulk/template.xlsx"); const tpl = parseXlsx(r.body, "Shipments").rows; assert.match(String(tpl[0][0]), /order_ref \| 订单参考号/);
  const rows = [tpl[0], ...tpl.slice(1), ["BAD-1", "", "", "", "", "", "", "", "", "XX", "Card", "", 0, 0, "", 0, "dhl", ""]];
  const csv = rows.map(x => x.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  r = await fetch(base + "/api/saas/carriers/bulk/preview", { method: "POST", headers: { "x-admin-api-key": "k", "x-file-name": "b.csv", "Content-Type": "application/octet-stream" }, body: csv }).then(x => x.json());
  assert.equal(r.parcels, 3); assert.equal(r.valid, 2); assert.equal(r.invalid, 1);
  const p1 = r.rows.find(x => x.ref === "WEDAI-1001"); assert.equal(p1.item_lines, 2); assert.equal(p1.channel.auto, true);
  const p2 = r.rows.find(x => x.ref === "WEDAI-1002"); assert.equal(p2.channel.carrier, "fourpx"); assert.equal(p2.channel.product, "QC");
  assert.ok(r.rows.find(x => x.ref === "BAD-1").errors.length >= 4);
  assert.equal((await call("POST", "/api/saas/carriers/bulk/commit", { token: r.token }, { "x-action-approved": "" })).status, 409, "approval required");
  const c = await call("POST", "/api/saas/carriers/bulk/commit", { token: r.token }); assert.equal(c.body.created, 2); assert.equal(c.body.failed, 1);
  const res = await call("GET", `/api/saas/carriers/bulk/${r.token}/results.xlsx`); const out = parseXlsx(res.body).rows; assert.equal(out.length, 4); assert.ok(out.some(x => x[1] === "OK" && x[5]));

  // Rules off → checkout prices unchanged (no carrier on options)
  const q = await fetch(base + "/api/storefront/shipping/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cart: [{ name: "Menu card", product_id: "menu_card", quantity: 1 }], currency: "CHF", country: "DE" }) }).then(x => x.json());
  assert.ok(q.shipping_options.every(o => !o.carrier));
  console.log(JSON.stringify({ logistics_flow: "pass" }));
} finally { server.close(); }
process.exit(0);
