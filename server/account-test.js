// My account portal: auth required, order scoping (no IDOR), address CRUD + checkout prefill, profile, designs, CSRF.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-acct-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
  APP_ENCRYPTION_KEY: "x".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com" });

const { createApp } = await import("./create-app.js");
const { seedDemo } = await import("./account-demo.js");
const { customerStatus } = await import("./services/account-portal-service.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const demo = await seedDemo("tenant_demo");
const as = tok => (p, o = {}) => fetch(base + p, { ...o, headers: { ...(tok ? { Cookie: `pod_session=${tok}` } : {}), ...(o.body ? { "Content-Type": "application/json" } : {}), ...(o.headers || {}) } });
const me = as(demo.token), other = as(demo.otherToken), anon = as(null);
const result = {};
try {
  // 1. Every portal endpoint requires a session.
  for (const [m, p] of [["GET", "/api/account/overview"], ["GET", "/api/account/orders"], ["GET", `/api/account/orders/${demo.orders[0].id}`], ["GET", "/api/account/designs"], ["GET", "/api/account/me"], ["PATCH", "/api/account/me"], ["GET", "/api/account/addresses"], ["POST", "/api/account/addresses"], ["PUT", "/api/account/addresses/adr_home"], ["DELETE", "/api/account/addresses/adr_home"], ["POST", "/api/account/addresses/adr_home/default"], ["GET", "/api/account/profile"]]) {
    const r = await anon(p, { method: m, ...(m !== "GET" ? { body: "{}" } : {}) });
    assert.equal(r.status, 401, `${m} ${p}`); assert.equal((await r.json()).error, "login_required");
  }
  const bad = await as("forged-token")("/api/account/orders"); assert.equal(bad.status, 401);
  const page = await anon("/account"); assert.equal(page.status, 200); assert.match(await page.text(), /account-app\.js/);
  result.auth_required = "pass";

  // 2. Orders are scoped to the signed-in customer.
  let d = await (await me("/api/account/orders")).json();
  assert.deepEqual(d.orders.map(o => o.id).sort(), demo.orders.map(o => o.id).sort());
  assert.ok(!d.orders.some(o => o.id === demo.foreignOrder.id));
  assert.equal(d.orders[0].id, "POD-2026-C02D5E7714", "newest first");
  assert.equal(d.orders.find(o => o.id === "POD-2026-1B77E0A9F2").status, "delivered");
  assert.ok(d.orders[1].items[0].thumb.startsWith("/assets/mockups/"), "thumbnail from catalog");
  for (const [k, v] of Object.entries(d.orders[0])) assert.ok(!["tenant_id", "user_id", "customer_email", "cogs"].includes(k), k);
  const r404 = await me(`/api/account/orders/${demo.foreignOrder.id}`); assert.equal(r404.status, 404);
  assert.equal((await me("/api/account/orders/POD-NOPE")).status, 404);
  assert.equal((await other(`/api/account/orders/${demo.orders[0].id}`)).status, 404, "other customer cannot read my order");
  const od = (await (await me(`/api/account/orders/${demo.orders[0].id}`)).json()).order;
  assert.equal(od.items.length, 2); assert.equal(od.payment.provider, "twint"); assert.equal(od.shipping_address.city, "Zürich");
  assert.equal(od.status, "in_production"); assert.deepEqual(od.timeline.map(s => s.done), [true, true, true, true, false, false]);
  d = await (await me("/api/account/orders?status=delivered")).json(); assert.deepEqual(d.orders.map(o => o.id), ["POD-2026-1B77E0A9F2"]);
  d = await (await me("/api/account/orders?q=mug")).json(); assert.deepEqual(d.orders.map(o => o.id), ["POD-2026-C02D5E7714"]);
  d = await (await me("/api/account/orders?q=FFFF000001")).json(); assert.equal(d.orders.length, 0, "search cannot reach foreign orders");
  assert.equal((await (await other("/api/account/orders")).json()).orders.length, 1);
  assert.equal(customerStatus({ status: "Cancelled" }), "cancelled"); assert.equal(customerStatus({ status: "Draft", payment_status: "pending" }), "awaiting_payment");
  result.order_scoping = "pass";

  // 3. Address CRUD; default feeds checkout prefill (/api/account/profile).
  let a = await (await me("/api/account/addresses")).json(); assert.equal(a.addresses.length, 2);
  let r = await me("/api/account/addresses", { method: "POST", body: JSON.stringify({ name: "Lena", address1: "Rue du Lac 1", postal_code: "1003", city: "Lausanne", country: "ch", is_default: true }) });
  assert.equal(r.status, 201); const created = (await r.json()).address; assert.equal(created.country, "CH");
  a = await (await me("/api/account/addresses")).json(); assert.equal(a.addresses.filter(x => x.is_default).length, 1); assert.equal(a.addresses.find(x => x.is_default).id, created.id);
  let prof = await (await me("/api/account/profile")).json(); assert.equal(prof.shipping_address.city, "Lausanne");
  r = await me("/api/account/addresses", { method: "POST", body: JSON.stringify({ name: "x" }) }); assert.equal(r.status, 400);
  r = await me("/api/account/addresses", { method: "POST", body: JSON.stringify({ name: "x", address1: "y", postal_code: "1", city: "z", country: "Switzerland" }) }); assert.equal(r.status, 400);
  r = await me(`/api/account/addresses/${created.id}`, { method: "PUT", body: JSON.stringify({ city: "Genève", postal_code: "1201" }) }); assert.equal(r.status, 200);
  assert.equal((await (await me("/api/account/profile")).json()).shipping_address.city, "Genève");
  r = await me("/api/account/addresses/adr_studio/default", { method: "POST" }); assert.equal(r.status, 200);
  assert.equal((await (await me("/api/account/profile")).json()).shipping_address.city, "Lörrach");
  // Another customer cannot touch my addresses (ids are per account).
  assert.equal((await other("/api/account/addresses/adr_studio", { method: "DELETE" })).status, 404);
  assert.equal((await other(`/api/account/addresses/${created.id}`, { method: "PUT", body: JSON.stringify({ city: "Hack" }) })).status, 404);
  assert.equal((await (await other("/api/account/addresses")).json()).addresses.length, 0);
  r = await me("/api/account/addresses/adr_studio", { method: "DELETE" }); assert.equal(r.status, 200);
  a = await (await me("/api/account/addresses")).json(); assert.equal(a.addresses.length, 2); assert.equal(a.addresses.filter(x => x.is_default).length, 1, "a default is re-assigned");
  for (const x of a.addresses) assert.equal((await me(`/api/account/addresses/${x.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await (await me("/api/account/profile")).json()).shipping_address, null);
  // CSRF: cross-site mutation rejected.
  r = await me("/api/account/addresses", { method: "POST", headers: { Origin: "https://evil.example" }, body: JSON.stringify({ name: "a", address1: "b", postal_code: "1", city: "c", country: "CH" }) }); assert.equal(r.status, 403);
  result.address_crud = "pass";

  // 4. Profile (read-only provider info, name editable) + designs scoped.
  let p = await (await me("/api/account/me")).json(); assert.equal(p.user.email, "lena.meier@example.com"); assert.deepEqual(p.providers.map(x => x.provider), ["google"]); assert.ok(p.user.avatar_url);
  r = await me("/api/account/me", { method: "PATCH", body: JSON.stringify({ name: "Lena M.", email: "hijack@example.com" }) }); p = await r.json();
  assert.equal(p.user.name, "Lena M."); assert.equal(p.user.email, "lena.meier@example.com", "email is read-only");
  const ds = (await (await me("/api/account/designs")).json()).designs; assert.deepEqual(ds.map(x => x.id), ["prj_demo1"]);
  const ov = await (await me("/api/account/overview")).json(); assert.equal(ov.counts.orders, 3); assert.equal(ov.counts.designs, 1);
  result.profile_designs = "pass";
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
} finally { server.close(); }
