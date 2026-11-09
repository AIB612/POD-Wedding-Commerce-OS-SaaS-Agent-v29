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

/** Cheap identity of a file's current content version: changes on every atomic tmp+rename write. */
export function fileStamp(file) {
  try { const s = fs.statSync(file); return `${s.ino}:${s.size}:${s.mtimeMs}`; } catch { return null; }
}
export async function fileStampAsync(file) {
  try { const s = await fsp.stat(file); return `${s.ino}:${s.size}:${s.mtimeMs}`; } catch { return null; }
}
