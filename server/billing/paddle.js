// Paddle Billing (merchant of record) for Pod.AI plans sold OUTSIDE the Shopify App Store — the WooCommerce plugin.
// (Shopify merchants keep paying through Shopify's own billing, as the App Store requires.)
//
// OFF unless every variable below is set AND PADDLE_ENABLED=true. Values are read by name only, never logged.
//   PADDLE_ENABLED=true            explicit switch (keys alone do not start selling)
//   PADDLE_ENV=sandbox|production  default sandbox (sandbox-api.paddle.com, Paddle.js sandbox)
//   PADDLE_API_KEY                 server API key (Paddle → Developer tools → Authentication)
//   PADDLE_CLIENT_TOKEN            client-side token for Paddle.js (test_… in sandbox, live_… in production)
//   PADDLE_WEBHOOK_SECRET          secret of the notification destination <origin>/billing/paddle/webhook
//   PADDLE_PRICE_GROWTH_MONTHLY / PADDLE_PRICE_GROWTH_ANNUAL / PADDLE_PRICE_PRO_MONTHLY / PADDLE_PRICE_PRO_ANNUAL   pri_… ids
//   optional PADDLE_PRICE_<PLAN>_<CYCLE>_NOTRIAL   same price without the 14-day trial (used when the site already had a trial)
// Prices in Paddle: Growth USD 19 / month, USD 182.40 / year · Pro USD 49 / month, USD 470.40 / year (−20 %), 14-day trial.
import crypto from "node:crypto";

export const TRIAL_DAYS = 14, ANNUAL_DISCOUNT = 20;
export const PRICES_USD = { growth: { monthly: 19, annual: 182.4 }, pro: { monthly: 49, annual: 470.4 } };
const PLANS = ["growth", "pro"], CYCLES = ["monthly", "annual"];
const envKey = (plan, cycle, suffix = "") => `PADDLE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}${suffix}`;

export function config(env = process.env) {
  const prices = {}, missing = [];
  for (const p of PLANS) for (const c of CYCLES) { const v = String(env[envKey(p, c)] || "").trim(); if (/^pri_[a-z0-9]{10,}$/i.test(v)) (prices[p] ||= {})[c] = v; else missing.push(envKey(p, c)); }
  for (const k of ["PADDLE_API_KEY", "PADDLE_CLIENT_TOKEN", "PADDLE_WEBHOOK_SECRET"]) if (!String(env[k] || "").trim()) missing.push(k);
  const production = env.PADDLE_ENV === "production";
  return { enabled: env.PADDLE_ENABLED === "true" && !missing.length, switch: env.PADDLE_ENABLED === "true", missing, env: production ? "production" : "sandbox",
    api: production ? "https://api.paddle.com" : "https://sandbox-api.paddle.com", prices,
    noTrial: Object.fromEntries(PLANS.map(p => [p, Object.fromEntries(CYCLES.map(c => [c, String(env[envKey(p, c, "_NOTRIAL")] || "").trim()]).filter(([, v]) => /^pri_/.test(v)))])) };
}
/** price id → { plan, cycle } (trial and no-trial variants). */
export function planForPrice(priceId, cfg = config()) {
  for (const p of PLANS) for (const c of CYCLES) if (cfg.prices[p]?.[c] === priceId || cfg.noTrial[p]?.[c] === priceId) return { plan: p, cycle: c };
  return null;
}

/** Verify a Paddle-Signature header ("ts=…;h1=…[;h1=…]") over `${ts}:${rawBody}` (HMAC-SHA256, ±5 min). */
export function verifySignature(raw, header, secret = process.env.PADDLE_WEBHOOK_SECRET, { nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300 } = {}) {
  if (!secret || !header) return false;
  const parts = String(header).split(";").map(x => x.trim().split("=")), ts = parts.find(([k]) => k === "ts")?.[1], sigs = parts.filter(([k]) => k === "h1").map(([, v]) => v);
  if (!/^\d{9,11}$/.test(String(ts || "")) || !sigs.length || Math.abs(nowSec - Number(ts)) > toleranceSec) return false;
  const body = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw || ""));
  const want = crypto.createHmac("sha256", secret).update(`${ts}:`).update(body).digest();
  return sigs.some(h => { const got = Buffer.from(String(h), "hex"); return got.length === want.length && crypto.timingSafeEqual(got, want); });
}
/** Test helper: build a valid Paddle-Signature header. */
export const signForTest = (raw, secret, ts = Math.floor(Date.now() / 1000)) => `ts=${ts};h1=${crypto.createHmac("sha256", secret).update(`${ts}:${raw}`).digest("hex")}`;

