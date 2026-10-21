// Quick login (Google / Shop): not-configured behaviour, state/nonce/PKCE checks, session cookie, logout + CSRF.
// Provider network calls are mocked (token exchange, discovery, JWKS); nothing leaves the process.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-auth-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
  APP_ENCRYPTION_KEY: "x".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com" });
const AUTH_KEYS = ["SESSION_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "SHOPIFY_SHOP_DOMAIN", "SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID", "SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET", "SHOPIFY_CUSTOMER_ACCOUNT_REDIRECT_URI"];
for (const k of AUTH_KEYS) delete process.env[k];

const { createApp } = await import("./create-app.js");
const svc = await import("./services/oauth-login-service.js");
const { findWhere, listForTenant } = await import("./saas-store.js");
const result = {};
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const host = `127.0.0.1:${server.address().port}`, base = `http://${host}`;
const realFetch = globalThis.fetch;
const get = (p, h = {}) => realFetch(base + p, { redirect: "manual", headers: h });
const cookieOf = (r, name) => (r.headers.getSetCookie?.() || []).find(c => c.startsWith(name + "="));
const val = c => c ? decodeURIComponent(c.split(";")[0].split("=").slice(1).join("=")) : "";

try {
  // 1. Not configured: buttons disabled, endpoints answer gracefully (no crash, no 500).
  let prov = await (await get("/api/auth/providers")).json();
  assert.deepEqual(prov, { google: { configured: false }, shop: { configured: false } });
  for (const p of ["google", "shop"]) {
    let r = await get(`/api/auth/${p}/start`, { Accept: "application/json" });
    assert.equal(r.status, 503); assert.equal((await r.json()).error, "not_configured");
    r = await get(`/api/auth/${p}/start`, { Accept: "text/html" });
    assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/?login_error=not_configured");
    r = await get(`/api/auth/${p}/callback?code=x&state=y`);
    assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/?login_error=not_configured");
  }
  process.env.NODE_ENV = "production"; process.env.GOOGLE_CLIENT_ID = "g"; process.env.GOOGLE_CLIENT_SECRET = "s";
  assert.equal(svc.providerStatus().google.configured, false, "production without SESSION_SECRET stays disabled");
  process.env.NODE_ENV = "test";
  result.not_configured = "pass";

  // 2. Configure both providers (Shop discovery mocked).
  Object.assign(process.env, { SESSION_SECRET: crypto.randomBytes(32).toString("hex"), GOOGLE_CLIENT_ID: "gid.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "gsecret",
    SHOPIFY_SHOP_DOMAIN: "demo-shop.myshopify.com", SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID: "shp-client" });
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u === "https://demo-shop.myshopify.com/.well-known/openid-configuration") return Response.json({ issuer: "https://shopify.com/authentication/123", authorization_endpoint: "https://shopify.com/authentication/123/oauth/authorize", token_endpoint: "https://shopify.com/authentication/123/oauth/token", jwks_uri: "https://shopify.com/authentication/123/.well-known/jwks.json", end_session_endpoint: "https://shopify.com/authentication/123/logout" });
    if (u.endsWith("jwks.json") || u === "https://www.googleapis.com/oauth2/v3/certs") return Response.json({ keys: [jwk] });
    return realFetch(url, opts);
  };
  prov = await (await get("/api/auth/providers")).json();
  assert.equal(prov.google.configured, true); assert.equal(prov.shop.configured, true);

  // 3. Start: redirect carries state, nonce, PKCE S256; state is sealed in an HttpOnly cookie; open redirects are neutralised.
  const starts = {};
  for (const p of ["google", "shop"]) {
    const r = await get(`/api/auth/${p}/start?return_to=${encodeURIComponent("/checkout.html?step=1")}`);
    assert.equal(r.status, 302);
    const loc = new URL(r.headers.get("location"));
    assert.equal(loc.origin, p === "google" ? "https://accounts.google.com" : "https://shopify.com");
    for (const k of ["state", "nonce", "code_challenge"]) assert.ok(loc.searchParams.get(k)?.length >= 32, k);
    assert.equal(loc.searchParams.get("code_challenge_method"), "S256");
    assert.equal(loc.searchParams.get("redirect_uri"), `https://shop.example.com/api/auth/${p}/callback`);
    assert.equal(loc.searchParams.get("scope"), p === "google" ? "openid email profile" : "openid email customer-account-api:full");
    const c = cookieOf(r, "pod_oauth");
    assert.match(c, /HttpOnly/i); assert.match(c, /SameSite=Lax/i); assert.match(c, /Secure/i); assert.match(c, /Path=\/api\/auth/);
    const st = svc.openState(val(c));
    assert.equal(st.state, loc.searchParams.get("state")); assert.equal(st.r, "/checkout.html?step=1");
    assert.equal(crypto.createHash("sha256").update(st.verifier).digest("base64url"), loc.searchParams.get("code_challenge"));
    starts[p] = { cookie: val(c), state: st.state, nonce: st.nonce, verifier: st.verifier };
  }
  for (const bad of ["//evil.com", "https://evil.com/x", "/\\evil.com", "javascript:alert(1)"]) assert.equal(svc.safeReturn(bad), "/");
  result.start_state_nonce_pkce = "pass";

  // 4. Callback state checks: missing cookie, wrong state, tampered cookie, cookie from the other provider → no session.
  const cb = (p, q, cookie) => get(`/api/auth/${p}/callback?${new URLSearchParams(q)}`, cookie ? { Cookie: `pod_oauth=${encodeURIComponent(cookie)}` } : {});
  const g = starts.google;
  for (const [q, cookie] of [[{ code: "c", state: g.state }, null], [{ code: "c", state: "wrong" }, g.cookie], [{ code: "c", state: g.state }, g.cookie.slice(0, -2) + "xx"], [{ code: "c", state: g.state }, starts.shop.cookie]]) {
    const r = await cb("google", q, cookie);
    assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/?login_error=invalid_state");
    assert.equal(cookieOf(r, "pod_session"), undefined);
  }
  const expired = svc.sealState({ p: "google", state: "s".repeat(32), nonce: "n", verifier: "v", r: "/", exp: Date.now() - 1 });
  assert.equal((await cb("google", { code: "c", state: "s".repeat(32) }, expired)).headers.get("location"), "/?login_error=invalid_state");
  result.callback_state_checks = "pass";

  // 5. Real ID-token verification (mocked JWKS): signature, iss, aud, exp, nonce.
  const jwt = (claims, key = privateKey) => { const h = Buffer.from(JSON.stringify({ alg: "RS256", kid: "k1", typ: "JWT" })).toString("base64url"), p = Buffer.from(JSON.stringify(claims)).toString("base64url"); return `${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key).toString("base64url")}`; };
  const t = Math.floor(Date.now() / 1000);
  const gClaims = n => ({ iss: "https://accounts.google.com", aud: process.env.GOOGLE_CLIENT_ID, sub: "g-123", email: "Anna@Example.com", email_verified: true, name: "Anna Muster", picture: "https://lh3.googleusercontent.com/a/x", iat: t, exp: t + 600, nonce: n });
  let exchanged = null;
  svc.hooks.exchangeCode = async (p, { code, verifier }) => { exchanged = { p, code, verifier }; return { id_token: p === "google" ? jwt(gClaims(starts.google.nonce)) : jwt({ iss: "https://shopify.com/authentication/123", aud: "shp-client", sub: "gid://shopify/Customer/9", email: "ben@example.com", iat: t, exp: t + 600, nonce: starts.shop.nonce }), access_token: "shcat_x" }; };
  svc.hooks.fetchShopProfile = async () => ({ firstName: "Ben", lastName: "Keller", emailAddress: { emailAddress: "ben@example.com" }, defaultAddress: { firstName: "Ben", lastName: "Keller", address1: "Bahnhofstrasse 1", city: "Zürich", zip: "8001", territoryCode: "CH", phoneNumber: "+41790000000" } });
  const v = (claims, nonce) => svc.hooks.verifyIdToken("google", jwt(claims), { nonce });
  await assert.rejects(v(gClaims("other"), "mine"), /invalid_nonce/);
  await assert.rejects(v({ ...gClaims("n"), aud: "someone-else" }, "n"), /invalid_audience/);
  await assert.rejects(v({ ...gClaims("n"), iss: "https://evil.example" }, "n"), /invalid_issuer/);
  await assert.rejects(v({ ...gClaims("n"), exp: t - 3600 }, "n"), /id_token_expired/);
  await assert.rejects(svc.hooks.verifyIdToken("google", jwt(gClaims("n"), crypto.generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey), { nonce: "n" }), /invalid_id_token/);
  assert.equal((await v(gClaims("n"), "n")).sub, "g-123");
  result.id_token_verification = "pass";

  // 6. Successful Google callback: account auto-created, session cookie HttpOnly+Secure+Lax, return path honoured.
  let r = await cb("google", { code: "auth-code-1", state: g.state }, g.cookie);
  assert.equal(r.status, 302); assert.equal(r.headers.get("location"), "/checkout.html?step=1&signed_in=google");
  assert.deepEqual(exchanged, { p: "google", code: "auth-code-1", verifier: g.verifier });
  const sc = cookieOf(r, "pod_session");
  assert.match(sc, /HttpOnly/i); assert.match(sc, /Secure/i); assert.match(sc, /SameSite=Lax/i);
  const session = val(sc), auth = { Cookie: `pod_session=${encodeURIComponent(session)}` };
  let me = await (await get("/api/auth/me", auth)).json();
  assert.equal(me.authenticated, true); assert.equal(me.user.email, "anna@example.com"); assert.equal(me.user.name, "Anna Muster"); assert.deepEqual(me.user.providers, ["google"]);
  const acct = await findWhere("customer_accounts", x => x.email === "anna@example.com");
  assert.equal(acct.identities.google.sub, "g-123"); assert.equal(acct.password_hash, undefined);
  assert.ok((await listForTenant("customers", "tenant_demo")).some(c => c.user_id === acct.id), "CRM customer linked");
  // Same Google account again → same user, no duplicate.
  const s2 = await svc.startLogin("google", { returnTo: "/" });
  starts.google = { ...svc.openState(s2.cookie), cookie: s2.cookie };
  r = await cb("google", { code: "c2", state: starts.google.state }, s2.cookie);
  assert.equal(r.headers.get("location"), "/?signed_in=google");
  assert.equal((await listForTenant("customer_accounts", "tenant_demo")).filter(x => x.email === "anna@example.com").length, 1);
  result.google_login_session = "pass";

  // 7. Shop callback (PKCE) + checkout prefill from the Customer Account API profile.
  const sh = starts.shop;
  r = await cb("shop", { code: "shop-code", state: sh.state }, sh.cookie);
  assert.equal(r.headers.get("location"), "/checkout.html?step=1&signed_in=shop");
  assert.equal(exchanged.verifier, sh.verifier);
  const shopAuth = { Cookie: `pod_session=${encodeURIComponent(val(cookieOf(r, "pod_session")))}` };
  const prof = await (await get("/api/account/profile", shopAuth)).json();
  assert.equal(prof.email, "ben@example.com"); assert.equal(prof.name, "Ben Keller");
  assert.deepEqual(prof.shipping_address, { name: "Ben Keller", address1: "Bahnhofstrasse 1", address2: "", city: "Zürich", postal_code: "8001", country: "CH", phone: "+41790000000" });
  assert.equal((await get("/api/account/profile")).status, 401);
  // Provider denial
  const s3 = await svc.startLogin("shop", {}); const st3 = svc.openState(s3.cookie);
  assert.equal((await cb("shop", { error: "access_denied", state: st3.state }, s3.cookie)).headers.get("location"), "/?login_error=access_denied");
  result.shop_login_prefill = "pass";

  // 8. Logout: cross-site request rejected (CSRF), same-origin logs out and invalidates the session server-side.
  const post = (h) => realFetch(base + "/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json", ...auth, ...h } });
  assert.equal((await post({ Origin: "https://evil.example" })).status, 403);
  assert.equal((await post({ "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await (await get("/api/auth/me", auth)).json()).authenticated, true);
  r = await post({ Origin: base, "Sec-Fetch-Site": "same-origin" });
  assert.equal(r.status, 200); assert.match(cookieOf(r, "pod_session"), /Expires=Thu, 01 Jan 1970/);
  me = await (await get("/api/auth/me", auth)).json();
  assert.equal(me.authenticated, false, "old token no longer valid");
  result.logout = "pass";

  // 9. Front-end assets are served and wired.
  for (const f of ["/account-auth.js", "/checkout.html", "/", "/studio.html"]) assert.equal((await get(f)).status, 200, f);
  const js = await (await get("/account-auth.js")).text();
  assert.match(js, /\/api\/auth\/\$\{p\}\/start/); assert.match(js, /auth\.notConfigured/);
  assert.match(await (await get("/checkout.html")).text(), /co\.fasterTitle/);
  result.frontend_wiring = "pass";
} finally {
  globalThis.fetch = realFetch;
  server.close();
}
console.log(JSON.stringify(result, null, 2));
