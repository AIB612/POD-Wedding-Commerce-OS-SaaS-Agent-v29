// Pod.AI agent API — public, read-only endpoints per store for external AI agents.
//   GET  /.well-known/pod-ai-agent.json                 discovery (podai host)
//   GET  /agent/v1/openapi.json                         OpenAPI 3.1 of the REST API
//   GET  /agent/v1/stores/:store                        store manifest (tools, MCP + REST URLs)
//   GET  /agent/v1/stores/:store/products?query=&min_price=&max_price=&limit=
//   GET  /agent/v1/stores/:store/products/:id
//   POST /agent/v1/stores/:store/checkout-link          { items:[{ product_id, variant_id?, quantity }], coupon? } → checkout_url
//   POST /agent/v1/stores/:store/mcp                    MCP, Streamable HTTP transport (stateless, JSON responses)
// No auth (public catalogue data only), CORS open without credentials, rate-limited per IP + store and per store.
// Never takes payment: create_checkout_link only returns a link the shopper opens on the store's own checkout.
import express from "express";
import { runTool, TOOLS, ToolError, PROTOCOL_VERSIONS, SERVICE, origin, storeBase } from "./service.js";
import { resolveStore } from "./stores.js";
import { PAYMENT_NOTE } from "./stores.js";

const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const LIMITS = { ip_per_min: Number(process.env.AGENT_API_IP_PER_MIN || 60), store_per_min: Number(process.env.AGENT_API_STORE_PER_MIN || 600), checkout_ip_per_min: Number(process.env.AGENT_API_CHECKOUT_PER_MIN || 20) };
const buckets = new Map();
setInterval(() => { const t = Date.now(); for (const [k, v] of buckets) if (v.reset <= t) buckets.delete(k); }, 60_000).unref();
function hit(key, max) { const t = Date.now(); let e = buckets.get(key); if (!e || e.reset <= t) { e = { n: 0, reset: t + 60_000 }; buckets.set(key, e); } e.n++; return e.n > max ? Math.ceil((e.reset - t) / 1000) : 0; }
/** Per IP + store and per store limits; returns seconds to wait or 0. */
export function limited(req, store, kind = "read") {
  if (process.env.RATE_LIMIT_DISABLED === "true") return 0;
  const s = String(store).toLowerCase();
  return hit(`ip|${req.ip}|${s}`, LIMITS.ip_per_min) || hit(`store|${s}`, LIMITS.store_per_min) || (kind === "checkout" ? hit(`co|${req.ip}|${s}`, LIMITS.checkout_ip_per_min) : 0);
}
export const resetAgentLimits = () => buckets.clear();
const cors = (req, res, next) => {
  res.set({ "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version", "Access-Control-Expose-Headers": "Mcp-Session-Id, Retry-After", "Access-Control-Max-Age": "600", "X-Robots-Tag": "noindex" });
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
};
const sendErr = (res, e) => { const st = e instanceof ToolError ? e.status : e?.status || 500; if (st >= 500 && !(e instanceof ToolError)) console.error("[agent-api]", e?.message);
  res.status(st).json({ error: e?.code || (st >= 500 ? "internal_error" : e?.message || "error"), ...(e?.extra || {}) }); };

