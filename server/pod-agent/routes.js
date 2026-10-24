/**
 * POD Agent API routes.
 * Mount: app.use("/api/pod-agent", podAgentRouter());
 */
import { Router } from "express";
import { PODAgent } from "./index.js";
import { callAIAuto, availableProviders } from "./ai.js";

export function podAgentRouter({ store = null, connectors = {} } = {}) {
  const r = Router();

  r.get("/providers", (_, res) => res.json({ available: availableProviders() }));

  r.post("/chat", async (req, res) => {
    const { message, tenant = "demo", lang = "en", provider = null } = req.body || {};
    if (!message) return res.status(400).json({ error: "message_required" });
    const system = `You are a POD (Print-on-Demand) e-commerce assistant. Help with product listing, order fulfillment, shipping, and customer service. Be concise and professional. Language: ${lang}.`;
    const result = await callAIAuto({ system, user: String(message).slice(0, 2000), preferred: provider });
    res.json({ answer: result.text || "I can help with product listing, orders, and shipping. Please configure an AI provider.", provider: result.provider, available: availableProviders() });
  });

  r.post("/task", async (req, res) => {
    const { intent, payload = {}, tenant = "demo", autoApprove = false } = req.body || {};
    const agent = new PODAgent({ tenantId: tenant, connectors, store });
    const result = await agent.handle({ intent, payload, autoApprove });
    res.json(result);
  });

  
  r.post("/generate-design", async (req, res) => {
    const { prompt, product_type = "general" } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "prompt_required" });
    const system = `Generate a print-ready design for ${product_type}. Style: professional, high-resolution, suitable for print-on-demand. Transparent background preferred.`;
    const result = await callAIAuto({ system, user: prompt });
    // In production, this would call an image generation API (DALL-E, Midjourney, etc.)
    // For now, return a placeholder or the text description
    res.json({ 
      description: result.text,
      note: "Connect an image generation API (DALL-E, Stability AI) for actual image output",
      prompt_used: prompt
    });
  });

  return r;
}
