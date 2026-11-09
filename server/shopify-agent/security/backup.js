// Encrypted daily backups of the persist file (data/store.json: Pod.AI records are already encrypted per row; the whole
// snapshot is encrypted again with the backup key). Format: "PODAIBK1" | AES-256-GCM(iv|tag|ct) of gzip(store.json).
// Dir: PODAI_BACKUP_DIR or ~/podai-backups (outside every web root, 0700; files 0600). Kept 14 days.
// Plaintext leftovers next to the persist file (store.json.corrupt-*, store.json.bak*) are encrypted into the backup dir and deleted.
// Restore: node server/shopify-agent/tools/restore-backup.mjs <file.enc> --out <path>
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { seal, open } from "./keys.js";

export const RETENTION_DAYS = 14;
const MAGIC = Buffer.from("PODAIBK1");
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const persistFile = () => { const p = process.env.STORE_PERSIST_PATH; return p ? (path.isAbsolute(p) ? p : path.resolve(appRoot, p)) : null; };
export const backupDir = () => process.env.PODAI_BACKUP_DIR ? path.resolve(appRoot, process.env.PODAI_BACKUP_DIR) : path.join(os.homedir(), "podai-backups");

export const encryptBackup = (plain, name) => Buffer.concat([MAGIC, seal(zlib.gzipSync(plain), "backup", name)]);
export function decryptBackup(buf, name) {
  if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("not_a_podai_backup");
  return zlib.gunzipSync(open(buf.subarray(MAGIC.length), "backup", name));
}
const ensureDir = async d => { await fsp.mkdir(d, { recursive: true, mode: 0o700 }); await fsp.chmod(d, 0o700).catch(() => {}); };
async function writeEnc(dir, name, plain) {
  const tmp = path.join(dir, `.${name}.${process.pid}.tmp`);
  await fsp.writeFile(tmp, encryptBackup(plain, name), { mode: 0o600 });
  await fsp.rename(tmp, path.join(dir, name));
}

/** One backup per UTC day (several app processes share the data dir: the first one wins). */
export async function runBackup({ now = new Date(), force = false } = {}) {
  const file = persistFile(); if (!file) return { skipped: "no_persist_path" };
  const dir = backupDir(); await ensureDir(dir);
  const name = `store-${now.toISOString().slice(0, 10).replace(/-/g, "")}.json.gz.enc`, out = { file: name, created: false, leftovers: 0, pruned: 0 };
  const have = await fsp.stat(path.join(dir, name)).then(() => true, () => false);
  if (!have || force) { try { await writeEnc(dir, name, await fsp.readFile(file)); out.created = true; } catch (e) { if (e.code !== "ENOENT") throw e; out.skipped = "no_persist_file"; } }
  // plaintext copies of the store next to it → encrypted, then removed
  const base = path.basename(file), pdir = path.dirname(file);
  for (const f of await fsp.readdir(pdir).catch(() => [])) {
    if (!f.startsWith(`${base}.`) || !/^\.(corrupt-\d+|bak.*|orig|old|\d+\.tmp)$/.test(f.slice(base.length))) continue;
    const src = path.join(pdir, f);
    if (/\.\d+\.tmp$/.test(f) && Date.now() - (await fsp.stat(src)).mtimeMs < 3600e3) continue; // in-flight atomic write
    await writeEnc(dir, `leftover-${f}.gz.enc`, await fsp.readFile(src)); await fsp.unlink(src); out.leftovers++;
  }
  out.pruned = await pruneBackups(now);
  return out;
}
export async function pruneBackups(now = new Date()) {
  const dir = backupDir(), cut = now.getTime() - RETENTION_DAYS * 864e5; let n = 0;
  for (const f of await fsp.readdir(dir).catch(() => [])) {
    const m = /^store-(\d{4})(\d{2})(\d{2})\.json\.gz\.enc$/.exec(f);
    if (m && Date.UTC(+m[1], +m[2] - 1, +m[3]) < cut) { await fsp.unlink(path.join(dir, f)); n++; }
  }
  return n;
}
export async function restoreBackup(src, outPath, { validate = !path.basename(src).startsWith("leftover-") } = {}) {
  const plain = decryptBackup(await fsp.readFile(src), path.basename(src));
  if (validate) JSON.parse(plain.toString("utf8")); // a daily backup must be a valid store snapshot
  await fsp.writeFile(outPath, plain, { mode: 0o600, flag: "wx" }); // never overwrite an existing file
  return { bytes: plain.length };
}