async function api(cfg, method, path, body, fetchImpl = fetch) {
  const r = await fetchImpl(`${cfg.api}${path}`, { method, headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}`, "Content-Type": "application/json", "Paddle-Version": "1" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d?.error?.code || `paddle_http_${r.status}`); e.status = 502; throw e; }
  return d.data;
}

/**
 * Create a Paddle transaction for a plan (custom_data ties it to the store) → transaction id for the checkout page.
 * The 14-day trial is part of the Paddle price; a site that already had a trial gets the _NOTRIAL price when configured.
 */
export async function createTransaction({ platform, storeId, plan, cycle, trialUsed = false }, { cfg = config(), fetchImpl } = {}) {
  if (!cfg.enabled) { const e = new Error("payments_disabled"); e.status = 503; throw e; }
  if (!PLANS.includes(plan) || !CYCLES.includes(cycle)) { const e = new Error("invalid_plan"); e.status = 400; throw e; }
  const price = (trialUsed && cfg.noTrial[plan]?.[cycle]) || cfg.prices[plan][cycle];
  const t = await api(cfg, "POST", "/transactions", { items: [{ price_id: price, quantity: 1 }], custom_data: { platform, store_id: storeId, plan, cycle } }, fetchImpl);
  return { transaction_id: t.id, price_id: price };
}
/** Customer portal link (change plan, payment method, invoices, cancel). */
export async function portalUrl({ customerId, subscriptionId }, { cfg = config(), fetchImpl } = {}) {
  if (!cfg.enabled) { const e = new Error("payments_disabled"); e.status = 503; throw e; }
  if (!/^ctm_[a-z0-9]+$/i.test(String(customerId || ""))) { const e = new Error("no_subscription"); e.status = 404; throw e; }
  const d = await api(cfg, "POST", `/customers/${customerId}/portal-sessions`, subscriptionId ? { subscription_ids: [subscriptionId] } : {}, fetchImpl);
  return d?.urls?.general?.overview || null;
}

/**
 * Subscription webhook → plan state for the store. Returns null for events we ignore.
 *   active / trialing / past_due → paid plan (past_due keeps the plan while Paddle retries the payment)
 *   paused / canceled            → free
 */
export function subscriptionState(event, cfg = config()) {
  if (!/^subscription\./.test(String(event?.event_type || ""))) return null;
  const d = event.data || {}, price = d.items?.[0]?.price?.id, map = planForPrice(price, cfg);
  const paid = ["active", "trialing", "past_due"].includes(d.status) && map;
  return { store_id: d.custom_data?.store_id || null, platform: d.custom_data?.platform || null, subscription_id: d.id, customer_id: d.customer_id || null,
    status: d.status, plan: paid ? map.plan : "free", cycle: map?.cycle || null, price_id: price || null,
    trial_ends_at: d.items?.[0]?.trial_dates?.ends_at || null, next_billed_at: d.next_billed_at || null, scheduled_change: d.scheduled_change?.action || null,
    occurred_at: event.occurred_at || new Date().toISOString(), event_id: event.event_id || null };
}
/** Cancel at the end of the billing period (store disconnected / plugin uninstalled). Best effort. */
export async function cancelSubscription(subscriptionId, { cfg = config(), fetchImpl } = {}) {
  if (!cfg.enabled || !/^sub_[a-z0-9]+$/i.test(String(subscriptionId || ""))) return { ok: false };
  try { await api(cfg, "POST", `/subscriptions/${subscriptionId}/cancel`, { effective_from: "next_billing_period" }, fetchImpl); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}
