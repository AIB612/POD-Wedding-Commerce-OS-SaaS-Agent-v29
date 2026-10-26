// Admin carrier logistics API (YunExpress / 4PX). Every route 404s unless LOGISTICS_ENABLED=true.
import express from "express";
import { ah } from "../http/middleware.js";
import { requireAdmin, requireApproval } from "../auth.js";
import * as L from "../logistics/index.js";
import { listForTenant } from "../saas-store.js";

export function logisticsRouter() {
  const r = express.Router(), A = requireAdmin, AP = [requireAdmin, requireApproval];
  const gate = (req, res, next) => L.enabled() ? next() : res.status(404).json({ error: "logistics_disabled" });
  const send = (res, e) => res.status(e.status || 500).json({ error: e.message });
  const wrap = fn => ah(async (req, res) => { try { await fn(req, res); } catch (e) { send(res, e); } });
  const P = "/api/saas/carriers";
  r.get(`${P}/status`, (req, res) => res.json({ enabled: L.enabled() }));
  r.use(P, gate);
  r.get(`${P}/settings`, A, wrap(async (req, res) => { const s = await L.getSettings(req.tenantId); res.json({ settings: s, carriers: L.carrierStatus(s) }); }));
  r.put(`${P}/settings`, AP, wrap(async (req, res) => { const s = await L.saveSettings(req.tenantId, req.body || {}); res.json({ settings: s, carriers: L.carrierStatus(s) }); }));
  r.get(`${P}/rules`, A, wrap(async (req, res) => res.json(await L.getRules(req.tenantId))));
  r.put(`${P}/rules`, AP, wrap(async (req, res) => res.json(await L.saveRules(req.tenantId, req.body || {}))));
  r.post(`${P}/rules/preview`, A, wrap(async (req, res) => res.json({ fee: L.ruleFee(L.validateRules(req.body?.rules || {}), await L.getSettings(req.tenantId), { country: req.body?.country, weight_kg: Number(req.body?.weight_kg) || 0.2, method: req.body?.method }) ?? null })));
  r.get(`${P}/shipments`, A, wrap(async (req, res) => res.json(await L.listShipments(req.tenantId, req.query))));
  r.get(`${P}/shippable-orders`, A, wrap(async (req, res) => {
    const ships = await listForTenant("carrier_shipments", req.tenantId), has = new Set(ships.filter(s => !["cancelled", "error"].includes(s.status)).map(s => s.order_id));
    res.json((await listForTenant("orders", req.tenantId)).filter(o => o.payment_status === "paid" && !has.has(o.id) && !["Shipped", "Delivered"].includes(o.status) && !/^cancel/i.test(o.status || ""))
      .map(o => ({ id: o.id, status: o.status, country: o.shipping_address?.country || "", created_at: o.created_at, items: (o.items || []).reduce((a, l) => a + (Number(l.quantity) || 0), 0) })));
  }));
  r.get(`${P}/shipments/:id`, A, wrap(async (req, res) => res.json(await L.getShipment(req.tenantId, req.params.id))));
  r.post(`${P}/shipments`, AP, wrap(async (req, res) => res.json(await L.createShipment(req.tenantId, req.body?.order_id, { carrier: req.body?.carrier }))));
  r.post(`${P}/shipments/batch`, AP, wrap(async (req, res) => res.json(await L.batchCreate(req.tenantId, Array.isArray(req.body?.order_ids) ? req.body.order_ids : [], { carrier: req.body?.carrier }))));
  r.post(`${P}/shipments/:id/cancel`, AP, wrap(async (req, res) => res.json(await L.cancelShipment(req.tenantId, req.params.id))));
  r.post(`${P}/shipments/:id/refresh`, A, wrap(async (req, res) => res.json(await L.refreshTracking(req.tenantId, req.params.id))));
  r.get(`${P}/shipments/:id/label`, A, wrap(async (req, res) => { const l = await L.getLabel(req.tenantId, req.params.id, { refresh: req.query.refresh === "1" });
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="label-${req.params.id}.pdf"`); res.setHeader("Cache-Control", "private, no-store"); res.end(l.buffer); }));
  r.post(`${P}/poll`, AP, wrap(async (req, res) => res.json(await L.pollAll())));
  return r;
}
