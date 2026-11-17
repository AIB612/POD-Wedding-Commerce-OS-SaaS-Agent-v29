// Pod.AI for WooCommerce — plans. Same tiers and limits as the Shopify app (server/shopify-agent/billing.js PLANS):
//   Free 50 chats / month · Growth 500 chats, USD 19 / month · Pro 2,500 chats, USD 49 / month + optional LLM.
// The plan is stored on the site row (podai_woo_sites.plan, default "free"). PAYMENT COLLECTION IS NOT IMPLEMENTED:
// WooCommerce has no app-store billing like Shopify Managed Pricing, so upgrades need an external checkout (options in
// payments()). Until one is chosen, a plan can only be changed by Pod.AI staff: node server/woo-agent/tools/set-plan.mjs.
import { PLANS, chatsUsed, recordChat, monthKey } from "../shopify-agent/billing.js";
import { tenantFor } from "./core.js";

export { PLANS };
export const planOf = site => PLANS[site?.plan] || PLANS.free;
export const payments = () => ({ enabled: false, currency: "USD", note: "Paid plans are not on sale yet.",
  options: ["paddle_or_lemonsqueezy_merchant_of_record", "stripe_checkout_and_billing_portal", "woocommerce_subscriptions_on_podai_site", "freemius_wordpress_licensing"] });

export async function chatGate(site) {
  const tenant = tenantFor(site.id), plan = planOf(site), used = await chatsUsed(tenant);
  return { plan: plan.handle, limit: plan.chats, used, canStart: used < plan.chats, llm: plan.llm, onStart: conv => recordChat(tenant, conv.id) };
}
export async function billingSummary(site) {
  const plan = planOf(site), used = await chatsUsed(tenantFor(site.id));
  return { plan: plan.handle, name: plan.name, price: plan.price, currency: "USD", limit: plan.chats, used, remaining: Math.max(0, plan.chats - used), llm: plan.llm, month: monthKey(),
    resets_at: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString(),
    plans: Object.values(PLANS).map(p => ({ handle: p.handle, name: p.name, price: p.price, chats: p.chats, llm: p.llm })), payments: payments() };
}
