// Admin carrier logistics API (YunExpress / 4PX). Every route 404s unless LOGISTICS_ENABLED=true.
import express from "express";
import { ah } from "../http/middleware.js";
import { requireAdmin, requireApproval } from "../auth.js";
import * as L from "../logistics/index.js";
import { zipStore } from "../services/data-exchange-service.js";
import { renderTemplate, sendEmail } from "../services/email-service.js";
import { findRecord } from "../saas-store.js";
import * as Bulk from "../logistics/bulk.js";


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
  r.get(`${P}/:carrier/products`, A, wrap(async (req, res) => res.json(await L.listProducts(req.tenantId, req.params.carrier, req.query.country))));
  r.post(`${P}/shipments/:id/label/retry`, AP, wrap(async (req, res) => { await L.getShipment(req.tenantId, req.params.id); const job = L.scheduleLabelFetch(req.tenantId, req.params.id);
    if (req.query.wait === "1") return res.json(await job); res.json({ scheduled: true }); }));
  r.get(`${P}/shipments`, A, wrap(async (req, res) => res.json(await L.listShipments(req.tenantId, req.query))));
  r.get(`${P}/shippable-orders`, A, wrap(async (req, res) => {
    const ships = await L.tenantShipmentsRaw(req.tenantId), has = new Set(ships.filter(s => !["cancelled", "error"].includes(s.status)).map(s => s.order_id));
    res.json((await L.tenantOrders(req.tenantId)).filter(o => o.payment_status === "paid" && !has.has(o.id) && !["Shipped", "Delivered"].includes(o.status) && !/^cancel/i.test(o.status || ""))
      .map(o => ({ id: o.id, status: o.status, country: o.shipping_address?.country || "", created_at: o.created_at, items: (o.items || []).reduce((a, l) => a + (Number(l.quantity) || 0), 0) })));
  }));
  // CSV export of the (filtered) shipment list, and bulk label download (ZIP of PDFs) — both before /shipments/:id.
  r.get(`${P}/shipments/export.csv`, A, wrap(async (req, res) => { const rows = await L.listShipments(req.tenantId, req.query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="shipments-${new Date().toISOString().slice(0, 10)}.csv"`); res.setHeader("Cache-Control", "private, no-store"); res.end(L.shipmentsCsv(rows)); }));
  r.get(`${P}/shipments/labels.zip`, A, wrap(async (req, res) => {
    const ids = String(req.query.ids || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 100);
    if (!ids.length) return res.status(400).json({ error: "no_ids" });
    const entries = [], failed = [];
    for (const id of ids) { try { const s = await L.getShipment(req.tenantId, id), l = await L.getLabel(req.tenantId, id); entries.push({ name: `${(s.order_id || s.reference || id).replace(/[^\w.\-]/g, "_")}-${s.tracking_number || id}.pdf`, data: l.buffer }); } catch (e) { failed.push(`${id}: ${e.message}`); } }
    if (!entries.length) return res.status(409).json({ error: "no_labels_ready", failed });
    if (failed.length) entries.push({ name: "MISSING.txt", data: failed.join("\n") });
    res.setHeader("Content-Type", "application/zip"); res.setHeader("Content-Disposition", `attachment; filename="labels-${new Date().toISOString().slice(0, 10)}.zip"`); res.setHeader("Cache-Control", "private, no-store"); res.end(zipStore(entries)); }));
  r.get(`${P}/sync-status`, A, wrap(async (req, res) => { const s = await L.getSettings(req.tenantId); res.json({ ...L.pollState, sync_minutes: s.sync_minutes, labels: L.LOGISTICS_STATUS }); }));
  // Shipped e-mail: preview of the draft only (admin), never sent from here.
  r.get(`${P}/orders/:id/shipped-email`, A, wrap(async (req, res) => {
    const o = await findRecord("orders", req.params.id); if (!o || o.tenant_id !== req.tenantId) return res.status(404).json({ error: "order_not_found" });
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    const t = await renderTemplate("order-shipped", { order_id: o.id, customer_name: o.customer_name || "", carrier: o.carrier || "", tracking_number: o.tracking_number || "", tracking_url: o.tracking_url || "", order_url: `${base}/account.html#find-order`, account_url: `${base}/account.html` });
    res.json({ draft: true, sent: false, to_masked: String(o.customer_email || "").replace(/^(.).*(@.*)$/, "$1***$2"), subject: `Your order has shipped · 您的订单已发货 · ${o.id}`, text: t.text, html: t.html }); }));
  // One-off TEST of the shipped e-mail: sample order + TEST tracking number, only to LOGISTICS_TEST_EMAIL_TO (never to customers).
  r.post(`${P}/test-shipped-email`, A, requireApproval, wrap(async (req, res) => {
    const to = String(process.env.LOGISTICS_TEST_EMAIL_TO || "").trim();
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return res.status(409).json({ error: "test_recipient_not_configured", message: "Set LOGISTICS_TEST_EMAIL_TO on the server." });
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, ""), id = "TEST-ORDER-0001", num = "TEST-YT0000000000";
    const t = await renderTemplate("order-shipped", { test: true, order_id: id, customer_name: "Test", carrier: "YunExpress 云途 (TEST)", tracking_number: num, status_label: "In transit · 运输中 (TEST)", tracking_url: `https://www.yuntrack.com/parcelTracking?id=${num}`, order_url: `${base}/account.html`, account_url: `${base}/account.html` });
    const r = await sendEmail({ tenantId: req.tenantId, to, type: "order_shipped_test", related_id: id, subject: `[TEST] Your order has shipped · 您的订单已发货 · ${id}`, text: t.text, html: t.html });
    res.json({ status: r.status, provider: r.provider, from: process.env.FROM_EMAIL || null, to_masked: to.replace(/^(.).*(@.*)$/, "$1***$2"), notification_id: r.notification_id });
  }));
  // Channel comparison (carrier + route): cost (live API or admin price table), customer fee, margin, cheapest pick.
  r.get(`${P}/quotes`, A, wrap(async (req, res) => res.json(req.query.order_id ? await L.orderChannelQuotes(req.tenantId, req.query.order_id, req.query)
    : await L.channelQuotes(req.tenantId, { country: req.query.country, postal_code: req.query.postal_code || "", weight_kg: Number(req.query.weight_kg) || 0.2, customer_fee_chf: req.query.customer_fee_chf != null && req.query.customer_fee_chf !== "" ? Number(req.query.customer_fee_chf) : null }))));
  // Excel / CSV bulk ordering.
  const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  r.get(`${P}/bulk/template.xlsx`, A, (req, res) => { res.setHeader("Content-Type", xlsx); res.setHeader("Content-Disposition", 'attachment; filename="wedai-bulk-shipments-template.xlsx"'); res.end(Bulk.templateBuffer()); });
  r.post(`${P}/bulk/preview`, A, express.raw({ type: () => true, limit: "5mb" }), wrap(async (req, res) => res.json(await Bulk.preview(req.tenantId, req.body, decodeURIComponent(String(req.get("x-file-name") || ""))))));
  r.post(`${P}/bulk/commit`, AP, wrap(async (req, res) => res.json(await Bulk.commit(req.tenantId, String(req.body?.token || "")))));
  r.get(`${P}/bulk/:token/results.xlsx`, A, wrap(async (req, res) => { const b = await Bulk.resultsWorkbook(req.tenantId, req.params.token, (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, ""));
    res.setHeader("Content-Type", xlsx); res.setHeader("Content-Disposition", `attachment; filename="wedai-bulk-results-${new Date().toISOString().slice(0, 10)}.xlsx"`); res.setHeader("Cache-Control", "private, no-store"); res.end(b); }));
  r.get(`${P}/shipments/:id`, A, wrap(async (req, res) => res.json(await L.getShipment(req.tenantId, req.params.id))));
  r.get(`${P}/draft`, A, wrap(async (req, res) => res.json(await L.shipmentDraft(req.tenantId, req.query.order_id, req.query.carrier))));
  r.post(`${P}/shipments`, AP, wrap(async (req, res) => { const b = req.body || {};
    res.json(await L.createShipment(req.tenantId, b.order_id, { carrier: b.carrier, product: b.product, overrides: b.overrides, allow_unpaid: b.allow_unpaid === true })); }));
  r.post(`${P}/shipments/manual`, AP, wrap(async (req, res) => res.json(await L.createManualShipment(req.tenantId, req.body || {}))));
  r.post(`${P}/shipments/batch`, AP, wrap(async (req, res) => res.json(await L.batchCreate(req.tenantId, Array.isArray(req.body?.order_ids) ? req.body.order_ids : [], { carrier: req.body?.carrier }))));
  r.post(`${P}/shipments/:id/cancel`, AP, wrap(async (req, res) => res.json(await L.cancelShipment(req.tenantId, req.params.id))));
  r.post(`${P}/shipments/:id/refresh`, A, wrap(async (req, res) => res.json(await L.refreshTracking(req.tenantId, req.params.id))));
  r.get(`${P}/shipments/:id/label`, A, wrap(async (req, res) => { const l = await L.getLabel(req.tenantId, req.params.id, { refresh: req.query.refresh === "1" });
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename="label-${req.params.id}.pdf"`); res.setHeader("Cache-Control", "private, no-store"); res.end(l.buffer); }));
  r.post(`${P}/poll`, A, wrap(async (req, res) => res.json(await L.pollAll({ force: true, tenantId: req.tenantId }))));
  return r;
}
