// Pod.AI billing — Shopify Managed Pricing (plans are defined in the Partner Dashboard; Shopify hosts the plan page and
// charges the merchant). This module only READS the shop's active subscription and enforces the plan limits:
//   Free   50 chats / month (rules + shop data)
//   Growth 500 chats / month, USD 19 / month (rules + shop data)
//   Pro    2,500 chats / month, USD 49 / month, LLM for complex questions
// A "chat" = one new storefront conversation, counted per shop per calendar month (UTC) in podai_usage
// (one row per started conversation: id, tenant, month — no personal data). Admin "Try it" chats are not counted.
import { addRecordOnce, listForTenant } from "../saas-store.js";
import { normalizeShop, tenantFor, graphql } from "./core.js";
import { getSettings, saveSettings } from "./engine/store.js";

export const PLANS = {
  free: { handle: "free", name: "Free", price: 0, chats: 50, llm: false },
  growth: { handle: "growth", name: "Growth", price: 19, chats: 500, llm: false },
  pro: { handle: "pro", name: "Pro", price: 49, chats: 2500, llm: true }
};
const RANK = { free: 0, growth: 1, pro: 2 };
export const CACHE_MS = 10 * 60_000;
export const ACTIVE_SUBSCRIPTIONS_QUERY = `{ currentAppInstallation { activeSubscriptions { name status test lineItems { plan { pricingDetails { __typename ... on AppRecurringPricing { price { amount currencyCode } interval } } } } } } }`;

/** One subscription → plan handle (handle / name first, case-insensitive; monthly price as fallback). null = not a paid plan. */
export function planForSubscription(sub = {}) {
  const status = String(sub.status || "").toUpperCase();
  if (status && status !== "ACTIVE") return null; // PENDING / CANCELLED / DECLINED / EXPIRED / FROZEN → no paid features
  const name = String(sub.name || "").trim().toLowerCase();
  if (PLANS[name]) return name;
  for (const h of ["pro", "growth", "free"]) if (new RegExp(`(^|[^a-z])${h}([^a-z]|$)`).test(name)) return h;
  let monthly = 0;
  for (const li of sub.lineItems || []) {
    const p = li?.plan?.pricingDetails; const amt = Number(p?.price?.amount);
    if (!p || !Number.isFinite(amt) || !amt) continue;
    monthly = Math.max(monthly, String(p.interval || "").toUpperCase() === "ANNUAL" ? amt / 12 / 0.8 : amt); // 20 % off annual
  }
  if (!monthly) return null;
  return monthly >= (PLANS.growth.price + PLANS.pro.price) / 2 ? "pro" : "growth";
}
/** activeSubscriptions[] → the highest plan among them (no active subscription = Free). */
export function planFromSubscriptions(subs = []) {
  let best = "free", from = null;
  for (const s of subs || []) { const h = planForSubscription(s); if (h && RANK[h] > RANK[best]) { best = h; from = s; } }
  return { ...PLANS[best], subscription: from ? { name: String(from.name || ""), status: String(from.status || ""), test: !!from.test } : null };
}

export const monthKey = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 7); // "2026-11" (UTC)
const ROWS = "podai_usage";
/** Chats started by the shop in the month (UTC). */
export async function chatsUsed(tenantId, month = monthKey()) {
  return (await listForTenant(ROWS, tenantId)).filter(r => r.month === month && r.kind === "chat").length;
}
/** Count one started conversation (idempotent per conversation id). */
export async function recordChat(tenantId, conversationId, ms = Date.now()) {
  const month = monthKey(ms);
  return (await addRecordOnce(ROWS, { id: `u_${month}_${conversationId}`, tenant_id: tenantId, kind: "chat", month, at: new Date(ms).toISOString() })).created;
}

// ---- plan cache (per shop, 10 min; app_subscriptions/update webhook and the admin page force a refresh) ----
const cache = new Map();
export function invalidate(shop) { cache.delete(normalizeShop(shop)); }
/** Active plan of the shop. On a Shopify API error the last known plan (memory, then stored) is kept; never throws. */
export async function getPlan(shop, { force = false, now = Date.now() } = {}) {
  const id = normalizeShop(shop); if (!id) return { ...PLANS.free, subscription: null, source: "invalid_shop" };
  const hit = cache.get(id);
  if (!force && hit && now - hit.at < CACHE_MS) return hit.plan;
  try {
    const d = await graphql(id, ACTIVE_SUBSCRIPTIONS_QUERY);
    const plan = { ...planFromSubscriptions(d?.currentAppInstallation?.activeSubscriptions || []), source: "shopify", checked_at: new Date(now).toISOString() };
    cache.set(id, { at: now, plan });
    const tenant = tenantFor(id), prev = (await getSettings(tenant)).billing;
    if (prev?.plan !== plan.handle) await saveSettings(tenant, { billing: { plan: plan.handle, checked_at: plan.checked_at } });
    return plan;
  } catch (e) {
    if (hit) return { ...hit.plan, source: "cache_stale" };
    const stored = (await getSettings(tenantFor(id)).catch(() => ({}))).billing;
    const plan = { ...(PLANS[stored?.plan] || PLANS.free), subscription: null, source: stored?.plan ? "stored" : "default", error: String(e.message || e).slice(0, 80) };
    cache.set(id, { at: now - CACHE_MS + 60_000, plan }); // retry in 1 min
    return plan;
  }
}

/** Limits for the storefront chat: may a NEW conversation start, may the LLM be used, and the counter callback. */
export async function chatGate(shop) {
  const tenant = tenantFor(shop), plan = await getPlan(shop), used = await chatsUsed(tenant);
  return { plan: plan.handle, limit: plan.chats, used, canStart: used < plan.chats, llm: plan.llm, onStart: conv => recordChat(tenant, conv.id) };
}

const storeHandle = shop => String(normalizeShop(shop) || "").replace(/\.myshopify\.com$/, "");
export const appHandle = () => String(process.env.SHOPIFY_APP_HANDLE || "pod-ai-1").trim().replace(/[^a-z0-9-]/gi, "") || "pod-ai-1";
/** Shopify-hosted plan selection page (Managed Pricing). */
export const pricingUrl = shop => `https://admin.shopify.com/store/${storeHandle(shop)}/charges/${appHandle()}/pricing_plans`;

/** Admin summary: plan, chats used / limit this month, upgrade link. */
export async function billingSummary(shop, { force = false } = {}) {
  const plan = await getPlan(shop, { force }), used = await chatsUsed(tenantFor(shop));
  return { plan: plan.handle, name: plan.name, price: plan.price, limit: plan.chats, used, remaining: Math.max(0, plan.chats - used), llm: plan.llm,
    month: monthKey(), resets_at: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
    test: !!plan.subscription?.test, source: plan.source, pricing_url: pricingUrl(shop) };
}
