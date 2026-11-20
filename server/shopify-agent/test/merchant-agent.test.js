// Pod.AI merchant assistant (internal agent, server/shopify-agent/merchant): planner in 5 languages, read tools,
// proposals that only run after the merchant confirms, run-once, stale-data guard, tenant isolation, audit without chat
// text, encryption at rest, GDPR deletion — over the Shopify admin API and the signed WooCommerce API.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podai-merchant-"));
for (const k of ["LLM_PROVIDER", "LLM_ENABLED", "OPENAI_API_KEY", "XAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "SENDGRID_API_KEY", "POSTMARK_SERVER_TOKEN", "SMTP_HOST"]) delete process.env[k];
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"), APP_ENCRYPTION_KEY: "m".repeat(40),
  AGENT_SHOPIFY_API_KEY: "agentkey", AGENT_SHOPIFY_API_SECRET: "agentsecret", AGENT_APP_URL: "https://app.test", PODAI_ACCESS_LOG_DIR: path.join(tmp, "acc") });
const { createApp } = await import("../../create-app.js");
const core = await import("../core.js");
const wooCore = await import("../../woo-agent/core.js");
const store = await import("../../saas-store.js");
const gdpr = await import("../gdpr.js");
const { rulePlan, validatePlan } = await import("../merchant/planner.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;
const A = "shop-a.myshopify.com", B = "shop-b.myshopify.com", TA = core.tenantFor(A), TB = core.tenantFor(B);

// No real network: Shopify Admin API answers "not installed" (plan → Free); the WordPress site answers the verify callback.
let wooNonce = null;
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  if (/\.myshopify\.com$/.test(u.host)) return Response.json({ errors: [{ message: "not installed in test" }] }, { status: 401 });
  if (u.host === "woo-m.test") return Response.json({ nonce: u.searchParams.get("nonce") === wooNonce ? wooNonce : "nope" });
  return realFetch(url, init);
};
const call = async (p, { method = "GET", body, shop = A } = {}) => {
  const r = await realFetch(base + p, { method, headers: { "Content-Type": "application/json", ...(shop ? { Authorization: `Bearer ${core.signSession(shop)}` } : {}) }, body: body == null ? undefined : JSON.stringify(body) });
  return { status: r.status, d: await r.json().catch(() => ({})) };
};
const ask = (message, opt = {}) => call("/shopify-agent/api/assistant", { method: "POST", body: { message, lang: opt.lang || "en" }, shop: opt.shop || A });

// ---- seed: shop A has chats (one unanswered question), two tickets; shop B has its own ticket ----
const iso = h => new Date(Date.now() - h * 36e5).toISOString();
const conv = (tenant, id, q, unanswered) => ({ id, tenant_id: tenant, channel: "webchat", status: "open", language: "en", created_at: iso(30), last_message_at: iso(30), intents: { shipping: 1 }, tools: {}, slots: {},
  messages: [{ role: "user", text: q, at: iso(30) }, { role: "assistant", text: unanswered ? "Sorry, I don't know." : "Yes.", at: iso(29.99), answered_by: "local", ...(unanswered ? { unanswered: true } : {}) }] });
await store.addRecord("podai_conversations", conv(TA, "c_aaaaaaaaaaaa1", "Do you ship to Iceland?", true));
await store.addRecord("podai_conversations", conv(TA, "c_aaaaaaaaaaaa2", "Is the mug dishwasher safe? my mail is ann@example.com", false));
await store.addRecord("podai_handoffs", { id: "ho_a1a1a1a1a1a1", tenant_id: TA, conversation_id: "c_aaaaaaaaaaaa2", status: "open", ticket_id: "POD-T-AB12CD", reason: "order question", customer_email: "ann@example.com",
  order_number: "#1001", language: "de", messages: [{ role: "user", text: "Wo ist meine Bestellung?", at: iso(40) }], created_at: iso(40), updated_at: iso(40) });
await store.addRecord("podai_handoffs", { id: "ho_a2a2a2a2a2a2", tenant_id: TA, conversation_id: "c_aaaaaaaaaaaa1", status: "open", reason: "shipping", customer_email: "bo@example.com", messages: [], created_at: iso(2), updated_at: iso(2) });
await store.addRecord("podai_handoffs", { id: "ho_b1b1b1b1b1b1", tenant_id: TB, conversation_id: "c_bbbbbbbbbbbb1", status: "open", reason: "B only", customer_email: "zed@example.com", messages: [], created_at: iso(5), updated_at: iso(5) });