export function manifest(store) {
  const base = storeBase(store.key);
  return { schema_version: "1.0", service: SERVICE, store: { key: store.key, name: store.name, url: store.url, platform: store.platform, currency: store.currency },
    mcp: { url: `${base}/mcp`, transport: "streamable-http", protocol_versions: PROTOCOL_VERSIONS, auth: "none" },
    rest: { base, openapi: `${origin()}/agent/v1/openapi.json`, endpoints: { products: `${base}/products`, product: `${base}/products/{product_id}`, checkout_link: `${base}/checkout-link` } },
    tools: TOOLS.map(t => ({ name: t.name, description: t.description })), payment: PAYMENT_NOTE,
    limits: { requests_per_minute_per_ip: LIMITS.ip_per_min, checkout_links_per_minute_per_ip: LIMITS.checkout_ip_per_min },
    docs: `${origin()}/woocommerce#ai-agents` };
}
export function discovery() {
  return { schema_version: "1.0", service: SERVICE, description: "Pod.AI lets AI assistants shop Pod.AI stores (Shopify and WooCommerce): search in-stock products with real prices and create a checkout link. The shopper always pays on the store's own checkout.",
    store_manifest: `${origin()}/agent/v1/stores/{store}`, mcp_url_template: `${origin()}/agent/v1/stores/{store}/mcp`, openapi: `${origin()}/agent/v1/openapi.json`,
    store_key: { woocommerce: "site id (ws_…), published by the store at <store>/.well-known/pod-ai-agent.json", shopify: "<shop>.myshopify.com" },
    auth: "none (public catalogue data, rate-limited)", tools: TOOLS.map(t => t.name), payment: PAYMENT_NOTE, docs: `${origin()}/woocommerce#ai-agents` };
}
export function openapi() {
  const err = { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
  const P = { name: "store", in: "path", required: true, schema: { type: "string" }, description: "Store key: WooCommerce site id (ws_…) or Shopify shop domain (<shop>.myshopify.com)" };
  return { openapi: "3.1.0", info: { title: "Pod.AI store agent API", version: SERVICE.version, description: `Public, read-only shopping API for AI agents. ${PAYMENT_NOTE}` },
    servers: [{ url: `${origin()}/agent/v1` }],
    paths: {
      "/stores/{store}": { get: { operationId: "getStore", summary: "Store manifest", parameters: [P], responses: { 200: { description: "Manifest" }, 404: err } } },
      "/stores/{store}/products": { get: { operationId: "searchProducts", summary: "Search in-stock products", parameters: [P,
        { name: "query", in: "query", schema: { type: "string" } }, { name: "min_price", in: "query", schema: { type: "number" } }, { name: "max_price", in: "query", schema: { type: "number" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 20 } }],
        responses: { 200: { description: "Products", content: { "application/json": { schema: { type: "object", properties: { currency: { type: "string" }, count: { type: "integer" }, products: { type: "array", items: { $ref: "#/components/schemas/Product" } } } } } } }, 404: err, 429: err } } },
      "/stores/{store}/products/{product_id}": { get: { operationId: "getProduct", summary: "One in-stock product", parameters: [P, { name: "product_id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Product", content: { "application/json": { schema: { type: "object", properties: { product: { $ref: "#/components/schemas/Product" } } } } } }, 404: err } } },
      "/stores/{store}/checkout-link": { post: { operationId: "createCheckoutLink", summary: "Prefilled cart / checkout link (shopper pays on the store)", parameters: [P],
        requestBody: { required: true, content: { "application/json": { schema: TOOLS.find(t => t.name === "create_checkout_link").inputSchema } } },
        responses: { 200: { description: "Checkout link", content: { "application/json": { schema: { type: "object", properties: { checkout_url: { type: "string", format: "uri" }, subtotal: { type: "number" }, currency: { type: "string" }, items: { type: "array", items: { type: "object" } } } } } } }, 400: err, 404: err, 422: err, 429: err } } },
      "/stores/{store}/mcp": { post: { operationId: "mcp", summary: "Model Context Protocol endpoint (Streamable HTTP, JSON-RPC 2.0)", parameters: [P], requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } }, responses: { 200: { description: "JSON-RPC response" }, 202: { description: "Notification accepted" } } } }
    },
    components: { schemas: {
      Error: { type: "object", properties: { error: { type: "string" } }, required: ["error"] },
      Product: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, price: { type: "number" }, compare_at_price: { type: "number" }, currency: { type: "string" }, url: { type: "string", format: "uri" }, image: { type: ["string", "null"] }, in_stock: { type: "boolean" },
        categories: { type: "array", items: { type: "string" } }, variants: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, price: { type: "number" }, in_stock: { type: "boolean" } } } }, purchase: { type: "string" } } } } } };
}

// ---- MCP (JSON-RPC 2.0 over Streamable HTTP, stateless) ----
const rpcErr = (id, code, message, data) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });
async function rpc(req, msg, resolved) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcErr(msg?.id, -32600, "Invalid Request");
  const isNote = msg.id === undefined || msg.id === null;
  if (isNote) return null; // notifications/initialized, notifications/cancelled … → nothing to answer
  const ok = result => ({ jsonrpc: "2.0", id: msg.id, result });
  switch (msg.method) {
    case "initialize": {
      const want = msg.params?.protocolVersion;
      return ok({ protocolVersion: PROTOCOL_VERSIONS.includes(want) ? want : PROTOCOL_VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVICE,
        instructions: `Shopping tools for ${resolved.store.name} (${resolved.store.url}, ${resolved.store.currency || "store currency"}). Use search_products, then create_checkout_link and give the shopper the link. ${PAYMENT_NOTE}` });
    }
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOLS });
    case "tools/call": {
      const name = msg.params?.name, args = msg.params?.arguments || {};
      if (!TOOLS.some(t => t.name === name)) return rpcErr(msg.id, -32602, `Unknown tool: ${String(name).slice(0, 60)}`);
      if (limited(req, resolved.store.key, name === "create_checkout_link" ? "checkout" : "read")) return ok({ isError: true, content: [{ type: "text", text: "Rate limit reached — wait a minute and try again." }] });
      try { const result = await runTool(resolved.store.key, name, args, { resolved }); return ok({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result }); }
      catch (e) { if (!(e instanceof ToolError)) { console.error("[agent-api] mcp tool", e?.message); }
        const body = { error: e instanceof ToolError ? e.code : "internal_error", ...(e?.extra || {}) };
        return ok({ isError: true, content: [{ type: "text", text: JSON.stringify(body) }], structuredContent: body }); }
    }
    case "resources/list": return ok({ resources: [] });
    case "prompts/list": return ok({ prompts: [] });
    default: return rpcErr(msg.id, -32601, "Method not found");
  }
}

