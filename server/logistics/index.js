// Carrier logistics (YunExpress 云途 / 4PX 递四方): adapter registry, settings, fee rules, shipments, tracking poll.
// Everything is gated by LOGISTICS_ENABLED=true (default off). LOGISTICS_MOCK=true swaps in offline carriers.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createYunExpress, REQUIRED_ENV as YUN_ENV } from "./yunexpress.js";
import { createFourPx, REQUIRED_ENV as FPX_ENV } from "./fourpx.js";
import { createMock } from "./mock.js";
import { effectiveFx } from "../services/fees-service.js";
import { addRecord as addRec, findRecord as findRec, findWhere as findW, listForTenant as listT, updateRecord as updRec, getState } from "../saas-store.js";

// ---------- persistence ----------
// The SaaS store is in-memory unless STORE_PERSIST_PATH is set. Carrier settings, fee rules and shipments must survive restarts
// (real carrier orders!), so they are mirrored to their own file: LOGISTICS_STATE_PATH (default ./data/logistics-state.json, mode 600).
const LCOLS = ["logistics_settings", "logistics_rules", "carrier_shipments"];
const statePath = () => process.env.LOGISTICS_STATE_PATH || (process.env.NODE_ENV === "test" ? "" : "./data/logistics-state.json");
let hydrated = null, saveT = null;
async function hydrate() {
  if (hydrated) return hydrated;
  hydrated = (async () => { const f = statePath(); if (!f) return; try { const d = JSON.parse(await fs.readFile(f, "utf8")); const st = await getState();
    for (const c of LCOLS) if (Array.isArray(d[c])) { st[c] ||= []; for (const r of d[c]) if (!st[c].some(x => x.id === r.id)) st[c].push(r); } } catch (e) { if (e.code !== "ENOENT") console.warn("[logistics] state load failed", e.message); } })();
  return hydrated;
}
function persist() {
  const f = statePath(); if (!f) return; clearTimeout(saveT);
  saveT = setTimeout(async () => { try { const st = await getState(), out = Object.fromEntries(LCOLS.map(c => [c, st[c] || []])); await fs.mkdir(path.dirname(path.resolve(f)), { recursive: true });
    const tmp = `${f}.${process.pid}.tmp`; await fs.writeFile(tmp, JSON.stringify(out), { mode: 0o600 }); await fs.rename(tmp, f); } catch (e) { console.warn("[logistics] state save failed", e.message); } }, 200);
  saveT.unref?.();
}
const addRecord = async (c, r) => { await hydrate(); const x = await addRec(c, r); if (LCOLS.includes(c)) persist(); return x; };
const updateRecord = async (c, id, p) => { await hydrate(); const x = await updRec(c, id, p); if (LCOLS.includes(c)) persist(); return x; };
const findRecord = async (c, id) => { await hydrate(); return findRec(c, id); };
const findWhere = async (c, f) => { await hydrate(); return findW(c, f); };
const listForTenant = async (c, t) => { await hydrate(); return listT(c, t); };

export const CARRIERS = { yunexpress: { name: "YunExpress 云途", env: YUN_ENV, prod_env: ["YUNEXPRESS_PROD_APP_ID", "YUNEXPRESS_PROD_APP_SECRET"], make: createYunExpress, track_url: n => `https://www.yuntrack.com/parcelTracking?id=${encodeURIComponent(n)}` },
  fourpx: { name: "4PX 递四方", env: FPX_ENV, make: createFourPx, track_url: n => `https://track.4px.com/#/result/0/${encodeURIComponent(n)}` } };
export const enabled = () => process.env.LOGISTICS_ENABLED === "true";
const mock = () => process.env.LOGISTICS_MOCK === "true";
const now = () => new Date().toISOString();
function clip(v, n = 120) { return String(v ?? "").trim().slice(0, n); }
function err(m, status = 400) { return Object.assign(new Error(m), { status }); }
const r2 = n => Math.round(Number(n) * 100) / 100;

// ---------- settings ----------
const DEFAULT_SETTINGS = { carriers: { yunexpress: { enabled: true, mode: "sandbox", service: "", products_by_country: {} }, fourpx: { enabled: true, mode: "sandbox", service: "", products_by_country: {}, handover: "pickup" } },
  default_carrier: "yunexpress", default_by_country: {}, alert_days_no_update: 5, alert_days_undelivered: 25,
  // Sender (return) address + IOSS are edited in admin → Carriers → Settings; empty fields fall back to SHIPPING_ORIGIN_* / IOSS_NO in .env.
  sender: { name: "", company: "", phone: "", email: "", country: "", state: "", city: "", address1: "", address2: "", postal_code: "" }, ioss_no: "",
  // Manual admin order-status changes e-mail the customer only when this is ON (default OFF → stored as a draft notification).
  notify_customer_on_status: false,
  sync_minutes: 60, price_tables: [] };
