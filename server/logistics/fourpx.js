// 4PX (递四方) Open Platform adapter — POST https://open.4px.com/router/api/service (test: https://open-test.4px.com/router/api/service).
// Query params: method, app_key, v, timestamp(ms), format=json, sign[, language]. Body = compact JSON.
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
    const r = await httpJson(`${base}?${qs}`, { method: "POST", headers: { "content-type": "application/json" }, body });
    if (!r.ok || String(r.body?.result) !== "1") fail(r.body?.msg || r.body?.errors?.[0]?.error_msg || `http_${r.status}`, { status: r.status, errors: r.body?.errors });
    return r.body.data || {};
  }
  return {
    id: "fourpx", name: "4PX 递四方", configured: !!(key && secret), mode,
    async createShipment(s) {
      const d = await call("ds.xms.order.create", "1.1.0", {
        ref_no: s.reference, business_type: "BDS", duty_type: "U", is_insure: "N",
        logistics_service_info: { logistics_product_code: s.service || env.FOURPX_PRODUCT_CODE || DEFAULT_PRODUCT },
        sender: { first_name: s.from.name || "Wed.AI", company: s.from.company || "", phone: s.from.phone || "", country: s.from.country, city: s.from.city || "", street: s.from.address1 || "", post_code: s.from.postal_code || "" },
        recipient_info: { first_name: s.to.first_name, last_name: s.to.last_name, company: s.to.company || "", phone: s.to.phone || "", email: s.to.email || "", post_code: s.to.postal_code, country: s.to.country, state: s.to.state || "", city: s.to.city, street: [s.to.address1, s.to.address2].filter(Boolean).join(" ") },
        parcel_list: [{ weight: Math.round(s.weight_kg * 1000), parcel_value: s.declared_value, currency: s.currency, include_battery: "N",
          declare_product_info: s.items.map(i => ({ declare_product_name_en: i.name_en, declare_product_name_cn: i.name_cn || i.name_en, declare_product_code_qty: i.quantity, declare_unit_price_export: i.unit_value, currency_export: s.currency, declare_unit_price_import: i.unit_value, currency_import: s.currency, brand_export: "none", brand_import: "none", hscode_export: i.hs_code || "", hscode_import: i.hs_code || "" })) }],
        is_return_on_domestic: "U", is_return_on_oversea: "U",
        deliver_type_info: { deliver_type: "1" }
      });
      return { carrier_order_id: d["4px_tracking_no"] || d.ds_consignment_no, tracking_number: d.logistics_channel_no || d["4px_tracking_no"], raw_status: "created" };
    },
    async getOrder(requestNo) { const d = await call("ds.xms.order.get", "1.1.0", { request_no: requestNo }); return Array.isArray(d) ? d[0] || null : d; },
    async getLabel(orderNo) {
      const d = await call("ds.xms.label.get", "1.1.0", { request_no: orderNo, response_label_format: "PDF", label_size: "label_100x150" });
      return { url: d.label_url_info?.logistics_label || d.label_url || null, pdf_base64: null };
    },
    async track(number) {
      const d = await call("tr.order.tracking.get", "1.0.0", { deliveryOrderNo: number });
      const evs = (d.trackingList || []).map(e => ({ time: e.occurDatetime, location: e.occurLocation || "", text: e.trackingContent || "", code: e.businessLinkCode || "" }));
      const last = evs[0]?.code || "";
      return { status: /FPX_S_OK|DELIVERED/i.test(last) ? "delivered" : /FPX_[IX]_|EXCEPTION|RETURN/i.test(last) ? "exception" : evs.length ? "in_transit" : "info_received", events: evs };
    },
    async cancel(orderNo) { await call("ds.xms.order.cancel", "1.0.0", { request_no: orderNo, cancel_reason: "cancelled by merchant" }); return { cancelled: true }; }
  };
}