test("rule planner understands EN / DE / FR / IT / ZH and the teach / ticket / chat commands", () => {
  const tools = m => rulePlan(m).steps.map(s => s.tool);
  assert.deepEqual(tools("What should I do today?"), ["briefing"]);
  assert.deepEqual(tools("Was steht heute an?"), ["briefing"]);
  assert.deepEqual(tools("Zeige offene Tickets"), ["open_tickets"]);
  assert.deepEqual(tools("questions sans réponse"), ["unanswered"]);
  assert.deepEqual(tools("statistiche ultimi 7 giorni"), ["kpi_report"]);
  assert.equal(rulePlan("统计 7天").steps[0].args.days, 7);
  assert.deepEqual(tools("未回答的问题"), ["unanswered"]);
  assert.deepEqual(rulePlan('answer "Do you ship to Iceland?" with "Yes, in 7–15 business days."').steps, [{ tool: "add_knowledge", args: { question: "Do you ship to Iceland?", answer: "Yes, in 7–15 business days." } }]);
  assert.equal(rulePlan("Frage: Versand nach Island?\nAntwort: Ja, 7–15 Werktage.").steps[0].tool, "add_knowledge");
  assert.deepEqual(rulePlan("close POD-T-AB12CD").steps[0], { tool: "set_ticket_status", args: { ticket: "POD-T-AB12CD", status: "closed" } });
  assert.deepEqual(rulePlan("ho_a1a1a1a1a1a1 note: called the customer").steps[0], { tool: "add_ticket_note", args: { ticket: "ho_a1a1a1a1a1a1", note: "called the customer" } });
  assert.deepEqual(rulePlan("pause the chat").steps[0], { tool: "set_chat_enabled", args: { enabled: false } });
  assert.deepEqual(rulePlan("暂停聊天").steps[0], { tool: "set_chat_enabled", args: { enabled: false } });
  assert.deepEqual(rulePlan("delete kb_1a2b3c4d").steps[0], { tool: "delete_knowledge", args: { id: "kb_1a2b3c4d" } });
  assert.deepEqual(tools("hello"), ["briefing"], "anything else → briefing");
  // invalid plans (e.g. from an LLM) are filtered, never executed
  const v = validatePlan({ steps: [{ tool: "drop_database" }, { tool: "set_ticket_status", args: { ticket: "x", status: "closed" } }, { tool: "kpi_report", args: { days: 9999 } }] });
  assert.deepEqual(v.steps, [{ tool: "kpi_report", args: { days: 30 } }]);
  assert.deepEqual(v.dropped.map(d => d.error), ["unknown_tool", "ticket_required"]);
});

