#!/usr/bin/env node
// Pre-deploy test runner: every site test (server/*-test.js) and every Pod.AI test (server/shopify-agent/test/*.test.js).
// Each test runs in its own process with a clean environment (no .env secrets → no real e-mails, payments, carrier
// orders or LLM calls), a timeout, and a summary at the end. Exit code 1 if anything failed.
//   npm run test:all            all tests
//   npm run test:all -- chat    only tests whose file name contains "chat"
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filter = process.argv.slice(2).filter(a => !a.startsWith("-"));
const TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 180_000);
const list = dir => fs.readdirSync(path.join(root, dir)).filter(f => /(-test|\.test)\.js$/.test(f)).sort().map(f => path.join(dir, f));
const files = [...list("server"), ...list("server/shopify-agent/test"), ...list("server/woo-agent/test"), ...list("server/agent-api/test"), ...list("server/billing/test")].filter(f => !filter.length || filter.some(x => f.includes(x)));
// Clean environment: only what node needs. Tests set their own fake keys.
const env = { PATH: process.env.PATH, HOME: process.env.HOME || "/tmp", TMPDIR: process.env.TMPDIR || "/tmp", NODE_ENV: "test", LANG: "C.UTF-8", TZ: process.env.TZ || "Europe/Zurich" };

function run(file) {
  return new Promise(resolve => {
    const start = Date.now(); let out = "";
    const child = spawn(process.execPath, [file], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", d => (out += d)); child.stderr.on("data", d => (out += d));
    const timer = setTimeout(() => { out += `\n[test-all] timeout after ${TIMEOUT_MS} ms`; child.kill("SIGKILL"); }, TIMEOUT_MS);
    child.on("close", code => { clearTimeout(timer); resolve({ file, ok: code === 0, ms: Date.now() - start, out }); });
  });
}

const results = [];
for (const f of files) {
  const r = await run(f); results.push(r);
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${f}  (${(r.ms / 1000).toFixed(1)}s)`);
  if (!r.ok) console.log(r.out.split("\n").filter(l => !/^\[email:dev\]/.test(l)).slice(-25).map(l => `      ${l.slice(0, 300)}`).join("\n"));
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} test files passed${failed.length ? ` — FAILED: ${failed.map(r => r.file).join(", ")}` : ""}`);
process.exit(failed.length ? 1 : 0);
