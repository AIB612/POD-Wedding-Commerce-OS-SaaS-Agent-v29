// Paddle Billing for WooCommerce plans (server/billing): off by default, config from env names, webhook signature
// (valid / tampered / stale / wrong secret), plan mapping (monthly / annual, trial / no-trial), subscription lifecycle on the
// site row (trialing → active → past_due → canceled), idempotent + ordered events, checkout via signed plugin API
// (mocked Paddle API, sandbox only), checkout page, portal, cancel on disconnect. No real Paddle call, no payment.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podai-paddle-"));
for (const k of Object.keys(process.env)) if (k.startsWith("PADDLE_")) delete process.env[k];
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"), APP_ENCRYPTION_KEY: "p".repeat(40),
  AGENT_SHOPIFY_API_KEY: "agentkey", AGENT_SHOPIFY_API_SECRET: "agentsecret", PODAI_ACCESS_LOG_DIR: path.join(tmp, "acc"), PODAI_PUBLIC_URL: "https://podai.test" });
const paddle = await import("../paddle.js");
const { createApp } = await import("../../create-app.js");
const woo = await import("../../woo-agent/core.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;
const PADDLE_ENV = { PADDLE_ENABLED: "true", PADDLE_ENV: "sandbox", PADDLE_API_KEY: "test_key", PADDLE_CLIENT_TOKEN: "test_clienttoken", PADDLE_WEBHOOK_SECRET: "whsec_test",
  PADDLE_PRICE_GROWTH_MONTHLY: "pri_growthmonthly01", PADDLE_PRICE_GROWTH_ANNUAL: "pri_growthannual01", PADDLE_PRICE_PRO_MONTHLY: "pri_promonthly0001", PADDLE_PRICE_PRO_ANNUAL: "pri_proannual00001", PADDLE_PRICE_GROWTH_MONTHLY_NOTRIAL: "pri_growthmonthlynt" };

let wpNonce = null; const paddleCalls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.host === "woo-pay.test") return Response.json({ nonce: u.searchParams.get("nonce") === wpNonce ? wpNonce : "x" });
  if (u.host === "sandbox-api.paddle.com") {
    paddleCalls.push({ path: u.pathname, body: init.body ? JSON.parse(init.body) : null, auth: init.headers.Authorization });
    if (u.pathname === "/transactions") return Response.json({ data: { id: "txn_01testtxn" + paddleCalls.length } });
    if (/\/customers\/ctm_\w+\/portal-sessions/.test(u.pathname)) return Response.json({ data: { urls: { general: { overview: "https://sandbox-customer-portal.paddle.com/cpl_x" } } } });
    if (/\/subscriptions\/sub_\w+\/cancel/.test(u.pathname)) return Response.json({ data: { id: "sub_1", status: "active", scheduled_change: { action: "cancel" } } });
  }
  if (u.host === "api.paddle.com") throw new Error("production Paddle must never be called in tests");
  return realFetch(url, init);
};
let WS, SECRET;
const signed = async (route, body) => { const raw = JSON.stringify(body); const r = await realFetch(`${base}/woo-agent/v1${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...woo.signedHeaders(WS, SECRET, { route: `/woo-agent/v1${route}`, body: raw }) }, body: raw }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
const signedGet = async route => { const r = await realFetch(`${base}/woo-agent/v1${route}`, { headers: woo.signedHeaders(WS, SECRET, { method: "GET", route: `/woo-agent/v1${route}`, body: "" }) }); return r.json(); };
const hook = async (event, { secret = "whsec_test", tamper = false, ts } = {}) => { const raw = JSON.stringify(event);
  const r = await realFetch(`${base}/billing/paddle/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "Paddle-Signature": paddle.signForTest(raw, secret, ts) }, body: tamper ? raw.replace("trialing", "active") : raw });
  return { status: r.status, d: await r.json().catch(() => ({})) }; };
const subEvent = (status, price, extra = {}) => ({ event_id: `evt_${crypto.randomBytes(6).toString("hex")}`, event_type: "subscription.updated", occurred_at: new Date().toISOString(),
  data: { id: "sub_01test", status, customer_id: "ctm_01test", custom_data: { platform: "woocommerce", store_id: WS }, items: [{ price: { id: price }, trial_dates: status === "trialing" ? { ends_at: "2026-12-01T00:00:00Z" } : null }], next_billed_at: "2026-12-01T00:00:00Z", ...extra } });

