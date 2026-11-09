// In-memory store seeded from data/saas-seed.json.
// Optional: set STORE_PERSIST_PATH to keep runtime changes (orders, tasks, stores...) across restarts.
// Production should replace this module with PostgreSQL (see schema.sql) behind the same interface.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock, fileStamp } from "./utils/file-lock.js";

const seedUrl = new URL("./data/saas-seed.json", import.meta.url);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); // repo root (…/pod-wedding)
// Several processes may share the persist file (LiteSpeed runs one lsnode worker per vhost: wed.* and pod.*). Rules:
//   * every mutation: exclusive cross-process lock → re-load from disk if the file changed since we last saw it →
//     apply → atomic write (tmp + rename) → unlock. So no process ever writes back a stale in-memory copy.
//   * reads: re-load when the file changed (cheap stat, re-checked at most every READ_RECHECK_MS).
// Refresh and write are synchronous inside the lock so no other request in this process can interleave.
let state;
let loading;
let stamp = null; // identity (inode:size:mtime) of the persist file version `state` reflects
let lastCheck = 0;
let queue = Promise.resolve(); // in-process serialisation of mutations (the file lock is per process, not per request)
let inMutation = false;
let persistBlocked = false; // set when a corrupt persist file must not be overwritten with seed
const READ_RECHECK_MS = Number(process.env.STORE_READ_RECHECK_MS ?? 100);
// Optional per-collection persist codecs (encrypt-at-rest). Default: none — collections are written as-is.
// A codec only changes how rows are serialised to / parsed from the persist file; in memory rows stay plain objects.
//   encode(rows) -> rows to write; decode(rows) -> { rows, dirty } (dirty: plaintext rows found → rewrite encrypted)
const codecs = new Map();
let codecDirty = false;
function decodeState(s) {
  for (const [col, c] of codecs) if (Array.isArray(s?.[col])) { const r = c.decode(s[col]); s[col] = r.rows; if (r.dirty) codecDirty = true; }
  return s;
}
export function registerPersistCodec(collection, codec) {
  codecs.set(collection, codec);
  if (state && Array.isArray(state[collection])) { const r = codec.decode(state[collection]); state[collection] = r.rows; if (r.dirty) schedulePersist(); }
}
const serialise = s => { if (!codecs.size) return s; const out = { ...s }; for (const [col, c] of codecs) if (Array.isArray(s[col])) out[col] = c.encode(s[col]); return out; };

/** Resolve STORE_PERSIST_PATH against the app root (never process.cwd()) so restarts cannot point at another file. */
const persistPath = () => {
  const raw = process.env.STORE_PERSIST_PATH;
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(appRoot, raw);
};

function quarantine(file, e) {
  // NEVER fall back to seed when a persist file exists but is unreadable — that would wipe production
  // (Pod.AI shop tokens, chats) on the next write. Quarantine and refuse to persist.
  const bak = `${file}.corrupt-${Date.now()}`;
  try { fs.renameSync(file, bak); console.error(`[store] quarantined corrupt persist to ${bak}:`, e.message); }
  catch { console.error(`[store] corrupt persist at ${file} (could not quarantine):`, e.message); }
  persistBlocked = true;
}

async function load() {
  const file = persistPath();
  if (file) {
    const st = fileStamp(file);
    try { const s = JSON.parse(await fsp.readFile(file, "utf8")); stamp = st; lastCheck = Date.now(); return s; }
    catch (e) {
      if (e.code === "ENOENT") { /* first boot */ }
      else { quarantine(file, e); throw new Error(`store_persist_corrupt:${file}`); }
    }
  }
  return JSON.parse(await fsp.readFile(seedUrl, "utf8"));
}

/** Re-load `state` from disk if another process replaced the file. `locked`: caller holds the file lock (may quarantine). */
function refresh(locked) {
  const file = persistPath();
  if (!file || !state || persistBlocked) return;
  lastCheck = Date.now();
  const st = fileStamp(file);
  if (st === null || st === stamp) return; // unchanged, or missing (never re-seed at runtime: keep memory, next write restores it)
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) {
    if (e.code === "ENOENT") return;
    if (locked) quarantine(file, e); // only under the lock: a racing writer can never have its fresh file moved aside
    else console.error("[store] persist file unreadable, keeping in-memory state:", e.message);
    return;
  }
  stamp = st;
  state = decodeState(parsed);
}

export async function getState() {
  if (state) { if (!inMutation && Date.now() - lastCheck >= READ_RECHECK_MS) refresh(false); return state; }
  loading ||= load().then(s => { state = decodeState(s); if (codecDirty) { codecDirty = false; schedulePersist(); } return state; });
  return loading;
}

function writeSnapshot(file) {
  if (!file || !state || persistBlocked) return;
  const tmp = `${file}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(serialise(state)), { encoding: "utf8", mode: 0o600 }); // orders, accounts, sessions: owner-only
  fs.renameSync(tmp, file); // atomic replace: readers in other processes never see a half-written file
  try { fs.chmodSync(file, 0o600); } catch {}
  stamp = fileStamp(file);
}

/** Run fn(state) as one atomic cross-process mutation. fn returns { result, changed }. */
function mutate(fn) {
  const run = queue.then(async () => {
    await getState();
    const file = persistPath();
    if (!file || persistBlocked) return fn(state).result;
    const release = await acquireLock(file);
    inMutation = true;
    try {
      refresh(true);
      const r = fn(state);
      if (r.changed || codecDirty) { codecDirty = false; writeSnapshot(file); }
      return r.result;
    } finally { inMutation = false; release(); }
  });
  queue = run.catch(() => {});
  return run;
}

/** Persist without a data change (codec migration: plaintext rows found → rewrite encrypted). */
function schedulePersist() {
  if (!persistPath()) return;
  mutate(() => ({ changed: true })).catch(e => console.error("[store] persist failed:", e.message));
}

/** Wait until every queued write is on disk (tests, graceful shutdown). */
export async function flushStore() {
  await queue;
}

export async function listForTenant(collection, tenantId) {
  const s = await getState();
  return (s[collection] || []).filter(x => x.tenant_id === tenantId || x.id === tenantId);
}

export async function addRecord(collection, record) {
  return mutate(s => { s[collection] ||= []; s[collection].push(record); return { result: record, changed: true }; });
}

export async function updateRecord(collection, id, patch) {
  return mutate(s => {
    const row = (s[collection] || []).find(x => x.id === id);
    if (!row) return { result: null, changed: false };
    Object.assign(row, patch);
    return { result: row, changed: true };
  });
}

export async function findRecord(collection, id) {
  const s = await getState();
  return (s[collection] || []).find(x => x.id === id) || null;
}

export async function findWhere(collection, predicate) {
  const s = await getState();
  return (s[collection] || []).find(predicate) || null;
}

/** Insert only if no record with the same id exists (idempotent webhooks). Returns {record, created}. Atomic across processes. */
export async function addRecordOnce(collection, record) {
  return mutate(s => {
    const existing = (s[collection] || []).find(x => x.id === record.id);
    if (existing) return { result: { record: existing, created: false }, changed: false };
    s[collection] ||= []; s[collection].push(record);
    return { result: { record, created: true }, changed: true };
  });
}

/** Delete every record of a collection matching predicate; returns the removed records. */
export async function removeWhere(collection, predicate) {
  return mutate(s => {
    const rows = s[collection] || [], removed = rows.filter(predicate);
    if (removed.length) s[collection] = rows.filter(r => !predicate(r));
    return { result: removed, changed: removed.length > 0 };
  });
}
