// Multi-provider LLM call. Returns {text, configured}. Local-only by default: a provider is used only when
// LLM_ENABLED=true and its API key variable is set (see server/shared/llm-providers.js for all providers and env names).
// When it is off the caller falls back to its own local behaviour; no network request is made.
import { llmConfig, complete } from "../shared/llm-providers.js";

/** Active provider id ("openai", "xai", "anthropic", "gemini", "deepseek", "qwen", "mistral", "custom") or null. */
export function llmProvider() { const c = llmConfig(); return c.enabled ? c.provider : null; }

export const DEMO_MESSAGE = "后端已进入本地模式：如需大模型，请在 .env 中设置 LLM_ENABLED=true 以及所选提供商的 API Key（例如 OPENAI_API_KEY、XAI_API_KEY、ANTHROPIC_API_KEY、GEMINI_API_KEY、DEEPSEEK_API_KEY、DASHSCOPE_API_KEY、MISTRAL_API_KEY 或 LLM_BASE_URL+LLM_API_KEY）。";

export async function callLLM({ system, user }) {
  const r = await complete({ system, user });
  return r.configured ? { configured: true, text: r.text || "OK" } : { configured: false, text: DEMO_MESSAGE };
}
