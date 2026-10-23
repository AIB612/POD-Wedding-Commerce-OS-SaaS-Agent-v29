// Storefront checkout: server quote → internal order → PayPal order → capture on return / webhook.
import crypto from "node:crypto";
import { addRecord, findRecord, findWhere, updateRecord } from "../saas-store.js";
import { quoteCart, round2 } from "./pricing-service.js";
import { createPayPalOrder, capturePayPalOrder, approvalUrl, paypalConfigured } from "../connectors/paypal.js";
import { createTwintPayment, twintConfigured } from "../connectors/twint.js";
import { createProofForOrder } from "./proof-service.js";
import { quoteShipping } from "./shipping-service.js";
import { getConnectorCredentials } from "./connector-config-service.js";
import { HttpError } from "../http/middleware.js";
import { ensureCustomer } from "./account-service.js";
import { sendEmail } from "./email-service.js";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);

/** Full storefront quote: merchandise (server price list) + shipping + tax for the destination. */
export async function quoteStorefront({ tenantId, cart, currency, country, postal_code, shipping_method }) {
  const q = quoteCart(cart, currency);
  const items = q.lines.reduce((a, l) => a + l.quantity, 0);
  try {
    const ship = await quoteShipping({
      tenantId, country: String(country || "").toUpperCase().slice(0, 2), postal_code: String(postal_code || "").slice(0, 16),
      subtotal: q.total, weight_kg: Math.max(0.2, items * 0.12), item_count: items, currency: q.currency,
      shipping_method: shipping_method === "express" ? "express" : "standard"
    });
    return { ...ship, items: q.lines, subtotal: q.total, item_count: items };
  } catch (e) {
    if (e.message === "shipping_zone_not_found") throw new HttpError(400, "shipping_zone_not_found", "该地区暂不支持配送");
    throw e;
  }
}

const paypalCreds = tenantId => getConnectorCredentials(tenantId, "paypal");