test("off by default: config lists exactly the missing variables, checkout refused", async () => {
  const c = paddle.config({});
  assert.equal(c.enabled, false);
  assert.deepEqual(c.missing.sort(), ["PADDLE_API_KEY", "PADDLE_CLIENT_TOKEN", "PADDLE_PRICE_GROWTH_ANNUAL", "PADDLE_PRICE_GROWTH_MONTHLY", "PADDLE_PRICE_PRO_ANNUAL", "PADDLE_PRICE_PRO_MONTHLY", "PADDLE_WEBHOOK_SECRET"]);
  assert.equal(paddle.config({ ...PADDLE_ENV, PADDLE_ENABLED: "false" }).enabled, false, "keys alone do not start selling");
  assert.equal(paddle.config(PADDLE_ENV).enabled, true); assert.equal(paddle.config(PADDLE_ENV).api, "https://sandbox-api.paddle.com");
  assert.equal(paddle.config({ ...PADDLE_ENV, PADDLE_ENV: "production" }).api, "https://api.paddle.com");
  wpNonce = crypto.randomBytes(16).toString("hex");
  const reg = await (await realFetch(`${base}/woo-agent/v1/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site_url: "http://woo-pay.test", rest_url: "http://woo-pay.test/wp-json/", nonce: wpNonce }) })).json();
  WS = reg.site_id; SECRET = reg.secret;
  const st = await signedGet("/billing");
  assert.equal(st.payments.enabled, false); assert.equal(st.payments.provider, "paddle");
  assert.deepEqual(st.plans.map(p => [p.handle, p.price, p.annual_price]), [["free", 0, null], ["growth", 19, 182.4], ["pro", 49, 470.4]]);
  assert.equal((await signed("/billing/checkout", { plan: "growth", cycle: "monthly" })).status, 503);
  assert.equal((await realFetch(`${base}/billing/checkout?_ptxn=txn_x`)).status, 503);
  assert.equal(paddleCalls.length, 0);
});

test("webhook signature: valid accepted; tampered, stale, wrong secret, missing rejected", () => {
  const raw = '{"a":1}', now = Math.floor(Date.now() / 1000);
  assert.equal(paddle.verifySignature(raw, paddle.signForTest(raw, "s"), "s"), true);
  assert.equal(paddle.verifySignature('{"a":2}', paddle.signForTest(raw, "s"), "s"), false);
  assert.equal(paddle.verifySignature(raw, paddle.signForTest(raw, "s", now - 600), "s"), false);
  assert.equal(paddle.verifySignature(raw, paddle.signForTest(raw, "x"), "s"), false);
  assert.equal(paddle.verifySignature(raw, "", "s"), false); assert.equal(paddle.verifySignature(raw, paddle.signForTest(raw, "s"), ""), false);
  assert.equal(paddle.verifySignature(raw, `ts=${now};h1=zz;h1=${paddle.signForTest(raw, "s", now).split("h1=")[1]}`, "s"), true, "secret rotation: any h1 matches");
});

test("checkout (sandbox, mocked API): transaction with custom_data, checkout page with Paddle.js, return URL host-checked", async () => {
  Object.assign(process.env, PADDLE_ENV);
  const r = await signed("/billing/checkout", { plan: "growth", cycle: "annual", email: "owner@woo-pay.test", return_url: "http://woo-pay.test/wp-admin/admin.php?page=pod-ai-chat" });
  assert.equal(r.status, 200); assert.match(r.d.url, /^https:\/\/podai\.test\/billing\/checkout\?_ptxn=txn_/);
  const call = paddleCalls.at(-1);
  assert.equal(call.path, "/transactions"); assert.equal(call.auth, "Bearer test_key");
  assert.deepEqual(call.body.items, [{ price_id: "pri_growthannual01", quantity: 1 }]); assert.deepEqual(call.body.custom_data, { platform: "woocommerce", store_id: WS, plan: "growth", cycle: "annual" });
  const page = await realFetch(`${base}/billing/checkout?_ptxn=${r.d.transaction_id}`); const html = await page.text();
  assert.equal(page.status, 200); assert.match(html, /cdn\.paddle\.com\/paddle\/v2\/paddle\.js/); assert.match(html, /Paddle\.Environment\.set\("sandbox"\)/); assert.match(html, /test_clienttoken/);
  assert.match(html, /"successUrl":"http:\/\/woo-pay\.test\/wp-admin/); assert.ok(!html.includes("test_key"), "server API key never in the page"); assert.ok(!html.includes("whsec_test"));
  const evil = await signed("/billing/checkout", { plan: "pro", cycle: "monthly", return_url: "https://evil.example/" });
  assert.ok(!(await (await realFetch(`${base}/billing/checkout?_ptxn=${evil.d.transaction_id}`)).text()).includes("evil.example"), "foreign return URL dropped");
  assert.equal((await realFetch(`${base}/billing/checkout?_ptxn=txn_unknown`)).status, 404);
  assert.equal((await signed("/billing/checkout", { plan: "enterprise", cycle: "monthly" })).status, 400);
});

test("subscription lifecycle → plan on the site row; idempotent, ordered, signature required", async () => {
  assert.equal((await hook(subEvent("trialing", "pri_growthannual01"), { tamper: true })).status, 401);
  assert.equal((await hook(subEvent("trialing", "pri_growthannual01"), { secret: "wrong" })).status, 401);
  assert.equal((await hook(subEvent("trialing", "pri_growthannual01"), { ts: Math.floor(Date.now() / 1000) - 3600 })).status, 401);
  const e1 = subEvent("trialing", "pri_growthannual01");
  assert.equal((await hook(e1)).status, 200);
  let site = await woo.getSite(WS);
  assert.equal(site.plan, "growth"); assert.equal(site.paddle.status, "trialing"); assert.equal(site.paddle.cycle, "annual"); assert.equal(site.paddle.trial_used, true);
  const b = await signedGet("/billing"); assert.equal(b.plan, "growth"); assert.equal(b.subscription.status, "trialing"); assert.equal(b.limit, 500);
  assert.equal((await signed("/billing/checkout", { plan: "pro", cycle: "monthly" })).status, 409, "already subscribed → portal");
  assert.equal((await hook(e1)).d.ok, true); // duplicate delivery
  await hook(subEvent("active", "pri_promonthly0001")); assert.equal((await woo.getSite(WS)).plan, "pro");
  const old = subEvent("active", "pri_growthmonthly01", {}); old.occurred_at = "2020-01-01T00:00:00Z";
  assert.equal((await hook(old)).d.ignored, "stale"); assert.equal((await woo.getSite(WS)).plan, "pro");
  await hook(subEvent("past_due", "pri_promonthly0001")); assert.equal((await woo.getSite(WS)).plan, "pro", "grace while Paddle retries");
  const portal = await signed("/billing/portal", {}); assert.equal(portal.d.url, "https://sandbox-customer-portal.paddle.com/cpl_x");
  assert.deepEqual(paddleCalls.at(-1).body, { subscription_ids: ["sub_01test"] });
  await hook(subEvent("canceled", "pri_promonthly0001")); site = await woo.getSite(WS);
  assert.equal(site.plan, "free"); assert.equal((await signedGet("/billing")).subscription, null);
  // a returning customer gets the no-trial price
  await signed("/billing/checkout", { plan: "growth", cycle: "monthly" });
  assert.equal(paddleCalls.at(-1).body.items[0].price_id, "pri_growthmonthlynt");
  assert.deepEqual((await hook({ event_id: "evt_tx", event_type: "transaction.completed", data: {} })).d, { ok: true, ignored: "event_type" });
  assert.deepEqual(paddle.planForPrice("pri_unknown"), null);
});

test("disconnect cancels an active subscription at period end", async () => {
  await hook(subEvent("active", "pri_growthmonthly01"));
  const r = await signed("/disconnect", {});
  assert.equal(r.status, 200);
  assert.ok(paddleCalls.some(c => c.path === "/subscriptions/sub_01test/cancel" && c.body.effective_from === "next_billing_period"));
  assert.equal(await woo.getSite(WS), null);
});

test.after(() => { server.close(); globalThis.fetch = realFetch; for (const k of Object.keys(PADDLE_ENV)) delete process.env[k]; });
