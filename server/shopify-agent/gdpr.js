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
  for (const col of ["podai_conversations", "podai_handoffs"]) removed += (await removeWhere(col, r => r.tenant_id === tenant && mentions(r, email))).length;
  await log(shop, "customers/redact", { customer: hash(email) });
  return { removed };
}
/** shop/redact (48 h after uninstall): delete everything of the shop. */
export async function shopRedact(shop) {
  const tenant = tenantFor(shop);
  for (const col of ["podai_conversations", "podai_handoffs", "podai_settings", "podai_discounts", "podai_events"]) await removeWhere(col, r => r.tenant_id === tenant);
  await removeWhere("podai_gdpr", r => r.tenant_id === tenant);
  await removeWhere("podai_shops", r => r.id === normalizeShop(shop));
  clearFactsCache(shop);
  return { ok: true };
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
