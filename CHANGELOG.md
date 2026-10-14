# V29 — Account / Order / Admin Sync

See `CHANGELOG_V29.md`.

# V28 — Actionable Packaging & Review

- Packaging now has an explicit **Use branded packaging / No custom packaging** choice.
- Packaging supports an optional reference/example image with preview, replace and remove.
- The same packaging reference can be added or changed from Review.
- Review checklist is actionable: unfinished/warning rows explain exactly what is missing and jump to Design, Pricing, Delivery or Packaging.
- Print-ready now identifies low-DPI products and explains how to fix them (higher-resolution artwork or smaller print size), with a direct jump to the first affected product.
- Added actionable checks for contrast, margin, sizes, recipients, event/delivery date and packaging choice.
- Individual/event flows require an event/needed-by date before final submission.
- Existing Design / Pricing / Delivery / Packaging / Review visual components remain; only the requested Packaging/Review completion UX was added.

# V24.1 — Preserve Studio UI

- Removed the duplicated scene/catalog marketing headers added in V24.
- Removed the separate Eco-only filter UI; sustainability remains as simple product labels.
- Restored V23 `studio.html` / CSS exactly, including the original Design / Pricing / Delivery / Packaging / Review selectors and component styling.
- Kept V24 focused data: 6 core studio scenarios, 97 products, 16 product categories, and sustainability metadata.
- Homepage changes from V24 are preserved.

# V24 · Focused Studio

- Storefront reduced to the first Cream Garden Wedding scene.
- Main Studio CTA moved to the first-screen right panel.
- Homepage second/third sections redesigned.
- Studio reduced to 6 business scenarios.
- Catalog refactored to 16 first-level categories and 97 core SKUs.
- Added simple sustainability labels and Eco-only filtering.
- Removed the separate wedding product category from Studio.
- Unified vector mockup background and removed artificial ground shadows.

# CHANGELOG

## 2026-10-09 — v23: one scene list, materials, design showcase, privacy, English default

- **One scene list for storefront and studio.** `scripts/build_scenes.py` reads the storefront scenes (index.html) and
  writes them into the studio catalogue: 6 wedding styles (48 products, same names, same materials and surcharges) +
  the 6 studio scenes = 12 scenes in both places. The storefront scene menu shows *Wedding styles*, *POD Studio scenes*
  and **✦ Custom design** (opens the studio to enter your design). Products of studio scenes open the studio with the
  product selected. `npm run test:studio` checks that both lists match.
- **Scene images generated** for every scene without a photo (5 wedding styles + 6 studio scenes): products cut out
  of the standard renders, scaled to real size, standing on a table in the scene colours; hotspots sit on the products.
  The cream photo moved out of the HTML into `assets/scenes/cream.webp` (index.html ~300 KB → ~120 KB).
- **Materials** shown and selectable in product details and in the design editor (price difference shown), carried
  into pricing, saved plans, quote requests and orders. Wedding products keep the storefront paper / acrylic / gift
  materials; other products got category materials (cotton weights, ceramic finishes, acrylic, papers, canvas, bags …).
- **Storefront screens:** the scene library (2nd screen) is removed, *Products, materials & customisation* is now the
  2nd screen, and a new **Design showcase** screen (designs rendered on products) states: free forever, no
  subscription, designs stored encrypted, deleted automatically after 30 days.
- **Privacy made true:** uploaded designs are stored AES-256-GCM encrypted outside the public folder and served
  decrypted only via `/api/studio/projects/:id/design` (no-store); projects expire after 30 days (90 days after a
  quote request) and are purged with their files (start-up + every 6 h). Expired projects are hidden immediately.
  Browser-saved plans older than 30 days are removed. Dot-folders under `/generated` are never served.
- **Languages:** no third-party translation plugin — built-in dictionaries (`i18n.js`, studio dictionary). English is
  the default; the language switch is a dropdown (storefront, studio, admin). ~90 missing storefront translations added.
- Fix: `/index.html` is now served by the server (studio links to it).

## 2026-10-09 — v22: navigation on the left, kits on the right

- **Left column = navigation + my selection**: ▦ Scenario kits · ◫ All products (57) · ✎ My selection · Studio
  (badge with the number of selected products). The selection list stays below the navigation.
- **Scenario kits**: the centre shows every scenario as a card (compact 4-product strip, audience, kit names,
  recommended for the current role). Clicking a scenario shows **its kits in the right column**: kit name, number of
  products, price per set and at the kit quantity (merchants: profit and retail per set), product list with images,
  *Details ▾* (technique, print area, production, lead time, price), *Design with this kit →* and a large
  **＋ Add to selection** button (turns into "✓ In selection"). The centre sub-tabs were removed.
- **All products**: centre grid with search (in the section header) and category filters; summary on the right.
- **My selection · Studio**: the existing studio layout and functions, unchanged.
- The right column stays within the viewport while scrolling; on narrow screens clicking a scenario scrolls to its kits.

