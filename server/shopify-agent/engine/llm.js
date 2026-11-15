// Pod.AI copy of the POD.AI Agent engine (server/pod-agent/customer). Pod.AI-only: edit here, never the site agent.
// LLM layer for the customer chat. Port of the POD Agent llm.js (chat / chatJson / runAgent tool loop) onto OUR
// provider configuration (server/connectors/llm.js: LLM_PROVIDER + <PROVIDER>_API_KEY + <PROVIDER>_MODEL).
// Tool calling uses the OpenAI-compatible chat-completions format: openai, xai/grok, deepseek, qwen, mistral, custom.
// anthropic / gemini: no tool loop here — the rule engine runs the tools and the model only answers open questions.
// No key configured → { available:false } and the agent answers with the deterministic rule engine.
import { llmProvider, callLLM } from "./llm-provider.js";

import { llmConfig, chatComplete } from "../../shared/llm-providers.js";

/** What is configured (names only, never values). Local-only unless LLM_ENABLED=true and a provider key is set. */
export function llmStatus() {
  const c = llmConfig();
  return { provider: c.enabled ? c.provider : null, wanted: (process.env.LLM_PROVIDER || "").toLowerCase() || null, available: c.enabled, tool_calling: c.enabled && c.tool_calling,
    model: c.enabled ? c.model : null, key_name: c.key_name, timeout_ms: c.timeout_ms, max_tokens: c.max_tokens, missing: c.missing, reason: c.reason,
    mode: c.enabled ? (c.tool_calling ? "llm_tools" : "llm_answers") : "rules" };
}

async function chat({ messages, tools, json = false }) {
  const c = llmConfig();
  if (!c.enabled) throw new Error("llm_not_configured");
  const r = await chatComplete({ messages, tools: c.tool_calling ? tools : undefined, json }, c);
  return { message: r.message, tokens: r.tokens };
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
