// Pod.AI diagnosis for one shop (run on the server from ~/pod-wedding): node server/shopify-agent/tools/diag.mjs <shop>.myshopify.com
// Prints only presence flags, scopes, policy types, product count and API errors — never tokens or secrets.
import fs from "node:fs";
for (const l of fs.readFileSync(".env", "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const core = await import(new URL("../core.js", import.meta.url));
const shop = core.normalizeShop(process.argv[2] || "dropkingdev.myshopify.com");
const row = await core.getShop(shop);
const out = { shop, app_configured: core.isConfigured(), token_stored: !!row?.access_token_enc, uninstalled_at: row?.uninstalled_at || null, stored_scopes: row?.scopes || "" };
const q = async (query, v) => { try { return { ok: true, data: await core.graphql(shop, query, v) }; } catch (e) { return { ok: false, error: String(e.message).slice(0, 300) }; } };
const sc = await q("{ currentAppInstallation { accessScopes { handle } } }");
out.granted_scopes = sc.ok ? sc.data.currentAppInstallation.accessScopes.map(s => s.handle) : sc.error;
const pol = await q("{ shop { name currencyCode taxesIncluded shopPolicies { type body } } }");
out.policies = pol.ok ? pol.data.shop.shopPolicies.map(p => ({ type: p.type, chars: String(p.body || "").length })) : pol.error;
const pr = await q(`{ products(first: 5, query: "status:active") { nodes { title } } }`);
out.active_products = pr.ok ? pr.data.products.nodes.map(p => p.title) : pr.error;
const ship = await q("{ deliveryProfiles(first: 3) { nodes { name } } }");
out.delivery_profiles = ship.ok ? ship.data.deliveryProfiles.nodes.map(p => p.name) : ship.error;
const { getState } = await import(new URL("../../saas-store.js", import.meta.url));
const s = await getState();
out.podai_rows = Object.fromEntries(Object.keys(s).filter(k => k.startsWith("podai_")).map(k => [k, s[k].filter(r => !r.tenant_id || r.tenant_id === core.tenantFor(shop)).length]));
console.log(JSON.stringify(out, null, 1));
process.exit(0);