## 2026-10-09 — v21: scenes and studio on one page

- Scenario selection and the design studio live on **one page**: the selection rail (left) and the profit / total
  summary (right) stay in place; only the centre switches between **① Scenarios & products** and **② Design studio**
  (sticky switch, short transition, each side keeps its scroll position, the studio keeps its last tab).
- **Scenario page redesigned**: a strip of scenario cards (ordered by role, recommended marked) → the kits of the
  selected scenario as large cards with product images, role-aware prices (merchant: profit / retail per set;
  company & individual: price per set and at the kit quantity), inline details (technique, print area, production,
  lead time, price), products already selected are ticked. **All products** is a sub-tab (search + categories).
- Kits can **replace** the selection (and open the studio) or be **merged** into it without leaving the page.
- Browsing thumbnails are clean product shots (print-area outline only inside the studio).
- Design studio flow and styles are unchanged.

## 2026-10-09 — v20: role selector, shop connection, standardised product images

- **Role selector in the header** (merchant / company / individual) replaces the role cards on the page and the
  switch inside the workspace; the scenario list follows the selected role.
- **Merchants connect shops**: Shopify (domain) and WooCommerce (https URL) from the header or at the end
  (*Review → Publish to*, or "connect later"). Safe default records a connection request + admin task; with
  `STUDIO_PUBLIC_CONNECT=true` the official Shopify OAuth / WooCommerce wc-auth flows are used (keys posted
  server-to-server, encrypted, single use, 30 min window) and the merchant returns to the studio. Projects and quote
  requests carry the publish target.
- **Standardised product images for all 57 products**: blank / white-label, same backdrop, light and framing,
  recolourable, designs follow folds and curvature. Original procedural renders (`scripts/generate_mockups.py`).
- **AI / photo pipeline**: `docs/MOCKUP_PROMPTS.md` (shared style + per-product prompts) and
  `scripts/import_mockup.py` (auto mask + shade map from the plain backdrop, refreshes offline assets).
- Thumbnails load only the base image; mask / shade load when a design or colour is applied.
- Tests: store connections (requested default, Shopify authorize URL, WooCommerce wc-auth + callback validation,
  single use, encrypted keys, publish target on the order).

## 2026-10-09 — v19.1: photo-style product mockups (original renders)

- `scripts/generate_mockups.py` renders 10 photo-style mockups (tee, hoodie, tote, mug, tumbler, pillow, phone case,
  poster, canvas, invitation): studio backdrop, soft shadows, fabric grain, folds, rib collar, hood / drawstrings /
  pocket, cylinder shading, gallery-wrap depth. Created from scratch — not derived from other platforms' images.
- Renderer: base + alpha mask (recolour keeps shading) + shade map (design follows folds and curvature), clipped to the product.
- Works opened from disk (embedded `studio-mockup-assets.js`, PNG downloads still work) and served (`assets/mockups/`).
- `npm run mockups:generate`; docs updated (`docs/POD_STUDIO.md` § 5).
- Contrast check: warns when the design colour is too close to the chosen product colour (editor chip + review checklist).

## 2026-10-09 — v19: POD Studio interaction redesign + delivery

- **Buyer types** (merchant / company / individual) drive quantities, pricing, delivery and the final action; switchable anytime.
- **Explore**: scenarios list every kit's products (images + names), kit details drawer, product details drawer
  (technique, print area, weight, sizes, colours, production per market, quantity pricing), searchable catalogue with filters.
- **Flexible workspace** instead of a fixed wizard: selection rail (add / remove / quantities / per person), free tabs,
  per-buyer live summary; catalogue drawer to add products from anywhere; custom selections without a kit.
- **Design**: focused editor per product (fit / fill / pattern, scale, position, colour, reset, apply to similar), tile grid.
- **Delivery** (`StudioPricing.fulfillment`): merchant print-on-demand per-order rates & days + sample order; company one
  address (consolidated per facility) or each recipient (list paste / CSV upload, sizes from the list, unsupported
  countries); individual event date → latest order date; needed-by date check (business days + proof buffer).
- **Sizes**: size mix per apparel product, validated against quantity; from the recipient list in multi-recipient mode.
- Product prices no longer include a flat shipping estimate — delivery is priced separately and shown in totals.
- Renderer moved to `studio-mockups.js` (backdrop, ground shadow) with an optional licensed photo-mockup slot (`mockup_photo`).
- Server: projects store buyer type, fulfilment (recipients: name / country / size), per-person quantities and sizes;
  quote requests recompute delivery; orders carry buyer type, delivery summary, shipping, sizes, VAT ID. Share links drop recipient names.
- Tests: `test:studio` extended (delivery modes, multi-recipient quantities, company totals, privacy of share links).

## 2026-10-06 — v18: POD Studio (scenario → design → profit → production)

