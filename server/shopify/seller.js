// Seller (merchant) publish flow: the seller's own studio design -> Shopify product (no checkout/payment for the seller).
// Mockup PNGs are rendered in the browser, stored under <generatedDir>/.seller-media and served at /seller-media/<id>.png
// (unguessable ids) so Shopify can fetch them as productSet `files` (originalSource).
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import * as shopify from "./app.js";
import * as repo from "./repo.js";
import { baseUrl } from "../config.js";

export const CURRENCIES = ["EUR", "CHF", "USD"];
export const SELLER_NS = "pod_wedding";
const PNG = [0x89, 0x50, 0x4e, 0x47];
const MEDIA_ID = /^[a-f0-9]{24}$/;
const err = (status, code, message) => Object.assign(new Error(message || code), { status, code });
const r2 = v => Math.round(Number(v) * 100) / 100;
const money = v => r2(v).toFixed(2);
const clip = (s, n) => String(s ?? "").trim().slice(0, n);

export const mediaDir = generatedDir => path.join(generatedDir, ".seller-media");
/** Public base Shopify can fetch from (APP_URL when https, else PUBLIC_BASE_URL / localhost — not fetchable by Shopify). */
export function mediaBase(fallback = "") {
  const app = shopify.config().appUrl || "";
  return (/^https:\/\//.test(app) ? app : process.env.PUBLIC_BASE_URL || fallback || baseUrl()).replace(/\/$/, "");
}
export const isPublicBase = b => /^https:\/\//.test(b) && !/localhost|127\.0\.0\.1/.test(b);

export async function saveMedia({ generatedDir, dataUrl, fallbackBase = "" }) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw err(400, "invalid_image", "Mockup must be a PNG data URL");
  const buf = Buffer.from(m[1], "base64");
  if (buf.length > 3 * 1024 * 1024) throw err(413, "image_too_large", "Mockup PNG must be 3 MB or smaller");
  if (!PNG.every((b, i) => buf[i] === b)) throw err(400, "invalid_image", "File content is not a PNG");
  const id = crypto.randomBytes(12).toString("hex"), dir = mediaDir(generatedDir);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${id}.png`), buf);
  const base = mediaBase(fallbackBase);
  return { id, url: `${base}/seller-media/${id}.png`, public: isPublicBase(base) };
}
export function mediaPath(generatedDir, id) { return MEDIA_ID.test(id) ? path.join(mediaDir(generatedDir), `${id}.png`) : null; }
export const mediaExists = (generatedDir, id) => { const p = mediaPath(generatedDir, id); return !!p && fs.existsSync(p); };

/** Validate + normalise the seller form. Throws 422 with a readable message. */
export function cleanListing(body = {}, catalogProducts = shopify.catalog().products) {
  const product = catalogProducts.find(p => p.id === body.product_id);
  if (!product) throw err(404, "product_not_found", "Unknown product");
  const prices = {}, fees = {};
  for (const c of CURRENCIES) {
    const p = Number(body.prices?.[c]), f = Number(body.shipping?.fee?.[c] ?? 0);
    if (!(p > 0) || p > 100000) throw err(422, "invalid_price", `Retail price in ${c} must be greater than 0`);
    if (!(f >= 0) || f > 10000) throw err(422, "invalid_shipping_fee", `Shipping fee in ${c} must be 0 or more`);
    prices[c] = r2(p); fees[c] = r2(f);
  }
  const images = (Array.isArray(body.images) ? body.images : []).filter(u => typeof u === "string" && /^https?:\/\/[^\s]+\/seller-media\/[a-f0-9]{24}\.png$/.test(u)).slice(0, 10);
  if (!images.length) throw err(422, "no_images", "Generate at least one mockup image first");
  const s = body.shipping || {};
  const processing = Math.round(Number(s.processing_days ?? product.production_days ?? 3));
  if (!(processing >= 0 && processing <= 60)) throw err(422, "invalid_processing_time", "Processing time must be 0–60 days");
  const weight = Math.round(Number(s.weight_g ?? product.weight_g ?? 0));
  if (!(weight >= 0 && weight <= 70000)) throw err(422, "invalid_weight", "Weight must be 0–70000 g");
  const zones = (Array.isArray(s.zones) ? s.zones : []).map(z => String(z).toUpperCase()).filter(z => /^[A-Z]{2,6}$/.test(z)).slice(0, 20);
  const mats = product.materials || [];
  if (body.material_id && mats.length && !mats.some(m => m.id === body.material_id)) throw err(422, "invalid_material", "Unknown material for this product");
  const material = mats.find(m => m.id === body.material_id) || mats[0] || null;
  return {
    product, material, prices, images,
    title: clip(body.title, 255) || (product.name?.en || product.id),
    description: clip(body.description, 5000),
    status: body.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    shipping: { fee: fees, processing_days: processing, weight_g: weight, ship_from: clip(s.ship_from, 2).toUpperCase() || "CH", zones: zones.length ? zones : ["CH", "EU", "US"], profile: clip(s.profile, 80) || "POD Wedding Studio" },
    sku: clip(body.sku, 60).replace(/[^A-Za-z0-9._-]/g, "") || `wedai-${product.id}${material ? `-${material.id}` : ""}-${Date.now().toString(36)}`
  };
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/** Pure: ProductSetInput for a seller listing in the shop's base currency. */
export function buildSellerProductInput(l, { shopCurrency = "CHF", fx = shopify.fxRates() } = {}) {
  const cur = String(shopCurrency || "CHF").toUpperCase();
  let price = l.prices[cur];
  if (price == null) { const rate = fx[cur]; if (!rate) throw err(422, "no_fx_rate", `Shop currency ${cur} has no CHF->${cur} rate configured`); price = r2(l.prices.CHF * rate); }
  const sh = l.shipping;
  const ship = `<p><strong>Shipping:</strong> ships from ${esc(sh.ship_from)} to ${esc(sh.zones.join(", "))}; made to order in ${sh.processing_days} business day(s).</p>`;
  const desc = l.description ? `<p>${esc(l.description).replace(/\n/g, "<br>")}</p>` : `<p>${esc(l.title)} — personalised wedding product, printed on demand.</p>`;
  const matName = l.material ? clip(l.material.name?.en || Object.values(l.material.name || {})[0] || l.material.id, 255) : "";
  const opt = l.material ? { name: "Material", value: matName } : { name: "Title", value: "Default Title" };
  const mf = (key, type, value) => ({ namespace: SELLER_NS, key, type, value: typeof value === "string" ? value : JSON.stringify(value) });
  return {
    title: l.title, descriptionHtml: desc + ship, vendor: "POD Wedding Studio", productType: l.product.category || "", status: l.status,
    tags: ["pod-wedding", "wed-ai-seller", l.product.category].filter(Boolean),
    productOptions: [{ name: opt.name, position: 1, values: [{ name: opt.value }] }],
    variants: [{ optionValues: [{ optionName: opt.name, name: opt.value }], price: money(price), sku: l.sku, inventoryPolicy: "CONTINUE", taxable: true,
      inventoryItem: { requiresShipping: true, tracked: false, measurement: { weight: { value: l.shipping.weight_g, unit: "GRAMS" } } } }],
    files: l.images.map((u, i) => ({ originalSource: u, contentType: "IMAGE", alt: `${l.title} mockup ${i + 1}` })),
    metafields: [
      mf("retail_prices", "json", l.prices),
      mf("shipping_fee", "json", l.shipping.fee),
      mf("processing_days", "number_integer", String(l.shipping.processing_days)),
      mf("ship_from", "single_line_text_field", l.shipping.ship_from),
      mf("shipping_zones", "json", l.shipping.zones),
      mf("shipping_profile", "single_line_text_field", l.shipping.profile),
      mf("base_product", "single_line_text_field", l.product.id + (l.material ? `:${l.material.id}` : "")),
      ...(l.material ? [mf("material", "single_line_text_field", `${l.material.id} · ${matName}`)] : [])
    ]
  };
}

const PRODUCT_SET = `mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
  productSet(input: $input, synchronous: $synchronous) { product { id handle legacyResourceId variants(first: 5) { nodes { id sku } } } userErrors { field message code } } }`;
const PRICE_LISTS = `query { priceLists(first: 50) { nodes { id currency name } } }`;
const FIXED_PRICES = `mutation priceListFixedPricesAdd($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
  priceListFixedPricesAdd(priceListId: $priceListId, prices: $prices) { prices { variant { id } } userErrors { field message code } } }`;

export const adminProductUrl = (shop, legacyId) => `https://admin.shopify.com/store/${shop.replace(/\.myshopify\.com$/, "")}/products/${legacyId}`;

