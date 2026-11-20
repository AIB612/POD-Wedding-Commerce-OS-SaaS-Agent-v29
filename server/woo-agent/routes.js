// Routes of the Pod.AI WooCommerce channel (mounted before express.json; each route parses its own body).
//   POST /woo-agent/v1/register            site registration (verified by a callback to the site), returns site key + secret once
//   *    /woo-agent/v1/<route>             signed by the WordPress plugin (HMAC, per-site secret, ±5 min, single-use nonce)
//        chat · config · event · preview · store · products/sync · products/delete · status · billing · tickets · tickets/:id · disconnect
//        assistant · assistant/actions · assistant/actions/:id/approve|reject · assistant/audit   (merchant assistant, internal agent)
// The Shopify app (/shopify-agent/*, webhooks on pod.swisspro.site/shopify-agent/webhooks) is not touched by this router.
import express from "express";
import * as core from "./core.js";
import { wooData } from "./adapter.js";
import * as catalog from "./catalog.js";
import * as billing from "./billing.js";
import { cancelSubscription } from "../billing/paddle.js";
import { profileFor, handleChat } from "../commerce-agent/index.js";
import { getSettings, saveSettings } from "../shopify-agent/engine/store.js";
import { agentHandoffs, patchHandoff, putAgentSettings } from "../shopify-agent/engine/kpis.js";
import { recordEvent } from "../shopify-agent/dashboard.js";
import { rateLimit } from "../http/middleware.js";
import { removeWhere } from "../saas-store.js";
import { logAccess } from "../shopify-agent/security/access-log.js";
import * as merchant from "../shopify-agent/merchant/index.js";

const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const HEX = v => /^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v) : null;
const LANGS = ["auto", "en", "zh", "de", "fr", "it"];
export function widgetOf(s) { const w = s.widget || {};
  return { color: HEX(w.color) || "#2b2520", position: w.position === "left" ? "left" : "right", title: String(w.title || "").slice(0, 60), language: LANGS.includes(w.language) ? w.language : "auto" }; }
const str = (v, n) => String(v ?? "").slice(0, n);
const PUBLIC = () => String(process.env.PODAI_PUBLIC_URL || "https://podai.swisspro.site").replace(/\/+$/, "");

// per-site limits (the caller is the WordPress server, so per-IP limits would be per-site anyway)
const buckets = new Map();
function siteLimit(name, max, windowMs = 60_000) {
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === "true") return next();
    const k = `${name}|${req.wooSite.id}`, t = Date.now(); let e = buckets.get(k);
    if (!e || e.reset <= t) { e = { n: 0, reset: t + windowMs }; buckets.set(k, e); }
    if (++e.n > max) { res.set("Retry-After", String(Math.ceil((e.reset - t) / 1000))); return res.status(429).json({ error: "rate_limited" }); }
    next();
  };
}

const POLICY_TYPES = ["SHIPPING_POLICY", "REFUND_POLICY", "CONTACT_INFORMATION", "PRIVACY_POLICY", "TERMS_OF_SERVICE", "LEGAL_NOTICE"];
const textOf = h => String(h || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const httpUrl = v => /^https?:\/\//i.test(String(v || "")) ? String(v).slice(0, 500) : "";
/** Store facts pushed by the plugin → validated copy on the site row. */
export function cleanStore(s = {}, site = {}) {
  const num = v => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
  const code = String(s.promo?.code || "").trim().toUpperCase();
  return { name: str(textOf(s.name), 120) || site.name, email: /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[A-Za-z]{2,24}$/.test(String(s.email || "")) ? String(s.email) : null,
    currency: /^[A-Z]{3}$/.test(s.currency || "") ? s.currency : site.currency || null, taxes_included: !!s.taxes_included, url: httpUrl(s.url) || site.url,
    checkout_url: httpUrl(s.checkout_url), cart_url: httpUrl(s.cart_url),
    policies: (Array.isArray(s.policies) ? s.policies : []).filter(p => POLICY_TYPES.includes(p?.type)).slice(0, 8).map(p => ({ type: p.type, title: str(textOf(p.title), 120), text: textOf(p.text).slice(0, 1500), url: httpUrl(p.url) })).filter(p => p.text),
    shipping: (Array.isArray(s.shipping) ? s.shipping : []).slice(0, 40).map(z => ({ name: str(textOf(z.name), 80), rest_of_world: !!z.rest_of_world,
      countries: (z.countries || []).filter(c => /^[A-Z]{2}$/.test(c)).slice(0, 260), methods: (z.methods || []).slice(0, 10).map(m => ({ name: str(textOf(m.name), 80), cost: num(m.cost), min_amount: num(m.min_amount), currency: /^[A-Z]{3}$/.test(m.currency || "") ? m.currency : null })) })),
    promo: /^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code) ? { code, summary: str(textOf(s.promo.summary), 120) } : null,
    synced_at: new Date().toISOString() };
}
const cleanFaq = list => (Array.isArray(list) ? list : []).slice(0, 200).map((x, i) => ({ id: `wf_${i}`, question: str(x.question, 200).trim(), answer: str(x.answer, 1500).trim(), tags: str(x.tags, 200),
  lang: ["en", "zh", "de", "fr", "it"].includes(x.lang) ? x.lang : "en", active: true })).filter(x => x.question.length >= 3 && x.answer.length >= 3);