New storefront header entry **✦ POD 工作室** opens `studio.html`, a separate one-stop flow; the wedding shop is unchanged.
- Six audience scenarios → 15 ready-made kits over 57 products (`server/data/studio-catalog.json`).
- Design once (upload or text / monogram generator) → auto-placement on every print area (fit / fill / pattern),
  per-product fine-tuning, print-resolution check, PNG mockup downloads. All mockups are drawn in the browser.
- Profit slider + target market (CH / EU / US): suggested prices, market-ceiling filter, nearest-facility routing
  (near cross-border EU ↔ CH before transatlantic), lead times; live profit summary.
- Branded packaging options with unboxing preview; cost applied only where supported.
- Works opened from disk (plans in browser storage + export). With the server: projects
  (`/api/studio/projects`), share links and quote requests that create an order + design proof in the admin.
- One pricing module (`studio-pricing.js`) shared by browser and server; server always recomputes.
- Uploaded designs: PNG / JPEG / WebP only, magic bytes checked, 8 MB max, stored under `/generated/studio/`
  (sandboxed); share links never expose contact data or the order.
- Admin: studio quote requests show as store "POD Studio".
- Tests: `npm run test:studio` (data sync, pricing rules, save / reopen / quote over HTTP); included in `test:all`.
- Docs: `docs/POD_STUDIO.md`.

## 2026-10-05 — v11: v10 logistics / data / connector features on the v9 base

v10 had been built on the v7 → AntPro line, so it did not contain the v8/v9 work (checkout capture,
order status & proof APIs, security hardening, wired admin, installable React admin). v11 takes v9 as the
base and ports all v10 features onto it; v10's own flow tests (22) and HTTP tests (23) pass unchanged
apart from sending a customer e-mail at checkout.

### Fixed in the v10 features
- Checkout charges merchandise + shipping + tax from one server quote (`/api/storefront/shipping/quote`
  and checkout share it). v10 created PayPal orders without an internal order and never captured them.
- PayPal credentials entered in Admin → API are now used for checkout, capture, refunds and webhook
  verification (tenant first, `.env` fallback). v10 only read `.env`.
- Live carrier rates in another currency (EasyPost returns USD) are no longer added to a CNY subtotal;
  the quote falls back to regional rules and reports `live_rate_error: currency_mismatch`.
- Free-shipping threshold also applies when live rates are used; deactivated regions are not matched.
- Shopify carrier-rate callback answers within `CARRIER_CALLBACK_BUDGET_MS` (falls back to regional
  rules if a provider hangs) and never reports zone amounts in a different shop currency.
- Every outbound provider call has a timeout (`EXTERNAL_API_TIMEOUT_MS`, `server/utils/timed-fetch.js`).
- Excel import: zip-bomb limits (entry count, per-entry and total uncompressed size, enforced again by zlib).
- CSV export: formula-injection guard (`=`, `+`, `-`, `@`, tab, CR prefixed with `'`; stripped again on import).
- Import preview tokens are tenant-bound, expire after 10 minutes and are pruned.
- Connector credentials persist with `STORE_PERSIST_PATH` (encrypted at rest; never returned by the API).
- Admin: import commit sent no preview token (always failed); Customer 360 only looked up hard-coded demo
  customers; "sync tracking" sent the approval flag without asking; admin key hard-coded in five places;
  carrier timelines, import cells, zone and connector data were inserted unescaped. All fixed.
- Storefront checkout summary always said "Standard shipping"; now shows the selected method.

### Ported from v10
- Admin: Logistics center (KPIs, carrier cards, tracking timeline, shipping/tax estimate, editable
  regions, store sync), Data import/export page, clickable connector center with configuration drawer,
  Customer 360 with radar profile, activity, recommendations and order history; order management split
  from logistics. React admin: the same Logistics, Data, Connector center pages and Customer 360 drawer.
- Server: connector registry/config/test, shipping & tax service (regional rules, EasyPost, AvaTax),
  Shopify CarrierService registration + callback, Excel/CSV data exchange, customer profile detail,
  `write_shipping` scope, logistics seed data, import template.
- Tests: `test:flows`, `test:http` (from v10) and new `test:hardening`; `npm run test:all` runs all four.
- ~100 new zh / en / de UI translations, checked for reverse-mapping collisions.

## 2026-10-05 — Logistics execution + full flow audit v10.1

- Tenant Connector Center credentials now feed the logistics execution path; `.env` is fallback.
- Added EasyPost live shipment rating adapter with regional fallback.
- Added Avalara AvaTax SalesOrder tax-estimate adapter with regional fallback.
- Added explicit `live_rate_error` / `live_tax_error` diagnostics.
- Added Shopify `write_shipping` OAuth scope.
- Added conditional real Shopify `carrierServiceCreate` registration.
- Added public per-store-secret Shopify carrier-rate callback endpoint.
- Shopify store sync now returns `registered`, `staged`, or `error` instead of pretending every Shopify sync is live.
- Aligned 17TRACK connector IDs so Logistics cards open the correct configuration drawer.
- Improved Connector configured state to require the connector's required credential fields.
- Added common shipping-origin configuration fields.
- Fixed storefront shipping selector layout for Standard / Express.
- Added mocked live-adapter tests for EasyPost, AvaTax, and Shopify CarrierService registration.
- Re-ran service flow audit: all service-level checks pass.
- HTTP E2E script syntax bug found and fixed; runtime HTTP execution remains dependent on installing Express/CORS/Dotenv in the deployment environment.


