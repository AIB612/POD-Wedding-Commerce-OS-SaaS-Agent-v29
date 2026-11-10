// Pod.AI billing (Shopify Managed Pricing): plan mapping, monthly chat counting, limit behaviour in the storefront chat,
// admin /billing summary + pricing page link, app_subscriptions/update webhook (HMAC) invalidates the plan cache.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podai-billing-"));
for (const k of ["LLM_PROVIDER", "OPENAI_API_KEY", "XAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "SHOPIFY_APP_HANDLE"]) delete process.env[k];
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"), APP_ENCRYPTION_KEY: "z".repeat(40),
  AGENT_SHOPIFY_API_KEY: "agentkey", AGENT_SHOPIFY_API_SECRET: "agentsecret", AGENT_APP_URL: "https://app.test" });
const billing = await import("../billing.js");
const { PLANS, planForSubscription, planFromSubscriptions, monthKey, recordChat, chatsUsed } = billing;
const result = {};

// ---- 1. plan mapping (handle / name case-insensitive, price fallback, status) ----
const rec = (amount, interval = "EVERY_30_DAYS") => [{ plan: { pricingDetails: { __typename: "AppRecurringPricing", price: { amount: String(amount), currencyCode: "USD" }, interval } } }];
assert.equal(planFromSubscriptions([]).handle, "free", "no active subscription = Free");
assert.equal(planFromSubscriptions(null).handle, "free");
assert.equal(planForSubscription({ name: "growth", status: "ACTIVE" }), "growth");
assert.equal(planForSubscription({ name: "Pro", status: "ACTIVE" }), "pro");
assert.equal(planForSubscription({ name: "GROWTH", status: "ACTIVE" }), "growth");
assert.equal(planForSubscription({ name: "Pod.AI Pro (annual)", status: "ACTIVE" }), "pro");
assert.equal(planForSubscription({ name: "Promo plan", status: "ACTIVE", lineItems: rec(19) }), "growth", "'Promo' is not 'Pro'; price fallback");
assert.equal(planForSubscription({ name: "Plan X", status: "ACTIVE", lineItems: rec(49) }), "pro", "price fallback monthly 49");
assert.equal(planForSubscription({ name: "Plan Y", status: "ACTIVE", lineItems: rec(182.4, "ANNUAL") }), "growth", "annual 19×12×0.8");
assert.equal(planForSubscription({ name: "Plan Z", status: "ACTIVE", lineItems: rec(470.4, "ANNUAL") }), "pro", "annual 49×12×0.8");
assert.equal(planForSubscription({ name: "Pro", status: "PENDING" }), null, "not active → not paid");
assert.equal(planForSubscription({ name: "Pro", status: "CANCELLED" }), null);
assert.equal(planForSubscription({ name: "Something", status: "ACTIVE" }), null, "unknown, no price");
assert.equal(planFromSubscriptions([{ name: "Growth", status: "ACTIVE" }, { name: "Pro", status: "ACTIVE", test: true }]).handle, "pro", "highest active plan");
assert.deepEqual([PLANS.free.chats, PLANS.growth.chats, PLANS.pro.chats], [50, 500, 2500]);
assert.deepEqual([PLANS.free.llm, PLANS.growth.llm, PLANS.pro.llm], [false, false, true]);
assert.equal(billing.pricingUrl("dropkingdev.myshopify.com"), "https://admin.shopify.com/store/dropkingdev/charges/pod-ai-1/pricing_plans");
process.env.SHOPIFY_APP_HANDLE = "pod-ai-x"; assert.match(billing.pricingUrl("a.myshopify.com"), /\/store\/a\/charges\/pod-ai-x\/pricing_plans$/); delete process.env.SHOPIFY_APP_HANDLE;
result.mapping = "pass";

// ---- 2. monthly counting (UTC calendar month, idempotent per conversation) ----
const T0 = "shopagent_count.myshopify.com";
assert.equal(monthKey(Date.UTC(2026, 10, 30, 23, 59)), "2026-11"); assert.equal(monthKey(Date.UTC(2026, 11, 1, 0, 0)), "2026-12");
assert.equal(await recordChat(T0, "c_aaaaaaaaaaaa", Date.UTC(2026, 10, 30, 23, 59)), true);
assert.equal(await recordChat(T0, "c_aaaaaaaaaaaa", Date.UTC(2026, 10, 30, 23, 59)), false, "same chat counted once");
await recordChat(T0, "c_bbbbbbbbbbbb", Date.UTC(2026, 11, 1, 0, 1));
await recordChat("shopagent_other.myshopify.com", "c_cccccccccccc", Date.UTC(2026, 10, 15));
assert.equal(await chatsUsed(T0, "2026-11"), 1); assert.equal(await chatsUsed(T0, "2026-12"), 1); assert.equal(await chatsUsed(T0, "2026-10"), 0);
result.counting = "pass";

