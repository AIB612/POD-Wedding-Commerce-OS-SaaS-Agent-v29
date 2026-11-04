// Pod.AI merchant dashboard: KPIs that matter to a shop (conversations, AI resolution, hours saved, WISMO self-serve,
// chat-influenced clicks/orders, first response time) + actionable lists. Pod.AI-only; reads podai_* collections and,
// for attributed orders, the shop's own orders (UTM utm_source=podai on the customer's visit) via Admin GraphQL.
import crypto from "node:crypto";
import { addRecord, listForTenant } from "../saas-store.js";
import { listConversations, listHandoffs, getSettings } from "./engine/store.js";
import { graphql } from "./core.js";

const DAY = 864e5, MIN_PER_CHAT = Number(process.env.PODAI_MIN_SAVED_PER_CHAT || 4);
const pct = (a, b) => b ? Math.round((a / b) * 1000) / 10 : null;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const EVENT_TYPES = new Set(["product_click", "add_to_cart", "chat_open", "embed_ping"]);

/** Storefront events (product card click, add to cart via card, chat opened). No personal data stored. */
export async function recordEvent(tenantId, b = {}) {
  const type = String(b.type || "");
  if (!EVENT_TYPES.has(type)) return { ok: false, error: "bad_event" };
  await addRecord("podai_events", { id: "ev_" + crypto.randomBytes(8).toString("hex"), tenant_id: tenantId, type,
    product_id: String(b.product_id || "").slice(0, 80) || null, conversation_id: String(b.conversation_id || "").slice(0, 60) || null, at: new Date().toISOString() });
  return { ok: true };
}

function periodStats(convs, handoffs, events, from, to) {
  const inR = t => { const x = Date.parse(t); return x >= from && x < to; };
  const C = convs.filter(c => inR(c.created_at)), H = handoffs.filter(h => inR(h.created_at)), E = events.filter(e => inR(e.at));
  const handed = C.filter(c => c.handoff_id).length, resolved = C.length - handed;
  const firstResp = [];
  const wismo = C.filter(c => (c.tools || {}).find_order || (c.intents || {}).order_status || (c.intents || {}).tracking);
  for (const c of C) { const m = c.messages || [], u = m.findIndex(x => x.role === "user"), a = m.findIndex((x, i) => i > u && x.role === "assistant");
    if (u >= 0 && a > 0) { const d = Date.parse(m[a].at) - Date.parse(m[u].at); if (d >= 0 && d < 6e5) firstResp.push(d / 1000); } }
  const shown = C.filter(c => (c.tools || {}).search_products).length;
  const clicks = E.filter(e => e.type === "product_click").length, carts = E.filter(e => e.type === "add_to_cart").length;
  return { conversations: C.length, resolved, handed, resolution_rate: pct(resolved, C.length), hours_saved: Math.round(resolved * MIN_PER_CHAT / 6) / 10,
    wismo: wismo.length, wismo_self: wismo.filter(c => !c.handoff_id).length, product_clicks: clicks, add_to_cart: carts, product_views: shown,
    ctr: pct(clicks, shown), first_response_s: firstResp.length ? Math.round(median(firstResp) * 10) / 10 : null, convs: C, handoffs: H };
}

function series(convs, events, from, days, pick) {
  const out = Array(days).fill(0);
  for (const c of convs) { const i = Math.floor((Date.parse(c.created_at) - from) / DAY); if (i >= 0 && i < days) out[i] += pick(c); }
  return out;
}

// attributed orders: orders whose customer visit carried utm_source=podai (product links from the chat). Cached 10 min.
const attrCache = new Map();
async function attributedOrders(shop, from) {
  const k = `${shop}|${Math.floor(from / 6e5)}`, hit = attrCache.get(k);
  if (hit) return hit;
  let r;
  try {
    const d = await graphql(shop, `query($q:String){ orders(first:100, query:$q, sortKey:CREATED_AT, reverse:true) { nodes { totalPriceSet { shopMoney { amount currencyCode } }
      customerJourneySummary { firstVisit { utmParameters { source } } lastVisit { utmParameters { source } } } } } }`, { q: `created_at:>=${new Date(from).toISOString()}` });
    const hits = (d.orders?.nodes || []).filter(o => [o.customerJourneySummary?.firstVisit, o.customerJourneySummary?.lastVisit].some(v => /podai/i.test(v?.utmParameters?.source || "")));
    r = { available: true, orders: hits.length, revenue: Math.round(hits.reduce((s, o) => s + Number(o.totalPriceSet.shopMoney.amount), 0) * 100) / 100, currency: hits[0]?.totalPriceSet.shopMoney.currencyCode || null };
  } catch (e) { r = { available: false, reason: /access|protected|denied/i.test(e.message) ? "protected_customer_data" : "error" }; }
  attrCache.set(k, r); if (attrCache.size > 500) attrCache.delete(attrCache.keys().next().value);
  return r;
}

