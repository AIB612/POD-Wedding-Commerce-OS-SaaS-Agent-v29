// Pod.AI protected customer data: encryption at rest (podai_* rows), encrypted backups, access log, security/DPA pages.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podai-sec-"));
const file = path.join(tmp, "store.json");
const EMAIL = "Secret.Buyer@Example.com", MSG = "my order 1001 please, secret-phrase-xyz";
// a legacy (plaintext) persist file: site rows + Pod.AI rows with personal data + a quarantined plaintext copy
const legacy = { orders: [{ id: "o1", tenant_id: "t1", email: "site@example.com" }],
  podai_conversations: [{ id: "c_aaaaaaaaaaaaaaaa", tenant_id: "shopagent_shop-a.myshopify.com", created_at: new Date().toISOString(), last_message_at: new Date().toISOString(), status: "open",
    messages: [{ role: "user", text: `${MSG} ${EMAIL}`, at: new Date().toISOString() }], slots: { email: EMAIL.toLowerCase() }, intents: {}, tools: {} }],
  podai_handoffs: [{ id: "ho_1", tenant_id: "shopagent_shop-a.myshopify.com", conversation_id: "c_aaaaaaaaaaaaaaaa", status: "open", customer_email: EMAIL.toLowerCase(), messages: [{ role: "user", text: MSG }], created_at: new Date().toISOString() }],
  podai_shops: [{ id: "shop-a.myshopify.com", shop: "shop-a.myshopify.com", tenant_id: "shopagent_shop-a.myshopify.com", access_token_enc: null, scopes: "read_orders" }] };
fs.writeFileSync(file, JSON.stringify(legacy));
fs.writeFileSync(`${file}.corrupt-123`, JSON.stringify(legacy));
for (const k of ["LLM_PROVIDER", "OPENAI_API_KEY", "XAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "PODAI_DATA_KEY"]) delete process.env[k];
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: file, APP_ENCRYPTION_KEY: "q".repeat(40),
  AGENT_SHOPIFY_API_KEY: "agentkey", AGENT_SHOPIFY_API_SECRET: "agentsecret", AGENT_APP_URL: "https://app.test", PODAI_BACKUP_DIR: path.join(tmp, "backups") });

const store = await import("../../saas-store.js");
const records = await import("../security/records.js");
const backup = await import("../security/backup.js");
const alog = await import("../security/access-log.js");
const keys = await import("../security/keys.js");
const gdpr = await import("../gdpr.js");
const core = await import("../core.js");
const result = {};

// 1. migration: plaintext podai rows are rewritten encrypted; in memory they stay readable; site rows untouched
const s = await store.getState();
assert.equal(s.podai_conversations[0].slots.email, EMAIL.toLowerCase());
await new Promise(r => setTimeout(r, 300)); await store.flushStore();
let disk = fs.readFileSync(file, "utf8");
assert.ok(!disk.toLowerCase().includes(EMAIL.toLowerCase()) && !disk.includes("secret-phrase-xyz") && !disk.includes("read_orders"), "no plaintext personal data on disk");
assert.ok(disk.includes("site@example.com"), "site collections unchanged");
const d = JSON.parse(disk);
for (const col of ["podai_conversations", "podai_handoffs", "podai_shops"]) for (const r of d[col]) { assert.deepEqual(Object.keys(r).sort(), ["_enc", "id", "tenant_id"]); assert.ok(records.isEncryptedRow(r)); }
assert.equal(records.decryptRow("podai_conversations", d.podai_conversations[0]).messages[0].text.includes("secret-phrase-xyz"), true);
// tampering / swapping rows fails (AAD binds the row id + collection)
assert.throws(() => records.decryptRow("podai_handoffs", { ...d.podai_conversations[0], id: "ho_1" }));
result.migration = "ok";

// 2. new writes are encrypted too; updates re-encrypt
await store.addRecord("podai_events", { id: "ev_1", tenant_id: "shopagent_shop-a.myshopify.com", type: "chat_open", conversation_id: "c_aaaaaaaaaaaaaaaa", at: new Date().toISOString() });
await store.updateRecord("podai_handoffs", "ho_1", { team_note: "call back secret-note-777" });
await store.flushStore(); disk = fs.readFileSync(file, "utf8");
assert.ok(!disk.includes("secret-note-777") && !disk.includes("chat_open"));
result.write_path = "ok";

