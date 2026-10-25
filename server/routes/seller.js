// Seller publish routes (merchant role). No checkout / payment involved.
//   POST /api/seller/media           PNG data URL -> public URL (Shopify productSet files)
//   GET  /seller-media/:id.png       public mockup image
//   GET  /api/seller/shopify         which Shopify store this session may publish to
//   POST /api/seller/publish         create the product in that store
import express from "express";
import { ah, rateLimit } from "../http/middleware.js";
import { requireOwner, isAdminRequest } from "../auth.js";
import * as repo from "../shopify/repo.js";
import * as shopify from "../shopify/app.js";
import * as seller from "../shopify/seller.js";

/** A session may publish to a shop it signed in with (Shopify OAuth identity); admins (x-admin-api-key / dev) to any connected shop. */
async function allowedShop(req, wanted) {
  const s = shopify.normalizeShop(wanted || req.user?.identities?.shopify?.sub || "");
  if (!s) return { shop: null, reason: "not_connected" };
  const row = await repo.getShop(s);
  if (!row?.access_token_enc || row.uninstalled_at) return { shop: s, reason: "not_connected" };
  if (req.user?.identities?.shopify?.sub === s || isAdminRequest(req)) return { shop: s, row };
  return { shop: s, reason: "not_owner" };
}

export function sellerRouter({ generatedDir }) {
  const r = express.Router();
  const limit = rateLimit({ bucket: "seller-media", windowMs: 60 * 60_000, max: Number(process.env.SELLER_MEDIA_PER_HOUR || 120) });
  r.post("/api/seller/media", limit, requireOwner({ issue: true }), express.json({ limit: "4.5mb" }), ah(async (req, res) => {
    try { res.json(await seller.saveMedia({ generatedDir, dataUrl: req.body?.data_url, fallbackBase: `${req.protocol}://${req.get("host")}` })); }
    catch (e) { res.status(e.status || 400).json({ error: e.code || "invalid_image", message: e.message }); }
  }));
  r.get("/seller-media/:file", (req, res) => {
    const m = /^([a-f0-9]{24})\.png$/.exec(req.params.file), p = m && seller.mediaPath(generatedDir, m[1]);
    if (!p || !seller.mediaExists(generatedDir, m[1])) return res.sendStatus(404);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); res.type("png").sendFile(p);
  });
  r.get("/api/seller/shopify", ah(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const a = await allowedShop(req, req.query.shop);
    res.json({ configured: shopify.isConfigured(), shop: a.shop, connected: !a.reason, reason: a.reason || null, currency: a.row?.currency_code || null, currencies: seller.CURRENCIES, connect_url: a.shop ? `/api/shopify/app/login?shop=${encodeURIComponent(a.shop)}&return_to=${encodeURIComponent("/studio.html")}` : null });
  }));
  r.post("/api/seller/publish", rateLimit({ bucket: "seller-publish", windowMs: 60 * 60_000, max: 60 }), express.json({ limit: "100kb" }), ah(async (req, res) => {
    const a = await allowedShop(req, req.body?.shop);
    if (a.reason === "not_connected") return res.status(409).json({ error: "shop_not_connected", message: "Connect your Shopify store first.", shop: a.shop });
    if (a.reason === "not_owner") return res.status(403).json({ error: "shop_not_owned", message: "Sign in with this Shopify store to publish to it.", shop: a.shop });
    let listing;
    try { listing = seller.cleanListing(req.body || {}); } catch (e) { return res.status(e.status || 422).json({ error: e.code || "invalid_listing", message: e.message }); }
    try { res.json(await seller.publishListing(a.shop, listing)); }
    catch (e) { res.status(e.status || 502).json({ error: e.code || "shopify_error", message: shopify.explainShopifyError?.(e.message) || e.message }); }
  }));
  return r;
}
