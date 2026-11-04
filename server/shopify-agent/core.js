// Shopify "Wed.AI Chat Agent" app (standalone, App Store candidate) — core: config, per-shop install rows, request verification,
// Admin GraphQL. Separate Partner app from "POD Wedding Studio": own credentials (AGENT_SHOPIFY_API_KEY / AGENT_SHOPIFY_API_SECRET).
// Isolation: every shop is its own tenant `shopagent_<shop>.myshopify.com`. The tenant is derived ONLY from
//   - an App Bridge session token signed with the agent app secret (embedded admin), or
//   - a Shopify App Proxy signature (storefront chat), or
//   - a webhook HMAC (X-Shopify-Shop-Domain).
// Never from x-tenant-id / tenant_id (auth.js ignores those for the shopagent_ prefix).
import crypto from "node:crypto";
import { normalizeShop, verifySessionToken as verifyJwt, signSessionToken as signJwt, verifyWebhookHmac } from "../shopify/app.js";
import { addRecord, findRecord, updateRecord } from "../saas-store.js";
import { encrypt, decrypt } from "../utils/crypto.js";

export const SCOPES = "read_products,read_orders,read_legal_policies";
export const TENANT_PREFIX = "shopagent_";
export const config = () => ({
  apiKey: process.env.AGENT_SHOPIFY_API_KEY || "",
  apiSecret: process.env.AGENT_SHOPIFY_API_SECRET || "",
  appUrl: String(process.env.AGENT_APP_URL || process.env.SHOPIFY_APP_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  apiVersion: process.env.AGENT_SHOPIFY_API_VERSION || "2026-10"
});
export const isConfigured = () => { const c = config(); return !!(c.apiKey && c.apiSecret); };
export const tenantFor = shop => `${TENANT_PREFIX}${normalizeShop(shop)}`;
export { normalizeShop };

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** App Proxy: signature = hex HMAC-SHA256 over sorted `key=value` pairs (arrays joined by ","), no separator. */
export function proxySignature(query, secret = config().apiSecret) {
  const msg = Object.keys(query).filter(k => k !== "signature").sort()
    .map(k => `${k}=${Array.isArray(query[k]) ? query[k].join(",") : query[k]}`).join("");
  return crypto.createHmac("sha256", secret).update(msg).digest("hex");
}
export function verifyProxy(query = {}, { secret = config().apiSecret, now = Date.now(), maxAgeSec = 3600 } = {}) {
  if (!secret) return { ok: false, error: "app_not_configured" };
  const shop = normalizeShop(query.shop);
  if (!shop || !query.signature) return { ok: false, error: "unsigned" };
  if (!safeEq(proxySignature(query, secret), query.signature)) return { ok: false, error: "bad_signature" };
  const ts = Number(query.timestamp);
  if (!ts || Math.abs(now / 1000 - ts) > maxAgeSec) return { ok: false, error: "stale" };
  return { ok: true, shop, customerId: query.logged_in_customer_id || null };
}
export const verifySession = token => verifyJwt(token, { secret: config().apiSecret, apiKey: config().apiKey });
export const signSession = (shop, o = {}) => signJwt({ shop, apiKey: config().apiKey, secret: config().apiSecret, ...o });
export const verifyWebhook = (raw, hmac) => !!config().apiSecret && verifyWebhookHmac(raw, hmac, config().apiSecret);

// ---- install rows (collection agent_app_shops; token encrypted at rest) ----
const COL = "agent_app_shops";
export async function getShop(shop) { return findRecord(COL, normalizeShop(shop)); }
export async function saveToken(shop, accessToken, scopes = "") {
  const id = normalizeShop(shop), prev = await findRecord(COL, id), at = new Date().toISOString();
  const row = { id, shop: id, tenant_id: tenantFor(id), access_token_enc: encrypt(accessToken), scopes, installed_at: prev?.uninstalled_at || !prev ? at : prev.installed_at, uninstalled_at: null, updated_at: at };
  if (prev) await updateRecord(COL, id, row); else await addRecord(COL, row);
  return row;
}
export async function markUninstalled(shop) {
  const id = normalizeShop(shop), prev = await findRecord(COL, id);
  if (prev) await updateRecord(COL, id, { access_token_enc: null, uninstalled_at: new Date().toISOString() });
}
export async function accessToken(shop) {
  const r = await getShop(shop);
  return r?.access_token_enc && !r.uninstalled_at ? decrypt(r.access_token_enc) : null;
}
export const isInstalled = async shop => !!(await accessToken(shop));

/** Token exchange (session token → offline token). Idempotent: skips when a token is stored. */
export async function ensureOfflineToken(shop, idToken, { force = false } = {}) {
  if (!force && await accessToken(shop)) return { exchanged: false };
  const c = config();
  const r = await fetch(`https://${normalizeShop(shop)}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: c.apiKey, client_secret: c.apiSecret, grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", subject_token: idToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token", requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token" }), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Object.assign(new Error(`token_exchange_failed:${r.status}`), { status: 502 });
  const d = await r.json();
  if (!d.access_token) throw Object.assign(new Error("token_missing"), { status: 502 });
  await saveToken(shop, d.access_token, d.scope || "");
  return { exchanged: true, scopes: d.scope || "" };
}

/** Admin GraphQL for an installed shop. Returns data or throws (message includes Shopify's error text, never the token). */
export async function graphql(shop, query, variables = {}) {
  const token = await accessToken(shop);
  if (!token) throw Object.assign(new Error("shop_not_installed"), { status: 404 });
  const r = await fetch(`https://${normalizeShop(shop)}/admin/api/${config().apiVersion}/graphql.json`, { method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(15000) });
  if (r.status === 401) { await markUninstalled(shop); throw new Error("shopify_unauthorized"); }
  if (!r.ok) throw new Error(`shopify_http_${r.status}`);
  const d = await r.json();
  if (d.errors?.length && !d.data) throw new Error(`shopify_graphql:${d.errors.map(e => e.message).join("; ").slice(0, 300)}`);
  return d.data || {};
}
