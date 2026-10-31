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
const ppMock = globalThis.fetch;
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
  // Proof-first (default for studio lines): shipping is blocked until the customer approves the proof.
  assert.equal(order.status, "Needs approval"); assert.equal(order.production_blocked, true);
  r = await admin(`/api/saas/orders/${co.order_id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Shipped" }) });
  assert.equal(r.status, 409); assert.equal((await r.json()).error, "proof_approval_required");
  { const pf = (await getState()).proofs.find(x => x.order_id === co.order_id);
    assert.equal((await admin(`/api/saas/proofs/${pf.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proof_url: "/assets/proof.png" }) })).status, 200);
    assert.equal((await anon(`/api/proofs/public/${pf.token}/approve`, { method: "POST" })).status, 200);
    assert.equal((await findRecord("orders", co.order_id)).production_blocked, false); }
  // "Notify customers on order status change" is OFF by default → manual status change stores a draft, sends nothing.
  { const sent0 = captured; captured = null;
    r = await admin(`/api/saas/orders/${co.order_id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Production" }) });
    assert.equal(r.status, 200); assert.equal((await r.json()).email_status, "draft"); assert.equal(captured, null, "no e-mail while notifications are off");
    assert.ok((await getState()).notifications.some(n => n.related_id === co.order_id && n.status === "draft" && n.type === "order_status"));
    captured = sent0;
    const { saveSettings, getSettings } = await import("./logistics/index.js");
    assert.equal((await getSettings("tenant_demo")).notify_customer_on_status, false);
    assert.equal((await saveSettings("tenant_demo", { notify_customer_on_status: true })).notify_customer_on_status, true); }
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

  globalThis.fetch = ppMock;
  // 11. Proof choice: "approve mockup" goes straight to production; proof-first is the default for studio lines.
  {
    const qd = await (await quote({ cart: cartLines, country: "CH" })).json();
    assert.equal(qd.proof_choice, "proof", "studio lines default to proof first");
    const qa = await (await quote({ cart: cartLines, country: "CH", proof_choice: "approve" })).json();
    assert.equal(qa.proof_choice, "approve");
    const p2 = await (await me("/api/studio/projects", { method: "POST", body: JSON.stringify(proj) })).json();
    const coA = await (await pay([{ ...line, project_id: p2.id }], me, { proof_choice: "approve" })).json();
    let oa = await findRecord("orders", coA.order_id); assert.equal(oa.proof_choice, "approve");
    await anon(`/api/payments/paypal/return?order=${coA.order_id}&token=${oa.paypal_order_id}`, { redirect: "manual" });
    oa = await findRecord("orders", coA.order_id);
    assert.equal(oa.status, "Production"); assert.equal(oa.production_blocked, false);
    assert.equal((await getState()).proofs.find(x => x.order_id === oa.id).status, "Approved");
    const cA = await (await anon(`/api/orders/${coA.order_id}/confirmation?t=${coA.order_token}`)).json();
    assert.equal(cA.proof_choice, "approve"); assert.equal(cA.timeline[1].done, true); assert.equal(cA.timeline[1].choice, "approve");
    const cP = await (await anon(`/api/orders/${co.order_id}/confirmation?t=${co.order_token}`)).json();
    assert.equal(cP.proof_choice, "proof");
    const det = await (await me(`/api/account/orders/${co.order_id}`)).json();
    assert.equal(det.order.proof_choice, "proof"); assert.ok(det.order.proof.approval_url.startsWith("/proof.html?token="));
    assert.equal(det.order.items[0].reopen_url, `/studio.html?project=${p.id}`); assert.equal(det.order.items[0].mockup, thumb);
    result.proof_choice = "pass";
  }

  // 12. Delivery estimate: production lead days (+ proof buffer) + carrier days, weekends skipped; stored on the order.
  {
    const { addBusinessDays } = await import("./services/fees-service.js");
    const qd = await (await quote({ cart: cartLines, country: "CH" })).json(), qa = await (await quote({ cart: cartLines, country: "CH", proof_choice: "approve" })).json();
    for (const o of qd.shipping_options) {
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(o.delivery.from) && o.delivery.from <= o.delivery.to);
      for (const d of [o.delivery.from, o.delivery.to]) assert.ok(![0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay()), "never a weekend");
      assert.equal(o.delivery.to, addBusinessDays(new Date(), o.delivery.production_days + o.carrier_days[1]));
    }
    const std = qd.shipping_options.find(o => o.id === "standard"), stdA = qa.shipping_options.find(o => o.id === "standard");
    assert.equal(std.delivery.production_days, stdA.delivery.production_days + 2, "proof buffer adds 2 business days");
    assert.equal(stdA.delivery.production_days, 2, "tee + mug from the Zürich facility (2 days)");
    assert.ok(qd.shipping_options.find(o => o.id === "express").delivery.to <= std.delivery.to);
    assert.ok((await findRecord("orders", co.order_id)).delivery_estimate.from);
    for (const f of ["cart.js", "checkout.js", "payment-success.html", "account-app.js"]) assert.match(fs.readFileSync(path.join(root, f), "utf8"), /PODDates/, f);
    assert.doesNotMatch(fs.readFileSync(path.join(root, "cart.js"), "utf8"), /Delivered in about 14 days/);
    result.delivery_estimate = "pass";
  }

  // 13. Error states: expired project warning in the quote, PayPal cancel → Review step, failed capture → Review step, price change → 409.
  {
    const qx = await (await quote({ cart: [{ ...line, project_id: expired }], country: "CH" })).json();
    assert.deepEqual(qx.line_warnings, [{ index: 0, code: "project_expired", project_id: expired }]);
    const p3 = await (await me("/api/studio/projects", { method: "POST", body: JSON.stringify(proj) })).json();
    const c3 = await (await pay([{ ...line, project_id: p3.id }], me)).json();
    let rr = await anon(`/api/payments/paypal/cancel?order=${c3.order_id}&t=${c3.order_token}`, { redirect: "manual" });
    assert.equal(rr.status, 302); assert.equal(rr.headers.get("location"), "/checkout.html?payment=cancelled");
    assert.equal((await findRecord("orders", c3.order_id)).status, "Cancelled");
    rr = await anon(`/api/payments/paypal/cancel?order=${co.order_id}&t=${"0".repeat(40)}`, { redirect: "manual" });
    assert.equal((await findRecord("orders", co.order_id)).payment_status, "paid", "bad token never cancels");
    rr = await anon(`/api/payments/paypal/return?order=NOPE&token=x`, { redirect: "manual" });
    assert.equal(rr.headers.get("location"), "/checkout.html?payment=failed");
    const okQ = await (await quote({ cart: [{ ...line, project_id: p3.id }], country: "CH", postal_code: "8008" })).json();
    rr = await pay([{ ...line, project_id: p3.id }], me, { expected_total: okQ.grand_total + 1 });
    await err(rr, 409, "price_changed");
    assert.equal((await pay([{ ...line, project_id: p3.id }], me, { expected_total: okQ.grand_total })).status, 200);
    assert.match(sent.application_context?.cancel_url || JSON.stringify(sent), /\/api\/payments\/paypal\/cancel\?order=/);
    const kj = fs.readFileSync(path.join(root, "checkout.js"), "utf8");
    assert.match(kj, /payment"\)/); assert.match(kj, /co\.cancelled/); assert.match(kj, /redirecting = true/); assert.match(kj, /co\.err\.network|"network"/);
    result.error_return_path = "pass";
  }

  // 14. Guest studio path: guest cookie owns the project, guest checkout works, other guests / users are refused, sign-in claims it.
  {
    const gfetch = jar => (p, o = {}) => realFetch(base + p, { ...o, headers: { ...(jar.c ? { Cookie: jar.c } : {}), ...(o.body ? { "Content-Type": "application/json" } : {}), ...(o.headers || {}) } });
    const g1 = {}, G = gfetch(g1), G2 = gfetch({ c: "pod_guest=" + "a".repeat(48) });
    let rr = await G("/api/studio/projects", { method: "POST", body: JSON.stringify(proj) });
    assert.equal(rr.status, 200); const sc = rr.headers.get("set-cookie"); assert.match(sc, /pod_guest=[a-f0-9]{48}/); assert.match(sc, /HttpOnly/i);
    g1.c = sc.split(";")[0]; const gp = await rr.json();
    const stored = await findRecord("studio_projects", gp.id); assert.equal(stored.user_id, null); assert.ok(stored.guest_id && !sc.includes(stored.guest_id), "only a hash is stored");
    assert.equal((await G(`/api/studio/projects/${gp.id}/mockup/tee`, { method: "PUT", body: JSON.stringify({ data_url: PNG }) })).status, 200);
    assert.equal((await G(`/api/studio/projects/${gp.id}`)).status, 200);
    assert.equal((await G2(`/api/studio/projects/${gp.id}`)).status, 403, "another guest");
    assert.equal((await other(`/api/studio/projects/${gp.id}`)).status, 403, "a signed-in stranger");
    assert.equal((await anon(`/api/studio/projects/${gp.id}`)).status, 401);
    const gl = { ...line, project_id: gp.id };
    await err(await pay([gl], anon), 403, "project_forbidden");
    await err(await pay([gl], G2), 403, "project_forbidden");
    await err(await pay([gl], other), 403, "project_forbidden");
    rr = await G("/api/payments/paypal/create", { method: "POST", body: JSON.stringify({ cart: [gl], customer: { name: "Gast", email: "" }, shipping: ship, shipping_method: "standard" }) });
    await err(rr, 400, "invalid_email");
    rr = await pay([gl], G); assert.equal(rr.status, 200, "guest checkout of studio items");
    const go = await findRecord("orders", (await rr.json()).order_id); assert.equal(go.user_id, null); assert.equal(go.items[0].studio_project_id, gp.id);
    // Sign-in later: the guest's projects move to the account.
    const claimJar = { c: `${g1.c}; pod_session=${demo.otherToken}` };
    assert.equal((await gfetch(claimJar)(`/api/studio/projects/${gp.id}`)).status, 200);
    const claimed = await findRecord("studio_projects", gp.id); assert.equal(claimed.user_id, demo.other.id); assert.equal(claimed.guest_id, null);
    assert.equal((await G2(`/api/studio/projects/${gp.id}`)).status, 403); assert.equal((await me(`/api/studio/projects/${gp.id}`)).status, 403, "still not the first user's");
    assert.equal((await other(`/api/studio/projects/${gp.id}`)).status, 200, "now the account's project");
    assert.match(fs.readFileSync(path.join(root, "account-auth.js"), "utf8"), /auth\.guest/); assert.match(fs.readFileSync(path.join(root, "studio.js"), "utf8"), /require\?\.\(\{ guest: true \}\)/);
    result.guest_studio_path = "pass";
  }

  // 15. Fees & tax (admin): seeded = previous values; edits to VAT, shipping, packaging propagate to quote, PayPal, order, confirmation, e-mail.
  {
    assert.equal((await anon("/api/saas/fees")).status, 401);
    const f0 = await (await admin("/api/saas/fees")).json();
    assert.equal(f0.prices_include_vat, false); assert.equal(f0.tax.zones.zone_ch, 0.081); assert.equal(f0.packaging.insert_card.CHF, 0);
    assert.deepEqual(f0.shipping.zone_ch.standard.days, [2, 4]);
    const before = await (await quote({ cart: cartLines, country: "CH" })).json();
    assert.equal(before.packaging_amount, 0, "packaging seeded at 0 → nothing changes");
    const put = b => admin("/api/saas/fees", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    assert.equal((await put({ tax: { zones: { zone_ch: 2 } } })).status, 400, "validated");
    let rr = await put({ tax: { zones: { zone_ch: 0.077 } }, shipping: { zone_ch: { standard: { CHF: { base: 9.9, per_kg: 0, free_over: null }, days: [3, 5] } } }, packaging: { insert_card: { CHF: 0.5 }, sticker: { CHF: 0.2 } } });
    assert.equal(rr.status, 200, await rr.clone().text());
    const q1 = await (await quote({ cart: cartLines, country: "CH", postal_code: "8008", proof_choice: "approve" })).json();
    assert.equal(q1.tax.rate, 0.077); assert.equal(q1.shipping_amount, 9.9); assert.deepEqual(q1.shipping_options[0].carrier_days, [3, 5]);
    // proj.packaging = default ["insert_card","sticker"]? use the stored project packaging
    const pk = (await findRecord("studio_projects", p.id)).packaging || [];
    const unitTee = r2(pk.filter(x => ["insert_card", "sticker"].includes(x)).reduce((a, x) => a + ({ insert_card: 0.5, sticker: 0.2 })[x], 0));
    assert.equal(q1.items[0].packaging?.unit_price || 0, unitTee);
    const expPack = r2(q1.items.reduce((a, l) => a + (l.packaging?.amount || 0), 0)); assert.equal(q1.packaging_amount, expPack);
    assert.equal(q1.tax.amount, r2((q1.subtotal + q1.packaging_amount + q1.shipping_amount) * 0.077));
    assert.equal(q1.grand_total, r2(q1.subtotal + q1.packaging_amount + q1.shipping_amount + q1.tax.amount));
    const p4 = await (await me("/api/studio/projects", { method: "POST", body: JSON.stringify({ ...proj, packaging: ["insert_card", "sticker"] }) })).json();
    const c4 = await (await pay([{ ...line, project_id: p4.id }], me, { proof_choice: "approve" })).json();
    const pu = sent.purchase_units[0], o4 = await findRecord("orders", c4.order_id);
    assert.equal(o4.packaging_amount, r2(0.7 * 3)); assert.equal(Number(pu.amount.breakdown.item_total.value), r2(o4.subtotal + o4.packaging_amount));
    // Studio display (studio.js packQ → StudioPricing.packagingAddon with /api/storefront/fees) = cart/checkout packaging amount.
    { const ctx = { window: {} }; ctx.globalThis = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root, "studio-data.js"), "utf8"), ctx); vm.runInContext(fs.readFileSync(path.join(root, "studio-pricing.js"), "utf8"), ctx);
      const fees = await (await anon("/api/storefront/fees")).json(), proj0 = await findRecord("studio_projects", p4.id);
      const sp = ctx.StudioPricing.packagingAddon(ctx.window.STUDIO_DATA, fees, { market: "CH", packaging: proj0.packaging, mode: proj0.packaging_mode, items: o4.items.map(l => ({ product_id: l.product_id, qty: l.quantity })) });
      assert.ok(sp.total > 0); assert.equal(sp.total, o4.packaging_amount, "studio packaging = checkout packaging");
      assert.equal(ctx.StudioPricing.packagingAddon(ctx.window.STUDIO_DATA, fees, { market: "CH", packaging: proj0.packaging, mode: "none", items: [{ product_id: o4.items[0].product_id, qty: 3 }] }).total, 0);
      const sj = fs.readFileSync(path.join(root, "studio.js"), "utf8"); assert.match(sj, /\/api\/storefront\/fees/); assert.match(sj, /totalOf\(quoteFinal\(\)\) \+ packagingTotal\(items\)/, "sticky bar includes packaging");
      result.studio_packaging_price = "pass"; }
    assert.equal(r2(pu.items.reduce((a, i) => a + Number(i.unit_amount.value) * Number(i.quantity), 0)), Number(pu.amount.breakdown.item_total.value), "PayPal items sum = item_total");
    assert.equal(Number(pu.amount.value), r2(Number(pu.amount.breakdown.item_total.value) + Number(pu.amount.breakdown.shipping.value) + Number(pu.amount.breakdown.tax_total.value)));
    assert.equal(Number(pu.amount.value), o4.grand_total); assert.equal(Number(pu.amount.breakdown.shipping.value), 9.9);
    const cf = await (await anon(`/api/orders/${c4.order_id}/confirmation?t=${c4.order_token}`)).json();
    assert.equal(cf.totals.packaging, o4.packaging_amount); assert.equal(cf.totals.tax_rate, 0.077);
    const { renderTemplate: rt } = await import("./services/email-service.js");
    process.env.SENDGRID_API_KEY = "SG.test"; let cap = null;
    globalThis.fetch = async (url, opts = {}) => { if (String(url).includes("sendgrid")) { cap = JSON.parse(opts.body); return new Response("", { status: 202 }); } return realFetch(url, opts); };
    await sendOrderConfirmation(o4); delete process.env.SENDGRID_API_KEY; globalThis.fetch = ppMock;
    assert.match(cap.content[0].value + cap.content[1].value, /Packaging add-ons/); assert.match(cap.content[0].value + cap.content[1].value, /Estimated delivery/);
    // Incl.-VAT switch: grand total = goods + shipping, VAT extracted; PayPal tax_total 0.
    assert.equal((await put({ prices_include_vat: true })).status, 200);
    const qi = await (await quote({ cart: cartLines, country: "CH", proof_choice: "approve" })).json();
    assert.equal(qi.prices_include_vat, true); assert.equal(qi.grand_total, r2(qi.subtotal + qi.packaging_amount + qi.shipping_amount));
    assert.equal(qi.tax.amount, r2(qi.grand_total * 0.077 / 1.077));
    // Persisted in the data store; restore.
    assert.equal((await getState()).fee_settings.find(x => x.id === "fees_default").tax.zones.zone_ch, 0.077);
    assert.equal((await put({ prices_include_vat: false, tax: { zones: { zone_ch: 0.081 } }, packaging: { insert_card: { CHF: 0 }, sticker: { CHF: 0 } } })).status, 200);
    assert.ok(fs.readFileSync(path.join(root, "admin.html"), "utf8").includes('data-page="fees"'));
    for (const u of ["/admin-fees.html", "/admin/fees"]) { const rr = await anon(u, { redirect: "manual" }); assert.equal(rr.status, 302); assert.equal(rr.headers.get("location"), "/admin#fees"); }
    result.fees_admin_propagate = "pass";
  }
} finally { globalThis.fetch = realFetch; server.close(); }
console.log(JSON.stringify(result, null, 2));
process.exit(0);
