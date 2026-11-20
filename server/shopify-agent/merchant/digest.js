// ┌─ 文件卡片 File card ─────────────────────────────────────────────────────────────────────────────────┐
// │ 这是什么 What: 每周总结邮件（发给商家，不发给顾客）。内容 = 助理的「今日重点」(7 天) + 未回答问题 + 工单。   │
// │   Weekly summary e-mail to the MERCHANT (never to shoppers): the assistant's briefing for the last 7  │
// │   days, up to 5 unanswered questions, open / late tickets (counts + ticket numbers, no customer data), │
// │   and a link to the Assistant. Same numbers as in the app (it reuses the briefing tool + reply.js).   │
// │ 什么时候 When: 每个 ISO 周一次，周一 07:00 UTC 之后（服务器停机就补发，同一周不会发第二次）。               │
// │   Once per ISO week, from Monday 07:00 UTC (sent late if the server was down; never twice a week —   │
// │   claimed with addRecordOnce in podai_digests, safe with several server processes).                  │
// │ 不发 Skipped: 商家关闭（设置或对助理说 "stop the weekly e-mail"）、本周没有任何活动、没有收件邮箱。         │
// │ 收件人 To: Settings → Ticket e-mail；为空时用店铺联系邮箱（由渠道传入）。                                 │
// │ 要不要改 Edit?: ✎ 可以改 — 文字在 TXT（5 种语言）、发送时间 DIGEST_HOUR_UTC。                              │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
import { addRecordOnce, updateRecord, listForTenant } from "../../saas-store.js";
import { sendMerchantMail, validEmail, emailList } from "../../shared/tickets-core.js";
import { getSettings } from "../engine/store.js";
import { TOOLS } from "./tools.js";
import { compose, pick } from "./reply.js";
import { audit } from "./actions.js";

export const DIGESTS = "podai_digests";
export const DIGEST_HOUR_UTC = 7; // ✎ 可以改 Monday 07:00 UTC ≈ 08:00 / 09:00 in Zurich
const DAY = 864e5;

/** ISO week of a time, e.g. "2026-W47" (weeks start on Monday). */
export function weekKey(ms = Date.now()) {
  const d = new Date(ms), t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); // Thursday of this ISO week decides the year
  const week = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
/** Monday 00:00 UTC of the week that contains ms. */
export const weekStart = (ms = Date.now()) => { const d = new Date(ms); const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); return t - ((new Date(t).getUTCDay() + 6) % 7) * DAY; };
export const due = (ms = Date.now()) => ms >= weekStart(ms) + DIGEST_HOUR_UTC * 36e5;

// ✎ 可以改：邮件文字 e-mail wording (5 languages). {x} = placeholder.
const TXT = {
  en: { subj: "Pod.AI weekly summary — {s}", hi: "Here is your Pod.AI week.", unans: "Questions the chat could not answer — teach an answer in the Assistant:", late: "Tickets past your reply target:",
    open: "Open the Assistant", off: "You get this e-mail once a week. To stop it, tell the Pod.AI Assistant “stop the weekly e-mail”." },
  de: { subj: "Pod.AI Wochenübersicht — {s}", hi: "Ihre Pod.AI-Woche im Überblick.", unans: "Fragen, die der Chat nicht beantworten konnte – hinterlegen Sie eine Antwort im Assistenten:", late: "Tickets über Ihrem Antwortziel:",
    open: "Assistent öffnen", off: "Sie erhalten diese E-Mail einmal pro Woche. Zum Abbestellen sagen Sie dem Pod.AI-Assistenten „Wochen-E-Mail stoppen“." },
  fr: { subj: "Pod.AI — résumé de la semaine — {s}", hi: "Voici votre semaine Pod.AI.", unans: "Questions sans réponse du chat — ajoutez une réponse dans l'assistant :", late: "Tickets au-delà de votre délai de réponse :",
    open: "Ouvrir l'assistant", off: "Vous recevez cet e-mail une fois par semaine. Pour l'arrêter, dites à l'assistant Pod.AI « arrête l'e-mail hebdomadaire »." },
  it: { subj: "Pod.AI riepilogo settimanale — {s}", hi: "Ecco la tua settimana con Pod.AI.", unans: "Domande senza risposta della chat — insegna una risposta nell'assistente:", late: "Ticket oltre l'obiettivo di risposta:",
    open: "Apri l'assistente", off: "Ricevi questa e-mail una volta alla settimana. Per fermarla, di' all'assistente Pod.AI “ferma l'e-mail settimanale”." },
  zh: { subj: "Pod.AI 每周总结 — {s}", hi: "这是你本周的 Pod.AI 情况。", unans: "聊天没能回答的问题——可以在助理里添加答案：", late: "超过回复目标的工单：",
    open: "打开助理", off: "此邮件每周发送一次。如需停止，请对 Pod.AI 助理说“停止每周邮件”。" }
};
const f = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * 生成邮件内容（不发送）Build the e-mail (does not send).
 * @returns {Promise<{skip:true, reason:string}|{subject:string, text:string, html:string, stats:object}>}
 */
