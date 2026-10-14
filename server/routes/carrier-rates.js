// Shopify CarrierService callback (public; authenticated by the per-store secret in the callback URL).
// Shopify waits only a few seconds, so live adapters get CARRIER_CALLBACK_BUDGET_MS and we fall back to
// regional rules rather than returning nothing.
import express from "express";
import crypto from "node:crypto";
import { ah, rateLimit } from "../http/middleware.js";
import { getState } from "../saas-store.js";
import { quoteShipping } from "../services/shipping-service.js";

const COUNTRY = { Switzerland: "CH", Germany: "DE", France: "FR", Italy: "IT", Austria: "AT", "United States": "US", Canada: "CA", "United Kingdom": "GB" };
const sameSecret = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); };

const router = express.Router();
router.post("/api/shopify/carrier-rates/:storeId", rateLimit({ bucket: "carrier", windowMs: 60_000, max: 600 }), ah(async (req, res) => {
  const store = ((await getState()).stores || []).find(x => x.id === req.params.storeId && x.provider === "shopify");
  if (!store?.carrier_callback_secret) return res.status(404).json({ rates: [] });
  if (!sameSecret(req.query.secret, store.carrier_callback_secret)) return res.status(401).json({ rates: [] });

  const rate = req.body?.rate || {}, dest = rate.destination || {};
  const raw = String(dest.country_code || dest.country || "");
  const country = raw.length === 2 ? raw.toUpperCase() : (COUNTRY[raw] || raw.toUpperCase());
  const items = Array.isArray(rate.items) ? rate.items : [];
  const args = {
    tenantId: store.tenant_id, country, postal_code: dest.postal_code || dest.zip || "",
    subtotal: items.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1) / 100, 0),
    weight_kg: items.reduce((s, i) => s + Number(i.grams || 0) * Number(i.quantity || 1) / 1000, 0),
    item_count: items.reduce((n, i) => n + Number(i.quantity || 1), 0),
    currency: String(rate.currency || "USD").toUpperCase()
  };
  const budget = Number(process.env.CARRIER_CALLBACK_BUDGET_MS || 4000);
  let quote;
  try {
    quote = await Promise.race([quoteShipping(args), new Promise((_, rej) => setTimeout(() => rej(new Error("budget")), budget).unref())]);
  } catch {
    try { quote = await quoteShipping({ ...args, live: false }); } catch { return res.json({ rates: [] }); }
  }
  // Regional rule amounts are in the zone's currency; never report them in a different shop currency.
  const liveEngine = quote.rate_engine !== "regional_rules";
  if (!liveEngine && quote.zone.currency !== args.currency) {
    console.warn(`[carrier-rates] ${store.id}: zone ${quote.zone.id} is ${quote.zone.currency}, shop asked ${args.currency} — no rates returned`);
    return res.json({ rates: [] });
  }
  res.json({ rates: quote.shipping_options.map(o => ({
    service_name: o.label, service_code: `wco_${o.id}`, total_price: String(Math.round(Number(o.amount || 0) * 100)),
    description: `Wedding Commerce OS · ${o.eta_days} days`, currency: args.currency
  })) });
}));
export default router;
