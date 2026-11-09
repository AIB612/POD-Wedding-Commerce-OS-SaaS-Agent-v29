// Shopify "Pod.AI" app (standalone, App Store candidate) — core: config, per-shop install rows, request verification,
// Admin GraphQL. Separate Partner app from "POD Wedding Studio": own credentials (AGENT_SHOPIFY_API_KEY / AGENT_SHOPIFY_API_SECRET).
// Isolation: every shop is its own tenant `shopagent_<shop>.myshopify.com`. The tenant is derived ONLY from
//   - an App Bridge session token signed with the agent app secret (embedded admin), or
//   - a Shopify App Proxy signature (storefront chat), or
//   - a webhook HMAC (X-Shopify-Shop-Domain).
// Never from x-tenant-id / tenant_id (auth.js ignores those for the shopagent_ prefix).
import crypto from "node:crypto";
import { addRecord, findRecord, updateRecord } from "../saas-store.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import "./security/records.js"; // podai_* rows are AES-256-GCM encrypted in the persist file

export const SCOPES = "read_products,read_orders,read_shipping,read_discounts,read_legal_policies";
export const TENANT_PREFIX = "shopagent_";
export const config = () => ({
  apiKey: process.env.AGENT_SHOPIFY_API_KEY || "",
  apiSecret: process.env.AGENT_SHOPIFY_API_SECRET || "",
  appUrl: String(process.env.AGENT_APP_URL || process.env.SHOPIFY_APP_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
  apiVersion: process.env.AGENT_SHOPIFY_API_VERSION || "2026-10"
});
export const isConfigured = () => { const c = config(); return !!(c.apiKey && c.apiSecret); };
export const tenantFor = shop => `${TENANT_PREFIX}${normalizeShop(shop)}`;

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---- Shopify request helpers (Pod.AI-only copies; the site's server/shopify/app.js is not used) ----
export function normalizeShop(shop = "") { const s = String(shop || "").trim().toLowerCase(); return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s) ? s : null; }
function verifyWebhookHmac(rawBody, header, secret) {
  if (!secret || !header || !Buffer.isBuffer(rawBody)) return false;
  return safeEq(crypto.createHmac("sha256", secret).update(rawBody).digest("base64"), header);
}
function verifyJwt(token, { secret, apiKey, now = Date.now(), leewaySec = 10 } = {}) {
  const fail = m => { throw Object.assign(new Error(`invalid_session_token:${m}`), { status: 401 }); };
  if (!secret || !apiKey) fail("app_not_configured");
  const parts = String(token || "").split(".");
  if (parts.length !== 3) fail("format");
  let header, payload;
  try { header = JSON.parse(Buffer.from(parts[0], "base64url")); payload = JSON.parse(Buffer.from(parts[1], "base64url")); } catch { fail("decode"); }
  if (header.alg !== "HS256") fail("alg");
  if (!safeEq(crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("base64url"), parts[2])) fail("signature");
  const t = Math.floor(now / 1000);
  if (typeof payload.exp !== "number" || payload.exp + leewaySec < t) fail("expired");
  if (typeof payload.nbf === "number" && payload.nbf - leewaySec > t) fail("not_yet_valid");
  if (!(Array.isArray(payload.aud) ? payload.aud : [payload.aud]).includes(apiKey)) fail("aud");
  const shop = normalizeShop(String(payload.dest || "").replace(/^https:\/\//, ""));
  if (!shop || !/^https:\/\//.test(String(payload.dest))) fail("dest");
  const iss = String(payload.iss || "");
  if (iss && normalizeShop(iss.replace(/^https:\/\//, "").replace(/\/admin\/?$/, "")) !== shop) fail("iss");
  return { shop, payload };
}
/** Test / local simulation: a session token like App Bridge issues it. */
export function signJwt({ shop, apiKey, secret, ttlSec = 60, now = Date.now(), sub = "1" }) {
  const b = x => Buffer.from(JSON.stringify(x)).toString("base64url"), t = Math.floor(now / 1000);
  const h = b({ alg: "HS256", typ: "JWT" }), p = b({ iss: `https://${shop}/admin`, dest: `https://${shop}`, aud: apiKey, sub, exp: t + ttlSec, nbf: t - 1, iat: t - 1, jti: crypto.randomUUID() });
  return `${h}.${p}.${crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
}
/** Allow framing by this shop's admin only. */
export function setEmbeddedFrameHeaders(res, shop) {
  const s = normalizeShop(shop); if (!s) throw new Error("invalid_shop_domain");
  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Security-Policy", `frame-ancestors https://${s} https://admin.shopify.com;`);
}

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
const COL = "podai_shops";
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
