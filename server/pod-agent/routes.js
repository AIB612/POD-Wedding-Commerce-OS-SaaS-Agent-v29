/**
 * POD Agent API routes.
 *   Public (storefront chat panel):  POST /api/pod-agent/chat, POST /api/pod-agent/feedback, GET /api/pod-agent/status
 *   Admin (behind the admin login):  /api/saas/agent/* — see server/routes/admin.js
 * Mount: app.use("/api/pod-agent", podAgentRouter());
 */
import { Router } from "express";
import { PODAgent } from "./index.js";
import { callAIAuto, availableProviders } from "./ai.js";
import { handleChat } from "./customer/agent.js";
import { llmStatus } from "./customer/llm.js";
import { findRecord, updateRecord } from "../saas-store.js";
import { rateLimit, ah } from "../http/middleware.js";
import { requireAdmin } from "../auth.js";

export function podAgentRouter({ store = null, connectors = {} } = {}) {
  const r = Router();
  const chatLimit = rateLimit({ bucket: "pod-agent-chat", windowMs: 60_000, max: 30 });

  r.get("/providers", requireAdmin, (_, res) => res.json({ available: availableProviders() }));
  // Public status for the panel: which mode answers (rules / llm), never key names or values.
  r.get("/status", (_, res) => { const s = llmStatus(); res.json({ ok: true, mode: s.mode }); });

  // Customer chat (homepage hero panel). Customer-safe tools only; see customer/agent.js.
  r.post("/chat", chatLimit, ah(async (req, res) => {
    const b = req.body || {};
    if (typeof b.message !== "string" || !b.message.trim()) return res.status(400).json({ error: "message_required" });
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await handleChat({ tenantId: req.tenantId || "tenant_demo", message: b.message, conversation_id: b.conversation_id, lang: b.lang, country: String(b.country || "").toUpperCase().slice(0, 2), page: b.page }));
  }));

  // 👍 / 👎 on an assistant reply (POD Agent metrics.recordFeedback): only for this conversation's own replies.
  r.post("/feedback", chatLimit, ah(async (req, res) => {
    const { conversation_id, index, rating } = req.body || {};
    const c = /^c_[a-z0-9]{12,40}$/.test(String(conversation_id || "")) ? await findRecord("agent_conversations", conversation_id) : null;
    const v = Number(rating) > 0 ? 1 : Number(rating) < 0 ? -1 : 0, i = Number(index);
    const m = c?.messages?.[i];
    if (!c || !v || !m || m.role !== "assistant") return res.status(400).json({ ok: false, error: "invalid_feedback" });
    m.feedback = v; m.feedback_at = new Date().toISOString();
    await updateRecord("agent_conversations", c.id, { messages: c.messages });
    res.json({ ok: true });
  }));

  // Back-office task runner (list products / fulfil / reply): admin only — it can push to shops and message customers.
  r.post("/task", requireAdmin, ah(async (req, res) => {
    const { intent, payload = {}, tenant = req.tenantId || "tenant_demo", autoApprove = false } = req.body || {};
    const agent = new PODAgent({ tenantId: tenant, connectors, store });
    res.json(await agent.handle({ intent, payload, autoApprove }));
  }));

  // Studio "describe a design" helper (studio-preview.js).
  r.post("/generate-design", chatLimit, ah(async (req, res) => {
    const { prompt, product_type = "general" } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "prompt_required" });
    const system = `Generate a print-ready design for ${String(product_type).slice(0, 40)}. Style: professional, high-resolution, suitable for print-on-demand. Transparent background preferred.`;
    const result = await callAIAuto({ system, user: String(prompt).slice(0, 1000) });
    res.json({ description: result.text, note: "Connect an image generation API (DALL-E, Stability AI) for actual image output", prompt_used: String(prompt).slice(0, 1000) });
  }));

  return r;
}
