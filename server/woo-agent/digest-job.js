// ┌─ 文件卡片 File card ─────────────────────────────────────────────────────────────────────────────────┐
// │ 这是什么 What: WooCommerce 站点的每周总结邮件任务（每小时检查，每站每周最多一次）。                         │
// │   Weekly summary job for connected WooCommerce sites (logic + wording: shopify-agent/merchant/digest.js).│
// │   Recipient fallback = the store e-mail pushed by the plugin, else the admin e-mail given at connect.  │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
import { getState, findRecord } from "../saas-store.js";
import { tenantFor, SITES } from "./core.js";
import * as billing from "./billing.js";
import { sendWeeklyDigest, weekKey, due, DIGESTS } from "../shopify-agent/merchant/digest.js";

export async function runWooDigests(now = Date.now()) {
  if (!due(now)) return { checked: 0 };
  const sites = (await getState())[SITES] || [];
  const out = { checked: sites.length, results: {} };
  for (const site of sites) {
    const tenantId = tenantFor(site.id);
    if (await findRecord(DIGESTS, `dg_${tenantId}_${weekKey(now)}`)) continue;
    const r = await sendWeeklyDigest({ tenantId, shopName: site.store?.name || site.name, adminUrl: `${String(site.url || "").replace(/\/+$/, "")}/wp-admin/admin.php?page=pod-ai-chat-assistant`,
      usage: () => billing.billingSummary(site) }, { to: site.store?.email || site.admin_email || null, now }).catch(e => ({ status: "failed", error: e.message }));
    out.results[site.id] = r.status;
  }
  return out;
}