function newOrderId() {
  return `POD-${new Date().getUTCFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function createStorefrontCheckout({ tenantId, user = null, body = {}, baseUrl }) {
  const email = clean(body.customer?.email, 320);
  if (!EMAIL.test(email)) throw new HttpError(400, "invalid_email", "请填写有效的邮箱地址");
  const quote = await quoteStorefront({ tenantId, cart: body.cart, currency: body.currency, country: body.shipping?.country, postal_code: body.shipping?.postal_code, shipping_method: body.shipping_method });
  const method = String(body.method || "paypal").toLowerCase();
  const id = newOrderId();
  const now = new Date().toISOString();
  const feeRate = Number(process.env.DEFAULT_PAYMENT_FEE_RATE || 0);
  const order = await addRecord("orders", {
    id, tenant_id: tenantId, user_id: user?.id || null, store_id: "direct_storefront", channel: "storefront",
    external_order_id: "", status: "Draft", payment_status: "pending", payment_method: method,
    customer_email: email, customer_name: clean(body.customer?.name),
    shipping_address: {
      address1: clean(body.shipping?.address1), city: clean(body.shipping?.city, 100),
      postal_code: clean(body.shipping?.postal_code, 32), country: clean(body.shipping?.country, 2).toUpperCase()
    },
    items: quote.items, currency: quote.currency,
    subtotal: quote.subtotal, shipping_method: quote.selected_shipping, shipping_charged: quote.shipping_amount,
    tax: quote.tax.amount, tax_engine: quote.tax.engine, rate_engine: quote.rate_engine, grand_total: quote.grand_total,
    revenue: round2(quote.subtotal + quote.shipping_amount),
    cogs: 0, shipping_cost: 0, payment_fee: round2(quote.grand_total * feeRate), affiliate_commission: 0, ad_attributed_cost: 0,
    created_at: now, updated_at: now
  });

  if (method === "twint") {
    const tcreds = { merchant_id: process.env.TWINT_MERCHANT_ID };
    if (!twintConfigured(tcreds)) {
      await updateRecord("orders", id, { status: "Cancelled", payment_status: "failed", updated_at: new Date().toISOString() });
      throw new HttpError(503, "twint_not_configured", "TWINT 尚未配置：请设置 TWINT_MERCHANT_ID");
    }
    const tp = await createTwintPayment({ amount: quote.grand_total, currency: quote.currency, referenceId: id, returnUrl: `${baseUrl}/payment-success.html?order=${encodeURIComponent(id)}&method=twint`, creds: tcreds });
    return { order_id: order.id, total: quote.grand_total, currency: quote.currency, approval_url: tp.redirect_url, method: "twint", quote };
  }

  // PayPal
  const creds = await paypalCreds(tenantId);
  if (!paypalConfigured(creds)) {
    await updateRecord("orders", id, { status: "Cancelled", payment_status: "failed", updated_at: new Date().toISOString() });
    throw new HttpError(503, "paypal_not_configured", "PayPal 尚未配置：请在后台 API / 协议 中填写 PayPal 凭证，或在 .env 中设置 PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET");
  }
  try {
    const pp = await createPayPalOrder({
      amount: quote.grand_total, currency: quote.currency, referenceId: id, creds,
      returnUrl: `${baseUrl}/api/payments/paypal/return?order=${encodeURIComponent(id)}`,
      cancelUrl: `${baseUrl}/payment-success.html?order=${encodeURIComponent(id)}&status=CANCELLED`
    });
    const url = approvalUrl(pp);
    if (!url) throw new Error("paypal_missing_approval_url");
    await updateRecord("orders", id, { paypal_order_id: pp.id, updated_at: new Date().toISOString() });
    return { order_id: order.id, total: quote.grand_total, currency: quote.currency, approval_url: url, method: "paypal", quote };
  } catch (e) {
    console.error("[checkout] PayPal order creation failed:", e.message);
    await updateRecord("orders", id, { status: "Cancelled", payment_status: "failed", updated_at: new Date().toISOString() });
    throw new HttpError(502, "paypal_create_failed", "PayPal 支付创建失败，请稍后重试");
  }
}

async function markPaid(order, { captureId, source }) {
  if (order.payment_status === "paid") return order;
  const now = new Date().toISOString();
  const updated = await updateRecord("orders", order.id, { status: "Paid", payment_status: "paid", paypal_capture_id: captureId || order.paypal_capture_id || "", paid_at: now, updated_at: now, paid_via: source });
  await createProofForOrder(updated);
  if (updated.customer_email) {
    const subject = `Payment received · ${updated.id}`;
    const text = `Payment received for order ${updated.id}.\n\nWe will prepare your design proof next.\n\nOrder: ${updated.id}\nStatus: Paid`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf8f5"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">
<tr><td style="background:#2f3a45;padding:28px 32px;text-align:center">
<p style="margin:0;font-size:11px;letter-spacing:3px;color:#c9b99a;text-transform:uppercase">Payment Received</p>
<h1 style="margin:8px 0 0;font-size:26px;font-weight:400;color:#ffffff;font-family:Georgia,serif">Thank you</h1>
<p style="margin:6px 0 0;font-size:13px;color:#b8c0c8">Order ${updated.id}</p>
</td></tr>
<tr><td style="padding:28px 32px">
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2a2a2a">We have received your payment. We will prepare your design proof and email you when it is ready for review.</p>
<table role="presentation" width="100%" style="font-size:15px;line-height:1.6;color:#2a2a2a">
<tr><td style="padding:6px 0;color:#888;width:110px">Order</td><td style="padding:6px 0;font-weight:500">${updated.id}</td></tr>
<tr><td style="padding:6px 0;color:#888">Status</td><td style="padding:6px 0;color:#3d6b4f;font-weight:500">Paid</td></tr>
</table>
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #eee;text-align:center">
<p style="margin:0;font-size:12px;color:#999">All details are included in this email.<br>No further action needed.</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
    await sendEmail({ tenantId: updated.tenant_id, userId: updated.user_id || null, to: updated.customer_email, type: "payment_received", related_id: updated.id, subject, text, html });
  }
  return updated;
}

/** Customer returns from PayPal: capture once, then send them to the status page. */
export async function handlePayPalReturn({ orderId, paypalToken }) {
  const order = orderId ? await findRecord("orders", String(orderId)) : null;
  if (!order || !order.paypal_order_id || (paypalToken && paypalToken !== order.paypal_order_id)) {
    return { orderId, status: "UNKNOWN" };
  }
  if (order.payment_status === "paid") return { orderId: order.id, status: "COMPLETED" };
  try {
    const result = await capturePayPalOrder(order.paypal_order_id, await paypalCreds(order.tenant_id));
    const capture = result?.purchase_units?.[0]?.payments?.captures?.[0];
    if (result?.status === "COMPLETED") {
      await markPaid(order, { captureId: capture?.id, source: "return_capture" });
      return { orderId: order.id, status: "COMPLETED" };
    }
    return { orderId: order.id, status: result?.status || "PENDING" };
  } catch (e) {
    console.error("[checkout] capture failed:", e.message);
    return { orderId: order.id, status: "PENDING" }; // webhook will reconcile
  }
}

/** PayPal webhook reconciliation (idempotent). */
export async function handlePayPalEvent(event = {}) {
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return null;
  const ppOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
  if (!ppOrderId) return null;
  const order = await findWhere("orders", o => o.paypal_order_id === ppOrderId);
  return order ? markPaid(order, { captureId: event.resource?.id, source: "webhook" }) : null;
}

export async function publicOrderStatus(id) {
  const order = await findRecord("orders", String(id || ""));
  if (!order) throw new HttpError(404, "order_not_found", "Order not found");
  return { id: order.id, status: order.status, financial_status: order.payment_status || "" };
}