export async function buildDigest(ctx) {
  const L = pick(ctx.lang), t = TXT[L];
  const b = await TOOLS.briefing.run(ctx, {});
  if (!b.conversations && !b.open_tickets && !b.unanswered) return { skip: true, reason: "nothing_to_report" };
  const unans = (await TOOLS.unanswered.run(ctx, { limit: 5 })).questions.map(q => q.text);
  const late = (await TOOLS.open_tickets.run(ctx, {})).tickets.filter(x => x.late).slice(0, 5).map(x => `${x.ticket_id || x.id} · ${x.waiting_h} h`);
  const summary = compose({ lang: L, results: [{ tool: "briefing", result: b }], proposals: [], failures: [] });
  const subject = f(t.subj, { s: ctx.shopName || "Pod.AI" });
  const text = [t.hi, "", summary, ...(unans.length ? ["", t.unans, ...unans.map(q => `• ${q}`)] : []), ...(late.length ? ["", t.late, ...late.map(x => `• ${x}`)] : []),
    "", `${t.open}: ${ctx.adminUrl || ""}`, "", "—", t.off].join("\n");
  const li = a => `<ul style="margin:6px 0 0;padding-left:18px">${a.map(x => `<li style="margin:3px 0">${esc(x)}</li>`).join("")}</ul>`;
  const html = `<div style="font:14px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#241f1b;max-width:560px">`
    + `<p style="font:600 17px Georgia,serif;margin:0 0 10px">${esc(t.hi)}</p>`
    + `<div style="background:#f6f0e8;border-radius:12px;padding:12px 14px;margin:0 0 14px">${esc(summary).replace(/\n/g, "<br>")}</div>`
    + (unans.length ? `<p style="margin:14px 0 0"><b>${esc(t.unans)}</b></p>${li(unans)}` : "")
    + (late.length ? `<p style="margin:14px 0 0"><b>${esc(t.late)}</b></p>${li(late)}` : "")
    + (ctx.adminUrl ? `<p style="margin:18px 0"><a href="${esc(ctx.adminUrl)}" style="background:#2b2520;color:#fff;text-decoration:none;padding:9px 16px;border-radius:999px;font-weight:600">${esc(t.open)}</a></p>` : "")
    + `<p style="color:#8a7e74;font-size:12px;margin-top:22px">${esc(t.off)}</p></div>`;
  return { subject, text, html, stats: { conversations: b.conversations, unanswered: b.unanswered, open_tickets: b.open_tickets, late_tickets: b.late_tickets } };
}

/**
 * 发本周的总结（每周最多一次）Send this week's summary for one shop — at most once per week.
 * ctx: { tenantId, lang?, shopName, adminUrl, usage? }   opts: { to (fallback recipient), now }
 * @returns {Promise<{status:string, week?:string}>}  status: not_due | off | no_recipient | skipped_rollout_guard | already_sent | nothing_to_report | sent | not_configured | skipped_test_mode | failed
 */
export async function sendWeeklyDigest(ctx, { to = null, now = Date.now() } = {}) {
  if (!due(now)) return { status: "not_due" };
  const s = await getSettings(ctx.tenantId);
  if (s.weekly_digest === false) return { status: "off" };
  const recipient = validEmail(s.support_email) ? s.support_email : validEmail(to) ? to : null;
  if (!recipient) return { status: "no_recipient" };
  // Optional rollout guard (server .env, names only): PODAI_DIGEST_ONLY_TO = comma list. When set, the summary goes only to
  // these addresses; other shops are skipped without using up their week (they get it once the guard is removed).
  const only = emailList(process.env.PODAI_DIGEST_ONLY_TO).map(x => x.toLowerCase());
  if (only.length && !only.includes(String(recipient).toLowerCase())) return { status: "skipped_rollout_guard" };
  const week = weekKey(now);
  const claim = await addRecordOnce(DIGESTS, { id: `dg_${ctx.tenantId}_${week}`, tenant_id: ctx.tenantId, week, status: "claimed", at: new Date(now).toISOString() });
  if (!claim.created) return { status: "already_sent", week };
  let status, detail = null;
  try {
    const d = await buildDigest({ ...ctx, lang: ctx.lang || s.digest_lang || "en" });
    if (d.skip) status = d.reason;
    else { const r = await sendMerchantMail({ tenantId: ctx.tenantId, to: recipient, subject: d.subject, text: d.text, html: d.html, type: "podai_weekly_digest", related_id: claim.record.id });
      status = r.status || "failed"; detail = r.error || null; }
  } catch (e) { status = "failed"; detail = String(e.message).slice(0, 160); console.error("[pod.ai digest]", ctx.tenantId, e.message); }
  await updateRecord(DIGESTS, claim.record.id, { status, ...(detail ? { error: detail } : {}), done_at: new Date().toISOString() });
  await audit(ctx.tenantId, { actor: "pod_ai", event: "digest", detail: `${week}: ${status}` });
  return { status, week };
}

/** Last digests of a shop (for the admin / support). */
export async function digestHistory(tenantId, limit = 8) {
  return (await listForTenant(DIGESTS, tenantId)).sort((a, b) => String(b.week).localeCompare(String(a.week))).slice(0, limit).map(({ tenant_id, ...r }) => r);
}
