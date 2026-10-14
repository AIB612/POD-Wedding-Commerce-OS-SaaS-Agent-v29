// Server-side quote for the storefront cart. The browser total is display-only;
// the amount sent to PayPal is always recomputed here from data/storefront-pricing.json.
import fs from "node:fs";
import { HttpError } from "../http/middleware.js";

const pricing = JSON.parse(fs.readFileSync(new URL("../data/storefront-pricing.json", import.meta.url), "utf8"));
const MAX_LINES = 50;

export const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function pricingCatalog() { return pricing; }

export function tierFor(qty) {
  return pricing.tiers.find(t => qty >= t.min_qty) || { min_qty: 1, discount: 0 };
}

function resolveMaterial(type, { material_id, material } = {}) {
  const list = pricing.materials[type] || pricing.materials.invite;
  return list.find(m => m.id === material_id) || list.find(m => m.name === material) || list[0];
}

/** Same formula as index.html priceInfo(): (base + material delta, floored at 0) × (1 − tier discount). */
export function quoteLine(raw = {}) {
  const sku = String(raw.sku || "").trim().toUpperCase();
  const product = pricing.products[sku];
  if (!product) throw new HttpError(400, "unknown_sku", `Unknown product: ${sku || "(empty)"}`);
  const quantity = Number(raw.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > pricing.max_quantity_per_line) {
    throw new HttpError(400, "invalid_quantity", `Invalid quantity for ${sku}`);
  }
  const material = resolveMaterial(product.type, raw);
  const tier = tierFor(quantity);
  const unit = Math.max(0, product.price + material.delta) * (1 - tier.discount);
  return {
    sku,
    name: product.name,
    quantity,
    material: material.name,
    material_id: material.id,
    unit_price: round2(unit),
    discount: tier.discount,
    line_total: round2(unit * quantity),
    customization: String(raw.customization || "").slice(0, 2000)
  };
}

export function quoteCart(items, currency = pricing.currency) {
  if (!Array.isArray(items) || items.length === 0) throw new HttpError(400, "empty_cart", "Cart is empty");
  if (items.length > MAX_LINES) throw new HttpError(400, "cart_too_large", `At most ${MAX_LINES} cart lines`);
  if (currency && currency !== pricing.currency) throw new HttpError(400, "unsupported_currency", `Only ${pricing.currency} is supported`);
  const lines = items.map(quoteLine);
  return { currency: pricing.currency, lines, total: round2(lines.reduce((a, l) => a + l.line_total, 0)) };
}