## 2026-10-05 — Logistics Center + clickable Connector Center v10

- Split Admin navigation into separate Order Management and Logistics Management sections.
- Added Logistics Center KPIs for active shipments, configured carrier APIs, shipping regions and connected stores.
- Added clickable carrier API cards for configuration/status.
- Added shipment table with clickable tracking timeline.
- Added regional shipping/tax rule table and editable region drawer.
- Added server-side Standard / Express quote selection.
- Added storefront shipping-method selector and reused the selected method for PayPal server-side quote.
- Added rate-engine and tax-engine metadata to storefront quotes.
- Added multi-store shipping/rate synchronization status.
- Added EasyPost and ShipStation connector slots plus direct carrier fields.
- API / Protocols cards are now clickable configuration surfaces with credential status, webhook, notes and connection test.
- Added `GET /api/saas/logistics/zones` and approval-gated `POST /api/saas/logistics/zones/:id`.
- Added tracking event and store-sync demo records.
- Excel import template now includes Shipping Zones.
- Shipping Zones are import/export supported in Excel and CSV; API secrets remain excluded from spreadsheets.


## 2026-10-05 — Logistics Control Center + Excel shipping rules + connector configuration v10

- Split Logistics into its own first-level Admin section.
- Orders is now a separate Order Management module.
- Added Logistics KPIs: active shipments, exceptions, connected carrier APIs and shipping regions.
- Added carrier API cards for AfterShip Tracking, AfterShip Shipping, Shippo, 17TRACK, DHL, UPS and FedEx.
- Carrier cards are clickable and open API configuration / current-status UI.
- Added shipment tracking detail and timeline drawer.
- Added regional Standard / Express shipping calculation.
- Added free-shipping thresholds and tax-mode / tax-estimate handling.
- Added `POST /api/saas/logistics/quote`.
- Added `POST /api/saas/logistics/sync-stores`.
- Added public `POST /api/storefront/shipping/quote`.
- Storefront cart now displays shipping / tax estimate and estimated total.
- Checkout copies the selected destination and refreshes the server-side quote.
- Added safe `POST /api/payments/paypal/create`; cart, material, tier pricing, shipping and tax are recalculated server-side.
- Added generic connector registry / configure / test APIs.
- All Connector cards can now be clicked to configure and inspect status.
- Connector secrets are never returned in plain text.
- Added Shipping Zones to Excel / CSV import and export.
- Added Shipping Zones sheet to `commerce-os-import-template.xlsx`.
- Added boolean import validation.
- Added PostgreSQL reference tables for shipping zones, connector configurations, store sync and shipping quotes.
- Added `docs/LOGISTICS.md`.
- Extended service and flow tests for logistics, tracking, store sync, connectors and Shipping Zone Excel.
- Added an HTTP E2E test script for deploy/runtime validation.


## 2026-10-05 — Excel / CSV data exchange and flow validation v10

- Added Admin **数据导入 / 导出** workspace.
- Added `.xlsx` and `.csv` import preview and export flows.
- Added polished multi-sheet Excel import template.
- Added row-level required / numeric / date / array normalization and validation.
- Official template metadata rows (`required/optional`, field type) are automatically skipped during import.
- Import now follows Upload → Validate → Preview → Approval → Commit.
- Added short-lived server-side `preview_token` so commit does not trust browser-mutated preview rows.
- Added tenant-scoped upsert rules for products, orders, customers, shipments, creators, affiliates and campaigns.
- Added per-module Excel / CSV export plus full multi-sheet Excel backup including Finance.
- Added a dependency-free internal XLSX reader/writer for server-side data exchange.
- Added React / Ant Design Pro Data Exchange page.
- Added `server/flow-test.js`, `npm run test:flows`, and `npm run test:all`.
- Added `docs/DATA_IMPORT_EXPORT.md` and flow-test documentation.


## 2026-10-05 — Customer 360 multidimensional profile v9

- Upgraded Customer 360 from a flat table to a multi-dimensional profile workflow.
- Customer list now shows LTV, order count, engagement, purchase intent, preferred scene, source and next-best action.
- Clicking any customer opens a wide Customer 360 drawer.
- Added multi-dimensional profile visualization: value, engagement, repeat purchase, intent, affinity and advocacy.
- Added preference / interest tags, device, acquisition source and preferred scene.
- Added recent behavior timeline and 30-day behavior intensity.
- Added historical order list inside each customer profile.
- Added personalized product recommendations with score and reason.
- Added Agent follow-up action from each customer profile.
- Added `customer_events` to SaaS seed data.
- Added `/api/saas/customers/:customerId/detail` backend endpoint.
- Backend detail joins profile, behavior events, conversations, historical orders and recommendations.
- React Ant Design Pro Admin now includes Customer 360 with Radar visualization.
- New Customer 360 labels support Chinese / English / German.


