// Shopify persistence (shopify_shops, oauth_states, product_links, order_links, webhook_log) on the DB adapter.
import { getDb, select, update, remove } from "../db/index.js";
import { encrypt, decrypt } from "../utils/crypto.js";

const now = () => new Date().toISOString();

export async function saveOAuthState({ nonce, shop, tenantId, ttlMs = 10 * 60_000 }) {
  const db = await getDb();
  await db.insertIgnore("oauth_states", { nonce, shop, tenant_id: tenantId || null, expires_at: Date.now() + ttlMs });
}
/** Single use: the row is deleted whether or not it is still valid. */
export async function consumeOAuthState(nonce) {
  const db = await getDb();
  const [row] = await select(db, "oauth_states", { nonce: String(nonce || "") });
  if (!row) return null;
  await remove(db, "oauth_states", { nonce: row.nonce });
  return Number(row.expires_at) < Date.now() ? null : row;
}
export async function pruneOAuthStates() {
  const db = await getDb();
  if (db.kind === "memory") { for (const r of await select(db, "oauth_states")) if (Number(r.expires_at) < Date.now()) await remove(db, "oauth_states", { nonce: r.nonce }); return; }
  await db.run("DELETE FROM oauth_states WHERE expires_at < ?", [Date.now()]);
}

export async function saveShop({ shop, tenantId, accessToken, scopes }) {
  const db = await getDb(), t = now();
  await db.upsert("shopify_shops", { shop, tenant_id: tenantId || null, access_token_enc: encrypt(accessToken), scopes: scopes || "", installed_at: t, uninstalled_at: null, updated_at: t }, ["shop"]);
}
export async function getShop(shop) { const db = await getDb(); return (await select(db, "shopify_shops", { shop }))[0] || null; }
export async function listShops() {
  const db = await getDb();
  return (await select(db, "shopify_shops", {}, { order: ["installed_at", "DESC"] })).map(({ access_token_enc, ...r }) => ({ ...r, has_token: !!access_token_enc, status: r.uninstalled_at || !access_token_enc ? "uninstalled" : "connected" }));
}
export async function shopToken(shop) {
  const row = await getShop(shop);
  if (!row?.access_token_enc || row.uninstalled_at) return null;
  return decrypt(row.access_token_enc);
}
export async function markUninstalled(shop) { const db = await getDb(); return update(db, "shopify_shops", { shop }, { access_token_enc: null, uninstalled_at: now(), updated_at: now() }); }
export async function deleteShopData(shop) {
  const db = await getDb();
  for (const t of ["product_links", "order_links", "shopify_shops"]) await remove(db, t, { shop });
}

export async function getProductLink(shop, localProductId) { const db = await getDb(); const r = (await select(db, "product_links", { shop, local_product_id: localProductId }))[0]; return r ? { ...r, variant_ids: JSON.parse(r.variant_ids || "{}") } : null; }
export async function saveProductLink({ shop, localProductId, shopifyProductId, variantIds }) {
  const db = await getDb();
  await db.upsert("product_links", { shop, local_product_id: localProductId, shopify_product_id: shopifyProductId, variant_ids: JSON.stringify(variantIds || {}), pushed_at: now() }, ["shop", "local_product_id"]);
}
export async function listProductLinks() { const db = await getDb(); return (await select(db, "product_links")).map(r => ({ ...r, variant_ids: JSON.parse(r.variant_ids || "{}") })); }

/** Returns true when this Shopify order was not linked yet (claims it atomically via the primary key). */
export async function claimOrderLink({ shop, shopifyOrderId, localOrderId }) {
  const db = await getDb();
  const r = await db.insertIgnore("order_links", { shop, shopify_order_id: String(shopifyOrderId), local_order_id: localOrderId, status: "created", fulfillment_id: null, created_at: now(), updated_at: now() });
  return r.changes > 0;
}
export async function orderLinkByLocal(localOrderId) { const db = await getDb(); return (await select(db, "order_links", { local_order_id: localOrderId }))[0] || null; }
export async function orderLinksForShop(shop) { const db = await getDb(); return select(db, "order_links", { shop }); }
export async function updateOrderLink(shop, shopifyOrderId, patch) { const db = await getDb(); return update(db, "order_links", { shop, shopify_order_id: String(shopifyOrderId) }, { ...patch, updated_at: now() }); }

/** Dedupe on X-Shopify-Webhook-Id. Returns true if this delivery is new. */
export async function logWebhook({ id, topic, shop, status = "received", note = "" }) {
  const db = await getDb();
  return (await db.insertIgnore("webhook_log", { id, topic, shop, received_at: now(), status, note: String(note).slice(0, 1000) })).changes > 0;
}
export async function setWebhookStatus(id, status, note = "") { const db = await getDb(); return update(db, "webhook_log", { id }, { status, note: String(note).slice(0, 1000) }); }
export async function recentWebhooks(limit = 50) { const db = await getDb(); return select(db, "webhook_log", {}, { order: ["received_at", "DESC"], limit }); }
