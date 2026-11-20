// ┌─ 文件卡片 File card ─────────────────────────────────────────────────────────────────────────────────┐
// │ 这是什么 What: Pod.AI「商家助理」(对内 Agent) 的工具箱。每个工具 = 助理会做的一件事。                    │
// │   Toolbox of the Pod.AI merchant assistant (the internal agent). One tool = one thing it can do.     │
// │   · read  工具：只读，马上执行（今日重点、未回答问题、工单、指标、知识库、搜索聊天）                       │
// │   · write 工具：会改 Pod.AI 的数据 → 先生成「待确认操作」，商家点「确认」才执行。                          │
// │     write tools only create a proposal; they run after the merchant clicks Confirm (actions.js).     │
// │   只读写 Pod.AI 自己的数据（podai_*）。不改 Shopify / WooCommerce 店铺本身（App 只有只读权限）。          │
// │   Only Pod.AI's own data (podai_*). Never writes to the shop itself (the app has read-only scopes).  │
// │ 对应功能 Feature: Shopify 内嵌后台「Assistant」页；WooCommerce /woo-agent/v1/assistant。                │
// │ 要不要改 Edit?: ✎ 可以改 — 新工具：复制一个现有工具，填 name/kind/args/parse/run（write 还要 preview），    │
// │   在 planner.js 加触发词，在 reply.js 加一句回答，在测试 merchant-agent.test.js 加一条。                  │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
import { dashboard } from "../dashboard.js";
import { listHandoffs, updateHandoff, listConversations, getSettings, saveSettings } from "../engine/store.js";
import { upsertKnowledge, deleteKnowledge } from "../engine/kpis.js";
import { findRecord } from "../../saas-store.js";

