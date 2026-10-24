// Admin-managed fees & tax ("Fees & tax" page, admin.html #fees section, admin-sections.js): VAT rates per zone / country, the global
// "prices shown excl./incl. VAT" switch (default excl.), shipping rates per zone + method in CHF and EUR,
// carrier day ranges (delivery estimates) and packaging add-on prices. Seeded from the previous values
// (saas-seed.json zones converted with storefront-pricing.json rates; packaging at 0) so nothing changes until edited.
// Persisted in the data store (collection "fee_settings").
import fs from "node:fs";
import { findRecord, addRecord, updateRecord } from "../saas-store.js";
import { HttpError } from "../http/middleware.js";

const seedZones = JSON.parse(fs.readFileSync(new URL("../data/saas-seed.json", import.meta.url), "utf8")).shipping_zones || [];
const pricing = JSON.parse(fs.readFileSync(new URL("../data/storefront-pricing.json", import.meta.url), "utf8"));
const catalog = JSON.parse(fs.readFileSync(new URL("../data/studio-catalog.json", import.meta.url), "utf8"));
const RECORD_ID = "fees_default";
export const FEE_CURRENCIES = ["CHF", "EUR", "USD"];
/** Default FX (units per 1 CHF), always present after a redeploy; admin edits win. */
export const SEED_FX = { EUR: 0.95, USD: 1.13, HKD: 8.8, GBP: 0.88 };
const METHODS = ["standard", "express"];
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const r4 = n => Math.round((Number(n) || 0) * 10000) / 10000;
// Carrier transit (business days) after production, per zone family.
const CARRIER_DAYS = { zone_ch: { standard: [2, 4], express: [1, 2] }, zone_de: { standard: [3, 5], express: [1, 3] }, zone_eu: { standard: [3, 6], express: [2, 3] },
  zone_uk: { standard: [4, 7], express: [2, 4] }, zone_us: { standard: [5, 9], express: [3, 5] }, zone_world: { standard: [6, 12], express: [3, 6] } };

export function seedFees() {
  const rate = c => Number(pricing.storefront_currencies?.[c]?.rate) || 1;
  const shipping = {}, tax = {};
  for (const z of seedZones) {
    tax[z.id] = Number(z.tax_rate || 0);
    shipping[z.id] = { name: z.name, countries: z.countries };
    for (const m of METHODS) {
      shipping[z.id][m] = { days: CARRIER_DAYS[z.id]?.[m] || (m === "express" ? [3, 6] : [6, 12]) };
      for (const c of FEE_CURRENCIES) shipping[z.id][m][c] = { base: r2(z[`${m}_base`] * rate(c)), per_kg: r4(z[`${m}_per_kg`] * rate(c)), free_over: m === "standard" ? r2(z.free_shipping_threshold * rate(c)) : null };
    }
  }
  tax.zone_ch = 0.081;
  const packaging = Object.fromEntries((catalog.packaging || []).map(p => [p.id, { name: p.name?.en || p.id, CHF: 0, EUR: 0 }]));
  return { id: RECORD_ID, version: 1, fx_rates: { ...SEED_FX }, prices_include_vat: false, tax: { zones: tax, countries: {} }, shipping, packaging, default_production_days: 3, updated_at: null, updated_by: "seed" };
}

let cache = null;
export async function initFees() {
  const stored = await findRecord("fee_settings", RECORD_ID);
  if (stored) { const seed = seedFees(); for (const k of ["tax", "shipping", "packaging"]) stored[k] = { ...seed[k], ...(stored[k] || {}) };
    for (const [z, ms] of Object.entries(stored.shipping)) for (const m of METHODS) if (ms?.[m] && !ms[m].USD && seed.shipping[z]?.[m]?.USD) ms[m].USD = seed.shipping[z][m].USD;
    stored.fx_rates = { ...SEED_FX, ...(stored.fx_rates || {}) }; cache = stored; }
  else { cache = seedFees(); await addRecord("fee_settings", cache); }
  return cache;
}
export function getFees() { return cache || (cache = seedFees()); }

/** VAT rate for a destination: country override → zone rate → shipping-zone fallback. */
export function vatRate(country, zoneId, fallback = 0) {
  const f = getFees(), c = String(country || "").toUpperCase();
  if (f.tax.countries?.[c] != null) return Number(f.tax.countries[c]);
  if (f.tax.zones?.[zoneId] != null) return Number(f.tax.zones[zoneId]);
  return Number(fallback || 0);
}
/** Shipping amount in the charge currency, or null when the zone/currency is not managed here (legacy fallback). */
export function shippingAmount(zoneId, method, currency, { weight_kg, subtotal }) {
  const z = getFees().shipping?.[zoneId]?.[method]?.[currency];
  if (!z) return null;
  if (z.free_over != null && Number(z.free_over) > 0 && subtotal >= Number(z.free_over)) return { amount: 0, free: true };
  return { amount: r2(Number(z.base) + weight_kg * Number(z.per_kg || 0)), free: false };
}
export function carrierDays(zoneId, method) { return getFees().shipping?.[zoneId]?.[method]?.days || (method === "express" ? [3, 6] : [6, 12]); }
export const fxFromChf = c => c === "CHF" ? 1 : Number(getFees().fx_rates?.[c] || SEED_FX[c] || 0);
/** Packaging price; USD falls back to CHF x fx when no USD price is set. */
export function packagingPrice(id, currency) { const p = getFees().packaging?.[id] || {}; if (p[currency] != null) return Number(p[currency] || 0); return currency === "USD" ? r2(Number(p.CHF || 0) * fxFromChf("USD")) : 0; }
export function pricesIncludeVat() { return getFees().prices_include_vat === true; }

