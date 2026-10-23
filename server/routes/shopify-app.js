// Shopify app routes (Phase 1). Mounted BEFORE express.json() so webhooks see the raw body.
//   GET  /api/shopify/app/install      Shopify app URL (HMAC-signed launch) -> redirect to authorize
//   GET  /api/shopify/app/login        Public merchant login / store connect -> redirect to authorize
//   GET  /api/shopify/app/callback     OAuth callback -> offline token stored encrypted, webhooks registered
//   POST /api/shopify/app/webhooks     every topic incl. GDPR (HMAC on raw body, dedupe on X-Shopify-Webhook-Id)
//   Admin (x-admin-api-key): GET status, POST connect, POST products/:id/push
import crypto from "node:crypto";
import express from "express";
import { ah } from "../http/middleware.js";
import { requireAdmin, requireApproval } from "../auth.js";
import * as shopify from "../shopify/app.js";
import * as repo from "../shopify/repo.js";
import { addRecord, findWhere, updateRecord } from "../saas-store.js";
import { createSession, ensureCustomer } from "../services/account-service.js";
import { markConnected } from "../services/studio-connections.js";
import { baseUrl } from "../config.js";
import fs from "node:fs";

const EMBED_HTML = fs.readFileSync(new URL("../../shopify-embedded.html", import.meta.url), "utf8");
const attr = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function sendEmbedded(res, shop) {
  shopify.setEmbeddedFrameHeaders(res, shop); // overrides the global X-Frame-Options: SAMEORIGIN for this response only
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(EMBED_HTML.replace("__SHOPIFY_API_KEY__", attr(shopify.config().apiKey)));
}
/** Session-token auth for embedded API routes: Authorization: Bearer <App Bridge id token>. Sets req.shopifyShop. */
export function requireSessionToken(req, res, next) {
  const m = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  if (!m) return res.status(401).set("X-Shopify-Retry-Invalid-Session-Request", "1").json({ error: "session_token_required" });
  try { const { shop } = shopify.verifySessionToken(m[1]); req.shopifyShop = shop; req.shopifyIdToken = m[1]; next(); }
  catch (e) { res.status(401).set("X-Shopify-Retry-Invalid-Session-Request", "1").json({ error: e.message }); }
}

