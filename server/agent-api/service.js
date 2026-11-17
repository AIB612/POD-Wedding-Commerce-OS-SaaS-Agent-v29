// Pod.AI agent API — the four tools, shared by REST, MCP and tests.
import { resolveStore, cleanCheckoutInput, cleanSearchInput, PAYMENT_NOTE } from "./stores.js";
import { recordEvent } from "../shopify-agent/dashboard.js";

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const SERVICE = { name: "pod-ai-store-agent", title: "Pod.AI store agent", version: "1.0.0" };
export const origin = () => String(process.env.PODAI_PUBLIC_URL || "https://podai.swisspro.site").replace(/\/+$/, "");
export const storeBase = key => `${origin()}/agent/v1/stores/${encodeURIComponent(key)}`;

const searchSchema = { type: "object", properties: {
  query: { type: "string", description: "What the shopper wants, in any language (e.g. 'wool scarf', 'gift for dad under 50'). Empty = newest products." },
  min_price: { type: "number", minimum: 0, description: "Minimum price in the store currency" },
  max_price: { type: "number", minimum: 0, description: "Maximum price in the store currency" },
  limit: { type: "integer", minimum: 1, maximum: 20, default: 10 } }, additionalProperties: false };
export const TOOLS = [
  { name: "get_store_info", title: "Store info", description: "Store name, website, currency, shipping zones and policy links. Call first to learn the currency.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: "search_products", title: "Search products", description: "Search the store's in-stock products with real current prices. Returns id, title, price, currency, url, image and purchasable variants.",
    inputSchema: searchSchema, annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: "get_product", title: "Product details", description: "Details of one in-stock product by id (variants with their own ids and prices).",
    inputSchema: { type: "object", properties: { product_id: { type: "string", description: "Product id from search_products" } }, required: ["product_id"], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false } },
  { name: "create_checkout_link", title: "Create checkout link", description: "Build a prefilled cart / checkout link on the store for the shopper to open. The shopper reviews and pays on the store's own checkout — no order is placed and no payment is taken by this tool. Products with several variants need variant_id.",
    inputSchema: { type: "object", properties: {
      items: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", properties: { product_id: { type: "string" }, variant_id: { type: "string", description: "Required when the product has several variants" }, quantity: { type: "integer", minimum: 1, maximum: 99, default: 1 } }, required: ["product_id"], additionalProperties: false } },
      coupon: { type: "string", description: "Optional discount code the shopper has (validated by the store at checkout)" } }, required: ["items"], additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false } }
];

export class ToolError extends Error { constructor(code, status = 400, extra = {}) { super(code); this.code = code; this.status = status; this.extra = extra; } }

/** Run a tool against a store key. Returns a plain JSON result or throws ToolError. */
export async function runTool(storeKey, name, args = {}, { resolved = null } = {}) {
  const r = resolved || await resolveStore(storeKey);
  if (r.error) throw new ToolError(r.error, r.status || 404);
  const s = r.store;
  switch (name) {
    case "get_store_info": return { store: s.key, ...s.info(), agent_api: { mcp: `${storeBase(s.key)}/mcp`, openapi: `${origin()}/agent/v1/openapi.json` }, payment: PAYMENT_NOTE };
    case "search_products": {
      const q = cleanSearchInput(args); if (q.error) throw new ToolError(q.error);
      const products = await s.search(q);
      return { store: s.key, currency: s.currency, query: q.query, count: products.length, products };
    }
    case "get_product": {
      const p = await s.product(String(args.product_id ?? "").replace(/[^0-9]/g, ""));
      if (!p) throw new ToolError("product_not_available", 404);
      return { store: s.key, product: p };
    }
    case "create_checkout_link": {
      const c = cleanCheckoutInput(args); if (c.error) throw new ToolError(c.error);
      const out = await s.checkout(c.items, c.coupon);
      if (!out.ok) throw new ToolError(out.error, 422, { errors: out.errors });
      const subtotal = Math.round(out.lines.reduce((a, l) => a + l.unit_price * l.quantity, 0) * 100) / 100;
      recordEvent(s.tenant, { type: "agent_checkout_link" }).catch(() => {});
      return { store: s.key, checkout_url: out.checkout_url, items: out.lines.map(l => ({ ...l, line_total: Math.round(l.unit_price * l.quantity * 100) / 100 })), subtotal, currency: out.currency,
        coupon: out.coupon, ...(out.errors.length ? { skipped: out.errors } : {}), payment: PAYMENT_NOTE };
    }
    default: throw new ToolError("unknown_tool", 404);
  }
}
