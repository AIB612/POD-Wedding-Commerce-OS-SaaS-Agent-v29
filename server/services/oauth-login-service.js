// Passwordless quick login: "Continue with Google" (OIDC auth-code flow) and "Continue with Shop"
// (Shopify Customer Account API, OAuth 2.0 + PKCE). Every provider is env-driven and reports
// { configured:false } instead of throwing when its keys are missing.
import crypto from "node:crypto";
import { addRecord, findWhere, updateRecord } from "../saas-store.js";
import { HttpError } from "../http/middleware.js";
import { createSession, ensureCustomer } from "./account-service.js";
import { baseUrl } from "../config.js";

const env = k => String(process.env[k] || "").trim();
const b64u = b => Buffer.from(b).toString("base64url");
const rnd = (n = 32) => crypto.randomBytes(n).toString("base64url");
const now = () => new Date().toISOString();
export const STATE_COOKIE = "pod_oauth";
const STATE_TTL_MS = 10 * 60_000;

let devSecret = null;
/** Secret for signing the short-lived OAuth state cookie. Production requires SESSION_SECRET. */
export function sessionSecret() {
  const s = env("SESSION_SECRET");
  if (s && s.length >= 32 && !/change.?me/i.test(s)) return s;
  if (process.env.NODE_ENV === "production") return null;
  return (devSecret ||= rnd(32));
}

const shopDomain = () => env("SHOPIFY_SHOP_DOMAIN").replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
export function providerStatus() {
  const secret = !!sessionSecret();
  return {
    google: { configured: secret && !!env("GOOGLE_CLIENT_ID") && !!env("GOOGLE_CLIENT_SECRET") },
    shop: { configured: secret && !!shopDomain() && !!env("SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID") },
  };
}
export const redirectUri = p => (p === "google" ? env("GOOGLE_REDIRECT_URI") : env("SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI")) || `${baseUrl()}/api/auth/${p}/callback`;

// ---------- signed state cookie (state + nonce + PKCE verifier + return path) ----------
const sign = (data, secret) => crypto.createHmac("sha256", secret).update(data).digest("base64url");
export function sealState(obj) {
  const secret = sessionSecret(); if (!secret) throw new HttpError(503, "not_configured");
  const data = b64u(JSON.stringify(obj)); return `${data}.${sign(data, secret)}`;
}
export function openState(raw) {
  const secret = sessionSecret(); if (!secret || !raw) return null;
  const [data, mac] = String(raw).split(".");
  if (!data || !mac) return null;
  const a = Buffer.from(mac), b = Buffer.from(sign(data, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const o = JSON.parse(Buffer.from(data, "base64url").toString("utf8")); return o && o.exp > Date.now() ? o : null; } catch { return null; }
}
export const safeReturn = v => { const s = String(v || "/"); return /^\/(?![\/\\])[^\s]*$/.test(s) && s.length < 300 ? s : "/"; };
const safeEq = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };

// ---------- discovery / JWKS (cached) ----------
const cache = new Map();
async function getJson(url, ttl = 3600_000) {
  const c = cache.get(url); if (c && c.exp > Date.now()) return c.v;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new HttpError(502, "provider_unavailable");
  const v = await r.json(); cache.set(url, { v, exp: Date.now() + ttl }); return v;
}
const GOOGLE = { authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth", token_endpoint: "https://oauth2.googleapis.com/token", jwks_uri: "https://www.googleapis.com/oauth2/v3/certs", issuers: ["https://accounts.google.com", "accounts.google.com"] };
async function shopConfig() {
  const d = await getJson(`https://${shopDomain()}/.well-known/openid-configuration`);
  return { ...d, issuers: [d.issuer] };
}

/** Verify an RS256/ES256 JWT against a JWKS and the standard OIDC claims. */
export async function verifyJwt(token, { jwksUri, issuers, audience, nonce }) {
  const [h, p, s] = String(token || "").split(".");
  if (!h || !p || !s) throw new HttpError(401, "invalid_id_token");
  const header = JSON.parse(Buffer.from(h, "base64url")), claims = JSON.parse(Buffer.from(p, "base64url"));
  const algs = { RS256: "RSA-SHA256", ES256: "SHA256" };
  if (!algs[header.alg]) throw new HttpError(401, "invalid_id_token");
  const jwks = await getJson(jwksUri);
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, "invalid_id_token");
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify(algs[header.alg], Buffer.from(`${h}.${p}`), header.alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key, Buffer.from(s, "base64url"));
  if (!ok) throw new HttpError(401, "invalid_id_token");
  checkClaims(claims, { issuers, audience, nonce });
  return claims;
}
export function checkClaims(c, { issuers, audience, nonce }) {
  const t = Date.now() / 1000;
  if (!issuers.includes(c.iss)) throw new HttpError(401, "invalid_issuer");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(audience)) throw new HttpError(401, "invalid_audience");
  if (!(c.exp > t - 60)) throw new HttpError(401, "id_token_expired");
  if (!safeEq(c.nonce, nonce)) throw new HttpError(401, "invalid_nonce");
}

