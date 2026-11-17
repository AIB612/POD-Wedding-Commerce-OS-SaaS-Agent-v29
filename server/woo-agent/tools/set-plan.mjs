#!/usr/bin/env node
// Staff tool (server only): set the plan of a WooCommerce site until online payment exists.
//   node server/woo-agent/tools/set-plan.mjs ws_0123456789abcdef growth
import "dotenv/config";
const [id, plan] = process.argv.slice(2);
const { PLANS } = await import("../../shopify-agent/billing.js");
await import("../../shopify-agent/security/records.js");
const core = await import("../core.js");
if (!core.validSiteId(id) || !PLANS[plan]) { console.error("usage: set-plan.mjs <ws_…> <free|growth|pro>"); process.exit(2); }
const s = await core.getSite(id); if (!s) { console.error("unknown site"); process.exit(1); }
await core.updateSite(id, { plan });
const { flushStore } = await import("../../saas-store.js"); await flushStore?.();
console.log(`${id} (${s.url}) → ${plan}`);
