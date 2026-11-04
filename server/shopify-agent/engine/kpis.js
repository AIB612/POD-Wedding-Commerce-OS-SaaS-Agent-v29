// Pod.AI copy of the Wed.AI POD Agent engine (server/pod-agent/customer). Pod.AI-only: edit here, never the site agent.
// Back-office side of the customer chat (Admin → AI Agent, behind the admin login). Ported from the POD Agent:
//   metrics.js  KPIs (conversations, automation / handoff rate, unanswered rate, feedback, intents, tools, guardrails)
//   handoff.js  handoff queue (status, team note) — the team replies from their own mailbox; nothing is sent from here
//   knowledge   custom FAQ management + retrieval test ("eval")
//   datacheck.js K/C checks (placeholders, internal data, answer length, duplicates, configuration)
// Skipped (already in our Admin): admin login/permissions (admin-auth), shops/Shopify (Shopify section), tracking CSV
// import + carrier polling (Carriers section), promo codes (Promo codes section), back-office agent (ops agent).
import crypto from "node:crypto";
import { getSettings, saveSettings, listConversations, listHandoffs, updateHandoff, discountsIssued, DEFAULT_SETTINGS } from "./store.js";
import { llmStatus } from "./llm.js";
import { CONFIDENCE_THRESHOLD } from "./router.js";
class HttpError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }

/** The Overview KPIs, in display order (agentOverview returns exactly these; /api/pod-agent/status and agent.html show the count). */
export const KPI_IDS = ["conversations", "answered_local", "answered_llm", "messages", "avg_messages", "automation_rate", "handoff_rate", "unanswered_rate", "satisfaction",
  "quotes", "recommendations", "order_lookups", "open_handoffs", "guardrail_hits", "discounts_issued"];
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

export async function agentOverview(tenantId, { days = 30 } = {}) {
  const since = Date.now() - days * 864e5;
  const convs = (await listConversations(tenantId, { limit: 100000 })).filter(c => Date.parse(c.created_at) >= since);
  const handoffs = (await listHandoffs(tenantId)).filter(h => Date.parse(h.created_at) >= since);
  const msgs = convs.flatMap(c => c.messages || []), user = msgs.filter(m => m.role === "user"), bot = msgs.filter(m => m.role === "assistant");
  const fb = bot.filter(m => m.feedback), up = fb.filter(m => m.feedback > 0).length;
  const intents = {}, tools = {};
  for (const c of convs) { for (const [k, v] of Object.entries(c.intents || {})) intents[k] = (intents[k] || 0) + v; for (const [k, v] of Object.entries(c.tools || {})) tools[k] = (tools[k] || 0) + v; }
  const unanswered = [];
  for (const c of convs) (c.messages || []).forEach((m, i, a) => { if (m.role === "assistant" && m.unanswered && a[i - 1]?.role === "user") unanswered.push({ text: a[i - 1].text, at: a[i - 1].at, conversation_id: c.id }); });
  const guard = (intents.injection || 0) + (intents.payment_data || 0);
  const handed = convs.filter(c => c.handoff_id).length;
  // Answer path (router.js): local rule engine + shop data vs LLM. Older messages without a path count as local (no LLM key until now).
  const answered = bot.filter(m => m.answered_by || m.intent);
  const viaLlm = answered.filter(m => m.answered_by === "llm").length, viaLocal = answered.length - viaLlm;
  const routes = {};
  for (const m of answered) { const r = String(m.route || "legacy").split("|"); const k = `${m.answered_by || "local"} · ${r[0]}${r.slice(1).length ? ` (${r.slice(1).join(", ")})` : ""}`; routes[k] = (routes[k] || 0) + 1; }
  const kpis = [
    { id: "conversations", label: "Conversations", value: convs.length },
    { id: "answered_local", label: "Answered locally (rules + shop data)", value: pct(viaLocal, answered.length), unit: "%", note: `${viaLocal} replies` },
    { id: "answered_llm", label: "Answered by LLM", value: pct(viaLlm, answered.length), unit: "%", note: `${viaLlm} replies${llmStatus().available ? "" : " · no key configured"}` },
    { id: "messages", label: "Customer messages", value: user.length },
    { id: "avg_messages", label: "Messages per conversation", value: convs.length ? Math.round((user.length / convs.length) * 10) / 10 : null },
    { id: "automation_rate", label: "Solved without a human", value: pct(convs.length - handed, convs.length), unit: "%", target: 80 },
    { id: "handoff_rate", label: "Handed to the team", value: pct(handed, convs.length), unit: "%", target_max: 20 },
    { id: "unanswered_rate", label: "Unanswered replies", value: pct(unanswered.length, bot.length), unit: "%", target_max: 10 },
    { id: "satisfaction", label: "Positive feedback", value: pct(up, fb.length), unit: "%", target: 85, note: `${fb.length} ratings` },
    { id: "quotes", label: "Shipping quotes given", value: tools.quote_shipping || 0 },
    { id: "recommendations", label: "Product recommendations", value: tools.recommend_products || 0 },
    { id: "order_lookups", label: "Order lookups", value: (tools.find_order || 0) + (tools.get_tracking || 0) },
    { id: "open_handoffs", label: "Open handoffs", value: (await listHandoffs(tenantId)).filter(h => h.status !== "resolved").length },
    { id: "guardrail_hits", label: "Guardrail refusals", value: guard },
    { id: "discounts_issued", label: "Chat discount codes", value: (await discountsIssued(tenantId)).filter(d => Date.parse(d.created_at) >= since).length }
  ].map(k => ({ ...k, status: k.value == null ? "NO DATA" : k.target != null ? (k.value >= k.target ? "PASS" : "WARN") : k.target_max != null ? (k.value <= k.target_max ? "PASS" : "WARN") : "INFO" }));
  return { days, llm: llmStatus(), kpis, intents, tools, routes, routing: { strategy: "local_first", threshold: CONFIDENCE_THRESHOLD }, handoff_reasons: handoffs.reduce((a, h) => ((a[h.reason] = (a[h.reason] || 0) + 1), a), {}), unanswered: unanswered.slice(-20).reverse() };
}

