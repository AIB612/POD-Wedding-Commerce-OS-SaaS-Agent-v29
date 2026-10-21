// PayPal Orders v2 — server-side only. Access tokens are cached until shortly before expiry.
const TIMEOUT_MS = 15_000;
const tokenCache = new Map(); // client_id + env → {value, expiresAt}

function env() { return (process.env.PAYPAL_ENV || "sandbox") === "live" ? "live" : "sandbox"; }
function base() { return env() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"; }
/** Credentials: tenant values from Admin → API (connector center) win; .env is the fallback. */
function resolve(creds = {}) {
  return { id: creds.client_id || process.env.PAYPAL_CLIENT_ID, secret: creds.client_secret || process.env.PAYPAL_CLIENT_SECRET, webhookId: creds.webhook_id || process.env.PAYPAL_WEBHOOK_ID };
}
export function paypalConfigured(creds) { const c = resolve(creds); return creds?.enabled !== false && !!(c.id && c.secret); }

async function accessToken(creds) {
  const { id, secret } = resolve(creds);
  if (!id || !secret) throw new Error("paypal_not_configured");
  const key = `${env()}:${id}`, cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const r = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!r.ok) throw new Error(`paypal_auth_${r.status}`);
  const data = await r.json();
  tokenCache.set(key, { value: data.access_token, expiresAt: Date.now() + Math.max(60, (data.expires_in || 300) - 60) * 1000 });
  return data.access_token;
}

async function pp(path, options = {}, creds) {
  const token = await accessToken(creds);
  const r = await fetch(base() + path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (r.status === 401) tokenCache.delete(`${env()}:${resolve(creds).id}`);
  if (!r.ok) throw new Error(`paypal_${r.status}:${await r.text()}`);
  return r.status === 204 ? {} : r.json();
}

const money = (currency, v) => ({ currency_code: currency, value: Number(v || 0).toFixed(2) });

/**
 * Orders v2 create. When `breakdown` + `items` are given, PayPal shows line items and validates
 * item_total = Σ unit_amount × quantity and value = item_total + shipping + tax_total.
 * `shipping` (name/address) pre-fills the buyer's address (SET_PROVIDED_ADDRESS).
 */
export async function createPayPalOrder({ amount, currency = "USD", referenceId, returnUrl, cancelUrl, description, items, breakdown, shipping, creds }) {
  const unit = { reference_id: referenceId, ...(description ? { description: String(description).slice(0, 127) } : {}), amount: money(currency, amount) };
  if (breakdown && Array.isArray(items) && items.length) {
    unit.amount.breakdown = { item_total: money(currency, breakdown.item_total), shipping: money(currency, breakdown.shipping), tax_total: money(currency, breakdown.tax_total) };
    unit.items = items.slice(0, 100).map(i => ({
      name: String(i.name || i.sku || "Item").slice(0, 127), ...(i.sku ? { sku: String(i.sku).slice(0, 127) } : {}),
      ...(i.description ? { description: String(i.description).slice(0, 127) } : {}),
      quantity: String(i.quantity), unit_amount: money(currency, i.unit_amount), category: "PHYSICAL_GOODS"
    }));
  }
  if (shipping?.address1 && shipping?.country) {
    unit.shipping = {
      ...(shipping.name ? { name: { full_name: String(shipping.name).slice(0, 300) } } : {}),
      address: { address_line_1: shipping.address1, ...(shipping.address2 ? { address_line_2: shipping.address2 } : {}), admin_area_2: shipping.city || "", postal_code: shipping.postal_code || "", country_code: shipping.country }
    };
  }
  return pp("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": `create-${referenceId}` },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [unit],
      payment_source: { paypal: { experience_context: {
        return_url: returnUrl || process.env.PAYPAL_RETURN_URL,
        cancel_url: cancelUrl || process.env.PAYPAL_CANCEL_URL,
        user_action: "PAY_NOW",
        shipping_preference: unit.shipping ? "SET_PROVIDED_ADDRESS" : "GET_FROM_FILE"
      } } }
    })
  }, creds);
}

export function approvalUrl(paypalOrder) {
  return (paypalOrder?.links || []).find(l => l.rel === "payer-action" || l.rel === "approve")?.href || null;
}

export async function capturePayPalOrder(id, creds) {
  return pp(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, { method: "POST", headers: { "PayPal-Request-Id": `capture-${id}` } }, creds);
}

export async function refundCapture(captureId, amount, currency = "USD", creds) {
  return pp(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    headers: { "PayPal-Request-Id": `refund-${captureId}-${Date.now()}` },
    body: amount ? JSON.stringify({ amount: { value: Number(amount).toFixed(2), currency_code: currency } }) : "{}"
  }, creds);
}

export async function verifyPayPalWebhook(headers, body, creds) {
  const { webhookId } = resolve(creds);
  if (!webhookId) return false;
  const payload = {
    auth_algo: headers["paypal-auth-algo"], cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"], transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"], webhook_id: webhookId, webhook_event: body
  };
  const result = await pp("/v1/notifications/verify-webhook-signature", { method: "POST", body: JSON.stringify(payload) }, creds);
  return result.verification_status === "SUCCESS";
}
