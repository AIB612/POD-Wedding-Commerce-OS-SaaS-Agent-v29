# Pod.AI — standalone Shopify app (App Store candidate)

Only the POD Agent customer chat, packaged for any Shopify shop. Separate Partner app from "POD Wedding Studio".
Server code lives in the main repo (`server/shopify-agent/`, deployed with the site on wed.swisspro.site);
this folder holds the Shopify CLI project: `shopify.app.toml` + the theme app extension.

| Part | Where | How it works |
|---|---|---|
| Storefront chat | `extensions/podai-chat/blocks/chat-embed.liquid` + `assets/chat.js/.css` | Theme app extension **app embed** (Customize → App embeds → Pod.AI Chat). No script tags, no theme edits. |
| Chat API | `POST /apps/podai/chat` → App Proxy → `POST /shopify-agent/proxy/chat` | Shopify signs every request; the server verifies the signature and takes the shop from it. |
| Embedded admin | `GET /shopify-agent` (application_url) | App Bridge + session tokens (no cookies/localStorage). Tabs: Overview KPIs, Handoffs, Knowledge, Settings, Try it, Setup. |
| Install | managed install + token exchange | First admin load calls `/shopify-agent/api/bootstrap` → offline token (encrypted at rest). |
| Webhooks | `POST /shopify-agent/webhooks` | `app/uninstalled`, `customers/data_request`, `customers/redact`, `shop/redact`; HMAC → 401 on mismatch, 200 otherwise. |

Per-shop isolation: tenant `shopagent_<shop>.myshopify.com`, derived only from a verified session token, App Proxy signature
or webhook HMAC. `x-tenant-id` / `tenant_id` can never select a `shopagent_` tenant (server/auth.js).

Answers (local first, LLM only when a key is configured on the server):
- policies (shipping / refund / contact …) from the shop's own Shopify policies + the merchant's FAQ (admin → Knowledge)
- products from Admin API search (price, image, link)
- order status + tracking: order number **and** order e-mail must match; 5 wrong tries → 15 min lock.
  Tracking: our carrier APIs (YunExpress sandbox, 4PX production; PODAI_YUNEXPRESS_MODE / PODAI_FOURPX_MODE) → 51Tracking v4 (`TRACKING51_API_KEY`) → Shopify tracking link; status, latest event and timeline in chat; cached 30 min; read-only
- shipping cost: the shop's delivery-profile rates for the customer's country; calculated rates / no zones → policy + "calculated at checkout"
- "talk to a person", anger, repeated failures → Handoffs queue in the embedded admin (no e-mail sent)

## Data sources (all from the shop, Admin GraphQL, per-shop offline token)
| Chat needs | Shopify data | Scope |
|---|---|---|
| Catalog | products, variants (title, price, availability), collections, metafields (text/number) | read_products |
| Pricing | variant price, shop `currencyCode`, `taxesIncluded` | read_products |
| Shipping | delivery profiles → zones → active method rates (+ conditions); calculated rates → "at checkout" | read_shipping |
| Orders & tracking | order by name + e-mail check; `fulfillments.trackingInfo` → carrier API (YunExpress / 4PX) → 51Tracking → Shopify tracking URL | read_orders |
| Promos | check one code the customer has (`codeDiscountNodes`, active?) — codes are never listed | read_discounts |
| Returns / payment info | shop policies (refund, shipping, contact, terms) | read_legal_policies |
| Merchant FAQ | Pod.AI admin → Knowledge | — |

Nothing is read from the Wed.AI site (catalog, prices, fees, orders, promo codes, site agent). Pod.AI has its own engine copy
(`server/shopify-agent/engine`, from the site agent) and its own collections (`podai_*`). Boundary is enforced by `test/audit.test.js`.
Shared infrastructure used unchanged: `saas-store.js` (storage file), `utils/crypto.js` (token encryption), carrier API clients
`logistics/{yunexpress,fourpx,http}.js` (tracking calls only). Site hook: one mount line in `server/create-app.js`.

Tests: `node server/shopify-agent/test/app.test.js && node server/shopify-agent/test/tracking.test.js && node server/shopify-agent/test/audit.test.js`

## Steps that need the Partner account (Sherry)
1. Dev Dashboard / Partner Dashboard (org DropkingAI) → **Create app** → "Pod.AI" (Create app manually).
2. In this folder on the Mac: `shopify app config link` → choose the new app (fills `client_id`), then `shopify app deploy`
   (pushes URLs, scopes, App Proxy, webhooks and the theme extension). Release the version.
3. Put the new app's credentials in the server `.env` (never in git): `AGENT_SHOPIFY_API_KEY=` (client id),
   `AGENT_SHOPIFY_API_SECRET=` (client secret); restart the app.
4. App → API access → **Protected customer data**: request access (reason: customer service / order status), fields **Email**
   (needed to verify the order e-mail). Without it order lookup answers "not available" and offers a person.
5. Install on dropkingdev from the Dev Dashboard (Test on development store) → open the app once → Online Store → Customize →
   App embeds → turn on **Pod.AI Chat** → Save.

## Before App Store submission
- Listing: name, icon 1200×1200, 3–6 screenshots 1600×900, short + long description, demo video (optional), support e-mail, privacy policy URL.
- Privacy policy page for the app (what is stored: chat messages, optional customer e-mail, handoffs; retention; deletion via GDPR webhooks).
- Pricing: free, or Shopify App Pricing (default for new public apps) — plans set in the submission form; no billing code needed.
- Protected customer data approval (Level 2 for e-mail) and the data-protection questionnaire.
- Test on a fresh dev store: install, app embed in Theme Editor without errors, uninstall/reinstall.