export async function agentConversations(tenantId, { limit = 50 } = {}) {
  return (await listConversations(tenantId, { limit: Math.min(200, limit) })).map(c => ({ id: c.id, created_at: c.created_at, last_message_at: c.last_message_at, language: c.language, status: c.status,
    messages: (c.messages || []).length, intents: c.intents, paths: { local: c.paths?.local || 0, llm: c.paths?.llm || 0 }, handoff_id: c.handoff_id, preview: (c.messages || []).filter(m => m.role === "user").slice(-1)[0]?.text?.slice(0, 140) || "", transcript: (c.messages || []).slice(-20) }));
}
export const agentHandoffs = (tenantId, q) => listHandoffs(tenantId, q);
export async function patchHandoff(tenantId, id, body) { const r = await updateHandoff(tenantId, id, body || {}); if (!r) throw new HttpError(404, "handoff_not_found", "Handoff not found"); return r; }

const num = (v, min, max, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
export async function putAgentSettings(tenantId, b = {}) {
  const cur = await getSettings(tenantId), sd = b.sales_discount || {};
  return saveSettings(tenantId, {
    enabled: b.enabled === undefined ? cur.enabled : b.enabled !== false,
    human_reply_hours: num(b.human_reply_hours, 1, 168, cur.human_reply_hours),
    failed_answers_before_handoff: num(b.failed_answers_before_handoff, 1, 10, cur.failed_answers_before_handoff),
    max_messages_per_10min: num(b.max_messages_per_10min, 3, 100, cur.max_messages_per_10min),
    max_tokens_per_conversation: num(b.max_tokens_per_conversation, 1000, 500000, cur.max_tokens_per_conversation),
    greeting: { en: String(b.greeting?.en ?? cur.greeting.en).slice(0, 300), zh: String(b.greeting?.zh ?? cur.greeting.zh).slice(0, 300), de: String(b.greeting?.de ?? cur.greeting.de).slice(0, 300) },
    sales_discount: { enabled: sd.enabled === undefined ? cur.sales_discount.enabled : sd.enabled === true, percent: num(sd.percent, 1, 30, cur.sales_discount.percent),
      valid_hours: num(sd.valid_hours, 1, 720, cur.sales_discount.valid_hours), per_customer_days: num(sd.per_customer_days, 1, 365, cur.sales_discount.per_customer_days), max_per_month: num(sd.max_per_month, 0, 1000, cur.sales_discount.max_per_month) }
  });
}

// ---- Knowledge (custom FAQ) ----
const PLACEHOLDER = /\bTODO\b|\bTBD\b|\bxxx\b|\[\s*\]|待定|待补|请填写|\?\?\?/i;
const INTERNAL = /成本价|进货价|利润|毛利|\bcost price\b|\bmargin\b|\bpurchase price\b|supplier price|供应商价格/i;
export async function upsertKnowledge(tenantId, b = {}) {
  const q = String(b.question || "").trim().slice(0, 200), a = String(b.answer || "").trim().slice(0, 1500);
  if (q.length < 5 || a.length < 10) throw new HttpError(400, "invalid_entry", "Question (≥5 chars) and answer (≥10 chars) are required");
  const s = await getSettings(tenantId), list = [...s.custom_faq], id = b.id && list.some(x => x.id === b.id) ? b.id : `kb_${crypto.randomBytes(4).toString("hex")}`;
  const row = { id, question: q, answer: a, tags: String(b.tags || "").slice(0, 200), lang: ["en", "zh", "de", "fr", "it"].includes(b.lang) ? b.lang : "en", active: b.active !== false, updated_at: new Date().toISOString() };
  const i = list.findIndex(x => x.id === id); if (i >= 0) list[i] = row; else list.push(row);
  if (list.length > 200) throw new HttpError(400, "too_many_entries", "At most 200 custom entries");
  await saveSettings(tenantId, { custom_faq: list });
  return row;
}
export async function deleteKnowledge(tenantId, id) { const s = await getSettings(tenantId); await saveSettings(tenantId, { custom_faq: s.custom_faq.filter(x => x.id !== id) }); return { ok: true }; }

/** POD Agent datacheck (K = knowledge, C = configuration). Score = 100 − 10×error − 2×warn. */
export async function dataCheck(tenantId) {
  const s = await getSettings(tenantId), out = [], f = (level, code, where, message, fix) => out.push({ level, code, where, message, fix });
  const seen = new Set();
  for (const e of s.custom_faq) {
    const w = `Knowledge → ${e.question.slice(0, 60)}`, key = e.question.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (seen.has(key)) f("warn", "K1", w, "Duplicate question", "Merge the entries"); seen.add(key);
    if (e.answer.length < 30) f("warn", "K3", w, "Answer shorter than 30 characters", "Give a complete answer");
    if (e.answer.length > 1200) f("warn", "K4", w, "Answer longer than 1200 characters", "Split into several entries");
    if (PLACEHOLDER.test(e.question + " " + e.answer)) f("error", "K5", w, "Placeholder text (TODO / TBD / [ ])", "Replace with the real answer");
    if (INTERNAL.test(e.answer)) f("error", "K6", w, "Answer mentions internal data (cost / margin / supplier)", "Remove internal information");
    if (!/[?？]$/.test(e.question)) f("warn", "K2", w, "Title is not written as a question", "Write it as the customer would ask");
  }
  const llm = llmStatus();
  if (!llm.available) f("warn", "C1", "Configuration", `No LLM key configured — the chat runs on the rule engine (missing: ${llm.missing.join(", ")})`, "Add the key + model to the server .env and restart");
  else if (!llm.tool_calling) f("warn", "C2", "Configuration", `${llm.provider} has no tool calling here — tools run via the rule engine`, "Use openai, xai or deepseek for full tool calling");
  const open = (await listHandoffs(tenantId)).filter(h => h.status !== "resolved" && Date.now() - Date.parse(h.created_at) > s.human_reply_hours * 3600e3);
  if (open.length) f("error", "C3", "Handoffs", `${open.length} handoff(s) older than the promised ${s.human_reply_hours} h reply time`, "Answer them and mark resolved");
  if (!s.enabled) f("warn", "C4", "Settings", "The chat assistant is switched off", "Enable it in Settings");
  const errors = out.filter(x => x.level === "error").length, warns = out.filter(x => x.level === "warn").length;
  return { score: Math.max(0, 100 - 10 * errors - 2 * warns), errors, warnings: warns, findings: out };
}
export { getSettings, DEFAULT_SETTINGS };
