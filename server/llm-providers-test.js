// Optional LLM layer: local-only by default (zero outbound requests), every provider adapter against mocked HTTP,
// timeouts, max-token guard and fallback of the site chat to the local engine.
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "llm-"));
const LLM_VARS = ["LLM_ENABLED", "LLM_PROVIDER", "LLM_MODEL", "LLM_BASE_URL", "LLM_API_KEY", "LLM_TIMEOUT_MS", "LLM_MAX_TOKENS", "LLM_MAX_INPUT_CHARS", "OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL",
  "XAI_API_KEY", "XAI_MODEL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "DASHSCOPE_API_KEY", "QWEN_API_KEY", "DASHSCOPE_MODEL", "DASHSCOPE_BASE_URL", "MISTRAL_API_KEY", "MISTRAL_MODEL",
  "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_MODEL"];
const clear = () => { for (const k of LLM_VARS) delete process.env[k]; };
clear();
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"), APP_ENCRYPTION_KEY: "z".repeat(40) });

const realFetch = globalThis.fetch;
let calls = [], reply = null;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(url, opts);
  calls.push({ url: u, headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null, signal: opts.signal });
  return reply ? reply(u, opts) : new Response("{}", { status: 500 });
};
const json = d => new Response(JSON.stringify(d), { status: 200, headers: { "Content-Type": "application/json" } });
const P = await import("./shared/llm-providers.js");
const result = {};

