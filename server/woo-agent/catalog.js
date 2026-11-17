// Product catalogue of one WooCommerce site, pushed by the plugin (on product save + periodic full sync).
// Public product data only (title, price, currency, image, stock, URL, categories, tags, short text, variations).
// Stored per site in <catalog dir>/<site id>.json (not in store.json: catalogues can be large); cross-process lock +
// atomic write, re-read when the file changes. Search: shared BM25 (multilingual stems, CJK bigrams, typo tolerance).
// Only published, in-stock products with a real price (> 0) are ever returned to the chat.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withFileLock } from "../utils/file-lock.js";
import { BM25 } from "../shared/local-rag.js";
import { productTerms } from "../shared/lang-terms.js";

export const MAX_PRODUCTS = Number(process.env.WOO_MAX_PRODUCTS || 5000);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export function catalogDir() {
  if (process.env.WOO_CATALOG_DIR) return path.resolve(appRoot, process.env.WOO_CATALOG_DIR);
  const p = process.env.STORE_PERSIST_PATH;
  return p ? path.join(path.dirname(path.isAbsolute(p) ? p : path.resolve(appRoot, p)), "woo-catalog") : path.join(appRoot, "data", "woo-catalog");
}
const fileOf = siteId => { if (!/^ws_[a-f0-9]{16}$/.test(siteId)) throw new Error("invalid_site"); return path.join(catalogDir(), `${siteId}.json`); };
const cache = new Map(); // siteId → { stamp, data, index }
const stampOf = f => { try { const s = fs.statSync(f); return `${s.ino}:${s.size}:${s.mtimeMs}`; } catch { return null; } };

