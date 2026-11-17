// Pod.AI WooCommerce channel — core: site records, HMAC request signing (both directions), safe callbacks to the site.
// Every WooCommerce site is its own tenant `wooagent_<site id>`. The tenant is derived ONLY from a request signed with the
// site's secret (X-PodAI-Site / -Timestamp / -Nonce / -Signature) — never from x-tenant-id or a body field.
// Site rows live in podai_woo_sites (AES-256-GCM encrypted at rest like every podai_* collection; the secret never leaves
// the server except once, in the registration response to the verified site).
// Signature v1: hex HMAC-SHA256(secret, `${ts}\n${METHOD}\n${route}\n${nonce}\n${sha256hex(body)}`), ts = unix seconds (±300 s),
// nonce = 16–64 [A-Za-z0-9] seen once per 10 min. route = logical route ("/woo-agent/v1/chat", "/pod-ai/v1/lookup").
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { addRecord, findRecord, findWhere, updateRecord, removeWhere } from "../saas-store.js";

export const TENANT_PREFIX = "wooagent_";
export const SITES = "podai_woo_sites";
export const tenantFor = siteId => `${TENANT_PREFIX}${siteId}`;
export const validSiteId = id => /^ws_[a-f0-9]{16}$/.test(String(id || ""));
const now = () => new Date().toISOString();
const sha256 = b => crypto.createHash("sha256").update(b || "").digest("hex");
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export function sign(secret, { ts, method, route, nonce, body = "" }) {
  return crypto.createHmac("sha256", secret).update(`${ts}\n${String(method).toUpperCase()}\n${route}\n${nonce}\n${sha256(body)}`).digest("hex");
}
/** Headers for a signed request (used by tests and by the backend → site callbacks). */
export function signedHeaders(siteId, secret, { method = "POST", route, body = "", ts = Math.floor(Date.now() / 1000), nonce = crypto.randomBytes(12).toString("hex") }) {
  return { "X-PodAI-Site": siteId, "X-PodAI-Timestamp": String(ts), "X-PodAI-Nonce": nonce, "X-PodAI-Signature": `v1=${sign(secret, { ts, method, route, nonce, body })}` };
}

const seen = new Map(); // nonce replay cache
function nonceOnce(key) {
  const t = Date.now();
  if (seen.size > 20000) for (const [k, v] of seen) if (t - v > 600e3) seen.delete(k);
  if (seen.has(key) && t - seen.get(key) < 600e3) return false;
  seen.set(key, t); return true;
}
/** Verify a signed site request. Returns { ok, site } or { ok:false, error }. */
export async function verifySigned({ siteId, ts, nonce, signature, method, route, body = Buffer.alloc(0) }, { nowMs = Date.now() } = {}) {
  if (!validSiteId(siteId)) return { ok: false, error: "invalid_site" };
  const t = Number(ts);
  if (!Number.isInteger(t) || Math.abs(nowMs / 1000 - t) > 300) return { ok: false, error: "stale_timestamp" };
  if (!/^[A-Za-z0-9]{16,64}$/.test(String(nonce || ""))) return { ok: false, error: "invalid_nonce" };
  const m = /^v1=([a-f0-9]{64})$/.exec(String(signature || ""));
  if (!m) return { ok: false, error: "invalid_signature" };
  const site = await getSite(siteId);
  if (!site || site.status !== "active" || !site.secret) return { ok: false, error: "unknown_site" };
  if (!safeEq(sign(site.secret, { ts: t, method, route, nonce, body }), m[1])) return { ok: false, error: "invalid_signature" };
  if (!nonceOnce(`${siteId}|${nonce}`)) return { ok: false, error: "replayed" };
  return { ok: true, site };
}

