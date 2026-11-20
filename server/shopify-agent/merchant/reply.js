// ┌─ 文件卡片 File card ─────────────────────────────────────────────────────────────────────────────────┐
// │ 这是什么 What: 把工具结果写成给商家看的一段话（EN / DE / FR / IT / 中文）。不用大模型 → 不会编数字。       │
// │   Turns tool results into the assistant's reply text. Deterministic (no LLM) → numbers are never       │
// │   invented; the UI also gets the structured results to draw cards.                                    │
// │ 要不要改 Edit?: ✎ 可以改 — 文字在 P（每种语言一组）。{x} 是占位符。新工具 → 在 LINES 加一行。             │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
export const LANGS = ["en", "de", "fr", "it", "zh"];
const P = {
  en: { ticketc: "Ticket {id} is closed. A reply draft is ready to copy.", brief: "This week: {c} chats, {r}% solved by the AI, about {h} h saved.", unans: "{n} questions the chat could not answer.", unans0: "No unanswered questions.",
    tk: "{n} open tickets ({l} past your {t} h reply target).", tk0: "No open tickets.", plan: "Plan {p}: {u} of {m} chats used ({x}%).", off: "The storefront chat is paused.",
    kpi: "KPIs for the last {d} days:", kb: "{n} knowledge entries.", topics: "Top topics ({d} days): {list}.", search: "{n} chats mention “{q}”.", ticket: "Ticket {id} ({s}), waiting {w} h. A reply draft is ready to copy.",
    propose: "I prepared this change — please confirm it below:", none: "Nothing to change.", fail: "I could not do this: {e}.", next: "Suggested next:", empty: "No chats yet — numbers appear after the first conversations." },
  de: { ticketc: "Ticket {id} ist geschlossen. Ein Antwortentwurf liegt bereit.", brief: "Diese Woche: {c} Chats, {r}% von der KI gelöst, ca. {h} h gespart.", unans: "{n} Fragen konnte der Chat nicht beantworten.", unans0: "Keine unbeantworteten Fragen.",
    tk: "{n} offene Tickets ({l} über Ihrem Antwortziel von {t} h).", tk0: "Keine offenen Tickets.", plan: "Tarif {p}: {u} von {m} Chats genutzt ({x}%).", off: "Der Shop-Chat ist pausiert.",
    kpi: "Kennzahlen der letzten {d} Tage:", kb: "{n} Wissenseinträge.", topics: "Häufigste Themen ({d} Tage): {list}.", search: "{n} Chats erwähnen „{q}“.", ticket: "Ticket {id} ({s}), wartet seit {w} h. Ein Antwortentwurf liegt bereit.",
    propose: "Ich habe diese Änderung vorbereitet – bitte unten bestätigen:", none: "Nichts zu ändern.", fail: "Das ging nicht: {e}.", next: "Vorschläge:", empty: "Noch keine Chats – Zahlen erscheinen nach den ersten Gesprächen." },
  fr: { ticketc: "Le ticket {id} est fermé. Un brouillon de réponse est prêt.", brief: "Cette semaine : {c} conversations, {r} % résolues par l'IA, environ {h} h gagnées.", unans: "{n} questions sans réponse du chat.", unans0: "Aucune question sans réponse.",
    tk: "{n} tickets ouverts ({l} au-delà de votre objectif de {t} h).", tk0: "Aucun ticket ouvert.", plan: "Offre {p} : {u} sur {m} conversations utilisées ({x} %).", off: "Le chat de la boutique est en pause.",
    kpi: "Indicateurs des {d} derniers jours :", kb: "{n} entrées de connaissances.", topics: "Sujets principaux ({d} jours) : {list}.", search: "{n} conversations mentionnent « {q} ».", ticket: "Ticket {id} ({s}), en attente depuis {w} h. Un brouillon de réponse est prêt.",
    propose: "J'ai préparé cette modification — merci de la confirmer ci-dessous :", none: "Rien à modifier.", fail: "Impossible : {e}.", next: "Suggestions :", empty: "Pas encore de conversations — les chiffres apparaîtront ensuite." },
  it: { ticketc: "Il ticket {id} è chiuso. Una bozza di risposta è pronta.", brief: "Questa settimana: {c} chat, {r}% risolte dall'IA, circa {h} h risparmiate.", unans: "{n} domande senza risposta della chat.", unans0: "Nessuna domanda senza risposta.",
    tk: "{n} ticket aperti ({l} oltre l'obiettivo di {t} h).", tk0: "Nessun ticket aperto.", plan: "Piano {p}: {u} di {m} chat usate ({x}%).", off: "La chat del negozio è in pausa.",
    kpi: "KPI degli ultimi {d} giorni:", kb: "{n} voci di conoscenza.", topics: "Argomenti principali ({d} giorni): {list}.", search: "{n} chat menzionano «{q}».", ticket: "Ticket {id} ({s}), in attesa da {w} h. Una bozza di risposta è pronta.",
    propose: "Ho preparato questa modifica — confermala qui sotto:", none: "Niente da modificare.", fail: "Non è stato possibile: {e}.", next: "Suggerimenti:", empty: "Ancora nessuna chat — i numeri compariranno dopo le prime conversazioni." },
  zh: { ticketc: "工单 {id} 已关闭。回复草稿已准备好。", brief: "本周：{c} 个对话，AI 解决 {r}%，约节省 {h} 小时。", unans: "{n} 个问题聊天没能回答。", unans0: "没有未回答的问题。",
    tk: "{n} 个未处理工单（{l} 个超过 {t} 小时回复目标）。", tk0: "没有未处理工单。", plan: "套餐 {p}：已用 {u}/{m} 个对话（{x}%）。", off: "店铺聊天已暂停。",
    kpi: "最近 {d} 天指标：", kb: "{n} 条知识库问答。", topics: "热门话题（{d} 天）：{list}。", search: "{n} 个对话提到「{q}」。", ticket: "工单 {id}（{s}），已等待 {w} 小时。回复草稿已准备好。",
    propose: "我已准备好以下修改，请在下方确认：", none: "没有需要修改的。", fail: "无法完成：{e}。", next: "建议下一步：", empty: "还没有对话——有对话后这里会显示数据。" }
};
const KPI = {
  en: { conversations: "Chats", resolution_rate: "AI resolution", hours_saved: "Hours saved", wismo: "Order self-service", product_clicks: "Product clicks", influenced_revenue: "Chat revenue", first_response: "First response" },
  de: { conversations: "Chats", resolution_rate: "KI-Lösungsquote", hours_saved: "Gesparte Stunden", wismo: "Bestellstatus selbst", product_clicks: "Produktklicks", influenced_revenue: "Chat-Umsatz", first_response: "Erste Antwort" },
  fr: { conversations: "Conversations", resolution_rate: "Résolution IA", hours_saved: "Heures gagnées", wismo: "Suivi autonome", product_clicks: "Clics produits", influenced_revenue: "CA du chat", first_response: "Première réponse" },
  it: { conversations: "Chat", resolution_rate: "Risoluzione IA", hours_saved: "Ore risparmiate", wismo: "Stato ordine autonomo", product_clicks: "Clic prodotti", influenced_revenue: "Ricavi chat", first_response: "Prima risposta" },
  zh: { conversations: "对话", resolution_rate: "AI 解决率", hours_saved: "节省时间", wismo: "自助查单", product_clicks: "商品点击", influenced_revenue: "聊天带来收入", first_response: "首次响应" }
};
const SUGG = {
  en: { tickets: "Show open tickets", teach: "Teach an answer for: “{q}”", plan: "Check plan ({p}% used)", resume: "Resume the chat" },
  de: { tickets: "Offene Tickets zeigen", teach: "Antwort hinterlegen für: „{q}“", plan: "Tarif prüfen ({p}% genutzt)", resume: "Chat wieder einschalten" },
  fr: { tickets: "Voir les tickets ouverts", teach: "Ajouter une réponse pour : « {q} »", plan: "Vérifier l'offre ({p} % utilisés)", resume: "Réactiver le chat" },
  it: { tickets: "Mostra ticket aperti", teach: "Insegna una risposta per: «{q}»", plan: "Controlla il piano ({p}% usato)", resume: "Riattiva la chat" },
  zh: { tickets: "查看未处理工单", teach: "为这个问题添加答案：「{q}」", plan: "查看套餐（已用 {p}%）", resume: "恢复聊天" }
};
// 建议的「下一句」= 点了就发给助理的命令（英文命令所有语言都能识别）Clickable follow-up commands.
const SUGG_CMD = { tickets: () => "open tickets", plan: () => "briefing", resume: () => "resume the chat", teach: s => `answer "${s.question}" with "…"` };

