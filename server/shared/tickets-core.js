// Shared ticket helpers for the site chat (pod-agent/customer/tickets.js) and Pod.AI (shopify-agent/engine/tickets.js):
// ticket ids POD-T-XXXXXX, confirmation texts (5 languages), transcript text and the support e-mail (Reply-To = customer).
// No tenant data of its own; uses the neutral mail transport (SendGrid / Postmark / SMTP, env-configured).
// Env (names only): TEST_EMAIL_ALLOWLIST — outside NODE_ENV=production, mail only goes to these addresses.
import crypto from "node:crypto";
import { getState } from "../saas-store.js";
import { sendEmail } from "../services/email-service.js";

export const now = () => new Date().toISOString();
const EMAIL_RE = /^[^\s@<>()"',;:]{1,64}@[^\s@<>()"',;:]{1,190}\.[A-Za-z]{2,24}$/;
const ALPH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const validEmail = e => EMAIL_RE.test(String(e || "").trim()) && String(e).length <= 254;
const mask = e => String(e || "").replace(/^(.{2})[^@]*@/, "$1***@");
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const emailList = v => String(v || "").split(/[,;\s]+/).map(x => x.trim()).filter(validEmail);

export async function newTicketId(collection = "agent_handoffs") {
  const used = new Set(((await getState())[collection] || []).map(t => t.ticket_id).filter(Boolean));
  for (;;) { const id = "POD-T-" + Array.from(crypto.randomBytes(6), b => ALPH[b % ALPH.length]).join(""); if (!used.has(id)) return id; }
}

/** Who gets mail: production → everyone requested; elsewhere only TEST_EMAIL_ALLOWLIST (never real customers in tests). */
export function allowedRecipient(to, env = process.env) {
  if (env.NODE_ENV === "production") return true;
  return emailList(env.TEST_EMAIL_ALLOWLIST).map(x => x.toLowerCase()).includes(String(to).toLowerCase());
}

const CONFIRM = {
  en: (id, e, h) => `Thanks! Your ticket number is ${id}. Our team will reply to ${e} within ${h} hours.`,
  de: (id, e, h) => `Danke! Ihre Ticketnummer ist ${id}. Unser Team antwortet innerhalb von ${h} Stunden an ${e}.`,
  fr: (id, e, h) => `Merci ! Votre numéro de ticket est ${id}. Notre équipe vous répondra à ${e} sous ${h} heures.`,
  it: (id, e, h) => `Grazie! Il suo numero di ticket è ${id}. Il nostro team risponderà a ${e} entro ${h} ore.`,
  zh: (id, e, h) => `谢谢！您的工单号是 ${id}。我们的团队会在 ${h} 小时内回复到 ${e}。`
};
/** True when the sender address is a personal free-mail mailbox (Gmail etc., also as a SendGrid single sender) —
 * then customers must not receive mail from it (it would expose that address). Team mail is unaffected. */
export function personalSender(env = process.env) {
  const from = String(env.FROM_EMAIL || env.SMTP_USER || "");
  return /@(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|gmx|web|qq|163|126|proton|protonmail)\./i.test(from);
}
export const confirmText = (lang, id, email, hours = 24) => (CONFIRM[lang] || CONFIRM.en)(id, email, hours);
const MAIL_SUBJ = { en: "Your request", de: "Ihre Anfrage", fr: "Votre demande", it: "La sua richiesta", zh: "您的咨询" };

export function transcriptText(messages = []) {
  return messages.map(m => `[${String(m.at || "").replace("T", " ").slice(0, 16)}] ${m.role === "user" ? "Customer" : m.role === "team" ? "Team" : "Assistant"}: ${String(m.text || "")}`).join("\n");
}

/** Send the internal notification (+ optional customer confirmation). Returns a log of results without full addresses. */
export async function sendTicketMails({ tenantId, ticket, brand = "POD.AI", support, extra = [], confirm = true, hours = 24, adminUrl, type = "support_ticket" }) {
  const log = [];
  const head = [`Ticket: ${ticket.ticket_id}`, `Customer e-mail: ${ticket.customer_email}`, ticket.customer_name ? `Name: ${ticket.customer_name}` : null,
    ticket.order_number ? `Order: ${ticket.order_number}` : null, `Language: ${ticket.language || "—"}`, `Market: ${ticket.market || "—"}${ticket.country ? ` (${ticket.country})` : ""}`,
    `Page: ${ticket.page || "—"}`, `Created: ${ticket.created_at}`, ticket.reason ? `Reason: ${ticket.reason}` : null].filter(Boolean);
  const msg = ticket.customer_message ? `\nCustomer message:\n${ticket.customer_message}\n` : "";
  const tx = transcriptText(ticket.messages);
  const text = `${head.join("\n")}\n${msg}\n--- Chat transcript ---\n${tx || "(no messages)"}\n\n${adminUrl ? `Open in admin: ${adminUrl}\n` : ""}Reply to this e-mail to answer the customer directly.`;
  const html = `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#222"><h2 style="margin:0 0 8px">${esc(brand)} — ticket ${esc(ticket.ticket_id)}</h2>`
    + `<table style="border-collapse:collapse">${head.map(l => { const i = l.indexOf(": "); return `<tr><td style="padding:2px 10px 2px 0;color:#666">${esc(l.slice(0, i))}</td><td>${esc(l.slice(i + 2))}</td></tr>`; }).join("")}</table>`
    + (ticket.customer_message ? `<p><b>Customer message</b><br>${esc(ticket.customer_message).replace(/\n/g, "<br>")}</p>` : "")
    + `<h3 style="margin:16px 0 6px">Chat transcript</h3>${(ticket.messages || []).map(m => `<p style="margin:4px 0"><b>${m.role === "user" ? "Customer" : "Assistant"}</b> <span style="color:#888;font-size:12px">${esc(String(m.at || "").replace("T", " ").slice(0, 16))}</span><br>${esc(m.text).replace(/\n/g, "<br>")}</p>`).join("") || "<p>(no messages)</p>"}`
    + `${adminUrl ? `<p><a href="${esc(adminUrl)}">Open in admin</a></p>` : ""}<p style="color:#666">Reply to this e-mail to answer the customer directly.</p></div>`;
  const subject = `[${ticket.ticket_id}] ${brand} chat — ${ticket.customer_email}`;
  const recipients = [...new Set([support, ...extra].filter(validEmail).map(x => x.toLowerCase()))];
  for (const to of recipients) {
    if (!allowedRecipient(to)) { log.push({ to: mask(to), kind: "team", status: "skipped_test_mode", at: now() }); continue; }
    const r = await sendEmail({ tenantId, to, replyTo: ticket.customer_email, subject, text, html, type, related_id: ticket.id }).catch(e => ({ status: "failed", error: e.message }));
    log.push({ to: mask(to), kind: "team", status: r.status, provider: r.provider || null, ...(r.error ? { error: String(r.error).slice(0, 160) } : {}), at: now() });
  }
  if (confirm) {
    const to = ticket.customer_email, l = ticket.language || "en";
    if (!allowedRecipient(to)) log.push({ to: mask(to), kind: "customer", status: "skipped_test_mode", at: now() });
    else {
      const body = `${confirmText(l, ticket.ticket_id, to, hours)}\n\n${brand}`;
      const r = await sendEmail({ tenantId, to, replyTo: support || null, subject: `[${ticket.ticket_id}] ${MAIL_SUBJ[l] || MAIL_SUBJ.en} — ${brand}`, text: body,
        html: `<p style="font:14px/1.5 -apple-system,Segoe UI,sans-serif">${esc(confirmText(l, ticket.ticket_id, to, hours))}</p><p style="color:#666">${esc(brand)}</p>`, type: `${type}_confirmation`, related_id: ticket.id }).catch(e => ({ status: "failed", error: e.message }));
      log.push({ to: mask(to), kind: "customer", status: r.status, provider: r.provider || null, ...(r.error ? { error: String(r.error).slice(0, 160) } : {}), at: now() });
    }
  }
  for (const l of log) (l.status === "sent" ? console.log : console.error)(`[tickets] ${ticket.ticket_id} ${l.kind} ${l.to}: ${l.status}${l.provider ? ` via ${l.provider}` : ""}${l.error ? ` (${l.error})` : ""}`);
  return log;
}