const RETURN_COOKIE = "pod_shopify_return";
const safeReturn = v => { const s = String(v || "/"); return /^\/(?![\/\\])[^\s]*$/.test(s) && s.length < 300 ? s : "/"; };
const secureCookie = () => process.env.NODE_ENV === "production" || baseUrl().startsWith("https://") || shopify.config().appUrl.startsWith("https://");
const sessionCookieOpts = () => ({ httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/", maxAge: 30 * 864e5 });
const returnCookieOpts = () => ({ httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/", maxAge: 10 * 60_000 });
function readCookie(req, name) {
  for (const part of String(req.headers?.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return "";
}

const router = express.Router();
const raw = express.raw({ type: () => true, limit: "2mb" });
const json = express.json({ limit: "100kb" });
const tenantOf = req => req.tenantId || req.get("x-tenant-id") || process.env.DEFAULT_TENANT_ID || "tenant_demo";

router.post("/api/shopify/app/webhooks", raw, ah(async (req, res) => {
  const r = await shopify.handleWebhook({ rawBody: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), headers: req.headers });
  res.status(r.status).type("text/plain").send(r.body);
}));

// Shopify admin iframe launch: GET /?embedded=1&host=…&shop=…&hmac=…&id_token=… -> embedded app page.
// Normal storefront visitors (no shop/embedded params) fall through to the public router unchanged.
router.get("/", (req, res, next) => {
  const shop = shopify.embeddedLaunchShop(req.query);
  if (!shop) return next();
  sendEmbedded(res, shop);
});
router.get("/shopify/embedded", (req, res) => {
  const shop = shopify.normalizeShop(req.query.shop);
  if (!shop) return res.status(400).type("text/plain").send("invalid_shop_domain");
  sendEmbedded(res, shop);
});
router.post("/api/shopify/embedded/session", requireSessionToken, ah(async (req, res) => {
  try { res.json(await shopify.ensureOfflineToken(req.shopifyShop, req.shopifyIdToken)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
}));
router.get("/api/shopify/embedded/state", requireSessionToken, ah(async (req, res) => res.json(await shopify.embeddedState(req.shopifyShop))));
router.post("/api/shopify/embedded/products/:id/push", requireSessionToken, ah(async (req, res) => {
  try { res.json(await shopify.pushProduct(req.shopifyShop, req.params.id)); } // shop comes from the verified token, never the body
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
}));

router.post("/api/shopify/embedded/webhooks/retry", requireSessionToken, ah(async (req, res) => {
  try { const results = await shopify.registerWebhooksSafe(req.shopifyShop); res.json({ ok: results.every(r => r.ok), results, status: await shopify.webhookStatus(req.shopifyShop) }); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
}));
router.get("/api/shopify/embedded/webhooks/status", requireSessionToken, ah(async (req, res) => {
  try { res.json(await shopify.webhookStatus(req.shopifyShop)); } catch (e) { res.status(e.status || 502).json({ error: e.message }); }
}));
router.post("/api/shopify/embedded/orders/sync", requireSessionToken, ah(async (req, res) => {
  try { res.json(await shopify.syncRecentOrders(req.shopifyShop, { first: 20 })); }
  catch (e) { res.status(e.status || 502).json({ error: e.message, hint: e.hint || "" }); }
}));
router.post("/api/shopify/app/shops/:shop/orders/sync", requireAdmin, requireApproval, ah(async (req, res) => {
  const shop = shopify.normalizeShop(req.params.shop); if (!shop) return res.status(400).json({ error: "invalid_shop_domain" });
  try { res.json(await shopify.syncRecentOrders(shop, { first: 20 })); } catch (e) { res.status(e.status || 502).json({ error: e.message, hint: e.hint || "" }); }
}));

router.get("/api/shopify/app/public-status", ah(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const shops = (await repo.listShops())
    .filter(s => s.status === "connected" && !s.uninstalled_at)
    .map(s => ({ shop: s.shop, connected: true, status: s.status, currency_code: s.currency_code || null, installed_at: s.installed_at || null }));
  res.json({ configured: shopify.isConfigured(), shops });
}));

router.get("/api/shopify/app/login", ah(async (req, res) => {
  const returnTo = safeReturn(req.query.return_to || "/");
  const connId = String(req.query.conn_id || "");
  const shop = shopify.normalizeShopInput(req.query.shop);
  if (!shop) {
    return req.accepts(["html", "json"]) === "json"
      ? res.status(400).json({ error: "invalid_shop_domain" })
      : res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}login_error=invalid_shop_domain`);
  }
  if (!shopify.isConfigured()) {
    return req.accepts(["html", "json"]) === "json"
      ? res.status(503).json({ error: "not_configured" })
      : res.redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}login_error=not_configured`);
  }
  const { url } = await shopify.beginInstall({ shop, tenantId: tenantOf(req) });
  res.cookie(RETURN_COOKIE, JSON.stringify({ returnTo, connId }), returnCookieOpts());
  res.setHeader("Cache-Control", "no-store");
  res.redirect(url);
}));

router.get("/api/shopify/app/install", ah(async (req, res) => {
  if (!shopify.normalizeShop(req.query.shop)) return res.status(400).type("text/plain").send("invalid_shop_domain");
  if (!shopify.verifyQueryHmac(req.query)) return res.status(401).type("text/plain").send("invalid_hmac");
  const shop = shopify.normalizeShop(req.query.shop);
  const existing = await repo.getShop(shop);
  if (existing?.access_token_enc && !existing.uninstalled_at && !req.query.reinstall) return res.redirect(`/admin#shopify`);
  const { url } = await shopify.beginInstall({ shop, tenantId: process.env.DEFAULT_TENANT_ID || "tenant_demo" });
  res.redirect(url);
}));

router.get("/api/shopify/app/callback", ah(async (req, res) => {
  const rawRet = readCookie(req, RETURN_COOKIE);
  let ret = null;
  if (rawRet) {
    try { ret = JSON.parse(rawRet); } catch {}
    const { maxAge, ...clearOpts } = returnCookieOpts();
    res.clearCookie(RETURN_COOKIE, clearOpts);
  }
  try {
    const r = await shopify.completeInstall(req.query);
    try {
      const { data } = await shopify.graphqlRaw(r.shop, "{ shop { name email myshopifyDomain } }");
      const rawEmail = String(data?.shop?.email || "").trim().toLowerCase();
      const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawEmail) ? rawEmail : `${r.shop.replace(/\.myshopify\.com$/, "")}@shopify-merchant.local`;
      const name = String(data?.shop?.name || r.shop).slice(0, 120);
      const tenantId = r.tenant_id || "tenant_demo";
      const ts = new Date().toISOString();
      let u = await findWhere("customer_accounts", x => x.tenant_id === tenantId && (x.identities?.shopify?.sub === r.shop || x.email === email));
      const identities = { ...(u?.identities || {}), shopify: { sub: r.shop, email, linked_at: u?.identities?.shopify?.linked_at || ts } };
      if (u && u.status !== "disabled") {
        u = await updateRecord("customer_accounts", u.id, { identities, last_login_at: ts, updated_at: ts, name: u.name || name });
      } else if (!u) {
        u = await addRecord("customer_accounts", { id: `usr_${crypto.randomBytes(8).toString("hex")}`, tenant_id: tenantId, email, name, role: "merchant", status: "active", created_at: ts, updated_at: ts, last_login_at: ts, signup_method: "shopify", identities });
      }
      if (u && u.status !== "disabled") {
        await ensureCustomer(tenantId, u);
        const { token } = await createSession(tenantId, u.id);
        res.cookie("pod_session", token, sessionCookieOpts());
      }
    } catch (err) {
      console.warn("[shopify] session creation on callback skipped:", err.message);
    }
    if (ret?.connId) await markConnected(ret.connId, r.shop).catch(() => {});
    if (ret?.returnTo) {
      const to = safeReturn(ret.returnTo);
      const sep = to.includes("?") ? "&" : "?";
      return res.redirect(`${to}${sep}signed_in=shopify&shop_connected=${encodeURIComponent(r.shop)}`);
    }
    res.redirect(`/admin?shop_connected=${encodeURIComponent(r.shop)}#shopify`);
  } catch (e) { res.status(e.status || 400).type("text/plain").send(`Shopify install failed: ${e.message}`); }
}));

router.get("/api/shopify/app/status", requireAdmin, ah(async (req, res) => {
  const c = shopify.config();
  res.json({
    configured: shopify.isConfigured(), api_version: c.apiVersion, scopes: c.scopes, app_url: c.appUrl || null,
    redirect_uri: c.appUrl ? shopify.redirectUri() : null, webhook_uri: c.appUrl ? shopify.webhookUri() : null,
    shops: await repo.listShops(), product_links: await repo.listProductLinks(), products: shopify.catalogProducts(),
    webhooks: await repo.recentWebhooks(Math.min(Number(req.query.limit) || 25, 200))
  });
}));
router.post("/api/shopify/app/connect", json, requireAdmin, ah(async (req, res) => {
  try { const r = await shopify.beginInstall({ shop: shopify.normalizeShopInput(req.body?.shop) || req.body?.shop, tenantId: tenantOf(req) }); res.json({ shop: r.shop, url: r.url }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
}));
router.post("/api/shopify/app/products/:id/push", json, requireAdmin, requireApproval, ah(async (req, res) => {
  try { res.json(await shopify.pushProduct(req.body?.shop, req.params.id)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
}));

export default router;