// 3. a fresh process with the same key reads everything; with a wrong key rows are kept (never dropped)
const reload = async (key) => { process.env.APP_ENCRYPTION_KEY = key; const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  try { return raw.podai_handoffs.map(r => records.decryptRow("podai_handoffs", r)); } catch { return null; } finally { process.env.APP_ENCRYPTION_KEY = "q".repeat(40); } };
assert.equal((await reload("q".repeat(40)))[0].team_note, "call back secret-note-777");
assert.equal(await reload("w".repeat(40)), null);
result.reload = "ok";

// 4. GDPR customers/redact still matches the shopper e-mail (in memory plaintext) and removes the rows
const red = await gdpr.customerRedact("shop-a.myshopify.com", { customer: { email: EMAIL } });
assert.ok(red.removed >= 2);
assert.equal((await store.listForTenant("podai_conversations", "shopagent_shop-a.myshopify.com")).length, 0);
await store.flushStore();
result.gdpr = "ok";

// 5. encrypted backup + leftover plaintext copies encrypted and deleted + 14-day retention + restore
fs.mkdirSync(path.join(tmp, "backups"), { recursive: true });
fs.writeFileSync(path.join(tmp, "backups", "store-20200101.json.gz.enc"), "old");
const b = await backup.runBackup();
assert.equal(b.created, true); assert.equal(b.leftovers, 1); assert.equal(b.pruned, 1);
assert.ok(!fs.existsSync(`${file}.corrupt-123`), "plaintext quarantine copy removed");
const files = fs.readdirSync(path.join(tmp, "backups"));
for (const f of files) { const raw = fs.readFileSync(path.join(tmp, "backups", f)); assert.ok(!raw.toString("latin1").includes("site@example.com") && !raw.toString("latin1").toLowerCase().includes(EMAIL.toLowerCase())); assert.equal(fs.statSync(path.join(tmp, "backups", f)).mode & 0o077, 0); }
assert.equal(fs.statSync(path.join(tmp, "backups")).mode & 0o077, 0);
assert.equal((await backup.runBackup()).created, false, "one backup per day");
const out = path.join(tmp, "restored.json");
await backup.restoreBackup(path.join(tmp, "backups", b.file), out);
assert.deepEqual(JSON.parse(fs.readFileSync(out, "utf8")).orders, legacy.orders);
await assert.rejects(() => backup.restoreBackup(path.join(tmp, "backups", b.file), out), /EEXIST/, "never overwrites");
const lo = path.join(tmp, "restored-leftover.json");
await backup.restoreBackup(path.join(tmp, "backups", "leftover-store.json.corrupt-123.gz.enc"), lo);
assert.ok(fs.readFileSync(lo, "utf8").includes("secret-phrase-xyz"));
const forged = fs.readFileSync(path.join(tmp, "backups", b.file)); forged[forged.length - 1] ^= 1;
assert.throws(() => backup.decryptBackup(forged, b.file));
result.backup = "ok";

