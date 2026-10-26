// Carrier logistics (YunExpress 云途 / 4PX 递四方): adapter registry, settings, fee rules, shipments, tracking poll.
// Everything is gated by LOGISTICS_ENABLED=true (default off). LOGISTICS_MOCK=true swaps in offline carriers.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createYunExpress, REQUIRED_ENV as YUN_ENV } from "./yunexpress.js";
import { createFourPx, REQUIRED_ENV as FPX_ENV } from "./fourpx.js";
import { createMock } from "./mock.js";
import { effectiveFx } from "../services/fees-service.js";
import { addRecord, findRecord, findWhere, listForTenant, updateRecord } from "../saas-store.js";

export const CARRIERS = { yunexpress: { name: "YunExpress 云途", env: YUN_ENV, make: createYunExpress, track_url: n => `https://www.yuntrack.com/parcelTracking?id=${encodeURIComponent(n)}` },
  fourpx: { name: "4PX 递四方", env: FPX_ENV, make: createFourPx, track_url: n => `https://track.4px.com/#/result/0/${encodeURIComponent(n)}` } };
export const enabled = () => process.env.LOGISTICS_ENABLED === "true";
const mock = () => process.env.LOGISTICS_MOCK === "true";
const now = () => new Date().toISOString();
const r2 = n => Math.round(Number(n) * 100) / 100;

// ---------- settings ----------
const DEFAULT_SETTINGS = { carriers: { yunexpress: { enabled: true, mode: "sandbox", service: "" }, fourpx: { enabled: true, mode: "sandbox", service: "" } },
  default_carrier: "yunexpress", default_by_country: {}, alert_days_no_update: 5, alert_days_undelivered: 25 };
export async function getSettings(tenantId) {
  const rec = await findRecord("logistics_settings", `lgs_${tenantId}`);
  const s = structuredClone(DEFAULT_SETTINGS);
  if (rec) { Object.assign(s, rec.settings || {}); for (const k of Object.keys(CARRIERS)) s.carriers[k] = { ...DEFAULT_SETTINGS.carriers[k], ...(rec.settings?.carriers?.[k] || {}) }; }
  return s;
}
export async function saveSettings(tenantId, input = {}) {
  const cur = await getSettings(tenantId), s = { ...cur };
  if (input.carriers) for (const k of Object.keys(CARRIERS)) { const c = input.carriers[k]; if (!c) continue;
    s.carriers[k] = { enabled: c.enabled !== false, mode: c.mode === "production" ? "production" : "sandbox", service: String(c.service || "").slice(0, 40) }; }
  if (input.default_carrier && CARRIERS[input.default_carrier]) s.default_carrier = input.default_carrier;
  if (input.default_by_country && typeof input.default_by_country === "object") s.default_by_country = Object.fromEntries(Object.entries(input.default_by_country)
    .filter(([cc, c]) => /^[A-Z]{2}$/.test(cc) && CARRIERS[c]).slice(0, 300));
  for (const k of ["alert_days_no_update", "alert_days_undelivered"]) if (input[k] != null) s[k] = Math.max(1, Math.min(120, Number(input[k]) || cur[k]));
  const id = `lgs_${tenantId}`;
  if (await findRecord("logistics_settings", id)) await updateRecord("logistics_settings", id, { settings: s, updated_at: now() });
  else await addRecord("logistics_settings", { id, tenant_id: tenantId, settings: s, updated_at: now() });
  return s;
}
export function carrierStatus(settings) {
  return Object.entries(CARRIERS).map(([id, c]) => ({ id, name: c.name, enabled: settings.carriers[id].enabled, mode: settings.carriers[id].mode, service: settings.carriers[id].service,
    configured: mock() || c.env.every(v => !!process.env[v]), required_env: c.env, mock: mock() }));
}
export function adapter(id, settings) {
  const c = CARRIERS[id]; if (!c) throw Object.assign(new Error("unknown_carrier"), { status: 400 });
  if (settings && !settings.carriers[id]?.enabled) throw Object.assign(new Error("carrier_disabled"), { status: 400 });
  return mock() ? createMock(id, c.name) : c.make({ mode: settings?.carriers[id]?.mode || "sandbox" });
}
export const pickCarrier = (settings, country) => settings.default_by_country[String(country || "").toUpperCase()] || settings.default_carrier;

