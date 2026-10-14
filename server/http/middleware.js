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
  next();
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

export function notFound(req, res) {
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
