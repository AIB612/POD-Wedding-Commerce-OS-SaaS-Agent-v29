// Promo codes: admin CRUD (admin key), server-side validation (percent / fixed CHF·EUR, expiry, min order,
// usage limit, active flag), not stackable, applied after volume tiers on the subtotal, VAT on the discounted
// amount, PayPal breakdown discount, usage counted only on paid capture (once).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-promo-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
  APP_ENCRYPTION_KEY: "x".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com", PAYPAL_CLIENT_ID: "CID", PAYPAL_CLIENT_SECRET: "SEC" });
for (const k of ["SENDGRID_API_KEY", "POSTMARK_SERVER_TOKEN"]) delete process.env[k];

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { createApp } = await import("./create-app.js");
const { findRecord } = await import("./saas-store.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;
const r2 = n => Math.round(n * 100) / 100;
const anon = (p, o = {}) => realFetch(base + p, { ...o, headers: { ...(o.body ? { "Content-Type": "application/json" } : {}), ...(o.headers || {}) } });
const admin = (p, o = {}) => anon(p, { ...o, headers: { "x-admin-api-key": "k", "x-action-approved": "true", ...(o.headers || {}) } });
const json = b => ({ body: JSON.stringify(b) });
let sent = null, captures = 0;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith(base)) return realFetch(url, opts);
  if (u.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "tok", expires_in: 3600 });
  if (u.endsWith("/v2/checkout/orders")) { sent = JSON.parse(opts.body); return Response.json({ id: "PP-PROMO-" + Math.random().toString(36).slice(2, 8), links: [{ rel: "payer-action", href: "https://paypal.test/approve" }] }); }
  if (/\/capture$/.test(u)) { captures++; return Response.json({ status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP-P" + captures }] } }] }); }
  throw new Error("unexpected fetch " + u);
};
const cart = [{ product_id: "invitation", quantity: 30, material_id: "pearl" }, { product_id: "mug", quantity: 2 }];
const ship = { name: "Lena", address1: "Seefeldstrasse 42", city: "Zürich", postal_code: "8008", country: "CH" };
const quote = (extra = {}) => anon("/api/storefront/shipping/quote", { method: "POST", ...json({ cart, country: "CH", postal_code: "8008", ...extra }) });
const pay = (extra = {}) => anon("/api/payments/paypal/create", { method: "POST", ...json({ cart, customer: { name: "Lena", email: "lena@example.com" }, shipping: ship, shipping_method: "standard", ...extra }) });
const err = async (res, status, code) => { assert.equal(res.status, status); assert.equal((await res.json()).error, code); };
const result = {};
try {
  // 1. Admin CRUD requires the admin key; validation.
  assert.equal((await anon("/api/saas/promos")).status, 401);
  assert.equal((await anon("/api/saas/promos", { method: "POST", ...json({ code: "X10", type: "percent", value: 10 }) })).status, 401);
  await err(await admin("/api/saas/promos", { method: "POST", ...json({ code: "x", type: "percent", value: 10 }) }), 400, "invalid_code");
  await err(await admin("/api/saas/promos", { method: "POST", ...json({ code: "BAD150", type: "percent", value: 150 }) }), 400, "invalid_value");
  await err(await admin("/api/saas/promos", { method: "POST", ...json({ code: "NOAMT", type: "fixed", amounts: { CHF: 0, EUR: 0 } }) }), 400, "invalid_value");
  const mk = async b => { const r = await admin("/api/saas/promos", { method: "POST", ...json(b) }); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
  const p10 = await mk({ code: "wedding10", type: "percent", value: 10 });
  assert.equal(p10.code, "WEDDING10"); assert.equal(p10.used_count, 0); assert.equal(p10.active, true);
  await err(await admin("/api/saas/promos", { method: "POST", ...json({ code: "WEDDING10", type: "percent", value: 5 }) }), 409, "code_exists");
  const fix = await mk({ code: "FIX15", type: "fixed", amounts: { CHF: 15, EUR: 12 }, min_order: { CHF: 50, EUR: 40 } });
  const once = await mk({ code: "ONCE", type: "percent", value: 20, usage_limit: 1 });
  const old = await mk({ code: "OLD", type: "percent", value: 5, expires_at: "2020-01-01T00:00:00Z" });
  const off = await mk({ code: "OFF", type: "percent", value: 5, active: false });
  const big = await mk({ code: "BIGMIN", type: "percent", value: 5, min_order: { CHF: 99999, EUR: 99999 } });
  const eurOnly = await mk({ code: "EURONLY", type: "fixed", amounts: { EUR: 5 } });
  let r = await admin(`/api/saas/promos/${fix.id}`, { method: "PUT", ...json({ description: "Spring" }) }); assert.equal(r.status, 200);
  assert.equal((await (await admin("/api/saas/promos")).json()).promos.length, 7);
  r = await admin(`/api/saas/promos/${big.id}`, { method: "DELETE" }); assert.equal(r.status, 200);
  assert.equal((await (await admin("/api/saas/promos")).json()).promos.length, 6);
  result.admin_crud = "pass";

  // 2. Server validation of every rule.
  const base0 = await (await quote()).json();
  await err(await quote({ promo_code: "NOPE" }), 400, "promo_invalid");
  await err(await quote({ promo_code: "OFF" }), 400, "promo_invalid");
  await err(await quote({ promo_code: "OLD" }), 400, "promo_expired");
  await err(await quote({ promo_code: "EURONLY" }), 400, "promo_currency");
  await err(await anon("/api/storefront/shipping/quote", { method: "POST", ...json({ cart: [{ product_id: "mug", quantity: 1 }], country: "CH", promo_code: "FIX15" }) }), 400, "promo_min_order");
  result.validation = "pass";

  // 3. Percent after volume tiers on the subtotal; VAT on the discounted amount; lower-case accepted.
  const q = await (await quote({ promo_code: " wedding10 " })).json();
  assert.equal(q.subtotal, base0.subtotal, "tiered subtotal unchanged"); assert.equal(q.items[0].unit_price, base0.items[0].unit_price);
  assert.deepEqual({ code: q.discount.code, amount: q.discount.amount }, { code: "WEDDING10", amount: r2(base0.subtotal * 0.1) });
  assert.equal(q.tax.amount, r2((q.subtotal - q.discount.amount + q.shipping_amount) * q.tax.rate));
  assert.equal(q.grand_total, r2(q.subtotal - q.discount.amount + q.shipping_amount + q.tax.amount));
  const qf = await (await quote({ promo_code: "FIX15" })).json(); assert.equal(qf.discount.amount, 15);
  const qe = await (await anon("/api/storefront/shipping/quote", { method: "POST", ...json({ cart, country: "DE", postal_code: "10115", promo_code: "FIX15" }) })).json();
  assert.equal(qe.currency, "EUR"); assert.equal(qe.discount.amount, 12, "fixed EUR amount");
  // Not stackable: a single promo_code field; arrays / comma lists are not valid codes.
  await err(await quote({ promo_code: "WEDDING10,FIX15" }), 400, "promo_invalid");
  result.discount_math = "pass";

  // 4. PayPal breakdown carries the discount; usage counted only on paid capture, once.
  const co = await (await pay({ promo_code: "ONCE" })).json();
  const pu = sent.purchase_units[0], o = await findRecord("orders", co.order_id);
  assert.equal(Number(pu.amount.breakdown.discount.value), o.discount_amount); assert.ok(o.discount_amount > 0);
  assert.equal(Number(pu.amount.value), r2(Number(pu.amount.breakdown.item_total.value) + Number(pu.amount.breakdown.shipping.value) + Number(pu.amount.breakdown.tax_total.value) - Number(pu.amount.breakdown.discount.value)));
  assert.equal(Number(pu.amount.value), o.grand_total); assert.equal(o.promo.code, "ONCE");
  assert.equal((await findRecord("promo_codes", once.id)).used_count, 0, "not counted before capture");
  // A second (unpaid) checkout can still use it; nothing counted for drafts / cancellations.
  const co2 = await (await pay({ promo_code: "ONCE" })).json();
  await anon(`/api/payments/paypal/cancel?order=${co2.order_id}&t=${co2.order_token}`, { redirect: "manual" });
  assert.equal((await findRecord("promo_codes", once.id)).used_count, 0);
  await anon(`/api/payments/paypal/return?order=${co.order_id}&token=${o.paypal_order_id}`, { redirect: "manual" });
  await anon(`/api/payments/paypal/return?order=${co.order_id}&token=${o.paypal_order_id}`, { redirect: "manual" });
  const { handlePayPalEvent } = await import("./services/checkout-service.js");
  await handlePayPalEvent({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-X", supplementary_data: { related_ids: { order_id: o.paypal_order_id } } } });
  assert.equal((await findRecord("promo_codes", once.id)).used_count, 1, "counted exactly once on capture");
  await err(await quote({ promo_code: "ONCE" }), 400, "promo_used_up");
  await err(await pay({ promo_code: "ONCE" }), 400, "promo_used_up");
  const conf = await (await anon(`/api/orders/${co.order_id}/confirmation?t=${co.order_token}`)).json();
  assert.equal(conf.totals.discount, o.discount_amount); assert.equal(conf.totals.promo_code, "ONCE");
  result.paypal_and_usage = "pass";

  // 5. UI wiring: Review step field + admin page linked in the admin menu.
  const chtml = fs.readFileSync(path.join(root, "checkout.html"), "utf8"), kjs = fs.readFileSync(path.join(root, "checkout.js"), "utf8");
  assert.match(chtml, /id="promo"/); assert.match(chtml, /data-i18n="co\.promoLabel">Discount code/); assert.match(kjs, /promo_code: state\.promo/);
  assert.ok(fs.readFileSync(path.join(root, "admin.html"), "utf8").includes('data-page="promos"'));
  for (const u of ["/admin-promos.html", "/admin/promos"]) { const rr = await anon(u, { redirect: "manual" }); assert.equal(rr.status, 302); assert.equal(rr.headers.get("location"), "/admin#promos"); }
  result.ui_wiring = "pass";
} finally { globalThis.fetch = realFetch; server.close(); }
console.log(JSON.stringify(result, null, 2));
process.exit(0);
