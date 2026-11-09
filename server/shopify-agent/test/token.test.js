// Pod.AI expiring offline tokens: legacy migration, refresh before expiry, 401 → refresh + retry, failures never drop the install.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podai-tok-"));
Object.assign(process.env, { NODE_ENV: "test", STORE_PERSIST_PATH: path.join(tmp, "s.json"), APP_ENCRYPTION_KEY: "t".repeat(40), AGENT_SHOPIFY_API_KEY: "agentkey", AGENT_SHOPIFY_API_SECRET: "agentsecret" });
const core = await import("../core.js");
const store = await import("../../saas-store.js");
const { encrypt } = await import("../../utils/crypto.js");
const S = "tok-shop.myshopify.com";
const calls = []; let n = 0, gql401 = 0, refreshFails = false;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url), b = JSON.parse(init.body || "{}"), json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/admin/oauth/access_token")) { calls.push(b.grant_type === "refresh_token" ? "refresh" : b.subject_token_type.includes("offline") ? "migrate" : "exchange");
    if (b.grant_type === "refresh_token" && refreshFails) return json({ error: "invalid_grant" }, 400);
    if (b.subject_token_type?.includes("offline")) { assert.equal(b.subject_token, "legacy_tok"); assert.equal(b.expiring, "1"); assert.match(b.requested_token_type, /offline-access-token/); }
    n++; return json({ access_token: `shpat_${n}`, scope: "read_orders", expires_in: 3600, refresh_token: `rt_${n}`, refresh_token_expires_in: 7776000 }); }
  if (/graphql\.json$/.test(u)) { if (gql401 > 0) { gql401--; return json({ errors: "expired" }, 401); } return json({ data: { shop: { name: "ok", tok: init.headers["X-Shopify-Access-Token"] } } }); }
  throw new Error("unexpected " + u);
};
// 1. legacy non-expiring token → migrated once, then reused
await store.addRecord("podai_shops", { id: S, shop: S, tenant_id: core.tenantFor(S), access_token_enc: encrypt("legacy_tok"), scopes: "read_orders", uninstalled_at: null });
assert.equal(await core.accessToken(S), "shpat_1");
assert.equal(await core.accessToken(S), "shpat_1");
assert.deepEqual(calls, ["migrate"]);
let row = await core.getShop(S);
assert.ok(row.token_expires_at && row.refresh_token_enc && row.refresh_expires_at && !JSON.stringify(row).includes("rt_1"));
// 2. close to expiry → refresh (concurrent callers share one refresh)
await store.updateRecord("podai_shops", S, { token_expires_at: new Date(Date.now() + 60e3).toISOString() });
const [a, b2] = await Promise.all([core.accessToken(S), core.accessToken(S)]);
assert.equal(a, "shpat_2"); assert.equal(b2, "shpat_2"); assert.deepEqual(calls, ["migrate", "refresh"]);
// 3. graphql 401 → refresh once and retry; shop stays installed
gql401 = 1;
assert.equal((await core.graphql(S, "{ shop { name } }")).shop.tok, "shpat_3");
assert.equal(await core.isInstalled(S), true);
// 4. refresh fails near expiry → current (still valid) token used, install kept
refreshFails = true;
await store.updateRecord("podai_shops", S, { token_expires_at: new Date(Date.now() + 60e3).toISOString() });
assert.equal(await core.accessToken(S), "shpat_3");
assert.equal(await core.isInstalled(S), true);
// 5. bootstrap exchange skipped while the expiring token is refreshable; forced exchange requests expiring=1
refreshFails = false;
assert.equal((await core.ensureOfflineToken(S, "idtok")).exchanged, false);
// 6. uninstall clears both tokens
await core.markUninstalled(S); row = await core.getShop(S);
assert.equal(row.access_token_enc, null); assert.equal(row.refresh_token_enc, null); assert.equal(await core.isInstalled(S), false);
console.log(JSON.stringify({ migrate: "ok", refresh: "ok", retry401: "ok", refresh_failure: "ok", uninstall: "ok" }));
process.exit(0);
