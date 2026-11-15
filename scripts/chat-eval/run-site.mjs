// Runs the site-chat evaluation set against a code tree (default: this repo) with ALL outbound network blocked.
// Usage: node scripts/chat-eval/run-site.mjs [--root <repo dir>] [--out result.json] [--verbose]
// Reports correctness (all expectations of a case pass) and a 0–5 naturalness rubric per answer:
//   lang (reply in the shopper's language) · concise (≤ 400 chars, ≤ 170 for zh) · no dump (no bullet lists, Q:/A:, raw URLs, "Label: spec; spec" openings, >3 price figures, repeated sentences)
//   direct (first sentence short) · next step (a question, a link, chips or cards offered)
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath, pathToFileURL } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const root = path.resolve(arg("--root") || path.join(here, "..", ".."));
const verbose = process.argv.includes("--verbose");
const { CASES, ALWAYS_NOT } = await import(pathToFileURL(path.join(here, "site-cases.mjs")));
const { detectLanguage } = await import(pathToFileURL(path.join(here, "..", "..", "server", "shared", "lang-terms.js")));

Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", PAYPAL_CLIENT_ID: "test-client", PAYPAL_CLIENT_SECRET: "test-secret" });
delete process.env.STORE_PERSIST_PATH; delete process.env.LLM_ENABLED;
for (const k of Object.keys(process.env)) if (/_API_KEY$|^LLM_/.test(k) && k !== "ADMIN_API_KEY") delete process.env[k];
// Block and count every outbound request (the local engine must answer without any external API).
const realFetch = globalThis.fetch; let outbound = 0; const outboundHosts = new Set();
globalThis.fetch = (url, opts) => { const u = new URL(String(url?.url || url)); if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname)) { outbound++; outboundHosts.add(u.hostname); return Promise.reject(new Error("outbound_blocked")); } return realFetch(url, opts); };

process.chdir(root);
const { createApp } = await import(pathToFileURL(path.join(root, "server", "create-app.js")));
const app = await createApp({ generatedDir: fs.mkdtempSync(path.join(os.tmpdir(), "eval-")) });
const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
const ask = async (message, lang, conversation_id, country = "CH") => { const t0 = performance.now(); const r = await (await realFetch(base + "/api/pod-agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, lang, conversation_id, country }) })).json(); r._ms = performance.now() - t0; return r; };

const CJK = /[\u3400-\u9fff]/g;
function rubric(c, r) {
  const a = String(r.answer || ""), zh = c.lang === "zh";
  const det = zh ? ((a.match(CJK) || []).length >= 4 ? "zh" : "x") : detectLanguage(a.replace(/https?:\/\/\S+|\/[\w./?=&%-]+/g, ""), c.lang);
  const lang = zh ? det === "zh" : c.lang === "en" ? !["de", "fr", "it", "zh"].includes(det) || det === "en" : det === c.lang;
  const concise = a.length <= (zh ? 170 : 400);
  const sentences = a.split(/(?<=[.!?。！？])\s*/).map(s => s.trim()).filter(Boolean);
  const dump = /(^|\n)\s*[-•*]\s.*(\n\s*[-•*]\s.*){2,}/.test(a) || /\bQ:|\bA:/.test(a) || /\/studio\.html\?/.test(a.replace(/\]\([^)]*\)/g, "")) || /^[^.!?。:：]{2,40}[:：]\s/.test(a) || (a.match(/(CHF|EUR|USD) \d/g) || []).length > 3 || new Set(sentences).size < sentences.length;
  const direct = (sentences[0] || "").length <= (zh ? 70 : 150);
  const ui = r.ui || [];
  const next = /[?？]/.test(a) || /\]\(|https?:\/\/|\/(account|studio|shipping|returns)/.test(a) || ui.some(u => ["chips", "products", "quote", "order", "tracking"].includes(u.type));
  const parts = { lang, concise, no_dump: !dump, direct, next_step: next };
  return { score: Object.values(parts).filter(Boolean).length, parts };
}

const results = [];
for (const c of CASES) {
  let conv, r;
  for (const t of c.turns) { r = await ask(t, c.lang, conv, c.country || "CH"); conv = r.conversation_id || conv; }
  const a = String(r.answer || ""), fails = [];
  for (const re of c.re || []) if (!re.test(a)) fails.push(`missing ${re}`);
  if (c.any && !c.any.some(re => re.test(a))) fails.push(`none of ${c.any.join(" ")}`);
  for (const re of [...(c.not || []), ...ALWAYS_NOT]) if (re.test(a)) fails.push(`forbidden ${re}`);
  if (c.ui && !(r.ui || []).some(u => u.type === c.ui)) fails.push(`no ui ${c.ui}`);
  // recommendation cases: number of product cards [min, max], every card real (price + link + reason) and optional per-card check
  const cards = (r.ui || []).filter(u => u.type === "products").flatMap(u => u.items || []);
  if (c.cards) { if (cards.length < c.cards[0] || cards.length > c.cards[1]) fails.push(`cards ${cards.length} not in ${c.cards}`);
    for (const it of cards) if (it.unit_price == null || !/^\/studio\.html\?/.test(it.link || "") || !it.reason) fails.push(`card ${it.id} incomplete`); }
  if (c.card) for (const it of cards) { const e = c.card(it); if (e) fails.push(`${it.id}: ${e}`); }
  if (c.chips) { const ch = (r.ui || []).find(u => u.type === "chips")?.items || []; for (const re of c.chips) if (!ch.some(x => re.test(x.label || x))) fails.push(`no chip ${re}`); }
  const nat = rubric(c, r);
  results.push({ id: c.id, lang: c.lang, q: c.turns.join(" ⟶ "), answer: a, intent: r.intent, ui: (r.ui || []).map(u => u.type), ms: Math.round(r._ms), pass: !fails.length, fails, nat: nat.score, nat_parts: nat.parts });
  if (verbose) console.log(`${fails.length ? "FAIL" : "ok  "} ${c.id} [${r.intent}] nat=${nat.score} ${fails.join("; ")}\n     ${a.replace(/\n/g, " ⏎ ").slice(0, 260)}`);
}
server.close();
const n = results.length, pass = results.filter(x => x.pass).length, nat = results.reduce((s, x) => s + x.nat, 0) / n;
const openers = new Set(results.map(x => x.answer.split(/\s+/).slice(0, 3).join(" ").toLowerCase()));
const per = k => Math.round(100 * results.filter(x => x.nat_parts[k]).length / n);
const summary = { root, cases: n, passed: pass, correctness_pct: Math.round(1000 * pass / n) / 10, naturalness_avg_of_5: Math.round(nat * 100) / 100,
  rubric_pct: { lang: per("lang"), concise: per("concise"), no_dump: per("no_dump"), direct: per("direct"), next_step: per("next_step") },
  distinct_openers_pct: Math.round(100 * openers.size / n), avg_ms: Math.round(results.reduce((s, x) => s + x.ms, 0) / n), outbound_requests: outbound, outbound_hosts: [...outboundHosts] };
console.log(JSON.stringify(summary, null, 2));
const out = arg("--out"); if (out) fs.writeFileSync(out, JSON.stringify({ summary, results }, null, 2));
process.exit(0);
