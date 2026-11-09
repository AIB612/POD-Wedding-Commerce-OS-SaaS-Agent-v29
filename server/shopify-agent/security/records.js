// Encryption at rest for Pod.AI records (all podai_* collections) in the persist file.
// On disk each row is { id, tenant_id, _enc: "pa1.<AES-256-GCM blob>" } — everything else (chat messages, shopper e-mail,
// order numbers, handoff contents, event payloads, settings, shop scopes) is inside the blob. In memory rows stay plain, so
// lookups (GDPR customers/redact by e-mail, retention by date) work unchanged. Plaintext rows found on load are re-written
// encrypted (migration). A row that cannot be decrypted (wrong key) is kept verbatim and written back unchanged — never lost.
import { registerPersistCodec } from "../../saas-store.js";
import { seal, open } from "./keys.js";

export const COLLECTIONS = ["podai_shops", "podai_settings", "podai_conversations", "podai_handoffs", "podai_events", "podai_discounts", "podai_gdpr"];
const PREFIX = "pa1.";
const aad = (col, id) => `${col}:${id}`;
export const isEncryptedRow = r => !!r && typeof r._enc === "string" && r._enc.startsWith(PREFIX);

export function encryptRow(col, row) {
  if (isEncryptedRow(row) && Object.keys(row).every(k => ["id", "tenant_id", "_enc"].includes(k))) return row;
  const { id, tenant_id, ...rest } = row;
  return { id, tenant_id, _enc: PREFIX + seal(Buffer.from(JSON.stringify(rest), "utf8"), "records", aad(col, id)).toString("base64url") };
}
export function decryptRow(col, row) {
  const rest = JSON.parse(open(row._enc.slice(PREFIX.length), "records", aad(col, row.id)).toString("utf8"));
  return { id: row.id, tenant_id: row.tenant_id, ...rest };
}

function codecFor(col) {
  const stuck = []; // undecryptable rows: kept as-is on disk
  const memo = new WeakMap(); // row object → { json, enc } (skip re-encrypting unchanged rows on every snapshot)
  return {
    decode(rows) {
      let dirty = false; const out = [];
      for (const r of rows) {
        if (!isEncryptedRow(r)) { out.push(r); dirty = true; continue; }
        try { out.push(decryptRow(col, r)); }
        catch (e) { stuck.push(r); console.error(`[pod.ai] cannot decrypt ${col}/${r.id} (key changed?) — kept encrypted`); }
      }
      return { rows: out, dirty };
    },
    encode(rows) {
      const out = rows.map(r => { const json = JSON.stringify(r), m = memo.get(r); if (m && m.json === json) return m.enc;
        const enc = encryptRow(col, r); memo.set(r, { json, enc }); return enc; });
      const live = new Set(rows.map(r => r.id));
      return out.concat(stuck.filter(r => !live.has(r.id)));
    }
  };
}
let installed = false;
export function installRecordEncryption() {
  if (installed) return; installed = true;
  for (const col of COLLECTIONS) registerPersistCodec(col, codecFor(col));
}
installRecordEncryption();
