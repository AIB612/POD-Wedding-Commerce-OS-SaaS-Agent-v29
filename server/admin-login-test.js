// Admin username/password login: hashing, session cookie, logout, lockout, password change, API key still works.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-al-"));
const { hashPassword, verifyPassword } = await import("./admin-auth.js");
const PW = "correct horse battery staple 42";
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "s.json"),
  ADMIN_AUTH_PATH: path.join(tmp, "admin-auth.json"), ADMIN_PASSWORD_HASH: hashPassword(PW), APP_ENCRYPTION_KEY: "x".repeat(40) });
assert.ok(verifyPassword(PW, process.env.ADMIN_PASSWORD_HASH)); assert.ok(!verifyPassword("nope", process.env.ADMIN_PASSWORD_HASH));
assert.ok(!process.env.ADMIN_PASSWORD_HASH.includes(PW) && !process.env.ADMIN_PASSWORD_HASH.includes("$"));

const { createApp } = await import("./create-app.js");
const app = await createApp({ generatedDir: path.join(tmp, "gen") });
const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
const post = (u, body, headers = {}) => fetch(base + u, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const cookieOf = r => (r.headers.get("set-cookie") || "").split(";")[0];
try {
  for (const p of ["/admin/login", "/admin-login.html", "/admin"]) assert.equal((await fetch(base + p)).status, 200, p);
  assert.equal((await fetch(base + "/api/saas/orders")).status, 401);
  assert.equal((await fetch(base + "/api/saas/orders", { headers: { "x-admin-api-key": "k" } })).status, 200, "API key still works");

  let r = await post("/api/admin/login", { username: "admin", password: "wrong" }); assert.equal(r.status, 401); assert.ok(!r.headers.get("set-cookie"));
  r = await post("/api/admin/login", { username: "root", password: PW }); assert.equal(r.status, 401);
  r = await post("/api/admin/login", { username: "admin", password: PW }); assert.equal(r.status, 200);
  const sc = r.headers.get("set-cookie"); assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Strict/i);
  let c = cookieOf(r);
  assert.equal((await fetch(base + "/api/saas/orders", { headers: { cookie: c } })).status, 200, "session works");
  assert.equal((await fetch(base + "/api/saas/orders", { headers: { cookie: c, "x-admin-api-key": "wrong" } })).status, 200);
  assert.equal((await fetch(base + "/api/saas/fees", { method: "PUT", headers: { cookie: c, origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" })).status, 401, "cross-origin write rejected");
  const disk = fs.readFileSync(process.env.ADMIN_AUTH_PATH, "utf8"); assert.ok(!disk.includes(c.split("=")[1]), "only token hashes stored");
  assert.equal((fs.statSync(process.env.ADMIN_AUTH_PATH).mode & 0o777), 0o600);
  assert.equal((await (await fetch(base + "/api/admin/session", { headers: { cookie: c } })).json()).via, "session");

  // change password
  assert.equal((await post("/api/admin/password", { current_password: PW, new_password: "x".repeat(14) }, { "x-admin-api-key": "k" })).status, 401, "API key alone cannot change the password");
  assert.equal((await post("/api/admin/password", { current_password: "bad", new_password: "x".repeat(14) }, { cookie: c })).status, 400);
  assert.equal((await post("/api/admin/password", { current_password: PW, new_password: "short" }, { cookie: c })).status, 400);
  const NEW = "a brand new passphrase 2026";
  assert.equal((await post("/api/admin/password", { current_password: PW, new_password: NEW }, { cookie: c })).status, 200);
  assert.ok(!fs.readFileSync(process.env.ADMIN_AUTH_PATH, "utf8").includes(NEW));
  assert.equal((await post("/api/admin/login", { username: "admin", password: PW })).status, 401, "old password rejected");
  r = await post("/api/admin/login", { username: "admin", password: NEW }); assert.equal(r.status, 200);

  // logout
  c = cookieOf(r);
  assert.equal((await post("/api/admin/logout", {}, { cookie: c })).status, 200);
  assert.equal((await fetch(base + "/api/saas/orders", { headers: { cookie: c } })).status, 401, "session revoked after logout");

  // lockout after repeated failures (even the right password is refused while locked)
  for (let i = 0; i < 5; i++) await post("/api/admin/login", { username: "admin", password: "bad" + i });
  assert.equal((await post("/api/admin/login", { username: "admin", password: NEW })).status, 429);
  console.log(JSON.stringify({ admin_login: "pass" }));
} finally { server.close(); }
process.exit(0);
