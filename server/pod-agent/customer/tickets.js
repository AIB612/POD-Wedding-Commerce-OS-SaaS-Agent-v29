// "Contact us" tickets for the site chat. The customer leaves an e-mail (optional name + short message, consent required);
// we create a ticket POD-T-XXXXXX in the existing handoff queue (collection agent_handoffs, Admin → Chat agent → Tickets),
// e-mail the full transcript to the support inbox (Reply-To = customer) and optionally a confirmation to the customer.
// Env (names only): SUPPORT_EMAIL (default support@swisspro.site), SUPPORT_NOTIFY_EMAILS (extra internal recipients, comma
// separated), TICKET_CONFIRM_EMAIL (default true; skipped while mail leaves from a personal free-mail sender), TEST_EMAIL_ALLOWLIST (outside production, mail only goes to these).
import crypto from "node:crypto";
import { addRecord, findRecord, listForTenant, updateRecord } from "../../saas-store.js";
import { HttpError } from "../../http/middleware.js";
import { now, validEmail, emailList as list, newTicketId, confirmText, sendTicketMails, personalSender } from "../../shared/tickets-core.js";
import { publicContactEmail } from "../../config.js";
export { validEmail, allowedRecipient, confirmText, transcriptText, newTicketId, sendTicketMails } from "../../shared/tickets-core.js";

/** Validate the public form body. Throws HttpError(400). Returns cleaned fields; `spam` = honeypot filled. */
export function cleanTicketBody(b = {}) {
  const spam = !!String(b.website || b.hp || "").trim();
  const email = String(b.email || "").trim();
  if (!spam && !validEmail(email)) throw new HttpError(400, "invalid_email", "Please enter a valid e-mail address");
  if (!spam && b.consent !== true) throw new HttpError(400, "consent_required", "Please confirm that we may use your e-mail to answer you");
  const lang = ["en", "de", "fr", "it", "zh"].includes(b.lang) ? b.lang : "en";
  return { spam, email, lang, name: String(b.name || "").replace(/[\r\n<>]/g, " ").trim().slice(0, 80) || null, message: String(b.message || "").replace(/\r/g, "").trim().slice(0, 1000) || null,
    page: String(b.page || "").slice(0, 200) || null, country: /^[A-Z]{2}$/.test(String(b.country || "")) ? String(b.country) : null };
}

/** Site chat: create (or reuse) the ticket for a conversation. */
export async function createSiteTicket(tenantId, body, { currencyForCountry } = {}) {
  const f = cleanTicketBody(body);
  if (f.spam) return { ok: true, ticket_id: null };
  const convId = String(body.conversation_id || "");
  const conv = /^c_[a-z0-9]{12,40}$/.test(convId) ? await findRecord("agent_conversations", convId) : null;
  const c = conv && conv.tenant_id === tenantId ? conv : null;
  const hours = Number((await findRecord("agent_settings", `agent_${tenantId}`))?.human_reply_hours || 24);
  // one open ticket per conversation (double click / retry → same ticket)
  if (c?.ticket_id) {
    const t = (await listForTenant("agent_handoffs", tenantId)).find(x => x.ticket_id === c.ticket_id && !["closed", "resolved"].includes(x.status));
    if (t) return { ok: true, ticket_id: t.ticket_id, existing: true, message: confirmText(f.lang, t.ticket_id, t.customer_email, hours) };
  }
  const ticket_id = await newTicketId();
  const fields = { ticket_id, kind: "ticket", customer_email: f.email, customer_name: f.name, customer_message: f.message, consent_at: now(), page: f.page || c?.page || null,
    language: f.lang, country: f.country, market: f.country && currencyForCountry ? currencyForCountry(f.country) : null,
    messages: (c?.messages || []).map(m => ({ role: m.role, text: String(m.text || "").slice(0, 2000), at: m.at })).slice(-40), notes: [], email_log: [], updated_at: now() };
  let row;
  const existing = c?.handoff_id ? await findRecord("agent_handoffs", c.handoff_id) : null;
  if (existing && !["closed", "resolved"].includes(existing.status)) row = await updateRecord("agent_handoffs", existing.id, { ...fields, status: existing.status || "open" });
  else { row = { id: `ho_${crypto.randomBytes(6).toString("hex")}`, tenant_id: tenantId, conversation_id: c?.id || null, status: "open", reason: "contact form", summary: "",
    order_number: c?.slots?.order_number || null, created_at: now(), ...fields }; await addRecord("agent_handoffs", row); }
  if (c) await updateRecord("agent_conversations", c.id, { ticket_id, handoff_id: row.id, slots: { ...(c.slots || {}), email: f.email } });
  const env = process.env;
  const log = await sendTicketMails({ tenantId, ticket: row, brand: "POD.AI", support: env.SUPPORT_EMAIL || publicContactEmail(), extra: list(env.SUPPORT_NOTIFY_EMAILS),
    confirm: env.TICKET_CONFIRM_EMAIL !== "false" && !personalSender(env), hours, adminUrl: `${(env.PUBLIC_BASE_URL || "https://pod.swisspro.site").replace(/\/$/, "")}/admin.html#chatagent` });
  await updateRecord("agent_handoffs", row.id, { email_log: log });
  return { ok: true, ticket_id, message: confirmText(f.lang, ticket_id, f.email, hours) };
}
