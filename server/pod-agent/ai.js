/**
 * Multi-provider AI adapter for POD Agent.
 * Supports: OpenAI (ChatGPT), Anthropic, Gemini, Deepseek, Grok (xAI)
 */

const PROVIDERS = {
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    key: () => process.env.OPENAI_API_KEY,
    model: () => process.env.OPENAI_MODEL || "gpt-4o-mini",
    format: (system, user, model) => ({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    extract: (d) => d.choices?.[0]?.message?.content || ""
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    key: () => process.env.ANTHROPIC_API_KEY,
    model: () => process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    headers: () => ({ "anthropic-version": "2023-06-01" }),
    format: (system, user, model) => ({ model, max_tokens: 2048, system, messages: [{ role: "user", content: user }] }),
    extract: (d) => d.content?.[0]?.text || ""
  },
  gemini: {
    url: () => `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || "gemini-1.5-flash"}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    key: () => process.env.GEMINI_API_KEY,
    model: () => process.env.GEMINI_MODEL || "gemini-1.5-flash",
    format: (system, user) => ({ contents: [{ parts: [{ text: system + "\n\n" + user }] }] }),
    extract: (d) => d.candidates?.[0]?.content?.parts?.[0]?.text || ""
  },
  deepseek: {
    url: "https://api.deepseek.com/v1/chat/completions",
    key: () => process.env.DEEPSEEK_API_KEY,
    model: () => process.env.DEEPSEEK_MODEL || "deepseek-chat",
    format: (system, user, model) => ({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    extract: (d) => d.choices?.[0]?.message?.content || ""
  },
  grok: {
    url: "https://api.x.ai/v1/chat/completions",
    key: () => process.env.XAI_API_KEY || process.env.GROK_API_KEY,
    model: () => process.env.XAI_MODEL || process.env.GROK_MODEL || "grok-2",
    format: (system, user, model) => ({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
    extract: (d) => d.choices?.[0]?.message?.content || ""
  }
};

export function availableProviders() {
  return Object.entries(PROVIDERS).filter(([, p]) => p.key()).map(([id]) => id);
}

export async function callAI({ provider, system, user, timeout = 30000 }) {
  const p = PROVIDERS[provider];
  if (!p) return { text: "", error: "unknown_provider", provider };
  const key = p.key();
  if (!key) return { text: "", error: "not_configured", provider };
  const url = typeof p.url === "function" ? p.url() : p.url;
  const headers = { "Content-Type": "application/json", ...(p.headers ? p.headers() : {}), Authorization: `Bearer ${key}` };
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(p.format(system, user, p.model())), signal: AbortSignal.timeout(timeout) });
    if (!r.ok) return { text: "", error: `${r.status}`, provider };
    const d = await r.json();
    return { text: p.extract(d), provider, configured: true };
  } catch (e) {
    return { text: "", error: e.message, provider };
  }
}

export async function callAIAuto({ system, user, preferred = null }) {
  const available = availableProviders();
  const order = preferred ? [preferred, ...available.filter(p => p !== preferred)] : available;
  for (const provider of order) {
    const result = await callAI({ provider, system, user });
    if (result.text) return result;
  }
  return { text: "", error: "no_provider_available", available };
}
