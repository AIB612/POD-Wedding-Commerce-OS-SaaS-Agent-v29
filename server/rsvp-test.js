// v30 built-in RSVP for published wedding sites: valid, invalid, not found, CORS from the sandboxed page, ownership, CSV, rate limit.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-rsvp-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "false", RSVP_PER_10_MIN: "14", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
  APP_ENCRYPTION_KEY: "x".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com", CORS_ORIGINS: "https://shop.example.com" });
for (const k of ["SENDGRID_API_KEY", "POSTMARK_SERVER_TOKEN"]) delete process.env[k];

const { createApp } = await import("./create-app.js");
const { listForTenant, flushStore } = await import("./saas-store.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}`;
const result = {};
const req = (p, { method = "GET", body, cookie, type = "application/json", origin } = {}) => fetch(base + p, { method, headers: { ...(body !== undefined ? { "Content-Type": type } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
async function account(email) {
  const r = await req("/api/auth/register", { method: "POST", body: { email, password: "ExamplePass123!", name: "Couple" } });
  assert.equal(r.status, 200);
  return r.headers.get("set-cookie").split(";")[0];
}
try {
  // Publish as a signed-in couple; placeholders are filled and the share card is stored.
  const cookie = await account(`couple-${Date.now()}@example.com`);
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const html = `<!doctype html><html><head><meta property="og:image" content="__POD_OG_IMAGE__"/></head><body><script>const INVITE_ID="__POD_INVITE_ID__",API_BASE="__POD_API_BASE__"</script>${"x".repeat(200)}</body></html>`;
  const inv = await (await req("/api/invitations", { method: "POST", cookie, body: { html, og_image: png, profile: { names: "Anna & Luca", date: "2027-06-12", layout: "editorial", rsvpEmail: "anna@example.com", features: { rsvp: true } } } })).json();
  assert.ok(inv.ok && /^[a-f0-9]{12}$/.test(inv.id));
  const page = await (await req(inv.url)).text();
  assert.ok(page.includes(`INVITE_ID="${inv.id}"`) && page.includes('API_BASE="https://shop.example.com"') && page.includes(`/generated/${inv.id}-card.png`));
  assert.equal((await req(`/generated/${inv.id}-card.png`)).status, 200);
  result.publish_placeholders = "pass";

  // 1. Valid RSVP from the sandboxed page (Origin: null, text/plain simple request) → 201 + CORS header despite CORS_ORIGINS
  let r = await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", origin: "null", type: "text/plain", body: JSON.stringify({ name: "  Marco   Rossi ", attending: "yes", party_size: 2, dietary: "Vegetarian" }) });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await r.json(), { ok: true, id: (await listForTenant("invitation_rsvps", "tenant_demo"))[0].id, attending: true, party_size: 2 });
  r = await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", body: { name: "Lea", attending: "no", party_size: 4 } });
  assert.equal(r.status, 201); assert.equal((await r.json()).party_size, 0, "declined guests count as 0");
  const stored = await listForTenant("invitation_rsvps", "tenant_demo");
  assert.equal(stored.length, 2); assert.equal(stored[0].name, "Marco Rossi");
  const mail = (await listForTenant("notifications", "tenant_demo")).find(n => n.related_id === inv.id);
  assert.equal(mail?.status, "not_configured", "notification recorded, no failure without e-mail provider");
  result.rsvp_valid = "pass";

  // 2. Invalid input → 400 with a specific code, nothing stored
  const bad = async (body, code, type) => { const x = await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", body, type }); assert.equal(x.status, 400, code); assert.equal((await x.json()).error, code); };
  await bad({ attending: "yes" }, "name_required");
  await bad({ name: "x".repeat(81), attending: "yes" }, "name_too_long");
  await bad({ name: "A", attending: "maybe" }, "attending_required");
  await bad({ name: "A", attending: "yes", party_size: 0 }, "invalid_party_size");
  await bad({ name: "A", attending: "yes", party_size: 11 }, "invalid_party_size");
  await bad({ name: "A", attending: "yes", party_size: 1.5 }, "invalid_party_size");
  await bad({ name: "A", attending: "yes", dietary: "d".repeat(301) }, "dietary_too_long");
  await bad({ name: "Bot", attending: "yes", website: "http://spam" }, "invalid_body");
  await bad("{not json", "invalid_json", "text/plain");
  assert.equal((await listForTenant("invitation_rsvps", "tenant_demo")).length, 2);
  r = await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", type: "text/plain", body: JSON.stringify({ name: "A", attending: "yes", dietary: "d".repeat(9000) }) });
  assert.equal(r.status, 413, "body size is capped");
  result.rsvp_invalid = "pass";

  // 3. Unknown / malformed invitation → 404
  r = await req("/api/invitations/abcdefabcdef/rsvp", { method: "POST", body: { name: "A", attending: "yes" } });
  assert.equal(r.status, 404); assert.equal((await r.json()).error, "invitation_not_found");
  assert.equal((await req("/api/invitations/..%2Fx/rsvp", { method: "POST", body: { name: "A", attending: "yes" } })).status, 404);
  result.rsvp_not_found = "pass";

  // 4. Couple sees list, counts and CSV; other users and anonymous visitors do not
  assert.equal((await req(`/api/account/invitations/${inv.id}/rsvps`)).status, 401);
  const other = await account(`other-${Date.now()}@example.com`);
  assert.equal((await req(`/api/account/invitations/${inv.id}/rsvps`, { cookie: other })).status, 404);
  const list = await (await req(`/api/account/invitations/${inv.id}/rsvps`, { cookie })).json();
  assert.deepEqual(list.counts, { responses: 2, attending: 1, declined: 1, guests: 2 });
  assert.ok(!("tenant_id" in list.rsvps[0]));
  r = await req(`/api/account/invitations/${inv.id}/rsvps.csv`, { cookie });
  assert.match(r.headers.get("content-type"), /text\/csv/);
  const csv = await r.text();
  assert.ok(csv.includes("name,attending,party_size,dietary,created_at") && csv.includes("Marco Rossi,yes,2,Vegetarian"));
  const dash = await (await req("/api/account/dashboard", { cookie })).json();
  assert.equal(dash.invitations[0].id, inv.id);
  result.account_rsvp_list = "pass";

  // 5. Rate limit per IP (RSVP_PER_10_MIN=14; the 14 requests above already counted, so the bucket is exhausted)
  r = await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", body: { name: "Late", attending: "yes" } });
  assert.equal(r.status, 429); assert.ok(r.headers.get("retry-after"));
  result.rsvp_rate_limit = "pass";
  await flushStore();
} finally {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log("rsvp-test passed", JSON.stringify(result));
