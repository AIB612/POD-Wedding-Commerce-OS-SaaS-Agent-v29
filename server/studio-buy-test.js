// Studio "Add to cart" → checkout → order: admin price list as single source of truth, cart line shape,
// project ownership, design carried onto order items, confirmation token, transactional e-mails, 400 on bad ids.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-buy-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
  APP_ENCRYPTION_KEY: "x".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com", PAYPAL_CLIENT_ID: "CID", PAYPAL_CLIENT_SECRET: "SEC" });
for (const k of ["SENDGRID_API_KEY", "POSTMARK_SERVER_TOKEN"]) delete process.env[k];

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { createApp } = await import("./create-app.js");
const { seedDemo } = await import("./account-demo.js");
const { findRecord, updateRecord, getState } = await import("./saas-store.js");
const { seedPriceList } = await import("./services/price-list-service.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const demo = await seedDemo("tenant_demo");
const realFetch = globalThis.fetch;
const as = tok => (p, o = {}) => realFetch(base + p, { ...o, headers: { ...(tok ? { Cookie: `pod_session=${tok}` } : {}), ...(o.body ? { "Content-Type": "application/json" } : {}), ...(o.headers || {}) } });
const me = as(demo.token), other = as(demo.otherToken), anon = as(null);
const admin = (p, o = {}) => anon(p, { ...o, headers: { "x-admin-api-key": "k", "x-action-approved": "true", ...(o.headers || {}) } });
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const r2 = n => Math.round(n * 100) / 100;
const result = {};

// Browser view of prices: studio-data.js + /price-list.js + studio-pricing.js, exactly as studio.html / index.html load them.
async function browserPricing() {
  const ctx = { window: {} }; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "studio-data.js"), "utf8"), ctx);
  ctx.STUDIO_DATA = ctx.window.STUDIO_DATA;
  const js = await (await anon("/price-list.js")).text();
  vm.runInContext(js, ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "studio-pricing.js"), "utf8"), ctx);
  const D = ctx.window.STUDIO_DATA, P = ctx.StudioPricing;
  assert.ok(D.price_list?.products?.tee, "price list attached to STUDIO_DATA");
  return {
    studio: (market, items) => P.quote(D, { market, margin: 0.4, items }),            // studio.js quoteFinal (consumer)
    homeFrom: pid => P.quote(D, { market: "EU", margin: 0.4, items: [{ product_id: pid, qty: 1 }] }).lines[0].price // index.html retailFrom
  };
}
const quote = (body, who = anon) => who("/api/storefront/shipping/quote", { method: "POST", body: JSON.stringify(body) });

