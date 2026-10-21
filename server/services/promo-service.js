// Promo / discount codes (admin-promos.html). One code per order (not stackable), applied after the volume
// tiers on the merchandise subtotal. Percent or fixed (CHF / EUR amount), optional expiry, minimum order,
// usage limit and active flag. Usage is counted only when the payment is captured (markPaid).
import crypto from "node:crypto";
import { addRecord, findRecord, findWhere, getState, removeWhere, updateRecord } from "../saas-store.js";
import { HttpError } from "../http/middleware.js";

const CODE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
export const normCode = c => String(c || "").trim().toUpperCase().slice(0, 32);

function validate(b = {}, prev = {}) {
  const x = { ...prev };
  if (b.code !== undefined) { x.code = normCode(b.code); if (!CODE.test(x.code)) throw new HttpError(400, "invalid_code", "Code: 3–32 letters, digits, - or _"); }
  if (b.type !== undefined) { if (!["percent", "fixed"].includes(b.type)) throw new HttpError(400, "invalid_type", "type must be percent or fixed"); x.type = b.type; }
  if (b.value !== undefined) x.value = Number(b.value);
  if (b.amounts !== undefined) x.amounts = { CHF: r2(b.amounts?.CHF), EUR: r2(b.amounts?.EUR) };
  if (b.min_order !== undefined) x.min_order = { CHF: r2(b.min_order?.CHF), EUR: r2(b.min_order?.EUR) };
  if (b.expires_at !== undefined) { x.expires_at = b.expires_at ? new Date(b.expires_at).toISOString() : null; }
  if (b.usage_limit !== undefined) { const n = b.usage_limit === null || b.usage_limit === "" ? null : Math.round(Number(b.usage_limit)); if (n !== null && !(n >= 1)) throw new HttpError(400, "invalid_limit", "Usage limit must be ≥ 1 or empty"); x.usage_limit = n; }
  if (b.active !== undefined) x.active = b.active !== false;
  if (b.description !== undefined) x.description = String(b.description || "").slice(0, 200);
  if (!x.code) throw new HttpError(400, "invalid_code", "Code is required");
  if (x.type === "percent" && !(x.value > 0 && x.value <= 100)) throw new HttpError(400, "invalid_value", "Percent must be between 0 and 100");
  if (x.type === "fixed" && !(x.amounts && (x.amounts.CHF > 0 || x.amounts.EUR > 0))) throw new HttpError(400, "invalid_value", "Fixed codes need a CHF and/or EUR amount");
  x.min_order ||= { CHF: 0, EUR: 0 };
  return x;
}

export async function listPromos(tenantId) { return ((await getState()).promo_codes || []).filter(p => p.tenant_id === tenantId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); }
export async function createPromo(tenantId, body) {
  const x = validate({ active: true, usage_limit: null, expires_at: null, ...body });
  if (await findWhere("promo_codes", p => p.tenant_id === tenantId && p.code === x.code)) throw new HttpError(409, "code_exists", "This code already exists");
  const now = new Date().toISOString();
  return addRecord("promo_codes", { ...x, id: `promo_${crypto.randomBytes(5).toString("hex")}`, tenant_id: tenantId, used_count: 0, created_at: now, updated_at: now });
}
async function own(tenantId, id) { const p = await findRecord("promo_codes", String(id)); if (!p || p.tenant_id !== tenantId) throw new HttpError(404, "promo_not_found", "Promo code not found"); return p; }
export async function updatePromo(tenantId, id, body) {
  const p = await own(tenantId, id), x = validate(body, p);
  if (x.code !== p.code && await findWhere("promo_codes", q => q.tenant_id === tenantId && q.code === x.code)) throw new HttpError(409, "code_exists", "This code already exists");
  return updateRecord("promo_codes", p.id, { ...x, updated_at: new Date().toISOString() });
}
export async function deletePromo(tenantId, id) { const p = await own(tenantId, id); await removeWhere("promo_codes", x => x.id === p.id); return { ok: true }; }

/** Server-side evaluation for a quote. Throws HttpError with a specific code when the code cannot be used. */
export async function evaluatePromo(tenantId, code, { subtotal, currency }) {
  const c = normCode(code);
  if (!c) return null;
  const p = await findWhere("promo_codes", x => x.tenant_id === tenantId && x.code === c);
  if (!p || p.active === false) throw new HttpError(400, "promo_invalid", "This discount code is not valid");
  if (p.expires_at && Date.parse(p.expires_at) < Date.now()) throw new HttpError(400, "promo_expired", "This discount code has expired");
  if (p.usage_limit != null && (p.used_count || 0) >= p.usage_limit) throw new HttpError(400, "promo_used_up", "This discount code has been fully redeemed");
  const min = Number(p.min_order?.[currency] || 0);
  if (min > 0 && subtotal < min) throw new HttpError(400, "promo_min_order", `Minimum order ${currency} ${min.toFixed(2)} for this code`);
  let amount = p.type === "percent" ? r2(subtotal * p.value / 100) : Number(p.amounts?.[currency] || 0);
  if (!(amount > 0)) throw new HttpError(400, "promo_currency", `This code is not valid for ${currency}`);
  amount = Math.min(r2(amount), r2(subtotal));
  return { code: p.code, id: p.id, type: p.type, value: p.type === "percent" ? p.value : amount, amount, min_order: min };
}

/** Called once per paid order (markPaid is idempotent). */
export async function redeemPromo(order) {
  if (!order?.promo?.id || order.promo_redeemed) return;
  const p = await findRecord("promo_codes", order.promo.id);
  if (p) await updateRecord("promo_codes", p.id, { used_count: (p.used_count || 0) + 1, updated_at: new Date().toISOString() });
  await updateRecord("orders", order.id, { promo_redeemed: true });
}