## 2026-10-05 — v9: Ant Design Pro admin on the v8 backend

Base: the "Ant Design Pro architecture redesign" admin (entry below), merged with the v8
hardening work, which that redesign did not include (it was built on v7). Layout, colours and
information architecture of the redesign are unchanged.

### admin.html
- Reconnected to the backend: the redesign had no API calls at all (every number, table and agent
  reply was hard-coded). Data now comes from `/api/saas/*`, with the previous demo data as fallback.
- Wired ~30 buttons that had no handler to the existing endpoints (sync, logistics sync, approvals,
  supplier import, campaign drafts, reply drafts, segments, connector check, CSV exports) or to the
  Agent. See `docs/ADMIN_UX.md` → "Data & actions".
- Agent panel calls `/api/agent/ops` and shows the real plan, created tasks and approval state.
- Mobile: ☰ now opens the sider (below 820px the sider was hidden with no way to navigate).
  Desktop: ☰ collapses it to icons (remembered).
- Store / status filters are built from the data; orders table has column visibility and density.
- Nav badges, KPI cards, profit bridge, attention list and store health use live values.
- Admin key prompt appears once for parallel 401s (previously one prompt per request).
- External data is HTML-escaped; Shopify OAuth uses an authenticated fetch instead of a redirect.
- Translations: ~70 new zh/en/de entries; breadcrumbs made translatable; relative times re-render
  on language change. New entries were checked so they do not rename existing English labels.

### admin-app (React)
- Could not be installed: `@ant-design/pro-components@2.8.10` requires antd 4/5, the package
  pinned antd 6. Now antd 5 + `@ant-design/v5-patch-for-react-19` (official React 19 patch).
- 8 of 12 pages were placeholders; all pages now render live data with ProTable / ProCard
  (search, select filters, density / column settings, CSV export, write actions with confirmation).
- Page components moved out of `App` (they were re-created on every render, resetting their state).
- Language switch now translates navigation, actions and antd components (zh / en / de locales).
- Bundle split into cacheable React / antd / pro-components chunks; charts load lazily.

## 2026-10-05 — Ant Design Pro architecture redesign v8

- Rebuilt `admin.html` around Ant Design Pro information architecture instead of custom dashboard styling.
- Changed Admin layout to a 208px fixed Sider + 64px Header + Page Header + 24px content canvas.
- Switched primary UI color to Ant Design blue `#1677ff`.
- Standardized 14px application typography, 8px radius and Ant-like form/table dimensions.
- Added PageContainer-like page headers with breadcrumb, title, subtitle and actions.
- Rebuilt order filters as an Ant QueryFilter-style form card.
- Rebuilt data lists as ProTable-style cards with toolbar / search / table hierarchy.
- Reduced custom rounded cards, decorative gradients and non-standard controls.
- Kept the dedicated Shopify OAuth entry in Header and Store Center.
- Upgraded `admin-app/` to use the real `@ant-design/pro-components` package.
- React Admin now uses `ProLayout`, `PageContainer`, `ProTable`, `ProCard` and `StatisticCard`.
- Added `@ant-design/pro-components@2.8.10` to the Admin package.

## 2026-10-05 — Hardening & optimization v8 (no feature changes)

### Fixed (previously broken)
- Admin (`admin.html`) was blank: a stray fragment after `connectShopify()` was a syntax error that stopped the whole script.
- Language switching (中文 / EN / DE) failed on every page: the server never served `i18n.js` (404). Payment status page also crashed because of it.
- Storefront checkout called `/api/payments/paypal/create`, which no longer existed. Restored with a server-side quote.
- `payment-success.html` and `proof.html` called `/api/orders/:id/status` and `/api/proofs/public/...`, which no longer existed. Restored.
- Shopify OAuth start from both admins used a plain redirect, which cannot send the admin header, so it always returned 401 once a key was set.
- Generated invitation sites: the 中文 / EN / DE buttons did nothing, because the language script ran in the builder instead of the generated page — and it reset the storefront's saved language to EN on every build. The script now ships inside the generated page.
- Storefront agent showed "configure an API key" to customers when no LLM was configured; it now falls back to the built-in demo answers.
- Express 4 does not catch async errors: malformed JSON or missing fields (e.g. `marketing/publish` without a draft) could crash the process. All routes now go through a shared error handler.

### Checkout & proofs
- `POST /api/payments/paypal/create`: validates email, re-quotes the cart from `server/data/storefront-pricing.json` (same formula as the storefront), creates an internal order, returns the PayPal approval URL.
- `GET /api/payments/paypal/return`: captures exactly once, then redirects to the status page. `PAYMENT.CAPTURE.COMPLETED` webhook reconciles if the customer never returns.
- A proof record (with a private token) is created when an order is paid. Admin attaches the proof image via `PATCH /api/saas/proofs/:id`; the customer approves via `proof.html`. Approval is blocked until a proof image exists.
- Unpaid draft orders are excluded from finance revenue (seed figures unchanged).

