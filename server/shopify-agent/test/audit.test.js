// Pod.AI boundary audit: runtime modules may only import Pod.AI files + a fixed list of neutral infrastructure
// (storage, encryption, read-only carrier API clients). Never the site agent, site services, site Shopify app or routes.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname), server = path.resolve(root, "..");
const ALLOWED = new Set(["saas-store.js", "utils/crypto.js", "logistics/yunexpress.js", "logistics/fourpx.js", "logistics/http.js"].map(p => path.join(server, p)));
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== "test") walk(p); } else if (p.endsWith(".js")) files.push(p); } })(root);
const outside = [];
for (const f of files) for (const m of fs.readFileSync(f, "utf8").matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)) {
  const target = path.resolve(path.dirname(f), m[1]);
  if (!target.startsWith(root + path.sep) && !ALLOWED.has(target)) outside.push(`${path.relative(server, f)} → ${path.relative(server, target)}`);
}
assert.deepEqual(outside, [], "Pod.AI imports outside its boundary");
for (const f of files) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /"agent_(settings|conversations|handoffs|discounts)"/, `${f} uses a site agent collection`);
console.log(JSON.stringify({ ok: true, modules: files.length, external_imports: [...ALLOWED].map(p => path.relative(server, p)) }));