let sent = null;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith(base)) return realFetch(url, opts);
  if (u.endsWith("/v1/oauth2/token")) return Response.json({ access_token: "tok", expires_in: 3600 });
  if (u.endsWith("/v2/checkout/orders")) { sent = JSON.parse(opts.body); return Response.json({ id: "PP-BUY-" + Math.random().toString(36).slice(2, 8), links: [{ rel: "payer-action", href: "https://paypal.test/approve" }] }); }
  if (/\/v2\/checkout\/orders\/[^/]+\/capture$/.test(u)) return Response.json({ status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP-BUY" }] } }] });
  throw new Error("unexpected fetch " + u);
};
const ship = { name: "Lena Meier", address1: "Seefeldstrasse 42", city: "Zürich", postal_code: "8008", country: "CH", phone: "+41 79 123 45 67" };
const pay = (cart, who = me, extra = {}) => who("/api/payments/paypal/create", { method: "POST", body: JSON.stringify({ cart, customer: { name: "Lena Meier", email: "lena.meier@example.com" }, shipping: ship, shipping_method: "standard", ...extra }) });

try {
  // 1. Seeded price list == previous retail formula (nothing changes until edited).
  const seed = seedPriceList();
  const prices = await (await admin("/api/saas/prices")).json();
  assert.ok(prices.rows.length >= 97); assert.deepEqual(prices.tiers, [1, 10, 25, 50, 100]); assert.deepEqual(prices.currencies, ["CHF", "EUR"]);
  const tee = prices.rows.find(r => r.product_id === "tee" && r.material_id === "organic_180");
  assert.deepEqual(tee.prices, tee.seed); assert.deepEqual(tee.prices.CHF, seed.products.tee.organic_180.CHF);
  assert.equal((await anon("/api/saas/prices")).status, 401, "admin key required");
  assert.equal((await anon("/api/saas/prices", { method: "PUT", body: JSON.stringify({ changes: [] }) })).status, 401);
  result.price_list_seeded = "pass";

  // 2. Price consistency: studio display = drawer = checkout = PayPal charge (CHF + EUR), and homepage "From".
  const samples = [{ product_id: "tee", qty: 12, material_id: "heavy_240" }, { product_id: "invitation", qty: 30, material_id: "pearl" }, { product_id: "mug", qty: 1 }];
  async function assertConsistent(label) {
    const B = await browserPricing();
    for (const [country, market, cur] of [["CH", "CH", "CHF"], ["DE", "EU", "EUR"]]) {
      const st = B.studio(market, samples);
      const cart = samples.map(s => ({ product_id: s.product_id, quantity: s.qty, material_id: s.material_id }));
      const drawer = await (await quote({ cart, country, shipping_method: "standard" })).json();                // cart.js fetchQuote
      const checkout = await (await quote({ cart, country, postal_code: "8008", shipping_method: "standard" })).json();
      assert.equal(drawer.currency, cur);
      st.lines.forEach((l, i) => { assert.equal(drawer.items[i].unit_price, l.price, `${label} ${cur} ${l.product_id} drawer vs studio`); assert.equal(checkout.items[i].line_total, l.line_revenue, `${label} checkout line`); });
      assert.equal(drawer.subtotal, st.totals.revenue, `${label} ${cur} drawer subtotal`); assert.equal(checkout.subtotal, st.totals.revenue);
      const co = await (await pay(cart, anon, { shipping: { ...ship, country, postal_code: country === "DE" ? "10115" : "8008", city: country === "DE" ? "Berlin" : "Zürich" } })).json();
      const pu = sent.purchase_units[0];
      assert.equal(pu.amount.currency_code, cur); assert.equal(Number(pu.amount.breakdown.item_total.value), st.totals.revenue, `${label} ${cur} PayPal item_total`);
      assert.equal(Number(pu.amount.value), co.total); assert.equal(co.total, checkout.grand_total);
      pu.items.forEach((it, i) => assert.equal(Number(it.unit_amount.value), st.lines[i].price));
    }
    return B;
  }
  let B = await assertConsistent("seed");
  assert.equal(B.homeFrom("tee"), seed.products.tee.organic_180.EUR[0], "homepage From = EUR tier 1 list price");
  result.price_consistency = "pass";

  // 3. Admin edits propagate everywhere (studio, homepage From, drawer, checkout, charge).
  let r = await admin("/api/saas/prices", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes: [
    { product_id: "tee", material_id: "heavy_240", currency: "CHF", prices: [29.5, 27.5, 25, 23, 21] },
    { product_id: "tee", material_id: "organic_180", currency: "EUR", prices: [19.9, 18.9, 17.9, 16.9, 15.9] },
    { product_id: "mug", material_id: (await (await admin("/api/saas/prices")).json()).rows.find(x => x.product_id === "mug").material_id, currency: "EUR", prices: [21, 20, 19, 18, 17] }] }) });
  assert.equal(r.status, 200, await r.clone().text()); assert.equal((await r.json()).version, 2);
  B = await assertConsistent("edited");
  assert.equal(B.homeFrom("tee"), 19.9);
  const dq = await (await quote({ cart: [{ product_id: "tee", quantity: 12, material_id: "heavy_240" }], country: "CH" })).json();
  assert.equal(dq.items[0].unit_price, 27.5, "tier 10–24 edited CHF price");
  r = await admin("/api/saas/prices", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes: [{ product_id: "tee", material_id: "organic_180", currency: "CHF", prices: [0, 1, 1, 1, 1] }] }) });
  assert.equal(r.status, 400);
  r = await admin("/api/saas/prices", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes: [{ product_id: "nope", material_id: "x", currency: "CHF", prices: [1, 1, 1, 1, 1] }] }) });
  assert.equal(r.status, 400);
  const persisted = JSON.parse(JSON.stringify((await getState()).price_lists.find(x => x.id === "price_list_default")));
  assert.equal(persisted.products.tee.heavy_240.CHF[0], 29.5, "persisted in the data store");
  result.admin_edits_propagate = "pass";

  // 4. Studio add-to-cart: project saved server-side + mockup thumb stored server-side; cart line shape.
  const proj = { buyer_type: "individual", market: "CH", fulfillment: { mode: "bulk", address_country: "CH" }, design_data_url: PNG, design_meta: { name: "logo", width: 3000, height: 3000 },
    items: [{ product_id: "tee", qty: 3, material_id: "heavy_240", sizes: { M: 2, L: 1 }, placement: { mode: "contain", scale: 1 } }, { product_id: "mug", qty: 2 }] };
  r = await me("/api/studio/projects", { method: "POST", body: JSON.stringify(proj) });
  assert.equal(r.status, 200); const p = await r.json();
  r = await me(`/api/studio/projects/${p.id}/mockup/tee`, { method: "PUT", body: JSON.stringify({ data_url: PNG }) });
  assert.equal(r.status, 200); const thumb = (await r.json()).url; assert.equal(thumb, `/api/studio/projects/${p.id}/mockup/tee`);
  assert.equal((await other(`/api/studio/projects/${p.id}/mockup/tee`, { method: "PUT", body: JSON.stringify({ data_url: PNG }) })).status, 403, "only the owner stores mockups");
  assert.equal((await me(`/api/studio/projects/${p.id}/mockup/bag_not_in_project`, { method: "PUT", body: JSON.stringify({ data_url: PNG }) })).status, 400);
  r = await me(thumb); assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/png");
  assert.equal((await anon(thumb)).status, 401); assert.equal((await other(thumb)).status, 403);
  assert.ok(!fs.readdirSync(path.join(tmp, ".private-studio")).some(f => f.endsWith(".png")), "mockups encrypted at rest, not plain files");
  // Line shape produced by studio.js addToCart() and sent by cart.js / checkout.js.
  const sjs = fs.readFileSync(path.join(root, "studio.js"), "utf8"), cjs = fs.readFileSync(path.join(root, "cart.js"), "utf8"), kjs = fs.readFileSync(path.join(root, "checkout.js"), "utf8");
  const shape = /lines\.push\(\{ id: `sp-\$\{saved\.id\}-\$\{l\.product_id\}`, productId: l\.product_id, [^]*?materialId: l\.material_id[^]*?sizes, projectId: saved\.id, thumb/;
  assert.match(sjs, shape); assert.match(sjs, /window\.PODCart\.open\(\)/); assert.match(sjs, /blockReasons\(\)/); assert.match(sjs, /mockup\/\$\{encodeURIComponent\(l\.product_id\)\}`, \{ method: "PUT"/);
  for (const src of [cjs, kjs]) assert.match(src, /project_id: ?i\.projectId ?\|\| ?undefined, ?sizes: ?i\.sizes ?\|\| ?undefined/);
  assert.match(cjs, /studio\.html\?project="\+encodeURIComponent\(i\.projectId\)/, "Edit reopens the studio project");
  const line = { product_id: "tee", quantity: 3, material_id: "heavy_240", project_id: p.id, sizes: { M: 2, L: 1 } };
  result.add_to_cart_line_shape = "pass";

  // 5. Ownership / validity of project_id.
  const err = async (res, status, code) => { assert.equal(res.status, status); assert.equal((await res.json()).error, code); };
  await err(await pay([line], other), 403, "project_forbidden");
  await err(await pay([line], anon), 403, "project_forbidden");
  await err(await pay([{ ...line, project_id: "sp_00000000000000000000" }], me), 400, "project_not_found");
  await err(await pay([{ ...line, project_id: "../../etc" }], me), 400, "invalid_project");
  await err(await pay([{ ...line, product_id: "invitation", material_id: undefined, sizes: undefined }], me), 400, "project_product_mismatch");
  await err(await pay([{ ...line, sizes: { M: 1 } }], me), 400, "size_mismatch");
  const expired = (await me("/api/studio/projects", { method: "POST", body: JSON.stringify(proj) }).then(x => x.json())).id;
  await updateRecord("studio_projects", expired, { expires_at: new Date(Date.now() - 1000).toISOString() });
  await err(await pay([{ ...line, project_id: expired }], me), 400, "project_not_found");
  result.project_ownership = "pass";

  // 6. Unknown / malformed product ids → 400 (never 500).
  for (const bad of [[{ product_id: "does-not-exist", quantity: 1 }], [null], ["x"], [{ product_id: "tee", quantity: 0 }], [{ sku: "NOPE", quantity: 1 }]]) {
    const q1 = await quote({ cart: bad, country: "CH" }); assert.equal(q1.status, 400, JSON.stringify(bad));
    const q2 = await pay(bad, me); assert.equal(q2.status, 400, JSON.stringify(bad));
  }
  result.unknown_product_400 = "pass";

  // 7. Order items carry the design; capture marks the project ordered (90 days) and sends the itemised confirmation.
  const cartLines = [line, { product_id: "mug", quantity: 2, project_id: p.id }];
  const co = await (await pay(cartLines, me)).json();
  assert.ok(co.order_id && /^[a-f0-9]{40}$/.test(co.order_token));
  let order = await findRecord("orders", co.order_id);
  const it = order.items[0];
  assert.equal(it.studio_project_id, p.id); assert.equal(it.design_url, `/api/studio/projects/${p.id}/design`);
  assert.deepEqual(it.sizes, { M: 2, L: 1 }); assert.equal(it.placement.mode, "contain"); assert.equal(it.thumb_url, thumb);
  assert.equal(order.items[1].studio_project_id, p.id); assert.equal(order.items[1].thumb_url, "", "no mockup stored for mug");
  assert.equal(it.unit_price, 29.5, "tee heavy_240 CHF 1–9 tier = edited list price"); assert.equal(order.subtotal, sent.purchase_units[0].amount.breakdown.item_total.value * 1);
  const ret = await anon(`/api/payments/paypal/return?order=${co.order_id}&token=${order.paypal_order_id}`, { redirect: "manual" });
  assert.equal(ret.status, 302); assert.match(ret.headers.get("location"), new RegExp(`payment-success\\.html\\?order=${co.order_id}&t=${co.order_token}&status=COMPLETED`));
  order = await findRecord("orders", co.order_id); assert.equal(order.payment_status, "paid");
  const pr = await findRecord("studio_projects", p.id);
  assert.equal(pr.status, "ordered"); assert.equal(pr.order_id, co.order_id);
  assert.ok(Date.parse(pr.expires_at) - Date.now() > 89 * 864e5, "retention extended to 90 days");
  const mail = (await getState()).notifications.find(n => n.related_id === co.order_id && n.type === "order_confirmation");
  assert.ok(mail, "confirmation e-mail logged"); assert.equal(mail.status, "not_configured", "no provider → graceful no-op");
  result.order_items_carry_design = "pass";

  // 8. Confirmation endpoint: signed token required; thumbs reachable with the order token.
  await err(await anon(`/api/orders/${co.order_id}/confirmation?t=${"0".repeat(40)}`), 403, "invalid_token");
  await err(await anon(`/api/orders/${co.order_id}/confirmation`), 403, "invalid_token");
  const conf = await (await anon(`/api/orders/${co.order_id}/confirmation?t=${co.order_token}`)).json();
  assert.equal(conf.id, co.order_id); assert.equal(conf.items.length, 2); assert.equal(conf.totals.grand_total, order.grand_total);
  assert.equal(conf.shipping_address.city, "Zürich"); assert.deepEqual(conf.timeline.map(s => s.id), ["paid", "proof", "production", "shipping"]); assert.equal(conf.timeline[0].done, true);
  assert.ok(!("tenant_id" in conf) && !("paypal_order_id" in conf) && !conf.items[0].design_url);
  r = await anon(conf.items[0].thumb_url); assert.equal(r.status, 200, "thumb via order token");
  assert.equal((await anon(`${thumb}?ot=${"1".repeat(40)}`)).status, 401);
  assert.equal((await anon("/payment-success.html")).status, 200); assert.match(await (await anon("/payment-success.html")).text(), /\/confirmation\?t=/);
  result.confirmation_token = "pass";

  // 9. E-mail templates: itemised confirmation with absolute URLs; shipped-with-tracking hook.
  const { renderTemplate } = await import("./services/email-service.js");
  const { sendOrderConfirmation } = await import("./services/checkout-service.js");
  let captured = null;
  process.env.SENDGRID_API_KEY = "SG.test";
  globalThis.fetch = async (url, opts = {}) => { if (String(url).includes("sendgrid")) { captured = JSON.parse(opts.body); return new Response("", { status: 202 }); } return realFetch(url, opts); };
  const sentMail = await sendOrderConfirmation(order);
  assert.equal(sentMail.status, "sent");
  const html = captured.content.find(c => c.type === "text/html").value, text = captured.content.find(c => c.type === "text/plain").value;
  assert.match(html, new RegExp(`https://shop\\.example\\.com/payment-success\\.html\\?order=${co.order_id}&amp;t=${co.order_token}`));
  assert.match(html, /Organic cotton tee/); assert.match(html, /M×2, L×1/); assert.match(html, /CHF 88\.50/); assert.match(text, /https:\/\/shop\.example\.com\/account\.html/);
  assert.ok(!/href="\//.test(html), "no relative links");
  r = await admin(`/api/saas/orders/${co.order_id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Shipped", carrier: "Swiss Post", tracking_number: "99.00.123456.78901234", tracking_url: "https://service.post.ch/track?n=99" }) });
  assert.equal(r.status, 200); assert.equal((await r.json()).email_status, "sent");
  assert.equal(captured.subject, `Your order has shipped · ${co.order_id}`); assert.match(captured.content[1].value, /99\.00\.123456\.78901234/); assert.match(captured.content[1].value, /https:\/\/service\.post\.ch/);
  delete process.env.SENDGRID_API_KEY;
  const t = await renderTemplate("order-shipped", { order_id: "X", tracking_number: "" }); assert.ok(!/Tracking number/.test(t.html), "empty sections hidden");
  result.transactional_emails = "pass";

  // 10. Checkout is 4 steps with the withdrawal note; drawer shows VAT as computed (no "Incl. VAT" claim).
  const chtml = await (await anon("/checkout.html")).text();
  for (const s of ["step1", "step2", "step3", "step4"]) assert.match(chtml, new RegExp(`id="${s}"`));
  assert.match(chtml, /right of withdrawal/); assert.match(chtml, /Pay securely/);
  const i18n = fs.readFileSync(path.join(root, "i18n.js"), "utf8"); assert.doesNotMatch(i18n, /Incl\. VAT where applicable/); assert.match(cjs, /cartVat/);
  result.checkout_4_steps = "pass";
} finally { globalThis.fetch = realFetch; server.close(); }
console.log(JSON.stringify(result, null, 2));
process.exit(0);
