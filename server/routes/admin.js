// Authenticated back-office routes (SaaS admin, Shopify, refunds, ops agent, MCP / A2A tools).
import express from "express";
import { ah } from "../http/middleware.js";
import { requireAdmin, requireApproval } from "../auth.js";
import { runOpsCommand } from "../services/agent-ops-service.js";
import { overview } from "../services/overview-service.js";
import { catalogOverview, importProducts } from "../services/catalog-service.js";
import { financeSummary } from "../services/finance-service.js";
import { marketingSummary, optimizationIdeas } from "../services/marketing-service.js";
import { customerProfiles, aggregateSegments } from "../services/profile-service.js";
import { recommendations } from "../services/recommendation-service.js";
import { affiliateSummary } from "../services/affiliate-service.js";
import { tasks, approveTask, createTask } from "../services/task-service.js";
import { listProofs, updateProof } from "../services/proof-service.js";
import { discoverInfluencers, creatorSources } from "../connectors/social.js";
import { platformStatus, createCampaignDraft, publishCampaign } from "../connectors/marketing.js";
import { logisticsProviderStatus } from "../connectors/logistics.js";
import { logisticsOverview, quoteShipping, trackingDetail, saveShippingZone, syncLogisticsToStores, syncTenantShipments } from "../services/shipping-service.js";
import { connectorRegistry, connectorDetail, saveConnectorConfig, testConnector, getConnectorCredentials } from "../services/connector-config-service.js";
import { listDataEntities, previewImport, commitImport, exportEntity, templateWorkbookBuffer } from "../services/data-exchange-service.js";
import { customerProfileDetail } from "../services/profile-service.js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { commerceChannelStatus } from "../connectors/commerce.js";
import { messagingStatus, sendMessageDraft } from "../connectors/messaging.js";
import { buildOAuthStart, verifyCallbackQuery, exchangeCode, syncProductsDemo, syncOrdersDemo } from "../connectors/shopify-multistore.js";
import { refundCapture } from "../connectors/paypal.js";
import { markConnected } from "../services/studio-connections.js";
import { protocolRegistry } from "../protocols/commerce-protocols.js";
import { addRecord, findRecord, listForTenant, updateRecord } from "../saas-store.js";
import { sendEmail } from "../services/email-service.js";
import { baseUrl } from "../config.js";

// Never send credentials (even encrypted) to the browser.
const publicStore = ({ token_encrypted, encrypted_access_token, ...s }) => s;
const findStore = async (tenantId, id) => (await listForTenant("stores", tenantId)).find(x => x.id === id);

// Import previews live for 10 minutes, per tenant; expired ones are pruned on every preview.
const importPreviews = new Map();
const PREVIEW_TTL_MS = 10 * 60_000, MAX_PREVIEWS = 50;
function prunePreviews() { const now = Date.now(); for (const [k, v] of importPreviews) if (v.expires < now) importPreviews.delete(k); while (importPreviews.size > MAX_PREVIEWS) importPreviews.delete(importPreviews.keys().next().value); }
const badRequest = (res, e) => res.status(400).json({ error: e.message });