export const getSite = id => validSiteId(id) ? findRecord(SITES, id) : null;
export function normalizeUrl(u) {
  try { const x = new URL(String(u || "").trim()); if (!/^https?:$/.test(x.protocol) || x.username || x.password) return null; x.hash = ""; x.search = ""; return x.toString().replace(/\/+$/, ""); }
  catch { return null; }
}
const allowHttp = () => process.env.WOO_ALLOW_HTTP === "true" || process.env.NODE_ENV === "test";
function privateIp(ip) {
  if (net.isIPv4(ip)) { const [a, b] = ip.split(".").map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  const v = ip.toLowerCase(); return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:") && privateIp(v.slice(7));
}
/** SSRF guard for callbacks: https only (http allowed in tests / local), no private / loopback targets in production. */
export async function safeTarget(url) {
  let u; try { u = new URL(url); } catch { return { ok: false, error: "invalid_url" }; }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && allowHttp())) return { ok: false, error: "https_required" };
  if (allowHttp()) return { ok: true };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map(x => x.address);
  if (!ips.length) return { ok: false, error: "dns_failed" };
  if (ips.some(privateIp)) return { ok: false, error: "private_address" };
  return { ok: true };
}
/** REST endpoint of the site for a route — works for pretty (/wp-json/) and plain (?rest_route=) permalinks. */
export function restEndpoint(restUrl, route, query = {}) {
  const r = String(route).replace(/^\/+/, "");
  const q = new URLSearchParams(query).toString();
  if (/[?&]rest_route=/.test(restUrl)) { const base = String(restUrl).replace(/(rest_route=)\/?.*$/, "$1/"); return `${base}${r}${q ? `&${q}` : ""}`; }
  return `${String(restUrl).replace(/\/?$/, "/")}${r}${q ? `?${q}` : ""}`;
}

/** Signed callback to the WordPress plugin (order lookup, coupon check). Never throws; 8 s timeout. */
export async function callSite(site, route, payload) {
  const url = restEndpoint(site.rest_url, route);
  const tgt = await safeTarget(url); if (!tgt.ok) return { ok: false, error: tgt.error };
  const body = JSON.stringify(payload || {});
  try {
    const r = await fetch(url, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", ...signedHeaders(site.id, site.secret, { route: `/${route.replace(/^\/+/, "")}`, body }) }, body, signal: AbortSignal.timeout(8000) });
    const txt = await r.text(); let d = {}; try { d = JSON.parse(txt); } catch { return { ok: false, error: `site_http_${r.status}` }; }
    if (!d || typeof d !== "object") return { ok: false, error: `site_http_${r.status}` };
    return d;
  } catch (e) { return { ok: false, error: "site_unreachable" }; }
}

/**
 * Registration: the plugin stores a one-time nonce, then calls /woo-agent/v1/register. We fetch
 * <rest_url>/pod-ai/v1/verify?nonce=… from the site itself — only whoever controls the site can answer — and return
 * { site_id, secret } once. Registering the same site again rotates the secret on the same record (tickets kept).
 */
export async function registerSite({ site_url, rest_url, name, admin_email, nonce, currency, locale, versions } = {}) {
  const url = normalizeUrl(site_url), rest = String(rest_url || "").trim();
  if (!url) return { ok: false, status: 400, error: "invalid_site_url" };
  let restU; try { restU = new URL(rest); } catch { return { ok: false, status: 400, error: "invalid_rest_url" }; }
  if (new URL(url).host !== restU.host) return { ok: false, status: 400, error: "rest_url_host_mismatch" };
  if (!/^[A-Za-z0-9]{24,64}$/.test(String(nonce || ""))) return { ok: false, status: 400, error: "invalid_nonce" };
  const vurl = restEndpoint(rest, "pod-ai/v1/verify", { nonce });
  const tgt = await safeTarget(vurl); if (!tgt.ok) return { ok: false, status: 400, error: tgt.error };
  try {
    const r = await fetch(vurl, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d || !safeEq(String(d.nonce || ""), String(nonce))) return { ok: false, status: 403, error: "site_verification_failed" };
  } catch { return { ok: false, status: 502, error: "site_unreachable" }; }
  const secret = crypto.randomBytes(32).toString("hex");
  const base = { url, rest_url: rest, name: String(name || "").slice(0, 120) || new URL(url).host, admin_email: String(admin_email || "").slice(0, 254), currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
    locale: String(locale || "").slice(0, 12), versions: Object.fromEntries(Object.entries(versions || {}).slice(0, 5).map(([k, v]) => [String(k).slice(0, 20), String(v).slice(0, 20)])), secret, status: "active", updated_at: now() };
  const prev = await findWhere(SITES, s => s.url === url);
  if (prev?.length) { const s = prev[0]; await updateRecord(SITES, s.id, { ...base, rotated_at: now() }); return { ok: true, site_id: s.id, secret, rotated: true }; }
  const id = `ws_${crypto.randomBytes(8).toString("hex")}`;
  await addRecord(SITES, { id, tenant_id: tenantFor(id), ...base, plan: "free", created_at: now() });
  return { ok: true, site_id: id, secret, rotated: false };
}
export const updateSite = (id, patch) => updateRecord(SITES, id, { ...patch, updated_at: now() });
export async function removeSite(id) { return (await removeWhere(SITES, s => s.id === id)).length; }
