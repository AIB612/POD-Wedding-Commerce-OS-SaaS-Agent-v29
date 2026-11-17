// Public billing routes (Paddle). Mounted before express.json (the webhook needs the raw body).
//   GET  /billing/checkout?_ptxn=txn_…   Pod.AI checkout page: Paddle.js overlay for a transaction created by the plugin
//   POST /billing/paddle/webhook         Paddle notifications (Paddle-Signature verified) → plan on the store record
import express from "express";
import * as paddle from "./paddle.js";
import { applyPaddleEvent, checkoutRecord } from "../woo-agent/billing.js";
import { rateLimit } from "../http/middleware.js";

const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function billingRouter() {
  const r = express.Router();
  r.post("/billing/paddle/webhook", rateLimit({ bucket: "paddle-webhook", windowMs: 60_000, max: 300 }), express.raw({ type: () => true, limit: "1mb" }), ah(async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!paddle.verifySignature(raw, req.get("paddle-signature"))) return res.status(401).json({ error: "invalid_signature" });
    let event; try { event = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "invalid_json" }); }
    const out = await applyPaddleEvent(event);
    res.json({ ok: true, ...(out.ignored ? { ignored: out.ignored } : {}) });
  }));
  r.get("/billing/checkout", rateLimit({ bucket: "paddle-checkout", windowMs: 60_000, max: 30 }), ah(async (req, res) => {
    const cfg = paddle.config(), rec = await checkoutRecord(req.query._ptxn);
    res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" });
    res.removeHeader("Content-Security-Policy-Report-Only");
    if (!cfg.enabled || !rec) return res.status(cfg.enabled ? 404 : 503).type("html").send(page("Checkout unavailable", `<p>${cfg.enabled ? "This checkout link is not valid or has expired. Start again from Pod.AI Chat → Settings in your WordPress admin." : "Paid plans are not on sale yet."}</p>`));
    const opts = { transactionId: rec.id, ...(rec.email ? { customer: { email: rec.email } } : {}), settings: { displayMode: "overlay", theme: "light", ...(rec.return_url ? { successUrl: rec.return_url } : {}) } };
    res.type("html").send(page("Pod.AI — upgrade your plan", `<p>Secure checkout by Paddle, our merchant of record (invoices and VAT included). Paid plans start with a ${paddle.TRIAL_DAYS}-day free trial; cancel any time.</p>
<p><button id="go" type="button">Open checkout</button></p>${rec.return_url ? `<p><a href="${esc(rec.return_url)}">Back to WordPress</a></p>` : ""}
<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
<script>(function(){var o=${JSON.stringify(opts).replace(/</g, "\\u003c")};${cfg.env === "sandbox" ? 'Paddle.Environment.set("sandbox");' : ""}
Paddle.Initialize({token:${JSON.stringify(process.env.PADDLE_CLIENT_TOKEN || "")}});function go(){Paddle.Checkout.open(o)}document.getElementById("go").onclick=go;go();})();</script>`));
  }));
  return r;
}
function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf7f2;color:#1f1d1a;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center;padding:24px}main{max-width:520px}h1{font-size:26px}button{padding:11px 22px;border-radius:999px;border:0;background:#1f1d1a;color:#fff;font-weight:600;cursor:pointer}a{color:#5d574f}</style></head>
<body><main><h1>${esc(title)}</h1>${body}<footer style="margin-top:32px;font-size:12px;color:#9a8f80">© 2026 POD.AI</footer></main></body></html>`;
}
