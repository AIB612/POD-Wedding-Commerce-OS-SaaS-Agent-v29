// Pod.AI copy of the POD.AI Agent engine (server/pod-agent/customer). Pod.AI-only: edit here, never the site agent.
// Persistence for the customer chat in OUR data store (data/store.json via saas-store.js) — replaces the POD Agent's
// Supabase tables (conversations, messages, handoffs, discounts_issued, settings). Collections:
//   agent_settings       one row per tenant (admin → AI Agent → Settings / Knowledge)
//   agent_conversations  one row per chat (messages capped + redacted, intents, tools, feedback, handoff flag)
//   agent_handoffs       queue for the team (admin → AI Agent → Handoffs). No e-mail is sent automatically.
//   agent_discounts      sales codes issued by the chat (only when enabled in settings)
import crypto from "node:crypto";
import { addRecord, findRecord, getState, listForTenant, removeWhere, updateRecord } from "../../saas-store.js";

export const DEFAULT_SETTINGS = {
  enabled: true,
  human_reply_hours: 24,
  failed_answers_before_handoff: 3,
  max_tokens_per_conversation: 40000,
  max_messages_per_10min: 20,
  greeting: { en: "", zh: "", de: "" },
  // POD Agent "sales discount" rule set (discounts.js checkRules). OFF by default: the chat only explains volume pricing
  // and validates codes the customer already has. When on, it may create ONE single-use promo code per customer/period.
  sales_discount: { enabled: false, percent: 5, valid_hours: 72, per_customer_days: 90, max_per_month: 20 },
  custom_faq: []
};
const MAX_CONVERSATIONS = Number(process.env.AGENT_MAX_CONVERSATIONS || 1000);
const MAX_MESSAGES = 40;
const now = () => new Date().toISOString();

export async function getSettings(tenantId) {
  const r = await findRecord("podai_settings", `agent_${tenantId}`);
  return { ...DEFAULT_SETTINGS, ...(r || {}), sales_discount: { ...DEFAULT_SETTINGS.sales_discount, ...(r?.sales_discount || {}) }, greeting: { ...DEFAULT_SETTINGS.greeting, ...(r?.greeting || {}) }, custom_faq: r?.custom_faq || [] };
}
export async function saveSettings(tenantId, patch) {
  const id = `agent_${tenantId}`, prev = await findRecord("podai_settings", id);
  const row = { ...(prev || { id, tenant_id: tenantId, created_at: now() }), ...patch, updated_at: now() };
  if (prev) await updateRecord("podai_settings", id, row); else await addRecord("podai_settings", row);
  return getSettings(tenantId);
}

export const validConversationId = id => /^c_[a-z0-9]{12,40}$/.test(String(id || ""));
export const newConversationId = () => `c_${crypto.randomBytes(10).toString("hex")}`;

export async function findOrCreateConversation(tenantId, id, { lang, page } = {}) {
  let taken = false;
  if (validConversationId(id)) {
    const c = await findRecord("podai_conversations", id);
    if (c && c.tenant_id === tenantId) return c;
    taken = !!c; // another shop's chat id: never reuse (would overwrite it)
  }
  const conv = { id: validConversationId(id) && !taken ? id : newConversationId(), tenant_id: tenantId, channel: "webchat", status: "open", language: lang || null,
    created_at: now(), last_message_at: now(), messages: [], intents: {}, tools: {}, slots: {}, failed_count: 0, total_tokens: 0, handoff_id: null, page: page || null };
  await addRecord("podai_conversations", conv);
  await prune(tenantId);
  return conv;
}
async function prune(tenantId) {
  const all = (await listForTenant("podai_conversations", tenantId)).sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)));
  if (all.length <= MAX_CONVERSATIONS) return;
  const drop = new Set(all.slice(MAX_CONVERSATIONS).map(c => c.id));
  await removeWhere("podai_conversations", c => drop.has(c.id));
}
export async function saveConversation(conv) {
  conv.messages = conv.messages.slice(-MAX_MESSAGES);
  conv.last_message_at = now();
  await updateRecord("podai_conversations", conv.id, conv);
  return conv;
}
export function recentUserMessages(conv, minutes = 10) {
  const since = Date.now() - minutes * 60_000;
  return conv.messages.filter(m => m.role === "user" && Date.parse(m.at) >= since).length;
}

export async function createHandoff(tenantId, conv, { reason, summary = "", email = null, order_number = null }) {
  const row = { id: `ho_${crypto.randomBytes(6).toString("hex")}`, tenant_id: tenantId, conversation_id: conv.id, status: "open", reason: String(reason || "").slice(0, 200),
    summary: String(summary || "").slice(0, 500), customer_email: email || conv.slots?.email || null, order_number: order_number || conv.slots?.order_number || null,
    language: conv.language || null, messages: conv.messages.slice(-12).map(m => ({ role: m.role, text: m.text, at: m.at })), created_at: now(), updated_at: now(),
    note: "Queued for the team in Admin → AI Agent → Handoffs. No e-mail is sent automatically." };
  await addRecord("podai_handoffs", row);
  conv.status = "handed_off"; conv.handoff_id = row.id;
  return row;
}
export async function appendToHandoff(conv, { text, email }) {
  if (!conv.handoff_id) return null;
  const h = await findRecord("podai_handoffs", conv.handoff_id);
  if (!h) return null;
  const messages = [...(h.messages || []), { role: "user", text, at: now() }].slice(-30);
  return updateRecord("podai_handoffs", h.id, { messages, ...(email ? { customer_email: email } : {}) /* the customer may correct the reply address */, updated_at: now() });
}
export async function listHandoffs(tenantId, { status } = {}) {
  return (await listForTenant("podai_handoffs", tenantId)).filter(h => !status || h.status === status).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}
export async function updateHandoff(tenantId, id, patch) {
  const h = await findRecord("podai_handoffs", id);
  if (!h || h.tenant_id !== tenantId) return null;
  const allowed = {};
  if (["open", "in_progress", "resolved"].includes(patch.status)) allowed.status = patch.status;
  if (patch.note !== undefined) allowed.team_note = String(patch.note || "").slice(0, 1000);
  const row = await updateRecord("podai_handoffs", id, { ...allowed, updated_at: now(), ...(allowed.status === "resolved" ? { resolved_at: now() } : {}) });
  // Resolving the handoff lets the AI answer this conversation again (POD Agent: un-mute).
  if (allowed.status === "resolved") { const c = await findRecord("podai_conversations", h.conversation_id); if (c) await updateRecord("podai_conversations", c.id, { status: "open" }); }
  return row;
}
export async function listConversations(tenantId, { limit = 50 } = {}) {
  return (await listForTenant("podai_conversations", tenantId)).sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at))).slice(0, limit);
}
export async function discountsIssued(tenantId) { return listForTenant("podai_discounts", tenantId); }
export async function recordDiscount(row) { return addRecord("podai_discounts", row); }
export { getState };
