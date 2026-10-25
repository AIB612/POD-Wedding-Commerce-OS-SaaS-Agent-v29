// Market FX rates (units per 1 CHF) for pushing prices to Shopify stores in any currency.
// Fetched from free, key-less sources (open.er-api.com, fallback ECB via frankfurter.dev) on startup and daily,
// cached in the data store (collection "fx_market"); on failure the last stored rates (then admin/seed values) stay in use.
import { findRecord, addRecord, updateRecord } from "../saas-store.js";

const RECORD_ID = "fx_market";
const DAY = 24 * 60 * 60 * 1000;
const SOURCES = [
  { name: "open.er-api.com", url: "https://open.er-api.com/v6/latest/CHF", parse: d => (d?.result === "success" ? { rates: d.rates, as_of: d.time_last_update_utc ? new Date(d.time_last_update_utc).toISOString() : null } : null) },
  { name: "frankfurter.dev (ECB)", url: "https://api.frankfurter.dev/v1/latest?base=CHF", parse: d => (d?.rates ? { rates: d.rates, as_of: d.date ? `${d.date}T16:00:00.000Z` : null } : null) }
];
let cache = null, timer = null;

/** Plausibility: 3-letter codes, positive numbers, and EUR/USD within a sane band so a broken feed never lands. */
export function cleanRates(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) if (/^[A-Z]{3}$/.test(k) && k !== "CHF" && Number(v) > 0 && Number(v) < 1e7) out[k] = Math.round(Number(v) * 1e4) / 1e4;
  if (!(out.EUR > 0.5 && out.EUR < 2) || !(out.USD > 0.5 && out.USD < 2.5)) return null;
  return out;
}
export function getMarket() { return cache; }
export async function loadMarket() { try { cache = (await findRecord("fx_market", RECORD_ID)) || cache; } catch {} return cache; }

export async function syncMarket({ fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  const errors = [];
  for (const s of SOURCES) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
      const r = await fetchImpl(s.url, { signal: ctl.signal, headers: { accept: "application/json" } }).finally(() => clearTimeout(t));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const p = s.parse(await r.json()), rates = p && cleanRates(p.rates);
      if (!rates) throw new Error("implausible or empty rates");
      const rec = { id: RECORD_ID, base: "CHF", rates, source: s.name, as_of: p.as_of, fetched_at: new Date().toISOString(), last_error: null };
      if (!(await updateRecord("fx_market", RECORD_ID, rec))) await addRecord("fx_market", rec);
      cache = rec; console.log(`[fx] market rates updated from ${s.name} (EUR ${rates.EUR}, USD ${rates.USD}${rates.HKD ? `, HKD ${rates.HKD}` : ""})`);
      return { ok: true, ...rec };
    } catch (e) { errors.push(`${s.name}: ${e.message}`); }
  }
  const msg = errors.join("; ");
  console.warn(`[fx] market rate sync failed, keeping last stored rates: ${msg}`);
  if (cache) { cache = { ...cache, last_error: msg, last_error_at: new Date().toISOString() }; await updateRecord("fx_market", RECORD_ID, { last_error: msg, last_error_at: cache.last_error_at }).catch(() => {}); }
  return { ok: false, error: msg, ...(cache || {}) };
}

/** Startup + daily sync (FX_SYNC=0 disables, e.g. offline tests). */
export async function startFxSync() {
  await loadMarket();
  if (process.env.FX_SYNC === "0") return;
  const stale = !cache?.fetched_at || Date.now() - Date.parse(cache.fetched_at) > DAY / 2;
  if (stale) syncMarket().catch(() => {});
  if (!timer) { timer = setInterval(() => syncMarket().catch(() => {}), DAY); timer.unref?.(); }
}
