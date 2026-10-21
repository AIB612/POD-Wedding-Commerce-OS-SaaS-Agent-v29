// Admin-managed price list: the single source of truth for every Studio / homepage product's sell price,
// per material, per currency (CHF, EUR) and per quantity tier. Seeded from the previous retail formula
// (base cost + STOREFRONT_MARGIN, charm .90 rounding) so nothing changes until an admin edits a price.
// Persisted in the app data store (saas-store, collection "price_lists"; survives restarts with STORE_PERSIST_PATH).
import fs from "node:fs";
import "../../studio-pricing.js";
import { findRecord, addRecord, updateRecord } from "../saas-store.js";
import { HttpError } from "../http/middleware.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/studio-catalog.json", import.meta.url), "utf8"));
const RECORD_ID = "price_list_default";
export const PRICE_CURRENCIES = { CHF: "CH", EUR: "EU" };
export const SEED_MARGIN = Number(process.env.STOREFRONT_MARGIN || 0.4);
const TIERS = [...catalog.qty_tiers].map(t => t.min_qty).sort((a, b) => a - b);
let cache = null, loaded = false;

/** Prices exactly as the old formula produced them (StudioPricing.quote with list:false). */
export function seedPriceList() {
  const products = {};
  for (const p of catalog.products) {
    const mats = p.materials?.length ? p.materials.map(m => m.id) : [null];
    products[p.id] = {};
    for (const mid of mats) {
      const row = {};
      for (const [cur, market] of Object.entries(PRICE_CURRENCIES)) {
        row[cur] = TIERS.map(min => StudioPricing.quote(catalog, { market, margin: SEED_MARGIN, list: false, items: [{ product_id: p.id, qty: min, material_id: mid }] }).lines[0]?.price ?? null);
      }
      products[p.id][mid || "_"] = row;
    }
  }
  return { id: RECORD_ID, version: 1, currencies: Object.keys(PRICE_CURRENCIES), tiers: TIERS, seeded_margin: SEED_MARGIN, products, updated_at: null, updated_by: "seed" };
}

/** Load stored edits (call once at start-up; getPriceList() falls back to the seed before that). */
export async function initPriceList() {
  const stored = await findRecord("price_lists", RECORD_ID);
  if (stored) cache = mergeSeed(stored);
  else { cache = seedPriceList(); await addRecord("price_lists", cache); }
  loaded = true;
  return cache;
}
// Products added to the catalog after the list was stored get their seed prices.
function mergeSeed(stored) {
  const seed = seedPriceList();
  for (const [pid, mats] of Object.entries(seed.products)) {
    stored.products[pid] ||= {};
    for (const [mid, row] of Object.entries(mats)) stored.products[pid][mid] ||= row;
  }
  stored.tiers ||= seed.tiers; stored.currencies ||= seed.currencies;
  return stored;
}

export function getPriceList() { return cache || (cache = seedPriceList()); }
export const priceListLoaded = () => loaded;

/** Catalog view with the live price list attached (what every StudioPricing.quote call on the server uses). */
export function withPrices(cat) { return { ...cat, price_list: getPriceList() }; }

/** Rows for the admin table. */
export function priceRows() {
  const list = getPriceList(), seed = seedPriceList();
  const rows = [];
  for (const p of catalog.products) for (const [mid, row] of Object.entries(list.products[p.id] || {})) {
    const mat = (p.materials || []).find(m => m.id === mid);
    rows.push({ product_id: p.id, product: p.name?.en || p.id, category: p.category, material_id: mid, material: mat?.name?.en || "—", prices: row, seed: seed.products[p.id]?.[mid] || null });
  }
  return { tiers: list.tiers, currencies: list.currencies, version: list.version, updated_at: list.updated_at, updated_by: list.updated_by, rows };
}

/**
 * Apply edits: [{product_id, material_id, currency, prices:[per tier]}] (or a single price → that tier index via tier).
 * Validates ids, currency and positive amounts; bumps version; persists.
 */
export async function updatePrices(changes, { by = "admin" } = {}) {
  if (!loaded) await initPriceList();
  if (!Array.isArray(changes) || !changes.length || changes.length > 2000) throw new HttpError(400, "invalid_changes", "Provide 1–2000 price changes");
  const list = getPriceList(), next = structuredClone(list.products);
  for (const c of changes) {
    const row = next[c?.product_id]?.[c?.material_id || "_"];
    if (!row) throw new HttpError(400, "unknown_product", `Unknown product/material: ${c?.product_id}/${c?.material_id}`);
    if (!list.currencies.includes(c.currency)) throw new HttpError(400, "unsupported_currency", `Unsupported currency: ${c.currency}`);
    const arr = Array.isArray(c.prices) ? c.prices : null;
    if (!arr || arr.length !== list.tiers.length) throw new HttpError(400, "invalid_prices", `prices must have ${list.tiers.length} entries (one per tier)`);
    const vals = arr.map(Number);
    if (vals.some(v => !(v > 0) || v > 100000)) throw new HttpError(400, "invalid_price", `Prices must be positive amounts (${c.product_id})`);
    row[c.currency] = vals.map(v => Math.round(v * 100) / 100);
  }
  const patch = { products: next, version: (list.version || 1) + 1, updated_at: new Date().toISOString(), updated_by: String(by).slice(0, 80) };
  Object.assign(list, patch);
  if (!(await updateRecord("price_lists", RECORD_ID, patch))) await addRecord("price_lists", list);
  return { version: list.version, updated_at: list.updated_at, changed: changes.length };
}

/** Public, compact list for browsers (served as /price-list.js and /api/prices). */
export function publicPriceList() { const l = getPriceList(); return { version: l.version, tiers: l.tiers, currencies: l.currencies, products: l.products }; }
