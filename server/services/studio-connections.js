// Studio store connections (merchant → Shopify / WooCommerce).
// Safe default: a connection is only *requested* (admin task) because the studio has no merchant login yet.
// With STUDIO_PUBLIC_CONNECT=true (or an admin request) the official flows are used:
//   Shopify → OAuth (existing app credentials), WooCommerce → /wc-auth/v1/authorize (keys posted to our callback).
import crypto from "node:crypto";
import { addRecord, findRecord, findWhere, updateRecord } from "../saas-store.js";
import { buildOAuthStart } from "../connectors/shopify-multistore.js";
import * as shopify from "../shopify/app.js";
import { encrypt } from "../utils/crypto.js";
import { createTask } from "./task-service.js";
import { HttpError } from "../http/middleware.js";

const WC_TTL_MS = 30 * 60_000;
const isId = id => /^sc_[a-f0-9]{16}$/.test(String(id || ""));
export const publicView = c => c && ({ id: c.id, platform: c.platform, store: c.store, status: c.status, created_at: c.created_at, connected_at: c.connected_at || null });

function normalise(platform, raw) {
  const v = String(raw || "").trim().toLowerCase().replace(/\/+$/, "");
  if (platform === "shopify") {
    const rawShop = v.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const shop = /^[a-z0-9][a-z0-9-]*$/.test(rawShop) ? `${rawShop}.myshopify.com` : rawShop;
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new HttpError(400, "invalid_shop_domain", "请输入 your-store.myshopify.com 格式的店铺域名");
    return shop;
  }
  if (platform === "woocommerce") {
    let u; try { u = new URL(/^https?:\/\//.test(v) ? v : `https://${v}`); } catch { throw new HttpError(400, "invalid_site_url", "请输入有效的网店地址"); }
    if (u.protocol !== "https:") throw new HttpError(400, "https_required", "WooCommerce 授权需要 https 网店地址");
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname)) throw new HttpError(400, "invalid_site_url", "请输入公开可访问的网店地址");
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  }
  throw new HttpError(400, "invalid_platform", "Unsupported platform");
}

export async function requestConnection({ tenantId, platform, store, baseUrl, allowOAuth }) {
  const clean = normalise(platform, store);
  const conn = await addRecord("studio_connections", { id: `sc_${crypto.randomBytes(8).toString("hex")}`, tenant_id: tenantId, platform, store: clean, status: "requested", created_at: new Date().toISOString() });
  if (allowOAuth && platform === "shopify" && process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_REDIRECT_URI) {
    const { url } = buildOAuthStart({ shop: clean, tenantId, returnTo: "studio", connectionId: conn.id });
    await updateRecord("studio_connections", conn.id, { status: "pending_authorization" });
    return { connection: publicView({ ...conn, status: "pending_authorization" }), authorize_url: url };
  }
  if (allowOAuth && platform === "shopify" && shopify.isConfigured()) {
    await updateRecord("studio_connections", conn.id, { status: "pending_authorization" });
    const authorize_url = `/api/shopify/app/login?shop=${encodeURIComponent(clean)}&return_to=${encodeURIComponent(`/studio.html?connected=${conn.id}`)}&conn_id=${encodeURIComponent(conn.id)}`;
    return { connection: publicView({ ...conn, status: "pending_authorization" }), authorize_url };
  }
  if (allowOAuth && platform === "woocommerce" && /^https:/.test(baseUrl)) {
    const q = new URLSearchParams({ app_name: "Wedding Commerce OS", scope: "read_write", user_id: conn.id,
      return_url: `${baseUrl}/studio.html?connected=${conn.id}`, callback_url: `${baseUrl}/api/studio/connections/woocommerce/callback` });
    await updateRecord("studio_connections", conn.id, { status: "pending_authorization" });
    return { connection: publicView({ ...conn, status: "pending_authorization" }), authorize_url: `${clean}/wc-auth/v1/authorize?${q}` };
  }
  // Default: staged for an admin (no secrets collected here).
  await createTask(tenantId, { type: "store_connection_request", title: `Connect ${platform === "shopify" ? "Shopify" : "WooCommerce"} store ${clean}`, risk: "medium", payload: { connection_id: conn.id, platform, store: clean } });
  return { connection: publicView(conn) };
}

export async function getConnection(id) {
  if (!isId(id)) throw new HttpError(404, "connection_not_found", "Not found");
  const c = await findRecord("studio_connections", id);
  if (!c) throw new HttpError(404, "connection_not_found", "Not found");
  return publicView(c);
}

export async function markConnected(id, storeId) {
  if (isId(id)) await updateRecord("studio_connections", id, { status: "connected", store_id: storeId, connected_at: new Date().toISOString() });
}

/** WooCommerce posts the generated REST keys here (server-to-server). Keys are stored encrypted, never returned. */
export async function wooCallback(body = {}) {
  const c = isId(body.user_id) ? await findRecord("studio_connections", body.user_id) : null;
  if (!c || c.platform !== "woocommerce" || c.status !== "pending_authorization" || Date.now() - Date.parse(c.created_at) > WC_TTL_MS) throw new HttpError(400, "unknown_or_expired_request", "Unknown or expired authorization");
  if (!/^ck_[a-f0-9]{20,64}$/i.test(body.consumer_key || "") || !/^cs_[a-f0-9]{20,64}$/i.test(body.consumer_secret || "")) throw new HttpError(400, "invalid_keys", "Invalid keys");
  const existing = await findWhere("stores", s => s.provider === "woocommerce" && s.domain === c.store && s.tenant_id === c.tenant_id);
  const token_encrypted = encrypt(JSON.stringify({ consumer_key: body.consumer_key, consumer_secret: body.consumer_secret }));
  const store = existing ? await updateRecord("stores", existing.id, { status: "connected", token_encrypted, scopes: body.key_permissions || "read_write" })
    : await addRecord("stores", { id: `store_${crypto.randomBytes(5).toString("hex")}`, tenant_id: c.tenant_id, provider: "woocommerce", name: new URL(c.store).hostname, domain: c.store, status: "connected", token_encrypted, scopes: body.key_permissions || "read_write" });
  await markConnected(c.id, store.id);
  return { ok: true };
}
