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
import { addRecord, findRecord, listForTenant, updateRecord } from "../saas-store.js";
import { HttpError } from "../http/middleware.js";
import { protocolRegistry, ucpProfile, a2aAgentCard, acpFeed } from "../protocols/commerce-protocols.js";
import { createStorefrontCheckout, createTwintCheckout, twintOrderStatus, paymentMethods, handlePayPalReturn, publicOrderStatus, quoteStorefront, orderConfirmation, orderToken, handlePayPalCancel } from "../services/checkout-service.js";
import { publicPriceList } from "../services/price-list-service.js";
import { publicFees } from "../services/fees-service.js";
import { publicProof, approvePublicProof, requestPublicProofChanges } from "../services/proof-service.js";
import { createPayPalOrder, capturePayPalOrder } from "../connectors/paypal.js";
import { submitRsvp } from "../services/rsvp-service.js";
import cors from "cors";

const VERSION = JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

export function publicRouter({ root, generatedDir }) {
  const router = express.Router();
  const pages = { "/": "index.html", "/index.html": "index.html", "/admin": "admin.html", "/admin.html": "admin.html", "/payment-success.html": "payment-success.html", "/admin-prices.html": "admin-prices.html", "/admin/prices": "admin-prices.html", "/admin-fees.html": "admin-fees.html", "/admin/fees": "admin-fees.html", "/admin-promos.html": "admin-promos.html", "/admin/promos": "admin-promos.html", "/checkout": "checkout.html", "/checkout.html": "checkout.html", "/proof.html": "proof.html", "/account.html": "account.html", "/account": "account.html", "/privacy": "privacy.html", "/privacy.html": "privacy.html", "/terms": "terms.html", "/terms.html": "terms.html" };
  const noStore = { headers: { "Cache-Control": "no-cache" } };
  for (const [route, file] of Object.entries(pages)) router.get(route, (_, res) => res.sendFile(path.join(root, file), noStore));

  // Shared front-end assets (explicit allowlist — server code and .env are never exposed).
  router.get("/i18n.js", (_, res) => res.sendFile(path.join(root, "i18n.js"), { maxAge: "1h" }));
  router.get("/wedding-qr.js", (_, res) => res.sendFile(path.join(root, "wedding-qr.js"), { maxAge: "1h" }));
  // Wedding sites are private links: keep them out of search engines.
  router.get("/robots.txt", (_, res) => res.type("text/plain").send("User-agent: *\nDisallow: /generated/\n"));
  // POD Studio page + its scripts (explicit allowlist, like the other pages)
  router.get("/studio.html", (_, res) => res.sendFile(path.join(root, "studio.html"), noStore));
  for (const f of ["checkout.js", "cart.js", "cart.css", "studio.js", "studio-data.js", "studio-pricing.js", "studio-mockups.js", "account-auth.js", "account-app.js", "footer.js"]) router.get("/" + f, (_, res) => res.sendFile(path.join(root, f), { maxAge: "5m" }));
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
    res.json(await createStorefrontCheckout({ tenantId: req.tenantId, user: req.user || null, guestId: req.guestId || null, body: req.body || {}, baseUrl: baseUrl() }));
  }));
  // Payment methods the storefront may show (configured flags only, no secrets)
  router.get("/api/payments/methods", rateLimit({ bucket: "payment-methods", windowMs: 60_000, max: 60 }), ah(async (req, res) => res.json(await paymentMethods(req.tenantId))));
  // TWINT (direct TWINT AG merchant integration — skeleton; fails closed with twint_not_configured / twint_not_implemented)
  router.post("/api/payments/twint/create", payLimit, ah(async (req, res) => {
    res.json(await createTwintCheckout({ tenantId: req.tenantId, user: req.user || null, guestId: req.guestId || null, body: req.body || {}, baseUrl: baseUrl() }));
  }));
  router.get("/api/payments/twint/status", payLimit, ah(async (req, res) => res.json(await twintOrderStatus(req.query.order))));
  // Cart / checkout preview: same server-side quote that checkout uses (merchandise + shipping + tax).
  const quoteLimit = rateLimit({ bucket: "shipping-quote", windowMs: 60_000, max: 60 });
  router.post("/api/storefront/shipping/quote", quoteLimit, ah(async (req, res) => {
    const b = req.body || {};
    res.json(await quoteStorefront({ tenantId: req.tenantId, cart: b.cart, currency: b.currency, country: b.country, postal_code: b.postal_code, shipping_method: b.shipping_method, promo_code: b.promo_code, proof_choice: b.proof_choice }));
  }));
  router.get("/api/payments/paypal/return", payLimit, ah(async (req, res) => {
    const { orderId, status } = await handlePayPalReturn({ orderId: req.query.order, paypalToken: req.query.token });
    // Declined / voided payment → back to the Review step with the cart intact; pending stays on the status page.
    if (/^(FAILED|DECLINED|VOIDED|UNKNOWN)$/.test(status)) return res.redirect(`/checkout.html?payment=failed`);
    res.redirect(`/payment-success.html?order=${encodeURIComponent(orderId || "")}${orderId ? `&t=${orderToken(orderId)}` : ""}&status=${encodeURIComponent(status)}`);
  }));
  router.get("/api/payments/paypal/cancel", payLimit, ah(async (req, res) => {
    await handlePayPalCancel({ orderId: req.query.order, token: req.query.t });
    res.redirect(`/checkout.html?payment=cancelled`);
  }));
  router.get("/api/storefront/fees", (req, res) => { res.setHeader("Cache-Control", "no-cache"); res.json(publicFees()); });
  const statusLimit = rateLimit({ bucket: "status", windowMs: 60_000, max: 60 });
  // Order confirmation (payment-success.html): protected by the signed token from the return URL.
  router.get("/api/orders/:id/confirmation", statusLimit, ah(async (req, res) => { res.setHeader("Cache-Control", "private, no-store"); res.json(await orderConfirmation(req.params.id, req.query.t)); }));
  // Live sell prices (admin price list) for browsers: JSON, and as a script that attaches to window.STUDIO_DATA.
  router.get("/api/prices", (req, res) => { res.setHeader("Cache-Control", "no-cache"); res.json(publicPriceList()); });
  router.get("/price-list.js", (req, res) => { res.setHeader("Cache-Control", "no-cache"); res.type("application/javascript").send(`(function(){var l=${JSON.stringify(publicPriceList())};window.POD_PRICE_LIST=l;if(window.STUDIO_DATA)window.STUDIO_DATA.price_list=l;})();`); });
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

  // Wedding invitation site publishing (larger body limit only for this route). Requires a signed-in couple so RSVPs have an owner.
  const inviteLimit = rateLimit({ bucket: "invitations", windowMs: 60 * 60_000, max: Number(process.env.INVITATION_PUBLISH_PER_HOUR || 20) });
  const needUser = (req, res, next) => req.user?.id ? next() : res.status(401).json({ error: "login_required" });
  const ownInvitation = async (req) => {
    const inv = ID_RE.test(String(req.params.id || "")) ? await findRecord("invitations", req.params.id) : null;
    if (!inv || inv.tenant_id !== req.tenantId || !inv.user_id || inv.user_id !== req.user.id) throw new HttpError(404, "invitation_not_found");
    return inv;
  };
  async function writeInvitation(req, id, prev) {
    const { html, profile } = req.body || {};
    if (typeof html !== "string" || html.length < 100) throw new HttpError(400, "invalid_html");
    const file = `${id}.html`, rev = Date.now().toString(36);
    // Remove image files of the previous revision (the page is rewritten below).
    if (prev) for (const f of await fsp.readdir(generatedDir)) if (f.startsWith(`${id}-`) && /\.(jpg|png|webp)$/.test(f)) await fsp.rm(path.join(generatedDir, f), { force: true });
    // Optional share card (PNG rendered by the builder) for og:image / WhatsApp link previews.
    const og = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(typeof req.body?.og_image === "string" ? req.body.og_image : "");
    let ogUrl = "";
    if (og && og[2].length < 2_000_000) { const ogFile = `${id}-${rev}-card.${og[1] === "png" ? "png" : "jpg"}`; await fsp.writeFile(path.join(generatedDir, ogFile), Buffer.from(og[2], "base64")); ogUrl = `${baseUrl()}/generated/${ogFile}`; }
    const split = splitInlineImages(html, `${id}-${rev}`);
    let page = String(split);
    // No share image → drop the og:image tags instead of publishing an empty content="".
    if (!ogUrl) page = page.replace(/<meta property="og:image" content="__POD_OG_IMAGE__"\/>(<meta property="og:image:(?:width|height)" content="\d+"\/>)*/g, "").replace('content="summary_large_image"', 'content="summary"');
    page = page.replaceAll("__POD_INVITE_ID__", id).replaceAll("__POD_API_BASE__", baseUrl()).replaceAll("__POD_PAGE_URL__", `${baseUrl()}/generated/${file}`).replaceAll("__POD_OG_IMAGE__", ogUrl);
    await Promise.all(split.files.map(x => fsp.writeFile(path.join(generatedDir, x.name), x.buf)));
    await fsp.writeFile(path.join(generatedDir, file), page, "utf8");
    // Editable profile (photos point at the published files) so the couple can update the same URL later.
    let editable = null;
    try { const ps = splitInlineImages(JSON.stringify(profile || {}), `${id}-${rev}`, split.map); await Promise.all(ps.files.map(x => fsp.writeFile(path.join(generatedDir, x.name), x.buf))); editable = JSON.parse(String(ps)); } catch { editable = null; }
    const notify = String(profile?.rsvpEmail || "").trim().slice(0, 254);
    const now = new Date().toISOString();
    const meta = { ...(prev || {}), id, tenant_id: req.tenantId, user_id: req.user.id, created_at: prev?.created_at || now, updated_at: now, scene: String(profile?.sceneKey || "").slice(0, 40), names: String(profile?.names || "").slice(0, 200), date: String(profile?.date || "").slice(0, 40), status: "published", url: `/generated/${file}`,
      layout: String(profile?.layout || "classic").slice(0, 20), lang: ["zh", "en", "de"].includes(profile?.lang) ? profile.lang : "en", rsvp_mode: String(profile?.rsvpMode || "").slice(0, 20), rsvp_enabled: profile?.features?.rsvp !== false, notify_email: profile?.rsvpNotify === false ? "" : notify, og_image: ogUrl };
    await fsp.writeFile(path.join(generatedDir, `${id}.json`), JSON.stringify({ ...meta, profile: editable }, null, 2));
    if (prev) await updateRecord("invitations", id, meta); else await addRecord("invitations", meta);
    return { ok: true, id, url: `/generated/${file}`, updated: !!prev };
  }
  const publishErr = (res, e) => {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error("[invitations] publish failed:", e.message); return res.status(500).json({ error: "publish_failed" });
  };
  router.post("/api/invitations", needUser, inviteLimit, express.json({ limit: "15mb" }), ah(async (req, res) => {
    try { res.json(await writeInvitation(req, crypto.randomBytes(6).toString("hex"), null)); } catch (e) { publishErr(res, e); }
  }));
  // Update an existing site in place: same id/URL, RSVPs untouched.
  router.put("/api/invitations/:id", needUser, inviteLimit, express.json({ limit: "15mb" }), ah(async (req, res) => {
    try { const inv = await ownInvitation(req); res.json(await writeInvitation(req, inv.id, inv)); } catch (e) { publishErr(res, e); }
  }));
  // Same update, addressed as /api/invitations?id=… — that path is exempt from the app-wide 1 MB JSON parser, so newly added photos fit.
  router.put("/api/invitations", needUser, inviteLimit, express.json({ limit: "15mb" }), ah(async (req, res) => {
    req.params.id = String(req.query.id || "");
    try { const inv = await ownInvitation(req); res.json(await writeInvitation(req, inv.id, inv)); } catch (e) { publishErr(res, e); }
  }));
  // Builder "edit" loads the stored profile (owner only).
  router.get("/api/invitations/:id/edit", needUser, ah(async (req, res) => {
    const inv = await ownInvitation(req);
    const meta = JSON.parse(await fsp.readFile(path.join(generatedDir, `${inv.id}.json`), "utf8").catch(() => "{}"));
    res.json({ id: inv.id, url: inv.url, status: inv.status, profile: meta.profile || null });
  }));
  // Take the site offline (guests see a localized "offline" page, RSVP closed) or bring it back.
  for (const [action, status] of [["unpublish", "unpublished"], ["republish", "published"]]) router.post(`/api/invitations/:id/${action}`, needUser, ah(async (req, res) => {
    const inv = await ownInvitation(req);
    await updateRecord("invitations", inv.id, { status, updated_at: new Date().toISOString() });
    const mf = path.join(generatedDir, `${inv.id}.json`);
    const meta = JSON.parse(await fsp.readFile(mf, "utf8").catch(() => "{}"));
    await fsp.writeFile(mf, JSON.stringify({ ...meta, status }, null, 2));
    res.json({ ok: true, id: inv.id, status });
  }));
  // Built-in RSVP, posted by guests from the sandboxed (opaque-origin, "Origin: null") invitation page.
  // The page sends text/plain JSON (a CORS "simple" request, no preflight); responses allow any origin and carry no credentials.
  // Counted per invitation + IP, so many guests on one venue/home Wi-Fi are not blocked by each other's invitations.
  const rsvpLimit = invitationIpLimit({ windowMs: 10 * 60_000, max: Number(process.env.RSVP_PER_10_MIN || 30) });
  const rsvpCors = cors({ origin: "*", methods: ["POST", "OPTIONS"], allowedHeaders: ["Content-Type"], maxAge: 600 });
  router.options("/api/invitations/:id/rsvp", rsvpCors);
  router.post("/api/invitations/:id/rsvp", rsvpCors, rsvpLimit, express.text({ type: "text/plain", limit: "8kb" }), ah(async (req, res) => {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { return res.status(400).json({ error: "invalid_json" }); } }
    res.status(201).json(await submitRsvp(req.params.id, body));
  }));

  // User-generated pages run in a sandboxed (opaque) origin so they cannot read this site's storage or call admin APIs.
  // allow-downloads: the guest "add to calendar" (.ics) download. Pages are private links: never indexed.
  router.use("/generated", ah(async (req, res, next) => {
    if (req.path.endsWith(".json") || /(^|\/)\./.test(req.path)) return res.sendStatus(404); // metadata and private (dot) folders are internal
    res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    const m = /^\/([a-f0-9]{12})(?:\.html)?$/.exec(req.path);
    if (m) {
      res.setHeader("Cache-Control", "no-cache"); // updates and unpublish take effect immediately
      const inv = await findRecord("invitations", m[1]);
      if (inv && inv.status === "unpublished") return res.status(410).type("html").send(offlinePage(inv));
    }
    next();
  }), express.static(generatedDir, { extensions: ["html"], maxAge: "1h", dotfiles: "deny", setHeaders: (res, p) => { if (p.endsWith(".html")) res.setHeader("Cache-Control", "no-cache"); } }));

  router.get("/api/health", (req, res) => res.json({ ok: true, version: VERSION, tenant: req.tenantId, protocols: protocolRegistry().map(x => x.id) }));

  return router;
}

