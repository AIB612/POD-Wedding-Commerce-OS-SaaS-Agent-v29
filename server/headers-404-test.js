// Friendly HTML 404 for pages (JSON 404 for API / files), public /api/health without version, CSP headers, CSP report endpoint.
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true" });
delete process.env.STORE_PERSIST_PATH;
const { createApp } = await import("./create-app.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-hdr-"));
const app = await createApp({ generatedDir: tmp }); const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
const HTML = { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };
const result = {};
try {
  let r = await fetch(base + "/does-not-exist", { headers: HTML }); assert.equal(r.status, 404); assert.match(r.headers.get("content-type"), /text\/html/);
  const page = await r.text(); assert.match(page, /Page not found/); assert.match(page, /© 2026 POD\.AI/); assert.match(page, /noindex/); assert.ok(!/@gmail|Chenxue|Branny/i.test(page));
  for (const p of ["/api/nope", "/shopify-agent/nope", "/.env", "/server/app.js", "/missing.js", "/missing.png"]) {
    r = await fetch(base + p, { headers: HTML }); assert.equal(r.status, 404, p); assert.match(r.headers.get("content-type"), /json/, p); assert.deepEqual(await r.json(), { error: "not_found" }, p);
  }
  r = await fetch(base + "/does-not-exist"); assert.equal(r.status, 404); assert.match(r.headers.get("content-type"), /json/, "non-browser clients keep JSON");
  result.not_found = "pass";
  r = await fetch(base + "/api/health"); assert.deepEqual(await r.json(), { ok: true }, "public health: no version / tenant");
  r = await fetch(base + "/api/health", { headers: { "x-admin-api-key": "k" } }); const h = await r.json(); assert.ok(h.ok && h.version, "admins still see the version");
  result.health = "pass";
  for (const p of ["/", "/studio.html", "/agent.html", "/checkout.html", "/privacy"]) {
    r = await fetch(base + p); assert.equal(r.status, 200, p);
    assert.equal(r.headers.get("content-security-policy"), "frame-ancestors 'self'; base-uri 'self'; object-src 'none'", p);
    const ro = r.headers.get("content-security-policy-report-only") || "";
    for (const need of ["https://www.googletagmanager.com", "https://*.google-analytics.com", "https://*.paypal.com", "https://accounts.google.com", "report-uri /api/csp-report"]) assert.ok(ro.includes(need), `${p} report-only has ${need}`);
    assert.equal(r.headers.get("x-frame-options"), "SAMEORIGIN");
  }
  r = await fetch(base + "/api/csp-report", { method: "POST", headers: { "Content-Type": "application/csp-report" }, body: JSON.stringify({ "csp-report": { "document-uri": "https://pod.swisspro.site/?x=1", "effective-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?q" } }) });
  assert.equal(r.status, 204);
  result.csp = "pass";
} finally { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, result }, null, 2));