// 1) Default: local only — even with every key present, nothing is enabled without LLM_ENABLED=true.
assert.equal(P.llmConfig().enabled, false); assert.equal(P.llmConfig().reason, "local_only");
Object.assign(process.env, { OPENAI_API_KEY: "sk-test", XAI_API_KEY: "x", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", DEEPSEEK_API_KEY: "d", DASHSCOPE_API_KEY: "q", MISTRAL_API_KEY: "m" });
assert.equal(P.llmConfig().enabled, false, "keys alone never enable the LLM");
assert.deepEqual(await P.complete({ system: "s", user: "u" }), { configured: false, text: "" });
await assert.rejects(P.chatComplete({ messages: [{ role: "user", content: "hi" }] }), /llm_disabled/);
assert.equal(calls.length, 0);
for (const v of ["false", "0", "", "no"]) { process.env.LLM_ENABLED = v; assert.equal(P.llmConfig().enabled, false, v); }
// config never contains key values
process.env.LLM_ENABLED = "true"; process.env.LLM_PROVIDER = "openai";
assert.ok(!JSON.stringify(P.llmConfig()).includes("sk-test")); assert.equal(P.llmConfig().key_name, "OPENAI_API_KEY");
clear(); result.default_local_only = "pass";

// 2) Adapters (mocked HTTP).
const openaiReply = () => json({ choices: [{ message: { role: "assistant", content: "ok-openai" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
const cases = [
  { p: "openai", env: { OPENAI_API_KEY: "k1", OPENAI_MODEL: "gpt-test" }, url: "https://api.openai.com/v1/chat/completions", auth: ["Authorization", "Bearer k1"], model: "gpt-test" },
  { p: "grok", env: { XAI_API_KEY: "k2" }, url: "https://api.x.ai/v1/chat/completions", auth: ["Authorization", "Bearer k2"], model: "grok-3-mini" },
  { p: "deepseek", env: { DEEPSEEK_API_KEY: "k3" }, url: "https://api.deepseek.com/chat/completions", auth: ["Authorization", "Bearer k3"], model: "deepseek-chat" },
  { p: "qwen", env: { QWEN_API_KEY: "k4", DASHSCOPE_MODEL: "qwen-max" }, url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions", auth: ["Authorization", "Bearer k4"], model: "qwen-max" },
  { p: "dashscope", env: { DASHSCOPE_API_KEY: "k4b", DASHSCOPE_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1/" }, url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", auth: ["Authorization", "Bearer k4b"], model: "qwen-plus" },
  { p: "mistral", env: { MISTRAL_API_KEY: "k5" }, url: "https://api.mistral.ai/v1/chat/completions", auth: ["Authorization", "Bearer k5"], model: "mistral-small-latest" },
  { p: "custom", env: { LLM_API_KEY: "k6", LLM_BASE_URL: "http://10.0.0.5:11434/v1", LLM_MODEL: "llama3" }, url: "http://10.0.0.5:11434/v1/chat/completions", auth: ["Authorization", "Bearer k6"], model: "llama3" },
  { p: "claude", env: { ANTHROPIC_API_KEY: "k7" }, url: "https://api.anthropic.com/v1/messages", auth: ["x-api-key", "k7"], model: "claude-3-5-haiku-latest",
    reply: () => json({ content: [{ type: "text", text: "ok-claude" }], usage: { input_tokens: 4, output_tokens: 1 } }), text: "ok-claude" },
  { p: "gemini", env: { GOOGLE_API_KEY: "k8", GEMINI_MODEL: "gemini-test" }, url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent", auth: ["x-goog-api-key", "k8"], model: null,
    reply: () => json({ candidates: [{ content: { parts: [{ text: "ok-gemini" }] } }], usageMetadata: { totalTokenCount: 9 } }), text: "ok-gemini" }
];
for (const c of cases) {
  clear(); calls = []; Object.assign(process.env, { LLM_ENABLED: "true", LLM_PROVIDER: c.p, LLM_MAX_TOKENS: "99999" }, c.env); reply = c.reply || openaiReply;
  const cfg = P.llmConfig(); assert.equal(cfg.enabled, true, c.p);
  const r = await P.complete({ system: "Answer only from the facts.", user: "Hi" });
  assert.equal(r.configured, true); assert.equal(r.text, c.text || "ok-openai", c.p);
  assert.equal(calls.length, 1, c.p); assert.equal(calls[0].url, c.url, c.p); assert.equal(calls[0].headers[c.auth[0]], c.auth[1], c.p);
  assert.ok(calls[0].signal, "every request has a timeout signal");
  const b = calls[0].body;
  if (c.model) assert.equal(b.model, c.model, c.p);
  if (cfg.kind === "openai") { assert.equal(b.max_tokens, 4000, "max-token guard clamps"); assert.equal(b.messages[0].role, "system"); }
  if (cfg.kind === "anthropic") { assert.equal(b.max_tokens, 4000); assert.equal(b.system, "Answer only from the facts."); assert.equal(b.messages[0].role, "user"); }
  if (cfg.kind === "gemini") { assert.equal(b.generationConfig.maxOutputTokens, 4000); assert.equal(b.system_instruction.parts[0].text, "Answer only from the facts."); }
}
// auto-detect: LLM_ENABLED + one key, no LLM_PROVIDER
clear(); Object.assign(process.env, { LLM_ENABLED: "1", ANTHROPIC_API_KEY: "k" }); assert.equal(P.llmConfig().provider, "anthropic");
// enabled but key missing → off, names the missing variable
clear(); Object.assign(process.env, { LLM_ENABLED: "true", LLM_PROVIDER: "mistral" }); assert.equal(P.llmConfig().enabled, false); assert.deepEqual(P.llmConfig().missing, ["MISTRAL_API_KEY"]);
clear(); Object.assign(process.env, { LLM_ENABLED: "true", LLM_PROVIDER: "custom", LLM_API_KEY: "k" }); assert.deepEqual(P.llmConfig().missing, ["LLM_BASE_URL", "LLM_MODEL"]);
// tool calling: only OpenAI-compatible providers receive tools
clear(); calls = []; Object.assign(process.env, { LLM_ENABLED: "true", LLM_PROVIDER: "xai", XAI_API_KEY: "k" }); reply = openaiReply;
await P.chatComplete({ messages: [{ role: "user", content: "x" }], tools: [{ type: "function", function: { name: "t", parameters: { type: "object" } } }] });
assert.equal(calls[0].body.tools.length, 1);
// input guard trims the oldest turns, keeps system + last user message
const fit = P.fitMessages([{ role: "system", content: "S" }, { role: "user", content: "a".repeat(3000) }, { role: "assistant", content: "b".repeat(3000) }, { role: "user", content: "last" }], 2000);
assert.deepEqual(fit.map(m => m.role), ["system", "user"]); assert.equal(fit[1].content, "last");
result.adapters = cases.map(c => c.p).join(",");

// 3) Timeout → error (caller falls back to the local engine).
clear(); Object.assign(process.env, { LLM_ENABLED: "true", LLM_PROVIDER: "openai", OPENAI_API_KEY: "k", LLM_TIMEOUT_MS: "1000" });
reply = (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(o.signal.reason || new Error("aborted"))));
const keep = setInterval(() => {}, 100); // AbortSignal.timeout timers do not keep the process alive on their own
const t0 = Date.now(); await assert.rejects(P.complete({ user: "slow" })); assert.ok(Date.now() - t0 < 4000); clearInterval(keep);
// HTTP error
reply = () => new Response("nope", { status: 429 }); await assert.rejects(P.complete({ user: "x" }), /llm_http_429/);
result.timeout_errors = "pass";

// 4) Site chat end-to-end: keys present but LLM_ENABLED unset → zero outbound requests, local answers.
clear(); Object.assign(process.env, { OPENAI_API_KEY: "sk", XAI_API_KEY: "x", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" }); calls = []; reply = null;
const { createApp } = await import("./create-app.js");
const server = (await createApp({ generatedDir: tmp })).listen(0); const base = `http://127.0.0.1:${server.address().port}`;
try {
  let conv;
  for (const q of ["hi", "Do you have t-shirts?", "and in blue?", "Write me a poem about our wedding", "Is the moon made of cheese?", "How long does delivery take?"]) {
    const r = await (await realFetch(base + "/api/pod-agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q, lang: "en", conversation_id: conv }) })).json();
    conv = r.conversation_id || conv; assert.equal(r.answered_by, "local", q); assert.ok(r.answer, q);
  }
  assert.equal(calls.length, 0, `no outbound calls by default (got ${calls.map(c => c.url).join(", ")})`);
  // LLM on but provider fails → local fallback answer
  Object.assign(process.env, { LLM_ENABLED: "true", LLM_PROVIDER: "openai", OPENAI_MODEL: "m" }); reply = () => new Response("{}", { status: 500 });
  const r = await (await realFetch(base + "/api/pod-agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Is the moon made of cheese?", lang: "en" }) })).json();
  assert.equal(r.answered_by, "local"); assert.ok(calls.length >= 1, "the enabled provider was tried");
  result.site_chat = "0 outbound by default; provider error → local fallback";
} finally { server.close(); clear(); globalThis.fetch = realFetch; }
console.log(JSON.stringify({ ok: true, ...result }, null, 2));