/** Per (invitation id, IP) fixed-window limiter for guest RSVPs. Same 429 shape as the shared rateLimit middleware. */
export function invitationIpLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset <= now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === "true") return next();
    const key = `${String(req.params.id || "").slice(0, 40)}|${req.ip}`, now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset <= now) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
    e.count += 1;
    res.setHeader("RateLimit-Limit", String(max)); res.setHeader("RateLimit-Remaining", String(Math.max(0, max - e.count)));
    if (e.count > max) { res.setHeader("Retry-After", String(Math.ceil((e.reset - now) / 1000))); return res.status(429).json({ error: "rate_limited", message: "Too many requests, please retry later." }); }
    next();
  };
}

/**
 * Moves embedded base64 photos (hero, gallery, card) out of the published HTML into /generated/<id>-<n>.<ext>,
 * so the page itself stays small. Identical data URLs share one file. Returns a String with .files to write.
 */
export function splitInlineImages(html, id, known) {
  const map = known || new Map(), files = [];
  const out = html.replace(/data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]{2000,})/g, (m, type, b64) => {
    if (!map.has(m)) {
      const name = `${id}-${files.length + 1}.${type === "jpeg" ? "jpg" : type}`;
      files.push({ name, buf: Buffer.from(b64, "base64") });
      map.set(m, `${baseUrl()}/generated/${name}`);
    }
    return map.get(m);
  });
  const res = new String(out); res.files = files; res.map = map; return res;
}

