// ┌─ 文件卡片 File card ─────────────────────────────────────────────────────────────────────────────────┐
// │ 这是什么 What: Shopify 店铺的每周总结邮件任务（每小时检查一次，每店每周最多发一次）。                       │
// │   Weekly summary job for installed Shopify shops: runs hourly, sends at most once per shop per week  │
// │   (logic + wording in merchant/digest.js). Recipient fallback = the shop's contact e-mail.             │
// │ 要不要改 Edit?: 一般不用改。                                                                          │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
import { getState, findRecord } from "../saas-store.js";
import { tenantFor } from "./core.js";
import { makeProfile } from "./profile.js";
import * as billing from "./billing.js";
import { sendWeeklyDigest, weekKey, due, DIGESTS } from "./merchant/digest.js";

export async function runShopifyDigests(now = Date.now()) {
  if (!due(now)) return { checked: 0 };
  const shops = ((await getState()).podai_shops || []).filter(r => r.access_token_enc && !r.uninstalled_at).map(r => r.id);
  const out = { checked: shops.length, results: {} };
  for (const shop of shops) {
    const tenantId = tenantFor(shop);
    if (await findRecord(DIGESTS, `dg_${tenantId}_${weekKey(now)}`)) continue; // done this week — no Shopify call
    let to = null, name = shop.replace(/\.myshopify\.com$/, "");
    try { const f = await makeProfile(shop).facts(); to = f?.email || null; name = f?.shop_name || name; } catch { /* offline shop: Ticket e-mail still works */ }
    const handle = shop.replace(/\.myshopify\.com$/, "");
    const r = await sendWeeklyDigest({ tenantId, shopName: name, adminUrl: `https://admin.shopify.com/store/${handle}/apps/${billing.appHandle()}`, usage: () => billing.billingSummary(shop) }, { to, now })
      .catch(e => ({ status: "failed", error: e.message }));
    out.results[shop] = r.status;
  }
  return out;
}
