// ┌─ 文件卡片 File card ─────────────────────────────────────────────────────────────────────────────────┐
// │ 这是什么 What: 把商家的一句话变成「要用哪些工具」的计划。两种方式：                                       │
// │   Turns one merchant sentence into a plan (which tools, which arguments). Two planners:               │
// │   1. 规则（默认，免费，结果可预测）Rules — default, free, predictable; EN / DE / FR / IT / 中文。         │
// │   2. 大模型（可选：套餐含 AI + 服务器配置了模型 + 商家打开 AI）Optional LLM — only plans; every           │
// │      argument is re-validated by the tool, write tools still need the merchant's Confirm.             │
// │      大模型失败或给出无效计划 → 自动退回规则。LLM fails / invalid plan → rules.                          │
// │ 对应功能 Feature: 商家助理 POST /shopify-agent/api/assistant · /woo-agent/v1/assistant                 │
// │ 要不要改 Edit?: ✎ 可以改 — 新说法加到 WORDS（每种语言一个正则）。改完运行                               │
// │   node server/shopify-agent/test/merchant-agent.test.js                                               │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
import { TOOLS, toolCatalog, ToolError } from "./tools.js";
import { chatJson, llmStatus } from "../engine/llm.js";

export const MAX_STEPS = 4;

// ✎ 可以改：触发词 Trigger words (one regex per intent, all languages together).
export const WORDS = {
  briefing: /\b(today|briefing|summary|overview|what (should|do) i|to ?do|heute|übersicht|zusammenfassung|aujourd'hui|résumé|aperçu|oggi|riepilogo|panoramica)\b|今天|今日|概览|重点|汇总|待办/i,
  kpi: /\b(kpis?|stats?|statistic\w*|statistik\w*|statistiques?|statistiche|performance|report|bericht|rapport|resolution|lösungsquote|taux|kennzahl\w*|indicateurs?|indicatori)\b|数据|统计|报表|指标/i,
  unanswered: /\b(unanswered|not answered|couldn'?t answer|could not answer|no answer|unbeantwortet\w*|sans réponse|non répondu\w*|senza risposta)\b|没回答|未回答|答不上|没答/i,
  topics: /\b(topics?|intents?|what do (shoppers|customers) ask|themen|sujets|argomenti|languages?|worüber|sur quoi|su cosa)\b|话题|问什么|问题类型|语言/i,
  tickets: /\b(tickets?|handoffs?|übergaben?|transferts?|passaggi|escalat\w*)\b|工单|转人工/i,
  knowledge: /\b(knowledge|faq|wissen\w*|connaissances?|conoscenz\w*)\b|知识库|问答/i,
  search: /\b(search|find|look for|suche\w*|finde\w*|cherche\w*|trouve\w*|cerca\w*|trova\w*)\b|搜索|查找|找一下/i,
  close: /\b(close|resolve|done|erledigt|schlie(ss|ß)\w*|ferme\w*|résou\w*|chiud\w*|risolv\w*)\b|关闭|解决|完成/i,
  pending: /\b(pending|in progress|wartend|in bearbeitung|en attente|en cours|in attesa|in corso)\b|处理中|待处理/i,
  reopen: /\b(re-?open|wieder öffnen|rouvrir|riapri\w*)\b|重新打开/i,
  note: /\b(note|notiz|remarque|nota)\b|备注/i,
  delete: /\b(delete|remove|lösch\w*|entfern\w*|supprim\w*|elimin\w*|rimuov\w*)\b|删除|移除/i,
  pause: /\b(pause|stop|turn off|disable|deaktivier\w*|pausier\w*|ausschalten|désactiv\w*|disattiv\w*|spegn\w*|stopp\w*|arr[êe]te?r?|ferma\w*|interromp\w*)\b|暂停|停用|关掉|停止/i,
  resume: /\b(resume|restart|turn on|enable|reactivat\w*|aktivier\w*|einschalten|réactiv\w*|activer|riattiv\w*|attiva\w*)\b|恢复|开启|打开聊天/i,
  chat: /\b(chat|widget|bot)\b|聊天|客服/i,
  digest: /\b(weekly (e-?mail|summary|digest|report)|digest|wochen-?(e-?mail|bericht|übersicht|zusammenfassung)|e-?mail hebdo\w*|résumé hebdo\w*|(e-?mail|riepilogo) settimanale)\b|每周(邮件|总结|摘要|报告)|周报/i
};
const TICKET_REF = /\b(ho_[a-f0-9]{6,24}|POD-T-[A-Z0-9]{4,12})\b/i;
const KB_REF = /\b(kb_[a-f0-9]{4,16})\b/i;
const QUOTED = /["“„«‘'「]([^"”“»’'」]{3,300})["”“»’'」]/g;
const daysIn = t => { const m = /(\d{1,3})\s*(d|days?|tage?n?|jours?|giorni|天)\b/i.exec(t) || /(\d{1,3})\s*天/.exec(t); const n = m ? Number(m[1]) : /\b(week|woche|semaine|settimana)\b|本周|这周|一周/i.test(t) ? 7 : /\b(quarter|quartal|trimestre)\b|季度/i.test(t) ? 90 : null;
  return n ? (n <= 7 ? 7 : n <= 30 ? 30 : 90) : null; };

/**
 * 「教」AI 的句式 Teach patterns:
 *   answer "do you ship to Japan?" with "Yes, 7–15 business days."
 *   Q: … A: …        Frage: … Antwort: …        Question : … Réponse : …        Domanda: … Risposta: …        问：… 答：…
 */
function teachFrom(text) {
  const q = [...String(text).matchAll(QUOTED)].map(m => m[1].trim());
  if (q.length >= 2 && /\b(answer|reply|teach|antworte\w*|beantworte\w*|réponds|répondre|rispondi|insegna)\b|回答|教/i.test(text)) return { question: q[0], answer: q[1] };
  const m = /(?:^|\n|\s)(?:q|question|frage|domanda|问)\s*[:：]\s*([\s\S]+?)\s*(?:\n|\s)(?:a|answer|antwort|réponse|reponse|risposta|答)\s*[:：]\s*([\s\S]+)$/i.exec(text);
  return m ? { question: m[1].trim(), answer: m[2].trim() } : null;
}

/** 规则规划器 Rule planner → { steps:[{tool,args}] }. Never throws. */
export function rulePlan(message) {
  const t = String(message || "").slice(0, 2000), steps = [], add = (tool, args = {}) => { if (steps.length < MAX_STEPS && !steps.some(s => s.tool === tool && JSON.stringify(s.args) === JSON.stringify(args))) steps.push({ tool, args }); };
  const teach = teachFrom(t);
  if (teach) { add("add_knowledge", teach); return { steps }; }
  const tk = TICKET_REF.exec(t)?.[1];
  if (tk) {
    const note = /(?:note|notiz|remarque|nota|备注)\s*[:：]\s*(.+)$/is.exec(t)?.[1];
    if (note) add("add_ticket_note", { ticket: tk, note });
    else if (WORDS.reopen.test(t)) add("set_ticket_status", { ticket: tk, status: "open" });
    else if (WORDS.pending.test(t)) add("set_ticket_status", { ticket: tk, status: "pending" });
    else if (WORDS.close.test(t)) add("set_ticket_status", { ticket: tk, status: "closed" });
    else add("ticket_detail", { ticket: tk });
    return { steps };
  }
  const kb = KB_REF.exec(t)?.[1];
  if (kb && WORDS.delete.test(t)) { add("delete_knowledge", { id: kb }); return { steps }; }
  if (WORDS.digest.test(t) && (WORDS.pause.test(t) || /\b(unsubscribe|abbestell\w*|no more|keine)\b|不要|取消/i.test(t))) { add("set_weekly_digest", { enabled: false }); return { steps }; }
  if (WORDS.digest.test(t) && WORDS.resume.test(t)) { add("set_weekly_digest", { enabled: true }); return { steps }; }
  if (WORDS.chat.test(t) && WORDS.pause.test(t) && !WORDS.resume.test(t)) { add("set_chat_enabled", { enabled: false }); return { steps }; }
  if (WORDS.chat.test(t) && WORDS.resume.test(t)) { add("set_chat_enabled", { enabled: true }); return { steps }; }
  const quoted = [...t.matchAll(QUOTED)].map(m => m[1].trim());
  if (WORDS.search.test(t) && quoted[0]) add("search_chats", { query: quoted[0] });
  if (WORDS.unanswered.test(t)) add("unanswered", {});
  if (WORDS.tickets.test(t)) add("open_tickets", {});
  if (WORDS.knowledge.test(t)) add("knowledge_list", quoted[0] ? { query: quoted[0] } : {});
  if (WORDS.topics.test(t)) add("top_topics", { days: daysIn(t) || 30 });
  if (WORDS.kpi.test(t)) add("kpi_report", { days: daysIn(t) || 30 });
  if (WORDS.briefing.test(t) || !steps.length) add("briefing", {});
  return { steps };
}

/** 检查一个计划：工具存在、参数合格 Validate a plan; invalid steps are dropped with their error. */
export function validatePlan(plan) {
  const ok = [], dropped = [];
  for (const s of (Array.isArray(plan?.steps) ? plan.steps : []).slice(0, MAX_STEPS)) {
    const tool = TOOLS[s?.tool];
    if (!tool) { dropped.push({ tool: String(s?.tool || "").slice(0, 40), error: "unknown_tool" }); continue; }
    try { ok.push({ tool: tool.name, args: tool.parse(s.args && typeof s.args === "object" ? s.args : {}) }); }
    catch (e) { dropped.push({ tool: tool.name, error: e instanceof ToolError ? e.code : "invalid_args" }); }
  }
  return { steps: ok, dropped };
}

const SYSTEM = `You plan actions for the internal assistant of Pod.AI, an AI customer-chat app installed in an online shop.
The user is the shop's merchant or team member. Choose at most ${MAX_STEPS} tools from the catalog that answer the request.
Rules: read tools show data; write tools only PROPOSE a change that the merchant confirms later — never claim a change was made.
Use only tool names and arguments from the catalog. If nothing fits, use "briefing".
Answer with JSON only: {"steps":[{"tool":"<name>","args":{...}}]}`;

/** 大模型是否可用于规划 Is the LLM planner allowed for this request? */
export const llmPlannerAllowed = ({ llm } = {}) => llm === true && llmStatus().available && process.env.PODAI_ASSISTANT_LLM !== "off";

/**
 * 做计划 Plan a message. LLM first when allowed, rules otherwise or on any LLM problem.
 * @returns {{steps:Array<{tool:string,args:object}>, planner:"llm"|"rules", dropped:Array}}
 */
export async function plan(message, ctx = {}) {
  if (llmPlannerAllowed(ctx)) {
    try {
      const { data } = await chatJson({ system: SYSTEM, user: JSON.stringify({ catalog: toolCatalog(), request: String(message || "").slice(0, 1500) }) });
      const v = validatePlan(data);
      if (v.steps.length) return { ...v, planner: "llm" };
    } catch (e) { console.warn("[pod.ai assistant] llm planner failed, using rules:", e.message); }
  }
  return { ...validatePlan(rulePlan(message)), planner: "rules" };
}
