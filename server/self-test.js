// Self-test: business services + HTTP integration (PayPal is stubbed, no network needed).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.ADMIN_API_KEY = "test-admin-key";
process.env.PAYPAL_CLIENT_ID = "test-client";
process.env.PAYPAL_CLIENT_SECRET = "test-secret";
process.env.PUBLIC_BASE_URL = "http://localhost:0";
process.env.RATE_LIMIT_DISABLED = "true";
delete process.env.STORE_PERSIST_PATH;
for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];

const { overview } = await import("./services/overview-service.js");
const { financeSummary, landedCost } = await import("./services/finance-service.js");
const { recommendations } = await import("./services/recommendation-service.js");
const { protocolRegistry, ucpProfile, a2aAgentCard, acpFeed } = await import("./protocols/commerce-protocols.js");
const { runOpsCommand } = await import("./services/agent-ops-service.js");
const { quoteCart, pricingCatalog } = await import("./services/pricing-service.js");
const { createApp } = await import("./create-app.js");

// ---------- Services (unchanged behaviour) ----------
const tenant = "tenant_demo";
const o = await overview(tenant);
assert.ok(o.stores >= 3); assert.ok(o.orders >= 3);
const f = await financeSummary(tenant);
assert.ok(f.revenue > 0); assert.ok(f.contribution_margin < f.revenue);
assert.equal(protocolRegistry().length, 4);
assert.ok(ucpProfile("https://example.com").ucp.capabilities);
assert.equal(a2aAgentCard("https://example.com").name, "Wedding Commerce OS Agent");
assert.ok((await recommendations({ tenantId: tenant, customerId: "cust_1" })).length > 0);
assert.equal((await runOpsCommand({ tenantId: tenant, message: "分析广告ROAS并给建议" })).intent, "marketing");
const inbox = await runOpsCommand({ tenantId: tenant, message: "查看所有未处理客户会话" });
assert.equal(inbox.intent, "inbox"); assert.ok(inbox.data.conversations.length > 0);
assert.ok(landedCost({ supplier_cost: 10, inbound_shipping: 2, duty: 1, packaging: 1 }) >= 14);
assert.ok(!JSON.stringify(acpFeed([{ sku: "X", name: "X", base_price: 1, supplier_cost: 9 }])).includes("supplier_cost"), "ACP feed must not leak costs");

