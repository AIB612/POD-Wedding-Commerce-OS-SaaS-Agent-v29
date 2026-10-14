import { listForTenant } from "../saas-store.js";

// Unpaid storefront checkouts (Draft / failed / cancelled payments) are not revenue.
const UNPAID = new Set(["pending", "failed", "cancelled", "refunded"]);
export const isRevenueOrder = o => !UNPAID.has(String(o.payment_status || "").toLowerCase());

export function landedCost(p) {
  return Number(p.supplier_cost || 0) + Number(p.inbound_shipping || 0) + Number(p.duty || 0) + Number(p.packaging || 0) + Number(process.env.DEFAULT_FULFILLMENT_OVERHEAD || 0);
}

export async function financeSummary(tenantId) {
  const orders = (await listForTenant("orders", tenantId)).filter(isRevenueOrder);
  const totals = orders.reduce((a, o) => {
    a.revenue += Number(o.revenue || 0);
    a.cogs += Number(o.cogs || 0);
    a.shipping += Number(o.shipping_cost || 0);
    a.payment_fees += Number(o.payment_fee || 0);
    a.affiliates += Number(o.affiliate_commission || 0);
    a.ads += Number(o.ad_attributed_cost || 0);
    return a;
  }, { revenue: 0, cogs: 0, shipping: 0, payment_fees: 0, affiliates: 0, ads: 0 });
  totals.contribution_margin = totals.revenue - totals.cogs - totals.shipping - totals.payment_fees - totals.affiliates - totals.ads;
  totals.margin_rate = totals.revenue ? totals.contribution_margin / totals.revenue : 0;
  return totals;
}
