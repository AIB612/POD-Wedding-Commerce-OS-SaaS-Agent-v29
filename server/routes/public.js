// Public (unauthenticated) routes: pages, storefront, checkout, proofs, invitations, discovery.
import express from "express";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import crypto from "node:crypto";
import { ah, rateLimit } from "../http/middleware.js";
import { isAdminRequest } from "../auth.js";
import { baseUrl } from "../config.js";
import { runAgent } from "../orchestrator.js";
import { catalogOverview } from "../services/catalog-service.js";
import { addRecord, listForTenant } from "../saas-store.js";
import { protocolRegistry, ucpProfile, a2aAgentCard, acpFeed } from "../protocols/commerce-protocols.js";
import { createStorefrontCheckout, handlePayPalReturn, publicOrderStatus, quoteStorefront } from "../services/checkout-service.js";
import { publicProof, approvePublicProof, requestPublicProofChanges } from "../services/proof-service.js";
import { createPayPalOrder, capturePayPalOrder } from "../connectors/paypal.js";
import { submitRsvp } from "../services/rsvp-service.js";
import cors from "cors";

const VERSION = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

export function publicRouter({ root, generatedDir }) {
  const router = express.Router();
  const pages = { "/": "index.html", "/index.html": "index.html", "/admin": "admin.html", "/admin.html": "admin.html", "/payment-success.html": "payment-success.html", "/proof.html": "proof.html", "/account.html": "account.html" };
  const noStore = { headers: { "Cache-Control": "no-cache" } };
  for (const [route, file] of Object.entries(pages)) router.get(route, (_, res) => res.sendFile(path.join(root, file), noStore));

  // Shared front-end assets (explicit allowlist — server code and .env are never exposed).
  router.get("/i18n.js", (_, res) => res.sendFile(path.join(root, "i18n.js"), { maxAge: "1h" }));
  // POD Studio page + its scripts (explicit allowlist, like the other pages)
  router.get("/studio.html", (_, res) => res.sendFile(path.join(root, "studio.html"), noStore));
  for (const f of ["studio.js", "studio-data.js", "studio-pricing.js", "studio-mockups.js", "account-auth.js"]) router.get("/" + f, (_, res) => res.sendFile(path.join(root, f), { maxAge: "5m" }));
  router.use("/assets", express.static(path.join(root, "assets"), { maxAge: "7d", fallthrough: false }));
  // Self-hosted OFL webfonts for generated wedding sites (sandboxed /generated pages have an opaque origin, so CORS is required).
  router.use("/fonts", (_, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); next(); }, express.static(path.join(root, "fonts"), { maxAge: "30d", fallthrough: false }));
  const adminAppDist = path.join(root, "admin-app", "dist");
  if (fs.existsSync(adminAppDist)) {
    router.use("/admin-app", express.static(adminAppDist, { maxAge: "7d", index: "index.html" }));
    router.get("/admin-app/*", (_, res) => res.sendFile(path.join(adminAppDist, "index.html"), noStore));
  }

  // Discovery / protocols
  router.get("/.well-known/ucp", (req, res) => process.env.ENABLE_UCP === "false" ? res.sendStatus(404) : res.json(ucpProfile(baseUrl())));
  router.get("/.well-known/agent-card.json", (req, res) => process.env.ENABLE_A2A_AGENT_CARD === "false" ? res.sendStatus(404) : res.json(a2aAgentCard(baseUrl())));
  router.get("/api/protocols", (req, res) => res.json(protocolRegistry()));
  router.get("/api/ai-discovery/acp-feed", ah(async (req, res) => {
    if (process.env.ENABLE_OPENAI_ACP_FEED === "false") return res.sendStatus(404);
    const products = await listForTenant("products", req.tenantId);
    res.json({ generated_at: new Date().toISOString(), products: acpFeed(products) });
  }));
  router.get("/api/storefront/catalog", ah(async (req, res) => {
    // Public catalog: strip supplier / landed cost and margin fields.
    const rows = await catalogOverview(req.tenantId);
    res.json(rows.map(({ supplier_cost, inbound_shipping, duty, packaging, landed_cost, gross_margin, supplier_id, ...p }) => p));
  }));

  // Customer-side agent. Ops intents are only honoured for authenticated admins (see orchestrator.js).
  const chatLimit = rateLimit({ bucket: "agent", windowMs: 60_000, max: 30 });
  router.post("/api/agent/chat", chatLimit, ah(async (req, res) => {
    const message = String(req.body?.message || "").slice(0, 4000);
    try {
      res.json(await runAgent({ message, scene: req.body?.scene, cart: Array.isArray(req.body?.cart) ? req.body.cart.slice(0, 50) : [], tenantId: req.tenantId, isAdmin: isAdminRequest(req) }));
    } catch (e) {
      console.error("[agent] chat failed:", e.message);
      res.status(503).json({ answer: "Agent service unavailable", fallback: true });
    }
  }));

  // Storefront checkout (server-side quote → PayPal)
  const payLimit = rateLimit({ bucket: "checkout", windowMs: 60_000, max: 20 });
  router.post("/api/payments/paypal/create", payLimit, ah(async (req, res) => {
    res.json(await createStorefrontCheckout({ tenantId: req.tenantId, user: req.user || null, body: req.body || {}, baseUrl: baseUrl() }));
  }));
  // Cart / checkout preview: same server-side quote that checkout uses (merchandise + shipping + tax).
  const quoteLimit = rateLimit({ bucket: "shipping-quote", windowMs: 60_000, max: 60 });
  router.post("/api/storefront/shipping/quote", quoteLimit, ah(async (req, res) => {
    const b = req.body || {};
    res.json(await quoteStorefront({ tenantId: req.tenantId, cart: b.cart, currency: b.currency, country: b.country, postal_code: b.postal_code, shipping_method: b.shipping_method }));
  }));
  router.get("/api/payments/paypal/return", payLimit, ah(async (req, res) => {
    const { orderId, status } = await handlePayPalReturn({ orderId: req.query.order, paypalToken: req.query.token });
    res.redirect(`/payment-success.html?order=${encodeURIComponent(orderId || "")}&status=${encodeURIComponent(status)}`);
  }));
  const statusLimit = rateLimit({ bucket: "status", windowMs: 60_000, max: 60 });
  router.get("/api/orders/:id/status", statusLimit, ah(async (req, res) => res.json(await publicOrderStatus(req.params.id))));

  // Legacy low-level PayPal endpoints (kept for compatibility).
  router.post("/api/paypal/orders", payLimit, ah(async (req, res) => {
    try { const { amount, currency, reference_id } = req.body || {}; res.json(await createPayPalOrder({ amount, currency, referenceId: reference_id || crypto.randomUUID() })); }
    catch (e) { res.status(400).json({ error: e.message }); }
  }));
  router.post("/api/paypal/orders/:id/capture", payLimit, ah(async (req, res) => {
    try { res.json(await capturePayPalOrder(req.params.id)); } catch (e) { res.status(400).json({ error: e.message }); }
  }));

  // Customer proof confirmation (token link from the proof e-mail)
  const proofLimit = rateLimit({ bucket: "proof", windowMs: 60_000, max: 30 });
  router.get("/api/proofs/public/:token", proofLimit, ah(async (req, res) => res.json(await publicProof(req.params.token))));
  router.post("/api/proofs/public/:token/approve", proofLimit, ah(async (req, res) => res.json(await approvePublicProof(req.params.token))));
  router.post("/api/proofs/public/:token/request-changes", proofLimit, ah(async (req, res) => res.json(await requestPublicProofChanges(req.params.token, req.body?.note))));

  // Wedding invitation site publishing (larger body limit only for this route)
  const inviteLimit = rateLimit({ bucket: "invitations", windowMs: 60 * 60_000, max: Number(process.env.INVITATION_PUBLISH_PER_HOUR || 20) });
  router.post("/api/invitations", inviteLimit, express.json({ limit: "15mb" }), ah(async (req, res) => {
    const { html, profile } = req.body || {};
    if (typeof html !== "string" || html.length < 100) return res.status(400).json({ error: "invalid_html" });
    try {
      const id = crypto.randomBytes(6).toString("hex"), file = `${id}.html`;
      // Optional share card (PNG rendered by the builder) for og:image / WhatsApp link previews.
      const og = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(typeof req.body?.og_image === "string" ? req.body.og_image : "");
      let ogUrl = "";
      if (og && og[2].length < 2_000_000) { const ogFile = `${id}-card.${og[1] === "png" ? "png" : "jpg"}`; await fsp.writeFile(path.join(generatedDir, ogFile), Buffer.from(og[2], "base64")); ogUrl = `${baseUrl()}/generated/${ogFile}`; }
      // Fill the builder's placeholders so the published page knows its id, API and share image.
      const page = html.replaceAll("__POD_INVITE_ID__", id).replaceAll("__POD_API_BASE__", baseUrl()).replaceAll("__POD_PAGE_URL__", `${baseUrl()}/generated/${file}`).replaceAll("__POD_OG_IMAGE__", ogUrl);
      await fsp.writeFile(path.join(generatedDir, file), page, "utf8");
      const notify = String(profile?.rsvpEmail || "").trim().slice(0, 254);
      const meta = { id, tenant_id: req.tenantId, user_id: req.user?.id || null, created_at: new Date().toISOString(), scene: String(profile?.sceneKey || "").slice(0, 40), names: String(profile?.names || "").slice(0, 200), date: String(profile?.date || "").slice(0, 40), status: "published", url: `/generated/${file}`,
        layout: String(profile?.layout || "classic").slice(0, 20), rsvp_mode: String(profile?.rsvpMode || "").slice(0, 20), rsvp_enabled: profile?.features?.rsvp !== false, notify_email: profile?.rsvpNotify === false ? "" : notify, og_image: ogUrl };
      await fsp.writeFile(path.join(generatedDir, `${id}.json`), JSON.stringify(meta, null, 2));
      await addRecord("invitations", meta);
      res.json({ ok: true, id, url: `/generated/${file}` });
    } catch (e) {
      console.error("[invitations] publish failed:", e.message);
      res.status(500).json({ error: "publish_failed" });
    }
  }));
  // Built-in RSVP, posted by guests from the sandboxed (opaque-origin, "Origin: null") invitation page.
  // The page sends text/plain JSON (a CORS "simple" request, no preflight); responses allow any origin and carry no credentials.
  const rsvpLimit = rateLimit({ bucket: "invitation-rsvp", windowMs: 10 * 60_000, max: Number(process.env.RSVP_PER_10_MIN || 10) });
  const rsvpCors = cors({ origin: "*", methods: ["POST", "OPTIONS"], allowedHeaders: ["Content-Type"], maxAge: 600 });
  router.options("/api/invitations/:id/rsvp", rsvpCors);
  router.post("/api/invitations/:id/rsvp", rsvpCors, rsvpLimit, express.text({ type: "text/plain", limit: "8kb" }), ah(async (req, res) => {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { return res.status(400).json({ error: "invalid_json" }); } }
    res.status(201).json(await submitRsvp(req.params.id, body));
  }));

  // User-generated pages run in a sandboxed (opaque) origin so they cannot read this site's storage or call admin APIs.
  router.use("/generated", (req, res, next) => {
    if (req.path.endsWith(".json") || /(^|\/)\./.test(req.path)) return res.sendStatus(404); // metadata and private (dot) folders are internal
    res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals");
    next();
  }, express.static(generatedDir, { extensions: ["html"], maxAge: "1h", dotfiles: "deny" }));

  router.get("/api/health", (req, res) => res.json({ ok: true, version: VERSION, tenant: req.tenantId, protocols: protocolRegistry().map(x => x.id) }));

  return router;
}
