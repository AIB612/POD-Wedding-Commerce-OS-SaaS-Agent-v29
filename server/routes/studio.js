// Public POD Studio API. Saving / quote requests are rate-limited; prices are computed server-side.
import express from "express";
import { ah, rateLimit } from "../http/middleware.js";
import { studioCatalog, saveProject, getProject, requestQuote, projectDesign, purgeExpired, saveMockup, readMockup, projectAccess, setStudioDir } from "../services/studio-service.js";
import { verifyOrderToken } from "../services/checkout-service.js";
import { findWhere } from "../saas-store.js";
import { requestConnection, getConnection, wooCallback } from "../services/studio-connections.js";
import { isAdminRequest, requireOwner } from "../auth.js";
import { baseUrl } from "../config.js";
import * as shopify from "../shopify/app.js";

export function studioRouter({ generatedDir }) {
  const r = express.Router();
  setStudioDir(generatedDir);
  const writeLimit = rateLimit({ bucket: "studio-write", windowMs: 60 * 60_000, max: Number(process.env.STUDIO_SAVES_PER_HOUR || 30) });
  r.get("/api/studio/catalog", (req, res) => { res.setHeader("Cache-Control", "no-cache"); res.json(studioCatalog()); });
  r.post("/api/studio/quote", rateLimit({ bucket: "studio-quote", windowMs: 60_000, max: 120 }), (req, res) => res.json(StudioPricing.quote(studioCatalog(), { ...(req.body || {}), list: req.body?.buyer_type === "merchant" ? false : undefined })));
  r.post("/api/studio/projects", writeLimit, requireOwner({ issue: true }), express.json({ limit: "12mb" }), ah(async (req, res) => {
    const p = await saveProject({ tenantId: req.tenantId, userId: req.user?.id || null, guestId: req.user ? null : req.guestId, body: req.body || {}, generatedDir });
    res.json({ id: p.id, link: `/studio.html?project=${p.id}`, quote: p.quote, design_url: p.design_url });
  }));
  r.get("/api/studio/projects/:id", requireOwner(), ah(async (req, res) => res.json(await getProject(req.params.id, { tenantId: req.tenantId, userId: req.user?.id || null, guestId: req.guestId }))));
  r.get("/api/studio/projects/:id/design", requireOwner(), ah(async (req, res) => {
    const d = await projectDesign({ id: req.params.id, generatedDir, tenantId: req.tenantId, userId: req.user?.id || null, guestId: req.guestId });
    res.setHeader("Content-Type", d.mime); res.setHeader("Cache-Control", "private, no-store"); res.send(d.data);
  }));
  // Mockup thumbnails (one per product, rendered in the browser) live server-side next to the design.
  r.put("/api/studio/projects/:id/mockup/:pid", writeLimit, requireOwner(), express.json({ limit: "700kb" }), ah(async (req, res) => {
    res.json(await saveMockup({ id: req.params.id, pid: req.params.pid, dataUrl: req.body?.data_url, generatedDir, tenantId: req.tenantId, userId: req.user?.id || null, guestId: req.guestId }));
  }));
  // Owner session, or a signed order token (?ot=) for an order that uses this project (confirmation page).
  r.get("/api/studio/projects/:id/mockup/:pid", ah(async (req, res) => {
    const id = req.params.id, ot = String(req.query.ot || "");
    let ok = false;
    if (ot) ok = !!(await findWhere("orders", o => (o.items || []).some(l => l.studio_project_id === id) && verifyOrderToken(o.id, ot)));
    if (!ok) { if (!req.user && !req.guestId) return res.status(401).json({ error: "auth_required" }); await projectAccess(id, { tenantId: req.tenantId, userId: req.user?.id || null, guestId: req.guestId }); }
    const m = await readMockup({ id, pid: req.params.pid, generatedDir });
    res.setHeader("Content-Type", m.mime); res.setHeader("Cache-Control", "private, max-age=300"); res.send(m.data);
  }));
  r.post("/api/studio/projects/:id/request-quote", writeLimit, requireOwner(), ah(async (req, res) => res.json(await requestQuote({ id: req.params.id, contact: req.body?.contact, user: req.user || null, guestId: req.guestId, tenantId: req.tenantId }))));
  // Store connections (merchant). Official OAuth / wc-auth only when STUDIO_PUBLIC_CONNECT=true or for admins.
  const connLimit = rateLimit({ bucket: "studio-connect", windowMs: 60 * 60_000, max: 20 });
  r.post("/api/studio/connections", connLimit, ah(async (req, res) => {
    const allowOAuth = process.env.STUDIO_PUBLIC_CONNECT === "true" || isAdminRequest(req) || (shopify.isConfigured() && process.env.NODE_ENV !== "test");
    res.json(await requestConnection({ tenantId: req.tenantId, platform: req.body?.platform, store: req.body?.store, baseUrl: baseUrl(), allowOAuth }));
  }));
  r.get("/api/studio/connections/:id", ah(async (req, res) => res.json(await getConnection(req.params.id))));
  r.post("/api/studio/connections/woocommerce/callback", connLimit, ah(async (req, res) => res.json(await wooCallback(req.body || {}))));
  // Automatic deletion: at start-up and every 6 hours.
  purgeExpired({ generatedDir }).catch(e => console.error("[studio] purge failed:", e.message));
  setInterval(() => purgeExpired({ generatedDir }).catch(e => console.error("[studio] purge failed:", e.message)), 6 * 3600_000).unref();
  return r;
}