export function publicFees() {
  const f = getFees(), transit = {};
  for (const [z, ms] of Object.entries(f.shipping || {})) { transit[z] = {}; for (const [m, v] of Object.entries(ms || {})) if (Array.isArray(v?.days)) transit[z][m] = v.days; }
  // transit / production_days feed the public "Shipping & production times" page (no prices, no internal data).
  return { version: f.version, prices_include_vat: !!f.prices_include_vat, packaging: Object.fromEntries(Object.entries(f.packaging || {}).map(([id, p]) => [id, { ...p, USD: packagingPrice(id, "USD") }])), production_days: Number(f.default_production_days ?? 3), transit_days: transit };
}

const num = (v, min, max, label) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, "invalid_fee", `Invalid ${label}`); return n; };
/** Replace settings (validated). Body: { prices_include_vat, tax:{zones,countries}, shipping:{zone:{method:{CHF:{base,per_kg,free_over},EUR,days:[a,b]}}}, packaging:{id:{CHF,EUR}} } */
export async function updateFees(body = {}, { by = "admin" } = {}) {
  if (!cache) await initFees();
  const cur = getFees(), next = structuredClone(cur);
  if (body.prices_include_vat !== undefined) next.prices_include_vat = body.prices_include_vat === true;
  for (const [z, v] of Object.entries(body.tax?.zones || {})) { if (!next.shipping[z]) throw new HttpError(400, "unknown_zone", `Unknown zone ${z}`); next.tax.zones[z] = num(v, 0, 0.5, `VAT rate for ${z}`); }
  if (body.tax?.countries) {
    next.tax.countries = {};
    for (const [c, v] of Object.entries(body.tax.countries)) { if (!/^[A-Z]{2}$/.test(c)) throw new HttpError(400, "invalid_country", `Invalid country ${c}`); if (v === null || v === "") continue; next.tax.countries[c] = num(v, 0, 0.5, `VAT rate for ${c}`); }
  }
  for (const [z, ms] of Object.entries(body.shipping || {})) {
    if (!next.shipping[z]) throw new HttpError(400, "unknown_zone", `Unknown zone ${z}`);
    for (const [m, v] of Object.entries(ms || {})) {
      if (!METHODS.includes(m)) throw new HttpError(400, "unknown_method", `Unknown method ${m}`);
      const t = next.shipping[z][m];
      for (const c of FEE_CURRENCIES) if (v[c]) t[c] = { base: r2(num(v[c].base ?? t[c].base, 0, 10000, `${z} ${m} ${c} base`)), per_kg: r4(num(v[c].per_kg ?? t[c].per_kg, 0, 1000, `${z} ${m} ${c} per kg`)),
        free_over: v[c].free_over === null || v[c].free_over === "" ? null : r2(num(v[c].free_over ?? t[c].free_over ?? 0, 0, 1e6, `${z} ${m} ${c} free over`)) };
      if (v.days) { const [a, b] = v.days.map(x => Math.round(num(x, 0, 60, `${z} ${m} days`))); if (a > b) throw new HttpError(400, "invalid_days", "Day range min must be ≤ max"); t.days = [a, b]; }
    }
  }
  for (const [id, v] of Object.entries(body.packaging || {})) {
    if (!next.packaging[id]) throw new HttpError(400, "unknown_packaging", `Unknown packaging ${id}`);
    for (const c of FEE_CURRENCIES) if (v[c] !== undefined) next.packaging[id][c] = r2(num(v[c], 0, 1000, `${id} ${c}`));
  }
  // CHF -> Shopify store currency rates (units per 1 CHF), e.g. { HKD: 9.6 }; replaces the whole table when sent.
  if (body.fx_rates !== undefined) {
    next.fx_rates = {};
    for (const [c, v] of Object.entries(body.fx_rates || {})) { if (!/^[A-Z]{3}$/.test(c)) throw new HttpError(400, "invalid_currency", `Invalid currency ${c}`); if (v === null || v === "") continue; next.fx_rates[c] = r4(num(v, 0.0001, 100000, `FX rate ${c}`)); }
  }
  if (body.default_production_days !== undefined) next.default_production_days = Math.round(num(body.default_production_days, 0, 60, "production days"));
  Object.assign(next, { version: (cur.version || 1) + 1, updated_at: new Date().toISOString(), updated_by: String(by).slice(0, 80) });
  Object.assign(cur, next);
  if (!(await updateRecord("fee_settings", RECORD_ID, next))) await addRecord("fee_settings", cur);
  return cur;
}

/** Add business days (Mon–Fri) to a date. */
export function addBusinessDays(from, n) {
  const d = new Date(from); d.setUTCHours(12, 0, 0, 0);
  while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) n--; }
  return d.toISOString().slice(0, 10);
}
