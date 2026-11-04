// Pod.AI copy of the POD.AI Agent engine (server/pod-agent/customer). Pod.AI-only: edit here, never the site agent.
// LLM layer for the customer chat. Port of the POD Agent llm.js (chat / chatJson / runAgent tool loop) onto OUR
// provider configuration (server/connectors/llm.js: LLM_PROVIDER + <PROVIDER>_API_KEY + <PROVIDER>_MODEL).
// Tool calling uses the OpenAI-compatible chat-completions format: openai/chatgpt, xai/grok, deepseek.
// anthropic / gemini: no tool loop here — the rule engine runs the tools and the model only answers open questions.
// No key configured → { available:false } and the agent answers with the deterministic rule engine.
import { llmProvider, callLLM } from "./llm-provider.js";

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30_000);
const COMPAT = {
  openai: () => ({ url: "https://api.openai.com/v1/chat/completions", key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL }),
  chatgpt: () => ({ url: "https://api.openai.com/v1/chat/completions", key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL }),
  xai: () => ({ url: "https://api.x.ai/v1/chat/completions", key: process.env.XAI_API_KEY, model: process.env.XAI_MODEL }),
  grok: () => ({ url: "https://api.x.ai/v1/chat/completions", key: process.env.XAI_API_KEY, model: process.env.XAI_MODEL }),
  deepseek: () => ({ url: "https://api.deepseek.com/chat/completions", key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL || "deepseek-chat" })
};
const KEY_NAMES = { openai: ["OPENAI_API_KEY", "OPENAI_MODEL"], chatgpt: ["OPENAI_API_KEY", "OPENAI_MODEL"], anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"], gemini: ["GEMINI_API_KEY", "GEMINI_MODEL"],
  deepseek: ["DEEPSEEK_API_KEY", "DEEPSEEK_MODEL"], grok: ["XAI_API_KEY", "XAI_MODEL"], xai: ["XAI_API_KEY", "XAI_MODEL"] };

/** What is configured (names only, never values). */
export function llmStatus() {
  const wanted = (process.env.LLM_PROVIDER || "openai").toLowerCase(), provider = llmProvider();
  return { provider, wanted, available: !!provider, tool_calling: !!(provider && COMPAT[provider]),
    missing: provider ? [] : (KEY_NAMES[wanted] || KEY_NAMES.openai).filter(n => !process.env[n]), mode: provider ? (COMPAT[provider] ? "llm_tools" : "llm_answers") : "rules" };
}

async function chat({ messages, tools, json = false }) {
  const p = COMPAT[llmProvider()]?.();
  if (!p?.key) throw new Error("llm_not_configured");
  const body = { model: p.model, messages, temperature: 0.2 };
  if (tools?.length) { body.tools = tools; body.tool_choice = "auto"; }
  if (json) body.response_format = { type: "json_object" };
  const r = await fetch(p.url, { method: "POST", headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`llm_http_${r.status}`);
  const d = await r.json(), choice = d?.choices?.[0];
  if (!choice?.message) throw new Error("llm_empty_response");
  return { message: choice.message, tokens: (d.usage?.prompt_tokens || 0) + (d.usage?.completion_tokens || 0) };
}
export function parseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { const m = String(text).match(/\{[\s\S]*\}/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }
}
export async function chatJson({ system, user }) {
  const res = await chat({ json: true, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  return { data: parseJson(res.message.content), tokens: res.tokens };
}

/** POD Agent runAgent(): model ↔ tools until a final answer, max `maxToolCalls` executions, then a final call without tools. */
export async function runToolLoop({ messages, tools, executeTool, maxToolCalls = 4 }) {
  const convo = [...messages], toolLog = []; let tokens = 0;
  for (let round = 0; round < maxToolCalls + 1; round++) {
    const allow = toolLog.length < maxToolCalls;
    const res = await chat({ messages: convo, tools: allow ? tools : undefined });
    tokens += res.tokens;
    const calls = (allow && res.message.tool_calls) || [];
    if (!calls.length) return { text: String(res.message.content || "").trim(), toolLog, tokens };
    convo.push({ role: "assistant", content: res.message.content || "", tool_calls: calls });
    for (const call of calls) {
      let args = {}; try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch { args = {}; }
      let result;
      if (toolLog.length >= maxToolCalls) result = { ok: false, error: "Tool call limit reached for this message. Answer with what you have." };
      else { try { result = await executeTool(call.function?.name, args); } catch (e) { result = { ok: false, error: e.message }; } }
      toolLog.push({ name: call.function?.name, args, ok: !!result?.ok });
      convo.push({ role: "tool", tool_call_id: call.id, name: call.function?.name, content: JSON.stringify(result).slice(0, 8000) });
    }
  }
  const res = await chat({ messages: convo });
  return { text: String(res.message.content || "").trim(), toolLog, tokens: tokens + res.tokens };
}

/** Plain answer (any configured provider, incl. anthropic / gemini) for open questions, grounded on knowledge snippets. */
export async function answerOpenQuestion({ system, user }) {
  const r = await callLLM({ system, user });
  return r.configured ? String(r.text || "").trim() : "";
}
export { llmProvider };