// ---- 3. HTTP: storefront chat under / over the limit, admin summary, webhook ----
const { createApp } = await import("../../create-app.js");
const core = await import("../core.js");
const { getState } = await import("../../saas-store.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;
const A = "bill-a.myshopify.com";
let subs = [], subCalls = 0, subFail = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), m = u.match(/^https:\/\/([a-z0-9-]+\.myshopify\.com)\/admin\/(.*)$/);
  if (!m) return realFetch(url, init);
  const shop = m[1], body = JSON.parse(init.body || "{}"), json = d => new Response(JSON.stringify(d), { status: 200, headers: { "Content-Type": "application/json" } });
  if (m[2] === "oauth/access_token") return json({ access_token: `tok_${shop}`, scope: core.SCOPES, expires_in: 3600, refresh_token: `rt_${shop}`, refresh_token_expires_in: 7776000 });
  if (/currentAppInstallation/.test(body.query)) { subCalls++; if (subFail) return new Response("boom", { status: 500 }); return json({ data: { currentAppInstallation: { activeSubscriptions: subs } } }); }
  if (/shopPolicies/.test(body.query)) return json({ data: { shop: { name: "Bill Shop", contactEmail: "team@" + shop, currencyCode: "USD", taxesIncluded: true, primaryDomain: { url: `https://${shop}` }, shopPolicies: [] } } });
  if (/deliveryProfiles/.test(body.query)) return json({ data: { deliveryProfiles: { nodes: [] } } });
  if (/products\(/.test(body.query)) return json({ data: { products: { nodes: [] } } });
  return json({ errors: [{ message: "unexpected" }] });
};
const call = async (p, { method = "GET", body, headers = {} } = {}) => {
  const r = await realFetch(base + p, { method, headers: { "Content-Type": "application/json", ...headers }, body: body == null ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch {} return { status: r.status, json, text };
};
const signedQuery = shop => { const q = { shop, logged_in_customer_id: "", path_prefix: "/apps/podai", timestamp: String(Math.floor(Date.now() / 1000)) }; q.signature = core.proxySignature(q, "agentsecret"); return new URLSearchParams(q).toString(); };
const proxy = (message, conversation_id, lang = "en") => call(`/shopify-agent/proxy/chat?${signedQuery(A)}`, { method: "POST", body: { message, conversation_id, lang } });
const adm = (p, opt = {}) => call(`/shopify-agent/api${p}`, { ...opt, headers: { Authorization: `Bearer ${core.signSession(A)}` } });
const hook = (topic, payload, { bad = false } = {}) => { const raw = JSON.stringify(payload), h = crypto.createHmac("sha256", bad ? "wrong" : "agentsecret").update(raw).digest("base64");
  return call("/shopify-agent/webhooks", { method: "POST", body: raw, headers: { "X-Shopify-Hmac-Sha256": h, "X-Shopify-Topic": topic, "X-Shopify-Shop-Domain": A, "X-Shopify-Webhook-Id": crypto.randomUUID() } }); };
const TA = core.tenantFor(A);
try {
  assert.equal((await adm("/bootstrap", { method: "POST" })).status, 200);
  // Free plan (no subscription): summary + link
  let b = (await adm("/billing?refresh=1")).json;
  assert.deepEqual([b.plan, b.name, b.limit, b.used, b.llm], ["free", "Free", 50, 0, false]);
  assert.equal(b.pricing_url, "https://admin.shopify.com/store/bill-a/charges/pod-ai-1/pricing_plans");
  // a chat counts once, however many messages it has
  let r = await proxy("Hello"); assert.equal(r.status, 200); const c1 = r.json.conversation_id; assert.ok(c1);
  r = await proxy("What is your return policy?", c1); assert.equal(r.status, 200);
  assert.equal(await chatsUsed(TA), 1, "one conversation = one chat");
  assert.equal((await adm("/billing")).json.used, 1);
  // admin "Try it" is not counted
  assert.equal((await adm("/preview", { method: "POST", body: { message: "Hello" } })).status, 200);
  assert.equal(await chatsUsed(TA), 1, "preview not counted");
  // fill the month up to the Free limit
  for (let i = 0; i < 49; i++) await recordChat(TA, `c_fill${String(i).padStart(10, "0")}`);
  assert.equal(await chatsUsed(TA), 50);
  // limit reached: the chat in progress may finish …
  r = await proxy("Do you ship to Germany?", c1); assert.equal(r.status, 200); assert.notEqual(r.json.answered_by, null); assert.doesNotMatch(r.json.answer, /isn't available/);
  // … a NEW chat gets a polite message (customer's language) + "talk to a person", never an error, and is not counted
  r = await proxy("Hallo, habt ihr Tassen?", undefined, "de"); assert.equal(r.status, 200);
  assert.match(r.json.answer, /nicht verfügbar/); const c2 = r.json.conversation_id;
  assert.ok(r.json.ui.some(u => u.type === "chips" && u.items.includes("Mit einem Menschen sprechen")));
  assert.equal(await chatsUsed(TA), 50, "over-limit chat not counted");
  r = await proxy("Do you have mugs?"); assert.match(r.json.answer, /isn't available right now/); assert.ok(r.json.ui.some(u => u.type === "chips" && u.items.includes("Talk to a person")));
  r = await proxy("还有货吗", undefined, "zh"); assert.match(r.json.answer, /暂时无法使用/);
  // repeated messages without asking for a person: same message, no AI
  r = await proxy("Habt ihr Tassen in Blau?", c2, "de"); assert.match(r.json.answer, /nicht verfügbar/); assert.equal(r.json.handoff, null);
  // asks for a person → handoff queue, e-mail form (ui handoff)
  r = await proxy("Mit einem Menschen sprechen", c2, "de"); assert.equal(r.status, 200);
  assert.ok(r.json.handoff); assert.ok(r.json.ui.some(u => u.type === "handoff")); assert.match(r.json.answer, /E-Mail/);
  r = await proxy("anna@example.com", c2, "de"); assert.equal(r.status, 200); assert.match(r.json.answer, /E-Mail|Danke/);
  r = await proxy("Habt ihr Tassen?", c2, "de"); assert.equal(r.status, 200); assert.ok(!r.json.ui.some(u => u.type === "chips" && u.items.includes("Zurück zur KI")), "no back-to-AI while over the limit");
  const ho = (await getState()).podai_handoffs.filter(h => h.tenant_id === TA);
  assert.equal(ho.length, 1); assert.equal(ho[0].customer_email, "anna@example.com"); assert.match(ho[0].reason, /plan chat limit/);
  assert.equal((await adm("/billing")).json.remaining, 0);
  result.limit = "pass";

  // upgrade: cached plan until the webhook / refresh; webhook is HMAC-checked
  subs = [{ name: "Growth", status: "ACTIVE", test: true, lineItems: rec(19) }];
  r = await proxy("Hi there"); assert.match(r.json.answer, /isn't available/, "still cached as Free");
  assert.equal((await hook("app_subscriptions/update", { app_subscription: { name: "Growth", status: "ACTIVE" } }, { bad: true })).status, 401, "unsigned webhook rejected");
  assert.equal((await hook("app_subscriptions/update", { app_subscription: { name: "Growth", status: "ACTIVE" } })).status, 200);
  r = await proxy("Hi there"); assert.doesNotMatch(r.json.answer, /isn't available/, "Growth: new chats allowed again");
  assert.equal(await chatsUsed(TA), 51);
  b = (await adm("/billing")).json; assert.deepEqual([b.plan, b.limit, b.test, b.llm], ["growth", 500, true, false]);
  // an over-limit chat without handoff resumes when the plan allows chats again (counted then)
  // Pro → LLM allowed flag in settings
  subs = [{ name: "Pro", status: "ACTIVE", lineItems: rec(49) }];
  b = (await adm("/billing?refresh=1")).json; assert.deepEqual([b.plan, b.limit, b.llm], ["pro", 2500, true]);
  assert.equal((await adm("/settings")).json.plan_llm, true);
  // Shopify API error: last known plan kept, chat never errors
  subFail = true; billing.invalidate(A);
  r = await proxy("Hello again"); assert.equal(r.status, 200);
  assert.equal((await billing.getPlan(A)).handle, "pro", "stale cache kept on API error");
  subFail = false;
  // cancelled → Free again
  subs = []; billing.invalidate(A); assert.equal((await billing.getPlan(A)).handle, "free");
  assert.ok(subCalls >= 4);
  // shop/redact removes the usage rows too
  const gdpr = await import("../gdpr.js"); await gdpr.shopRedact(A);
  assert.equal(await chatsUsed(TA), 0);
  result.plan_changes = "pass";
  console.log(JSON.stringify({ ok: true, ...result }));
} finally { server.close(); globalThis.fetch = realFetch; }
