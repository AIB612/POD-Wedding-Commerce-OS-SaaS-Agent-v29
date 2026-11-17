// Pod.AI "Contact us" tickets. When a handoff gets the customer's e-mail (widget e-mail field or typed in the chat), the handoff
// becomes ticket POD-T-XXXXXX (collection podai_handoffs, per shop) and the transcript is e-mailed to the MERCHANT:
// Settings → "Ticket e-mail" (support_email) or, when empty, the shop's contact e-mail from Shopify. Reply-To = customer,
// so the merchant answers from their own mailbox. No confirmation e-mail is sent to the shopper from our domain.
// Data: only the customer's e-mail, the order number they typed and the chat (protected customer data: purpose = reply).
import { findRecord, updateRecord } from "../../saas-store.js";
import { newTicketId, sendTicketMails, confirmText, validEmail } from "../../shared/tickets-core.js";
import { logAccess } from "../security/access-log.js";

/** Create the ticket for the conversation's open handoff once an e-mail is known. Returns { ticket_id, created } or null. */
export async function ensurePodaiTicket({ tenantId, conv, profile, settings, lang }) {
  const h = conv.handoff_id ? await findRecord("podai_handoffs", conv.handoff_id) : null;
  if (!h || !validEmail(h.customer_email) || h.status === "resolved") return null;
  if (h.ticket_id) return { ticket_id: h.ticket_id, created: false, email: h.customer_email };
  const ticket_id = await newTicketId("podai_handoffs");
  let facts = null; try { facts = await profile?.facts?.(); } catch { /* shop offline: still create the ticket */ }
  const shop = profile?.shop || String(tenantId).replace(/^shopagent_/, "");
  const to = validEmail(settings?.support_email) ? settings.support_email : validEmail(facts?.email) ? facts.email : null;
  const row = await updateRecord("podai_handoffs", h.id, { ticket_id, kind: "ticket", language: lang || h.language || null, page: conv.page || null, notes: h.notes || [],
    messages: (conv.messages || []).slice(-30).map(m => ({ role: m.role, text: String(m.text || "").slice(0, 2000), at: m.at })), updated_at: new Date().toISOString() });
  conv.ticket_id = ticket_id;
  const log = to ? await sendTicketMails({ tenantId, ticket: { ...row, market: facts?.currency || null }, brand: `Pod.AI · ${facts?.shop_name || shop}`, support: to, extra: [], confirm: false,
    hours: settings?.human_reply_hours || 24, adminUrl: profile?.adminUrl || `https://${shop}/admin/apps`, type: "podai_ticket" }) : [{ kind: "team", status: "no_ticket_email", at: new Date().toISOString() }];
  await updateRecord("podai_handoffs", h.id, { email_log: log });
  logAccess({ actor: "pod_ai", action: "ticket_email_to_merchant", shop, tenant: tenantId, via: "chat", ids: [h.id] }).catch(() => {});
  return { ticket_id, created: true, email: h.customer_email };
}
export const ticketLine = (lang, id, email, hours) => confirmText(lang, id, email, hours);
