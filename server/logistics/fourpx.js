// 4PX (递四方) Open Platform adapter — POST https://open.4px.com/router/api/service (test: https://open-test.4px.com/router/api/service).
// Query params: method, app_key, v, timestamp(ms), format=json, sign[, language]. Body = compact JSON.
// Optional access_token query param (FOURPX_ACCESS_TOKEN), excluded from the signature.
// sign = md5_lower( "app_key"+K+"format"+"json"+"method"+M+"timestamp"+T+"v"+V + body + appSecret )  (sorted, no access_token/language).
// Methods: ds.xms.order.create (v1.1.0) · ds.xms.label.get (v1.1.0) · tr.order.tracking.get (v1.0.0) · ds.xms.order.cancel (v1.0.0).
import crypto from "node:crypto";
import { httpJson, CarrierError } from "./http.js";

const BASE = { sandbox: "https://open-test.4px.com/router/api/service", production: "https://open.4px.com/router/api/service" };
export const REQUIRED_ENV = ["FOURPX_APP_KEY", "FOURPX_APP_SECRET"];
export const DEFAULT_PRODUCT = "QC"; // 联邮通标准挂号-普货 (Postlink standard registered, general goods)

export function sign4px({ app_key, method, timestamp, v, body, secret }) {
  const s = `app_key${app_key}formatjsonmethod${method}timestamp${timestamp}v${v}${body}${secret}`;
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

export function createFourPx({ env = process.env, mode = "sandbox" } = {}) {
  const rawBase = (mode === "production" ? env.FOURPX_PROD_BASE_URL || BASE.production : env.FOURPX_BASE_URL || BASE.sandbox).replace(/\/$/, ""),
    base = /\/router\/api\/service$/.test(rawBase) ? rawBase : `${rawBase}/router/api/service`, key = env.FOURPX_APP_KEY, secret = env.FOURPX_APP_SECRET;
  const fail = (m, d) => { throw new CarrierError("fourpx", m, d); };
  async function call(method, v, payload) {
    if (!key || !secret) fail("not_configured");
    const body = JSON.stringify(payload), timestamp = String(Date.now());
    const qs = new URLSearchParams({ method, app_key: key, v, timestamp, format: "json", language: "en", sign: sign4px({ app_key: key, method, timestamp, v, body, secret }) });
    // access_token (OAuth / platform customers) is sent but NOT signed — per the 4PX docs it is excluded like language.
    if (env.FOURPX_ACCESS_TOKEN) qs.set("access_token", env.FOURPX_ACCESS_TOKEN);
    const r = await httpJson(`${base}?${qs}`, { method: "POST", headers: { "content-type": "application/json" }, body });
    if (!r.ok || String(r.body?.result) !== "1") { const e0 = r.body?.errors?.[0]; fail(r.body?.result && r.body.result !== "0" && !e0 ? `${r.body.result} ${r.body?.msg || ""}`.trim() : [e0?.error_code, e0?.error_msg || r.body?.msg || r.body?.message || `http_${r.status}`].filter(Boolean).join(" "), { status: r.status, errors: r.body?.errors, result: r.body?.result }); }
    return r.body.data || {};
  }
  return {
    id: "fourpx", name: "4PX 递四方", configured: !!(key && secret), mode,
    async createShipment(s) {
      const d = await call("ds.xms.order.create", "1.1.0", {
        ref_no: s.reference, ...(s.ioss_no || env.FOURPX_IOSS_NO || env.IOSS_NO ? { ioss_no: s.ioss_no || env.FOURPX_IOSS_NO || env.IOSS_NO } : {}), business_type: "BDS", duty_type: "U", is_insure: "N",
        logistics_service_info: { logistics_product_code: s.service || env.FOURPX_PRODUCT_CODE || DEFAULT_PRODUCT },
        sender: { first_name: s.from.name || "Wed.AI", company: s.from.company || "", phone: s.from.phone || "", country: s.from.country, state: s.from.state || "", city: s.from.city || "", street: s.from.address1 || "", post_code: s.from.postal_code || "" },
        recipient_info: { first_name: s.to.first_name, last_name: s.to.last_name, company: s.to.company || "", phone: s.to.phone || "", email: s.to.email || "", post_code: s.to.postal_code, country: s.to.country, state: s.to.state || "", city: s.to.city, street: [s.to.address1, s.to.address2].filter(Boolean).join(" ") },
        parcel_list: [{ weight: Math.round(s.weight_kg * 1000), parcel_value: s.declared_value, currency: s.currency, include_battery: "N",
          declare_product_info: s.items.map(i => ({ declare_product_name_en: i.name_en, declare_product_name_cn: i.name_cn || i.name_en, declare_product_code_qty: i.quantity, declare_unit_price_export: i.unit_value, currency_export: s.currency, declare_unit_price_import: i.unit_value, currency_import: s.currency, brand_export: "none", brand_import: "none", hscode_export: i.hs_code || "", hscode_import: i.hs_code || "" })) }],
        is_return_on_domestic: "U", is_return_on_oversea: "U",
        deliver_type_info: { deliver_type: s.handover === "dropoff" ? "3" : "1" } // 1 = 上门揽收 pickup · 3 = 自送到仓 drop-off
      });
      return { carrier_order_id: d["4px_tracking_no"] || d.ds_consignment_no, tracking_number: d.logistics_channel_no || d["4px_tracking_no"], raw_status: "created" };
    },
    // Freight estimate (运费试算) ds.xms.estimated_cost.get — read-only. data is a JSON string of [{ logistics_product_code, lump_sum_fee (CNY), charge_weight, estimated_time }].
    async quote({ country, postal_code = "", weight_kg, dims }) {
      let d = await call("ds.xms.estimated_cost.get", "1.0.0", { country_code: country, post_code: postal_code || "", weight: String(Math.max(1, Math.round(weight_kg * 1000))), cargo_type: "P",
        ...(dims ? { length: dims.l, width: dims.w, height: dims.h } : {}) });
      if (typeof d === "string") { try { d = JSON.parse(d); } catch { d = []; } }
      return (Array.isArray(d) ? d : []).map(q => ({ product: q.logistics_product_code, amount: Number(q.lump_sum_fee), currency: "CNY", charge_weight_kg: Number(q.charge_weight) || null, days: q.estimated_time || "" })).filter(q => q.product && Number.isFinite(q.amount));
    },
    async listProducts() {
      const d = await call("ds.xms.logistics_product.getlist", "1.0.0", { transport_mode: "1" });
      return (Array.isArray(d) ? d : []).map(p => ({ code: p.logistics_product_code, name: p.logistics_product_name_en && p.logistics_product_name_en !== p.logistics_product_code ? `${p.logistics_product_name_cn} · ${p.logistics_product_name_en}` : p.logistics_product_name_cn, tracked: p.order_track === "Y" }));
    },
    async getOrder(requestNo) { const d = await call("ds.xms.order.get", "1.1.0", { request_no: requestNo }); return Array.isArray(d) ? d[0] || null : d; },
    async getLabel(orderNo) {
      const d = await call("ds.xms.label.get", "1.1.0", { request_no: orderNo, response_label_format: "PDF", label_size: "label_100x150" });
      return { url: d.label_url_info?.logistics_label || d.label_url || null, pdf_base64: null };
    },
    async track(number) {
      let d;
      // AT014002 / 未查询到相关物流轨迹 = no scans yet (normal right after creation) → empty timeline, not an error.
      try { d = await call("tr.order.tracking.get", "1.0.0", { deliveryOrderNo: number }); }
      catch (e) { if (/AT014002|未查询到|no.*track/i.test(e.message + JSON.stringify(e.detail || {}))) return { status: "info_received", events: [] }; throw e; }
      const evs = (d.trackingList || []).map(e => ({ time: e.occurDatetime, location: e.occurLocation || "", text: e.trackingContent || "", code: e.businessLinkCode || "" }));
      const last = evs[0]?.code || "";
      return { status: /FPX_S_OK|DELIVERED/i.test(last) ? "delivered" : /FPX_[IX]_|EXCEPTION|RETURN/i.test(last) ? "exception" : evs.length ? "in_transit" : "info_received", events: evs };
    },
    async cancel(orderNo) { await call("ds.xms.order.cancel", "1.0.0", { request_no: orderNo, cancel_reason: "cancelled by merchant" }); return { cancelled: true }; }
  };
}
