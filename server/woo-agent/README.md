# woo-agent – Pod.AI for WooCommerce (backend channel)

WooCommerce stores connect through the Pod.AI Chat for WooCommerce WordPress plugin (slug and text domain `pod-ai-chat-for-woocommerce`, `apps/woocommerce-plugin/pod-ai-chat-for-woocommerce`; folder `pod-ai-chat` up to 1.2.0).
The channel reuses the platform-agnostic commerce agent (`server/commerce-agent`) – the same NLU, local RAG,
recommendation, ticket and dashboard engine as the Shopify app – through a Woo data adapter (`adapter.js`).
Shopify routes, webhooks and data are untouched.

* `POST /woo-agent/v1/register` – plugin registers; backend verifies site control via `GET <rest>/pod-ai/v1/verify?nonce=`
  (https only in production, private IPs blocked), returns `site_id` + per-site secret. `WOO_REGISTRATION=closed` disables it.
* Signed routes (`X-PodAI-Site/Timestamp/Nonce/Signature`, HMAC-SHA256 v1, ±300 s, single-use nonce):
  `chat`, `preview`, `config`, `event`, `store`, `products/sync`, `products/delete`, `status`, `billing`,
  `tickets`, `tickets/:id`, `disconnect` (deletes every record of the site).
* Catalog: per-site JSON in `WOO_CATALOG_DIR` (default `<dirname STORE_PERSIST_PATH>/woo-catalog`); only in-stock,
  purchasable products with a price are recommended.
* Orders are never stored: lookups call back the store (signed), 5 wrong tries lock an order for 15 minutes.
* Agentic actions in the widget: add to cart (Woo Store API), apply the store's public coupon, checkout link. No payment.
* Plans: Free 50 / Growth 500 (USD 19) / Pro 2,500 (USD 49) chats per month; payment collection disabled
  (`billing.js`), staff can set a plan with `node server/woo-agent/tools/set-plan.mjs ws_… growth`.
* Tests: `server/woo-agent/test/woo.test.js`; local store E2E in `apps/woocommerce-plugin/tests/`.