// ---------- shipping-fee rules ----------
// { active:false, currency:"CHF", markup_pct, markup_fixed, rules:[{ id, carrier, countries:["DE","FR"] | ["*"], method:"standard", tiers:[{max_kg, price}] }] }
const DEFAULT_RULES = { active: false, currency: "CHF", markup_pct: 0, markup_fixed: 0, rules: [] };
export async function getRules(tenantId) { const r = await findRecord("logistics_rules", `lgr_${tenantId}`); return { ...DEFAULT_RULES, ...(r?.rules || {}) }; }
export function validateRules(input = {}) {
  const num = (v, min = 0, max = 1e5) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw Object.assign(new Error("invalid_number"), { status: 400 }); return n; };
  const rules = (Array.isArray(input.rules) ? input.rules : []).slice(0, 200).map(r => {
    if (!CARRIERS[r.carrier]) throw Object.assign(new Error("unknown_carrier"), { status: 400 });
    const countries = (Array.isArray(r.countries) ? r.countries : String(r.countries || "").split(/[\s,]+/)).map(s => String(s).trim().toUpperCase()).filter(s => /^([A-Z]{2}|\*)$/.test(s));
    if (!countries.length) throw Object.assign(new Error("rule_needs_countries"), { status: 400 });
    const tiers = (r.tiers || []).map(t => ({ max_kg: num(t.max_kg, 0.01, 100), price: num(t.price) })).sort((a, b) => a.max_kg - b.max_kg);
    if (!tiers.length) throw Object.assign(new Error("rule_needs_tiers"), { status: 400 });
    return { id: String(r.id || `r_${crypto.randomUUID().slice(0, 8)}`), carrier: r.carrier, name: String(r.name || "").slice(0, 60), countries, method: r.method === "express" ? "express" : "standard", tiers };
  });
  return { active: input.active === true, currency: "CHF", markup_pct: num(input.markup_pct ?? 0, 0, 500), markup_fixed: num(input.markup_fixed ?? 0, 0, 1000), rules };
}
export async function saveRules(tenantId, input) {
  const rules = validateRules(input), id = `lgr_${tenantId}`;
  if (await findRecord("logistics_rules", id)) await updateRecord("logistics_rules", id, { rules, updated_at: now() });
  else await addRecord("logistics_rules", { id, tenant_id: tenantId, rules, updated_at: now() });
  return rules;
}
/** Customer-facing fee in CHF from the admin rules, or null (→ keep the existing fee logic). Never applies unless the flag is on AND rules.active. */
export function ruleFee(rules, settings, { country, method = "standard", weight_kg }) {
  if (!enabled() || !rules?.active) return null;
  const cc = String(country || "").toUpperCase(), carrier = pickCarrier(settings, cc);
  const cand = rules.rules.filter(r => r.carrier === carrier && r.method === method);
  const rule = cand.find(r => r.countries.includes(cc)) || cand.find(r => r.countries.includes("*"));
  const tier = rule?.tiers.find(t => weight_kg <= t.max_kg);
  if (!tier) return null;
  return { carrier, rule_id: rule.id, amount_chf: r2(tier.price * (1 + rules.markup_pct / 100) + rules.markup_fixed) };
}
export async function quoteOverride(tenantId, args) { if (!enabled()) return null; return ruleFee(await getRules(tenantId), await getSettings(tenantId), args); }

