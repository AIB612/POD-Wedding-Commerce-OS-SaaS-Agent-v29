// Shared HTTP helpers: async error forwarding, security headers, rate limiting, error handler.

/** Wrap an async route so rejected promises reach Express' error handler
 *  (Express 4 does not catch them, and an unhandled rejection kills Node). */
export const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Conservative security headers that do not change page behaviour. */
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // HSTS only on HTTPS (behind the hosting proxy: X-Forwarded-Proto / X-Forwarded-SSL); never on plain HTTP or localhost.
  if (isHttps(req)) res.setHeader("Strict-Transport-Security", "max-age=31536000");
  // Enforced CSP: only directives that cannot break page content (same framing rule as X-Frame-Options, no <base> hijack,
  // no plugins). Shopify embedded pages replace it with their own frame-ancestors (shop admin) in setEmbeddedFrameHeaders.
  res.setHeader("Content-Security-Policy", CSP_ENFORCED);
  // Full policy in Report-Only first: violations are reported to /api/csp-report and nothing is blocked.
  if (process.env.CSP_REPORT_ONLY !== "off") res.setHeader("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  next();
}
export const CSP_ENFORCED = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'";
export const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://*.google-analytics.com https://cdn.shopify.com https://*.paypal.com https://*.paypalobjects.com",
  "style-src 'self' 'unsafe-inline' https://cdn.shopify.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://cdn.shopify.com",
  "connect-src 'self' https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://*.shopify.com https://*.myshopify.com https://*.paypal.com",
  "frame-src 'self' https://*.paypal.com https://www.google.com https://maps.google.com",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "form-action 'self' https://*.paypal.com https://accounts.google.com https://*.myshopify.com https://admin.shopify.com",
  "base-uri 'self'", "object-src 'none'",
  "report-uri /api/csp-report"
].join("; ");

// CSP violation reports (Report-Only phase): log each distinct violation once per process, never the full URL query.
const cspSeen = new Map();
export function cspReport(req, res) {
  const r = req.body?.["csp-report"] || (Array.isArray(req.body) ? req.body[0]?.body : null) || {};
  const dir = String(r["effective-directive"] || r.effectiveDirective || r["violated-directive"] || "?").slice(0, 60);
  const blocked = String(r["blocked-uri"] || r.blockedURL || "?").replace(/[?#].*$/, "").slice(0, 160);
  const page = String(r["document-uri"] || r.documentURL || "?").replace(/[?#].*$/, "").slice(0, 160);
  const key = `${dir} ${blocked}`;
  if (!cspSeen.has(key) && cspSeen.size < 500) { cspSeen.set(key, 1); console.warn(`[csp-report-only] ${dir} blocked ${blocked} on ${page}`); }
  else if (cspSeen.has(key)) cspSeen.set(key, cspSeen.get(key) + 1);
  res.status(204).end();
}
export const cspReportSummary = () => [...cspSeen].map(([k, n]) => ({ violation: k, count: n }));

export function isHttps(req) {
  if (req.secure) return true;
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  return proto === "https" || String(req.headers["x-forwarded-ssl"] || "").toLowerCase() === "on" || String(req.headers["front-end-https"] || "").toLowerCase() === "on";
}

/** Small in-memory fixed-window rate limiter (per IP + bucket).
 *  Good enough for a single instance; use Redis/edge limits when scaling out. */
export function rateLimit({ windowMs = 60_000, max = 60, bucket = "default" } = {}) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();
  return (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === "true") return next();
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) { entry = { count: 0, reset: now + windowMs }; hits.set(key, entry); }
    entry.count += 1;
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: "rate_limited", message: "Too many requests, please retry later." });
    }
    next();
  };
}

/** Parse a raw webhook body safely. Returns null on invalid JSON. */
export function parseJsonBuffer(buf) {
  try { return JSON.parse(Buffer.isBuffer(buf) ? buf.toString("utf8") || "{}" : "{}"); } catch { return null; }
}

// API / machine paths keep the JSON 404; browsers asking for a page get a small friendly HTML page instead.
const MACHINE_PATH = /^\/(api|shopify-agent|shopify|pod-agent|webhooks|generated|apps\/|\.well-known)(\/|$)|\.(json|js|mjs|css|map|txt|xml|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|pdf|zip|env)$/i;
const PODAI_HOSTS = new Set(["podai.swisspro.site", "www.podai.swisspro.site"]);
function notFoundPage(req) {
  const podai = PODAI_HOSTS.has(String(req.hostname || "").toLowerCase());
  const brand = podai ? "Pod.AI" : "POD.AI";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Page not found · ${brand}</title><link rel="icon" href="/favicon.svg?v=20261109f" type="image/svg+xml">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#faf7f2;color:#1f1d1a;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-align:center;padding:24px}
main{max-width:460px}h1{font-size:28px;margin:0 0 8px}p{color:#5d574f;margin:0 0 6px}.code{font-size:14px;letter-spacing:.2em;color:#9a8f80;margin-bottom:14px}
a.btn{display:inline-block;margin-top:18px;padding:11px 22px;border-radius:999px;background:#1f1d1a;color:#fff;text-decoration:none;font-weight:600}footer{margin-top:36px;font-size:12px;color:#9a8f80}</style></head>
<body><main><div class="code">404</div><h1>Page not found</h1><p>The page you are looking for doesn't exist or has moved.</p>
<p lang="de">Diese Seite gibt es nicht (mehr).</p><p lang="zh">页面不存在或已移动。</p>
<a class="btn" href="/">${podai ? "Go to Pod.AI" : "Back to the shop"}</a><footer>© 2026 POD.AI</footer></main></body></html>`;
}
export function notFound(req, res) {
  const wantsHtml = (req.method === "GET" || req.method === "HEAD") && !MACHINE_PATH.test(req.path) && req.accepts(["json", "html"]) === "html";
  if (wantsHtml) return res.status(404).type("html").setHeader("Cache-Control", "no-store").send(notFoundPage(req));
  res.status(404).json({ error: "not_found" });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "payload_too_large" });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "invalid_json" });
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status >= 500 && !err.expose) console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return;
  if (status < 500 || err.expose) {
    return res.status(status).json({ error: err.code || err.message || "request_failed", ...(err.message && err.message !== err.code ? { message: err.message } : {}) });
  }
  res.status(status).json({ error: "internal_error", ...(process.env.NODE_ENV !== "production" ? { detail: err?.message } : {}) });
}

/** Error with an HTTP status, for services to throw. */
export class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; this.expose = true; }
}