export function adminRouter({ root } = {}) {
  const r = express.Router();
  const A = requireAdmin, AP = [requireAdmin, requireApproval];

  // MCP-style tool endpoint & A2A entry — they expose tenant data and stage tasks, so they require admin auth.
  r.post("/api/protocols/mcp", A, ah(async (req, res) => {
    if (process.env.ENABLE_MCP_TOOL_ENDPOINT === "false") return res.sendStatus(404);
    const { method, id, params } = req.body || {};
    const ok = text => res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } });
    if (method === "tools/list") return res.json({ jsonrpc: "2.0", id, result: { tools: [
      { name: "commerce_overview", description: "Read tenant commerce overview", inputSchema: { type: "object", properties: {} } },
      { name: "marketing_summary", description: "Read unified marketing metrics", inputSchema: { type: "object", properties: {} } },
      { name: "create_task", description: "Stage an operational task", inputSchema: { type: "object", properties: { type: { type: "string" }, title: { type: "string" } }, required: ["type", "title"] } }
    ] } });
    if (method === "tools/call" && params?.name === "commerce_overview") return ok(JSON.stringify(await overview(req.tenantId)));
    if (method === "tools/call" && params?.name === "marketing_summary") return ok(JSON.stringify(await marketingSummary(req.tenantId)));
    if (method === "tools/call" && params?.name === "create_task") return ok(JSON.stringify(await createTask(req.tenantId, params.arguments || {})));
    res.status(400).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method/tool not implemented in scaffold" } });
  }));
  r.post("/api/a2a", A, ah(async (req, res) => {
    const message = req.body?.message || req.body?.parts?.map?.(p => p.text).filter(Boolean).join(" ") || "";
    res.json({ status: "completed", result: await runOpsCommand({ tenantId: req.tenantId, message: String(message).slice(0, 4000) }) });
  }));
  r.post("/api/agent/ops", A, ah(async (req, res) => res.json(await runOpsCommand({ tenantId: req.tenantId, message: String(req.body?.message || "").slice(0, 4000) }))));

  // SaaS dashboard read APIs
  r.get("/api/saas/overview", A, ah(async (req, res) => res.json(await overview(req.tenantId))));
  r.get("/api/saas/stores", A, ah(async (req, res) => res.json((await listForTenant("stores", req.tenantId)).map(publicStore))));
  r.get("/api/saas/orders", A, ah(async (req, res) => res.json(await listForTenant("orders", req.tenantId))));
  r.get("/api/saas/users", A, ah(async (req, res) => res.json((await listForTenant("customer_accounts", req.tenantId)).map(({password_hash,password_salt,...u})=>u))));
  r.get("/api/saas/studio-projects", A, ah(async (req, res) => res.json(await listForTenant("studio_projects", req.tenantId))));
  r.get("/api/saas/notifications", A, ah(async (req, res) => res.json(await listForTenant("notifications", req.tenantId))));
  r.get("/api/saas/invitations", A, ah(async (req, res) => res.json(await listForTenant("invitations", req.tenantId))));
  r.get("/api/saas/order-events", A, ah(async (req, res) => res.json(await listForTenant("order_events", req.tenantId))));
  r.post("/api/saas/users/:id/status", AP, ah(async (req,res)=>{const status=["active","disabled"].includes(req.body?.status)?req.body.status:null;if(!status)return res.status(400).json({error:"invalid_status"});const row=await updateRecord("customer_accounts",req.params.id,{status,updated_at:new Date().toISOString()});row?res.json({id:row.id,status:row.status}):res.sendStatus(404);}));
  r.post("/api/saas/orders/:id/status", AP, ah(async (req,res)=>{
    const allowed=["Quote requested","Order requested","Sample requested","Proof ready","Changes requested","Approved","Production","Shipped","Delivered","Cancelled"];
    const status=String(req.body?.status||"").slice(0,80);if(!allowed.includes(status))return res.status(400).json({error:"invalid_status",allowed});
    const row=await updateRecord("orders",req.params.id,{status,updated_at:new Date().toISOString()});if(!row)return res.sendStatus(404);
    const evt=await addRecord("order_events",{id:`evt_${crypto.randomBytes(6).toString("hex")}`,tenant_id:req.tenantId,order_id:row.id,event_type:"status_changed",source:"admin",payload:{status,note:String(req.body?.note||"").slice(0,500)},event_time:new Date().toISOString()});
    let email_status="not_applicable";
    if(row.customer_email){const mail=await sendEmail({tenantId:req.tenantId,userId:row.user_id||null,to:row.customer_email,type:"order_status",related_id:row.id,subject:`Order update · ${row.id}`,text:`Your order status is now: ${status}. Follow it at ${baseUrl()}/account.html`,html:`<p>Order <b>${row.id}</b></p><p>Status: <b>${String(status).replace(/[<>&]/g,"")}</b></p><p><a href="${baseUrl()}/account.html">View your account</a></p>`});email_status=mail.status;}
    res.json({id:row.id,status:row.status,email_status,event_id:evt.id});
  }));
  r.post("/api/saas/orders/:id/resend-email", AP, ah(async (req,res)=>{
    const row=await findRecord("orders",req.params.id);if(!row||row.tenant_id!==req.tenantId)return res.sendStatus(404);
    if(!row.customer_email)return res.status(409).json({error:"order_has_no_email"});
    const mail=await sendEmail({tenantId:req.tenantId,userId:row.user_id||null,to:row.customer_email,type:"order_status_resend",related_id:row.id,subject:`Order update · ${row.id}`,text:`Current status: ${row.status}. Follow it at ${baseUrl()}/account.html`,html:`<p>Order <b>${row.id}</b></p><p>Current status: <b>${String(row.status||"").replace(/[<>&]/g,"")}</b></p><p><a href="${baseUrl()}/account.html">View your account</a></p>`});
    res.json({ok:true,email_status:mail.status,notification_id:mail.notification_id});
  }));
  r.get("/api/saas/shipments", A, ah(async (req, res) => res.json(await listForTenant("shipments", req.tenantId))));
  r.get("/api/saas/logistics/providers", A, (req, res) => res.json(logisticsProviderStatus()));
  r.get("/api/saas/logistics/overview", A, ah(async (req, res) => res.json(await logisticsOverview(req.tenantId))));
  r.get("/api/saas/logistics/zones", A, ah(async (req, res) => res.json(await listForTenant("shipping_zones", req.tenantId))));
  r.post("/api/saas/logistics/zones/:id", AP, ah(async (req, res) => { try { res.json(await saveShippingZone(req.tenantId, req.params.id, req.body || {})); } catch (e) { badRequest(res, e); } }));
  r.get("/api/saas/logistics/tracking/:tracking", A, ah(async (req, res) => res.json(await trackingDetail(req.tenantId, req.params.tracking))));
  r.post("/api/saas/logistics/quote", A, ah(async (req, res) => { try { const { tenantId, ...body } = req.body || {}; res.json(await quoteShipping({ ...body, tenantId: req.tenantId })); } catch (e) { badRequest(res, e); } }));
  r.post("/api/saas/logistics/sync-stores", AP, ah(async (req, res) => res.json(await syncLogisticsToStores(req.tenantId))));
  r.post("/api/saas/logistics/sync", AP, ah(async (req, res) => res.json(await syncTenantShipments(req.tenantId))));
  r.get("/api/saas/catalog", A, ah(async (req, res) => res.json(await catalogOverview(req.tenantId))));
  r.post("/api/saas/catalog/import", AP, ah(async (req, res) => res.json({ imported: await importProducts(req.tenantId, Array.isArray(req.body?.items) ? req.body.items : []) })));
  r.get("/api/saas/finance", A, ah(async (req, res) => res.json(await financeSummary(req.tenantId))));
  r.get("/api/saas/marketing", A, ah(async (req, res) => {
    const [campaigns, ideas] = await Promise.all([marketingSummary(req.tenantId), optimizationIdeas(req.tenantId)]);
    res.json({ campaigns, ideas, platforms: platformStatus() });
  }));
  r.post("/api/saas/marketing/drafts", A, ah(async (req, res) => {
    try { res.json(await createCampaignDraft(req.body || {})); } catch (e) { res.status(400).json({ error: e.message }); }
  }));
  r.post("/api/saas/marketing/publish", AP, ah(async (req, res) => {
    if (!req.body?.draft?.platform) return res.status(400).json({ error: "draft_required" });
    res.json(await publishCampaign({ draft: req.body.draft, approved: true }));
  }));
  r.get("/api/saas/customers", A, ah(async (req, res) => res.json(await customerProfiles(req.tenantId))));
  r.get("/api/saas/conversations", A, ah(async (req, res) => {
    const [conversations, messages] = await Promise.all([listForTenant("conversations", req.tenantId), listForTenant("messages", req.tenantId)]);
    res.json({ channels: messagingStatus(), conversations, messages });
  }));
  r.post("/api/saas/conversations/:id/reply-draft", A, ah(async (req, res) => {
    const conv = (await listForTenant("conversations", req.tenantId)).find(x => x.id === req.params.id);
    if (!conv) return res.sendStatus(404);
    res.json(await sendMessageDraft({ channel: conv.channel, conversationId: conv.id, text: String(req.body?.text || "").slice(0, 5000) }));
  }));
  r.get("/api/saas/customers/:customerId/detail", A, ah(async (req, res) => { const d = await customerProfileDetail(req.tenantId, req.params.customerId); d ? res.json(d) : res.sendStatus(404); }));
  r.get("/api/saas/customer-segments", A, ah(async (req, res) => res.json(await aggregateSegments(req.tenantId))));
  r.get("/api/saas/recommendations/:customerId", A, ah(async (req, res) => res.json(await recommendations({ tenantId: req.tenantId, customerId: req.params.customerId }))));
  r.get("/api/saas/influencers", A, ah(async (req, res) => res.json({ sources: creatorSources, items: await discoverInfluencers({ tenantId: req.tenantId, platform: req.query.platform, category: req.query.category, minFollowers: Number(req.query.min_followers || 0) }) })));
  r.get("/api/saas/affiliates", A, ah(async (req, res) => res.json(await affiliateSummary(req.tenantId))));
  r.get("/api/saas/tasks", A, ah(async (req, res) => res.json(await tasks(req.tenantId))));
  r.post("/api/saas/tasks", A, ah(async (req, res) => res.json(await createTask(req.tenantId, req.body || {}))));
  r.post("/api/saas/tasks/:id/approve", AP, ah(async (req, res) => { const t = await approveTask(req.tenantId, req.params.id); t ? res.json(t) : res.sendStatus(404); }));
  r.get("/api/saas/proofs", A, ah(async (req, res) => res.json(await listProofs(req.tenantId))));
  r.patch("/api/saas/proofs/:id", A, ah(async (req, res) => { const p = await updateProof(req.tenantId, req.params.id, req.body || {}); p ? res.json(p) : res.sendStatus(404); }));
  // Connector center: credentials are stored encrypted per tenant and never returned — only field status.
  r.get("/api/saas/connectors/registry", A, ah(async (req, res) => res.json(await Promise.all(connectorRegistry().map(x => connectorDetail(req.tenantId, x.id))))));
  r.get("/api/saas/connectors/:id/config", A, ah(async (req, res) => { const d = await connectorDetail(req.tenantId, req.params.id); d ? res.json(d) : res.sendStatus(404); }));
  r.post("/api/saas/connectors/:id/config", AP, ah(async (req, res) => { try { res.json(await saveConnectorConfig(req.tenantId, req.params.id, req.body || {})); } catch (e) { badRequest(res, e); } }));
  r.post("/api/saas/connectors/:id/test", A, ah(async (req, res) => { try { res.json(await testConnector(req.tenantId, req.params.id)); } catch (e) { badRequest(res, e); } }));

  // Excel / CSV data exchange: preview (validation) → commit (approval). Secrets are never exported.
  r.get("/api/saas/data/entities", A, (req, res) => res.json(listDataEntities()));
  r.get("/api/saas/data/template.xlsx", A, ah(async (req, res) => {
    const file = path.join(root || ".", "templates", "commerce-os-import-template.xlsx");
    try { await fs.access(file); return res.download(file, "commerce-os-import-template.xlsx"); } catch {}
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="commerce-os-import-template.xlsx"');
    res.send(templateWorkbookBuffer());
  }));
  r.get("/api/saas/data/export/:entity", A, ah(async (req, res) => {
    try {
      const out = await exportEntity({ tenantId: req.tenantId, entity: req.params.entity, format: req.query.format === "csv" ? "csv" : "xlsx" });
      res.setHeader("Content-Type", out.mime); res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`); res.send(out.buffer);
    } catch (e) { badRequest(res, e); }
  }));
  r.post("/api/saas/data/import/preview", A, express.raw({ type: () => true, limit: "15mb" }), (req, res) => {
    try {
      const entity = req.query.entity, filename = String(req.get("x-file-name") || "");
      const format = req.query.format === "csv" || filename.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
      const preview = previewImport({ entity, format, buffer: req.body });
      prunePreviews();
      const token = crypto.randomBytes(18).toString("hex");
      importPreviews.set(token, { tenantId: req.tenantId, entity, rows: preview.rows, errorRows: preview.error_rows, expires: Date.now() + PREVIEW_TTL_MS });
      res.json({ ...preview, preview_token: token, expires_in_seconds: PREVIEW_TTL_MS / 1000 });
    } catch (e) { badRequest(res, e); }
  });
  r.post("/api/saas/data/import/commit", AP, ah(async (req, res) => {
    const token = req.body?.preview_token, p = importPreviews.get(token);
    if (!p || p.expires < Date.now() || p.tenantId !== req.tenantId) return res.status(400).json({ error: "invalid_or_expired_preview" });
    if (p.errorRows > 0) return res.status(400).json({ error: "preview_has_validation_errors" });
    try { const result = await commitImport({ tenantId: req.tenantId, entity: p.entity, rows: p.rows }); importPreviews.delete(token); res.json(result); } catch (e) { badRequest(res, e); }
  }));

  r.get("/api/saas/connectors", A, ah(async (req, res) => {
    const [pp, sh] = await Promise.all([getConnectorCredentials(req.tenantId, "paypal"), getConnectorCredentials(req.tenantId, "shopify")]);
    res.json({
    marketing: platformStatus(), protocols: protocolRegistry(), commerce: commerceChannelStatus(), logistics: logisticsProviderStatus(), messaging: messagingStatus(),
    shopify: { configured: !!(sh?.client_id && sh?.client_secret), api_version: process.env.SHOPIFY_API_VERSION || "2026-10" },
    paypal: { configured: !!(pp?.enabled !== false && pp?.client_id && pp?.client_secret), environment: process.env.PAYPAL_ENV || "sandbox" }
    });
  }));

  // Shopify multi-store OAuth and sync
  r.get("/api/shopify/oauth/start", A, (req, res) => {
    try { const result = buildOAuthStart({ shop: req.query.shop, tenantId: req.tenantId }); req.query.redirect === "1" ? res.redirect(result.url) : res.json(result); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
  r.get("/api/shopify/oauth/callback", ah(async (req, res) => {
    try {
      if (!verifyCallbackQuery(req.query)) throw new Error("invalid_shopify_hmac");
      const store = await exchangeCode({ shop: req.query.shop, code: req.query.code, state: req.query.state, query: req.query });
      if (store.return_to === "studio" && store.connection_id) {
        await markConnected(store.connection_id, store.id);
        return res.redirect(`/studio.html?connected=${encodeURIComponent(store.connection_id)}`);
      }
      res.redirect(`/admin.html?shop_connected=${encodeURIComponent(store.domain)}`);
    } catch (e) { res.status(400).type("text/plain").send(`Shopify OAuth failed: ${e.message}`); }
  }));
  r.post("/api/shopify/stores/:id/sync-products", AP, ah(async (req, res) => { const s = await findStore(req.tenantId, req.params.id); s ? res.json(await syncProductsDemo(s)) : res.sendStatus(404); }));
  r.post("/api/shopify/stores/:id/sync-orders", AP, ah(async (req, res) => { const s = await findStore(req.tenantId, req.params.id); s ? res.json(await syncOrdersDemo(s)) : res.sendStatus(404); }));

  // Refunds are money movements: admin + explicit approval.
  r.post("/api/paypal/captures/:id/refund", AP, ah(async (req, res) => {
    try { res.json(await refundCapture(req.params.id, req.body?.amount, req.body?.currency, await getConnectorCredentials(req.tenantId, "paypal"))); } catch (e) { res.status(400).json({ error: e.message }); }
  }));

  return r;
}
