// Pod.AI: open handoff — the AI still answers what it can, replies in the current message's language,
// "Back to AI" ends the handoff for the bot, and a resolved / 24 h idle handoff auto-closes for the bot.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podai-ho-"));
for (const k of ["LLM_PROVIDER", "OPENAI_API_KEY", "XAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) delete process.env[k];
Object.assign(process.env, { NODE_ENV: "test", STORE_PERSIST_PATH: path.join(tmp, "state.json") });
const a = await import("../engine/agent.js");
const s = await import("../engine/store.js");
const { findRecord, updateRecord } = await import("../../saas-store.js");
const profile = { facts: async () => ({ shop_name: "x", policies: [] }), searchKnowledge: async () => [], createTools: () => ({ definitions: [], execute: async () => ({}) }), systemPrompt: () => "",
  ruleAnswer: async (ctx, m, t) => { if (/product|商品/i.test(t)) { ctx.ui.push({ type: "products", items: [{ name: "Snow" }] }); return "Here are a few picks."; } ctx.unanswered = true; return "unknown"; } };
const chat = (T, c, message) => a.handleChat({ tenantId: T, message, conversation_id: c, lang: "en", profile });

test("open handoff: answers products in English, unanswerable → team, Back to AI, auto-close", async () => {
  const T = "tenant_ho1";
  let r = await chat(T, undefined, "我要转人工"); const c = r.conversation_id;
  assert.equal(r.language, "zh"); assert.ok(r.handoff);
  r = await chat(T, c, "Show me some products");
  assert.equal(r.language, "en"); assert.equal(r.answer, "Here are a few picks."); assert.ok(r.ui.some(u => u.type === "products"));
  r = await chat(T, c, "asdf qwerty zxcv");
  assert.equal(r.handoff, "pending"); assert.match(r.answer, /added it to your request/); assert.ok(r.ui.some(u => u.type === "chips" && u.items.includes("Back to AI")));
  const conv = await findRecord("podai_conversations", c); const h = await findRecord("podai_handoffs", conv.handoff_id);
  assert.ok(h.messages.some(m => m.text === "asdf qwerty zxcv")); assert.ok(!h.messages.some(m => m.text === "Show me some products"));
  r = await chat(T, c, "Back to AI"); assert.match(r.answer, /I'm back/);
  r = await chat(T, c, "asdf qwerty zxcv"); assert.equal(r.answer, "unknown"); assert.ok(!r.handoff);
});
test("handoff auto-closes for the bot when resolved or idle > 24 h", async () => {
  const T = "tenant_ho2";
  let r = await chat(T, undefined, "talk to a person"); const c = r.conversation_id;
  let conv = await findRecord("podai_conversations", c);
  assert.equal(await s.handoffStillOpen(conv), true);
  assert.equal(await s.handoffStillOpen(conv, Date.now() + 25 * 3600e3), false); assert.equal(conv.status, "open");
  conv = await findRecord("podai_conversations", c); await updateRecord("podai_handoffs", conv.handoff_id, { status: "resolved" });
  assert.equal(await s.handoffStillOpen(conv), false);
  r = await chat(T, c, "asdf qwerty zxcv"); assert.equal(r.answer, "unknown");
});