// 6. access log: who/what, never the data; HTTP admin views + order lookups are logged; 12-month retention
const { createApp } = await import("../../create-app.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => { const u = String(url); const m = u.match(/^https:\/\/([a-z0-9-]+\.myshopify\.com)\/admin\/(.*)$/); if (!m) return realFetch(url, init);
  const json = x => new Response(JSON.stringify(x), { status: 200, headers: { "Content-Type": "application/json" } });
  if (m[2] === "oauth/access_token") return json({ access_token: "tok", scope: core.SCOPES });
  const q = JSON.parse(init.body || "{}").query || "";
  if (/orders\(first: 1/.test(q)) return json({ data: { orders: { nodes: [{ name: "#1001", createdAt: "2026-10-01T10:00:00Z", email: EMAIL, cancelledAt: null, displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED", totalPriceSet: { shopMoney: { amount: "9", currencyCode: "CHF" } }, lineItems: { nodes: [] }, fulfillments: [] }] } } });
  return json({ data: { shop: { name: "A", shopPolicies: [] }, orders: { nodes: [] }, products: { nodes: [] } } }); };
try {
  const SHOP = "shop-a.myshopify.com", auth = { Authorization: `Bearer ${core.signSession(SHOP, { sub: "42" })}`, "Content-Type": "application/json" };
  assert.equal((await realFetch(`${base}/shopify-agent/api/bootstrap`, { method: "POST", headers: auth })).status, 200);
  const q = { shop: SHOP, logged_in_customer_id: "", path_prefix: "/apps/podai", timestamp: String(Math.floor(Date.now() / 1000)) }; q.signature = core.proxySignature(q, "agentsecret");
  const chat = async (message, conversation_id) => (await realFetch(`${base}/shopify-agent/proxy/chat?${new URLSearchParams(q)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, conversation_id, lang: "en" }) })).json();
  const c1 = await chat(`Where is my order #1001? ${EMAIL}`);
  assert.ok(c1.answer);
  for (const p of ["/conversations", "/handoffs", "/dashboard", "/privacy"]) assert.equal((await realFetch(`${base}/shopify-agent/api${p}`, { headers: auth })).status, 200, p);
  const log = await (await realFetch(`${base}/shopify-agent/api/access-log`, { headers: auth })).json();
  const acts = log.map(e => e.action);
  for (const a of ["order_lookup", "view_conversations", "view_handoffs", "view_dashboard", "view_gdpr_requests"]) assert.ok(acts.includes(a), a);
  assert.ok(log.filter(e => e.via === "admin").every(e => e.actor === "shop_staff:42"));
  const hook = (topic, payload) => { const raw = JSON.stringify(payload); return realFetch(`${base}/shopify-agent/webhooks`, { method: "POST", body: raw, headers: { "Content-Type": "application/json", "X-Shopify-Hmac-Sha256": crypto.createHmac("sha256", "agentsecret").update(raw).digest("base64"), "X-Shopify-Topic": topic, "X-Shopify-Shop-Domain": SHOP, "X-Shopify-Webhook-Id": crypto.randomUUID() } }); };
  assert.equal((await hook("customers/data_request", { customer: { email: EMAIL } })).status, 200);
  await new Promise(r => setTimeout(r, 50));
  const raw = fs.readdirSync(alog.logDir()).map(f => fs.readFileSync(path.join(alog.logDir(), f), "utf8")).join("");
  assert.ok(raw.includes("customers/data_request"));
  assert.ok(!raw.toLowerCase().includes(EMAIL.toLowerCase()) && !raw.includes("1001") && !raw.includes("secret-phrase"), "log holds no personal data");
  assert.ok(raw.includes(`e:${keys.hmacIndex(EMAIL)}`), "subject only as keyed hash");
  assert.equal(fs.statSync(path.join(alog.logDir(), fs.readdirSync(alog.logDir())[0])).mode & 0o077, 0);
  fs.writeFileSync(path.join(alog.logDir(), "access-2020-01.log"), "{}\n");
  assert.equal(await alog.purgeAccessLog(), 1);
  // 7. public pages
  for (const p of ["/shopify-agent/security", "/shopify-agent/dpa"]) { const r = await realFetch(base + p); assert.equal(r.status, 200, p); assert.match(await r.text(), /Dropking AI/); }
  const http = await import("node:http");
  const hostGet = p => new Promise((ok, no) => http.get({ host: "127.0.0.1", port: server.address().port, path: p, headers: { Host: "pod.swisspro.site" } }, r => { r.resume(); ok(r.statusCode); }).on("error", no));
  for (const p of ["/security", "/dpa", "/privacy"]) assert.equal(await hostGet(p), 200, p);
  const priv = await (await realFetch(`${base}/shopify-agent/privacy`)).text();
  assert.match(priv, /encrypt/i); assert.match(priv, /\/security/); assert.match(priv, /access log/i);
  await store.flushStore();
  assert.ok(!fs.readFileSync(file, "utf8").toLowerCase().includes(EMAIL.toLowerCase()), "chat data from HTTP flow encrypted on disk");
  result.access_log = "ok"; result.pages = "ok";
} finally { server.close(); globalThis.fetch = realFetch; }
console.log(JSON.stringify(result, null, 1));
process.exit(0);
