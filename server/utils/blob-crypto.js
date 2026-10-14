// AES-256-GCM for stored files (uploaded designs). Format: "WCOS1" | iv(12) | tag(16) | ciphertext.
import crypto from "node:crypto";
const MAGIC = Buffer.from("WCOS1");
const key = () => crypto.createHash("sha256").update(String(process.env.APP_ENCRYPTION_KEY || "development-only-key-change-me")).digest();

export function encryptBuffer(buf) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), enc]);
}
export function decryptBuffer(blob) {
  if (!blob.subarray(0, 5).equals(MAGIC)) throw new Error("not_encrypted");
  const iv = blob.subarray(5, 17), tag = blob.subarray(17, 33), d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.subarray(33)), d.final()]);
}
