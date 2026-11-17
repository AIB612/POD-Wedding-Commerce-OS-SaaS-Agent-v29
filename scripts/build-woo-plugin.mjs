#!/usr/bin/env node
// Build the WooCommerce plugin zip: apps/woocommerce-plugin/dist/pod-ai-chat.zip (+ pod-ai-chat-<version>.zip).
// Root folder inside the zip is "pod-ai-chat/" (what WordPress and WordPress.org expect). Dotfiles are skipped.
//   node scripts/build-woo-plugin.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "apps/woocommerce-plugin/pod-ai-chat"), dist = path.join(root, "apps/woocommerce-plugin/dist");
const version = fs.readFileSync(path.join(src, "pod-ai-chat.php"), "utf8").match(/\* Version:\s*([\d.]+)/)[1];
const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const files = []; (function walk(d, rel) { for (const f of fs.readdirSync(d).sort()) { if (f.startsWith(".")) continue; const a = path.join(d, f), r = `${rel}/${f}`; fs.statSync(a).isDirectory() ? walk(a, r) : files.push([a, r]); } })(src, "pod-ai-chat");
const parts = [], central = []; let off = 0;
const dosTime = 0x6000, dosDate = ((2026 - 1980) << 9) | (11 << 5) | 17; // fixed timestamp → reproducible zip
for (const [abs, rel] of files) {
  const data = fs.readFileSync(abs), comp = zlib.deflateRawSync(data, { level: 9 }), name = Buffer.from(rel), crc = crc32(data);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12);
  lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
  parts.push(lh, name, comp);
  const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14);
  ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE((0o100644 * 65536) >>> 0, 38); ch.writeUInt32LE(off, 42);
  central.push(ch, name); off += 30 + name.length + comp.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
const zip = Buffer.concat([...parts, cd, end]);
fs.mkdirSync(dist, { recursive: true });
for (const f of fs.readdirSync(dist)) if (/^pod-ai-chat.*\.zip$/.test(f)) fs.rmSync(path.join(dist, f));
fs.writeFileSync(path.join(dist, "pod-ai-chat.zip"), zip); fs.writeFileSync(path.join(dist, `pod-ai-chat-${version}.zip`), zip);
console.log(`pod-ai-chat ${version}: ${files.length} files, ${zip.length} bytes → apps/woocommerce-plugin/dist/`);
