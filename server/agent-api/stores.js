// Pod.AI agent API — store adapters. One public, read-only view per store for EXTERNAL AI agents (ChatGPT, Claude,
// Grok, Gemini, custom MCP clients): search sellable products, read one product, build a prefilled cart / checkout link.
// The shopper always completes payment on the store's own checkout; Pod.AI never sees or takes payment data.
//   WooCommerce  store key = site id  "ws_<16 hex>"   catalogue pushed by the pod-ai-chat plugin (server/woo-agent)
//   Shopify      store key = "<shop>.myshopify.com"  Admin GraphQL with the shop's offline token (server/shopify-agent)
// Only stores that are connected/installed AND have "AI agent access" on (default on; merchant toggle) resolve.
// Only in-stock, purchasable products with a real price > 0 are ever returned.
import * as woo from "../woo-agent/core.js";
import * as catalog from "../woo-agent/catalog.js";
import { normalizeShop, isInstalled, graphql, tenantFor as shopTenant } from "../shopify-agent/core.js";
import { shopFactsFor, searchShopProducts } from "../shopify-agent/profile.js";
import { getSettings } from "../shopify-agent/engine/store.js";

export const MAX_ITEMS = 20, MAX_QTY = 99;
const r2 = n => Math.round(Number(n) * 100) / 100;
const pos = n => Number.isFinite(Number(n)) && Number(n) > 0;
const COUPON_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/;
export const PAYMENT_NOTE = "The shopper completes payment on the store's own checkout. Pod.AI never takes payment. Prices are the current catalogue prices; shipping, taxes and discounts are calculated at checkout.";
const cmpVer = (a, b) => { const x = String(a || "0").split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

// ------------------------------------------------------------------ WooCommerce
function wooProduct(p, currency) {
  const variants = (p.variations || []).filter(v => v.in_stock && pos(v.price ?? p.price)).map(v => ({ id: v.id, title: v.title, price: r2(v.price ?? p.price), in_stock: true }));
  return { id: p.id, title: p.name, description: p.description || "", price: r2(p.price), currency: p.currency || currency || null,
    ...(p.on_sale && p.regular_price > p.price ? { compare_at_price: r2(p.regular_price) } : {}), url: p.url, image: p.image || null, in_stock: true,
    type: p.type, sku: p.sku || null, categories: p.categories || [], tags: p.tags || [], variants,
    purchase: p.type === "variable" ? "choose a variant_id" : p.type === "simple" ? "direct" : "on the product page" };
}
function wooStore(site, settings) {
  const st = site.store || {}, currency = st.currency || site.currency || null, base = (st.url || site.url || "").replace(/\/+$/, "");
  return {
    platform: "woocommerce", key: site.id, name: st.name || site.name, url: base, currency,
    info: () => ({ name: st.name || site.name, url: base, platform: "WooCommerce", currency, taxes_included: !!st.taxes_included,
      policies: (st.policies || []).map(p => ({ type: p.type, title: p.title, url: p.url || null })),
      shipping: (st.shipping || []).map(z => ({ zone: z.name, countries: z.rest_of_world ? ["rest of world"] : z.countries, methods: (z.methods || []).map(m => ({ name: m.name, cost: m.cost, free_from: m.min_amount, currency: m.currency || currency })) })),
      public_coupon: st.promo ? { code: st.promo.code, summary: st.promo.summary } : null }),
    async search({ query, limit, min_price, max_price }) { return catalog.agentSearch(site.id, query, { limit, min_price, max_price }).map(p => wooProduct(p, currency)); },
    async product(id) { const p = catalog.getProduct(site.id, id); return catalog.isSellable(p) ? wooProduct(p, currency) : null; },
    async checkout(items, coupon) {
      const lines = [], errors = [];
      for (const it of items) {
        const p = catalog.getProduct(site.id, it.product_id);
        if (!catalog.isSellable(p)) { errors.push({ product_id: it.product_id, error: "not_available" }); continue; }
        if (p.type === "variable") {
          const v = (p.variations || []).find(x => x.id === String(it.variant_id || ""));
          if (!v || !v.in_stock || !pos(v.price ?? p.price)) { errors.push({ product_id: p.id, error: v ? "variant_not_available" : "variant_id_required", variants: (p.variations || []).filter(x => x.in_stock).map(x => ({ id: x.id, title: x.title })) }); continue; }
          lines.push({ product_id: p.id, variant_id: v.id, title: `${p.name} — ${v.title}`, quantity: it.quantity, unit_price: r2(v.price ?? p.price) });
        } else if (p.type === "simple") lines.push({ product_id: p.id, variant_id: null, title: p.name, quantity: it.quantity, unit_price: r2(p.price) });
        else errors.push({ product_id: p.id, error: "not_cartable", url: p.url });
      }
      if (!lines.length) return { ok: false, error: "no_available_items", errors };
      const modern = cmpVer(site.plugin_version || site.versions?.plugin, "1.1.0") >= 0;
      let url;
      if (modern) { const q = new URLSearchParams({ podai_cart: lines.map(l => `${l.variant_id ? `${l.product_id}_${l.variant_id}` : l.product_id}:${l.quantity}`).join(","), ...(coupon ? { coupon } : {}), utm_source: "ai-agent", utm_medium: "pod-ai" }); url = `${base}/?${q}`; }
      else { const l = lines[0]; url = `${base}/?${new URLSearchParams({ "add-to-cart": l.variant_id || l.product_id, quantity: String(l.quantity) })}`; if (lines.length > 1) errors.push({ error: "only_first_item_added_update_plugin" }); }
      return { ok: true, checkout_url: url, lines: modern ? lines : lines.slice(0, 1), errors, currency, coupon: coupon || null };
    },
    tenant: woo.tenantFor(site.id), enabled: settings.agent_api !== false
  };
}

// ------------------------------------------------------------------ Shopify
const gid = (type, id) => `gid://shopify/${type}/${String(id).replace(/[^0-9]/g, "")}`;
const tail = g => String(g || "").split("/").pop();
const PRODUCT_BY_ID = `query($id: ID!) { product(id: $id) { id title handle status onlineStoreUrl description(truncateAt: 400) productType tags featuredImage { url }
  priceRangeV2 { minVariantPrice { amount currencyCode } } collections(first: 5) { nodes { title } } variants(first: 50) { nodes { id title price compareAtPrice availableForSale sku } } } }`;
const VARIANTS_Q = `query($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id title price availableForSale product { id title status } } } }`;
function shopifyProduct(p, base) {
  const variants = (p.variants || []).filter(v => v.available && pos(v.price)).map(v => ({ id: String(v.id), title: v.title, price: r2(v.price), in_stock: true }));
  if (!variants.length) return null;
  const price = Math.min(...variants.map(v => v.price));
  return { id: tail(p.id), title: p.name, description: p.description || "", price, currency: p.currency || null, url: p.link, image: p.image || null, in_stock: true,
    type: p.type || "", categories: p.collections || [], tags: p.tags || [], variants, purchase: variants.length > 1 ? "choose a variant_id" : "direct" };
}
function shopifyStore(shop, settings, facts) {
  const base = String(facts.url || `https://${shop}`).replace(/\/+$/, "");
  return {
    platform: "shopify", key: shop, name: facts.shop_name, url: base, currency: facts.currency,
    info: () => ({ name: facts.shop_name, url: base, platform: "Shopify", currency: facts.currency, taxes_included: !!facts.taxes_included,
      policies: (facts.policies || []).map(p => ({ type: p.type, title: p.title, url: p.url || null })), shipping: null, public_coupon: null }),
    async search({ query, limit, min_price, max_price }) {
      const q = String(query || "").trim();
      const r = await searchShopProducts(shop, q, { browse: !q, limit: Math.min(50, limit * 3) });
      if (!r.ok) throw Object.assign(new Error("store_unavailable"), { status: 502 });
      return (r.products || []).map(p => shopifyProduct(p, base)).filter(Boolean).filter(p => (min_price == null || p.price >= min_price) && (max_price == null || p.price <= max_price)).slice(0, limit);
    },
    async product(id) {
      if (!/^\d{1,20}$/.test(String(id || ""))) return null;
      const d = await graphql(shop, PRODUCT_BY_ID, { id: gid("Product", id) }).catch(() => null), p = d?.product;
      if (!p || p.status !== "ACTIVE" || !p.handle) return null;
      return shopifyProduct({ id: p.id, name: p.title, description: p.description, currency: p.priceRangeV2?.minVariantPrice?.currencyCode, link: p.onlineStoreUrl || `${base}/products/${p.handle}`,
        image: p.featuredImage?.url, type: p.productType, tags: p.tags, collections: (p.collections?.nodes || []).map(c => c.title),
        variants: (p.variants?.nodes || []).map(v => ({ id: tail(v.id), title: v.title, price: Number(v.price), available: !!v.availableForSale })) }, base);
    },
    async checkout(items, coupon) {
      const lines = [], errors = [];
      // product_id without variant → the product's first available variant
      const want = [];
      for (const it of items) {
        if (it.variant_id) { want.push({ ...it, vid: String(it.variant_id).replace(/[^0-9]/g, "") }); continue; }
        const p = await this.product(it.product_id);
        if (!p) { errors.push({ product_id: it.product_id, error: "not_available" }); continue; }
        if (p.variants.length > 1) { errors.push({ product_id: p.id, error: "variant_id_required", variants: p.variants.map(v => ({ id: v.id, title: v.title })) }); continue; }
        want.push({ ...it, vid: p.variants[0].id });
      }
      if (want.length) {
        const d = await graphql(shop, VARIANTS_Q, { ids: want.map(w => gid("ProductVariant", w.vid)) }).catch(() => null);
        const byId = new Map((d?.nodes || []).filter(Boolean).map(n => [tail(n.id), n]));
        for (const w of want) {
          const n = byId.get(w.vid);
          if (!n || !n.availableForSale || n.product?.status !== "ACTIVE" || !pos(n.price) || (w.product_id && tail(n.product.id) !== String(w.product_id))) { errors.push({ product_id: w.product_id || null, variant_id: w.vid, error: "not_available" }); continue; }
          lines.push({ product_id: tail(n.product.id), variant_id: w.vid, title: n.title && n.title !== "Default Title" ? `${n.product.title} — ${n.title}` : n.product.title, quantity: w.quantity, unit_price: r2(n.price) });
        }
      }
      if (!lines.length) return { ok: false, error: "no_available_items", errors };
      // Shopify cart permalink: /cart/<variant>:<qty>,… opens checkout with these items (optional ?discount=)
      const q = new URLSearchParams({ ...(coupon ? { discount: coupon } : {}), ref: "pod-ai-agent" });
      return { ok: true, checkout_url: `${base}/cart/${lines.map(l => `${l.variant_id}:${l.quantity}`).join(",")}?${q}`, lines, errors, currency: facts.currency, coupon: coupon || null };
    },
    tenant: shopTenant(shop), enabled: settings.agent_api !== false
  };
}

/** Resolve a public store key → store adapter, or { error } (404 for unknown / disabled — no enumeration hints). */
export async function resolveStore(key) {
  const k = String(key || "").trim().toLowerCase();
  if (woo.validSiteId(k)) {
    const site = await woo.getSite(k);
    if (!site || site.status !== "active") return { error: "store_not_found" };
    const s = wooStore(site, await getSettings(woo.tenantFor(site.id)));
    return s.enabled ? { store: s } : { error: "store_not_found" };
  }
  const shop = normalizeShop(k);
  if (shop) {
    if (!(await isInstalled(shop))) return { error: "store_not_found" };
    const settings = await getSettings(shopTenant(shop));
    if (settings.agent_api === false) return { error: "store_not_found" };
    const facts = await shopFactsFor(shop);
    if (facts.error) return { error: "store_unavailable", status: 502 };
    return { store: shopifyStore(shop, settings, facts) };
  }
  return { error: "store_not_found" };
}

/** Validate checkout-link input → { items, coupon } or { error }. */
export function cleanCheckoutInput(b = {}) {
  const raw = Array.isArray(b.items) ? b.items : [];
  if (!raw.length) return { error: "items_required" };
  if (raw.length > MAX_ITEMS) return { error: "too_many_items" };
  const items = [];
  for (const it of raw) {
    const product_id = String(it?.product_id ?? "").replace(/[^0-9]/g, "").slice(0, 20), variant_id = String(it?.variant_id ?? "").replace(/[^0-9]/g, "").slice(0, 20) || null;
    const quantity = Number(it?.quantity ?? 1);
    if (!product_id && !variant_id) return { error: "product_id_required" };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) return { error: "invalid_quantity" };
    const dup = items.find(x => x.product_id === product_id && x.variant_id === variant_id);
    if (dup) dup.quantity = Math.min(MAX_QTY, dup.quantity + quantity); else items.push({ product_id, variant_id, quantity });
  }
  const coupon = b.coupon == null || b.coupon === "" ? null : String(b.coupon).trim();
  if (coupon && !COUPON_RE.test(coupon)) return { error: "invalid_coupon" };
  return { items, coupon };
}
/** Validate search input. */
export function cleanSearchInput(b = {}) {
  const n = v => v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : NaN;
  const min_price = n(b.min_price), max_price = n(b.max_price), limit = b.limit == null || b.limit === "" ? 10 : Number(b.limit);
  if (Number.isNaN(min_price) || Number.isNaN(max_price)) return { error: "invalid_price" };
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) return { error: "invalid_limit" };
  return { query: String(b.query ?? b.q ?? "").slice(0, 200), limit, min_price, max_price };
}