const ticketView = h => ({ id: h.id, ticket_id: h.ticket_id || null, status: h.status === "in_progress" ? "pending" : h.status === "resolved" ? "closed" : "open", customer_email: h.customer_email || null,
  order_number: h.order_number || null, reason: h.reason || "", summary: h.summary || "", language: h.language || null, page: h.page || null, created_at: h.created_at, updated_at: h.updated_at,
  notes: h.notes || [], messages: (h.messages || []).map(m => ({ role: m.role, text: m.text, at: m.at })), test: !!h.test });

export function wooAgentRouter() {
  const r = express.Router();
  const raw = express.raw({ type: () => true, limit: "2mb" });
  r.use("/woo-agent", (req, res, next) => { req.tenantId = undefined; next(); }); // never trust x-tenant-id here

  r.post("/woo-agent/v1/register", rateLimit({ bucket: "woo-register", windowMs: 3600_000, max: 10 }), express.json({ limit: "16kb" }), ah(async (req, res) => {
    if (process.env.WOO_REGISTRATION === "closed") return res.status(403).json({ error: "registration_closed" });
    const b = req.body || {};
    const out = await core.registerSite({ site_url: b.site_url, rest_url: b.rest_url, name: b.name, admin_email: b.admin_email, nonce: b.nonce, currency: b.currency, locale: b.locale, versions: b.versions });
    if (!out.ok) return res.status(out.status || 400).json({ error: out.error });
    logAccess({ actor: "woo_plugin", action: out.rotated ? "site_key_rotated" : "site_registered", shop: String(b.site_url).replace(/^https?:\/\//, ""), tenant: core.tenantFor(out.site_id), via: "register", ip: req.ip }).catch?.(() => {});
    res.set("Cache-Control", "no-store").json({ site_id: out.site_id, secret: out.secret, rotated: out.rotated, plan: "free" });
  }));

  // ---- everything below: signed by the site ----
  const v1 = express.Router();
  v1.use(raw, ah(async (req, res, next) => {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const v = await core.verifySigned({ siteId: req.get("x-podai-site"), ts: req.get("x-podai-timestamp"), nonce: req.get("x-podai-nonce"), signature: req.get("x-podai-signature"),
      method: req.method, route: `/woo-agent/v1${req.path}`, body });
    if (!v.ok) return res.status(401).json({ error: v.error });
    try { req.body = body.length ? JSON.parse(body.toString("utf8")) : {}; } catch { return res.status(400).json({ error: "invalid_json" }); }
    req.wooSite = v.site; req.wooTenant = core.tenantFor(v.site.id); next();
  }));
  const profile = site => profileFor(site.url.replace(/^https?:\/\//, ""), wooData(site));

  v1.post("/chat", siteLimit("chat", 240), ah(async (req, res) => {
    const b = req.body || {}, site = req.wooSite;
    const gate = await billing.chatGate(site).catch(() => undefined);
    const out = await handleChat({ tenantId: req.wooTenant, profile: profile(site), message: b.message, conversation_id: b.conversation_id, lang: b.lang, page: b.page, country: b.country, gate });
    res.set("Cache-Control", "no-store").json({ answer: out.answer, conversation_id: out.conversation_id, language: out.language, ui: out.ui, handoff: out.handoff || null, answered_by: out.answered_by || null });
  }));
  v1.post("/preview", siteLimit("preview", 60), ah(async (req, res) => { const b = req.body || {}, site = req.wooSite;
    const out = await handleChat({ tenantId: req.wooTenant, profile: profile(site), message: b.message, conversation_id: b.conversation_id, lang: b.lang, gate: { canStart: true, llm: billing.planOf(site).llm } });
    res.json({ answer: out.answer, conversation_id: out.conversation_id, ui: out.ui, handoff: out.handoff || null, answered_by: out.answered_by || null }); }));
  v1.get("/config", siteLimit("config", 300), ah(async (req, res) => { const s = await getSettings(req.wooTenant), st = req.wooSite.store || {};
    res.set("Cache-Control", "no-store").json({ enabled: s.enabled, greeting: s.greeting, widget: widgetOf(s), reply_hours: s.human_reply_hours, promo: st.promo || null, checkout_url: st.checkout_url || "", cart_url: st.cart_url || "" }); }));
  v1.post("/event", siteLimit("event", 600), ah(async (req, res) => res.json(await recordEvent(req.wooTenant, req.body || {}))));

  // store facts + settings (plugin settings page save, activation, daily)
  v1.post("/store", siteLimit("store", 30), ah(async (req, res) => {
    const b = req.body || {}, site = req.wooSite;
    if (b.store) await core.updateSite(site.id, { store: cleanStore(b.store, site), name: str(textOf(b.store.name), 120) || site.name, ...(/^\d+\.\d+\.\d+$/.test(String(b.plugin_version || "")) ? { plugin_version: b.plugin_version } : {}) });
    if (b.settings) { const x = b.settings;
      await putAgentSettings(req.wooTenant, { enabled: x.enabled, support_email: x.support_email, human_reply_hours: x.human_reply_hours, greeting: x.greeting });
      const cur = await getSettings(req.wooTenant);
      await saveSettings(req.wooTenant, { widget: x.widget ? widgetOf({ widget: { ...widgetOf(cur), ...x.widget } }) : widgetOf(cur), ...(x.custom_faq ? { custom_faq: cleanFaq(x.custom_faq) } : {}), llm_enabled: x.llm_enabled === true, ...(typeof x.agent_api === "boolean" ? { agent_api: x.agent_api } : {}) });
    }
    const s = await getSettings(req.wooTenant);
    res.json({ ok: true, support_email: s.support_email || "", widget: widgetOf(s), faq: s.custom_faq.length, agent_api: s.agent_api !== false, agent_api_url: `${PUBLIC()}/agent/v1/stores/${site.id}` });
  }));
  v1.post("/products/sync", siteLimit("sync", 120), ah(async (req, res) => { const b = req.body || {};
    res.json({ ok: true, ...(await catalog.upsertProducts(req.wooSite.id, b.products, { mode: b.mode === "full" ? "full" : "upsert", sync_id: b.sync_id, done: b.done === true, currency: req.wooSite.store?.currency || req.wooSite.currency })) }); }));
  v1.post("/products/delete", siteLimit("sync", 120), ah(async (req, res) => res.json({ ok: true, ...(await catalog.deleteProducts(req.wooSite.id, req.body?.ids)) })));

  v1.get("/status", ah(async (req, res) => { const site = req.wooSite, s = await getSettings(req.wooTenant);
    res.set("Cache-Control", "no-store").json({ site_id: site.id, url: site.url, name: site.name, connected: true, catalog: catalog.catalogStats(site.id), store_synced_at: site.store?.synced_at || null,
      support_email: s.support_email || "", billing: await billing.billingSummary(site), llm: false,
      agent_api: { enabled: s.agent_api !== false, manifest: `${PUBLIC()}/agent/v1/stores/${site.id}`, mcp: `${PUBLIC()}/agent/v1/stores/${site.id}/mcp` } }); }));
  v1.get("/billing", ah(async (req, res) => res.set("Cache-Control", "no-store").json(await billing.billingSummary(req.wooSite))));
  // Paddle: start a checkout for a plan (opens the Pod.AI checkout page) · customer portal for an existing subscription
  v1.post("/billing/checkout", siteLimit("billing", 10), ah(async (req, res) => { const b = req.body || {};
    try { res.set("Cache-Control", "no-store").json(await billing.startCheckout(req.wooSite, { plan: String(b.plan || ""), cycle: b.cycle === "annual" ? "annual" : "monthly", email: b.email, return_url: b.return_url })); }
    catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "billing_failed" }); } }));
  v1.post("/billing/portal", siteLimit("billing", 10), ah(async (req, res) => {
    try { res.set("Cache-Control", "no-store").json(await billing.portal(req.wooSite)); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "billing_failed" }); } }));
  v1.get("/tickets", ah(async (req, res) => { const st = { pending: "in_progress", closed: "resolved" }[req.query.status] || req.query.status;
    const h = await agentHandoffs(req.wooTenant, { status: ["open", "in_progress", "resolved"].includes(st) ? st : undefined });
    logAccess({ actor: "woo_admin", action: "view_handoffs", tenant: req.wooTenant, count: h.length, via: "wp_admin" }).catch?.(() => {});
    res.set("Cache-Control", "no-store").json(h.slice(0, 200).map(ticketView)); }));
  const patch = ah(async (req, res) => { const b = req.body || {};
    const h = await patchHandoff(req.wooTenant, req.params.id, { status: b.status, add_note: b.add_note ? str(b.add_note, 1000) : undefined, test: b.test === true ? true : undefined });
    logAccess({ actor: "woo_admin", action: "update_handoff", tenant: req.wooTenant, ids: [h.id], via: "wp_admin" }).catch?.(() => {});
    res.json(ticketView(h)); });
  v1.patch("/tickets/:id", patch); v1.post("/tickets/:id", patch);
  // ---- Merchant assistant (internal agent, server/shopify-agent/merchant). The WP plugin signs every call; it only sends
  //      requests from users who can manage WooCommerce. Writes are proposals until /approve with { confirm:true }.
  const assistantCtx = async (req, lang) => { const site = req.wooSite, s = await getSettings(req.wooTenant), wp = str(req.body?.actor || req.query?.actor, 60).replace(/@.*$/, "").replace(/[^\w.-]/g, ""); // WP login, never an e-mail (audit holds no personal data)
    return { tenantId: req.wooTenant, actor: `woo_admin${wp ? ":" + wp : ""}`, source: "wp_admin", lang: ["en", "de", "fr", "it", "zh"].includes(lang) ? lang : "en",
      llm: billing.planOf(site).llm === true && s.llm_enabled === true, shopName: str(site.name, 80), usage: () => billing.billingSummary(site),
      onPersonalData: tool => logAccess({ actor: "woo_admin", action: `assistant_${tool}`, tenant: req.wooTenant, via: "wp_admin" }).catch?.(() => {}) }; };
  v1.post("/assistant", siteLimit("assistant", 30), ah(async (req, res) => { const b = req.body || {};
    if (!String(b.message || "").trim()) return res.status(400).json({ error: "message_required" });
    res.set("Cache-Control", "no-store").json(await merchant.runAssistant(await assistantCtx(req, b.lang), b.message)); }));
  v1.get("/assistant/actions", ah(async (req, res) => res.set("Cache-Control", "no-store").json(await merchant.listActions(req.wooTenant, { status: ["proposed", "done", "failed", "rejected", "expired"].includes(req.query.status) ? req.query.status : undefined }))));
  v1.post("/assistant/actions/:id/approve", siteLimit("assistant_act", 60), ah(async (req, res) => { if (req.body?.confirm !== true) return res.status(409).json({ error: "confirmation_required" });
    res.json(await merchant.approve(await assistantCtx(req, req.body?.lang), req.params.id)); }));
  v1.post("/assistant/actions/:id/reject", siteLimit("assistant_act", 60), ah(async (req, res) => res.json(await merchant.reject(await assistantCtx(req, req.body?.lang), req.params.id))));
  v1.get("/assistant/audit", ah(async (req, res) => res.set("Cache-Control", "no-store").json(await merchant.readAudit(req.wooTenant, { limit: Number(req.query.limit) || 100 }))));
  // plugin uninstall / disconnect: every record of this site is deleted
  v1.post("/disconnect", ah(async (req, res) => { const id = req.wooSite.id, T = req.wooTenant; let removed = 0;
    const sub = req.wooSite.paddle; if (sub?.subscription_id && ["active", "trialing", "past_due", "paused"].includes(sub.status)) await cancelSubscription(sub.subscription_id);
    for (const col of ["podai_conversations", "podai_handoffs", "podai_events", "podai_settings", "podai_usage", "podai_discounts", merchant.ACTIONS, merchant.AUDIT]) removed += (await removeWhere(col, x => x.tenant_id === T)).length;
    await catalog.dropCatalog(id); removed += await core.removeSite(id);
    logAccess({ actor: "woo_plugin", action: "site_disconnected", tenant: T, count: removed, via: "disconnect" }).catch?.(() => {});
    res.json({ ok: true, removed }); }));
  v1.use((err, req, res, next) => { if (err?.status) return res.status(err.status).json({ error: err.code || err.message }); next(err); });
  r.use("/woo-agent/v1", v1);
  r.use("/woo-agent", (_, res) => res.status(404).json({ error: "not_found" }));
  return r;
}