/** Create the product, then best-effort pin EUR/CHF/USD on matching Markets price lists. */
export async function publishListing(shop, listing) {
  const s = shopify.normalizeShop(shop); if (!s) throw err(400, "invalid_shop_domain", "Invalid shop domain");
  const row = await repo.getShop(s);
  if (!row?.access_token_enc || row.uninstalled_at) throw err(409, "shop_not_connected", "Connect your Shopify store first");
  const currency = (await shopify.refreshShopCurrency(s).catch(() => null)) || row.currency_code || "CHF";
  const input = buildSellerProductInput(listing, { shopCurrency: currency });
  const d = await shopify.graphql(s, PRODUCT_SET, { input, synchronous: true });
  const ue = d?.productSet?.userErrors || [];
  if (ue.length) throw err(422, "shopify_user_errors", ue.map(e => `${(e.field || []).join(".")}: ${e.message}`).join("; "));
  const p = d.productSet.product, variantId = p.variants?.nodes?.[0]?.id;
  const warnings = [], synced = [currency.toUpperCase()], missing = [];
  if (!isPublicBase(mediaBase())) warnings.push("Images are served from a non-public URL; Shopify cannot fetch them. Set APP_URL to the public https domain.");
  try {
    const lists = (await shopify.graphql(s, PRICE_LISTS))?.priceLists?.nodes || [];
    for (const c of CURRENCIES.filter(c => c !== currency.toUpperCase())) {
      const pl = lists.find(x => x.currency === c);
      if (!pl) { missing.push(c); continue; }
      const r = await shopify.graphql(s, FIXED_PRICES, { priceListId: pl.id, prices: [{ variantId, price: { amount: money(listing.prices[c]), currencyCode: c } }] });
      const e = r?.priceListFixedPricesAdd?.userErrors || [];
      if (e.length) warnings.push(`${c} price list: ${e.map(x => x.message).join("; ")}`); else synced.push(c);
    }
  } catch (e) { missing.splice(0, missing.length, ...CURRENCIES.filter(c => !synced.includes(c))); console.warn("[seller] price lists:", e.message); }
  const markets_note = missing.length ? `${missing.join("/")} prices saved as product data; add ${missing.length > 1 ? "these markets" : "this market"} in Shopify to make them live prices.` : null;
  await repo.saveProductLink({ shop: s, localProductId: `seller:${listing.sku}`, shopifyProductId: p.id, variantIds: variantId ? { [listing.sku]: variantId } : {} }).catch(() => {});
  return { shop: s, shopify_product_id: p.id, handle: p.handle, admin_url: p.legacyResourceId ? adminProductUrl(s, p.legacyResourceId) : null, shop_currency: currency, prices_synced: synced, markets_note, material: listing.material?.id || null, sku: listing.sku, status: listing.status, images: listing.images.length, warnings };
}
