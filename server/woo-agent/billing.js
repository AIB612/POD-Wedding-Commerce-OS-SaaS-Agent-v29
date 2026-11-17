// Pod.AI for WooCommerce — plans. Same tiers and limits as the Shopify app (server/shopify-agent/billing.js PLANS):
//   Free 50 chats / month · Growth 500 chats, USD 19 / month · Pro 2,500 chats, USD 49 / month + optional LLM.
//   Yearly −20 % (Growth USD 182.40, Pro USD 470.40); paid plans start with a 14-day free trial.
// The plan is stored on the site row (podai_woo_sites.plan, default "free"). Payments: Paddle Billing (merchant of record,
// server/billing/paddle.js) — OFF until the Paddle variables are set and PADDLE_ENABLED=true. Staff can still set a plan by
// hand: node server/woo-agent/tools/set-plan.mjs ws_… growth.
import crypto from "node:crypto";
import { PLANS, chatsUsed, recordChat, monthKey } from "../shopify-agent/billing.js";
import { tenantFor, updateSite, getSite } from "./core.js";
import * as paddle from "../billing/paddle.js";
import { addRecord, addRecordOnce, findRecord, findWhere, removeWhere } from "../saas-store.js";
import { logAccess } from "../shopify-agent/security/access-log.js";

export { PLANS };
export const planOf = site => PLANS[site?.plan] || PLANS.free;
export const payments = () => { const c = paddle.config();
  return { enabled: c.enabled, provider: "paddle", env: c.env, currency: "USD", trial_days: paddle.TRIAL_DAYS, annual_discount: paddle.ANNUAL_DISCOUNT,
    note: c.enabled ? "Paddle (merchant of record) handles payment, invoices and VAT." : "Paid plans are not on sale yet." }; };

export async function chatGate(site) {
  const tenant = tenantFor(site.id), plan = planOf(site), used = await chatsUsed(tenant);
  return { plan: plan.handle, limit: plan.chats, used, canStart: used < plan.chats, llm: plan.llm, onStart: conv => recordChat(tenant, conv.id) };
}
const subView = site => site.paddle?.subscription_id && !["canceled"].includes(site.paddle.status) ? { status: site.paddle.status, plan: site.plan, cycle: site.paddle.cycle, trial_ends_at: site.paddle.trial_ends_at, next_billed_at: site.paddle.next_billed_at, scheduled_change: site.paddle.scheduled_change } : null;
export async function billingSummary(site) {
  const plan = planOf(site), used = await chatsUsed(tenantFor(site.id));
  return { plan: plan.handle, name: plan.name, price: plan.price, currency: "USD", limit: plan.chats, used, remaining: Math.max(0, plan.chats - used), llm: plan.llm, month: monthKey(),
    resets_at: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
    plans: Object.values(PLANS).map(p => ({ handle: p.handle, name: p.name, price: p.price, annual_price: paddle.PRICES_USD[p.handle]?.annual ?? null, chats: p.chats, llm: p.llm })),
    payments: payments(), subscription: subView(site) };
}

// ---- checkout (WP admin → signed /billing/checkout → Pod.AI checkout page with Paddle.js overlay) ----
const CHECKOUTS = "podai_paddle_checkouts";
const origin = () => String(process.env.PODAI_PUBLIC_URL || "https://podai.swisspro.site").replace(/\/+$/, "");
export async function startCheckout(site, { plan, cycle, email, return_url }, opts = {}) {
  if (subView(site)) { const e = new Error("already_subscribed"); e.status = 409; throw e; }
  const t = await paddle.createTransaction({ platform: "woocommerce", storeId: site.id, plan, cycle, trialUsed: !!site.paddle?.trial_used }, opts);
  let ret = null; try { const u = new URL(String(return_url || "")); if (u.host === new URL(site.url).host) ret = u.toString(); } catch { /* ignore */ }
  await addRecord(CHECKOUTS, { id: t.transaction_id, store_id: site.id, return_url: ret, email: /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,24}$/.test(String(email || "")) ? String(email) : null, created_at: new Date().toISOString() });
  await removeWhere(CHECKOUTS, x => Date.parse(x.created_at) < Date.now() - 7 * 86400e3).catch(() => {});
  return { url: `${origin()}/billing/checkout?_ptxn=${encodeURIComponent(t.transaction_id)}`, transaction_id: t.transaction_id };
}
export const checkoutRecord = txn => /^txn_[a-z0-9]+$/i.test(String(txn || "")) ? findRecord(CHECKOUTS, txn) : null;
export async function portal(site, opts = {}) {
  return { url: await paddle.portalUrl({ customerId: site.paddle?.customer_id, subscriptionId: site.paddle?.subscription_id }, opts) };
}

// ---- webhook (raw body, Paddle-Signature) ----
/** Apply one verified Paddle event. Idempotent (event id) and ordered (older events for the same subscription are ignored). */
export async function applyPaddleEvent(event, cfg = paddle.config()) {
  const st = paddle.subscriptionState(event, cfg);
  if (!st) return { ok: true, ignored: "event_type" };
  if (st.event_id) { const once = await addRecordOnce("podai_paddle_events", { id: st.event_id, at: new Date().toISOString() }); if (!once.created) return { ok: true, duplicate: true }; }
  let site = st.platform === "woocommerce" && st.store_id ? await getSite(st.store_id) : null;
  if (!site && st.subscription_id) site = (await findWhere("podai_woo_sites", s => s.paddle?.subscription_id === st.subscription_id))?.[0] || null;
  if (!site) return { ok: true, ignored: "unknown_store" };
  if (site.paddle?.subscription_id === st.subscription_id && site.paddle?.occurred_at && Date.parse(site.paddle.occurred_at) > Date.parse(st.occurred_at)) return { ok: true, ignored: "stale" };
  const trial_used = !!site.paddle?.trial_used || st.status === "trialing" || !!st.trial_ends_at;
  await updateSite(site.id, { plan: st.plan, paddle: { subscription_id: st.subscription_id, customer_id: st.customer_id, status: st.status, cycle: st.cycle, price_id: st.price_id,
    trial_ends_at: st.trial_ends_at, next_billed_at: st.next_billed_at, scheduled_change: st.scheduled_change, occurred_at: st.occurred_at, trial_used } });
  logAccess({ actor: "paddle", action: "plan_changed", tenant: tenantFor(site.id), via: "webhook", plan: st.plan, status: st.status }).catch?.(() => {});
  return { ok: true, site_id: site.id, plan: st.plan, status: st.status };
}
