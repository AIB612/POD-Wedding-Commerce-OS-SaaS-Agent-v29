// Parcel tracking for the customer chat (Wed.AI POD Agent + Pod.AI Shopify app). Read-only: never creates carrier orders.
// Order of sources (Sherry's rule):
//   1. the logistics platform itself when it is one we integrate and its keys are set
//      (YunExpress: YUNEXPRESS_APP_ID/SECRET, sandbox · 4PX: FOURPX_APP_KEY/SECRET; mode from admin → Carriers)
//   2. otherwise, or when the platform returns nothing: 51Tracking v4 (TRACKING51_API_KEY) — register the number if needed, then fetch
//   3. otherwise: the carrier's tracking link (e.g. the Shopify fulfillment tracking URL)
// Results are cached (TRACKING_CACHE_MINUTES, default 30). Keys are read by name only and never logged or returned.
import { CARRIERS, adapter, carrierStatus, getSettings as logisticsSettings } from "../logistics/index.js";
import { httpJson } from "../logistics/http.js";

const API51 = "https://api.51tracking.com/v4";
const ttl = () => Math.max(1, Number(process.env.TRACKING_CACHE_MINUTES || 30)) * 60_000;
const cache = new Map();
export const clearTrackingCache = () => cache.clear();

/** Which carrier we integrate, from the carrier name / tracking number. null = not ours. */
export function detectCarrier(company = "", number = "") {
  const c = String(company).toLowerCase(), n = String(number).toUpperCase();
  if (/yun ?express|yuntrack|云途/.test(c) || /^YT\d{10,}/.test(n)) return "yunexpress";
  if (/4px|递四方|fourpx/.test(c) || /^4PX/.test(n)) return "fourpx";
  return null;
}
/** Guess a 51Tracking courier code from the carrier name (51Tracking can also detect it). */
const COURIER51 = [[/swiss ?post|post\.ch|die post/i, "swiss-post"], [/dhl ?express/i, "dhl"], [/dhl/i, "dhl-germany"], [/ups/i, "ups"], [/fedex/i, "fedex"], [/usps/i, "usps"],
  [/royal mail/i, "royal-mail"], [/la poste|colissimo/i, "laposte"], [/deutsche post/i, "deutsch-post"], [/china post/i, "china-post"], [/yun ?express|云途/i, "yunexpress"], [/4px|递四方/i, "4px"]];
export const courier51 = company => (COURIER51.find(([re]) => re.test(String(company || ""))) || [])[1] || null;

const STATUS51 = { pending: "info_received", inforeceived: "info_received", notfound: "not_found", transit: "in_transit", pickup: "out_for_delivery", delivered: "delivered",
  undelivered: "exception", exception: "exception", expired: "exception" };
export const STATUS_TEXT = {
  info_received: { en: "Label created, waiting for the first scan", de: "Sendung angemeldet, noch kein Scan", zh: "已下单，等待揽收" },
  in_transit: { en: "In transit", de: "Unterwegs", zh: "运输中" }, out_for_delivery: { en: "Out for delivery", de: "In Zustellung", zh: "派送中" },
  delivered: { en: "Delivered", de: "Zugestellt", zh: "已签收" }, exception: { en: "Delivery problem", de: "Zustellproblem", zh: "派送异常" },
  not_found: { en: "No tracking information yet", de: "Noch keine Sendungsdaten", zh: "暂无物流信息" }, unknown: { en: "Status unknown", de: "Status unbekannt", zh: "状态未知" }
};
export const statusText = (st, lang = "en") => (STATUS_TEXT[st] || STATUS_TEXT.unknown)[lang] || (STATUS_TEXT[st] || STATUS_TEXT.unknown).en;

const norm = e => ({ time: String(e.time || ""), location: String(e.location || ""), text: String(e.text || "") });
const sortEvents = evs => evs.map(norm).filter(e => e.text || e.time).sort((a, b) => String(b.time).localeCompare(String(a.time))).slice(0, 30);

/** Configured sources (names only) — shown in admin. */
export async function trackingSources(tenantId = process.env.DEFAULT_TENANT_ID || "tenant_demo") {
  let carriers = [];
  try { carriers = carrierStatus(await logisticsSettings(tenantId)).map(c => ({ id: c.id, name: c.name, enabled: c.enabled, mode: c.mode, configured: !!c.configured && c.enabled, env: c.required_env })); } catch { carriers = []; }
  return { order: ["carrier_api", "51tracking", "tracking_link"], carriers, tracking51: { configured: !!process.env.TRACKING51_API_KEY, env: "TRACKING51_API_KEY" }, cache_minutes: ttl() / 60_000 };
}

