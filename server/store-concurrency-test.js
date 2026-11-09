// Two app processes (LiteSpeed: one lsnode worker per vhost) writing the same data/store.json and data/app.db at the same
// time must never lose each other's writes. Spawns two children that interleave writes, then checks every write is on disk,
// Pod.AI rows are still encrypted at rest, and a corrupt file is still quarantined.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const self = fileURLToPath(import.meta.url);
const N = Number(process.env.CONC_N || 60);

if (process.argv[2] === "child") {
  const tag = process.argv[3];
  const store = await import("./saas-store.js");
  await import("./shopify-agent/security/records.js"); // Pod.AI encryption codec, as in the app
  const { openDb, select } = await import("./db/index.js");
  const db = await openDb();
  await db.run("CREATE TABLE IF NOT EXISTS conc_rows (id VARCHAR(64) PRIMARY KEY, who VARCHAR(8))");
  process.send?.("ready");
  await new Promise(r => process.once("message", r)); // start together
  for (let i = 0; i < N; i++) {
    await store.addRecord("orders", { id: `o_${tag}_${i}`, tenant_id: "t_conc", who: tag });
    await store.addRecord("podai_conversations", { id: `c_${tag}${String(i).padStart(12, "0")}`, tenant_id: "shopagent_conc", messages: [{ role: "user", text: `secret-${tag}-${i}` }] });
    if (i % 3 === 0) await store.updateRecord("orders", `o_${tag}_${i}`, { status: "paid" });
    await db.insertIgnore("conc_rows", { id: `${tag}_${i}`, who: tag });
    if (i % 7 === 0) await new Promise(r => setTimeout(r, Math.random() * 5));
  }
  await store.flushStore();
  process.send?.({ done: true, seen: (await select(db, "conc_rows", {})).length });
  process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-conc-"));
const file = path.join(dir, "store.json"), dbFile = path.join(dir, "app.db");
fs.writeFileSync(file, JSON.stringify({ orders: [{ id: "o_seed", tenant_id: "t_conc" }] }));
const env = { ...process.env, NODE_ENV: "test", STORE_PERSIST_PATH: file, SQLITE_PATH: dbFile, DB_DRIVER: "", DATABASE_URL: "", PODAI_DATA_KEY: "c".repeat(40) };
const kids = ["A", "B"].map(tag => spawn(process.execPath, [self, "child", tag], { env, stdio: ["ignore", "inherit", "inherit", "ipc"] }));
await Promise.all(kids.map(k => new Promise((res, rej) => { k.once("message", m => m === "ready" ? res() : rej(new Error(String(m)))); k.once("exit", c => rej(new Error(`child exited ${c}`))); })));
kids.forEach(k => k.send("go"));
const results = await Promise.all(kids.map(k => new Promise((res, rej) => { k.on("message", m => m?.done && res(m)); k.once("exit", c => c && rej(new Error(`child exited ${c}`))); })));
await Promise.all(kids.map(k => k.exitCode !== null ? null : new Promise(r => k.once("exit", r))));

const disk = JSON.parse(fs.readFileSync(file, "utf8"));
const ids = new Set(disk.orders.map(o => o.id));
assert.ok(ids.has("o_seed"), "pre-existing row kept");
for (const t of ["A", "B"]) for (let i = 0; i < N; i++) {
  assert.ok(ids.has(`o_${t}_${i}`), `order o_${t}_${i} lost`);
  if (i % 3 === 0) assert.equal(disk.orders.find(o => o.id === `o_${t}_${i}`).status, "paid", `update o_${t}_${i} lost`);
}
assert.equal(disk.orders.length, 2 * N + 1, "no duplicates");
assert.equal(disk.podai_conversations.length, 2 * N, "all Pod.AI rows kept");
assert.ok(disk.podai_conversations.every(r => typeof r._enc === "string" && !("messages" in r)), "Pod.AI rows encrypted at rest");
assert.ok(!fs.readFileSync(file, "utf8").includes("secret-"), "no plaintext chat text on disk");
assert.ok(!fs.existsSync(`${file}.lock`) && !fs.existsSync(`${dbFile}.lock`), "locks released");

// app.db (sql.js): every row from both processes present
const { openDb, select, closeDb } = await import("./db/index.js");
process.env.PODAI_DATA_KEY = "c".repeat(40);
const db = await openDb({ sqlitePath: dbFile, driver: "" });
const rows = await select(db, "conc_rows", {});
assert.equal(rows.length, 2 * N, `app.db rows lost: ${rows.length}/${2 * N}`);
await db.close?.(); await closeDb();

// decrypt round-trip in a fresh process view
process.env.STORE_PERSIST_PATH = file;
const store = await import(`./saas-store.js?verify=${Date.now()}`);
// (records.js registers its codec on the default module instance; check decryption through it)
const recs = await import("./shopify-agent/security/records.js");
const one = disk.podai_conversations.find(r => r.id === "c_A000000000000");
assert.equal(recs.decryptRow("podai_conversations", one).messages[0].text, "secret-A-0");
void store;

// corrupt file is still quarantined and never overwritten with seed
const cdir = fs.mkdtempSync(path.join(os.tmpdir(), "store-corrupt-")), cfile = path.join(cdir, "store.json");
fs.writeFileSync(cfile, "{not-json");
process.env.STORE_PERSIST_PATH = cfile;
const fresh = await import(`./saas-store.js?corrupt=${Date.now()}`);
await assert.rejects(() => fresh.getState(), /store_persist_corrupt/);
assert.ok(!fs.existsSync(cfile) && fs.readdirSync(cdir).some(n => n.startsWith("store.json.corrupt-")));

console.log(`store-concurrency-test: OK (2 processes × ${N} interleaved writes, store.json + app.db, ${results.map(r => r.seen).join("/")} rows seen by children)`);
