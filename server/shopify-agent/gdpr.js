// Mandatory compliance webhooks + app/uninstalled for the Chat Agent app. All data of a shop lives under tenant shopagent_<shop>.
import crypto from "node:crypto";
import { addRecord, listForTenant, removeWhere } from "../saas-store.js";
import { tenantFor, markUninstalled, normalizeShop } from "./core.js";
import { clearFactsCache } from "./profile.js";

const hash = v => crypto.createHash("sha256").update(String(v || "").trim().toLowerCase()).digest("hex").slice(0, 16);
const mentions = (row, email) => !!email && (String(row.customer_email || row.slots?.email || "").toLowerCase() === email || JSON.stringify(row.messages || []).toLowerCase().includes(email));
const log = (shop, type, extra) => addRecord("podai_gdpr", { id: `gd_${crypto.randomBytes(6).toString("hex")}`, tenant_id: tenantFor(shop), shop, type, at: new Date().toISOString(), ...extra });

/** customers/data_request: we record what we hold so the merchant can hand it over (Admin → Privacy). Nothing is e-mailed. */
export async function dataRequest(shop, p = {}) {
  const email = String(p.customer?.email || "").toLowerCase(), tenant = tenantFor(shop);
  const convs = (await listForTenant("podai_conversations", tenant)).filter(c => mentions(c, email));
  const hos = (await listForTenant("podai_handoffs", tenant)).filter(h => mentions(h, email));
  await log(shop, "customers/data_request", { customer: hash(email), request_id: p.data_request?.id || null, conversations: convs.map(c => c.id), handoffs: hos.map(h => h.id) });
  return { conversations: convs.length, handoffs: hos.length };
}
/** customers/redact: delete that customer's chats and handoffs. */
export async function customerRedact(shop, p = {}) {
  const email = String(p.customer?.email || "").toLowerCase(), tenant = tenantFor(shop);
  let removed = 0;
  const convs = await removeWhere("podai_conversations", r => r.tenant_id === tenant && mentions(r, email)); removed += convs.length;
  removed += (await removeWhere("podai_handoffs", r => r.tenant_id === tenant && (mentions(r, email) || convs.some(c => c.id === r.conversation_id)))).length;
  const ids = new Set(convs.map(c => c.id)); // storefront events of those chats (no personal data, but linked by chat id)
  if (ids.size) await removeWhere("podai_events", r => r.tenant_id === tenant && ids.has(r.conversation_id));
  await log(shop, "customers/redact", { customer: hash(email) });
  return { removed };
}
/** shop/redact (48 h after uninstall): delete everything of the shop. */
export async function shopRedact(shop) {
  const tenant = tenantFor(shop);
  for (const col of ["podai_conversations", "podai_handoffs", "podai_settings", "podai_discounts", "podai_events", "podai_usage"]) await removeWhere(col, r => r.tenant_id === tenant);
  await removeWhere("podai_gdpr", r => r.tenant_id === tenant);
  await removeWhere("podai_shops", r => r.id === normalizeShop(shop));
  clearFactsCache(shop);
  return { ok: true };
}
/** Retention (privacy policy): chats + handoffs 12 months after the last activity, storefront events 13 months, GDPR log 3 years. */
export const RETENTION_DAYS = { podai_conversations: 365, podai_handoffs: 365, podai_events: 400, podai_gdpr: 1095, podai_usage: 400 }; // podai_usage: chat counter rows (no personal data)
/** Never deletes podai_shops / access tokens — only aged chats, handoffs, events, GDPR log. */
export async function purgeExpired(nowMs = Date.now()) {
  const out = {};
  const at = { podai_conversations: r => r.last_message_at || r.created_at, podai_handoffs: r => r.updated_at || r.created_at, podai_events: r => r.at, podai_gdpr: r => r.at, podai_usage: r => r.at };
  for (const [col, days] of Object.entries(RETENTION_DAYS)) {
    const cut = nowMs - days * 864e5;
    out[col] = (await removeWhere(col, r => String(r.tenant_id || "").startsWith("shopagent_") && (Date.parse(at[col](r)) || nowMs) < cut)).length;
  }
  out.podai_shops = 0; // explicit: shop sessions are not retention-purged
  return out;
}
export async function uninstalled(shop) { await markUninstalled(shop); clearFactsCache(shop); return { ok: true }; }

const seen = new Map();
export async function handle(topic, shop, payload, webhookId) {
  if (webhookId) { if (seen.has(webhookId)) return { duplicate: true }; seen.set(webhookId, Date.now()); if (seen.size > 5000) seen.delete(seen.keys().next().value); }
  switch (topic) {
    case "customers/data_request": return dataRequest(shop, payload);
    case "customers/redact": return customerRedact(shop, payload);
    case "shop/redact": return shopRedact(shop);
    case "app/uninstalled": return uninstalled(shop);
    default: return { ignored: topic };
  }
}