### Security
- Public `/api/agent/chat` no longer returns back-office data (finance, all orders, customer emails) to storefront visitors; ops intents require admin auth.
- `/api/protocols/mcp` and `/api/a2a` require admin auth.
- Public catalog and ACP feed no longer expose supplier / landed cost.
- Store list no longer sends encrypted Shopify tokens to the browser.
- Production now fails closed when `ADMIN_API_KEY` is missing (previously every request passed), and refuses to start with example secrets.
- Admin key is no longer hard-coded in the HTML; it is asked for once on a 401 and kept in `sessionStorage`.
- Published invitation sites are served with a CSP sandbox (opaque origin); their metadata JSON is no longer public.
- Escaping of external data in admin tables and the storefront cart; OAuth errors returned as plain text.
- Webhook tenant derived from the connected shop, not a caller-supplied header; duplicate webhook deliveries are ignored.
- Shopify OAuth state is single-use and expired states are pruned. Constant-time admin key comparison.
- Basic security headers, per-IP rate limits on public write endpoints, 1 MB JSON limit (15 MB only for invitation publishing).

### Reliability & performance
- Optional persistence: `STORE_PERSIST_PATH` (atomic writes), graceful shutdown flushes pending writes.
- Timeouts on all outbound API calls; PayPal access token cached. Gemini key moved from URL to header.
- gzip compression; material photos moved out of `index.html` into cacheable `/assets/materials/*.jpg` (304 KB → 105 KB HTML).
- Knowledge retrieval now matches Chinese queries (CJK bigrams).
- React admin build is served at `/admin-app/` when `admin-app/dist` exists; Docker image builds it automatically.

### Code & ops
- `server/app.js` split into `create-app.js`, `config.js`, `http/middleware.js`, `routes/{webhooks,public,admin}.js`, plus `services/{pricing,checkout,proof}-service.js`.
- `npm test` now includes HTTP integration tests (auth, data-leak checks, checkout → capture → proof, invitations) with PayPal stubbed, plus a check that the server price list matches `index.html`.
- Dockerfile: multi-stage, `npm ci` with lockfile, non-root user, healthcheck. Compose: volumes for runtime data and published sites.
- `schema.sql`: `citext` extension, `proofs` table, checkout columns on `orders`.


## 2026-10-05 — Admin filter redesign + full-site Chinese / English / German v7

- Rebuilt Admin selector/filter structures so the visual change is obvious.
- Top bar now groups Tenant / Store / Period / Search as labeled filter fields.
- Orders use the same labeled Search / Status / Store filter pattern.
- Added persistent 中文 / EN / DE language selector.
- Added shared `i18n.js`; language persists via `localStorage`.
- Added language selector to storefront, Admin, payment status and proof pages.
- Generated standalone wedding websites also include their own 中文 / EN / DE selector.
- React + Ant Design Admin source now includes the same language selector and labeled global filters.
- Common navigation, operation labels, Shopify connection text, checkout/proof text and storefront customization controls are translated.


## 2026-10-05 — Admin typography simplification v6

- Reworked the Admin typography system instead of adding more animation.
- Increased default body copy from tiny 8–10px UI text to readable 11–13px sizes.
- Increased navigation labels to 13px and removed excessive uppercase/letter-spacing.
- Simplified KPI typography: larger values, calmer labels, less decorative styling.
- Increased table text to 12px with more balanced row spacing.
- Increased button/input/select text to 12px.
- Increased card headings to 14px and page titles to 22px.
- Simplified status tags from pill-heavy styling to quieter compact labels.
- Increased Agent messages, run trace, drawer details and command palette text for readability.
- Simplified Shopify connection copy and step typography.
- Reduced excessive rounded corners.
- Applied the same typography system to the React + Ant Design admin.


## 2026-10-05 — Admin visual refinement + Shopify connection entry v5

- Refined Admin visual language to a more minimal, premium SaaS style.
- Replaced dark/purple-heavy navigation with light neutral navigation and restrained black accent.
- Increased whitespace and hierarchy; reduced decorative shadows and visual noise.
- Added a dedicated Shopify green only for Shopify-specific actions.
- Added a global top-bar `连接 Shopify` entry.
- Added a prominent Shopify connection hero inside Store Center.
- Added a guided Shopify OAuth modal with `.myshopify.com` validation.
- Added explicit copy that Shopify secrets stay server-side.
- Kept the existing `/api/shopify/oauth/start` flow as the connection endpoint.
- Updated the React + Ant Design admin with the same visual language and OAuth entry.
- Updated mobile responsiveness for the Shopify connection hero.


## 2026-10-05 — Admin UI / Operations Workbench v4