const ID_RE = /^[a-f0-9]{12}$/;
const OFFLINE = {
  en: ["This invitation is no longer online", "The couple has taken this page offline. Thank you for your interest."],
  zh: ["此邀请已下线", "新人已将此页面下线，感谢你的关注。"],
  de: ["Diese Einladung ist nicht mehr online", "Das Brautpaar hat diese Seite offline genommen. Danke für euer Interesse."],
};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** Minimal localized page for an unpublished invitation (all three languages, couple's default first). */
export function offlinePage(inv) {
  const first = OFFLINE[inv.lang] ? inv.lang : "en", order = [first, ...Object.keys(OFFLINE).filter(l => l !== first)];
  return `<!doctype html><html lang="${first === "zh" ? "zh-CN" : first}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/><title>${esc(OFFLINE[first][0])}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f1ec;color:#2b2622;font:17px/1.6 Georgia,"Times New Roman","PingFang SC","Microsoft YaHei",serif;text-align:center;padding:24px;box-sizing:border-box}main{max-width:520px}h1{font-weight:400;font-size:28px;margin:0 0 8px}p{margin:0 0 26px;color:#5c544c}b{display:block;font-weight:400;font-style:italic;font-size:22px;margin-bottom:28px}hr{border:0;border-top:1px solid #d9d1c7;width:60px;margin:0 auto 26px}</style></head>
<body><main>${inv.names ? `<b>${esc(inv.names)}</b>` : ""}${order.map((l, i) => `${i ? "<hr/>" : ""}<section lang="${l === "zh" ? "zh-CN" : l}"><h1>${esc(OFFLINE[l][0])}</h1><p>${esc(OFFLINE[l][1])}</p></section>`).join("")}</main></body></html>`;
}
