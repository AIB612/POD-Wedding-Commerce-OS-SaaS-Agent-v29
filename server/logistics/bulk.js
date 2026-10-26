// Excel / CSV bulk shipment ordering: template → upload → validation preview (per-row errors, channel + cost) → confirm → results sheet.
// Rows with the same order_ref are one parcel with several item lines. Blank carrier/route → cheapest auto-pickable channel.
import crypto from "node:crypto";
import { workbookBuffer, parseXlsx, parseCsv } from "../services/data-exchange-service.js";
import { findRecord } from "../saas-store.js";
import * as L from "./index.js";

export const COLUMNS = [
  ["order_ref", "订单参考号", true], ["recipient_name", "收件人", true], ["phone", "电话", false], ["email", "邮箱", false],
  ["address1", "地址1", true], ["address2", "地址2", false], ["city", "城市", true], ["state", "州/省", false], ["postal_code", "邮编", true], ["country", "国家(2位代码)", true],
  ["item_name_en", "品名(英文)", true], ["item_name_cn", "品名(中文)", false], ["quantity", "数量", true], ["unit_value_usd", "申报单价(USD)", true], ["hs_code", "海关编码", false],
  ["weight_kg", "包裹重量(kg)", true], ["carrier", "承运商(yunexpress/fourpx/空=最便宜)", false], ["route", "渠道代码(空=自动)", false]];
const header = c => `${c[0]} | ${c[1]}`;

export function templateBuffer() {
  const sample = [
    ["WEDAI-1001", "Anna Muster", "+41790000000", "anna@example.com", "Bahnhofstrasse 1", "", "Zürich", "", "8001", "CH", "Printed wedding invitation", "纸质请柬", 50, 0.8, "4909", 0.6, "", ""],
    ["WEDAI-1001", "", "", "", "", "", "", "", "", "", "Envelope", "信封", 50, 0.2, "4817", "", "", ""],
    ["WEDAI-1002", "Max Mustermann", "+4915100000000", "", "Unter den Linden 5", "", "Berlin", "", "10117", "DE", "Printed menu card", "纸质菜单", 20, 1.5, "4911", 0.4, "fourpx", "QC"]];
  const help = [["How to use · 使用说明"], ["1. One row per item line; rows with the same order_ref become ONE parcel. 每行一个品项；相同订单参考号合并为一个包裹。"],
    ["2. Recipient/address/weight only needed on the first row of each parcel. 收件信息与重量只需填写在每个包裹的第一行。"],
    ["3. carrier: yunexpress / fourpx, or leave blank to auto-pick the cheapest channel. 承运商留空 = 自动选最便宜渠道。"],
    ["4. route: carrier product code (e.g. THPHR, QC); blank = cheapest route of that carrier. 渠道代码留空 = 该承运商最便宜渠道。"],
    ["5. If order_ref equals an existing Wed.AI order number, the shipment is linked to that order (status sync). 若订单参考号与站内订单号相同，将关联订单并同步状态。"],
    ["6. Upload in admin → Carriers → Bulk (Excel). Review the preview, then confirm. 在后台 物流 → 批量下单 上传，预览确认后创建。"]];
  return workbookBuffer([{ name: "Shipments", rows: [COLUMNS.map(header), ...sample] }, { name: "Help", rows: help }]);
}

function keyFor(h) { const k = String(h || "").split("|")[0].trim().toLowerCase().replace(/\s+/g, "_"); const z = String(h || "").trim();
  return COLUMNS.find(c => c[0] === k || z.includes(c[1]))?.[0] || null; }

export function parseUpload(buffer, filename = "") {
  const csv = /\.csv$/i.test(filename) || buffer.subarray(0, 2).toString() !== "PK";
  const rows = csv ? parseCsv(buffer.toString("utf8").replace(/^\ufeff/, "")) : parseXlsx(buffer, "Shipments").rows;
  if (!rows.length) throw Object.assign(new Error("empty_file"), { status: 400 });
  const keys = rows[0].map(keyFor);
  for (const c of COLUMNS) if (c[2] && !keys.includes(c[0])) throw Object.assign(new Error(`missing_column: ${c[0]}`), { status: 400 });
  return rows.slice(1).map((r, i) => ({ line: i + 2, ...Object.fromEntries(keys.map((k, j) => [k, r[j] == null ? "" : String(r[j]).trim()]).filter(([k]) => k)) }))
    .filter(r => COLUMNS.some(c => r[c[0]]));
}