// ------------------------------------------------------------------------------------------------------
// 小工具 Helpers
// ------------------------------------------------------------------------------------------------------
export class ToolError extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail || null; } }
const need = (ok, code, detail) => { if (!ok) throw new ToolError(code, detail); };
const str = (v, n = 200) => String(v ?? "").trim().slice(0, n);
const H = 36e5;
const hoursSince = iso => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? Math.round((Date.now() - t) / H * 10) / 10 : null; };
const OPEN = ["open", "in_progress"];
/** 工单状态（给商家看的）↔ 存储值 Ticket status shown to merchants ↔ stored value. */
export const TICKET_STATUS = { open: "open", pending: "in_progress", closed: "resolved" };
const shownStatus = s => s === "in_progress" ? "pending" : s === "resolved" ? "closed" : "open";
export const normQ = x => String(x || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const HANDOFF_ID = /^ho_[a-f0-9]{6,24}$/i, TICKET_ID = /^POD-T-[A-Z0-9]{4,12}$/i, KB_ID = /^kb_[a-f0-9]{4,16}$/i;

/** 用 ho_… 或 POD-T-… 找工单（只在本店铺）Find a ticket of THIS tenant by internal id or ticket number. */
async function findTicket(tenantId, ref) {
  const r = str(ref, 40);
  if (HANDOFF_ID.test(r)) { const h = await findRecord("podai_handoffs", r); return h && h.tenant_id === tenantId ? h : null; }
  if (TICKET_ID.test(r)) return (await listHandoffs(tenantId)).find(h => String(h.ticket_id || "").toUpperCase() === r.toUpperCase()) || null;
  return null;
}
const ticketRow = h => ({ id: h.id, ticket_id: h.ticket_id || null, status: shownStatus(h.status), reason: str(h.reason, 120), summary: str(h.summary, 160),
  email: h.customer_email || "", order_number: h.order_number || "", language: h.language || null, waiting_h: hoursSince(h.created_at), created_at: h.created_at });

/** 30 天看板（不调用 Shopify：不传 shop）30-day dashboard from Pod.AI data only (no shop → no Admin API call). */
const board = (tenantId, days = 30) => dashboard(tenantId, null, { days });

// ------------------------------------------------------------------------------------------------------
// 工具定义 Tool definitions
//   name    唯一名字（大模型规划器也用这个）unique id, also used by the optional LLM planner
//   kind    "read" 立即执行 · "write" 只生成待确认操作
//   llm     给大模型看的一句英文说明 one-line English description for the LLM planner
//   args    参数说明 { name: "description" }
//   parse   清洗参数（不合格就抛 ToolError）validate + clean args
//   preview (write) 执行前检查 + 会发生什么；保存在待确认操作上 checks + what will happen; stored on the proposal
//   run     执行。write 工具只在商家确认后调用，并拿到当时的 preview。
// ------------------------------------------------------------------------------------------------------
export const TOOLS = {};
const def = t => { TOOLS[t.name] = t; };

def({
  name: "briefing", kind: "read",
  llm: "What needs the merchant's attention now: chats this week, AI resolution rate, unanswered questions, open tickets vs. reply target, plan usage, chat on/off.",
  args: {}, parse: () => ({}),
  async run({ tenantId, usage }) {
    const d = await board(tenantId, 7), s = await getSettings(tenantId);
    const k = Object.fromEntries(d.primary.map(p => [p.id, p.value]));
    const open = (await listHandoffs(tenantId)).filter(h => OPEN.includes(h.status));
    const late = open.filter(h => (hoursSince(h.created_at) ?? 0) > (Number(s.human_reply_hours) || 24));
    const plan = usage ? await usage().catch(() => null) : null;
    const planPct = plan?.limit ? Math.round(plan.used / plan.limit * 100) : null;
    // 建议的下一步：只是可点的文字，点了才会生成操作 Suggested next commands — text only; nothing is staged.
    const suggestions = [];
    if (late.length) suggestions.push({ cmd: "tickets", n: late.length });
    for (const u of d.unanswered.slice(0, 2)) suggestions.push({ cmd: "teach", question: str(u.text, 160) });
    if (planPct != null && planPct >= 80) suggestions.push({ cmd: "plan", pct: planPct });
    if (!s.enabled) suggestions.push({ cmd: "resume" });
    return { days: 7, chat_enabled: s.enabled !== false, conversations: k.conversations ?? 0, resolution_rate: k.resolution_rate ?? null, hours_saved: k.hours_saved ?? 0, wismo_self: k.wismo ?? 0,
      unanswered: d.unanswered.length, top_unanswered: d.unanswered.slice(0, 3).map(u => str(u.text, 160)),
      open_tickets: open.length, late_tickets: late.length, reply_target_h: Number(s.human_reply_hours) || 24, oldest_wait_h: d.sla.oldest_wait_h,
      knowledge_entries: s.custom_faq.length, plan: plan ? { name: plan.name || plan.plan || "", used: plan.used, limit: plan.limit, pct: planPct } : null, suggestions };
  }
});

def({
  name: "kpi_report", kind: "read",
  llm: "Chat KPIs for 7, 30 or 90 days with the change vs. the previous period (conversations, resolution rate, hours saved, order self-service, clicks, first response time).",
  args: { days: "7 | 30 | 90" }, parse: (a = {}) => ({ days: [7, 30, 90].includes(Number(a.days)) ? Number(a.days) : 30 }),
  async run({ tenantId }, { days }) { const d = await board(tenantId, days); return { days, empty: d.empty, kpis: d.primary.map(p => ({ id: p.id, value: p.value, unit: p.unit || "", trend: p.trend ?? null })) }; }
});

def({
  name: "unanswered", kind: "read",
  llm: "Shopper questions the chat could not answer (last 90 days), newest first — candidates for new knowledge entries.",
  args: { limit: "1-20" }, parse: (a = {}) => ({ limit: Math.min(20, Math.max(1, Math.floor(Number(a.limit) || 10))) }),
  async run({ tenantId }, { limit }) { const d = await board(tenantId, 90); return { total: d.unanswered.length, questions: d.unanswered.slice(0, limit).map(u => ({ text: str(u.text, 300), at: u.at })) }; }
});

def({
  name: "top_topics", kind: "read",
  llm: "What shoppers ask about most (intents) and which languages they write in, for 7/30/90 days.",
  args: { days: "7 | 30 | 90" }, parse: (a = {}) => ({ days: [7, 30, 90].includes(Number(a.days)) ? Number(a.days) : 30 }),
  async run({ tenantId }, { days }) { const d = await board(tenantId, days); return { days, topics: d.intents, languages: d.languages }; }
});

def({
  name: "open_tickets", kind: "read", personal: true,
  llm: "Tickets / handoffs still waiting for the merchant's team (open + pending), oldest first, with waiting time.",
  args: {}, parse: () => ({}),
  async run({ tenantId }) {
    const s = await getSettings(tenantId), target = Number(s.human_reply_hours) || 24;
    const rows = (await listHandoffs(tenantId)).filter(h => OPEN.includes(h.status)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return { total: rows.length, reply_target_h: target, tickets: rows.slice(0, 25).map(h => ({ ...ticketRow(h), late: (hoursSince(h.created_at) ?? 0) > target })) };
  }
});

def({
  name: "ticket_detail", kind: "read", personal: true,
  llm: "One ticket with its chat transcript, team notes and a suggested reply draft the merchant can copy.",
  args: { ticket: "ho_… id or POD-T-… number" },
  parse: (a = {}) => { const r = str(a.ticket || a.id, 40); need(HANDOFF_ID.test(r) || TICKET_ID.test(r), "ticket_required"); return { ticket: r }; },
  async run({ tenantId, shopName }, { ticket }) {
    const h = await findTicket(tenantId, ticket); need(h, "ticket_not_found");
    return { ticket: { ...ticketRow(h), messages: (h.messages || []).slice(-12).map(m => ({ role: m.role, text: str(m.text, 600), at: m.at })),
      notes: (h.notes || []).slice(-10).map(n => ({ at: n.at, text: str(n.text, 300) })) }, draft: replyDraft(h, shopName) };
  }
});

def({
  name: "knowledge_list", kind: "read",
  llm: "The merchant's own knowledge entries (question → answer) the chat uses.",
  args: { query: "optional text" }, parse: (a = {}) => (str(a.query, 80) ? { query: str(a.query, 80) } : {}),
  async run({ tenantId }, { query }) {
    let rows = (await getSettings(tenantId)).custom_faq;
    if (query) { const q = normQ(query); rows = rows.filter(x => normQ(x.question + " " + x.answer + " " + (x.tags || "")).includes(q)); }
    return { total: rows.length, entries: rows.slice(0, 30).map(x => ({ id: x.id, question: x.question, answer: str(x.answer, 240), active: x.active !== false })) };
  }
});

def({
  name: "search_chats", kind: "read", personal: true,
  llm: "Find recent chat messages containing a word or phrase (last 300 conversations).",
  args: { query: "text, at least 3 characters" },
  parse: (a = {}) => { const q = str(a.query, 80); need(q.length >= 3, "query_required"); return { query: q }; },
  async run({ tenantId }, { query }) {
    const q = query.toLowerCase(), hits = [];
    for (const c of await listConversations(tenantId, { limit: 300 })) {
      const m = (c.messages || []).find(x => x.role === "user" && String(x.text || "").toLowerCase().includes(q));
      if (m) hits.push({ conversation_id: c.id, at: m.at, text: str(m.text, 240), language: c.language || null, handed_off: !!c.handoff_id });
      if (hits.length >= 20) break;
    }
    return { query, total: hits.length, matches: hits };
  }
});

// ------------------------------ write tools（需要商家确认 need the merchant's Confirm）------------------------------
def({
  name: "add_knowledge", kind: "write",
  llm: "Teach the chat a new answer: add a knowledge entry (question + answer). If the same question exists, its answer is updated. Needs the merchant's confirmation.",
  args: { question: "5-200 chars", answer: "10-1500 chars", tags: "optional, comma separated", lang: "en|de|fr|it|zh" },
  parse: (a = {}) => { const question = str(a.question, 200), answer = str(a.answer, 1500);
    need(question.length >= 5, "question_too_short"); need(answer.length >= 10, "answer_too_short");
    return { question, answer, ...(str(a.tags, 200) ? { tags: str(a.tags, 200) } : {}), lang: ["en", "de", "fr", "it", "zh"].includes(a.lang) ? a.lang : "en" }; },
  async preview({ tenantId }, a) {
    const list = (await getSettings(tenantId)).custom_faq, same = list.find(x => normQ(x.question) === normQ(a.question));
    need(same || list.length < 200, "too_many_entries");
    return same ? { summary: `“${a.question}” (update ${same.id})`, effect: "update_entry", entry_id: same.id, before: str(same.answer, 240) } : { summary: `“${a.question}”`, effect: "new_entry" };
  },
  async run({ tenantId }, a, p) { const row = await upsertKnowledge(tenantId, { ...a, ...(p?.entry_id ? { id: p.entry_id } : {}) }); return { id: row.id, question: row.question }; }
});

def({
  name: "delete_knowledge", kind: "write",
  llm: "Remove one knowledge entry by its kb_… id. Needs the merchant's confirmation.",
  args: { id: "kb_… id" },
  parse: (a = {}) => { const id = str(a.id, 20); need(KB_ID.test(id), "entry_id_required"); return { id }; },
  async preview({ tenantId }, a) { const e = (await getSettings(tenantId)).custom_faq.find(x => x.id === a.id); need(e, "entry_not_found");
    return { summary: `“${str(e.question, 120)}”`, effect: "delete_entry" }; },
  async run({ tenantId }, a) { const e = (await getSettings(tenantId)).custom_faq.find(x => x.id === a.id); need(e, "entry_not_found"); await deleteKnowledge(tenantId, a.id); return { id: a.id }; }
});

def({
  name: "set_ticket_status", kind: "write", personal: true,
  llm: "Set a ticket to open, pending or closed. Closing hands the conversation back to the AI. Needs the merchant's confirmation.",
  args: { ticket: "ho_… id or POD-T-… number", status: "open | pending | closed" },
  parse: (a = {}) => { const r = str(a.ticket || a.id, 40); need(HANDOFF_ID.test(r) || TICKET_ID.test(r), "ticket_required"); need(TICKET_STATUS[a.status], "invalid_status", { allowed: Object.keys(TICKET_STATUS) });
    return { ticket: r, status: a.status }; },
  async preview({ tenantId }, a) { const h = await findTicket(tenantId, a.ticket); need(h, "ticket_not_found"); need(shownStatus(h.status) !== a.status, "already_in_status", { status: shownStatus(h.status) });
    return { summary: `${h.ticket_id || h.id}: ${shownStatus(h.status)} → ${a.status}`, effect: a.status === "closed" ? "ticket_closed_ai_resumes" : "ticket_status", ticket_id: h.id, from: h.status }; },
  async run({ tenantId }, a, p) {
    const h = await findTicket(tenantId, p?.ticket_id || a.ticket); need(h, "ticket_not_found");
    // 确认前状态被别人改了 → 不执行 Changed by someone else since the proposal → refuse, the merchant re-checks.
    need(!p?.from || h.status === p.from, "stale_proposal", { current: shownStatus(h.status) });
    const r = await updateHandoff(tenantId, h.id, { status: a.status }); return { id: r.id, status: shownStatus(r.status) };
  }
});

def({
  name: "add_ticket_note", kind: "write", personal: true,
  llm: "Add an internal team note to a ticket (never shown to the shopper). Needs the merchant's confirmation.",
  args: { ticket: "ho_… id or POD-T-… number", note: "text" },
  parse: (a = {}) => { const r = str(a.ticket || a.id, 40); need(HANDOFF_ID.test(r) || TICKET_ID.test(r), "ticket_required"); const note = str(a.note, 1000); need(note.length >= 2, "note_required"); return { ticket: r, note }; },
  async preview({ tenantId }, a) { const h = await findTicket(tenantId, a.ticket); need(h, "ticket_not_found"); return { summary: `${h.ticket_id || h.id}: “${a.note.slice(0, 80)}”`, effect: "ticket_note", ticket_id: h.id }; },
  async run({ tenantId }, a, p) { const h = await findTicket(tenantId, p?.ticket_id || a.ticket); need(h, "ticket_not_found"); const r = await updateHandoff(tenantId, h.id, { add_note: a.note }); return { id: r.id, notes: (r.notes || []).length }; }
});

def({
  name: "set_chat_enabled", kind: "write",
  llm: "Pause (enabled=false) or resume (enabled=true) the storefront chat. Needs the merchant's confirmation.",
  args: { enabled: "true | false" },
  parse: (a = {}) => { const v = a.enabled === true || a.enabled === "true" ? true : a.enabled === false || a.enabled === "false" ? false : null; need(v !== null, "enabled_required"); return { enabled: v }; },
  async preview({ tenantId }, a) { const s = await getSettings(tenantId); need((s.enabled !== false) !== a.enabled, "already_in_status", { enabled: s.enabled !== false });
    return { summary: a.enabled ? "chat → on" : "chat → paused", effect: a.enabled ? "chat_resumed" : "chat_paused" }; },
  async run({ tenantId }, a) { const s = await saveSettings(tenantId, { enabled: a.enabled }); return { enabled: s.enabled !== false }; }
});

// ------------------------------------------------------------------------------------------------------
// 回复草稿（规则模板，商家自己修改后从自己的邮箱发送）Reply draft — a rule template the merchant edits and sends
// from their own mailbox. Pod.AI never e-mails the shopper from a ticket.
// ✎ 可以改：模板文字 template wording per language.
// ------------------------------------------------------------------------------------------------------
const DRAFT = {
  en: { hi: "Hello,", thanks: "thank you for your message.", order: "We are checking order {o} and will get back to you with an update shortly.", gen: "We are looking into your question and will reply as soon as possible.", bye: "Kind regards,\n{s}" },
  de: { hi: "Guten Tag", thanks: "vielen Dank für Ihre Nachricht.", order: "Wir prüfen die Bestellung {o} und melden uns in Kürze mit einem Update.", gen: "Wir sehen uns Ihre Frage an und antworten so schnell wie möglich.", bye: "Freundliche Grüsse\n{s}" },
  fr: { hi: "Bonjour,", thanks: "merci pour votre message.", order: "Nous vérifions la commande {o} et revenons vers vous très bientôt.", gen: "Nous examinons votre question et vous répondons dès que possible.", bye: "Cordialement,\n{s}" },
  it: { hi: "Buongiorno,", thanks: "grazie per il messaggio.", order: "Stiamo verificando l'ordine {o} e la aggiorneremo a breve.", gen: "Stiamo esaminando la sua domanda e le risponderemo al più presto.", bye: "Cordiali saluti,\n{s}" },
  zh: { hi: "您好，", thanks: "感谢您的留言。", order: "我们正在核实订单 {o}，稍后会给您最新进展。", gen: "我们正在处理您的问题，会尽快回复您。", bye: "此致\n{s}" }
};
export function replyDraft(h, shopName = "") {
  const lang = DRAFT[h.language] ? h.language : "en", d = DRAFT[lang], fill = x => x.replace("{o}", h.order_number || "").replace("{s}", shopName || "");
  const lastQ = [...(h.messages || [])].reverse().find(m => m.role === "user")?.text || "";
  return { language: lang, to: h.customer_email || "", subject: `[${h.ticket_id || "Pod.AI"}] Re: ${str(h.reason || lastQ, 60)}`,
    body: [`${d.hi} ${d.thanks}`, fill(h.order_number ? d.order : d.gen), fill(d.bye)].join("\n\n") };
}

/** 给大模型的工具清单（只有名字和说明，没有数据）Catalog for the LLM planner — names + descriptions, never data. */
export const toolCatalog = () => Object.values(TOOLS).map(t => ({ name: t.name, kind: t.kind, description: t.llm, args: t.args }));