export async function dashboard(tenantId, shop, { days = 30 } = {}) {
  days = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const now = Date.now(), from = now - days * DAY, prevFrom = from - days * DAY;
  const convs = await listConversations(tenantId, { limit: 100000 }), handoffs = await listHandoffs(tenantId), events = await listForTenant("podai_events", tenantId);
  const cur = periodStats(convs, handoffs, events, from, now), prev = periodStats(convs, handoffs, events, prevFrom, from);
  const sp = pick => series(cur.convs, events, from, days, pick);
  const trend = (a, b) => (a == null || b == null || !b) ? null : Math.round(((a - b) / b) * 1000) / 10;
  const attr = shop ? await attributedOrders(shop, from) : { available: false };
  const primary = [
    { id: "conversations", value: cur.conversations, prev: prev.conversations, trend: trend(cur.conversations, prev.conversations), spark: sp(() => 1) },
    { id: "resolution_rate", unit: "%", value: cur.resolution_rate, prev: prev.resolution_rate, trend: trend(cur.resolution_rate, prev.resolution_rate), spark: sp(c => c.handoff_id ? 0 : 1) },
    { id: "hours_saved", unit: "h", value: cur.hours_saved, prev: prev.hours_saved, trend: trend(cur.hours_saved, prev.hours_saved), note: { resolved: cur.resolved, min_per_chat: MIN_PER_CHAT }, spark: sp(c => c.handoff_id ? 0 : MIN_PER_CHAT / 60) },
    { id: "wismo", value: cur.wismo_self, prev: prev.wismo_self, trend: trend(cur.wismo_self, prev.wismo_self), note: { total: cur.wismo, rate: pct(cur.wismo_self, cur.wismo) }, spark: sp(c => ((c.tools || {}).find_order || (c.intents || {}).order_status) && !c.handoff_id ? 1 : 0) },
    attr.available && attr.orders
      ? { id: "influenced_revenue", value: attr.revenue, currency: attr.currency, note: { orders: attr.orders, clicks: cur.product_clicks, method: "utm" }, trend: null, spark: [] }
      : { id: "product_clicks", value: cur.product_clicks, prev: prev.product_clicks, trend: trend(cur.product_clicks, prev.product_clicks), note: { ctr: cur.ctr, add_to_cart: cur.add_to_cart, attribution: attr.available ? "no_orders_yet" : (attr.reason || "unavailable") }, spark: [] },
    { id: "first_response", unit: "s", value: cur.first_response_s, prev: prev.first_response_s, trend: trend(cur.first_response_s, prev.first_response_s), lower_is_better: true, spark: [] }
  ];
  const intents = {}, langs = {}, heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  let local = 0, llm = 0;
  const unanswered = [];
  for (const c of cur.convs) {
    for (const [k, v] of Object.entries(c.intents || {})) if (!["greeting", "smalltalk", "injection", "payment_data"].includes(k)) intents[k] = (intents[k] || 0) + v;
    langs[c.language || "en"] = (langs[c.language || "en"] || 0) + 1;
    const d = new Date(c.created_at); heat[(d.getUTCDay() + 6) % 7][d.getUTCHours()]++;
    (c.messages || []).forEach((m, i, a) => { if (m.role !== "assistant") return; m.answered_by === "llm" ? llm++ : local++;
      if (m.unanswered && a[i - 1]?.role === "user") unanswered.push({ text: a[i - 1].text, at: a[i - 1].at, conversation_id: c.id }); });
  }
  // drop questions that were answered later (e.g. after a policy / product fallback was added), dedupe by text
  const norm = x => String(x || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const answeredQs = new Set();
  for (const c of convs) (c.messages || []).forEach((m, i, a) => { if (m.role === "assistant" && !m.unanswered && a[i - 1]?.role === "user" && Date.parse(m.at) > Date.parse(a[i - 1].at || 0) - 1) answeredQs.add(norm(a[i - 1].text)); });
  const seenQ = new Set();
  const unansweredOpen = unanswered.filter(u => { const k = norm(u.text); if (!k || answeredQs.has(k) || seenQ.has(k)) return false; seenQ.add(k); return true; });
  const open = handoffs.filter(h => h.status !== "resolved"), done = cur.handoffs.filter(h => h.resolved_at);
  const s = await getSettings(tenantId);
  return { days, generated_at: new Date().toISOString(), empty: cur.conversations === 0, primary,
    intents: Object.entries(intents).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => ({ id, n })),
    unanswered: unansweredOpen.slice(-20).reverse(),
    sla: { open: open.length, oldest_wait_h: open.length ? Math.round((now - Math.min(...open.map(h => Date.parse(h.created_at)))) / 36e5 * 10) / 10 : null,
      avg_resolve_h: done.length ? Math.round(done.reduce((t, h) => t + (Date.parse(h.resolved_at) - Date.parse(h.created_at)), 0) / done.length / 36e5 * 10) / 10 : null, target_h: s.human_reply_hours },
    heatmap: heat, languages: langs, answer_paths: { local, llm } };
}
