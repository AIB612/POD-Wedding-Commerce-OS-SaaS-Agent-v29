// YunExpress (云途) Open API adapter — https://openapi.yunexpress.cn (sandbox https://openapi-sbx.yunexpress.cn).
// Auth: POST /openapi/oauth2/token {grantType:"client_credentials", appId, appSecret[, sourceKey]} → accessToken (≈2h).
// Every call sends headers token, date (ms), sign = base64(HMAC-SHA256(appSecret, "body=<json>&date=<ms>&method=<VERB>&uri=<path>")) (body part omitted for GET).
// Endpoints: POST /v1/order/package/create · GET /v1/order/label/get?order_number= · GET /v1/track-service/info/get?order_number= · POST /v1/order/cancel
// NOTE: field names follow the published v1 schema; verify against the sandbox before go-live.
import crypto from "node:crypto";
import { httpJson, CarrierError } from "./http.js";

const BASE = { sandbox: "https://openapi-sbx.yunexpress.cn", production: "https://openapi.yunexpress.cn" };
export const REQUIRED_ENV = ["YUNEXPRESS_APP_ID", "YUNEXPRESS_APP_SECRET"];
const tokens = new Map();

export function signYun(secret, { method, path, date, body }) {
  const parts = [body ? `body=${body}` : null, `date=${date}`, `method=${method}`, `uri=${path}`].filter(Boolean).join("&");
  return crypto.createHmac("sha256", secret).update(parts).digest("base64");
}

export function createYunExpress({ env = process.env, mode = "sandbox" } = {}) {
  const base = env.YUNEXPRESS_BASE_URL || BASE[mode] || BASE.sandbox;
  const appId = env.YUNEXPRESS_APP_ID, secret = env.YUNEXPRESS_APP_SECRET;
  const fail = (m, d) => { throw new CarrierError("yunexpress", m, d); };
  async function token() {
    const k = `${base}|${appId}`, c = tokens.get(k);
    if (c && c.exp > Date.now() + 60_000) return c.v;
    const r = await httpJson(`${base}/openapi/oauth2/token`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "client_credentials", appId, appSecret: secret, ...(env.YUNEXPRESS_SOURCE_KEY ? { sourceKey: env.YUNEXPRESS_SOURCE_KEY } : {}) }) });
    const t = r.body?.accessToken || r.body?.result?.accessToken;
    if (!r.ok || !t) fail("auth_failed", { status: r.status, msg: r.body?.msg || r.body?.message });
    tokens.set(k, { v: t, exp: Date.now() + Number(r.body.expiresIn || r.body?.result?.expiresIn || 7200) * 1000 });
    return t;
  }
  async function call(method, path, { query, body } = {}) {
    if (!appId || !secret) fail("not_configured");
    const t = await token(), date = String(Date.now()), bodyText = body ? JSON.stringify(body) : "";
    const qs = query ? "?" + new URLSearchParams(query) : "";
    const r = await httpJson(base + path + qs, { method, body: bodyText || undefined,
      headers: { "content-type": "application/json", token: t, date, sign: signYun(secret, { method, path, date, body: bodyText }) } });
    const ok = r.ok && (r.body?.success === true || r.body?.code === "0" || r.body?.code === 0 || r.body?.code === 200 || r.body?.result != null);
    if (!ok) fail(r.body?.msg || r.body?.message || `http_${r.status}`, { status: r.status, code: r.body?.code });
    return r.body.result ?? r.body.data ?? r.body;
  }
  return {
    id: "yunexpress", name: "YunExpress 云途", configured: !!(appId && secret), mode,
    async createShipment(s) {
      const body = {
        product_code: s.service || env.YUNEXPRESS_PRODUCT_CODE || "", customer_order_number: s.reference,
        weight_unit: "KG", size_unit: "CM",
        packages: [{ weight: s.weight_kg, length: s.dims?.l || 20, width: s.dims?.w || 15, height: s.dims?.h || 3 }],
        receiver: { first_name: s.to.first_name, last_name: s.to.last_name, company: s.to.company || "", country_code: s.to.country, province: s.to.state || "", city: s.to.city,
          address_lines: [s.to.address1, s.to.address2].filter(Boolean), postal_code: s.to.postal_code, phone_number: s.to.phone || "", email: s.to.email || "" },
        declaration_info: s.items.map(i => ({ sku_code: i.sku, name_en: i.name_en, name_local: i.name_cn || i.name_en, quantity: i.quantity, unit_price: i.unit_value, unit_weight: i.unit_weight_kg, currency: s.currency, hs_code: i.hs_code || "" }))
      };
      const r = await call("POST", "/v1/order/package/create", { body });
      const w = Array.isArray(r) ? r[0] : r;
      return { carrier_order_id: w.waybill_number || w.waybillNumber, tracking_number: w.tracking_number || w.trackingNumber || w.waybill_number || w.waybillNumber, raw_status: "created" };
    },
    async getLabel(orderNo) {
      const r = await call("GET", "/v1/order/label/get", { query: { order_number: orderNo } });
      const url = r.url || r.label_url || r.labelUrl || r[0]?.url;
      const b64 = r.label_string || r.labelString || r.base64;
      return { url: url || null, pdf_base64: b64 || null };
    },
    async track(number) {
      const r = await call("GET", "/v1/track-service/info/get", { query: { order_number: number } });
      const info = Array.isArray(r) ? r[0] : r;
      const evs = (info?.track_events || info?.trackEvents || info?.track_info?.track_events || []).map(e => ({
        time: e.process_time || e.processTime || e.time, location: e.process_location || e.processLocation || "", text: e.process_content || e.processContent || e.description || "", code: e.track_node_code || e.code || "" }));
      return { status: normalise(info?.package_status || info?.packageStatus || info?.status, evs), events: evs };
    },
    async cancel(orderNo) { await call("POST", "/v1/order/cancel", { body: { order_number: orderNo } }); return { cancelled: true }; }
  };
}
export function normalise(raw, events = []) {
  const s = String(raw ?? "").toLowerCase(), last = String(events[events.length - 1]?.text || events[0]?.text || "").toLowerCase();
  if (/deliver|签收|妥投|^4$/.test(s) || /delivered|签收|妥投/.test(last)) return "delivered";
  if (/exception|fail|return|异常|退/.test(s)) return "exception";
  if (/transit|运输|^[23]$/.test(s) || events.length) return "in_transit";
  return "info_received";
}
