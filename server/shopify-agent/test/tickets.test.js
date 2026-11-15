// Pod.AI "Contact us" tickets: handoff + e-mail → POD-T-… per shop, transcript to the merchant's ticket e-mail (Reply-To customer),
// no mail to the shopper, notes / Pending / Closed in the admin API. Test mode: mail only to TEST_EMAIL_ALLOWLIST.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podai-tk-"));
for (const k of ["LLM_PROVIDER", "OPENAI_API_KEY", "XAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "SENDGRID_API_KEY", "POSTMARK_SERVER_TOKEN", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"]) delete process.env[k];
Object.assign(process.env, { NODE_ENV: "test", STORE_PERSIST_PATH: path.join(tmp, "state.json"), TEST_EMAIL_ALLOWLIST: "qa-inbox@example.com", PODAI_ACCESS_LOG_DIR: path.join(tmp, "acc") });
const a = await import("../engine/agent.js");
const s = await import("../engine/store.js");
const { putAgentSettings } = await import("../engine/kpis.js");
const { findRecord, getState } = await import("../../saas-store.js");
const profile = { shop: "dropkingdev.myshopify.com", facts: async () => ({ shop_name: "Drop King", email: "owner@example.com", currency: "CHF", policies: [] }), searchKnowledge: async () => [],
  createTools: () => ({ definitions: [], execute: async () => ({}) }), systemPrompt: () => "", ruleAnswer: async ctx => { ctx.unanswered = true; return "unknown"; } };
const chat = (T, c, message, lang = "en") => a.handleChat({ tenantId: T, message, conversation_id: c, lang, profile });

test("handoff + widget e-mail → ticket, transcript to the merchant ticket e-mail only", async () => {
  const T = "shopagent_dropkingdev.myshopify.com";
  await putAgentSettings(T, { support_email: "qa-inbox@example.com" });
  let r = await chat(T, undefined, "Where can I see the size chart for hoodies?"); const c = r.conversation_id;
  r = await chat(T, c, "talk to a person"); assert.ok(r.handoff); assert.ok(r.ui.some(u => u.type === "handoff" && !u.email), "widget shows the e-mail field");
  const n0 = ((await getState()).notifications || []).length;
  r = await chat(T, c, "anna@example.com");
  assert.match(r.answer, /ticket number is POD-T-[A-Z2-9]{6}/); assert.ok(!r.answer.includes("anna@example.com"), "masked in the reply");
  const conv = await findRecord("podai_conversations", c), h = await findRecord("podai_handoffs", conv.handoff_id);
  assert.match(h.ticket_id, /^POD-T-/); assert.equal(h.tenant_id, T); assert.equal(h.kind, "ticket"); assert.ok(h.messages.some(m => /size chart/.test(m.text)), "full chat in the ticket");
  const sent = ((await getState()).notifications || []).slice(n0);
  assert.equal(sent.length, 1, "one mail: merchant only, nothing to the shopper"); assert.equal(sent[0].to, "qa-inbox@example.com"); assert.ok(sent[0].subject.includes(h.ticket_id) && sent[0].subject.includes("Drop King"));
  r = await chat(T, c, "anna@example.com"); const h2 = await findRecord("podai_handoffs", conv.handoff_id); assert.equal(h2.ticket_id, h.ticket_id, "same ticket, no second mail");
  assert.equal(((await getState()).notifications || []).length, n0 + 1);
  let u = await s.updateHandoff(T, h.id, { status: "pending", add_note: "asked warehouse" }); assert.equal(u.status, "in_progress"); assert.equal(u.notes[0].text, "asked warehouse");
  u = await s.updateHandoff(T, h.id, { status: "closed" }); assert.equal(u.status, "resolved");
  assert.equal(await s.updateHandoff("shopagent_other.myshopify.com", h.id, { status: "open" }), null, "other shops can't touch it");
});
test("no ticket e-mail set → shop contact e-mail; outside the allowlist it is skipped in tests", async () => {
  const T = "shopagent_two.myshopify.com";
  let r = await chat(T, undefined, "Ich möchte mit einem Mitarbeiter sprechen, meine E-Mail ist bob@example.com", "de"); assert.match(r.answer, /Ticketnummer ist POD-T-/);
  const conv = await findRecord("podai_conversations", r.conversation_id), h = await findRecord("podai_handoffs", conv.handoff_id);
  assert.deepEqual(h.email_log.map(l => `${l.kind}:${l.status}`), ["team:skipped_test_mode"]); assert.match(h.email_log[0].to, /^ow\*\*\*@example\.com$/);
  const bad = await putAgentSettings(T, { support_email: "not-an-email" }); assert.equal(bad.support_email, "");
});
