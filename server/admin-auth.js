// Admin username/password login with an HttpOnly session cookie.
// The password is only ever stored as a scrypt hash: ADMIN_PASSWORD_HASH in .env (initial default),
// overridden by data/admin-auth.json once changed in the admin. Sessions are stored as SHA-256 hashes.
// ADMIN_API_KEY (x-admin-api-key header) keeps working for scripts and APIs.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const ADMIN_COOKIE = "wcos_admin";
const SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_HOURS || 12) * 3600_000;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const isProd = () => process.env.NODE_ENV === "production";
const authFile = () => process.env.ADMIN_AUTH_PATH || path.resolve("data", "admin-auth.json");
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex");

/** "scrypt:N:r:p:saltHex:hashHex" (no "$", so .env loaders never expand it). */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("hex"), h.toString("hex")].join(":");
}
export function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hex] = parts, want = Buffer.from(hex, "hex");
  try {
    const got = crypto.scryptSync(String(password), Buffer.from(salt, "hex"), want.length, { N: +N, r: +r, p: +p, maxmem: 256 * 1024 * 1024 });
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  } catch { return false; }
}

let state = null; // { username, password_hash, sessions: { [sha]: { exp, created_at } } }
function load() {
  if (state) return state;
  let disk = {};
  try { disk = JSON.parse(fs.readFileSync(authFile(), "utf8")); } catch {}
  state = { username: disk.username || process.env.ADMIN_USERNAME || "admin", password_hash: disk.password_hash || "", sessions: disk.sessions || {}, changed_at: disk.changed_at || null };
  return state;
}
function save() {
  const f = authFile(), tmp = `${f}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(tmp, f); fs.chmodSync(f, 0o600);
  } catch (e) { console.error("[admin-auth] save failed:", e.message); }
}
const currentHash = () => load().password_hash || process.env.ADMIN_PASSWORD_HASH || "";
export const loginConfigured = () => !!currentHash();
export function _resetForTests() { state = null; }

function prune() { const now = Date.now(); for (const [k, v] of Object.entries(load().sessions)) if (v.exp <= now) delete state.sessions[k]; }

function cookieValue(req, name) {
  for (const part of String(req.headers?.cookie || "").split(";")) { const i = part.indexOf("="); if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); }
  return "";
}
function setCookie(res, value, maxAge) {
  res.cookie(ADMIN_COOKIE, value, { httpOnly: true, secure: isProd() || process.env.ADMIN_COOKIE_SECURE === "true", sameSite: "strict", path: "/", maxAge });
}

/** Cross-site requests are rejected for cookie auth (SameSite=Strict plus an Origin/Referer check on writes). */
function sameOrigin(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const src = req.get("origin") || req.get("referer");
  if (!src) return true;
  try { return new URL(src).host === req.get("host"); } catch { return false; }
}

/** True when the request carries a valid, unexpired admin session cookie. */
export function hasAdminSession(req) {
  const t = cookieValue(req, ADMIN_COOKIE);
  if (!t || t.length > 200) return false;
  const s = load().sessions[sha(t)];
  if (!s || s.exp <= Date.now()) return false;
  return sameOrigin(req);
}

// Brute-force protection: per-IP and per-username failure windows, plus a global ceiling.
const fails = new Map();
const WINDOW = 15 * 60_000, MAX_IP = 5, MAX_USER = 10, MAX_GLOBAL = 50;
function failCount(key) { const e = fails.get(key); return e && e.reset > Date.now() ? e.count : 0; }
function addFail(key) { const now = Date.now(); let e = fails.get(key); if (!e || e.reset <= now) { e = { count: 0, reset: now + WINDOW }; fails.set(key, e); } e.count++; }
setInterval(() => { const now = Date.now(); for (const [k, v] of fails) if (v.reset <= now) fails.delete(k); }, 60_000).unref();
// Behind the hosting proxy (no TRUST_PROXY) every peer is local: use the proxy-appended (last) X-Forwarded-For entry.
const isLocalIp = ip => /^(::1|127\.|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd)/.test(ip || "");
const ipOf = req => { if (req.app?.get("trust proxy")) return String(req.ip || ""); const peer = String(req.socket?.remoteAddress || "");
  if (!isLocalIp(peer)) return peer; const xff = String(req.headers["x-forwarded-for"] || "").split(",").map(x => x.trim()).filter(Boolean); return xff[xff.length - 1] || peer; };
function locked(req, user) {
  return failCount("ip:" + ipOf(req)) >= MAX_IP || failCount("user:" + user) >= MAX_USER || failCount("global") >= MAX_GLOBAL;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export function adminAuthRoutes(router, { apiKeyOk }) {
  router.post("/api/admin/login", async (req, res) => {
    const username = String(req.body?.username || "").trim().toLowerCase().slice(0, 64);
    const password = String(req.body?.password || "").slice(0, 256);
    if (!loginConfigured()) return res.status(503).json({ error: "login_not_configured" });
    if (!sameOrigin(req)) return res.status(403).json({ error: "bad_origin" });
    if (locked(req, username)) { res.setHeader("Retry-After", String(WINDOW / 1000)); return res.status(429).json({ error: "too_many_attempts", message: "Too many failed attempts. Try again in 15 minutes." }); }
    const okUser = username === load().username.toLowerCase();
    const okPass = verifyPassword(password, currentHash()); // always run scrypt (no user enumeration by timing)
    if (!okUser || !okPass) {
      addFail("ip:" + ipOf(req)); addFail("user:" + username); addFail("global");
      await sleep(400 + Math.floor(Math.random() * 300));
      return res.status(401).json({ error: "invalid_credentials", message: "Wrong username or password." });
    }
    fails.delete("ip:" + ipOf(req)); fails.delete("user:" + username);
    prune();
    const token = crypto.randomBytes(32).toString("base64url");
    state.sessions[sha(token)] = { exp: Date.now() + SESSION_TTL_MS, created_at: new Date().toISOString() };
    save();
    setCookie(res, token, SESSION_TTL_MS);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, username: state.username, expires_in_seconds: SESSION_TTL_MS / 1000 });
  });

  router.post("/api/admin/logout", (req, res) => {
    const t = cookieValue(req, ADMIN_COOKIE);
    if (t && load().sessions[sha(t)]) { delete state.sessions[sha(t)]; save(); }
    res.clearCookie(ADMIN_COOKIE, { httpOnly: true, secure: isProd() || process.env.ADMIN_COOKIE_SECURE === "true", sameSite: "strict", path: "/" });
    res.json({ ok: true });
  });

  router.get("/api/admin/session", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = hasAdminSession(req);
    res.json({ authenticated: session || apiKeyOk(req), via: session ? "session" : apiKeyOk(req) ? "api_key" : null, username: session ? load().username : null, login_configured: loginConfigured() });
  });

  router.post("/api/admin/password", async (req, res) => {
    if (!hasAdminSession(req)) return res.status(401).json({ error: "admin_login_required", message: "Sign in with username and password first." });
    const current = String(req.body?.current_password || ""), next = String(req.body?.new_password || "");
    if (locked(req, "password-change")) return res.status(429).json({ error: "too_many_attempts" });
    if (!verifyPassword(current, currentHash())) { addFail("ip:" + ipOf(req)); addFail("user:password-change"); await sleep(400); return res.status(400).json({ error: "wrong_current_password", message: "Current password is wrong." }); }
    if (next.length < 12 || next.length > 200) return res.status(400).json({ error: "weak_password", message: "New password must be at least 12 characters." });
    if (next === current) return res.status(400).json({ error: "same_password", message: "New password must differ from the current one." });
    load().password_hash = hashPassword(next); state.changed_at = new Date().toISOString();
    // Sign out every other session; keep this one.
    const keep = sha(cookieValue(req, ADMIN_COOKIE));
    state.sessions = { [keep]: state.sessions[keep] };
    save();
    res.json({ ok: true });
  });
}
