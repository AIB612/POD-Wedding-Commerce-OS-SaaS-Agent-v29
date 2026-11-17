// Pod.AI commerce-agent core — platform-agnostic entry point. One engine (local RAG, NLU, recommendations + refinement,
// policies, order replies, guardrails, handoff → tickets, KPIs, optional LLM) and one adapter per commerce platform.
//   Shopify      server/shopify-agent/profile.js  shopifyData(shop)   (Admin GraphQL with the shop's offline token)
//   WooCommerce  server/woo-agent/adapter.js      wooData(site)       (catalogue pushed by the WP plugin + signed callbacks)
// A new platform (BigCommerce, Magento, Shopware …) = a new adapter with the contract below + its own channel routes
// (auth, store records, rate limits). The engine never talks to a platform directly.
//
// Adapter contract (all async unless noted; never throw — return { ok:false, error }):
//   platform                      "Shopify" | "WooCommerce" | …           (string, used in the LLM system prompt)
//   facts()                       { shop_name, email, currency, taxes_included, url, policies:[{ type, title, text, url }] }
//   searchProducts(q, { browse, limit })  { ok, products:[{ id, name, image, unit_price, currency, max_price, link, type, tags,
//                                          collections, variants:[{ id, title, price, available }], variant_id, cart?, details }] }
//   findOrder({ order_number, email })    { ok, order:{ name, created_at, cancelled, payment, fulfillment, total, currency, items, tracking } }
//   shippingRates(country)        { ok, country, zone, ships: true|false|null, rates:[{ name, price, currency, calculated, conditions }] }
//   checkDiscount(code)           { ok, code, valid, summary, ends_at }
//   liveTracking                  boolean — enrich tracking numbers via configured carrier APIs (false = link only, no external call)
//   adminUrl                      string — where the merchant manages tickets (used in the ticket e-mail)
// Agentic actions are returned as UI blocks the storefront widget executes in the shopper's own session (never payment):
//   { type: "products", items[].cart }  → add to cart (Shopify /cart/add, WooCommerce Store API)
//   { type: "checkout", url }           → prefilled cart / checkout link       { type: "coupon", code } → apply a visible coupon
import { makeProfile } from "../shopify-agent/profile.js";
export { handleChat } from "../shopify-agent/engine/agent.js";

const REQUIRED = ["facts", "searchProducts", "findOrder", "shippingRates", "checkDiscount"];
/** Validate an adapter (throws on a missing method — catches wiring mistakes at startup / in tests). */
export function assertAdapter(a) {
  for (const k of REQUIRED) if (typeof a?.[k] !== "function") throw new Error(`commerce adapter: missing ${k}()`);
  if (!a.platform) throw new Error("commerce adapter: missing platform");
  return a;
}
/** Chat profile for any platform: shared engine + the platform adapter. */
export const profileFor = (storeKey, adapter) => makeProfile(storeKey, assertAdapter(adapter));