const SENDER_KEYS = ["name", "company", "phone", "email", "country", "state", "city", "address1", "address2", "postal_code"];
export async function getSettings(tenantId) {
  const rec = await findRecord("logistics_settings", `lgs_${tenantId}`);
  const s = structuredClone(DEFAULT_SETTINGS);
  if (rec) { Object.assign(s, rec.settings || {}); for (const k of Object.keys(CARRIERS)) s.carriers[k] = { ...DEFAULT_SETTINGS.carriers[k], ...(rec.settings?.carriers?.[k] || {}) }; s.sender = { ...DEFAULT_SETTINGS.sender, ...(rec.settings?.sender || {}) }; }
  return s;
}
export async function saveSettings(tenantId, input = {}) {
  const cur = await getSettings(tenantId), s = { ...cur };
  if (input.carriers) for (const k of Object.keys(CARRIERS)) { const c = input.carriers[k]; if (!c) continue;
    const pbc = c.products_by_country && typeof c.products_by_country === "object" ? c.products_by_country : cur.carriers[k].products_by_country || {};
    s.carriers[k] = { ...(k === "fourpx" ? { handover: ["pickup", "dropoff"].includes(c.handover) ? c.handover : cur.carriers[k].handover || "pickup" } : {}), enabled: c.enabled !== false, mode: c.mode === "production" ? "production" : "sandbox", service: String(c.service ?? cur.carriers[k].service ?? "").slice(0, 40),
      products_by_country: Object.fromEntries(Object.entries(pbc).map(([cc, v]) => [String(cc).toUpperCase(), String(v || "").trim().slice(0, 40)]).filter(([cc, v]) => /^[A-Z]{2}$/.test(cc) && /^[\w.\-]+$/.test(v)).slice(0, 300)) }; }
  if (input.default_carrier && CARRIERS[input.default_carrier]) s.default_carrier = input.default_carrier;
  if (input.default_by_country && typeof input.default_by_country === "object") s.default_by_country = Object.fromEntries(Object.entries(input.default_by_country)
    .filter(([cc, c]) => /^[A-Z]{2}$/.test(cc) && CARRIERS[c]).slice(0, 300));
  if (input.sender && typeof input.sender === "object") { s.sender = { ...cur.sender }; for (const k of SENDER_KEYS) if (input.sender[k] != null) s.sender[k] = clip(input.sender[k], k === "address1" || k === "address2" ? 120 : 80);
    s.sender.country = s.sender.country.toUpperCase().slice(0, 2); if (s.sender.country && !/^[A-Z]{2}$/.test(s.sender.country)) throw err("invalid_sender_country"); }
  if (input.ioss_no != null) { const v = clip(input.ioss_no, 20).toUpperCase().replace(/\s+/g, ""); if (v && !/^IM\d{10}$/.test(v)) throw err("invalid_ioss_no"); s.ioss_no = v; }
  if (input.notify_customer_on_status != null) s.notify_customer_on_status = input.notify_customer_on_status === true || input.notify_customer_on_status === "true";
  if (input.price_tables != null) s.price_tables = validatePriceTables(input.price_tables);
  if (input.sync_minutes != null) s.sync_minutes = [0, 15, 30, 60, 120, 180, 360, 720, 1440].includes(Number(input.sync_minutes)) ? Number(input.sync_minutes) : cur.sync_minutes;
  for (const k of ["alert_days_no_update", "alert_days_undelivered"]) if (input[k] != null) s[k] = Math.max(1, Math.min(120, Number(input[k]) || cur[k]));
  const id = `lgs_${tenantId}`;
  if (await findRecord("logistics_settings", id)) await updateRecord("logistics_settings", id, { settings: s, updated_at: now() });
  else await addRecord("logistics_settings", { id, tenant_id: tenantId, settings: s, updated_at: now() });
  return s;
}
export function carrierStatus(settings) {
  return Object.entries(CARRIERS).map(([id, c]) => ({ id, name: c.name, enabled: settings.carriers[id].enabled, mode: settings.carriers[id].mode, service: settings.carriers[id].service,
    configured: mock() || c.env.every(v => !!process.env[v]) || (settings.carriers[id].mode === "production" && !!c.prod_env?.every(v => !!process.env[v])), required_env: settings.carriers[id].mode === "production" && c.prod_env ? c.prod_env : c.env, mock: mock() }));
}
export function adapter(id, settings) {
  const c = CARRIERS[id]; if (!c) throw Object.assign(new Error("unknown_carrier"), { status: 400 });
  if (settings && !settings.carriers[id]?.enabled) throw Object.assign(new Error("carrier_disabled"), { status: 400 });
  return mock() ? createMock(id, c.name) : c.make({ mode: settings?.carriers[id]?.mode || "sandbox" });
}
/** Route/product code for a destination: per-country choice > carrier default (admin) > adapter default. */
export const productFor = (settings, carrier, country) => settings.carriers[carrier]?.products_by_country?.[String(country || "").toUpperCase()] || settings.carriers[carrier]?.service || "";
export async function listProducts(tenantId, carrier, country) {
  const st = await getSettings(tenantId);
  if (!CARRIERS[carrier]) throw err("unknown_carrier");
  const a = mock() ? createMock(carrier, CARRIERS[carrier].name) : CARRIERS[carrier].make({ mode: st.carriers[carrier].mode });
  if (!a.listProducts) return [];
  return a.listProducts(String(country || "").toUpperCase().slice(0, 2));
}
export const pickCarrier = (settings, country) => settings.default_by_country[String(country || "").toUpperCase()] || settings.default_carrier;

