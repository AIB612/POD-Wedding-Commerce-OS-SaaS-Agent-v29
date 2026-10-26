// Guest "Find my order" (POST /api/orders/lookup): order number + e-mail → limited status info.
// Checks: correct pair works (case/whitespace-insensitive e-mail), every mismatch returns the SAME 404 body (no enumeration),
// no sensitive fields leak, per-order failure lock, per-IP rate limit, and the account page wiring.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-lookup-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
  APP_ENCRYPTION_KEY: "y".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com" });

const { createApp } = await import("./create-app.js");
const { addRecord } = await import("./saas-store.js");
const { resetOrderLookupLimits } = await import("./services/checkout-service.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const lookup = body => fetch(base + "/api/orders/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const result = {};
try {
  const now = new Date().toISOString();
  await addRecord("orders", { id: "POD-2026-LOOKUP0001", tenant_id: "tenant_demo", channel: "storefront", status: "Shipped", payment_status: "paid", paid_at: now, created_at: now,
    customer_email: "Anna.Muster@Example.com", customer_name: "Anna Muster", currency: "CHF", grand_total: 123.45, subtotal: 100,
    shipping_address: { name: "Anna Muster", address1: "Secretstrasse 1", city: "Basel", postal_code: "4057", country: "CH" },
    items: [{ name: "Menu card", product_id: "menu_card", quantity: 40, unit_price: 1.9, line_total: 76 }, { name: "Place card", quantity: 2, unit_price: 1, line_total: 2 }],
    delivery_estimate: { from: "2026-11-02", to: "2026-11-05" }, carrier: "Swiss Post", tracking_number: "99.00.1234", tracking_url: "https://track.example/99" });
  await addRecord("orders", { id: "POD-2026-LOOKUP0002", tenant_id: "tenant_demo", status: "Draft", payment_status: "pending", created_at: now, customer_email: "ben@example.com", items: [{ name: "Tee", quantity: 1 }] });

  // 1. Correct pair: limited status info only.
  let r = await lookup({ order: "POD-2026-LOOKUP0001", email: "  anna.muster@example.COM " });
  assert.equal(r.status, 200); assert.equal(r.headers.get("cache-control"), "private, no-store");
  const { order } = await r.json();
  assert.equal(order.id, "POD-2026-LOOKUP0001"); assert.equal(order.stage, "shipped"); assert.equal(order.payment_status, "paid");
  assert.equal(order.item_count, 42); assert.deepEqual(order.delivery_estimate, { from: "2026-11-02", to: "2026-11-05" });
  assert.deepEqual({ carrier: order.tracking.carrier, number: order.tracking.number, url: order.tracking.url, events: order.tracking.events }, { carrier: "Swiss Post", number: "99.00.1234", url: "https://track.example/99", events: [] });
  const raw = JSON.stringify(order);
  for (const secret of ["Secretstrasse", "Anna Muster", "Anna.Muster", "123.45", "grand_total", "shipping_address", "customer_email", "token"]) assert.ok(!raw.includes(secret), `leaks ${secret}`);
  r = await lookup({ order: "POD-2026-LOOKUP0002", email: "ben@example.com" });
  assert.equal((await r.json()).order.stage, "awaiting_payment");
  result.lookup_ok = "pass";

  // 2. Wrong e-mail, unknown order, malformed input → identical 404 answers (no way to tell which part was wrong).
  const bodies = [];
  for (const b of [{ order: "POD-2026-LOOKUP0001", email: "someone@example.com" }, { order: "POD-2099-NOPE", email: "anna.muster@example.com" },
    { order: "POD-2026-LOOKUP0001", email: "not-an-email" }, { order: "", email: "" }, { order: "../../etc", email: "a@b.co" }, {}]) {
    r = await lookup(b); assert.equal(r.status, 404, JSON.stringify(b)); bodies.push(await r.text());
  }
  assert.equal(new Set(bodies).size, 1, "all mismatches return the same body");
  assert.equal(JSON.parse(bodies[0]).error, "order_not_found");
  result.no_enumeration = "pass";

  // 3. Per-order failure lock (works across IPs, independent of whether the order exists): 5 failures → 429, also for the right e-mail.
  resetOrderLookupLimits();
  for (const id of ["POD-2026-LOOKUP0001", "POD-2099-GHOST"]) {
    for (let i = 0; i < 5; i++) assert.equal((await lookup({ order: id, email: `wrong${i}@example.com` })).status, 404);
    r = await lookup({ order: id, email: "anna.muster@example.com" }); assert.equal(r.status, 429, id); assert.equal((await r.json()).error, "too_many_attempts");
  }
  resetOrderLookupLimits();
  assert.equal((await lookup({ order: "POD-2026-LOOKUP0001", email: "anna.muster@example.com" })).status, 200, "lock clears after the window");
  result.per_order_lock = "pass";

  // 4. Per-IP rate limit (10 / 15 min).
  process.env.RATE_LIMIT_DISABLED = "false"; resetOrderLookupLimits();
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await lookup({ order: `POD-X-${i}`, email: "x@example.com" })).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(404)); assert.equal(codes[10], 429);
  process.env.RATE_LIMIT_DISABLED = "true";
  result.ip_rate_limit = "pass";

  // 5. Front-end wiring: account page offers "Find my order"; header/footer link to it; GET is not an alternative entry point.
  const js = await (await fetch(base + "/account-app.js")).text();
  assert.match(js, /\/api\/orders\/lookup/); assert.match(js, /find-order/);
  assert.match(await (await fetch(base + "/footer.js")).text(), /\/account#find-order/);
  assert.match(await (await fetch(base + "/header.js")).text(), /\/account#find-order/);
  assert.equal((await fetch(base + "/api/orders/lookup?order=POD-2026-LOOKUP0001&email=anna.muster@example.com")).status, 404);
  result.frontend_wiring = "pass";
} finally {
  server.close();
}
console.log(JSON.stringify(result, null, 2));