// ---------- shipments ----------
const labelDir = () => path.resolve(process.env.LOGISTICS_LABEL_DIR || "./data/labels");
// Customs values are declared in USD (YunExpress default; accepted by 4PX). Order currency → CHF → USD via the shop FX table.
function usd(cur = "CHF") { const fx = effectiveFx(); const toChf = cur === "CHF" ? 1 : 1 / (Number(fx[cur]) || 1); return toChf * (Number(fx.USD) || 1.1); }
export function orderWeight(order) { const n = (order.items || []).reduce((a, l) => a + (Number(l.quantity) || 0), 0); return Math.max(0.2, n * 0.12); }
export function shipmentRequest(order, settings, carrier) {
  const a = order.shipping_address || {}; const [first, ...rest] = String(a.name || order.customer_name || "Customer").trim().split(/\s+/);
  const items = (order.items || []).map(l => ({ sku: l.product_id || l.sku || "item", name_en: String(l.name || "Printed wedding stationery").slice(0, 60), name_cn: "印刷品", quantity: Number(l.quantity) || 1,
    unit_value: r2((Number(l.unit_price) || 1) * usd(order.currency)), unit_weight_kg: 0.12, hs_code: process.env.LOGISTICS_DEFAULT_HS_CODE || "4909" }));
  return { reference: order.id, service: settings.carriers[carrier].service, weight_kg: r2(orderWeight(order)), currency: "USD", declared_value: r2(items.reduce((s, i) => s + i.unit_value * i.quantity, 0)),
    to: { first_name: first, last_name: rest.join(" ") || first, company: a.company || "", address1: a.address1, address2: a.address2 || "", city: a.city, state: a.state || a.province || "", postal_code: a.postal_code, country: String(a.country || "").toUpperCase(), phone: a.phone || order.customer_phone || "", email: order.customer_email || "" },
    from: { name: process.env.SHIPPING_ORIGIN_NAME || "Wed.AI", country: process.env.SHIPPING_ORIGIN_COUNTRY || "CN", city: process.env.SHIPPING_ORIGIN_CITY || "", address1: process.env.SHIPPING_ORIGIN_ADDRESS1 || "", postal_code: process.env.SHIPPING_ORIGIN_POSTAL || "", phone: process.env.SHIPPING_ORIGIN_PHONE || "" },
    items };
}
const err = (m, status = 400) => Object.assign(new Error(m), { status });
export async function listShipments(tenantId, { carrier, status, from, to, q, alerts } = {}) {
  let rows = await listForTenant("carrier_shipments", tenantId);
  if (carrier) rows = rows.filter(s => s.carrier === carrier);
  if (status) rows = rows.filter(s => s.status === status);
  if (from) rows = rows.filter(s => s.created_at >= from);
  if (to) rows = rows.filter(s => s.created_at.slice(0, 10) <= to);
  if (q) { const t = String(q).toLowerCase(); rows = rows.filter(s => [s.order_id, s.tracking_number, s.carrier_order_id].some(v => String(v || "").toLowerCase().includes(t))); }
  const st = await getSettings(tenantId); rows = rows.map(s => ({ ...s, alert: alertFor(s, st) }));
  if (alerts) rows = rows.filter(s => s.alert);
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(({ events, ...s }) => ({ ...s, event_count: (events || []).length }));
}
export function alertFor(s, st, t = Date.now()) {
  if (s.status === "cancelled" || s.status === "delivered") return null;
  if (s.status === "exception") return { type: "exception", text: "Carrier reported an exception" };
  if (s.status === "error") return { type: "error", text: s.last_error || "Carrier call failed" };
  const day = 86_400_000, last = Date.parse(s.events?.[0]?.time || s.created_at);
  if (t - Date.parse(s.created_at) > st.alert_days_undelivered * day) return { type: "delayed", text: `Not delivered after ${st.alert_days_undelivered} days` };
  if (t - last > st.alert_days_no_update * day) return { type: "stale", text: `No tracking update for ${st.alert_days_no_update} days` };
  return null;
}
export async function getShipment(tenantId, id) { const s = await findRecord("carrier_shipments", id); if (!s || s.tenant_id !== tenantId) throw err("shipment_not_found", 404); return { ...s, alert: alertFor(s, await getSettings(tenantId)) }; }

