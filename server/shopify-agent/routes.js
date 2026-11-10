// Routes of the Shopify Chat Agent app (mounted before express.json; each route parses its own body).
//   GET  /shopify-agent                    embedded admin (App Bridge; KPIs, knowledge, handoffs, settings)
//   GET|POST /shopify-agent/api/*          admin JSON API — Authorization: Bearer <session token> (shop from the token only)
//   POST /shopify-agent/proxy/chat         storefront chat via App Proxy (/apps/podai/chat), Shopify signature required
//   POST /shopify-agent/webhooks           app/uninstalled, app_subscriptions/update (billing) + GDPR topics (HMAC on the raw body)
import express from "express";
import fs from "node:fs";
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
import * as core from "./core.js";
import * as gdpr from "./gdpr.js";
import { makeProfile, clearFactsCache } from "./profile.js";
import { handleChat } from "./engine/agent.js";
import { agentOverview, agentConversations, agentHandoffs, patchHandoff, getSettings, putAgentSettings, upsertKnowledge, deleteKnowledge } from "./engine/kpis.js";
import { listForTenant } from "../saas-store.js";
import { trackingSources } from "./tracking.js";
// Merchant-facing view of the tracking setup: no env var names, no third-party service names.
const merchantTrackingSources = async () => { const t = await trackingSources();
  return { order: ["carrier_api", "tracking_service", "shopify_tracking_url"], carriers: t.carriers.map(({ id, name, mode, configured }) => ({ id, name, mode, configured })),
    tracking_service: { configured: !!t.tracking51?.configured }, cache_minutes: t.cache_minutes }; };
import { dashboard, recordEvent } from "./dashboard.js";
import { saveSettings } from "./engine/store.js";
import { llmStatus } from "./engine/llm.js";
import * as ga from "./ga.js";
import { logAccess, readAccess, purgeAccessLog } from "./security/access-log.js";
import { runBackup } from "./security/backup.js";
import * as billing from "./billing.js";

const HEX = v => /^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : null;
// storefront look, editable in the app (the theme app embed can override colour / position)
function widgetOf(s) { const w = s.widget || {};
  return { color: HEX(w.color) || "#2b2520", position: w.position === "left" ? "left" : "right", title: String(w.title || "").slice(0, 60), avatar: /^https:\/\//.test(w.avatar || "") ? String(w.avatar).slice(0, 500) : "",
    language: ["auto", "en", "zh", "de", "fr", "it"].includes(w.language) ? w.language : "auto" }; }

const PAGE = new URL("./admin.html", import.meta.url);
const PRIVACY_PAGE = new URL("./privacy.html", import.meta.url);
const attr = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const raw = express.raw({ type: () => true, limit: "1mb" });
const json = express.json({ limit: "64kb" });
const notConfigured = (_, res, next) => core.isConfigured() ? next() : res.status(503).json({ error: "agent_app_not_configured" });

function session(req, res, next) {
  const m = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "");
  const deny = e => res.status(401).set("X-Shopify-Retry-Invalid-Session-Request", "1").json({ error: e });
  if (!m) return deny("session_token_required");
  try { const { shop, payload } = core.verifySession(m[1]); req.agentShop = shop; req.agentTenant = core.tenantFor(shop); req.idToken = m[1]; req.agentUser = `shop_staff:${payload.sub || "?"}`; next(); }
  catch (e) { deny(e.message); }
}