export function agentApiRouter() {
  const r = express.Router();
  const json = express.json({ limit: "64kb", type: () => true });
  const isPodaiHost = req => /^(www\.)?podai\./i.test(req.hostname || "") || process.env.NODE_ENV !== "production";
  r.get("/.well-known/pod-ai-agent.json", (req, res, next) => isPodaiHost(req) ? (cors(req, res, () => {}), res.set("Cache-Control", "public, max-age=3600").json(discovery())) : next());
  r.use("/agent/v1", cors);
  r.get("/agent/v1", (req, res) => res.json(discovery()));
  r.get("/agent/v1/openapi.json", (req, res) => res.set("Cache-Control", "public, max-age=3600").json(openapi()));
  // store resolution + read limit for every per-store route
  const store = ah(async (req, res, next) => {
    const wait = limited(req, req.params.store, req.path.endsWith("/checkout-link") ? "checkout" : req.path.endsWith("/mcp") ? "mcp" : "read");
    if (wait) { res.set("Retry-After", String(wait)); return res.status(429).json({ error: "rate_limited" }); }
    const resolved = await resolveStore(req.params.store);
    if (resolved.error) return res.status(resolved.status || 404).json({ error: resolved.error });
    req.agentStore = resolved; next();
  });
  r.get("/agent/v1/stores/:store", store, (req, res) => res.set("Cache-Control", "public, max-age=300").json(manifest(req.agentStore.store)));
  r.get("/agent/v1/stores/:store/products", store, ah(async (req, res) => { try { res.set("Cache-Control", "public, max-age=60").json(await runTool(req.params.store, "search_products", req.query, { resolved: req.agentStore })); } catch (e) { sendErr(res, e); } }));
  r.get("/agent/v1/stores/:store/products/:id", store, ah(async (req, res) => { try { res.set("Cache-Control", "public, max-age=60").json(await runTool(req.params.store, "get_product", { product_id: req.params.id }, { resolved: req.agentStore })); } catch (e) { sendErr(res, e); } }));
  r.post("/agent/v1/stores/:store/checkout-link", json, store, ah(async (req, res) => { try { res.set("Cache-Control", "no-store").json(await runTool(req.params.store, "create_checkout_link", req.body || {}, { resolved: req.agentStore })); } catch (e) { sendErr(res, e); } }));
  r.get("/agent/v1/stores/:store/mcp", (req, res) => res.set("Allow", "POST, OPTIONS").status(405).json({ error: "method_not_allowed", hint: "POST JSON-RPC messages (stateless Streamable HTTP; no SSE stream)" }));
  r.delete("/agent/v1/stores/:store/mcp", (req, res) => res.set("Allow", "POST, OPTIONS").status(405).end());
  r.post("/agent/v1/stores/:store/mcp", json, store, ah(async (req, res) => {
    const pv = req.get("mcp-protocol-version");
    if (pv && !PROTOCOL_VERSIONS.includes(pv)) return res.status(400).json(rpcErr(null, -32600, `Unsupported MCP-Protocol-Version: ${pv.slice(0, 20)}`));
    const body = req.body;
    if (Array.isArray(body)) { if (!body.length || body.length > 20) return res.status(400).json(rpcErr(null, -32600, "Invalid Request"));
      const out = (await Promise.all(body.map(m => rpc(req, m, req.agentStore)))).filter(Boolean); return out.length ? res.json(out) : res.status(202).end(); }
    const out = await rpc(req, body, req.agentStore);
    if (!out) return res.status(202).end();
    res.set("Cache-Control", "no-store").json(out);
  }));
  r.use("/agent/v1", (err, req, res, next) => { if (err?.type === "entity.parse.failed") return res.status(400).json(req.path.endsWith("/mcp") ? rpcErr(null, -32700, "Parse error") : { error: "invalid_json" }); if (err?.type === "entity.too.large") return res.status(413).json({ error: "too_large" }); next(err); });
  r.use("/agent/v1", (req, res) => res.status(404).json({ error: "not_found" }));
  return r;
}
