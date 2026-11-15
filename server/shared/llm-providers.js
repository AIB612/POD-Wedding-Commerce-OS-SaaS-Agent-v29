// Optional LLM layer shared by the site chat (POD.AI Agent), the Studio orchestrator and Pod.AI.
//
// DEFAULT = LOCAL ONLY. Nothing here ever makes a network call unless BOTH are true:
//   1. LLM_ENABLED=true (or 1 / yes / on), and
//   2. the API key variable of the selected provider is set.
// Keys are read by variable NAME at call time and are never logged, returned or stored.
//
// Providers (LLM_PROVIDER, or auto-detected from the first key present):
//   openai     OPENAI_API_KEY       OPENAI_MODEL      (OPENAI_BASE_URL optional)        OpenAI-compatible, tool calling
//   xai        XAI_API_KEY          XAI_MODEL         alias: grok                        OpenAI-compatible, tool calling
//   deepseek   DEEPSEEK_API_KEY     DEEPSEEK_MODEL                                       OpenAI-compatible, tool calling
//   qwen       DASHSCOPE_API_KEY    DASHSCOPE_MODEL   (DASHSCOPE_BASE_URL) alias: dashscope, QWEN_API_KEY accepted
//   mistral    MISTRAL_API_KEY      MISTRAL_MODEL                                        OpenAI-compatible, tool calling
//   custom     LLM_API_KEY + LLM_BASE_URL (any OpenAI-compatible endpoint, e.g. a local Ollama/vLLM)  alias: compatible
//   anthropic  ANTHROPIC_API_KEY    ANTHROPIC_MODEL   alias: claude                      native Messages API (answers only)
//   gemini     GEMINI_API_KEY       GEMINI_MODEL      alias: google, GOOGLE_API_KEY accepted   native generateContent (answers only)
// Common: LLM_MODEL (overrides the provider model), LLM_TIMEOUT_MS (default 15000), LLM_MAX_TOKENS (default 600, 64–4000),
//         LLM_MAX_INPUT_CHARS (default 24000; older context is trimmed first).

const PROVIDERS = {
  openai: { kind: "openai", keys: ["OPENAI_API_KEY"], model: "OPENAI_MODEL", def: "gpt-4o-mini", base: () => process.env.OPENAI_BASE_URL || "https://api.openai.com/v1" },
  xai: { kind: "openai", keys: ["XAI_API_KEY"], model: "XAI_MODEL", def: "grok-3-mini", base: () => "https://api.x.ai/v1" },
  deepseek: { kind: "openai", keys: ["DEEPSEEK_API_KEY"], model: "DEEPSEEK_MODEL", def: "deepseek-chat", base: () => "https://api.deepseek.com" },
  qwen: { kind: "openai", keys: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"], model: "DASHSCOPE_MODEL", def: "qwen-plus", base: () => process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
  mistral: { kind: "openai", keys: ["MISTRAL_API_KEY"], model: "MISTRAL_MODEL", def: "mistral-small-latest", base: () => "https://api.mistral.ai/v1" },
  custom: { kind: "openai", keys: ["LLM_API_KEY"], model: "LLM_MODEL", def: "", base: () => process.env.LLM_BASE_URL || "" },
  anthropic: { kind: "anthropic", keys: ["ANTHROPIC_API_KEY"], model: "ANTHROPIC_MODEL", def: "claude-3-5-haiku-latest", base: () => "https://api.anthropic.com/v1" },
  gemini: { kind: "gemini", keys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], model: "GEMINI_MODEL", def: "gemini-2.0-flash", base: () => "https://generativelanguage.googleapis.com/v1beta" }
};
const ALIASES = { grok: "xai", chatgpt: "openai", dashscope: "qwen", claude: "anthropic", google: "gemini", compatible: "custom", "openai-compatible": "custom" };
export const PROVIDER_IDS = Object.keys(PROVIDERS);

const truthy = v => /^(1|true|yes|on)$/i.test(String(v || "").trim());
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : d; };
const keyName = p => p.keys.find(k => process.env[k]) || null;

/**
 * Current LLM configuration — names only, never key values.
 * { enabled, provider, kind, model, key_name, base_url, timeout_ms, max_tokens, tool_calling, reason, missing[] }
 */
export function llmConfig(env = process.env) {
  const timeout_ms = num(env.LLM_TIMEOUT_MS, 15000, 1000, 120000), max_tokens = num(env.LLM_MAX_TOKENS, 600, 64, 4000);
  const base = { enabled: false, provider: null, kind: null, model: null, key_name: null, base_url: null, timeout_ms, max_tokens, tool_calling: false, missing: [] };
  if (!truthy(env.LLM_ENABLED)) return { ...base, reason: "local_only", missing: ["LLM_ENABLED"] };
  const wanted = String(env.LLM_PROVIDER || "").toLowerCase().trim();
  const id = ALIASES[wanted] || wanted || PROVIDER_IDS.find(k => PROVIDERS[k].keys.some(n => env[n]) && (k !== "custom" || env.LLM_BASE_URL));
  const p = PROVIDERS[id];
  if (!p) return { ...base, reason: wanted ? "unknown_provider" : "no_key", missing: wanted ? ["LLM_PROVIDER"] : ["<PROVIDER>_API_KEY"] };
  const k = p.keys.find(n => env[n]) || null, url = p.base();
  const missing = [...(k ? [] : [p.keys[0]]), ...(id === "custom" && !url ? ["LLM_BASE_URL"] : []), ...(id === "custom" && !env.LLM_MODEL ? ["LLM_MODEL"] : [])];
  const model = env.LLM_MODEL || env[p.model] || p.def;
  if (missing.length) return { ...base, provider: id, kind: p.kind, reason: "missing_env", missing };
  return { ...base, enabled: true, provider: id, kind: p.kind, model, key_name: k, base_url: url.replace(/\/+$/, ""), tool_calling: p.kind === "openai", reason: "enabled" };
}

