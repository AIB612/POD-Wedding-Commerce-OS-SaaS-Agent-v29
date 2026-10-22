// Shopify app routes (Phase 1). Mounted BEFORE express.json() so webhooks see the raw body.
//   GET  /api/shopify/app/install      Shopify app URL (HMAC-signed launch) -> redirect to authorize
//   GET  /api/shopify/app/callback     OAuth callback -> offline token stored encrypted, webhooks registered
//   POST /api/shopify/app/webhooks     every topic incl. GDPR (HMAC on raw body, dedupe on X-Shopify-Webhook-Id)
//   Admin (x-admin-api-key): GET status, POST connect, POST products/:id/push
import express from "express";
import { ah } from "../http/middleware.js";
import { requireAdmin, requireApproval } from "../auth.js";
import * as shopify from "../shopify/app.js";
import * as repo from "../shopify/repo.js";

const router = express.Router();
const raw = express.raw({ type: () => true, limit: "2mb" });
const json = express.json({ limit: "100kb" });
const tenantOf = req => req.tenantId || req.get("x-tenant-id") || process.env.DEFAULT_TENANT_ID || "tenant_demo";

router.post("/api/shopify/app/webhooks", raw, ah(async (req, res) => {
  const r = await shopify.handleWebhook({ rawBody: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), headers: req.headers });
  res.status(r.status).type("text/plain").send(r.body);
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
  try {
    const r = await shopify.completeInstall(req.query);
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
  try { const r = await shopify.beginInstall({ shop: req.body?.shop, tenantId: tenantOf(req) }); res.json({ shop: r.shop, url: r.url }); }
  catch (e) { res.status(e.status || 400).json({ error: e.message }); }
}));
router.post("/api/shopify/app/products/:id/push", json, requireAdmin, requireApproval, ah(async (req, res) => {
  try { res.json(await shopify.pushProduct(req.body?.shop, req.params.id)); }
  catch (e) { res.status(e.status || 502).json({ error: e.message }); }
}));

export default router;
