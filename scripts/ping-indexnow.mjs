#!/usr/bin/env node
// Notify Bing/IndexNow of the public sitemap URLs for both hosts.
// Usage: node scripts/ping-indexnow.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const key = fs.readFileSync(path.join(root, "server/seo/indexnow.key"), "utf8").trim();
const hosts = {
  "podai.swisspro.site": ["/", "/woocommerce", "/support", "/privacy", "/terms", "/security", "/dpa"],
  "pod.swisspro.site": ["/", "/studio.html", "/shipping", "/returns", "/terms", "/privacy", "/imprint"],
};

async function ping(host, paths) {
  const urlList = paths.map(p => `https://${host}${p}`);
  const body = JSON.stringify({
    host,
    key,
    keyLocation: `https://${host}/${key}.txt`,
    urlList,
  });
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body,
  });
  const text = await res.text();
  return { host, status: res.status, body: text.slice(0, 200), urls: urlList.length };
}

const results = [];
for (const [host, paths] of Object.entries(hosts)) {
  results.push(await ping(host, paths));
}
console.log(JSON.stringify({ ok: results.every(r => r.status >= 200 && r.status < 300), results }, null, 2));
if (!results.every(r => r.status >= 200 && r.status < 300)) process.exit(1);