/** Trim the oldest non-system messages until the prompt fits LLM_MAX_INPUT_CHARS. */
export function fitMessages(messages, maxChars = num(process.env.LLM_MAX_INPUT_CHARS, 24000, 2000, 400000)) {
  const out = messages.map(m => ({ ...m }));
  const size = () => out.reduce((s, m) => s + String(m.content || "").length + JSON.stringify(m.tool_calls || "").length, 0);
  while (size() > maxChars) {
    const i = out.findIndex((m, idx) => m.role !== "system" && idx < out.length - 1);
    if (i < 0) { const last = out[out.length - 1]; last.content = String(last.content || "").slice(-maxChars); break; }
    out.splice(i, 1);
  }
  return out;
}

async function post(url, headers, body, timeoutMs) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) { const e = new Error(`llm_http_${r.status}`); e.status = r.status; throw e; }
  return r.json();
}

/**
 * One chat turn. messages: OpenAI-style [{role, content, tool_calls?, tool_call_id?}].
 * tools (OpenAI function format) are honoured only by OpenAI-compatible providers.
 * → { message: { content, tool_calls? }, tokens, provider, model }
 */
export async function chatComplete({ messages, tools, json = false, temperature = 0.2, maxTokens } = {}, cfg = llmConfig()) {
  if (!cfg.enabled) throw new Error("llm_disabled");
  const key = process.env[cfg.key_name], max_tokens = Math.min(cfg.max_tokens, maxTokens || cfg.max_tokens), msgs = fitMessages(messages);
  if (cfg.kind === "openai") {
    const body = { model: cfg.model, messages: msgs, temperature, max_tokens };
    if (tools?.length) { body.tools = tools; body.tool_choice = "auto"; }
    if (json) body.response_format = { type: "json_object" };
    const d = await post(`${cfg.base_url}/chat/completions`, { Authorization: `Bearer ${key}` }, body, cfg.timeout_ms);
    const m = d?.choices?.[0]?.message; if (!m) throw new Error("llm_empty_response");
    return { message: m, tokens: (d.usage?.prompt_tokens || 0) + (d.usage?.completion_tokens || 0), provider: cfg.provider, model: cfg.model };
  }
  // Native adapters: tool messages are folded into plain text (the rule engine already ran the tools).
  const system = msgs.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const turns = msgs.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "assistant" : "user", text: m.role === "tool" ? `Tool result: ${m.content}` : String(m.content || "") })).filter(t => t.text);
  const merged = []; for (const t of turns) { const last = merged[merged.length - 1]; if (last && last.role === t.role) last.text += "\n\n" + t.text; else merged.push({ ...t }); }
  if (!merged.length || merged[0].role !== "user") merged.unshift({ role: "user", text: "(start)" });
  const sys = json ? `${system}\n\nReply with one JSON object only.` : system;
  if (cfg.kind === "anthropic") {
    const d = await post(`${cfg.base_url}/messages`, { "x-api-key": key, "anthropic-version": "2023-06-01" },
      { model: cfg.model, max_tokens, temperature, ...(sys ? { system: sys } : {}), messages: merged.map(t => ({ role: t.role, content: t.text })) }, cfg.timeout_ms);
    const text = (d.content || []).filter(x => x.type === "text" || x.text).map(x => x.text || "").join("");
    if (!text) throw new Error("llm_empty_response");
    return { message: { content: text }, tokens: (d.usage?.input_tokens || 0) + (d.usage?.output_tokens || 0), provider: cfg.provider, model: cfg.model };
  }
  if (cfg.kind === "gemini") {
    const d = await post(`${cfg.base_url}/models/${encodeURIComponent(cfg.model)}:generateContent`, { "x-goog-api-key": key },
      { ...(sys ? { system_instruction: { parts: [{ text: sys }] } } : {}), contents: merged.map(t => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] })),
        generationConfig: { temperature, maxOutputTokens: max_tokens, ...(json ? { responseMimeType: "application/json" } : {}) } }, cfg.timeout_ms);
    const text = d.candidates?.[0]?.content?.parts?.map(x => x.text || "").join("") || "";
    if (!text) throw new Error("llm_empty_response");
    return { message: { content: text }, tokens: d.usageMetadata?.totalTokenCount || 0, provider: cfg.provider, model: cfg.model };
  }
  throw new Error("llm_unknown_kind");
}

/** Plain completion: { configured, text }. configured=false (no call made) when the LLM mode is off. */
export async function complete({ system, user, maxTokens } = {}) {
  const cfg = llmConfig();
  if (!cfg.enabled) return { configured: false, text: "" };
  const r = await chatComplete({ messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: user }], maxTokens }, cfg);
  return { configured: true, text: String(r.message.content || "").trim(), tokens: r.tokens };
}