// Network-touching steps are swappable so tests can mock them (nothing leaves the process).
export const hooks = {
  async exchangeCode(provider, { code, verifier }) {
    const isG = provider === "google", cfg = isG ? GOOGLE : await shopConfig();
    const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(provider), code_verifier: verifier });
    const headers = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
    const id = isG ? env("GOOGLE_CLIENT_ID") : env("SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID");
    const secret = isG ? env("GOOGLE_CLIENT_SECRET") : env("SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET");
    if (isG) { body.set("client_id", id); body.set("client_secret", secret); }
    else { body.set("client_id", id); if (secret) headers.Authorization = "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"); }
    const r = await fetch(cfg.token_endpoint, { method: "POST", headers, body });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.id_token) throw new HttpError(401, "token_exchange_failed");
    return d;
  },
  async verifyIdToken(provider, idToken, { nonce }) {
    const isG = provider === "google", cfg = isG ? GOOGLE : await shopConfig();
    return verifyJwt(idToken, { jwksUri: cfg.jwks_uri, issuers: cfg.issuers, audience: isG ? env("GOOGLE_CLIENT_ID") : env("SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID"), nonce });
  },
  /** Shop: read name + default address from the Customer Account API (best effort). */
  async fetchShopProfile(accessToken) {
    const d = await getJson(`https://${shopDomain()}/.well-known/customer-account-api`);
    const q = `{ customer { firstName lastName emailAddress { emailAddress } defaultAddress { firstName lastName address1 address2 city zip territoryCode phoneNumber } } }`;
    const r = await fetch(d.graphql_api, { method: "POST", headers: { "Content-Type": "application/json", Authorization: accessToken }, body: JSON.stringify({ query: q }) });
    const j = await r.json().catch(() => ({}));
    return j?.data?.customer || null;
  },
};

/** Build the provider authorization URL and the sealed state cookie value. */
export async function startLogin(provider, { returnTo, locale } = {}) {
  if (!providerStatus()[provider]?.configured) throw new HttpError(503, "not_configured");
  const state = rnd(24), nonce = rnd(24), verifier = rnd(48);
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const isG = provider === "google", cfg = isG ? GOOGLE : await shopConfig();
  const u = new URL(cfg.authorization_endpoint);
  const p = { client_id: isG ? env("GOOGLE_CLIENT_ID") : env("SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID"), response_type: "code", redirect_uri: redirectUri(provider),
    scope: isG ? "openid email profile" : "openid email customer-account-api:full", state, nonce, code_challenge: challenge, code_challenge_method: "S256" };
  if (isG) p.prompt = "select_account"; else if (locale) p.locale = locale;
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  return { url: u.toString(), cookie: sealState({ p: provider, state, nonce, verifier, r: safeReturn(returnTo), exp: Date.now() + STATE_TTL_MS }) };
}

/** Validate state, exchange the code, verify the ID token, then find-or-create the customer account. */
export async function finishLogin(provider, { tenantId, query, cookie }) {
  if (!providerStatus()[provider]?.configured) throw new HttpError(503, "not_configured");
  const st = openState(cookie);
  if (!st || st.p !== provider || !safeEq(st.state, query.state)) throw new HttpError(400, "invalid_state");
  if (query.error) throw new HttpError(400, "access_denied");
  if (!query.code) throw new HttpError(400, "missing_code");
  const tok = await hooks.exchangeCode(provider, { code: String(query.code), verifier: st.verifier });
  const claims = await hooks.verifyIdToken(provider, tok.id_token, { nonce: st.nonce });
  let profile = { sub: String(claims.sub || ""), email: String(claims.email || "").toLowerCase(), name: claims.name || [claims.given_name, claims.family_name].filter(Boolean).join(" "), picture: claims.picture || "", address: null };
  if (provider === "google" && claims.email_verified === false) throw new HttpError(401, "email_not_verified");
  if (provider === "shop" && tok.access_token) {
    try {
      const c = await hooks.fetchShopProfile(tok.access_token);
      if (c) {
        profile.email ||= String(c.emailAddress?.emailAddress || "").toLowerCase();
        profile.name ||= [c.firstName, c.lastName].filter(Boolean).join(" ");
        const a = c.defaultAddress;
        if (a) profile.address = { name: [a.firstName, a.lastName].filter(Boolean).join(" ") || profile.name, address1: a.address1 || "", address2: a.address2 || "", city: a.city || "", postal_code: a.zip || "", country: a.territoryCode || "", phone: a.phoneNumber || "" };
      }
    } catch { /* profile enrichment is optional */ }
  }
  if (!profile.sub || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(profile.email)) throw new HttpError(401, "email_required");
  const user = await upsertAccount(tenantId, provider, profile);
  return { user, returnTo: st.r, ...(await createSession(tenantId, user.id)) };
}

async function upsertAccount(tenantId, provider, pr) {
  const ts = now();
  let u = await findWhere("customer_accounts", x => x.tenant_id === tenantId && x.identities?.[provider]?.sub === pr.sub)
       || await findWhere("customer_accounts", x => x.tenant_id === tenantId && x.email === pr.email);
  if (u?.status === "disabled") throw new HttpError(403, "account_disabled");
  const identities = { ...(u?.identities || {}), [provider]: { sub: pr.sub, email: pr.email, linked_at: u?.identities?.[provider]?.linked_at || ts } };
  const patch = { identities, last_login_at: ts, updated_at: ts, name: u?.name || String(pr.name || "").slice(0, 120), avatar_url: pr.picture || u?.avatar_url || "", ...(pr.address && !u?.shipping_address ? { shipping_address: pr.address } : {}) };
  if (u) u = await updateRecord("customer_accounts", u.id, patch);
  else u = await addRecord("customer_accounts", { id: `usr_${crypto.randomBytes(8).toString("hex")}`, tenant_id: tenantId, email: pr.email, role: "customer", status: "active", created_at: ts, signup_method: provider, ...patch });
  await ensureCustomer(tenantId, u);
  return u;
}

