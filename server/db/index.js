// Persistent storage adapter for the Shopify integration (and future tables).
// Selection (env):
//   DATABASE_URL=mysql://user:pass@host:3306/db  -> MySQL / MariaDB via mysql2 (cPanel shared hosting)
//   DB_DRIVER=memory (or NODE_ENV=test without SQLITE_PATH) -> in-memory (tests)
//   otherwise -> SQLite file via sql.js (WASM, no native build) at SQLITE_PATH (default ./data/app.db);
//               falls back to in-memory with a warning if sql.js is missing.
// All drivers expose: kind, query(sql, params) -> rows, run(sql, params) -> {changes}, close().
// SQL is written in the portable subset (TEXT/VARCHAR, "?" placeholders); ON CONFLICT differences are
// hidden behind insertIgnore()/upsert helpers in the repo modules.
import fs from "node:fs";
import path from "node:path";
import { MIGRATIONS } from "./migrations.js";

let db = null;

export async function openDb(opts = {}) {
  const url = opts.url ?? process.env.DATABASE_URL ?? "";
  const driver = opts.driver ?? process.env.DB_DRIVER ?? "";
  let d;
  if (/^mysql:\/\//i.test(url)) d = await mysqlDriver(url);
  else if (driver === "memory") d = memoryDriver();
  else d = (await sqliteDriver(opts.sqlitePath ?? process.env.SQLITE_PATH ?? "./data/app.db")) || memoryDriver();
  await migrate(d);
  return d;
}

export async function getDb() { if (!db) db = await openDb(); return db; }
/** Tests: swap in a fresh driver. */
export async function setDb(d) { if (db && db !== d) await db.close?.(); db = d; return db; }
export async function closeDb() { if (db) await db.close?.(); db = null; }

async function migrate(d) {
  await d.run("CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(64) PRIMARY KEY, applied_at VARCHAR(40) NOT NULL)");
  const done = new Set((await d.query("SELECT id FROM schema_migrations")).map(r => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    for (const sql of m.sql) await d.run(d.kind === "mysql" ? sql : sql.replace(/\s+ENGINE=InnoDB.*$/i, ""));
    await d.run("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)", [m.id, new Date().toISOString()]);
  }
}

async function sqliteDriver(file) {
  // sql.js = SQLite compiled to WebAssembly: no native build step, so it installs on cPanel / Render alike.
  // The whole DB lives in memory and is written atomically to SQLITE_PATH after every write (fine for this size).
  let initSqlJs;
  try { initSqlJs = (await import("sql.js")).default; }
  catch { console.warn("[db] sql.js not installed; using in-memory storage (data lost on restart)."); return null; }
  const SQL = await initSqlJs();
  const mem = file === ":memory:";
  const abs = mem ? null : path.resolve(file);
  if (abs) fs.mkdirSync(path.dirname(abs), { recursive: true });
  let conn = abs && fs.existsSync(abs) ? new SQL.Database(fs.readFileSync(abs)) : new SQL.Database();
  // Several app processes (e.g. cPanel/LiteSpeed spawning more than one) may share the file: reload when another process wrote it,
  // so one process never overwrites rows saved by another with its stale in-memory copy.
  const mtime = () => { try { return fs.statSync(abs).mtimeMs; } catch { return 0; } };
  let seen = abs ? mtime() : 0;
  const sync = () => { if (!abs) return; const m = mtime(); if (m && m !== seen) { const fresh = new SQL.Database(fs.readFileSync(abs)); conn.close(); conn = fresh; seen = m; } };
  const persist = () => { if (!abs) return; const tmp = `${abs}.tmp.${process.pid}`; fs.writeFileSync(tmp, Buffer.from(conn.export())); fs.renameSync(tmp, abs); seen = mtime(); };
  const norm = p => p.map(v => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v));
  return {
    kind: "sqlite", file: abs || ":memory:",
    async query(sql, params = []) {
      sync(); const st = conn.prepare(sql); st.bind(norm(params)); const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      st.free(); return rows;
    },
    async run(sql, params = []) { sync(); conn.run(sql, norm(params)); const changes = conn.getRowsModified(); persist(); return { changes }; },
    async insertIgnore(table, row) { return this.run(`INSERT OR IGNORE INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`, Object.values(row)); },
    async upsert(table, row, key) { const cols = Object.keys(row); return this.run(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")}) ON CONFLICT(${key.join(",")}) DO UPDATE SET ${cols.filter(c => !key.includes(c)).map(c => `${c}=excluded.${c}`).join(",")}`, Object.values(row)); },
    async close() { persist(); conn.close(); }
  };
}

async function mysqlDriver(url) {
  const mysql = await import("mysql2/promise");
  const pool = mysql.createPool({ uri: url, connectionLimit: Number(process.env.DB_POOL_SIZE || 5), charset: "utf8mb4" });
  return {
    kind: "mysql",
    async query(sql, params = []) { const [rows] = await pool.query(sql, params); return rows; },
    async run(sql, params = []) { const [r] = await pool.query(sql, params); return { changes: r?.affectedRows ?? 0 }; },
    async insertIgnore(table, row) { return this.run(`INSERT IGNORE INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`, Object.values(row)); },
    async upsert(table, row, key) { const cols = Object.keys(row); return this.run(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")}) ON DUPLICATE KEY UPDATE ${cols.filter(c => !key.includes(c)).map(c => `${c}=VALUES(${c})`).join(",")}`, Object.values(row)); },
    async close() { await pool.end(); }
  };
}

/** Minimal table store understanding only the statements the repos issue (see shopify-repo.js).
 *  Repos call the structured helpers (insertIgnore/upsert/select/update/remove), never free SQL, so this stays tiny. */
export function memoryDriver() {
  const tables = new Map(), keys = new Map();
  const t = n => { if (!tables.has(n)) tables.set(n, []); return tables.get(n); };
  const match = (r, where = {}) => Object.entries(where).every(([k, v]) => r[k] === v);
  return {
    kind: "memory",
    async query(sql) { if (/FROM schema_migrations/.test(sql)) return t("schema_migrations").map(r => ({ ...r })); return []; },
    async run(sql, params = []) {
      const m = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)[^(]*\(([\s\S]*)\)/i);
      if (m) { const pk = m[2].match(/PRIMARY KEY \(([^)]+)\)/i)?.[1] || m[2].match(/(\w+)[^,]*PRIMARY KEY/i)?.[1]; keys.set(m[1], pk.split(",").map(s => s.trim())); t(m[1]); return { changes: 0 }; }
      if (/^INSERT INTO schema_migrations/.test(sql)) { t("schema_migrations").push({ id: params[0], applied_at: params[1] }); return { changes: 1 }; }
      return { changes: 0 }; // CREATE INDEX etc.
    },
    async insertIgnore(table, row) { const k = keys.get(table) || ["id"], rows = t(table); if (rows.some(r => k.every(c => r[c] === row[c]))) return { changes: 0 }; rows.push({ ...row }); return { changes: 1 }; },
    async upsert(table, row, key) { const rows = t(table), i = rows.findIndex(r => key.every(c => r[c] === row[c])); if (i >= 0) rows[i] = { ...rows[i], ...row }; else rows.push({ ...row }); return { changes: 1 }; },
    async select(table, where = {}, { order, limit } = {}) { let rows = t(table).filter(r => match(r, where)).map(r => ({ ...r })); if (order) { const [c, dir] = order; rows.sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (dir === "DESC" ? -1 : 1)); } return limit ? rows.slice(0, limit) : rows; },
    async update(table, where, patch) { let n = 0; for (const r of t(table)) if (match(r, where)) { Object.assign(r, patch); n++; } return { changes: n }; },
    async remove(table, where) { const rows = t(table), before = rows.length; tables.set(table, rows.filter(r => !match(r, where))); return { changes: before - tables.get(table).length }; },
    async close() {}
  };
}

// Structured helpers for SQL drivers (memory driver implements them natively).
const ident = s => { if (!/^\w+$/.test(s)) throw new Error("bad_identifier"); return s; };
export async function select(d, table, where = {}, { order, limit } = {}) {
  if (d.select) return d.select(table, where, { order, limit });
  const w = Object.keys(where).map(k => `${ident(k)} = ?`).join(" AND ");
  return d.query(`SELECT * FROM ${ident(table)}${w ? ` WHERE ${w}` : ""}${order ? ` ORDER BY ${ident(order[0])} ${order[1] === "DESC" ? "DESC" : "ASC"}` : ""}${limit ? ` LIMIT ${Number(limit) | 0}` : ""}`, Object.values(where));
}
export async function update(d, table, where, patch) {
  if (d.update) return d.update(table, where, patch);
  return d.run(`UPDATE ${ident(table)} SET ${Object.keys(patch).map(k => `${ident(k)} = ?`).join(", ")} WHERE ${Object.keys(where).map(k => `${ident(k)} = ?`).join(" AND ")}`, [...Object.values(patch), ...Object.values(where)]);
}
export async function remove(d, table, where) {
  if (d.remove) return d.remove(table, where);
  return d.run(`DELETE FROM ${ident(table)} WHERE ${Object.keys(where).map(k => `${ident(k)} = ?`).join(" AND ")}`, Object.values(where));
}
