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
- products from Admin API search (price, image, link); generic requests ("show me products", "what do you sell", "bestsellers", "Zeig mir eure Produkte", "你们有什么商品") list the newest active products
- no published policy (e.g. dev store without a refund policy) → says so, adds shipping policy / contact e-mail, offers the team
- order status + tracking: order number **and** order e-mail must match; 5 wrong tries → 15 min lock.
  Tracking: our carrier APIs (YunExpress sandbox, 4PX production; PODAI_YUNEXPRESS_MODE / PODAI_FOURPX_MODE) → 51Tracking v4 (`TRACKING51_API_KEY`) → Shopify tracking link; status, latest event and timeline in chat; cached 30 min; read-only
- shipping cost: the shop's delivery-profile rates for the customer's country; calculated rates / no zones → policy + "calculated at checkout"
- "talk to a person", anger, repeated failures → Handoffs queue in the embedded admin (no e-mail sent)

## UI (v2, POD.AI visual system)
- **Embedded admin** (`server/shopify-agent/admin.html`, App Bridge): Overview (merchant KPIs with 7/30/90-day range, trend and sparkline; example-data banner when empty; setup checklist), Handoffs (index table + status), Knowledge (table + modal editor), Settings (greeting, brand colour, launcher position, title, avatar, language, LLM on/off) with live preview, Try it. EN + 中文.
- **Storefront widget** (`extensions/podai-chat`, app embed, ~20 KB): brand-colour launcher, open animation, header with shop name/avatar/online status, typing indicator, quick replies, product carousel (view / add to cart, UTM-tagged), order + tracking timeline card, inline e-mail form on handoff, full-screen on mobile, accessible. Empty embed settings fall back to the app settings (`/apps/podai/config`).
- Events (`/apps/podai/event`: product_click, add_to_cart, chat_open) feed the dashboard; no personal data.

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

Nothing is read from the POD.AI site (catalog, prices, fees, orders, promo codes, site agent). Pod.AI has its own engine copy
(`server/shopify-agent/engine`, from the site agent) and its own collections (`podai_*`). Boundary is enforced by `test/audit.test.js`.
Shared infrastructure used unchanged: `saas-store.js` (storage file), `utils/crypto.js` (token encryption), carrier API clients
`logistics/{yunexpress,fourpx,http}.js` (tracking calls only). Site hook: one mount line in `server/create-app.js`.

Diagnosis on the server (no secrets printed): `node server/shopify-agent/tools/diag.mjs dropkingdev.myshopify.com`

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

## Protected customer data (encryption, backups, access log, incidents)
- **Encryption at rest**: `server/shopify-agent/security/records.js` registers a persist codec for every `podai_*` collection.
  On disk each row is `{ id, tenant_id, _enc: "pa1.…" }` (AES-256-GCM, AAD = collection:id, key HKDF-derived from
  `PODAI_DATA_KEY` or `APP_ENCRYPTION_KEY`). In memory rows stay plain, so GDPR redact by e-mail works unchanged.
  Plaintext rows are migrated on startup; rows that cannot be decrypted (wrong key) are kept verbatim, never dropped.
- **Encrypted backups**: `security/backup.js`, run hourly by the app, one backup per UTC day →
  `~/podai-backups/store-YYYYMMDD.json.gz.enc` (0600 in a 0700 dir), 14 days. Plaintext `store.json.corrupt-*` / `.bak*`
  copies are encrypted into the same dir and deleted.
  - list: `node server/shopify-agent/tools/restore-backup.mjs --list`
  - backup now: `node server/shopify-agent/tools/restore-backup.mjs --backup-now`
  - restore: `node server/shopify-agent/tools/restore-backup.mjs ~/podai-backups/store-YYYYMMDD.json.gz.enc --out /tmp/store.restored.json`,
    then stop both apps (`pod-wedding`, `pod-ai-app`), move `data/store.json` aside, copy the restored file in (chmod 600), start both.
- **Access log**: `security/access-log.js` appends one JSON line per access to personal data (admin views of conversations /
  handoffs / dashboard / GDPR log, order lookups in the chat, GDPR webhooks) to `data/podai-access/access-YYYY-MM.log`
  (actor, action, record ids; e-mail / order number only as HMAC). Kept 12 months. Merchant view: `GET /shopify-agent/api/access-log`.
- **Policies**: https://pod.swisspro.site/security (incident response, 72 h merchant notification), https://pod.swisspro.site/dpa.

## Access tokens (expiring offline tokens)
Shopify rejects non-expiring offline tokens for new public apps (`403 Non-expiring access tokens are no longer accepted`).
`core.js` requests `expiring=1` on token exchange, stores the 1 h access token + 90-day refresh token (both encrypted),
refreshes 5 min before expiry (or once after a 401), and migrates a stored legacy token once via token exchange
(`subject_token_type=…offline-access-token`). A failed refresh never marks the shop uninstalled; opening the app re-exchanges.