function load(siteId) {
  const f = fileOf(siteId), st = stampOf(f), hit = cache.get(siteId);
  if (hit && hit.stamp === st) return hit;
  let data = { products: {}, updated_at: null, full_sync: null };
  if (st) try { data = JSON.parse(fs.readFileSync(f, "utf8")); } catch { /* corrupt → empty; next full sync rewrites */ }
  const entry = { stamp: st, data, index: null }; cache.set(siteId, entry); return entry;
}
async function mutate(siteId, fn) {
  const f = fileOf(siteId);
  await fsp.mkdir(path.dirname(f), { recursive: true, mode: 0o700 });
  return withFileLock(f, async () => {
    cache.delete(siteId); const { data } = load(siteId);
    const out = fn(data); data.updated_at = new Date().toISOString();
    const tmp = `${f}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 }); fs.renameSync(tmp, f);
    cache.delete(siteId); return out;
  });
}

const str = (v, n) => String(v ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const httpUrl = v => /^https?:\/\//i.test(String(v || "")) ? String(v).slice(0, 600) : null;
const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
/** One product from the plugin → stored shape (validated, trimmed). Returns null for unusable rows. */
export function cleanProduct(p = {}, currency = null) {
  const id = String(p.id ?? "").replace(/[^0-9]/g, "").slice(0, 20);
  const name = str(p.name, 200), url = httpUrl(p.url);
  if (!id || !name || !url) return null;
  const variations = (Array.isArray(p.variations) ? p.variations : []).slice(0, 20).map(v => ({ id: String(v.id ?? "").replace(/[^0-9]/g, "").slice(0, 20), title: str(v.title, 120), price: num(v.price), in_stock: v.in_stock !== false })).filter(v => v.id);
  return { id, name, price: num(p.price), regular_price: num(p.regular_price), max_price: num(p.max_price), currency: /^[A-Z]{3}$/.test(p.currency || "") ? p.currency : currency,
    image: httpUrl(p.image), url, in_stock: p.in_stock !== false, stock_quantity: Number.isInteger(p.stock_quantity) ? p.stock_quantity : null, type: ["simple", "variable", "grouped", "external"].includes(p.type) ? p.type : "simple",
    purchasable: p.purchasable !== false, categories: (p.categories || []).slice(0, 10).map(c => str(c, 80)).filter(Boolean), tags: (p.tags || []).slice(0, 20).map(c => str(c, 60)).filter(Boolean),
    description: str(p.short_description || p.description, 400), sku: str(p.sku, 64), on_sale: !!p.on_sale, variations, updated_at: str(p.updated_at, 30) || new Date().toISOString() };
}

/**
 * Upsert products. mode "full": rows are stamped with sync_id; when done=true, products not seen in that sync are removed
 * (deleted / unpublished in WooCommerce). Returns { upserted, removed, total, rejected }.
 */
export async function upsertProducts(siteId, list = [], { mode = "upsert", sync_id = null, done = false, currency = null } = {}) {
  const rows = (Array.isArray(list) ? list : []).slice(0, 200).map(p => cleanProduct(p, currency));
  return mutate(siteId, d => {
    let upserted = 0, removed = 0, rejected = rows.filter(r => !r).length;
    for (const r of rows.filter(Boolean)) {
      if (!d.products[r.id] && Object.keys(d.products).length >= MAX_PRODUCTS) { rejected++; continue; }
      d.products[r.id] = mode === "full" && sync_id ? { ...r, sync: String(sync_id).slice(0, 40) } : { ...r, sync: d.products[r.id]?.sync || null };
      upserted++;
    }
    if (mode === "full" && sync_id && done) {
      for (const [id, p] of Object.entries(d.products)) if (p.sync !== String(sync_id).slice(0, 40)) { delete d.products[id]; removed++; }
      d.full_sync = new Date().toISOString();
    }
    return { upserted, removed, rejected, total: Object.keys(d.products).length };
  });
}
export async function deleteProducts(siteId, ids = []) {
  const set = new Set((ids || []).slice(0, 500).map(x => String(x)));
  return mutate(siteId, d => { let n = 0; for (const id of set) if (d.products[id]) { delete d.products[id]; n++; } return { removed: n, total: Object.keys(d.products).length }; });
}
export function catalogStats(siteId) { const { data } = load(siteId); const all = Object.values(data.products); return { products: all.length, in_stock: all.filter(sellable).length, updated_at: data.updated_at, full_sync: data.full_sync }; }
export async function dropCatalog(siteId) { cache.delete(siteId); await fsp.rm(fileOf(siteId), { force: true }); await fsp.rm(`${fileOf(siteId)}.lock`, { force: true }); }

const sellable = p => p.in_stock && p.purchasable !== false && Number(p.price) > 0;
/** Stored product → the shape the shared engine / recommender / widget use (same as the Shopify adapter). */
export function toEngine(p) {
  const vars = p.variations.length ? p.variations.filter(v => v.price == null || v.price > 0).map(v => ({ id: v.id, title: v.title, price: v.price ?? p.price, available: v.in_stock })) : [{ id: p.id, title: "Default", price: p.price, available: p.in_stock }];
  const simple = p.type === "simple" && sellable(p);
  return { id: p.id, name: p.name, image: p.image, unit_price: p.price, currency: p.currency, max_price: p.max_price ?? p.price, link: p.url, type: p.categories[0] || "", tags: p.tags, collections: p.categories,
    variants: vars, variant_id: simple ? p.id : null, ...(simple ? { cart: { product_id: p.id } } : {}), ...(p.on_sale && p.regular_price > p.price ? { compare_at: p.regular_price } : {}),
    details: p.description ? [{ key: "description", value: p.description.slice(0, 200) }] : [] };
}

/** Search like the Shopify adapter: keywords → relevant sellable products; browse → newest sellable products. */
export function searchCatalog(siteId, query, { browse = false, limit = null } = {}) {
  const entry = load(siteId), all = Object.values(entry.data.products).filter(sellable);
  const max = limit || (browse ? 8 : 5);
  const ts = browse ? [] : productTerms(query);
  if (!ts.length && !browse) return { ok: true, products: [] };
  if (!ts.length) return { ok: true, products: all.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, max).map(toEngine) };
  if (!entry.index) entry.index = new BM25(all.map(p => ({ id: p.id, doc: p, fields: { name: p.name, cats: [...p.categories, ...p.tags, ...p.variations.map(v => v.title)].join(" "), desc: p.description } })), { weights: { name: 3, cats: 2, desc: 0.5 } });
  const hits = entry.index.search(ts.join(" "), { limit: Math.min(50, max * 2) }).filter(h => h.norm >= 0.15);
  return { ok: true, products: hits.slice(0, max).map(h => toEngine(h.doc.doc)) };
}

// ---- agent API (server/agent-api): read-only public view of sellable products ----
/** One stored product by id (null when missing). */
export function getProduct(siteId, id) { const p = load(siteId).data.products[String(id || "").replace(/[^0-9]/g, "")]; return p || null; }
export const isSellable = p => !!p && sellable(p);
/** Sellable products for the agent API: keyword search (BM25) or newest first, then optional price filter. */
export function agentSearch(siteId, query, { limit = 10, min_price = null, max_price = null } = {}) {
  const inRange = p => (min_price == null || p.price >= min_price) && (max_price == null || p.price <= max_price);
  const q = String(query || "").trim();
  if (!q) { const all = Object.values(load(siteId).data.products).filter(p => sellable(p) && inRange(p)); return all.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, limit); }
  const ids = (searchCatalog(siteId, q, { limit: 50 }).products || []).map(p => p.id);
  const data = load(siteId).data.products;
  return ids.map(id => data[id]).filter(p => p && sellable(p) && inRange(p)).slice(0, limit);
}
