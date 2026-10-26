// YunExpress (云途) Open API — docs https://open.yunexpress.cn/openApi/doc (verified against the sandbox 2026-10-26).
// Auth: POST /openapi/oauth2/token {grantType:"client_credentials", appId, appSecret, sourceKey} → accessToken (7200 s).
// Every call: headers token, date (ms), sign = base64(HMAC-SHA256(appSecret, "body=<json>&date=<ms>&method=<VERB>&uri=<path>")),
// body segment omitted when there is no body; Accept-Language en-US (other values → 02050024 "language not supported").
// Envelope: { success, result, code, msg }.
// POST /v1/order/package/create · GET /v1/order/label/get?order_number= · GET /v1/track-service/info/get?order_number= · POST /v1/order/cancel {waybill_number}
import crypto from "node:crypto";
import { httpJson, CarrierError } from "./http.js";

const BASE = { sandbox: "https://openapi-sbx.yunexpress.cn", production: "https://openapi.yunexpress.cn" };
export const REQUIRED_ENV = ["YUNEXPRESS_APP_ID", "YUNEXPRESS_APP_SECRET"];
export const DEFAULT_PRODUCT = "BKZXR"; // YunExpress Global Direct Line (tracked) — sandbox-accepted for DE, CH and US
const tokens = new Map();

export function signYun(secret, { method, path, date, body }) {
  const parts = [body ? `body=${body}` : null, `date=${date}`, `method=${method}`, `uri=${path}`].filter(Boolean).join("&");
  return crypto.createHmac("sha256", secret).update(parts).digest("base64");
}
const lines = (...a) => { const out = []; for (const v of a.filter(Boolean).map(String)) for (let i = 0; i < v.length; i += 50) out.push(v.slice(i, i + 50)); return out.slice(0, 3); };
export const YUN_STATUS = { N: "info_received", F: "info_received", T: "in_transit", D: "delivered", E: "exception", R: "exception", C: "cancelled" };
export function createYunExpress({ env = process.env, mode = "sandbox" } = {}) {
  const base = (mode === "production" ? env.YUNEXPRESS_PROD_BASE_URL || BASE.production : env.YUNEXPRESS_BASE_URL || BASE.sandbox).replace(/\/$/, "");
  const sourceKey = env.YUNEXPRESS_SOURCE_KEY || env.YUNEXPRESS_SOURCEKEY;
  const appId = env.YUNEXPRESS_APP_ID, secret = env.YUNEXPRESS_APP_SECRET;
  const fail = (m, d) => { throw new CarrierError("yunexpress", m, d); };
  async function token() {
    const k = `${base}|${appId}`, c = tokens.get(k);
    if (c && c.exp > Date.now() + 60_000) return c.v;
    const r = await httpJson(`${base}/openapi/oauth2/token`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ grantType: "client_credentials", appId, appSecret: secret, ...(sourceKey ? { sourceKey } : {}) }) });
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
      headers: { "content-type": "application/json", "accept-language": "en-US", token: t, date, sign: signYun(secret, { method, path, date, body: bodyText }) } });
    const ok = r.ok && r.body?.success === true;
    if (!ok) fail(`${r.body?.code ? r.body.code + " " : ""}${r.body?.msg || r.body?.message || `http_${r.status}`}`, { status: r.status, code: r.body?.code });
    return r.body.result;
  }
  return {
    id: "yunexpress", name: "YunExpress 云途", configured: !!(appId && secret), mode,
    async createShipment(s) {
      const body = {
        product_code: s.service || env.YUNEXPRESS_PRODUCT_CODE || DEFAULT_PRODUCT, customer_order_number: s.reference,
        weight_unit: "KG", size_unit: "CM", sensitive_type: "W", label_type: "PDF",
        packages: [{ weight: s.weight_kg, length: s.dims?.l || 20, width: s.dims?.w || 15, height: s.dims?.h || 3 }],
        receiver: { first_name: s.to.first_name, last_name: s.to.last_name, company: s.to.company || "", country_code: s.to.country, province: s.to.state || "", city: s.to.city,
          address_lines: lines(s.to.address1, s.to.address2), postal_code: s.to.postal_code, phone_number: s.to.phone || "", email: s.to.email || "" },
        declaration_info: s.items.map(i => ({ sku_code: i.sku, name_en: i.name_en, name_local: i.name_cn || i.name_en, quantity: i.quantity, unit_price: Math.max(0.01, i.unit_value), unit_weight: Math.max(0.001, i.unit_weight_kg), currency: s.currency, hs_code: i.hs_code || "" })),
        ...(s.from?.address1 ? { sender: { first_name: s.from.name || "Wed.AI", last_name: s.from.last_name || "", company: s.from.company || "", country_code: s.from.country, province: s.from.state || "", city: s.from.city || "",
          address_lines: lines(s.from.address1), postal_code: s.from.postal_code || "", phone_number: s.from.phone || "" } } : {})
      };
      const r = await call("POST", "/v1/order/package/create", { body });
      // tracking_number (last-mile) is often null at creation; the YT waybill number is trackable on yuntrack.com and via the API.
      return { carrier_order_id: r.waybill_number, tracking_number: r.waybill_number, last_mile_number: r.tracking_number || "", raw_status: "created" };
    },
    async getLabel(orderNo) {
      const r = await call("GET", "/v1/order/label/get", { query: { order_number: orderNo } });
      return { url: r?.url || null, pdf_base64: r?.label_string || null, type: r?.label_type || "PDF" };
    },
    async track(number) {
      const r = await call("GET", "/v1/track-service/info/get", { query: { order_number: number } });
      const info = Array.isArray(r) ? r[0] : r, ti = info?.track_Info || info?.track_info || {};
      const evs = (ti.track_events || []).map(e => ({ time: e.process_time, location: e.process_location || e.process_city || "", text: e.process_content || "", code: e.track_node_code || "" }));
      return { status: YUN_STATUS[info?.package_status] || (evs.length ? "in_transit" : "info_received"), raw_status: info?.package_status || "", last_mile_number: ti.tracking_number || "", events: evs };
    },
    async cancel(waybill) { await call("POST", "/v1/order/cancel", { body: { waybill_number: waybill } }); return { cancelled: true }; }
  };
}
