# POD Studio — scenario → design → pricing → delivery, in one place

Entry: **✦ POD 工作室 / POD Studio** in the storefront header → `studio.html`. The wedding shop is unchanged.

## 1. Role & shop (top right)
- **Role selector** in the header: Merchant / seller · Company / team · Individual / event. It drives quantities, pricing,
  delivery, the final action and the scenario order; switch any time.
- **Merchants: connect a shop** (🔗 in the header, or at the end in *Review → Publish to*): Shopify (store domain) or
  WooCommerce (https shop URL). Several shops can be connected; choose the target in Review or "connect later".
  - Default (`STUDIO_PUBLIC_CONNECT` unset): the connection is *requested* — an admin task is created; no secrets are collected.
  - `STUDIO_PUBLIC_CONNECT=true` (only once merchants are signed in): official flows — Shopify OAuth (app credentials in
    `.env`), WooCommerce `/wc-auth/v1/authorize` (keys are posted to `/api/studio/connections/woocommerce/callback`,
    stored encrypted, single use, 30 min). Returning from authorisation brings the merchant back to the studio.
  - Opened from disk: shops are saved locally as "pending" until the server is used.

## 2. Layout
- **Left:** navigation — *Scenario kits*, *All products*, *My selection · Studio* — and the selection list.
- **Scenario kits:** every scenario as a card in the centre; clicking one shows its kits in the right column
  (price per set / at kit quantity, product list, details, *Design with this kit*, large *Add to selection*).
- **All products:** searchable, filterable grid in the centre; the summary stays on the right.
- **My selection · Studio:** the design studio below (centre), summary on the right.

## 3. Design studio (no forced order)
Left: **my selection** — add / remove products, quantities (company & individual), per-person quantities
(company, ship to each recipient) or *on demand* (merchant). Centre: free tabs. Right: live summary per buyer type.

| Tab | Merchant | Company | Individual |
|---|---|---|---|
| Design | upload once or text / monogram → auto-placement on every print area, editor per product (fit / fill / pattern, scale, position, colour, reset, apply to similar), print-resolution check, PNG mockups | same | same |
| Pricing | margin slider → base price per order, suggested retail, market ceiling, profit per sale | unit price at current quantity, next price tier hint, products + delivery total | same as company |
| Delivery | **print-on-demand**: per-order shipping & days to CH / EU / US (to set shop shipping rates), sample order, shop connection | **one address** (consolidated per facility) or **each recipient** (paste / upload a list: name, country, size → parcels, cost per region, unsupported countries, sizes from the list); needed-by date check | event date → earliest delivery and latest order date |
| Packaging | white-label brand name, thank-you card, seal sticker, neck label + preview | same | same |
| Review | checklist (design, resolution, margin) + "order samples & connect shop" | checklist (sizes, recipients, date) + "request a quote" (VAT ID) | checklist + "request order" |

## 4. Numbers (shared browser / server code: `studio-pricing.js`)
- `quote()` — product base price per unit (quantity tiers, cross-border handling, packaging extras), retail at the
  target margin, market ceiling.
- `fulfillment()` — delivery: `dropship` (per order + sample), `bulk` (one parcel per facility), `multi`
  (one parcel per recipient and facility). Rates per facility region → destination region (CH / EU / US) and weight.
- `deliveryDate()` — business days incl. a proof-approval buffer.
The server recomputes everything for saved projects and quote requests. A quote request creates an order
(`Quote requested`, payment pending → not revenue) with buyer type, delivery summary, sizes and VAT ID, plus a design proof.
Share links never include contact data or recipient names (only countries / sizes).

## 5. Data
`server/data/studio-catalog.json` (products, print areas, weights, sizes, colours, costs, ceilings, facilities, shipping
rates, buyer types, scenarios). After editing run `npm run build:studio-data`; `npm run test:studio` fails if
`studio-data.js` is out of date. **Costs, rates and FX are demo values** — replace with supplier quotes before launch.

## 6. Product images
- **Standardised product images for all 57 products:** blank / white-label, same studio backdrop, light and framing.
  They are **original procedural renders** produced by `scripts/generate_mockups.py` (no AI model is used here). Each product has three files in
  `assets/mockups/`: base image, mask (recolouring keeps the shading) and shade map (the design is multiplied with it,
  so it follows folds and curvature). Regenerate with `npm run mockups:generate` (Python: numpy, pillow, scipy).
- **AI or photographed images:** follow `docs/MOCKUP_PROMPTS.md` (shared style + one prompt per product) and import
  with `scripts/import_mockup.py <id> <image>` — mask and shade map are created automatically.
- **Offline:** when `studio.html` is opened from disk, the images come from `studio-mockup-assets.js` (embedded
  copies); images loaded from disk would block PNG downloads. Served over http they load from `assets/mockups/`.
- **Your own photos:** set `mockup_photo` on a product: `{"src": "...jpg", "mask": "...png" (alpha = product),
  "shade": "...png" (grey, white = no change), "area": [x, y, w, h] in percent}`. Use only photos you own or are
  licensed to use — not product images taken from other platforms (also not "modified" copies of them).


## 7. Scenes shared with the storefront
`scripts/build_scenes.py` makes the storefront scenes (index.html `sceneData`) the single source for the wedding
scenes of the studio (products, materials) and renders scene images for scenes without a photo. Run it after
changing storefront scenes or products, then `npm run build:studio-data`. `npm run test:studio` fails if the lists differ.

## 8. Privacy
Designs uploaded to the server are encrypted with AES-256-GCM (key from `APP_ENCRYPTION_KEY`) and stored outside the
public folder; they are served decrypted only through the project URL. Projects expire after `STUDIO_RETENTION_DAYS`
(30) or `STUDIO_QUOTE_RETENTION_DAYS` (90) after a quote request and are deleted automatically with their files.

## 9. Languages
No external translation plugin is used: the storefront and admin use the dictionary in `i18n.js`, the studio its own
dictionary. English is the default until a visitor chooses a language (shared across pages).
