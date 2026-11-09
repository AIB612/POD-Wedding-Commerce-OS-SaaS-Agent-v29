// In-memory store seeded from data/saas-seed.json.
// Optional: set STORE_PERSIST_PATH to keep runtime changes (orders, tasks, stores...) across restarts.
// Production should replace this module with PostgreSQL (see schema.sql) behind the same interface.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const seedUrl = new URL("./data/saas-seed.json", import.meta.url);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); // repo root (…/pod-wedding)
let state;
let loading;
let saveTimer;
let saving = Promise.resolve();
let persistBlocked = false; // set when a corrupt persist file must not be overwritten with seed

/** Resolve STORE_PERSIST_PATH against the app root (never process.cwd()) so restarts cannot point at another file. */
const persistPath = () => {
  const raw = process.env.STORE_PERSIST_PATH;
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(appRoot, raw);
};

async function load() {
  const file = persistPath();
  if (file) {
    try { return JSON.parse(await fs.readFile(file, "utf8")); }
    catch (e) {
      if (e.code === "ENOENT") { /* first boot */ }
      else {
        // NEVER fall back to seed when a persist file exists but is unreadable — that would wipe production
        // (Pod.AI shop tokens, chats) on the next schedulePersist. Quarantine and refuse to persist.
        const bak = `${file}.corrupt-${Date.now()}`;
        try { await fs.rename(file, bak); console.error(`[store] quarantined corrupt persist to ${bak}:`, e.message); }
        catch { console.error(`[store] corrupt persist at ${file} (could not quarantine):`, e.message); }
        persistBlocked = true;
        throw new Error(`store_persist_corrupt:${file}`);
      }
    }
  }
  return JSON.parse(await fs.readFile(seedUrl, "utf8"));
}

export async function getState() {
  if (state) return state;
  loading ||= load().then(s => (state = s));
  return loading;
}

async function writeSnapshot() {
  const file = persistPath();
  if (!file || !state || persistBlocked) return;
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(state), { encoding: "utf8", mode: 0o600 }); // orders, accounts, sessions: owner-only
  await fs.rename(tmp, file); // atomic replace: never leaves a half-written file
  await fs.chmod(file, 0o600).catch(() => {});
}

function schedulePersist() {
  if (!persistPath()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saving = saving.then(writeSnapshot).catch(e => console.error("[store] persist failed:", e.message));
  }, 250);
  saveTimer.unref?.();
}

/** Write pending changes now (tests, graceful shutdown). */
export async function flushStore() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    saving = saving.then(writeSnapshot).catch(e => console.error("[store] persist failed:", e.message));
  }
  await saving;
}

export async function listForTenant(collection, tenantId) {
  const s = await getState();
  return (s[collection] || []).filter(x => x.tenant_id === tenantId || x.id === tenantId);
}

export async function addRecord(collection, record) {
  const s = await getState();
  s[collection] ||= [];
  s[collection].push(record);
  schedulePersist();
  return record;
}

export async function updateRecord(collection, id, patch) {
  const s = await getState();
  const row = (s[collection] || []).find(x => x.id === id);
  if (!row) return null;
  Object.assign(row, patch);
  schedulePersist();
  return row;
}

export async function findRecord(collection, id) {
  const s = await getState();
  return (s[collection] || []).find(x => x.id === id) || null;
}

export async function findWhere(collection, predicate) {
  const s = await getState();
  return (s[collection] || []).find(predicate) || null;
}

/** Insert only if no record with the same id exists (idempotent webhooks). Returns {record, created}. */
export async function addRecordOnce(collection, record) {
  const existing = await findRecord(collection, record.id);
  if (existing) return { record: existing, created: false };
  return { record: await addRecord(collection, record), created: true };
}

/** Delete every record of a collection matching predicate; returns the removed records. */
export async function removeWhere(collection, predicate) {
  const s = await getState();
  const rows = s[collection] || [], removed = rows.filter(predicate);
  if (removed.length) { s[collection] = rows.filter(r => !predicate(r)); schedulePersist(); }
  return removed;
}