const previews = new Map(); // token → { tenantId, parcels, expires, results }
setInterval(() => { const t = Date.now(); for (const [k, v] of previews) if (v.expires < t) previews.delete(k); }, 60_000).unref();

export async function preview(tenantId, buffer, filename) {
  const rows = parseUpload(buffer, filename);
  if (rows.length > 1000) throw Object.assign(new Error("too_many_rows"), { status: 400 });
  const groups = new Map();
  for (const r of rows) { const ref = r.order_ref || `(line ${r.line})`; if (!groups.has(ref)) groups.set(ref, []); groups.get(ref).push(r); }
  const parcels = [];
  for (const [ref, lines] of groups) {
    const h = lines[0], errors = [], num = (v, f) => { const x = Number(String(v).replace(",", ".")); return Number.isFinite(x) ? x : f; };
    for (const k of ["order_ref", "recipient_name", "address1", "city", "postal_code", "country", "weight_kg"]) if (!h[k]) errors.push(`line ${h.line}: ${k} required`);
    const country = String(h.country || "").toUpperCase(); if (country && !/^[A-Z]{2}$/.test(country)) errors.push(`line ${h.line}: country must be a 2-letter code`);
    const weight = num(h.weight_kg, NaN); if (h.weight_kg && !(weight > 0 && weight <= 30)) errors.push(`line ${h.line}: weight_kg must be 0–30`);
    const items = lines.map(l => { const q = num(l.quantity, NaN), v = num(l.unit_value_usd, NaN);
      if (!l.item_name_en) errors.push(`line ${l.line}: item_name_en required`);
      if (!(q >= 1 && q <= 999 && Number.isInteger(q))) errors.push(`line ${l.line}: quantity must be 1–999`);
      if (!(v > 0 && v < 10000)) errors.push(`line ${l.line}: unit_value_usd must be > 0`);
      if (l.hs_code && !/^\d{4,10}$/.test(l.hs_code)) errors.push(`line ${l.line}: hs_code must be 4–10 digits`);
      return { sku: "item", name_en: l.item_name_en, name_cn: l.item_name_cn || "纸质印刷品", quantity: q, unit_value: v, unit_weight_kg: 0.1, hs_code: l.hs_code || process.env.LOGISTICS_DEFAULT_HS_CODE || "4909" }; });
    const carrier = String(h.carrier || "").toLowerCase().trim(); if (carrier && !L.CARRIERS[carrier] && carrier !== "cheapest") errors.push(`line ${h.line}: carrier must be yunexpress, fourpx or blank`);
    if (h.route && !/^[\w.\-]+$/.test(h.route)) errors.push(`line ${h.line}: invalid route code`);
    const order = await findRecord("orders", ref); const linked = order && order.tenant_id === tenantId ? order.id : "";
    let channel = null;
    if (!errors.length) {
      try { const q = await L.channelQuotes(tenantId, { country, postal_code: h.postal_code, weight_kg: weight, customer_fee_chf: linked ? L.orderShippingChf(order) : null, carriers: carrier && carrier !== "cheapest" ? [carrier] : undefined });
        const pick = h.route ? q.channels.find(c => c.product === h.route && (!carrier || c.carrier === carrier)) : q.channels.find(c => c.auto_ok && c.cost_chf != null);
        if (h.route && !pick) channel = { carrier: carrier || L.pickCarrier(await L.getSettings(tenantId), country), product: h.route, cost_chf: null, source: "none", note: "route not in price list — carrier will validate" };
        else if (pick) channel = { carrier: pick.carrier, product: pick.product, name: pick.name, cost: pick.cost, cost_currency: pick.cost_currency, cost_chf: pick.cost_chf, customer_fee_chf: pick.customer_fee_chf, margin_chf: pick.margin_chf, source: pick.source, days: pick.days, auto: !h.route };
        else if (carrier) channel = { carrier, product: "", cost_chf: null, source: "none", note: "no price found — carrier default route" };
        else errors.push(`line ${h.line}: no channel price available for ${country} — set carrier and route`);
      } catch (e) { errors.push(`line ${h.line}: ${e.message}`); }
    }
    const [first, ...rest] = String(h.recipient_name || "").split(/\s+/);
    parcels.push({ ref, lines: lines.map(l => l.line), linked_order: linked, ok: !errors.length, errors, channel, weight_kg: weight, country,
      to: { first_name: first || "", last_name: rest.join(" ") || first || "", phone: h.phone, email: h.email, address1: h.address1, address2: h.address2, city: h.city, state: h.state, postal_code: h.postal_code, country }, items });
  }
  const token = crypto.randomBytes(16).toString("hex");
  previews.set(token, { tenantId, parcels, expires: Date.now() + 30 * 60_000, results: null });
  const ok = parcels.filter(p => p.ok);
  return { token, parcels: parcels.length, valid: ok.length, invalid: parcels.length - ok.length, total_cost_chf: Math.round(ok.reduce((a, p) => a + (p.channel?.cost_chf || 0), 0) * 100) / 100,
    rows: parcels.map(({ items, to, ...p }) => ({ ...p, recipient: `${to.first_name} ${to.last_name}`.trim(), city: to.city, item_lines: items.length })) };
}

