// Public POD Studio API. Saving / quote requests are rate-limited; prices are computed server-side.
import express from "express";
import { ah, rateLimit } from "../http/middleware.js";
import { studioCatalog, saveProject, getProject, requestQuote, projectDesign, purgeExpired } from "../services/studio-service.js";
import { requestConnection, getConnection, wooCallback } from "../services/studio-connections.js";
import { isAdminRequest, requireUser } from "../auth.js";
import { baseUrl } from "../config.js";

export function studioRouter({ generatedDir }) {
  const r = express.Router();
  const writeLimit = rateLimit({ bucket: "studio-write", windowMs: 60 * 60_000, max: Number(process.env.STUDIO_SAVES_PER_HOUR || 30) });
  r.get("/api/studio/catalog", (req, res) => { res.setHeader("Cache-Control", "public, max-age=300"); res.json(studioCatalog()); });
  r.post("/api/studio/quote", rateLimit({ bucket: "studio-quote", windowMs: 60_000, max: 120 }), (req, res) => res.json(StudioPricing.quote(studioCatalog(), req.body || {})));
  r.post("/api/studio/projects", writeLimit, requireUser, express.json({ limit: "12mb" }), ah(async (req, res) => {
    const p = await saveProject({ tenantId: req.tenantId, userId: req.user.id, body: req.body || {}, generatedDir });
    res.json({ id: p.id, link: `/studio.html?project=${p.id}`, quote: p.quote, design_url: p.design_url });
  }));
  r.get("/api/studio/projects/:id", requireUser, ah(async (req, res) => res.json(await getProject(req.params.id, { tenantId: req.tenantId, userId: req.user.id }))));
  r.get("/api/studio/projects/:id/design", requireUser, ah(async (req, res) => {
    const d = await projectDesign({ id: req.params.id, generatedDir, tenantId: req.tenantId, userId: req.user.id });
    res.setHeader("Content-Type", d.mime); res.setHeader("Cache-Control", "private, no-store"); res.send(d.data);
  }));
  r.post("/api/studio/projects/:id/request-quote", writeLimit, requireUser, ah(async (req, res) => res.json(await requestQuote({ id: req.params.id, contact: req.body?.contact, user: req.user, tenantId: req.tenantId }))));
  // Store connections (merchant). Official OAuth / wc-auth only when STUDIO_PUBLIC_CONNECT=true or for admins.
  const connLimit = rateLimit({ bucket: "studio-connect", windowMs: 60 * 60_000, max: 20 });
  r.post("/api/studio/connections", connLimit, ah(async (req, res) => {
    const allowOAuth = process.env.STUDIO_PUBLIC_CONNECT === "true" || isAdminRequest(req);
    res.json(await requestConnection({ tenantId: req.tenantId, platform: req.body?.platform, store: req.body?.store, baseUrl: baseUrl(), allowOAuth }));
  }));
  r.get("/api/studio/connections/:id", ah(async (req, res) => res.json(await getConnection(req.params.id))));
  r.post("/api/studio/connections/woocommerce/callback", connLimit, ah(async (req, res) => res.json(await wooCallback(req.body || {}))));
  // Automatic deletion: at start-up and every 6 hours.
  purgeExpired({ generatedDir }).catch(e => console.error("[studio] purge failed:", e.message));
  setInterval(() => purgeExpired({ generatedDir }).catch(e => console.error("[studio] purge failed:", e.message)), 6 * 3600_000).unref();
  return r;
}