export function shopifyAgentRouter() {
  const r = express.Router();
  if (process.env.NODE_ENV !== "test") { const run = () => gdpr.purgeExpired().catch(e => console.error("[pod.ai] retention purge failed:", e.message)); setTimeout(run, 60e3).unref?.(); setInterval(run, 864e5).unref?.();
    // encrypted daily backup (14 days) + access-log retention (12 months); hourly check, one backup per UTC day
    const bk = () => runBackup().then(r => r.created || r.leftovers ? console.log("[pod.ai] backup", JSON.stringify(r)) : null).catch(e => console.error("[pod.ai] backup failed:", e.message)).then(() => purgeAccessLog()).catch(() => {});
    setTimeout(bk, 120e3).unref?.(); setInterval(bk, 3600e3).unref?.(); }
  // public privacy policy (App Store listing link)
  r.get(["/shopify-agent/privacy", "/shopify-agent/privacy.html"], (req, res) => res.set("Cache-Control", "public, max-age=3600").type("html").send(ga.withPublicGa(fs.readFileSync(PRIVACY_PAGE, "utf8"))));
  const TERMS_PAGE = new URL("./terms.html", import.meta.url);
  const SUPPORT_PAGE = new URL("./support.html", import.meta.url);
  r.get(["/shopify-agent/terms", "/shopify-agent/terms.html"], (req, res) => res.set("Cache-Control", "public, max-age=3600").type("html").send(ga.withPublicGa(fs.readFileSync(TERMS_PAGE, "utf8"))));
  r.get(["/shopify-agent/support", "/shopify-agent/support.html", "/shopify-agent/docs"], (req, res) => res.set("Cache-Control", "public, max-age=3600").type("html").send(ga.withPublicGa(fs.readFileSync(SUPPORT_PAGE, "utf8"))));
  r.get(["/shopify-agent/security", "/shopify-agent/security.html"], (req, res) => res.set("Cache-Control", "public, max-age=3600").type("html").send(ga.withPublicGa(fs.readFileSync(new URL("./security.html", import.meta.url), "utf8"))));
  r.get(["/shopify-agent/dpa", "/shopify-agent/dpa.html"], (req, res) => res.set("Cache-Control", "public, max-age=3600").type("html").send(ga.withPublicGa(fs.readFileSync(new URL("./dpa.html", import.meta.url), "utf8"))));
  r.get("/shopify-agent/podai-icon.png", (req, res) => res.set("Cache-Control", "public, max-age=86400").type("png").send(fs.readFileSync(new URL("./podai-icon.png", import.meta.url))));
  r.use("/shopify-agent", (req, res, next) => { req.tenantId = undefined; next(); }); // never trust x-tenant-id here

  r.post("/shopify-agent/webhooks", raw, ah(async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!core.verifyWebhook(body, req.get("x-shopify-hmac-sha256"))) return res.status(401).type("text/plain").send("invalid hmac");
    const shop = core.normalizeShop(req.get("x-shopify-shop-domain"));
    if (!shop) return res.status(400).type("text/plain").send("invalid shop");
    let payload = {}; try { payload = JSON.parse(body.toString("utf8") || "{}"); } catch { payload = {}; }
    const topic = String(req.get("x-shopify-topic") || "");
    if (topic === "app_subscriptions/update" || topic === "app/uninstalled") billing.invalidate(shop); // plan changed → re-read on the next chat
    if (topic === "app_subscriptions/update") return res.status(200).type("text/plain").send("ok");
    const out = await gdpr.handle(topic, shop, payload, req.get("x-shopify-webhook-id"));
    if (/^(customers|shop)\//.test(topic) && !out?.duplicate) logAccess({ actor: "shopify_gdpr_webhook", action: topic, shop, tenant: core.tenantFor(shop), email: payload.customer?.email, count: out?.conversations ?? out?.removed, via: "webhook" });
    res.status(200).type("text/plain").send("ok");
  }));

  r.post("/shopify-agent/proxy/chat", notConfigured, json, ah(async (req, res) => {
    const v = core.verifyProxy(req.query);
    if (!v.ok) return res.status(401).json({ error: v.error });
    if (!(await core.isInstalled(v.shop))) return res.status(404).json({ error: "shop_not_installed" });
    const b = req.body || {};
    const gate = await billing.chatGate(v.shop).catch(e => { console.error("[pod.ai] plan check failed:", e.message); return undefined; }); // plan limits (Managed Pricing)
    const out = await handleChat({ tenantId: core.tenantFor(v.shop), profile: makeProfile(v.shop), message: b.message, conversation_id: b.conversation_id, lang: b.lang, page: b.page, gate });
    res.set("Cache-Control", "no-store").json({ answer: out.answer, conversation_id: out.conversation_id, language: out.language, ui: out.ui, handoff: out.handoff || null, answered_by: out.answered_by || null });
  }));

  // storefront widget config + events (App Proxy signature required, like chat)
  const proxyShop = async (req, res) => { const v = core.verifyProxy(req.query); if (!v.ok) { res.status(401).json({ error: v.error }); return null; }
    if (!(await core.isInstalled(v.shop))) { res.status(404).json({ error: "shop_not_installed" }); return null; } return v.shop; };
  r.get("/shopify-agent/proxy/config", notConfigured, ah(async (req, res) => { const shop = await proxyShop(req, res); if (!shop) return;
    const s = await getSettings(core.tenantFor(shop));
    res.set("Cache-Control", "public, max-age=60").json({ enabled: s.enabled, greeting: s.greeting, widget: widgetOf(s), reply_hours: s.human_reply_hours, ga_id: ga.measurementId() || undefined }); }));
  r.post("/shopify-agent/proxy/event", notConfigured, json, ah(async (req, res) => { const shop = await proxyShop(req, res); if (!shop) return;
    res.json(await recordEvent(core.tenantFor(shop), req.body || {})); }));

  r.get("/shopify-agent", notConfigured, (req, res) => {
    const shop = core.normalizeShop(req.query.shop);
    if (!shop) return res.status(400).type("text/plain").send("Open this app from your Shopify admin.");
    core.setEmbeddedFrameHeaders(res, shop);
    res.set("Cache-Control", "no-store").type("html").send(
      fs.readFileSync(PAGE, "utf8")
        .replace("__API_KEY__", attr(core.config().apiKey))
        .replace("<!--__PODAI_GA__-->", ga.adminSnippet())
    );
  });

  const api = express.Router();
  api.use(notConfigured, json, session);
  api.post("/bootstrap", ah(async (req, res) => {
    const t = await core.ensureOfflineToken(req.agentShop, req.idToken);
    const row = await core.getShop(req.agentShop);
    res.json({ shop: req.agentShop, installed: !!row?.access_token_enc, exchanged: t.exchanged, scopes: row?.scopes || "" });
  }));
  const audit = (req, action, extra = {}) => logAccess({ actor: req.agentUser, action, shop: req.agentShop, tenant: req.agentTenant, via: "admin", ip: req.ip, ...extra });
  api.get("/dashboard", ah(async (req, res) => { const d = await dashboard(req.agentTenant, req.agentShop, { days: req.query.days }); audit(req, "view_dashboard"); res.json(d); }));
  api.get("/checklist", ah(async (req, res) => {
    const out = { tracking: await merchantTrackingSources(), llm: { available: llmStatus().available } };
    try { const d = await core.graphql(req.agentShop, "{ shop { name shopPolicies { type } } }"); out.shop_name = d.shop.name; out.policies = d.shop.shopPolicies.map(p => p.type); } catch { out.policies = null; }
    try { await core.graphql(req.agentShop, "{ orders(first:1) { nodes { id } } }"); out.protected_data = "ok"; } catch (e) { out.protected_data = /access|protected|denied/i.test(e.message) ? "not_approved" : "error"; }
    // app embed on? the widget (only rendered by the embed) pings daily; chats / chat opens also prove it. No read_themes scope needed.
    { const since = Date.now() - 14 * 864e5; const ev = (await listForTenant("podai_events", req.agentTenant)).filter(e => ["embed_ping", "chat_open"].includes(e.type) && Date.parse(e.at) >= since);
      out.embed_last_seen = ev.map(e => e.at).sort().pop() || null; out.chat_seen = !!out.embed_last_seen || (await listForTenant("podai_conversations", req.agentTenant)).some(c => Date.parse(c.created_at) >= since); }
    res.json(out);
  }));
  api.get("/overview", ah(async (req, res) => {
    const o = await agentOverview(req.agentTenant, { days: Math.min(365, Number(req.query.days) || 30) });
    if (o.llm) delete o.llm.missing; // merchants never see server env var names
    for (const k of Object.keys(o)) if (Array.isArray(o[k])) o[k] = JSON.parse(JSON.stringify(o[k]).replace(/ \(missing: [^)]*\)/g, "").replace(/Add the key \+ model to the server \.env and restart/g, "Optional: an AI provider can be enabled by Pod.AI"));
    // shop tenants: product search instead of the POD.AI recommender; no chat quotes / discount codes in this app
    o.kpis = o.kpis.filter(k => !["quotes", "discounts_issued"].includes(k.id)).map(k => k.id === "recommendations" ? { ...k, label: "Product searches", value: o.tools.search_products || 0 } : k);
    res.json(o);
  }));
  api.get("/conversations", ah(async (req, res) => { const c = await agentConversations(req.agentTenant, { limit: 50 }); audit(req, "view_conversations", { ids: c.map(x => x.id), count: c.length }); res.json(c); }));
  api.get("/handoffs", ah(async (req, res) => { const h = await agentHandoffs(req.agentTenant, { status: req.query.status }); audit(req, "view_handoffs", { ids: h.map(x => x.id), count: h.length }); res.json(h); }));
  api.patch("/handoffs/:id", ah(async (req, res) => { const h = await patchHandoff(req.agentTenant, req.params.id, req.body); audit(req, "update_handoff", { ids: [h.id] }); res.json(h); }));
  api.get("/knowledge", ah(async (req, res) => res.json({ custom: (await getSettings(req.agentTenant)).custom_faq }))); // no POD.AI built-ins for shops
  api.post("/knowledge", ah(async (req, res) => res.json(await upsertKnowledge(req.agentTenant, req.body))));
  api.delete("/knowledge/:id", ah(async (req, res) => res.json(await deleteKnowledge(req.agentTenant, req.params.id))));
  // plan + chats this month + Shopify-hosted plan page (Managed Pricing); ?refresh=1 re-reads the subscription
  api.get("/billing", ah(async (req, res) => res.set("Cache-Control", "no-store").json(await billing.billingSummary(req.agentShop, { force: req.query.refresh === "1" }))));
  api.get("/settings", ah(async (req, res) => { const s = await getSettings(req.agentTenant); const plan = await billing.getPlan(req.agentShop); res.json({ plan_llm: plan.llm, plan: plan.handle, enabled: s.enabled, greeting: s.greeting, human_reply_hours: s.human_reply_hours, widget: widgetOf(s), llm_enabled: s.llm_enabled !== false, llm_available: llmStatus().available, tracking_sources: await merchantTrackingSources() }); }));
  api.put("/settings", ah(async (req, res) => { const b = req.body || {}; await putAgentSettings(req.agentTenant, { enabled: b.enabled, greeting: b.greeting, human_reply_hours: b.human_reply_hours }); { const cur = await getSettings(req.agentTenant); await saveSettings(req.agentTenant, { widget: b.widget ? widgetOf({ widget: { ...widgetOf(cur), ...b.widget } }) : widgetOf(cur), llm_enabled: b.llm_enabled === undefined ? cur.llm_enabled !== false : b.llm_enabled !== false }); } clearFactsCache(req.agentShop); const s = await getSettings(req.agentTenant); res.json({ enabled: s.enabled, greeting: s.greeting, human_reply_hours: s.human_reply_hours }); }));
  api.get("/privacy", ah(async (req, res) => { const g = (await listForTenant("podai_gdpr", req.agentTenant)).slice(-50); audit(req, "view_gdpr_requests", { count: g.length }); res.json(g); }));
  // who accessed personal data of this shop (no data itself); viewing it is logged too
  api.get("/access-log", ah(async (req, res) => { const e = await readAccess({ tenant: req.agentTenant, limit: Math.min(500, Number(req.query.limit) || 200) }); audit(req, "view_access_log"); res.json(e); }));
  api.post("/preview", ah(async (req, res) => { const b = req.body || {}; const plan = await billing.getPlan(req.agentShop); // "Try it" follows the plan's LLM rule; not counted as a chat
    const out = await handleChat({ tenantId: req.agentTenant, profile: makeProfile(req.agentShop), message: b.message, conversation_id: b.conversation_id, lang: b.lang, gate: { canStart: true, llm: plan.llm } });
    res.json({ answer: out.answer, conversation_id: out.conversation_id, ui: out.ui, handoff: out.handoff || null, answered_by: out.answered_by || null }); }));
  r.use("/shopify-agent/api", api);
  r.use("/shopify-agent", (_, res) => res.status(404).json({ error: "not_found" }));
  return r;
}
