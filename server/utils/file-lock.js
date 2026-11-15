// Cross-process exclusive lock for files shared by several app processes (LiteSpeed spawns one lsnode worker per vhost,
// e.g. two Passenger/lsnode workers or apps running the same code over the same data/ files).
// Lock = "<file>.lock" created with O_CREAT|O_EXCL ('wx'): exactly one process can create it. A lock older than staleMs
// (holder crashed mid-write) is broken. No dependencies.
import fs from "node:fs";
import fsp from "node:fs/promises";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const DEFAULTS = { staleMs: 10_000, timeoutMs: 20_000, retryMs: 5 };

function breakIfStale(lock, staleMs) {
  try {
    const st = fs.statSync(lock);
    if (Date.now() - st.mtimeMs <= staleMs) return false;
    // Re-check identity right before removing so we never delete a lock another process just took over.
    const again = fs.statSync(lock);
    if (again.ino !== st.ino || again.mtimeMs !== st.mtimeMs) return false;
    fs.unlinkSync(lock);
    console.warn(`[lock] broke stale lock ${lock}`);
    return true;
  } catch { return true; } // vanished meanwhile: just retry
}

function tryCreate(lock) {
  try { const fd = fs.openSync(lock, "wx", 0o600); try { fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`); } finally { fs.closeSync(fd); } return true; }
  catch (e) { if (e.code === "EEXIST") return false; throw e; }
}

/** Async acquire; resolves to a release() function. */
export async function acquireLock(file, opts = {}) {
  const { staleMs, timeoutMs, retryMs } = { ...DEFAULTS, ...opts };
  const lock = `${file}.lock`, start = Date.now();
  let wait = retryMs;
  for (;;) {
    if (tryCreate(lock)) return releaser(lock);
    breakIfStale(lock, staleMs);
    if (Date.now() - start > timeoutMs) throw new Error(`lock_timeout:${lock}`);
    await sleep(wait + Math.random() * wait); wait = Math.min(wait * 2, 50);
  }
}

function releaser(lock) {
  let done = false;
  return () => { if (done) return; done = true; try { fs.unlinkSync(lock); } catch { /* already broken as stale */ } };
}

/** Run fn while holding the lock for `file` (cross-process). */
export async function withFileLock(file, fn, opts) {
  const release = await acquireLock(file, opts);
  try { return await fn(); } finally { release(); }
}

/** Identity of a file's current content version. stat alone (ino:size:mtime) is not enough: after tmp+rename the
 *  freed inode is often reused by the next write, SQLite files keep the same page-aligned size, and mtime can tie —
 *  so another process's write could look "unchanged" and be overwritten. Every writer therefore also bumps a random
 *  generation token in "<file>.gen" (bumpGeneration) right after its atomic rename, while still holding the lock. */
const genFile = file => `${file}.gen`;
function readGen(file) { try { return fs.readFileSync(genFile(file), "utf8").trim(); } catch { return ""; } }
export function fileStamp(file) {
  try { const s = fs.statSync(file); return `${s.ino}:${s.size}:${s.mtimeMs}:${readGen(file)}`; } catch { return null; }
}
export async function fileStampAsync(file) {
  try { const s = await fsp.stat(file); let g = ""; try { g = (await fsp.readFile(genFile(file), "utf8")).trim(); } catch { /* none yet */ } return `${s.ino}:${s.size}:${s.mtimeMs}:${g}`; } catch { return null; }
}
/** Mark a new content version of `file` (call after the atomic rename, under the file lock). */
export function bumpGeneration(file) {
  const g = genFile(file), tmp = `${g}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`, { mode: 0o600 }); fs.renameSync(tmp, g); } catch (e) { console.warn("[lock] could not write generation token:", e.message); }
}