// ---------- Pricing mirror stays in sync with index.html ----------
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const products = [...html.matchAll(/p\("([^"]+)",([\d.]+),"(\w+)"/g)];
const catalog = pricingCatalog();
assert.equal(products.length, Object.keys(catalog.products).length, "storefront-pricing.json product count differs from index.html");
for (const [, name, price, type] of products) {
  const sku = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  assert.deepEqual([catalog.products[sku]?.price, catalog.products[sku]?.type], [Number(price), type], `price drift for ${name}`);
}
for (const [, id, name, delta] of html.matchAll(/\{id:"(\w+)",name:"([^"]+)",delta:(-?[\d.]+)/g)) {
  assert.ok(Object.values(catalog.materials).some(list => list.some(m => m.id === id && m.name === name && m.delta === Number(delta))), `material drift for ${name}`);
}
// Same formula as priceInfo(): (12.9 + 2.5 pearl) × 0.95 for 10 pcs
const q = quoteCart([{ sku: "COTTON-PAPER-INVITATION", quantity: 10, material: "珠光纸" }], "CNY");
assert.equal(q.lines[0].unit_price, 14.63); assert.equal(q.total, 146.3);
assert.throws(() => quoteCart([{ sku: "NOPE", quantity: 1 }]), /Unknown product/);
assert.throws(() => quoteCart([{ sku: "MENU-CARD", quantity: 0 }]), /Invalid quantity/);

// ---------- HTTP integration ----------
const realFetch = globalThis.fetch;
let captured = 0, expectedPayPalAmount = null;
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url);
  if (u.includes("paypal.com/v1/oauth2/token")) return Response.json({ access_token: "tok", expires_in: 3600 });
  if (u.endsWith("/v2/checkout/orders")) {
    const body = JSON.parse(opt.body);
    assert.equal(body.purchase_units[0].amount.value, expectedPayPalAmount, "PayPal amount must be the server quote grand total");
    return Response.json({ id: "PP-ORDER-1", links: [{ rel: "payer-action", href: "https://paypal.test/approve/PP-ORDER-1" }] });
  }
  if (u.includes("/v2/checkout/orders/PP-ORDER-1/capture")) { captured++; return Response.json({ status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP-1" }] } }] }); }
  return realFetch(url, opt);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-"));
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const admin = { "x-admin-api-key": "test-admin-key", "Content-Type": "application/json" };
const json = (method, body, headers = { "Content-Type": "application/json" }) => ({ method, headers, body: JSON.stringify(body) });

try {
  // Pages and shared assets
  for (const p of ["/", "/index.html", "/admin.html", "/proof.html", "/payment-success.html", "/i18n.js"]) assert.equal((await realFetch(base + p)).status, 200, p);
  assert.equal((await realFetch(base + "/server/app.js")).status, 404);
  assert.equal((await realFetch(base + "/.env")).status, 404);
  assert.equal((await (await realFetch(base + "/api/health")).json()).ok, true);

  // Admin auth
  assert.equal((await realFetch(base + "/api/saas/overview")).status, 401);
  assert.equal((await realFetch(base + "/api/saas/overview", { headers: admin })).status, 200);
  assert.equal((await realFetch(base + "/api/protocols/mcp", json("POST", { method: "tools/list" }))).status, 401);
  const stores = await (await realFetch(base + "/api/saas/stores", { headers: admin })).json();
  assert.ok(stores.every(s => !("token_encrypted" in s)));

  // Public chat must not leak back-office data; admin chat may.
  const pub = await (await realFetch(base + "/api/agent/chat", json("POST", { message: "看一下财务利润和订单" }))).json();
  assert.ok(!pub.tool_summary?.includes("contribution_margin"), "public chat leaked finance data");
  assert.equal(pub.fallback, true, "no LLM configured → storefront should fall back to local demo answers");
  const adm = await (await realFetch(base + "/api/agent/chat", json("POST", { message: "看一下财务利润" }, admin))).json();
  assert.ok(adm.tool_summary.includes("contribution_margin"));

  // Public catalog has no cost fields
  const pc = await (await realFetch(base + "/api/storefront/catalog")).json();
  assert.ok(pc.length && pc.every(p => !("supplier_cost" in p) && !("landed_cost" in p)));

  // Malformed input never crashes the server
  assert.equal((await realFetch(base + "/api/saas/marketing/publish", json("POST", { approved: true }, admin))).status, 400);
  assert.equal((await realFetch(base + "/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" })).status, 400);

  // Checkout: validation, server-side quote, PayPal approval URL
  const cart = [{ sku: "COTTON-PAPER-INVITATION", name: "Cotton Paper Invitation", quantity: 10, material: "珠光纸", customization: "Anna & Ben" }];
  assert.equal((await realFetch(base + "/api/payments/paypal/create", json("POST", { cart, customer: { email: "nope" } }))).status, 400);
  // Cart preview quote = merchandise (146.30) + regional shipping + tax; checkout must charge exactly that.
  const preview = await (await realFetch(base + "/api/storefront/shipping/quote", json("POST", { cart, country: "CH", postal_code: "4051", currency: "CNY", shipping_method: "express" }))).json();
  assert.equal(preview.subtotal, 146.3);
  assert.equal(preview.selected_shipping, "express");
  assert.ok(preview.shipping_amount > 0 && preview.tax.amount > 0);
  assert.equal(preview.grand_total, Math.round((preview.subtotal + preview.shipping_amount + preview.tax.amount) * 100) / 100);
  expectedPayPalAmount = preview.grand_total.toFixed(2);
  const created = await (await realFetch(base + "/api/payments/paypal/create", json("POST", { cart, customer: { name: "Anna", email: "anna@example.com" }, shipping: { country: "ch", postal_code: "4051" }, shipping_method: "express", currency: "CNY" }))).json();
  assert.equal(created.approval_url, "https://paypal.test/approve/PP-ORDER-1");
  assert.equal(created.total, preview.grand_total);
  assert.equal((await realFetch(base + "/api/storefront/shipping/quote", json("POST", { cart, country: "ZZ" }))).status, 200, "unknown country falls back to the world zone");
  const orderId = created.order_id;
  assert.equal((await (await realFetch(`${base}/api/orders/${orderId}/status`)).json()).status, "Draft");
  const revenueBefore = (await financeSummary(tenant)).revenue;
  assert.equal(revenueBefore, f.revenue, "unpaid draft orders must not count as revenue");

  // Return from PayPal → capture → redirect to status page (idempotent)
  const ret = await realFetch(`${base}/api/payments/paypal/return?order=${orderId}&token=PP-ORDER-1`, { redirect: "manual" });
  assert.equal(ret.status, 302);
  assert.match(ret.headers.get("location"), /payment-success\.html\?order=.*&status=COMPLETED/);
  await realFetch(`${base}/api/payments/paypal/return?order=${orderId}&token=PP-ORDER-1`, { redirect: "manual" });
  assert.equal(captured, 1, "capture must run once");
  const st = await (await realFetch(`${base}/api/orders/${orderId}/status`)).json();
  assert.deepEqual([st.status, st.financial_status], ["Paid", "paid"]);

  // Proof flow: created on payment → admin attaches proof → customer approves
  const proofs = await (await realFetch(base + "/api/saas/proofs", { headers: admin })).json();
  const proof = proofs.find(p => p.order_id === orderId);
  assert.ok(proof?.token);
  assert.equal((await realFetch(`${base}/api/proofs/public/${proof.token}/approve`, json("POST", {}))).status, 409, "cannot approve before proof is uploaded");
  const upd = await (await realFetch(`${base}/api/saas/proofs/${proof.id}`, json("PATCH", { proof_url: "https://cdn.example.com/proof.png" }, admin))).json();
  assert.equal(upd.status, "Sent");
  const view = await (await realFetch(`${base}/api/proofs/public/${proof.token}`)).json();
  assert.equal(view.order.items[0].name, "Cotton Paper Invitation");
  assert.ok(!JSON.stringify(view).includes("anna@example.com"), "public proof must not expose PII");
  assert.equal((await (await realFetch(`${base}/api/proofs/public/${proof.token}/approve`, json("POST", {}))).json()).status, "Approved");
  assert.equal((await (await realFetch(`${base}/api/orders/${orderId}/status`)).json()).status, "Approved");
  assert.equal((await realFetch(`${base}/api/proofs/public/demo-proof-token-1008`)).status, 200);

  // Invitations: publish + sandboxed serving
  const inv = await (await realFetch(base + "/api/invitations", json("POST", { html: "<!doctype html><html><body>" + "x".repeat(200) + "</body></html>", profile: { names: "A & B" } }))).json();
  const page = await realFetch(base + inv.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy") || "", /sandbox/);
  assert.equal((await realFetch(`${base}/generated/${inv.id}.json`)).status, 404);
} finally {
  server.close();
  globalThis.fetch = realFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("self-test passed", JSON.stringify({ overview: o, finance: f, protocols: protocolRegistry().map(x => x.id) }));