const f = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "–");
export const pick = lang => LANGS.includes(lang) ? lang : "en";

/** 一个工具结果 → 一两句话 One tool result → one or two sentences. */
const LINES = {
  briefing: (r, p) => [r.conversations ? f(p.brief, { c: r.conversations, r: r.resolution_rate ?? "–", h: r.hours_saved }) : p.empty, r.unanswered ? f(p.unans, { n: r.unanswered }) : p.unans0,
    r.open_tickets ? f(p.tk, { n: r.open_tickets, l: r.late_tickets, t: r.reply_target_h }) : p.tk0, r.plan ? f(p.plan, { p: r.plan.name, u: r.plan.used, m: r.plan.limit, x: r.plan.pct ?? "–" }) : null, r.chat_enabled ? null : p.off],
  kpi_report: (r, p, L) => [r.empty ? p.empty : f(p.kpi, { d: r.days }) + " " + r.kpis.map(k => `${KPI[L][k.id] || k.id} ${k.value ?? "–"}${k.unit || ""}${k.trend == null ? "" : ` (${k.trend > 0 ? "+" : ""}${k.trend}%)`}`).join(" · ")],
  unanswered: (r, p) => [r.total ? f(p.unans, { n: r.total }) : p.unans0],
  top_topics: (r, p) => [f(p.topics, { d: r.days, list: r.topics.slice(0, 5).map(x => `${x.id.replace(/_/g, " ")} ${x.n}`).join(", ") || "–" })],
  open_tickets: (r, p) => [r.total ? f(p.tk, { n: r.total, l: r.tickets.filter(x => x.late).length, t: r.reply_target_h }) : p.tk0],
  ticket_detail: (r, p) => [f(r.ticket.status === "closed" ? p.ticketc : p.ticket, { id: r.ticket.ticket_id || r.ticket.id, s: r.ticket.status, w: r.ticket.waiting_h ?? "–" })],
  knowledge_list: (r, p) => [f(p.kb, { n: r.total })],
  search_chats: (r, p) => [f(p.search, { n: r.total, q: r.query })]
};

/** 拼出整段回答 Build the full reply. */
export function compose({ lang, results, proposals, failures }) {
  const L = pick(lang), p = P[L], out = [];
  for (const r of results) out.push(...(LINES[r.tool]?.(r.result, p, L) || []).filter(Boolean));
  if (proposals.length) out.push(p.propose);
  for (const x of failures) out.push(f(p.fail, { e: String(x.error || "error").replace(/_/g, " ") }));
  return out.join("\n") || p.none;
}
/** 可点的下一步 Suggestion chips: { label, command }. */
export function suggestionChips(lang, suggestions = []) {
  const L = pick(lang);
  return suggestions.slice(0, 4).map(s => ({ label: f(SUGG[L][s.cmd] || s.cmd, { q: String(s.question || "").slice(0, 60), p: s.pct }), command: SUGG_CMD[s.cmd]?.(s) || "briefing", kind: s.cmd, ...(s.question ? { question: String(s.question).slice(0, 200) } : {}) }));
}
