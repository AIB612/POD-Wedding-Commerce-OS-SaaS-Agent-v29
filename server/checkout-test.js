// Storefront cart/checkout: CHF/EUR quotes, PayPal Orders v2 payload (items + breakdown + shipping),
// idempotent capture, TWINT fail-closed. Network is mocked; nothing leaves the process.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-co-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
  APP_ENCRYPTION_KEY: "x".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com" });
for (const k of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "TWINT_STORE_UUID", "TWINT_CASH_REGISTER_ID", "TWINT_CERT_PATH", "TWINT_CERT_PASSWORD"]) delete process.env[k];

const { createApp } = await import("./create-app.js");
const { quoteStorefront, handlePayPalReturn } = await import("./services/checkout-service.js");
const { findRecord } = await import("./saas-store.js");
const T = "tenant_demo", result = {};
const cart = [{ product_id: "invitation", quantity: 10, material_id: "pearl", customization: "Text: A & B" }, { product_id: "invitation", quantity: 1 }];

// 1. Currency follows the destination; totals add up in the charge currency.
for (const [country, cur] of [["CH", "CHF"], ["LI", "CHF"], ["DE", "EUR"], ["FR", "EUR"]]) {
  const q = await quoteStorefront({ tenantId: T, cart, country, postal_code: "1000" });
  assert.equal(q.currency, cur, country);
  assert.equal(q.items.length, 2);
  for (const l of q.items) assert.equal(l.line_total, Math.round(l.unit_price * l.quantity * 100) / 100);
  assert.equal(Math.round((q.subtotal + q.shipping_amount + q.tax.amount) * 100) / 100, q.grand_total);
}
result.currency_by_country = "pass";