// ---------- shipping-fee rules ----------
// { active:false, currency:"CHF", markup_pct, markup_fixed, rules:[{ id, carrier, countries:["DE","FR"] | ["*"], method:"standard", tiers:[{max_kg, price}] }] }
const DEFAULT_RULES = { mode: "off", active: false, currency: "CHF", markup_pct: 0, markup_fixed: 0, rules: [] };
export async function getRules(tenantId) { const r = await findRecord("logistics_rules", `lgr_${tenantId}`); return { ...DEFAULT_RULES, ...(r?.rules || {}) }; }
export function validateRules(input = {}) {
  const num = (v, min = 0, max = 1e5) => { const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw Object.assign(new Error("invalid_number"), { status: 400 }); return n; };
  const rules = (Array.isArray(input.rules) ? input.rules : []).slice(0, 200).map(r => {
    if (!CARRIERS[r.carrier]) throw Object.assign(new Error("unknown_carrier"), { status: 400 });
    const countries = (Array.isArray(r.countries) ? r.countries : String(r.countries || "").split(/[\s,]+/)).map(s => String(s).trim().toUpperCase()).filter(s => /^([A-Z]{2}|\*)$/.test(s));
    if (!countries.length) throw Object.assign(new Error("rule_needs_countries"), { status: 400 });
    const tiers = (r.tiers || []).map(t => ({ max_kg: num(t.max_kg, 0.01, 100), price: num(t.price) })).sort((a, b) => a.max_kg - b.max_kg);
    if (!tiers.length) throw Object.assign(new Error("rule_needs_tiers"), { status: 400 });
    return { id: String(r.id || `r_${crypto.randomUUID().slice(0, 8)}`), product: String(r.product || "").trim().slice(0, 40), carrier: r.carrier, name: String(r.name || "").slice(0, 60), countries, method: r.method === "express" ? "express" : "standard", tiers };
  });
  const mode = ["off", "preview", "live"].includes(input.mode) ? input.mode : input.active === true ? "live" : "off";
  return { mode, active: mode === "live", currency: "CHF", markup_pct: num(input.markup_pct ?? 0, 0, 500), markup_fixed: num(input.markup_fixed ?? 0, 0, 1000), rules };
}
export async function saveRules(tenantId, input) {
  const rules = validateRules(input), id = `lgr_${tenantId}`;
  if (await findRecord("logistics_rules", id)) await updateRecord("logistics_rules", id, { rules, updated_at: now() });
  else await addRecord("logistics_rules", { id, tenant_id: tenantId, rules, updated_at: now() });
  return rules;
}
/** Customer-facing fee in CHF from the admin rules, or null (→ keep the existing fee logic). Never applies unless the flag is on AND rules.active. */
// mode: "off" (default) · "preview" = only admin quote previews (x-logistics-preview) · "live" = customer checkout.
export function ruleFee(rules, settings, { country, method = "standard", weight_kg, admin_preview = false }) {
  if (!enabled() || !rules) return null;
  const mode = rules.mode || (rules.active ? "live" : "off");
  if (!(mode === "live" || (mode === "preview" && admin_preview))) return null;
  const cc = String(country || "").toUpperCase(), carrier = pickCarrier(settings, cc);
  const prod = productFor(settings, carrier, cc);
  const cand = rules.rules.filter(r => r.carrier === carrier && r.method === method && (!r.product || r.product === prod));
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
/** Sender address: admin settings first, .env SHIPPING_ORIGIN_* as fallback per field. */
// EU-27 destinations need IOSS for low-value B2C imports (≤ EUR 150); other countries never get it.
export const EU = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));
export const iossFor = (settings, country) => EU.has(String(country || "").toUpperCase()) ? (settings?.ioss_no || process.env.IOSS_NO || "") : "";
export function senderFor(settings) {
  const a = settings?.sender || {}, e = process.env, pick = (k, env, d = "") => String(a[k] || e[env] || d);
  return { name: pick("name", "SHIPPING_ORIGIN_NAME", "Wed.AI"), company: pick("company", "SHIPPING_ORIGIN_COMPANY"), phone: pick("phone", "SHIPPING_ORIGIN_PHONE"), email: pick("email", "SHIPPING_ORIGIN_EMAIL"),
    country: pick("country", "SHIPPING_ORIGIN_COUNTRY", "CN").toUpperCase(), state: pick("state", "SHIPPING_ORIGIN_STATE"), city: pick("city", "SHIPPING_ORIGIN_CITY"),
    address1: pick("address1", "SHIPPING_ORIGIN_ADDRESS1"), address2: pick("address2", "SHIPPING_ORIGIN_ADDRESS2"), postal_code: pick("postal_code", "SHIPPING_ORIGIN_POSTAL") };
}
export function shipmentRequest(order, settings, carrier) {
  const a = order.shipping_address || {}; const [first, ...rest] = String(a.name || order.customer_name || "Customer").trim().split(/\s+/);
  const items = (order.items || []).map(l => ({ sku: l.product_id || l.sku || "item", name_en: String(l.name || "Printed wedding stationery").slice(0, 60), name_cn: "印刷品", quantity: Number(l.quantity) || 1,
    unit_value: r2((Number(l.unit_price) || 1) * usd(order.currency)), unit_weight_kg: 0.12, hs_code: process.env.LOGISTICS_DEFAULT_HS_CODE || "4909" }));
  return { reference: order.id, service: settings.carriers[carrier].service, weight_kg: r2(orderWeight(order)), currency: "USD", declared_value: r2(items.reduce((s, i) => s + i.unit_value * i.quantity, 0)),
    to: { first_name: first, last_name: rest.join(" ") || first, company: a.company || "", address1: a.address1, address2: a.address2 || "", city: a.city, state: a.state || a.province || "", postal_code: a.postal_code, country: String(a.country || "").toUpperCase(), phone: a.phone || order.customer_phone || "", email: order.customer_email || "" },
    from: senderFor(settings), ioss_no: iossFor(settings, a.country), handover: settings?.carriers?.fourpx?.handover || "pickup",
    items };
}
// Follow-up calls (label/track/cancel) always go to the environment the shipment was created in, even if the admin toggled the mode since.
const adapterFor = s => mock() || s.mode === "mock" ? createMock(s.carrier, CARRIERS[s.carrier].name) : CARRIERS[s.carrier].make({ mode: s.mode === "production" ? "production" : "sandbox" });
export async function listShipments(tenantId, { carrier, status, from, to, q, alerts, order_id } = {}) {
  let rows = await listForTenant("carrier_shipments", tenantId);
  if (order_id) rows = rows.filter(s => s.order_id === order_id);
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

/** Admin edits on top of the prefilled request (address, items, weight, reference). Validated, never trusted blindly. */
export function applyOverrides(req, o = {}) {
  const out = structuredClone(req);
  if (o.to && typeof o.to === "object") for (const k of ["first_name", "last_name", "company", "address1", "address2", "city", "state", "postal_code", "phone", "email"]) if (o.to[k] != null) out.to[k] = clip(o.to[k]);
  if (o.to?.country) out.to.country = clip(o.to.country, 2).toUpperCase();
  if (o.weight_kg != null) { const w = Number(o.weight_kg); if (!(w > 0 && w <= 30)) throw err("invalid_weight"); out.weight_kg = Math.round(w * 1000) / 1000; }
  if (Array.isArray(o.items) && o.items.length) out.items = o.items.slice(0, 20).map(i => {
    const q = Math.max(1, Math.min(999, Number(i.quantity) || 1)), v = Number(i.unit_value), w = Number(i.unit_weight_kg ?? 0.1);
    if (!(v > 0 && v < 10000)) throw err("invalid_item_value");
    return { sku: clip(i.sku || "item", 40), name_en: clip(i.name_en || "Printed paper card", 60), name_cn: clip(i.name_cn || "纸质印刷品", 40), quantity: q, unit_value: Math.round(v * 100) / 100, unit_weight_kg: w > 0 ? w : 0.1, hs_code: clip(i.hs_code || process.env.LOGISTICS_DEFAULT_HS_CODE || "4909", 12) };
  });
  out.declared_value = r2(out.items.reduce((a, i) => a + i.unit_value * i.quantity, 0));
  if (o.reference) out.reference = clip(o.reference, 40).replace(/[^\w.\-]/g, "-");
  if (o.product) out.service = clip(o.product, 40);
  for (const k of ["first_name", "address1", "city", "postal_code", "country"]) if (!out.to[k]) throw err(`missing_${k === "first_name" ? "name" : k}`);
  if (!/^[A-Z]{2}$/.test(out.to.country)) throw err("invalid_country");
  return out;
}
/** Prefilled draft for the admin "create shipment" form. */
export async function shipmentDraft(tenantId, orderId, carrier) {
  const order = await findRecord("orders", String(orderId));
  if (!order || order.tenant_id !== tenantId) throw err("order_not_found", 404);
  const settings = await getSettings(tenantId), cid = carrier && CARRIERS[carrier] ? carrier : pickCarrier(settings, order.shipping_address?.country);
  const req = shipmentRequest(order, settings, cid);
  return { order_id: order.id, carrier: cid, product: productFor(settings, cid, req.to.country), mode: settings.carriers[cid].mode, payment_status: order.payment_status, request: req };
}
async function submit(tenantId, { cid, settings, req, order, labelRetry, manual }) {
  req = { ...req, ioss_no: iossFor(settings, req.to?.country) }; // final destination decides (admin may have edited the address)
  const a = adapter(cid, settings);
  const id = `shp_${crypto.randomUUID()}`, base = { id, tenant_id: tenantId, order_id: order?.id || "", manual: !!manual, reference: req.reference, carrier: cid, mode: a.mode, weight_kg: req.weight_kg, country: req.to.country,
    recipient: `${req.to.first_name} ${req.to.last_name}`.trim().slice(0, 80), created_at: now(), updated_at: now(), events: [] };
  try {
    const r = await a.createShipment(req);
    const row = { ...base, product: req.service || "(carrier default)", status: "created", carrier_order_id: r.carrier_order_id, tracking_number: r.tracking_number, last_mile_number: r.last_mile_number || "", tracking_url: r.tracking_number ? CARRIERS[cid].track_url(r.tracking_number) : "" };
    await addRecord("carrier_shipments", row);
    if (order) { await updateRecord("orders", order.id, { carrier: CARRIERS[cid].name, carrier_id: cid, tracking_number: row.tracking_number, tracking_url: row.tracking_url, shipment_id: id, updated_at: now() }); await syncOrder(row, "shipment_created"); }
    if (labelRetry !== false) scheduleLabelFetch(tenantId, id);
    return row;
  } catch (e) {
    const row = { ...base, status: "error", last_error: String(e.message).slice(0, 300) };
    await addRecord("carrier_shipments", row);
    throw err(`carrier_error: ${row.last_error}`, 502);
  }
}
export async function createShipment(tenantId, orderId, opts = {}) {
  const order = await findRecord("orders", String(orderId));
  if (!order || order.tenant_id !== tenantId) throw err("order_not_found", 404);
  if (order.payment_status !== "paid" && !opts.allow_unpaid) throw err("order_not_paid");
  if (!order.shipping_address?.address1 && !opts.overrides?.to?.address1) throw err("order_has_no_address");
  const active = await findWhere("carrier_shipments", s => s.order_id === order.id && !["cancelled", "error"].includes(s.status));
  if (active) throw err("shipment_exists", 409);
  const settings = await getSettings(tenantId);
  if (opts.carrier === "cheapest") Object.assign(opts, await resolveChannel(tenantId, { carrier: "cheapest", country: opts.overrides?.to?.country || order.shipping_address.country, postal_code: opts.overrides?.to?.postal_code || order.shipping_address.postal_code, weight_kg: Number(opts.overrides?.weight_kg) || orderWeight(order) }));
  const cid = opts.carrier || pickCarrier(settings, opts.overrides?.to?.country || order.shipping_address.country);
  if (!CARRIERS[cid]) throw err("unknown_carrier");
  let req = shipmentRequest(order, settings, cid);
  req.service = productFor(settings, cid, req.to.country);
  if (opts.overrides || opts.product) req = applyOverrides(req, { ...(opts.overrides || {}), product: opts.product });
  return submit(tenantId, { cid, settings, req, order, labelRetry: opts.labelRetry });
}
/** Manual shipment not tied to an order (samples, replacements). */
export async function createManualShipment(tenantId, body = {}) {
  const settings = await getSettings(tenantId), country = clip(body.to?.country, 2).toUpperCase();
  if (body.carrier === "cheapest") { const c = await resolveChannel(tenantId, { carrier: "cheapest", country, postal_code: body.to?.postal_code, weight_kg: Number(body.weight_kg) || 0.2 }); body = { ...body, carrier: c.carrier, product: c.product }; }
  const cid = body.carrier || pickCarrier(settings, country);
  if (!CARRIERS[cid]) throw err("unknown_carrier");
  const reference = clip(body.reference || `WEDAI-M-${Date.now().toString(36).toUpperCase()}`, 40);
  if (await findWhere("carrier_shipments", s => s.tenant_id === tenantId && s.reference === reference && !["cancelled", "error"].includes(s.status))) throw err("reference_exists", 409);
  const blank = { reference, service: productFor(settings, cid, country), weight_kg: 0.2, currency: "USD", declared_value: 0, to: { first_name: "", last_name: "", country }, from: senderFor(settings), ioss_no: iossFor(settings, country), handover: settings.carriers.fourpx?.handover || "pickup", items: [{ sku: "item", name_en: "Printed paper card", name_cn: "纸质印刷品", quantity: 1, unit_value: 1, unit_weight_kg: 0.1, hs_code: process.env.LOGISTICS_DEFAULT_HS_CODE || "4909" }] };
  const req = applyOverrides(blank, { ...body, reference });
  if (!req.to.last_name) req.to.last_name = req.to.first_name;
  return submit(tenantId, { cid, settings, req, order: null, labelRetry: body.labelRetry, manual: true });
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
  await adapterFor(s).cancel(s.carrier_order_id || s.tracking_number);
  await updateRecord("carrier_shipments", id, { status: "cancelled", updated_at: now() });
  await syncOrder({ ...s, status: "cancelled" }, "shipment_cancelled");
  return { id, status: "cancelled" };
}
export async function getLabel(tenantId, id, { refresh = false } = {}) {
  const s = await getShipment(tenantId, id);
  const file = path.join(labelDir(), `${id}.pdf`);
  if (!refresh) { try { return { file, buffer: await fs.readFile(file) }; } catch {} }
  const l = await adapterFor(s).getLabel(s.carrier_order_id || s.tracking_number);
  let buf = l.pdf_base64 ? Buffer.from(l.pdf_base64, "base64") : null;
  if (!buf && l.url) { const r = await fetch(l.url); if (!r.ok) throw err("label_download_failed", 502); buf = Buffer.from(await r.arrayBuffer()); }
  if (!buf) throw err("label_not_ready", 409);
  if (buf.subarray(0, 5).toString() !== "%PDF-" && !/png|zpl/i.test(l.type || "")) throw err("label_not_pdf", 502);
  await fs.mkdir(labelDir(), { recursive: true }); await fs.writeFile(file, buf);
  await updateRecord("carrier_shipments", id, { label_at: now(), status: s.status === "created" ? "label_ready" : s.status, updated_at: now() });
  if (s.status === "created") await syncOrder({ ...s, status: "label_ready" }, "label_ready");
  return { file, buffer: buf };
}
// Carriers (notably 4PX) can need minutes before a label exists ("Changing service number, please try again later").
// After creating a shipment we retry in the background: every LOGISTICS_LABEL_RETRY_SECONDS (30) for up to LOGISTICS_LABEL_RETRY_MINUTES (6).
export const RETRYABLE_LABEL = /try again|later|not ready|label_not_ready|生成中|稍后|changing service number/i;
const labelJobs = new Map();
export function scheduleLabelFetch(tenantId, id, { intervalMs = Number(process.env.LOGISTICS_LABEL_RETRY_SECONDS || 30) * 1000, maxMs = Number(process.env.LOGISTICS_LABEL_RETRY_MINUTES || 6) * 60_000 } = {}) {
  if (labelJobs.has(id)) return labelJobs.get(id);
  const started = Date.now();
  const job = (async () => {
    let attempt = 0;
    for (;;) {
      attempt++;
      try { await getLabel(tenantId, id, { refresh: true }); await updateRecord("carrier_shipments", id, { label_attempts: attempt, label_error: "" }); return { ok: true, attempts: attempt }; }
      catch (e) {
        const s = await findRecord("carrier_shipments", id);
        if (!s || s.status === "cancelled") return { ok: false, attempts: attempt, error: "cancelled" };
        await updateRecord("carrier_shipments", id, { label_attempts: attempt, label_error: String(e.message).slice(0, 200) });
        if (!RETRYABLE_LABEL.test(e.message) || Date.now() - started + intervalMs > maxMs) return { ok: false, attempts: attempt, error: e.message };
        await new Promise(r => setTimeout(r, intervalMs).unref?.());
      }
    }
  })().finally(() => labelJobs.delete(id));
  labelJobs.set(id, job);
  return job;
}
export async function refreshTracking(tenantId, id) {
  const s = await getShipment(tenantId, id);
  if (!s.tracking_number || s.status === "cancelled") return s;
  const t = await adapterFor(s).track(s.tracking_number);
  const events = [...t.events].sort((a, b) => String(b.time).localeCompare(String(a.time)));
  const patch = { status: t.status, events, ...(t.last_mile_number ? { last_mile_number: t.last_mile_number } : {}), tracked_at: now(), updated_at: now(), ...(t.status === "delivered" && !s.delivered_at ? { delivered_at: now() } : {}) };
  await updateRecord("carrier_shipments", id, patch);
  // "label_ready" is ours (label downloaded); the carrier only knows created/info_received until the first scan.
  const st = t.status === "info_received" && s.status === "label_ready" ? "label_ready" : t.status;
  if (st !== t.status) { patch.status = st; await updateRecord("carrier_shipments", id, { status: st }); }
  await syncOrder({ ...s, ...patch }, "tracking_sync");
  return { ...s, ...patch };
}
// Scheduled tracking sync: every shipment that is still moving is re-tracked once its tenant's sync interval (admin setting) has passed.
export const pollState = { last_run_at: null, polled: 0, errors: 0, changed: 0, running: false };
export async function pollAll({ force = false, tenantId = null } = {}) {
  if (!enabled()) return { polled: 0 };
  if (pollState.running) return { ...pollState, skipped: "already_running" };
  pollState.running = true;
  const all = await findAll(); let n = 0, errors = 0, changed = 0; const cache = new Map(), t0 = Date.now();
  try {
    for (const s of all) {
      if (TERMINAL.includes(s.status) || !s.tracking_number || (tenantId && s.tenant_id !== tenantId)) continue;
      if (!cache.has(s.tenant_id)) cache.set(s.tenant_id, await getSettings(s.tenant_id));
      const min = cache.get(s.tenant_id).sync_minutes;
      if (!force && (!min || (s.tracked_at && t0 - Date.parse(s.tracked_at) < min * 60_000 - 30_000))) continue;
      try { const r = await refreshTracking(s.tenant_id, s.id); n++; if (r.status !== s.status) changed++; }
      catch (e) { errors++; await updateRecord("carrier_shipments", s.id, { tracked_at: now(), sync_error: String(e.message).slice(0, 200) }); console.warn("[logistics] poll", s.id, e.message); }
    }
  } finally { Object.assign(pollState, { last_run_at: now(), polled: n, errors, changed, running: false }); }
  return { polled: n, errors, changed, last_run_at: pollState.last_run_at };
}
const TERMINAL = ["cancelled", "delivered", "error"];
async function findAll() { await hydrate(); const st = await getState(); return [...(st.carrier_shipments || [])]; }
export function startLogisticsPoll() {
  if (!enabled()) return;
  hydrate();
  // Tick every LOGISTICS_POLL_TICK_MINUTES (5); each shipment is only re-tracked when its tenant's sync_minutes have passed.
  const tick = Number(process.env.LOGISTICS_POLL_TICK_MINUTES || 5);
  if (tick > 0) setInterval(() => pollAll().catch(e => console.warn("[logistics] poll failed", e.message)), tick * 60_000).unref();
}

export const tenantShipmentsRaw = t => listForTenant("carrier_shipments", t);
export const tenantOrders = t => listForTenant("orders", t);

// ---------- order ⇄ shipment status sync ----------
// One mapping, used by shipment create / label / tracking sync / cancel. Order status never moves backwards except on cancel,
// and a cancelled or refunded order is never revived. Exceptions only flag the order (admin decides).
export const LOGISTICS_STATUS = {
  created: { zh: "已创建运单", en: "Label created", order: "Label created" },
  label_ready: { zh: "面单已生成", en: "Label ready", order: "Label created" },
  info_received: { zh: "承运商已接单", en: "Info received", order: "Label created" },
  in_transit: { zh: "运输中", en: "In transit", order: "Shipped" },
  delivered: { zh: "已签收", en: "Delivered", order: "Delivered" },
  exception: { zh: "物流异常", en: "Delivery issue", order: null },
  cancelled: { zh: "运单已取消", en: "Shipment cancelled", order: "Ready to ship" },
  error: { zh: "下单失败", en: "Carrier error", order: null }
};
const ORDER_RANK = { "Ready to ship": 1, "Label created": 2, Shipped: 3, Delivered: 4 };
export function orderStatusFor(order, shipmentStatus) {
  const target = LOGISTICS_STATUS[shipmentStatus]?.order;
  if (!target || /cancel|refund/i.test(order.status || "")) return order.status;
  if (shipmentStatus === "cancelled") return /deliver/i.test(order.status || "") ? order.status : "Ready to ship";
  return (ORDER_RANK[order.status] || 0) >= ORDER_RANK[target] ? order.status : target;
}
export async function syncOrder(s, source) {
  if (!s.order_id) return null;
  const live = await findRecord("orders", s.order_id);
  if (!live || (live.shipment_id && live.shipment_id !== s.id)) return null;
  const o = { ...live }; // snapshot: the store hands out the live object, which updateRecord mutates
  const status = orderStatusFor(o, s.status), ev = s.events?.[0];
  const patch = { logistics_status: s.status, tracking_status: s.status, logistics_flag: s.status === "exception" ? "exception" : "", updated_at: now(),
    tracking_last_event: ev ? { time: ev.time, text: ev.text, location: ev.location || "" } : o.tracking_last_event || null };
  if (s.status === "cancelled") Object.assign(patch, { tracking_number: "", tracking_url: "", carrier: "", carrier_id: "", shipment_id: "", tracking_last_event: null, logistics_flag: "" });
  if (status !== o.status) { patch.status = status; if (status === "Shipped" && !o.shipped_at) patch.shipped_at = now(); if (status === "Delivered" && !o.delivered_at) patch.delivered_at = now(); }
  await updateRecord("orders", o.id, patch);
  if (status !== o.status || s.status !== o.logistics_status) {
    await addRecord("order_events", { id: `evt_${crypto.randomBytes(6).toString("hex")}`, tenant_id: o.tenant_id, order_id: o.id, event_type: status === "Shipped" && o.status !== "Shipped" ? "shipped" : status === "Delivered" && o.status !== "Delivered" ? "delivered" : "logistics_status",
      source: "logistics", payload: { from: o.status, to: status, shipment_status: s.status, shipment_id: s.id, tracking_number: s.tracking_number || "", via: source }, event_time: now() });
    // Shipped e-mail: kept as a DRAFT for admin review — tracking sync never e-mails customers by itself.
    if (status === "Shipped" && o.status !== "Shipped" && o.customer_email) await addRecord("notifications", { id: `ntf_${crypto.randomBytes(6).toString("hex")}`, tenant_id: o.tenant_id, type: "order_shipped", channel: "email", status: "draft",
      related_id: o.id, to_masked: String(o.customer_email).replace(/^(.).*(@.*)$/, "$1***$2"), created_at: now(), note: "Draft only — review in admin; not sent automatically" });
  }
  return status;
}
/** Customer-safe tracking view (order lookup, My orders): carrier, number, link, status label and the timeline. */
export async function customerTracking(o) {
  if (!o?.tracking_number) return null;
  const s = o.shipment_id ? await findRecord("carrier_shipments", o.shipment_id) : null, st = s?.status || o.tracking_status || "";
  const lab = LOGISTICS_STATUS[st];
  return { carrier: o.carrier || (s ? CARRIERS[s.carrier]?.name : "") || "", number: o.tracking_number, url: o.tracking_url || "", status: st, status_label: lab ? { zh: lab.zh, en: lab.en } : null,
    updated_at: s?.tracked_at || o.updated_at || "", events: (s?.events || []).slice(0, 30).map(e => ({ time: e.time || "", location: e.location || "", text: e.text || "" })),
    ...(o.tracking_last_event ? { last_event: { time: o.tracking_last_event.time || "", text: o.tracking_last_event.text || "" } } : {}) };
}
/** Order cancelled in admin → cancel a not-yet-moving carrier shipment (reverse direction of the sync). */
export async function onOrderStatusChanged(tenantId, order, status) {
  if (!enabled() || !order?.shipment_id || !/^cancel/i.test(status)) return null;
  const s = await findRecord("carrier_shipments", order.shipment_id);
  if (!s || TERMINAL.includes(s.status)) return null;
  try { await cancelShipment(tenantId, s.id); return { shipment_id: s.id, cancelled: true }; }
  catch (e) { await updateRecord("orders", order.id, { logistics_flag: "cancel_failed" }); return { shipment_id: s.id, cancelled: false, error: e.message }; }
}
export function shipmentsCsv(rows) {
  const cols = ["id", "order_id", "reference", "carrier", "mode", "product", "status", "tracking_number", "last_mile_number", "country", "recipient", "weight_kg", "created_at", "tracked_at", "delivered_at", "alert"];
  const q = v => { const t = String(v ?? "").replace(/^[=+\-@]/, "'$&"); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return "\ufeff" + [cols.join(","), ...rows.map(r => cols.map(c => q(c === "alert" ? r.alert?.type || "" : c === "status" ? `${r.status}` : r[c])).join(","))].join("\n");
}

// ---------- channel pricing (carrier + route) ----------
// Source per channel: "live_api" (YunExpress /v1/price-trial/get, 4PX ds.xms.estimated_cost.get — both read-only)
// or "price_table" (admin-entered: first weight + each additional weight, per country). Costs are normalised to CHF via the shop FX table.
export function validatePriceTables(list) {
  if (!Array.isArray(list)) throw err("invalid_price_tables");
  return list.slice(0, 200).map(t => {
    if (!CARRIERS[t.carrier]) throw err("unknown_carrier");
    const n = (v, d) => { const x = Number(v ?? d); if (!Number.isFinite(x) || x < 0 || x > 1e5) throw err("invalid_number"); return x; };
    const countries = (Array.isArray(t.countries) ? t.countries : String(t.countries || "*").split(/[\s,]+/)).map(c => String(c).trim().toUpperCase()).filter(c => /^([A-Z]{2}|\*)$/.test(c));
    const product = clip(t.product, 40); if (!/^[\w.\-]+$/.test(product)) throw err("price_table_needs_product");
    const cur = clip(t.currency || "CNY", 3).toUpperCase(); if (!/^[A-Z]{3}$/.test(cur)) throw err("invalid_currency");
    return { carrier: t.carrier, product, name: clip(t.name, 60), countries: countries.length ? countries : ["*"], currency: cur, first_kg: n(t.first_kg, 0.5) || 0.5, first_price: n(t.first_price, 0), add_kg: n(t.add_kg, 0.5) || 0.5, add_price: n(t.add_price, 0), fixed_fee: n(t.fixed_fee, 0), days: clip(t.days, 12) };
  });
}
export function tablePrice(t, weight_kg) {
  const extra = Math.max(0, weight_kg - t.first_kg), steps = Math.ceil(Math.round(extra * 1000) / Math.round(t.add_kg * 1000));
  return r2(t.first_price + steps * t.add_price + (t.fixed_fee || 0));
}
// Carrier prices are in CNY; market rates (fx-service) normally include CNY — fallback LOGISTICS_CNY_PER_CHF (default 8.9) if not.
const toChf = (amount, cur) => { const fx = effectiveFx(), c = cur === "RMB" ? "CNY" : cur; if (c === "CHF") return r2(amount);
  const rate = Number(fx[c]) || (c === "CNY" ? Number(process.env.LOGISTICS_CNY_PER_CHF || 8.9) : 0); return rate > 0 ? r2(amount / rate) : null; };
const quoteCache = new Map(); // carrier|mode|country|postal|weight → { exp, rows }
setInterval(() => { const t = Date.now(); for (const [k, v] of quoteCache) if (v.exp < t) quoteCache.delete(k); }, 300_000).unref?.();
// Routes not suitable for printed paper (battery / Amazon-FBA lines) are shown but never auto-picked.
export const NOT_AUTO = /带电|battery|AMZ|FBA|亚马逊/i;
export async function channelQuotes(tenantId, { country, postal_code = "", weight_kg, customer_fee_chf = null, carriers } = {}) {
  const settings = await getSettings(tenantId), cc = String(country || "").toUpperCase(), w = Math.max(0.01, Number(weight_kg) || 0.2);
  if (!/^[A-Z]{2}$/.test(cc)) throw err("invalid_country");
  const out = [], sources = {};
  for (const cid of Object.keys(CARRIERS)) {
    if (!settings.carriers[cid].enabled || (carriers && !carriers.includes(cid))) continue;
    const mode = mock() ? "mock" : settings.carriers[cid].mode, key = [cid, mode, cc, postal_code, w].join("|");
    let live = null, liveErr = "";
    try {
      const c = quoteCache.get(key);
      if (c && c.exp > Date.now()) live = c.rows;
      else { const a = adapter(cid, settings); if (a.quote) { live = await a.quote({ country: cc, postal_code, weight_kg: w }); quoteCache.set(key, { exp: Date.now() + 10 * 60_000, rows: live }); } }
    } catch (e) { liveErr = String(e.message).slice(0, 160); }
    const table = (settings.price_tables || []).filter(t => t.carrier === cid && (t.countries.includes(cc) || t.countries.includes("*")));
    const tableByProduct = new Map(); for (const t of table) if (!tableByProduct.has(t.product) || t.countries.includes(cc)) tableByProduct.set(t.product, t);
    const rows = [];
    if (live?.length) for (const q of live) rows.push({ carrier: cid, product: q.product, name: q.name || "", cost: q.amount, cost_currency: q.currency === "RMB" ? "CNY" : q.currency, days: q.days || "", source: "live_api" });
    for (const t of tableByProduct.values()) if (!rows.some(r => r.product === t.product)) rows.push({ carrier: cid, product: t.product, name: t.name, cost: tablePrice(t, w), cost_currency: t.currency, days: t.days, source: "price_table" });
    sources[cid] = live?.length ? "live_api" : tableByProduct.size ? "price_table" : "none"; if (liveErr) sources[cid + "_error"] = liveErr;
    const route = productFor(settings, cid, cc);
    for (const r of rows) { r.carrier_name = CARRIERS[cid].name; r.mode = mode; r.cost_chf = toChf(r.cost, r.cost_currency); r.default_route = r.product === route; r.auto_ok = !NOT_AUTO.test(`${r.product} ${r.name}`);
      r.customer_fee_chf = customer_fee_chf; r.margin_chf = customer_fee_chf != null && r.cost_chf != null ? r2(customer_fee_chf - r.cost_chf) : null; out.push(r); }
  }
  out.sort((a, b) => (a.cost_chf ?? 1e9) - (b.cost_chf ?? 1e9));
  const cheapest = out.find(r => r.auto_ok && r.cost_chf != null) || null;
  return { country: cc, weight_kg: w, customer_fee_chf, cheapest: cheapest ? { carrier: cheapest.carrier, product: cheapest.product } : null, sources, channels: out };
}
/** Customer-charged shipping of an order in CHF (what the margin is measured against). */
export function orderShippingChf(order) { const v = Number(order?.shipping_charged ?? order?.shipping_amount); return Number.isFinite(v) ? toChf(v, order.currency || "CHF") : null; }
export async function orderChannelQuotes(tenantId, orderId, opts = {}) {
  const order = await findRecord("orders", String(orderId)); if (!order || order.tenant_id !== tenantId) throw err("order_not_found", 404);
  const a = order.shipping_address || {};
  return { order_id: order.id, ...(await channelQuotes(tenantId, { country: opts.country || a.country, postal_code: opts.postal_code ?? a.postal_code ?? "", weight_kg: Number(opts.weight_kg) || orderWeight(order), customer_fee_chf: orderShippingChf(order) })) };
}
/** carrier "cheapest" (or blank) → resolve to the cheapest auto-pickable channel. */
export async function resolveChannel(tenantId, { carrier, product, country, postal_code, weight_kg }) {
  if (carrier && carrier !== "cheapest") return { carrier, product: product || "" };
  const q = await channelQuotes(tenantId, { country, postal_code, weight_kg });
  if (!q.cheapest) throw err("no_channel_price_available");
  return q.cheapest;
}
