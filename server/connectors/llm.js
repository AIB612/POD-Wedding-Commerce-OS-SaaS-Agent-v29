// Multi-provider LLM call. Returns {text, configured}. When no provider is configured the caller
// can fall back to its own demo behaviour instead of showing a configuration message to customers.
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30_000);

async function jsonFetch(url, options) {
  const r = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 500)}`);
  return r.json();
}

export function llmProvider() {
  const provider = (process.env.LLM_PROVIDER || "openai").toLowerCase();
  const ok = {
    openai: process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL,
    anthropic: process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL,
    gemini: process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL
  }[provider];
  return ok ? provider : null;
}

export const DEMO_MESSAGE = "后端已进入演示模式：请在 .env 中配置 OpenAI、Anthropic 或 Gemini 的 API Key 和模型名。";

export async function callLLM({ system, user }) {
  const provider = llmProvider();

  if (provider === "openai") {
    const data = await jsonFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL, input: [{ role: "system", content: system }, { role: "user", content: user }] })
    });
    return { configured: true, text: data.output_text || data.output?.flatMap(x => x.content || []).map(x => x.text || "").join("") || "已处理。" };
  }

  if (provider === "anthropic") {
    const data = await jsonFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL, max_tokens: 1200, system, messages: [{ role: "user", content: user }] })
    });
    return { configured: true, text: (data.content || []).map(x => x.text || "").join("") || "已处理。" };
  }

  if (provider === "gemini") {
    const model = encodeURIComponent(process.env.GEMINI_MODEL);
    const data = await jsonFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }] })
    });
    return { configured: true, text: data.candidates?.[0]?.content?.parts?.map(x => x.text || "").join("") || "已处理。" };
  }

  return { configured: false, text: DEMO_MESSAGE };
}