export async function commit(tenantId, token) {
  const p = previews.get(token);
  if (!p || p.tenantId !== tenantId || p.expires < Date.now()) throw Object.assign(new Error("invalid_or_expired_preview"), { status: 400 });
  if (p.results) return summary(p);
  const results = [];
  for (const x of p.parcels) {
    if (!x.ok) { results.push({ ref: x.ref, ok: false, error: x.errors.join("; ") }); continue; }
    try {
      const opts = { carrier: x.channel.carrier, product: x.channel.product || undefined, overrides: { to: x.to, weight_kg: x.weight_kg, items: x.items, reference: x.ref }, labelRetry: true };
      const s = x.linked_order ? await L.createShipment(tenantId, x.linked_order, { ...opts, overrides: { ...opts.overrides, reference: undefined }, allow_unpaid: true })
        : await L.createManualShipment(tenantId, { carrier: opts.carrier, product: opts.product, to: x.to, weight_kg: x.weight_kg, items: x.items, reference: x.ref });
      results.push({ ref: x.ref, ok: true, shipment_id: s.id, carrier: s.carrier, product: s.product, mode: s.mode, tracking_number: s.tracking_number, cost_chf: x.channel.cost_chf, source: x.channel.source, linked_order: x.linked_order });
    } catch (e) { results.push({ ref: x.ref, ok: false, error: e.message }); }
  }
  p.results = results; p.expires = Date.now() + 24 * 3600_000;
  return summary(p);
}
const summary = p => ({ created: p.results.filter(r => r.ok).length, failed: p.results.filter(r => !r.ok).length, results: p.results });

export async function resultsWorkbook(tenantId, token, base = "") {
  const p = previews.get(token);
  if (!p || p.tenantId !== tenantId || !p.results) throw Object.assign(new Error("no_results"), { status: 404 });
  const rows = [["order_ref | 订单参考号", "result | 结果", "carrier | 承运商", "route | 渠道", "mode | 环境", "tracking_number | 运单号", "cost_chf | 成本(CHF)", "price_source | 价格来源", "label | 面单", "error | 错误"]];
  for (const r of p.results) {
    let label = "";
    if (r.ok) { try { await L.getShipment(tenantId, r.shipment_id); label = `${base}/api/saas/carriers/shipments/${r.shipment_id}/label`; } catch {} }
    rows.push([r.ref, r.ok ? "OK" : "FAILED", r.carrier || "", r.product || "", r.mode || "", r.tracking_number || "", r.cost_chf ?? "", r.source || "", label, r.error || ""]);
  }
  return workbookBuffer([{ name: "Results", rows }]);
}