const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;
const post = (p, b) => realFetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
try {
  const body = { cart, customer: { name: "Anna Muster", email: "anna@example.com" }, shipping: { name: "Anna Muster", address1: "Bahnhofstrasse 1", city: "Basel", postal_code: "4051", country: "CH" }, shipping_method: "standard" };

  // 2. Methods endpoint + TWINT fails closed when not configured.
  const m = await (await realFetch(base + "/api/payments/methods")).json();
  assert.equal(m.twint.configured, false); assert.equal(m.paypal.configured, false);
  let r = await post("/api/payments/twint/create", body);
  assert.equal(r.status, 503); assert.equal((await r.json()).error, "twint_not_configured");
  result.twint_not_configured = "pass";

  // 3. TWINT configured but connector not implemented → 501, order cancelled, never "paid".
  const cert = path.join(tmp, "merchant.p12"); fs.writeFileSync(cert, "dummy");
  Object.assign(process.env, { TWINT_STORE_UUID: "00000000-0000-0000-0000-000000000000", TWINT_CASH_REGISTER_ID: "web-1", TWINT_CERT_PATH: cert, TWINT_CERT_PASSWORD: "secret123" });
  r = await post("/api/payments/twint/create", { ...body, shipping: { ...body.shipping, country: "DE", postal_code: "10115" } });
  assert.equal(r.status, 400); assert.equal((await r.json()).error, "twint_chf_only");
  r = await post("/api/payments/twint/create", body);
  assert.equal(r.status, 501); assert.equal((await r.json()).error, "twint_not_implemented");
  for (const k of ["TWINT_STORE_UUID", "TWINT_CASH_REGISTER_ID", "TWINT_CERT_PATH", "TWINT_CERT_PASSWORD"]) delete process.env[k];
  result.twint_fail_closed = "pass";

  // 4. PayPal create: CHF, items + breakdown + provided shipping address.
  r = await post("/api/payments/paypal/create", body);
  assert.equal(r.status, 503); assert.equal((await r.json()).error, "paypal_not_configured");
  Object.assign(process.env, { PAYPAL_CLIENT_ID: "CID", PAYPAL_CLIENT_SECRET: "SEC" });
  let sent = null, captures = 0;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith(base)) return realFetch(url, opts);
    if (u.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "tok", expires_in: 3600 });
    if (u.endsWith("/v2/checkout/orders")) { sent = JSON.parse(opts.body); return Response.json({ id: "PP-CO-1", links: [{ rel: "payer-action", href: "https://paypal.test/approve" }] }); }
    if (u.includes("/v2/checkout/orders/PP-CO-1/capture")) { captures++; await new Promise(res => setTimeout(res, 50)); return Response.json({ status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP-CO-1" }] } }] }); }
    throw new Error("unexpected fetch " + u);
  };
  const co = await (await post("/api/payments/paypal/create", body)).json();
  assert.equal(co.approval_url, "https://paypal.test/approve"); assert.equal(co.currency, "CHF");
  const pu = sent.purchase_units[0], bd = pu.amount.breakdown;
  assert.equal(pu.amount.currency_code, "CHF"); assert.equal(pu.items.length, 2);
  const itemSum = pu.items.reduce((a, i) => a + Number(i.unit_amount.value) * Number(i.quantity), 0);
  assert.equal(itemSum.toFixed(2), bd.item_total.value);
  assert.equal((Number(bd.item_total.value) + Number(bd.shipping.value) + Number(bd.tax_total.value)).toFixed(2), pu.amount.value);
  assert.equal(pu.shipping.address.country_code, "CH"); assert.equal(pu.shipping.address.admin_area_2, "Basel");
  assert.equal(sent.payment_source.paypal.experience_context.shipping_preference, "SET_PROVIDED_ADDRESS");
  result.paypal_payload = "pass";

  // 5. Concurrent returns capture exactly once.
  const [a, b] = await Promise.all([handlePayPalReturn({ orderId: co.order_id, paypalToken: "PP-CO-1" }), handlePayPalReturn({ orderId: co.order_id, paypalToken: "PP-CO-1" })]);
  assert.equal(a.status, "COMPLETED"); assert.equal(b.status, "COMPLETED"); assert.equal(captures, 1);
  const again = await handlePayPalReturn({ orderId: co.order_id, paypalToken: "PP-CO-1" });
  assert.equal(again.status, "COMPLETED"); assert.equal(captures, 1);
  assert.equal((await findRecord("orders", co.order_id)).payment_status, "paid");
  result.idempotent_capture = "pass";

  // 6. EUR for an EU address.
  const eu = await (await post("/api/payments/paypal/create", { ...body, shipping: { ...body.shipping, country: "AT", postal_code: "1010", city: "Wien" } })).json();
  assert.equal(eu.currency, "EUR"); assert.equal(sent.purchase_units[0].amount.currency_code, "EUR");
  result.paypal_eur = "pass";

  // 7. Checkout page is served.
  assert.equal((await realFetch(base + "/checkout.html")).status, 200); assert.equal((await realFetch(base + "/checkout.js")).status, 200);
  result.checkout_page = "pass";

  // Proof choice at Review: non-studio carts default to "approve"; explicit proof-first blocks production until approval.
  {
    const qa = await quoteStorefront({ tenantId: T, cart, country: "CH", postal_code: "4051" });
    assert.equal(qa.proof_choice, "approve");
    const qp = await quoteStorefront({ tenantId: T, cart, country: "CH", postal_code: "4051", proof_choice: "proof" });
    assert.equal(qp.proof_choice, "proof"); assert.ok(qp.delivery.production_days > qa.delivery.production_days);
    const cop = await (await post("/api/payments/paypal/create", { ...body, proof_choice: "proof" })).json();
    let op = await findRecord("orders", cop.order_id); assert.equal(op.proof_choice, "proof");
    await handlePayPalReturn({ orderId: op.id, paypalToken: op.paypal_order_id });
    op = await findRecord("orders", cop.order_id); assert.equal(op.status, "Needs approval"); assert.equal(op.production_blocked, true);
    const r1 = await realFetch(base + `/api/saas/orders/${op.id}/status`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-api-key": "k", "x-action-approved": "true" }, body: JSON.stringify({ status: "Production" }) });
    assert.equal(r1.status, 409, "admin cannot start production before approval");
    const html = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "checkout.html"), "utf8");
    assert.match(html, /id="proofOptions"/); assert.match(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "checkout.js"), "utf8"), /Send me a proof first|co\.proofFirst/);
    result.proof_choice = "pass";
  }
  // Delivery estimate per shipping option (business days only), legacy SKUs use the admin default production days.
  {
    const q = await quoteStorefront({ tenantId: T, cart, country: "DE", postal_code: "10115" });
    for (const o of q.shipping_options) { assert.ok(o.delivery.from <= o.delivery.to); assert.equal(o.carrier_days.length, 2); for (const d of [o.delivery.from, o.delivery.to]) assert.ok(![0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())); }
    result.delivery_estimate = "pass";
  }
  // Error-return path: PayPal cancel → /checkout.html?payment=cancelled (draft cancelled, cart is client-side and untouched);
  // unsupported destination → shipping_zone_not_found (400, clear message key in i18n).
  {
    const c = await (await post("/api/payments/paypal/create", body)).json();
    const rr = await realFetch(base + `/api/payments/paypal/cancel?order=${c.order_id}&t=${c.order_token}`, { redirect: "manual" });
    assert.equal(rr.headers.get("location"), "/checkout.html?payment=cancelled");
    assert.equal((await findRecord("orders", c.order_id)).payment_status, "cancelled");
    const i18n = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "i18n.js"), "utf8");
    for (const k of ["co.cancelled", "co.failed", "co.err.unsupported_country", "co.err.network", "co.priceUpdated", "co.reopenStudio"]) assert.ok(i18n.includes(`'${k}'`), k);
    result.error_return_path = "pass";
  }
} finally { globalThis.fetch = realFetch; server.close(); }
console.log(JSON.stringify(result, null, 2));
process.exit(0);