- Rebuilt the zero-build `admin.html` into an operations workbench.
- Added animated KPI counters and animated SVG trend charts.
- Added multi-store health cards and sync status.
- Added global tenant/store/date controls.
- Added global search and Cmd/Ctrl + K command palette.
- Added order search/filter, row detail drawer, timeline and bulk selection bar.
- Added marketing KPI dashboard, trend visualization, funnel and campaign inspection drawer.
- Added Customer 360 next-best-action column.
- Added unified Inbox conversation drawer and Agent reply draft flow.
- Added finance profit bridge and cost-anomaly attention queue.
- Added Agent run trace: context → retrieval → planning → tool calls → approval gate → result.
- Added dedicated Approval Center for high-risk writes.
- Added notification drawer and attention queue.
- Added a production-oriented `admin-app/` based on React + Ant Design 6 + Ant Design Charts.
- Added root scripts: `admin:dev`, `admin:build`, `admin:preview`.
- Added `docs/ADMIN_UX.md`.
- Expanded deployment docs for separate admin frontend deployment.


## 2026-10-05 — Commerce OS v3 / Multi-seller SaaS

- Added multi-tenant seller/store architecture and multi-Shopify OAuth scaffold.
- Added Shopify 2026-10 connector configuration and product/order sync task endpoints.
- Added PayPal server-side checkout/capture/refund/webhook connector.
- Added supplier catalog import, landed-cost calculation and storefront catalog endpoint.
- Added unified order/logistics hub and AfterShip 2026-07 / 17TRACK logistics adapters.
- Added Google/Meta/TikTok/Pinterest/Reddit/LinkedIn/YouTube/X marketing connector registry.
- Added Customer 360, segmentation and recommendation services.
- Added Influencer/Creator and Affiliate data models and SaaS screens.
- Added contribution-margin finance model.
- Added omnichannel Inbox abstraction and messaging connector registry.
- Added approval-gated Agent Ops task center.
- Added UCP, OpenAI ACP feed, MCP tool scaffold and A2A agent-card/delegation endpoints.
- Added Docker deployment and full API credential/deployment documentation.


## 2026-10-05 — Homepage hotspot popup viewport update

- Product popup now stays anchored to the selected hotspot without auto-scrolling the page.
- Default anchor remains hotspot lower-right + 10px.
- Popup content supports independent vertical scrolling.
- When little vertical space remains, the popup becomes shorter rather than moving the browser viewport.
- Added touch momentum scrolling and a stable visible scrollbar area.
- Sticky action/cart controls remain reachable through popup scrolling.
- Horizontal fallback prevents the popup from being clipped on the right edge.
- Scroll/resize keeps the open popup aligned with the selected hotspot while preserving the user's current page position.


## 2026-10-05 — Complete Commerce / Admin Update

### Added — Backend Admin
- 新增 `admin.html` 运营后台。
- Dashboard：
  - 订单总数；
  - 已支付收入；
  - 待确认 Proof；
  - 超过 2 小时的 Proof；
  - Webhook 数量。
- Orders：
  - 搜索；
  - 状态过滤；
  - 订单详情；
  - 商品/材质/定制内容；
  - 状态时间线；
  - 手动推进合法状态。
- Proofing：
  - Proof 列表；
  - 创建/更新 Proof；
  - Proof URL；
  - 客户批准状态。
- Shipments：
  - Carrier；
  - Tracking；
  - ETA；
  - 自动推进 Shipped。
- Audit：
  - 管理动作日志；
  - Webhook 幂等记录。

### Added — Shopify
- 新增真实 Shopify Admin GraphQL Adapter。
- API 版本集中配置，默认 `2026-10`。
- 支持：
  - Shopify Health Check；
  - Orders Sync；
  - Products Check；
  - Order Mapping；
  - Product Mapping；
  - Webhook Registration；
  - Orders Webhook；
  - Fulfillment Webhook；
  - HMAC Verification；
  - Delivery ID Idempotency。
- 新 Shopify Paid Order 导入后自动进入内部 Proofing 流程。
- 内部 Workflow 状态与 Shopify Financial/Fulfillment 状态解耦。

### Added — PayPal
- 新增 PayPal Orders v2 Adapter。
- 服务端：
  - OAuth Access Token；
  - Create Order；
  - Capture；
  - Refund；
  - Webhook Signature Verification；
  - Health Check。
- 前台购物车加入 PayPal Checkout。
- 新增 Checkout 配送/客户信息 Modal。
- 付款前服务端重新计算商品价格。
- 支付完成后：
  - Paid；
  - 自动创建 Proof；
  - 自动进入 Proofing。
- 支持 Return URL 和 Webhook 双路径支付确认。
- 支持 Webhook `CHECKOUT.ORDER.APPROVED` 作为 Capture resilience path。
- 支持后台 PayPal Refund，并要求双重确认。

### Added — Webhook Reliability
- Webhook 处理状态：
  - processing；
  - processed；
  - failed。