test("the assistant needs a Shopify session token; briefing shows only this shop's data", async () => {
  assert.equal((await call("/shopify-agent/api/assistant", { method: "POST", body: { message: "today" }, shop: null })).status, 401);
  const r = await ask("What should I do today?");
  assert.equal(r.status, 200); assert.equal(r.d.planner, "rules");
  const b = r.d.results[0].result;
  assert.equal(b.open_tickets, 2); assert.equal(b.late_tickets, 1, "40 h old ticket is past the 24 h target");
  assert.equal(b.unanswered, 1); assert.deepEqual(b.top_unanswered, ["Do you ship to Iceland?"]);
  assert.match(r.d.reply, /2 open tickets \(1 past your 24 h reply target\)/);
  assert.ok(r.d.suggestions.some(s => s.kind === "teach") && r.d.suggestions.some(s => s.kind === "tickets"));
  const rb = await ask("open tickets", { shop: B });
  assert.deepEqual(rb.d.results[0].result.tickets.map(t => t.id), ["ho_b1b1b1b1b1b1"], "shop B never sees shop A");
  const de = await ask("Zeige offene Tickets", { lang: "de" });
  assert.match(de.d.reply, /offene Tickets/);
  const tk = await ask("show POD-T-AB12CD");
  assert.equal(tk.d.results[0].result.draft.language, "de"); assert.match(tk.d.results[0].result.draft.body, /#1001/);
});

let teachId;
test("write tools only propose; nothing changes until the merchant confirms, and it runs once", async () => {
  const r = await ask('answer "Do you ship to Iceland?" with "Yes — 7 to 15 business days, tracked."');
  assert.equal(r.d.proposals.length, 1); teachId = r.d.proposals[0].id;
  assert.equal(r.d.proposals[0].status, "proposed"); assert.equal(r.d.proposals[0].preview.effect, "new_entry");
  assert.equal((await call("/shopify-agent/api/knowledge")).d.custom.length, 0, "not applied yet");
  const again = await ask('answer "Do you ship to Iceland?" with "Yes — 7 to 15 business days, tracked."');
  assert.equal(again.d.proposals[0].id, teachId, "same proposal is not duplicated");
  assert.equal((await call(`/shopify-agent/api/assistant/actions/${teachId}/approve`, { method: "POST", body: {} })).status, 409, "explicit confirm:true required");
  assert.equal((await call(`/shopify-agent/api/assistant/actions/${teachId}/approve`, { method: "POST", body: { confirm: true }, shop: B })).status, 404, "other shop cannot approve");
  const ok = await call(`/shopify-agent/api/assistant/actions/${teachId}/approve`, { method: "POST", body: { confirm: true } });
  assert.equal(ok.status, 200); assert.equal(ok.d.status, "done");
  const kb = (await call("/shopify-agent/api/knowledge")).d.custom; assert.equal(kb.length, 1); assert.equal(kb[0].question, "Do you ship to Iceland?");
  assert.equal((await call(`/shopify-agent/api/assistant/actions/${teachId}/approve`, { method: "POST", body: { confirm: true } })).d.error, "action_done", "runs once");
  assert.equal((await ask("today")).status, 200);
});

test("reject, stale data guard, bad input, chat pause", async () => {
  const p = (await ask("close POD-T-AB12CD")).d.proposals[0];
  const rj = await call(`/shopify-agent/api/assistant/actions/${p.id}/reject`, { method: "POST", body: {} });
  assert.equal(rj.d.status, "rejected");
  assert.equal((await call(`/shopify-agent/api/assistant/actions/${p.id}/approve`, { method: "POST", body: { confirm: true } })).d.error, "action_rejected");
  // proposal made, then a teammate closes the ticket by hand → approving fails safely instead of acting on old data
  const p2 = (await ask("close POD-T-AB12CD")).d.proposals[0];
  await call("/shopify-agent/api/handoffs/ho_a1a1a1a1a1a1", { method: "PATCH", body: { status: "closed" } });
  const st = await call(`/shopify-agent/api/assistant/actions/${p2.id}/approve`, { method: "POST", body: { confirm: true } });
  assert.equal(st.d.status, "failed"); assert.equal(st.d.error, "already_in_status");
  const bad = await ask("close POD-T-ZZ9999");
  assert.equal(bad.d.proposals.length, 0); assert.equal(bad.d.failures[0].error, "ticket_not_found");
  const pause = (await ask("pause the chat")).d.proposals[0];
  assert.equal((await call(`/shopify-agent/api/assistant/actions/${pause.id}/approve`, { method: "POST", body: { confirm: true } })).d.status, "done");
  const s = (await call("/shopify-agent/api/settings")).d; assert.equal(s.enabled, false);
  assert.ok((await ask("today")).d.suggestions.some(x => x.kind === "resume"));
  // double click / two tabs: two confirmations at the same time → exactly one runs
  const resume = (await ask("resume the chat")).d.proposals[0];
  const both = await Promise.all([1, 2].map(() => call(`/shopify-agent/api/assistant/actions/${resume.id}/approve`, { method: "POST", body: { confirm: true } })));
  assert.deepEqual(both.map(r => r.status).sort(), [200, 409]);
  assert.equal(both.find(r => r.status === 200).d.status, "done");
});

test("draft answers: evidence from the shop's policies only, one proposal per draft, nothing invented", async () => {
  const merchant = await import("../merchant/index.js");
  const TD = core.tenantFor("shop-d.myshopify.com");
  for (const [i, q] of ["Do you ship to Iceland?", "Do you sell gift cards?"].entries()) await store.addRecord("podai_conversations", conv(TD, `c_dddddddddddd${i}`, q, true));
  const policies = [{ type: "SHIPPING_POLICY", title: "Shipping policy", text: "We ship to all EU and EFTA countries, including Iceland and Norway. Delivery takes 7–15 business days. Free shipping over CHF 80." },
    { type: "REFUND_POLICY", title: "Refund policy", text: "Returns are accepted within 30 days of delivery." }];
  const ctx = { tenantId: TD, actor: "test", lang: "en", profile: { facts: async () => ({ shop_name: "D", policies }) } };
  const r = await merchant.runAssistant(ctx, "draft answers");
  const res = r.results[0].result;
  assert.equal(r.results[0].tool, "draft_answers"); assert.equal(res.total, 2); assert.equal(res.drafted, 1);
  assert.deepEqual(res.drafts.find(d => /gift cards/.test(d.question)).answer, null, "no evidence → no draft (never invented)");
  assert.equal(r.proposals.length, 1); const p = r.proposals[0];
  assert.equal(p.tool, "add_knowledge"); assert.match(p.preview.answer, /Iceland/); assert.equal(p.preview.source, "Shipping policy");
  assert.match(r.reply, /drafted 1 answer/);
  assert.equal((await merchant.approve(ctx, p.id)).status, "done");
  const kb = (await store.listForTenant("podai_settings", TD))[0].custom_faq; assert.equal(kb.length, 1); assert.equal(kb[0].question, "Do you ship to Iceland?");
  assert.ok(!("source" in kb[0]), "source is shown on the proposal, not stored in the knowledge entry");
  const none = await merchant.runAssistant({ tenantId: TD, actor: "test", lang: "de", profile: { facts: async () => ({ policies: [] }) } }, "Antworten entwerfen");
  assert.equal(none.proposals.length, 0); assert.match(none.reply, /keine klare Antwort|nicht/i);
});

test("weekly summary e-mail: due Monday 07:00 UTC, once per week, can be turned off, no shopper data", async () => {
  const { sendWeeklyDigest, buildDigest, weekKey, due } = await import("../merchant/digest.js");
  assert.equal(weekKey(Date.parse("2026-11-20T12:00:00Z")), "2026-W47"); assert.equal(weekKey(Date.parse("2027-01-01T12:00:00Z")), "2026-W53");
  const mon = d => { const x = new Date(Date.now() + d * 7 * 864e5); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
  const at = (w, h) => { const x = mon(w); x.setUTCHours(h, 0, 0, 0); return x.getTime(); };
  assert.equal(due(at(1, 6)), false); assert.equal(due(at(1, 7)), true); assert.equal(due(at(1, 7) + 3 * 864e5), true, "sent late if the server was down");
  process.env.TEST_EMAIL_ALLOWLIST = "owner@alpine.example";
  await call("/shopify-agent/api/settings", { method: "PUT", body: { support_email: "owner@alpine.example", enabled: true } });
  const ctx = { tenantId: TA, shopName: "Alpine Tees", adminUrl: "https://admin.shopify.com/store/shop-a/apps/pod-ai-1" };
  const d = await buildDigest({ ...ctx, lang: "en" });
  assert.match(d.subject, /Alpine Tees/); assert.match(d.text, /open tickets?/); assert.match(d.html, /Open the Assistant/);
  assert.ok(!/@example\.com/.test(d.text + d.html), "no shopper e-mail addresses in the summary");
  assert.equal((await sendWeeklyDigest(ctx, { now: at(1, 6) })).status, "not_due");
  const both = await Promise.all([1, 2].map(() => sendWeeklyDigest(ctx, { now: at(1, 8) })));
  assert.deepEqual(both.map(r => r.status).sort(), ["already_sent", "not_configured"], "one send per week, even with two processes (no mail provider in tests → not_configured)");
  assert.equal((await sendWeeklyDigest(ctx, { now: at(1, 20) })).status, "already_sent");
  const n = (await store.listForTenant("notifications", TA)).filter(x => x.type === "podai_weekly_digest");
  assert.equal(n.length, 1); assert.equal(n[0].to, "owner@alpine.example");
  // the merchant turns it off through the assistant (confirm required), in German
  const off = (await ask("Wochen-E-Mail stoppen", { lang: "de" })).d.proposals[0];
  assert.equal(off.tool, "set_weekly_digest");
  assert.equal((await call(`/shopify-agent/api/assistant/actions/${off.id}/approve`, { method: "POST", body: { confirm: true } })).d.status, "done");
  assert.equal((await call("/shopify-agent/api/settings")).d.weekly_digest, false);
  assert.equal((await sendWeeklyDigest(ctx, { now: at(2, 8) })).status, "off");
  await call("/shopify-agent/api/settings", { method: "PUT", body: { weekly_digest: true, enabled: true } });
  const b2 = (await store.listForTenant("podai_settings", TA))[0]; assert.equal(b2.digest_lang, "de", "summary language follows the assistant language");
  // shop B: no chats this week → nothing to send; no recipient at all → no_recipient
  assert.equal((await sendWeeklyDigest({ tenantId: TB, shopName: "B" }, { now: at(1, 8) })).status, "no_recipient");
  assert.equal((await sendWeeklyDigest({ tenantId: core.tenantFor("shop-c.myshopify.com"), shopName: "C" }, { to: "owner@alpine.example", now: at(1, 8) })).status, "nothing_to_report");
  // rollout guard: PODAI_DIGEST_ONLY_TO set → other recipients are skipped and their week is not used up
  process.env.PODAI_DIGEST_ONLY_TO = "owner@test.example";
  const sd = core.tenantFor("shop-d.myshopify.com");
  assert.equal((await sendWeeklyDigest({ tenantId: sd, shopName: "D" }, { to: "merchant@real.example", now: at(1, 8) })).status, "skipped_rollout_guard");
  delete process.env.PODAI_DIGEST_ONLY_TO;
  assert.notEqual((await sendWeeklyDigest({ tenantId: sd, shopName: "D" }, { to: "merchant@real.example", now: at(1, 8) })).status, "already_sent");
});

test("audit log has events but no chat text; records are encrypted at rest; GDPR deletes them", async () => {
  const a = (await call("/shopify-agent/api/assistant/audit")).d;
  for (const ev of ["ask", "proposed", "approved", "executed", "rejected", "failed"]) assert.ok(a.some(x => x.event === ev), ev);
  assert.ok(!JSON.stringify(a).includes("Iceland") && !JSON.stringify(a).includes("@example.com"), "no chat text / e-mail in the audit log");
  const list = (await call("/shopify-agent/api/assistant/actions")).d; assert.ok(list.length >= 4);
  await store.flushStore();
  const raw = fs.readFileSync(process.env.STORE_PERSIST_PATH, "utf8");
  assert.ok(!raw.includes("7 to 15 business days") && raw.includes("podai_merchant_actions"), "proposals encrypted on disk");
  // customers/redact: proposals that quote the customer's e-mail are removed
  const note = (await ask("ho_a2a2a2a2a2a2 note: customer bo@example.com called")).d.proposals[0];
  assert.ok(note);
  await gdpr.customerRedact(A, { customer: { email: "bo@example.com" } });
  assert.ok(!(await store.listForTenant("podai_merchant_actions", TA)).some(x => x.id === note.id));
  await gdpr.shopRedact(A);
  assert.equal((await store.listForTenant("podai_merchant_actions", TA)).length, 0);
  assert.equal((await store.listForTenant("podai_merchant_audit", TA)).length, 0);
  assert.equal((await store.listForTenant("podai_digests", TA)).length, 0);
  assert.ok((await store.listForTenant("podai_handoffs", TB)).length === 1, "other shops untouched");
});

test("WooCommerce: same assistant over the signed site API; disconnect removes its records", async () => {
  wooNonce = crypto.randomBytes(16).toString("hex");
  const reg = await realFetch(`${base}/woo-agent/v1/register`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ site_url: "http://woo-m.test", rest_url: "http://woo-m.test/wp-json/", name: "Woo M", nonce: wooNonce, currency: "CHF" }) });
  const c = await reg.json(); assert.equal(reg.status, 200);
  const woo = async (method, route, body) => { const raw = body === undefined ? "" : JSON.stringify(body);
    const h = wooCore.signedHeaders(c.site_id, c.secret, { method, route: `/woo-agent/v1${route.split("?")[0]}`, body: raw });
    const r = await realFetch(`${base}/woo-agent/v1${route}`, { method, headers: { "Content-Type": "application/json", ...h }, body: method === "GET" ? undefined : raw });
    return { status: r.status, d: await r.json().catch(() => ({})) }; };
  assert.equal((await realFetch(`${base}/woo-agent/v1/assistant`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401, "unsigned refused");
  const br = await woo("POST", "/assistant", { message: "Was steht heute an?", lang: "de", actor: "anna" });
  assert.equal(br.status, 200); assert.equal(br.d.results[0].tool, "briefing"); assert.match(br.d.reply, /Keine offenen Tickets/);
  const p = (await woo("POST", "/assistant", { message: 'answer "Do you gift wrap?" with "Yes, for CHF 5 per order."' })).d.proposals[0];
  assert.equal((await woo("POST", `/assistant/actions/${p.id}/approve`, { confirm: true })).d.status, "done");
  // the shopper asking exactly the taught question gets the merchant's answer, even when the words look like another intent
  const pick = (await woo("POST", "/assistant", { message: 'answer "Can I pick up my order in Zurich?" with "Yes, at our Zurich shop, Mon–Sat 10–18."' })).d.proposals[0];
  assert.equal((await woo("POST", `/assistant/actions/${pick.id}/approve`, { confirm: true })).d.status, "done");
  assert.equal((await woo("POST", "/chat", { message: "Can I pick up my order in Zurich?", lang: "en" })).d.answer, "Yes, at our Zurich shop, Mon–Sat 10–18.");
  assert.notEqual((await woo("POST", "/chat", { message: "Where is my order #1001? buyer@example.com", lang: "en" })).d.answer, "Yes, at our Zurich shop, Mon–Sat 10–18.", "order numbers still go to order lookup");
  await woo("POST", `/assistant`, { message: "knowledge" });
  // the plugin's FAQ push (settings save / daily) keeps answers taught through the assistant
  await woo("POST", "/store", { settings: { custom_faq: [{ question: "Can I pick up my order?", answer: "Yes, in our Zurich shop." }] } });
  const kb = (await woo("POST", "/assistant", { message: "knowledge" })).d.results[0].result.entries.map(e => e.question).sort();
  assert.deepEqual(kb, ["Can I pick up my order in Zurich?", "Can I pick up my order?", "Do you gift wrap?"]);
  await woo("POST", "/store", { settings: { custom_faq: [{ question: "Do you gift wrap?", answer: "Yes, free of charge." }] } });
  const kb2 = (await woo("POST", "/assistant", { message: "knowledge" })).d.results[0].result.entries;
  assert.deepEqual(kb2.map(e => [e.question, e.answer]), [["Do you gift wrap?", "Yes, free of charge."], ["Can I pick up my order in Zurich?", "Yes, at our Zurich shop, Mon–Sat 10–18."]], "same question in WP wins; other taught answers stay");
  const audit = (await woo("GET", "/assistant/audit")).d; assert.ok(audit.some(x => x.actor === "woo_admin:anna" && x.event === "ask"));
  const T = wooCore.tenantFor(c.site_id);
  const acts = await store.listForTenant("podai_merchant_actions", T); assert.equal(acts.length, 2, JSON.stringify(acts.map(a => [a.tool, a.status])));
  // drafts on WooCommerce use the policies the plugin pushed
  await woo("POST", "/store", { store: { name: "Woo M", policies: [{ type: "SHIPPING_POLICY", title: "Shipping", text: "We ship to Switzerland and the EU within 3–5 business days. Express delivery is available for Germany and Austria." }] } });
  await store.addRecord("podai_conversations", conv(T, "c_wwwwwwwwwwww1", "Do you have express delivery to Austria?", true));
  const dr = await woo("POST", "/assistant", { message: "draft answers" });
  assert.equal(dr.d.results[0].tool, "draft_answers"); assert.equal(dr.d.proposals.length, 1, JSON.stringify(dr.d.results[0].result)); assert.match(dr.d.proposals[0].preview.answer, /Express/);
  // hourly job: the connected site is checked once the week's summary is due (no recipient e-mail in this test site)
  const { runWooDigests } = await import("../../woo-agent/digest-job.js");
  const mon8 = (() => { const x = new Date(Date.now() + 7 * 864e5); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); x.setUTCHours(8, 0, 0, 0); return x.getTime(); })();
  assert.equal((await runWooDigests(mon8 - 2 * 36e5)).checked, 0, "not due before Monday 07:00 UTC");
  const jr = await runWooDigests(mon8); assert.ok(jr.checked >= 1 && jr.results[c.site_id], JSON.stringify(jr));
  const { runShopifyDigests } = await import("../digest-job.js"); assert.ok((await runShopifyDigests(mon8)).checked >= 0);
  assert.equal((await woo("POST", "/disconnect", {})).status, 200);
  assert.equal((await store.listForTenant("podai_merchant_actions", T)).length, 0);
  assert.equal((await store.listForTenant("podai_merchant_audit", T)).length, 0);
});

test.after(() => server.close());