async function viaCarrier(id, number, tenantId) {
  const settings = await logisticsSettings(tenantId);
  const st = carrierStatus(settings).find(c => c.id === id);
  if (!st?.enabled || !st.configured) return null;
  const t = await adapter(id, settings).track(number); // read-only tracking call
  const events = sortEvents(t.events || []);
  if (!events.length && (!t.status || t.status === "info_received")) return null; // platform knows nothing yet → try 51Tracking
  return { source: id, status: t.status || (events.length ? "in_transit" : "info_received"), events };
}

const h51 = () => ({ "Content-Type": "application/json", "Tracking-Api-Key": process.env.TRACKING51_API_KEY });
const list51 = body => { const d = body?.data; return Array.isArray(d) ? d : Array.isArray(d?.success) ? d.success : Array.isArray(d?.items) ? d.items : []; };
async function get51(number, courier) {
  const q = new URLSearchParams({ tracking_numbers: number, ...(courier ? { courier_code: courier } : {}) });
  const r = await httpJson(`${API51}/trackings/get?${q}`, { headers: h51() });
  if (r.status === 401 || r.status === 403) throw new Error("tracking51_unauthorized");
  return list51(r.body).find(x => String(x.tracking_number || "").toUpperCase() === number.toUpperCase()) || null;
}
async function via51(number, company) {
  if (!process.env.TRACKING51_API_KEY) return null;
  let courier = courier51(company), item = await get51(number, courier);
  if (!item) {
    if (!courier) {
      const d = await httpJson(`${API51}/couriers/detect`, { method: "POST", headers: h51(), body: JSON.stringify({ tracking_number: number }) });
      courier = list51(d.body)[0]?.courier_code || null;
    }
    if (!courier) return null;
    // registers the number with 51Tracking (a tracking subscription, not a carrier order)
    await httpJson(`${API51}/trackings/create`, { method: "POST", headers: h51(), body: JSON.stringify({ tracking_number: number, courier_code: courier }) });
    item = await get51(number, courier);
  }
  if (!item) return null;
  const infos = [...(item.origin_info?.trackinfo || []), ...(item.destination_info?.trackinfo || []), ...(item.trackinfo || [])];
  const events = sortEvents(infos.map(e => ({ time: e.checkpoint_date || e.Date, location: e.location || e.Details || "", text: e.tracking_detail || e.StatusDescription || "" })));
  const status = STATUS51[String(item.delivery_status || "").toLowerCase()] || (events.length ? "in_transit" : "not_found");
  if (!events.length && status === "not_found") return { source: "51tracking", status, events, courier, pending: true };
  return { source: "51tracking", status, events, courier };
}

/**
 * Track one parcel. { number, company, url } come from the verified order (Shopify fulfillment / our shipment).
 * Returns { number, carrier, source: "yunexpress"|"fourpx"|"51tracking"|"link", status, status_text, last_event, events[], url, cached }.
 */
export async function trackParcel({ number, company = "", url = "", lang = "en", tenantId = process.env.DEFAULT_TENANT_ID || "tenant_demo" } = {}) {
  const n = String(number || "").trim().slice(0, 60);
  if (!n) return null;
  const key = `${n.toUpperCase()}|${String(company).toLowerCase()}`, hit = cache.get(key);
  let r = hit && Date.now() - hit.at < ttl() ? { ...hit.r, cached: true } : null;
  if (!r) {
    const ours = detectCarrier(company, n), errors = [];
    if (ours) { try { r = await viaCarrier(ours, n, tenantId); } catch (e) { errors.push(`${ours}:${String(e.message).slice(0, 80)}`); } }
    if (!r || r.pending) { try { const t = await via51(n, company); if (t && (!r || t.events.length)) r = t; } catch (e) { errors.push(`51tracking:${String(e.message).slice(0, 80)}`); } }
    if (!r) r = { source: "link", status: "unknown", events: [] };
    if (errors.length) r.errors = errors;
    r.cached = false;
    cache.set(key, { at: Date.now(), r });
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
  }
  const ours = detectCarrier(company, n);
  const link = url || (ours ? CARRIERS[ours].track_url(n) : "");
  return { number: n, carrier: company || (ours ? CARRIERS[ours].name : ""), source: r.source, status: r.status, status_text: statusText(r.status, lang),
    last_event: r.events[0] || null, events: r.events, url: link, cached: !!r.cached };
}