- 只有 processed 的 event 才被视为重复完成。
- 失败 Webhook 可以由第三方再次投递并重新处理。
- Shopify 使用 raw body HMAC。
- PayPal 使用 registered Webhook ID 进行 verification。

### Added — Internal Order State Machine
状态：
- Draft
- AwaitingPayment
- Paid
- Proofing
- AwaitingApproval
- Approved
- Production
- Shipped
- Delivered
- DesignIssue
- PaymentIssue
- AddressIssue
- ProductionHold
- ShippingException
- Cancelled
- Refunded

状态跳转统一在 `server/orderState.js`。

### Added — Server Pricing
- 从前端场景目录生成 `server/data/catalog.json`。
- 当前包含 48 个产品。
- 服务端重新计算：
  - Base Price；
  - Material Delta；
  - Quantity Tier；
  - Shipping；
  - Tax；
  - Total。
- 浏览器传来的 total 不作为付款依据。


### Added — Customer Proof Confirmation Loop
- 新增 `proof.html` 客户确认页。
- Proof 进入 AwaitingApproval 时生成随机 approval token。
- 新增公开 API：
  - `GET /api/proofs/public/:token`
  - `POST /api/proofs/public/:token/approve`
- 客户确认后：
  - Proof → Approved
  - Order → Approved
  - 写入审计日志。
- Token 默认 7 天过期。
- 生产环境建议数据库只保存 token hash，而不是明文 token。

### Added — Email Connector
- 新增 `server/connectors/email.js`。
- 支持：
  - SendGrid
  - Postmark
- Admin 创建/发送 Proof 时：
  - 生成客户确认 URL；
  - 发送材质/效果图确认邮件；
  - Email 失败不会错误推进订单；
  - 后台会提示并可复制确认链接。

### Added — Runtime Data / Audit
- `server/store.js`
- `server/data/seed.json`
- 开发环境使用 `runtime.json`。
- 记录：
  - orders
  - events
  - proofs
  - shipments
  - payments
  - webhook events
  - audit logs

### Added — Payment Success
- `payment-success.html`
- 显示：
  - Payment status；
  - Internal order status；
  - Proofing / 2h / 14-day flow。

### Added — Documentation
- `docs/END_TO_END_FLOW.md`
- `docs/SHOPIFY_PAYPAL_SETUP.md`
- `docs/GO_LIVE_CHECKLIST.md`
- `CHANGELOG.md`
- 更新 `.env.example`
- 更新 README


### Added — Security / Privacy Hardening
- 前台不再通过 `express.static(".")` 暴露整个项目目录。
- 服务端只显式提供：
  - index.html
  - admin.html
  - payment-success.html
  - proof.html
  - generated invitation pages
- 默认不开放跨域；只有配置 `ALLOWED_ORIGINS` 时启用 CORS。
- 添加基础安全响应头。
- Payment Create / Agent / Proof Approve 增加基础内存限流。
- 新创建的直接订单生成 `public_status_token`；支付结果页查询订单状态时必须带 access token。
- Cart item / quantity / customization 增加服务端上限。
- 婚礼邀请网站发布改为**服务端安全模板渲染**，不再把浏览器提交的任意 HTML 直接发布到同域名。

### Added — Tests
- `server/selftest.js`
- Catalog / Price / State transition smoke tests。
- package scripts:
  - `npm test`
  - `npm run check`

### Corrected / Gaps Found
- 原项目的 Shopify connector 仅返回 “connector-configured”，未调用真实 API：已补。
- 原项目未实现 PayPal payment lifecycle：已补。
- 原项目价格完全在浏览器：新增服务端 authoritative quote。
- 原项目无 webhook 验签/幂等/重试状态：已补。
- 原项目无后台权限：新增 Bearer admin token。
- 原项目无 Proof SLA dashboard：已补。
- 原项目无退款路径：已补。
- 原项目无支付完成页：已补。
- 原项目无运行时 Audit/Event Store：已补。


### Corrected — Production Data Model
- `server/schema.sql` 将数据库主键 UUID 与用户订单号拆分：
  - `orders.id` = internal UUID
  - `orders.order_number` = POD-2026-xxxxxx
- 新增 `order_items` 不可变商业快照：
  - SKU
  - 商品名
  - 材质
  - quantity
  - base price
  - material delta
  - discount
  - unit price
  - line total
  - customization
  - design file refs
- Order 增加：
  - financial_status
  - customer/shipping snapshot
  - PayPal order/capture id
  - Shopify order GID
  - updated_at

### Still Production Dependencies
以下不是“代码遗漏”，而是需要真实账号/基础设施：
- PostgreSQL；
- 客户认证；
- Shopify App credentials；
- PayPal Live credentials；
- S3/R2 上传；
- Virus scanning；
- Email provider；
- Logistics provider；
- Real tax/shipping quote；
- POD supplier / ERP；
- Vector DB；
- Production-grade queue / DLQ。

## V27
See `CHANGELOG_V27.md`: unified all primary next-step actions under the right-hand card and restored kit `In selection` behavior.
