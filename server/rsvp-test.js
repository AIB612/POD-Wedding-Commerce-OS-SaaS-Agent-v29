// v30 built-in RSVP for published wedding sites: valid, invalid, not found, CORS from the sandboxed page, ownership, CSV, rate limit.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-rsvp-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "false", RSVP_PER_10_MIN: "19", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
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

  // 1b. Publish splits embedded photos into files; missing share image drops og:image tags.
  const photo = "data:image/jpeg;base64," + Buffer.alloc(3000, 7).toString("base64");
  const html2 = `<!doctype html><html><head><meta property="og:image" content="__POD_OG_IMAGE__"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta name="twitter:card" content="summary_large_image"/></head><body><style>.h{background:url("${photo}")}</style><img src="${photo}"/>${"x".repeat(200)}</body></html>`;
  const inv3 = await (await req("/api/invitations", { method: "POST", cookie, body: { html: html2, profile: { names: "Split" } } })).json();
  const page3 = await (await req(inv3.url)).text();
  assert.ok(!page3.includes("base64") && page3.includes(`https://shop.example.com/generated/${inv3.id}-1.jpg`) && !page3.includes(`${inv3.id}-2.`), "deduped external file");
  assert.ok(!page3.includes("og:image") && page3.includes('content="summary"'), "og:image dropped when no share card");
  const img = Buffer.from(await (await req(`/generated/${inv3.id}-1.jpg`)).arrayBuffer());
  assert.equal(img.length, 3000);
  result.publish_split_images = "pass";

  // 1c. Generator helpers from index.html: initials, guest error strings in all languages.
  const indexSrc = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const initials = new Function(indexSrc.match(/function weddingInitials\(names\)\{.*\}/)[0] + "; return weddingInitials;")();
  assert.equal(initials("Maximiliane-Alexandra & Jean-Christophe"), "M&J");
  assert.equal(initials("Sandra and Fernando"), "S&F");
  assert.equal(initials("Gundula und Sigmund"), "G&S");
  assert.equal(initials("王小明和李华"), "王&李");
  assert.equal(initials("Anna + Luca"), "A&L");
  assert.equal(initials(""), "♥");
  const i18n = new Function("return " + indexSrc.match(/const WEDDING_INVITE_I18N=(\{[\s\S]*?\n\});/)[1])();
  for (const l of ["en", "zh", "de"]) for (const k of ["err_contact", "err_rate", "err_offline", "err_long", "ey_count", "ey_day", "ey_venue", "ey_story", "title"]) assert.ok(i18n[l][k], `${l}.${k}`);
  result.generator_helpers = "pass";

  // 1. Valid RSVP from the sandboxed page (Origin: null, text/plain simple request) → 201 + CORS header despite CORS_ORIGINS
  let r = await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", origin: "null", type: "text/plain", body: JSON.stringify({ name: "  Marco   Rossi ", attending: "yes", party_size: 2, dietary: "Vegetarian" }) });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await r.json(), { ok: true, id: (await listForTenant("invitation_rsvps", "tenant_demo"))[0].id, attending: true, party_size: 2, updated: false });
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
  await bad({ name: "A", attending: "yes", contact: "not-a-contact" }, "invalid_contact");
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

  // 3b. Guests can update: same normalized name + same (optional) contact overwrites; a different contact is a different guest.
  const first = await (await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", body: { name: "Giulia Bianchi", attending: "yes", party_size: 2, contact: "Giulia@Example.com" } })).json();
  assert.equal(first.updated, false, "create");
  r = await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", origin: "null", type: "text/plain", body: JSON.stringify({ name: "  giulia   BIANCHI", attending: "no", contact: "giulia@example.com", dietary: "Sorry" }) });
  assert.equal(r.status, 201);
  const upd = await r.json();
  assert.equal(upd.updated, true, "update overwrites"); assert.equal(upd.id, first.id); assert.equal(upd.party_size, 0);
  let giulia = (await listForTenant("invitation_rsvps", "tenant_demo")).filter(x => /giulia/i.test(x.name));
  assert.equal(giulia.length, 1, "no duplicate row"); assert.equal(giulia[0].attending, false); assert.ok(giulia[0].updated_at >= giulia[0].created_at);
  const other2 = await (await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", body: { name: "Giulia Bianchi", attending: "yes", contact: "+41 79 000 00 00" } })).json();
  assert.equal(other2.updated, false, "same name, different contact = different guest");
  r = await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", body: { name: "Giulia Bianchi", attending: "yes", party_size: 3, contact: "+41790000000" } });
  assert.equal((await r.json()).updated, true, "phone matched by digits");
  giulia = (await listForTenant("invitation_rsvps", "tenant_demo")).filter(x => /giulia/i.test(x.name));
  assert.equal(giulia.length, 2);
  result.rsvp_update = "pass";

  // 4. Couple sees list, counts and CSV; other users and anonymous visitors do not
  assert.equal((await req(`/api/account/invitations/${inv.id}/rsvps`)).status, 401);
  const other = await account(`other-${Date.now()}@example.com`);
  assert.equal((await req(`/api/account/invitations/${inv.id}/rsvps`, { cookie: other })).status, 404);
  const list = await (await req(`/api/account/invitations/${inv.id}/rsvps`, { cookie })).json();
  assert.deepEqual(list.counts, { responses: 4, attending: 2, declined: 2, guests: 5 });
  assert.equal(new Set(list.rsvps.map(x => x.id)).size, list.rsvps.length); assert.ok(list.rsvps.every(x => x.updated_at));
  assert.ok(!("tenant_id" in list.rsvps[0]));
  r = await req(`/api/account/invitations/${inv.id}/rsvps.csv`, { cookie });
  assert.match(r.headers.get("content-type"), /text\/csv/);
  const raw = Buffer.from(await r.arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], "UTF-8 BOM for Excel (raw bytes)");
  const csv = raw.toString("utf8");
  assert.ok(csv.includes("name,attending,party_size,dietary,contact,created_at,updated_at") && csv.includes("giulia BIANCHI,no,0,Sorry,giulia@example.com") && csv.includes("Marco Rossi,yes,2,Vegetarian"));
  const dash = await (await req("/api/account/dashboard", { cookie })).json();
  assert.ok(dash.invitations.some(x => x.id === inv.id));
  result.account_rsvp_list = "pass";

  // 4b. CSV keeps umlauts / Chinese intact
  await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", body: { name: "Jürgen Größe 王小明", attending: "yes", dietary: "keine Nüsse；不吃辣" } });
  const csv2 = Buffer.from(await (await req(`/api/account/invitations/${inv.id}/rsvps.csv`, { cookie })).arrayBuffer()).toString("utf8");
  assert.ok(csv2.includes("Jürgen Größe 王小明,yes,1,keine Nüsse；不吃辣"));
  result.csv_bom_utf8 = "pass";

  // 5. Rate limit per invitation + IP (RSVP_PER_10_MIN=19): exhaust this invitation, a second invitation from the same IP still works.
  let n = 0; do { r = await req(`/api/invitations/${inv.id}/rsvp`, { method: "POST", body: { name: "Late " + n, attending: "no" } }); n++; } while (r.status !== 429 && n < 30);
  assert.equal(r.status, 429); assert.ok(r.headers.get("retry-after")); assert.equal((await r.json()).error, "rate_limited");
  const inv2 = await (await req("/api/invitations", { method: "POST", cookie, body: { html, profile: { names: "B & C" } } })).json();
  r = await req(`/api/invitations/${inv2.id}/rsvp`, { method: "POST", origin: "null", type: "text/plain", body: JSON.stringify({ name: "Same Wifi Guest", attending: "yes" }) });
  assert.equal(r.status, 201, "other invitation on same IP not blocked");
  assert.equal(r.headers.get("access-control-allow-origin"), "*", "429/201 keep CORS so the guest page can read the code");
  result.rsvp_rate_limit = "pass";
  await flushStore();
} finally {
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log("rsvp-test passed", JSON.stringify(result));