export async function createShipment(tenantId, orderId, { carrier } = {}) {
  const order = await findRecord("orders", String(orderId));
  if (!order || order.tenant_id !== tenantId) throw err("order_not_found", 404);
  if (order.payment_status !== "paid") throw err("order_not_paid");
  if (!order.shipping_address?.address1) throw err("order_has_no_address");
  const active = await findWhere("carrier_shipments", s => s.order_id === order.id && s.status !== "cancelled" && s.status !== "error");
  if (active) throw err("shipment_exists", 409);
  const settings = await getSettings(tenantId), cid = carrier || pickCarrier(settings, order.shipping_address.country);
  const a = adapter(cid, settings), req = shipmentRequest(order, settings, cid);
  const id = `shp_${crypto.randomUUID()}`, base = { id, tenant_id: tenantId, order_id: order.id, carrier: cid, mode: a.mode, weight_kg: req.weight_kg, country: req.to.country, created_at: now(), updated_at: now(), events: [] };
  try {
    const r = await a.createShipment(req);
    const row = { ...base, status: "created", carrier_order_id: r.carrier_order_id, tracking_number: r.tracking_number, last_mile_number: r.last_mile_number || "", tracking_url: r.tracking_number ? CARRIERS[cid].track_url(r.tracking_number) : "" };
    await addRecord("carrier_shipments", row);
    await updateRecord("orders", order.id, { carrier: CARRIERS[cid].name, tracking_number: row.tracking_number, tracking_url: row.tracking_url, tracking_status: "created", shipment_id: id, updated_at: now() });
    return row;
  } catch (e) {
    const row = { ...base, status: "error", last_error: String(e.message).slice(0, 300) };
    await addRecord("carrier_shipments", row);
    throw err(`carrier_error: ${row.last_error}`, 502);
  }
}
export async function batchCreate(tenantId, orderIds = [], opts = {}) {
  const out = [];
  for (const id of orderIds.slice(0, 100)) { try { const s = await createShipment(tenantId, id, opts); out.push({ order_id: id, ok: true, shipment_id: s.id, tracking_number: s.tracking_number }); } catch (e) { out.push({ order_id: id, ok: false, error: e.message }); } }
  return { created: out.filter(x => x.ok).length, failed: out.filter(x => !x.ok).length, results: out };
}
export async function cancelShipment(tenantId, id) {
  const s = await getShipment(tenantId, id);
  if (["cancelled", "delivered", "error"].includes(s.status)) throw err("cannot_cancel");
  if (s.events?.length > 1) throw err("already_in_transit");
  await adapter(s.carrier, await getSettings(tenantId)).cancel(s.carrier_order_id || s.tracking_number);
  await updateRecord("carrier_shipments", id, { status: "cancelled", updated_at: now() });
  const o = await findRecord("orders", s.order_id);
  if (o?.shipment_id === id) await updateRecord("orders", s.order_id, { tracking_number: "", tracking_url: "", tracking_status: "", carrier: "", shipment_id: "", updated_at: now() });
  return { id, status: "cancelled" };
}
export async function getLabel(tenantId, id, { refresh = false } = {}) {
  const s = await getShipment(tenantId, id);
  const file = path.join(labelDir(), `${id}.pdf`);
  if (!refresh) { try { return { file, buffer: await fs.readFile(file) }; } catch {} }
  const l = await adapter(s.carrier, await getSettings(tenantId)).getLabel(s.carrier_order_id || s.tracking_number);
  let buf = l.pdf_base64 ? Buffer.from(l.pdf_base64, "base64") : null;
  if (!buf && l.url) { const r = await fetch(l.url); if (!r.ok) throw err("label_download_failed", 502); buf = Buffer.from(await r.arrayBuffer()); }
  if (!buf) throw err("label_not_ready", 409);
  await fs.mkdir(labelDir(), { recursive: true }); await fs.writeFile(file, buf);
  await updateRecord("carrier_shipments", id, { label_at: now(), status: s.status === "created" ? "label_ready" : s.status, updated_at: now() });
  return { file, buffer: buf };
}
const ORDER_STATUS = { in_transit: "Shipped", delivered: "Delivered" };
export async function refreshTracking(tenantId, id) {
  const s = await getShipment(tenantId, id);
  if (!s.tracking_number || s.status === "cancelled") return s;
  const t = await adapter(s.carrier, null).track(s.tracking_number);
  const events = [...t.events].sort((a, b) => String(b.time).localeCompare(String(a.time)));
  const patch = { status: t.status, events, ...(t.last_mile_number ? { last_mile_number: t.last_mile_number } : {}), tracked_at: now(), updated_at: now(), ...(t.status === "delivered" && !s.delivered_at ? { delivered_at: now() } : {}) };
  await updateRecord("carrier_shipments", id, patch);
  const o = await findRecord("orders", s.order_id);
  if (o && o.shipment_id === id) await updateRecord("orders", o.id, { tracking_status: t.status, tracking_last_event: events[0] ? { time: events[0].time, text: events[0].text, location: events[0].location } : null,
    ...(ORDER_STATUS[t.status] && o.status !== "Delivered" ? { status: ORDER_STATUS[t.status] } : {}), updated_at: now() });
  return { ...s, ...patch };
}
export async function pollAll() {
  if (!enabled()) return { polled: 0 };
  const all = await findAll(); let n = 0;
  for (const s of all) { if (["cancelled", "delivered", "error"].includes(s.status) || !s.tracking_number) continue; try { await refreshTracking(s.tenant_id, s.id); n++; } catch (e) { console.warn("[logistics] poll", s.id, e.message); } }
  return { polled: n };
}
async function findAll() { const st = await (await import("../saas-store.js")).getState(); return [...(st.carrier_shipments || [])]; }
export function startLogisticsPoll() {
  if (!enabled()) return;
  const min = Number(process.env.LOGISTICS_POLL_MINUTES || 180);
  if (min > 0) setInterval(() => pollAll().catch(e => console.warn("[logistics] poll failed", e.message)), min * 60_000).unref();
}
