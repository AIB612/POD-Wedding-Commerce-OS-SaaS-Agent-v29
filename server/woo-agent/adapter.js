// WooCommerce adapter for the commerce-agent core (server/commerce-agent). Data sources:
//   facts / policies / shipping zones / visible coupon  ← pushed by the plugin (POST /woo-agent/v1/store), kept on the site row
//   products                                            ← catalogue pushed by the plugin (catalog.js), searched locally
//   orders, coupon checks                               ← signed callback to the site (/pod-ai/v1/lookup); nothing stored here
// No external API is called to answer: everything is local except the merchant's own site for order data.
import crypto from "node:crypto";
import { callSite, tenantFor } from "./core.js";
import { searchCatalog } from "./catalog.js";
import { logAccess } from "../shopify-agent/security/access-log.js";

const fails = new Map(); // order lookup: same answer for "no order" / "wrong e-mail", 5 failures → 15 min lock per order
export const resetWooLocks = () => fails.clear();
const lockKey = (site, n) => `${site}|${String(n).replace(/^#/, "").toUpperCase()}`;

export function wooFacts(site) {
  const s = site.store || {};
  return { shop_name: s.name || site.name, email: s.email || null, currency: s.currency || site.currency || null, taxes_included: !!s.taxes_included, url: s.url || site.url,
    policies: (s.policies || []).filter(p => p && p.text) };
}

/** Shipping zones synced from WooCommerce → the engine's rate shape. */
export function wooShipping(site, country) {
  const cc = String(country || "").toUpperCase(), zones = site.store?.shipping || [];
  if (!zones.length) return { ok: true, country: cc, ships: null, rates: [] };
  const zone = zones.find(z => (z.countries || []).includes(cc)) || zones.find(z => z.rest_of_world);
  if (!zone) return { ok: true, country: cc, ships: false, rates: [] };
  const rates = (zone.methods || []).map(m => ({ name: m.name, price: Number.isFinite(m.cost) ? m.cost : null, currency: m.currency || site.store?.currency || null, calculated: !Number.isFinite(m.cost),
    conditions: Number.isFinite(m.min_amount) && m.min_amount > 0 ? [`order ≥ ${m.min_amount} ${m.currency || site.store?.currency || ""}`.trim()] : [] }));
  if (!rates.length) return { ok: true, country: cc, ships: false, rates: [] };
  return { ok: true, country: cc, zone: zone.name || "", ships: true, rates };
}

export async function wooFindOrder(site, { order_number, email }) {
  const n = String(order_number || "").replace(/^#/, "").trim();
  if (!/^[A-Z0-9-]{1,30}$/i.test(n) || !email) return { ok: false, error: "need_order_and_email" };
  const k = lockKey(site.id, n), f = fails.get(k);
  if (f && f.count >= 5 && Date.now() - f.at < 15 * 60_000) return { ok: false, error: "locked" };
  const r = await callSite(site, "pod-ai/v1/lookup", { type: "order", order_number: n, email: String(email).trim().slice(0, 254) });
  if (!r || (r.ok !== true && r.error !== "not_found")) return { ok: false, error: "order_lookup_failed" };
  logAccess({ actor: "storefront_shopper", action: r.ok ? "order_lookup" : "order_lookup_miss", shop: site.url.replace(/^https?:\/\//, ""), tenant: tenantFor(site.id), order: n, via: "woo_chat" }).catch?.(() => {});
  if (!r.ok || !r.order) { fails.set(k, { count: (f && Date.now() - f.at < 15 * 60_000 ? f.count : 0) + 1, at: Date.now() }); return { ok: false, error: "not_found" }; }
  fails.delete(k);
  const o = r.order, s = v => String(v ?? "").slice(0, 200);
  return { ok: true, order: { name: s(o.name || `#${n}`), created_at: s(o.created_at), cancelled: !!o.cancelled, payment: s(o.payment).toUpperCase(), fulfillment: s(o.fulfillment).toUpperCase(),
    total: s(o.total), currency: s(o.currency), items: (o.items || []).slice(0, 10).map(i => ({ title: s(i.title), quantity: Number(i.quantity) || 1 })),
    tracking: (o.tracking || []).slice(0, 3).map(t => ({ company: s(t.company), number: s(t.number), url: /^https?:\/\//.test(t.url || "") ? s(t.url) : "" })).filter(t => t.number) } };
}

export async function wooCheckDiscount(site, code) {
  const c = String(code || "").trim().toUpperCase().slice(0, 40);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(c)) return { ok: false, error: "invalid_code_format" };
  const r = await callSite(site, "pod-ai/v1/lookup", { type: "coupon", code: c });
  if (!r || r.ok !== true) return { ok: false, error: "discount_check_failed" };
  return { ok: true, code: c, valid: !!r.valid, summary: String(r.summary || "").slice(0, 160), ends_at: r.ends_at || null };
}

/** Adapter for one verified site row (read fresh per request). */
export function wooData(site) {
  return {
    platform: "WooCommerce",
    facts: async () => wooFacts(site),
    searchProducts: async (q, o) => searchCatalog(site.id, q, o),
    findOrder: a => wooFindOrder(site, a),
    shippingRates: async c => wooShipping(site, c),
    checkDiscount: c => wooCheckDiscount(site, c),
    promo: async () => site.store?.promo?.code ? { code: site.store.promo.code, summary: site.store.promo.summary || "" } : null,
    liveTracking: process.env.WOO_LIVE_TRACKING === "true", // default: tracking link only, no external API
    adminUrl: `${site.url}/wp-admin/admin.php?page=pod-ai-chat-tickets`
  };
}
export const conversationKey = () => crypto.randomBytes(10).toString("hex");
