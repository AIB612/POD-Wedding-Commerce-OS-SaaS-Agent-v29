// Routes of the Shopify Chat Agent app (mounted before express.json; each route parses its own body).
//   GET  /shopify-agent                    embedded admin (App Bridge; KPIs, knowledge, handoffs, settings)
//   GET|POST /shopify-agent/api/*          admin JSON API — Authorization: Bearer <session token> (shop from the token only)
//   POST /shopify-agent/proxy/chat         storefront chat via App Proxy (/apps/podai/chat), Shopify signature required
//   POST /shopify-agent/webhooks           app/uninstalled + GDPR topics (HMAC on the raw body)
import express from "express";
import fs from "node:fs";
import { ah } from "../http/middleware.js";
import { setEmbeddedFrameHeaders } from "../shopify/app.js";
import * as core from "./core.js";
import * as gdpr from "./gdpr.js";
import { makeProfile, clearFactsCache } from "./profile.js";
import { handleChat } from "../pod-agent/customer/agent.js";
import { agentOverview, agentConversations, agentHandoffs, patchHandoff, getSettings, putAgentSettings, upsertKnowledge, deleteKnowledge } from "../pod-agent/customer/admin.js";
import { listForTenant } from "../saas-store.js";
import { trackingSources } from "../tracking/index.js";

const PAGE = new URL("./admin.html", import.meta.url);
const attr = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const raw = express.raw({ type: () => true, limit: "1mb" });
const json = express.json({ limit: "64kb" });
const notConfigured = (_, res, next) => core.isConfigured() ? next() : res.status(503).json({ error: "agent_app_not_configured" });

function session(req, res, next) {
  const m = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  const deny = e => res.status(401).set("X-Shopify-Retry-Invalid-Session-Request", "1").json({ error: e });
  if (!m) return deny("session_token_required");
  try { const { shop } = core.verifySession(m[1]); req.agentShop = shop; req.agentTenant = core.tenantFor(shop); req.idToken = m[1]; next(); }
  catch (e) { deny(e.message); }
}

export function shopifyAgentRouter() {
  const r = express.Router();
  r.use("/shopify-agent", (req, res, next) => { req.tenantId = undefined; next(); }); // never trust x-tenant-id here

  r.post("/shopify-agent/webhooks", raw, ah(async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!core.verifyWebhook(body, req.get("x-shopify-hmac-sha256"))) return res.status(401).type("text/plain").send("invalid hmac");
    const shop = core.normalizeShop(req.get("x-shopify-shop-domain"));
    if (!shop) return res.status(400).type("text/plain").send("invalid shop");
    let payload = {}; try { payload = JSON.parse(body.toString("utf8") || "{}"); } catch { payload = {}; }
    await gdpr.handle(String(req.get("x-shopify-topic") || ""), shop, payload, req.get("x-shopify-webhook-id"));
    res.status(200).type("text/plain").send("ok");
  }));

  r.post("/shopify-agent/proxy/chat", notConfigured, json, ah(async (req, res) => {
    const v = core.verifyProxy(req.query);
    if (!v.ok) return res.status(401).json({ error: v.error });
    if (!(await core.isInstalled(v.shop))) return res.status(404).json({ error: "shop_not_installed" });
    const b = req.body || {};
    const out = await handleChat({ tenantId: core.tenantFor(v.shop), profile: makeProfile(v.shop), message: b.message, conversation_id: b.conversation_id, lang: b.lang, page: b.page });
    res.set("Cache-Control", "no-store").json({ answer: out.answer, conversation_id: out.conversation_id, language: out.language, ui: out.ui, handoff: out.handoff || null, answered_by: out.answered_by || null });
  }));

  r.get("/shopify-agent", notConfigured, (req, res) => {
    const shop = core.normalizeShop(req.query.shop);
    if (!shop) return res.status(400).type("text/plain").send("Open this app from your Shopify admin.");
    setEmbeddedFrameHeaders(res, shop);
    res.set("Cache-Control", "no-store").type("html").send(fs.readFileSync(PAGE, "utf8").replace("__API_KEY__", attr(core.config().apiKey)));
  });

  const api = express.Router();
  api.use(notConfigured, json, session);
  api.post("/bootstrap", ah(async (req, res) => {
    const t = await core.ensureOfflineToken(req.agentShop, req.idToken);
    const row = await core.getShop(req.agentShop);
    res.json({ shop: req.agentShop, installed: !!row?.access_token_enc, exchanged: t.exchanged, scopes: row?.scopes || "" });
  }));
  api.get("/overview", ah(async (req, res) => {
    const o = await agentOverview(req.agentTenant, { days: Math.min(365, Number(req.query.days) || 30) });
    // shop tenants: product search instead of the Wed.AI recommender; no chat quotes / discount codes in this app
    o.kpis = o.kpis.filter(k => !["quotes", "discounts_issued"].includes(k.id)).map(k => k.id === "recommendations" ? { ...k, label: "Product searches", value: o.tools.search_products || 0 } : k);
    res.json(o);
  }));
  api.get("/conversations", ah(async (req, res) => res.json(await agentConversations(req.agentTenant, { limit: 50 }))));
  api.get("/handoffs", ah(async (req, res) => res.json(await agentHandoffs(req.agentTenant, { status: req.query.status }))));
  api.patch("/handoffs/:id", ah(async (req, res) => res.json(await patchHandoff(req.agentTenant, req.params.id, req.body))));
  api.get("/knowledge", ah(async (req, res) => res.json({ custom: (await getSettings(req.agentTenant)).custom_faq }))); // no Wed.AI built-ins for shops
  api.post("/knowledge", ah(async (req, res) => res.json(await upsertKnowledge(req.agentTenant, req.body))));
  api.delete("/knowledge/:id", ah(async (req, res) => res.json(await deleteKnowledge(req.agentTenant, req.params.id))));
  api.get("/settings", ah(async (req, res) => { const s = await getSettings(req.agentTenant); res.json({ enabled: s.enabled, greeting: s.greeting, human_reply_hours: s.human_reply_hours, tracking_sources: await trackingSources() }); }));
  api.put("/settings", ah(async (req, res) => { const b = req.body || {}; await putAgentSettings(req.agentTenant, { enabled: b.enabled, greeting: b.greeting, human_reply_hours: b.human_reply_hours }); clearFactsCache(req.agentShop); const s = await getSettings(req.agentTenant); res.json({ enabled: s.enabled, greeting: s.greeting, human_reply_hours: s.human_reply_hours }); }));
  api.get("/privacy", ah(async (req, res) => res.json((await listForTenant("agent_app_gdpr", req.agentTenant)).slice(-50))));
  api.post("/preview", ah(async (req, res) => { const b = req.body || {}; const out = await handleChat({ tenantId: req.agentTenant, profile: makeProfile(req.agentShop), message: b.message, conversation_id: b.conversation_id, lang: b.lang });
    res.json({ answer: out.answer, conversation_id: out.conversation_id, ui: out.ui, handoff: out.handoff || null, answered_by: out.answered_by || null }); }));
  r.use("/shopify-agent/api", api);
  r.use("/shopify-agent", (_, res) => res.status(404).json({ error: "not_found" }));
  return r;
}
