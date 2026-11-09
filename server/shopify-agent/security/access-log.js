// Append-only access log for Pod.AI personal data. One JSON line per access: who (actor), what (action), which shop,
// which record ids / how many — never the data itself (no message text, no e-mail, no order details; e-mails and order
// numbers only as keyed HMAC). Monthly files <dir>/access-YYYY-MM.log (mode 0600, opened with O_APPEND), kept 12 months.
// Dir: PODAI_ACCESS_LOG_DIR or <persist dir>/podai-access (not web-served; the public allowlist never exposes data/).
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hmacIndex } from "./keys.js";

export const RETENTION_MONTHS = 12;
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export function logDir() {
  if (process.env.PODAI_ACCESS_LOG_DIR) return path.resolve(appRoot, process.env.PODAI_ACCESS_LOG_DIR);
  const p = process.env.STORE_PERSIST_PATH;
  return p ? path.join(path.dirname(path.isAbsolute(p) ? p : path.resolve(appRoot, p)), "podai-access") : null;
}
const month = d => d.toISOString().slice(0, 7);
const clean = v => v == null ? undefined : String(v).replace(/[^\w.:@/#-]/g, "").slice(0, 120);

/** Record one access. Fire-and-forget safe: never throws into the request. */
export async function logAccess({ actor, action, shop, tenant, ids, count, email, order, via, ip } = {}) {
  const dir = logDir(); if (!dir) return;
  const at = new Date();
  const e = { at: at.toISOString(), actor: clean(actor) || "unknown", action: clean(action), shop: clean(shop), tenant: clean(tenant), via: clean(via),
    ids: Array.isArray(ids) ? ids.slice(0, 50).map(clean) : undefined, count: Number.isFinite(count) ? count : undefined,
    subject: email ? `e:${hmacIndex(email)}` : undefined, order: order ? `o:${hmacIndex(String(order).replace(/^#/, ""))}` : undefined, ip: ip ? `i:${hmacIndex(ip)}` : undefined };
  try {
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    const fd = await fsp.open(path.join(dir, `access-${month(at)}.log`), fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT, 0o600);
    try { await fd.write(JSON.stringify(e) + "\n"); } finally { await fd.close(); }
  } catch (err) { console.error("[pod.ai] access log write failed:", err.message); }
}
/** Read entries of one tenant (newest last), for the merchant / audits. Reading the log is itself logged by the caller. */
export async function readAccess({ tenant, limit = 200 } = {}) {
  const dir = logDir(); if (!dir) return [];
  let files = []; try { files = (await fsp.readdir(dir)).filter(f => /^access-\d{4}-\d{2}\.log$/.test(f)).sort(); } catch { return []; }
  const out = [];
  for (const f of files.slice(-RETENTION_MONTHS)) for (const l of (await fsp.readFile(path.join(dir, f), "utf8")).split("\n")) {
    if (!l) continue; try { const e = JSON.parse(l); if (!tenant || e.tenant === tenant) out.push(e); } catch {}
  }
  return out.slice(-limit);
}
/** Delete monthly files older than 12 months. */
export async function purgeAccessLog(now = new Date()) {
  const dir = logDir(); if (!dir) return 0;
  const cut = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - RETENTION_MONTHS, 1)).toISOString().slice(0, 7);
  let n = 0; try { for (const f of await fsp.readdir(dir)) { const m = /^access-(\d{4}-\d{2})\.log$/.exec(f); if (m && m[1] < cut) { await fsp.unlink(path.join(dir, f)); n++; } } } catch {}
  return n;
}
