// Webhooks need the raw body for signature verification, so this router is mounted before express.json().
import express from "express";
import crypto from "node:crypto";
import { ah, parseJsonBuffer } from "../http/middleware.js";
import { verifyWebhook, tenantForShop } from "../connectors/shopify-multistore.js";
import { verifyPayPalWebhook } from "../connectors/paypal.js";
import { addRecordOnce } from "../saas-store.js";
import { handlePayPalEvent } from "../services/checkout-service.js";
import { getConnectorCredentials } from "../services/connector-config-service.js";

const router = express.Router();
const raw = express.raw({ type: "application/json", limit: "2mb" });
const defaultTenant = () => process.env.DEFAULT_TENANT_ID || "tenant_demo";

router.post("/api/webhooks/shopify", raw, ah(async (req, res) => {
  if (!verifyWebhook(req.body, req.get("x-shopify-hmac-sha256"))) return res.status(401).send("invalid_hmac");
  const payload = parseJsonBuffer(req.body);
  if (!payload) return res.status(400).send("invalid_json");
  const delivery = req.get("x-shopify-webhook-id") || crypto.randomUUID();
  const topic = req.get("x-shopify-topic") || "unknown";
  const shop = req.get("x-shopify-shop-domain");
  await addRecordOnce("tasks", {
    id: `wh_${delivery}`, tenant_id: (await tenantForShop(shop)) || defaultTenant(), type: "shopify_webhook",
    title: `Shopify ${topic}`, status: "done", risk: "low", payload: { topic, shop, id: payload.id }, created_at: new Date().toISOString()
  });
  res.status(200).send("ok");
}));

router.post("/api/webhooks/paypal", raw, ah(async (req, res) => {
  const body = parseJsonBuffer(req.body);
  if (!body) return res.status(400).send("invalid_json");
  let ok = false;
  try { ok = await verifyPayPalWebhook(req.headers, body, await getConnectorCredentials(defaultTenant(), "paypal")); } catch (e) { console.error("[paypal webhook] verify failed:", e.message); }
  if (!ok) return res.status(401).send("invalid_signature");
  const { created } = await addRecordOnce("tasks", {
    id: `ppwh_${body.id || crypto.randomUUID()}`, tenant_id: defaultTenant(), type: "paypal_webhook",
    title: `PayPal ${body.event_type || "event"}`, status: "done", risk: "low", payload: { id: body.id, event_type: body.event_type }, created_at: new Date().toISOString()
  });
  if (created) await handlePayPalEvent(body);
  res.status(200).send("ok");
}));

export default router;
