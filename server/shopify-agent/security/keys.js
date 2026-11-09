// Pod.AI data keys. Root secret: PODAI_DATA_KEY (preferred) or APP_ENCRYPTION_KEY (already used for shop tokens).
// Purpose-specific 256-bit keys are derived with HKDF-SHA256, so the record key, backup key and index key never coincide.
import crypto from "node:crypto";

const DEV = "development-only-key-change-me";
let warned = false;
export function rootSecret() {
  const raw = process.env.PODAI_DATA_KEY || process.env.APP_ENCRYPTION_KEY || "";
  if (raw) return raw;
  if (process.env.NODE_ENV === "production" && !warned) { warned = true; console.error("[pod.ai] PODAI_DATA_KEY / APP_ENCRYPTION_KEY missing: data is encrypted with a development key"); }
  return DEV;
}
const cache = new Map();
/** 32-byte key for a purpose ("records", "backup", "index"); re-derived when the root secret changes (tests). */
export function deriveKey(purpose) {
  const root = rootSecret(), k = `${purpose}|${crypto.createHash("sha256").update(root).digest("hex")}`;
  if (!cache.has(k)) cache.set(k, Buffer.from(crypto.hkdfSync("sha256", Buffer.from(root, "utf8"), Buffer.from("pod.ai"), Buffer.from(`podai-${purpose}-v1`), 32)));
  return cache.get(k);
}
/** AES-256-GCM: returns base64url(iv12 | tag16 | ciphertext). `aad` binds the blob to its record (no swapping rows). */
export function seal(buf, purpose, aad = "") {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", deriveKey(purpose), iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
export function open(blob, purpose, aad = "") {
  const b = Buffer.isBuffer(blob) ? blob : Buffer.from(blob, "base64url");
  const d = crypto.createDecipheriv("aes-256-gcm", deriveKey(purpose), b.subarray(0, 12));
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]);
}
/** Keyed hash (HMAC-SHA256) for lookups / logs without storing the value, e.g. an e-mail. */
export const hmacIndex = v => crypto.createHmac("sha256", deriveKey("index")).update(String(v || "").trim().toLowerCase()).digest("hex").slice(0, 32);
