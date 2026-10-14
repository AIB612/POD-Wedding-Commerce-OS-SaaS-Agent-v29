# Logistics / Shipping Control Center

## What this module does

The Logistics module is a standalone first-level Admin section.

It covers:

1. Carrier / logistics API configuration.
2. Tracking status and shipment timeline.
3. Shipping zones and regional pricing.
4. Shipping fee estimation.
5. Tax mode / estimated tax calculation.
6. Sync of shipping configuration to connected stores.
7. Storefront shipping + tax quote before checkout.
8. Excel / CSV import and export for shipping-zone rules.
9. Connector status / test / webhook configuration.

## Admin workflow

Admin → **物流管理 / Logistics**

### Carrier providers

Supported adapter slots:

- AfterShip Tracking
- AfterShip Shipping
- Shippo
- 17TRACK
- DHL
- UPS
- FedEx

Each provider card can be clicked.

The configuration panel shows:

- configured / missing credential state
- credential fields
- webhook / callback URL
- last connection test
- connector group
- documentation path
- operational notes

Secrets are accepted by the server but are never returned in plain text.

Production recommendation:
store secrets in AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, Vault, or another production credential vault. The local scaffold uses encrypted in-memory metadata for the demo.

## Tracking

Internal shipment records remain the source of truth.

External providers enrich them with:

- carrier
- tracking state
- checkpoint
- ETA
- exception state

API:

- `GET /api/saas/logistics/overview`
- `GET /api/saas/logistics/tracking/:tracking`
- `POST /api/saas/logistics/sync`

Shipment synchronization is a write/operational action and therefore uses the approval gate.

## Shipping zones

The reference data model supports:

- region name
- country list
- currency
- standard base shipping
- standard per-kg cost
- express base shipping
- express per-kg cost
- free-shipping threshold
- tax mode
- tax rate
- active flag

The current project includes demo rules for:

- Switzerland / Liechtenstein
- Germany
- EU
- United Kingdom
- United States / Canada
- Rest of world

These rules are demo configuration, not tax advice.

Tax modes:

- `manual_demo`
- `external_recommended`
- `external_required`

For production taxes, connect an appropriate tax provider or jurisdiction-specific service.

## Storefront quote

Public endpoint:

`POST /api/storefront/shipping/quote`

Input example:

```json
{
  "cart": [
    {
      "sku": "COTTON-PAPER-INVITATION",
      "name": "Cotton Paper Invitation",
      "quantity": 10,
      "material": "珠光纸"
    }
  ],
  "country": "CH",
  "postal_code": "4051",
  "currency": "CNY"
}
```

The server:

1. recalculates the product subtotal;
2. applies material adjustment;
3. applies quantity-tier discount;
4. estimates package weight;
5. selects the shipping region;
6. calculates Standard and Express rates;
7. estimates tax;
8. returns estimated checkout total.

The browser price is therefore not the payment source of truth.

## PayPal checkout

The storefront now calls:

`POST /api/payments/paypal/create`

The server recalculates the cart and shipping/tax quote before attempting to create a PayPal order.

If PayPal credentials are missing, the endpoint returns:

`paypal_not_configured`

plus the safe server-side quote.

## Shopify shipping synchronization

The project exposes:

`POST /api/saas/logistics/sync-stores`

For Shopify, the adapter is designed around:

- Delivery Profiles
- Carrier-calculated rates / DeliveryCarrierService
- shipping permissions
- per-store configuration

Important Shopify requirement:
carrier-calculated service access depends on store eligibility / plan and appropriate shipping permission.

Official Shopify references:

- https://shopify.dev/docs/api/admin-graphql/2026-10/queries/carrierService
- https://shopify.dev/docs/api/admin-graphql/latest/objects/DeliveryCarrierService
- https://shopify.dev/docs/api/admin-graphql/latest/objects/DeliveryProfile

The current project stages / models synchronization. Live mutation execution requires a real OAuth store token and eligible store configuration.

## AfterShip versions

The project targets AfterShip Tracking API `2026-07`.

Official references:

- https://www.aftership.com/docs/tracking/changelog
- https://www.aftership.com/docs/tracking/migration-guide
- https://www.aftership.com/docs/tracking/quickstart/api-quick-start
- https://www.aftership.com/docs/shipping/99f88b084657b-get-rates

## Excel shipping zone management

The Excel template now includes:

`Shipping Zones`

Columns:

- `id`
- `name`
- `countries`
- `currency`
- `standard_base`
- `standard_per_kg`
- `express_base`
- `express_per_kg`
- `free_shipping_threshold`
- `tax_mode`
- `tax_rate`
- `active`

Workflow:

Download template → edit → Admin Data Import / Export → preview → validation → approval → commit → Logistics → sync to stores.

## Production hardening

Before production:

- persist connector configuration to database / secret vault;
- implement provider-specific live test calls;
- verify webhook signatures;
- use retry queues for tracking updates;
- cache carrier-rate requests;
- set quote TTL;
- record store-sync audit logs;
- use provider tax service where required;
- validate Shopify carrier-service eligibility per store;
- never expose logistics credentials to the browser.

## v10 logistics separation and live-configuration workflow

The Admin navigation now separates **订单管理 / Order Management** and **物流管理 / Logistics Management**.

Logistics is responsible for the complete downstream calculation and delivery domain:

`Shipping region → carrier/rate engine → estimated tax → storefront quote → checkout → shipment → tracking → connected-store synchronization`.

### Configurable connector slots

The Connector Center exposes clickable configuration drawers for:

- AfterShip Tracking (`2026-07`)
- AfterShip Shipping
- Shippo
- 17TRACK
- DHL
- UPS
- FedEx
- EasyPost
- ShipStation
- Avalara AvaTax
- Shopify
- PayPal
- marketing / messaging / AI connectors already registered by the project

Each connector detail supports:

- credential field status
- encrypted server-side save boundary
- webhook / callback URL
- enable/disable state
- latest configuration test
- notes
- documentation pointer

A `configured` badge means credentials are present in environment or encrypted tenant config. It does **not** claim that a live provider call has succeeded unless the provider-specific sandbox/live test is implemented and run.

### Regional rule API

- `GET /api/saas/logistics/zones`
- `POST /api/saas/logistics/zones/:id` — approval required

A region can configure Standard / Express base price, per-kg price, free-shipping threshold and tax mode/rate.

### Storefront synchronization

`POST /api/storefront/shipping/quote` now accepts `shipping_method` (`standard` or `express`).

The same method is passed into `POST /api/payments/paypal/create`, so PayPal order amount is generated from the same server-side shipping/tax quote used by the storefront.

The quote response includes:

- `rate_engine`
- `tax_engine`
- `zone`
- `shipping_options`
- `selected_shipping`
- `shipping_amount`
- `tax`
- `grand_total`
- `storefront_sync`

### Shopify behavior

The Shopify adapter is designed to synchronize the same shipping policy into Shopify delivery settings / carrier-calculated-rate integration when the connected store is eligible and the app has the required shipping scope.

Official references checked for this build:

- https://shopify.dev/docs/api/admin-graphql/2026-10/queries/carrierService
- https://shopify.dev/docs/api/storefront/latest/mutations/cartbuyeridentityupdate
- https://shopify.dev/docs/api/storefront/latest/objects/cart
- https://shopify.dev/docs/api/storefront/latest/objects/CartEstimatedCost

The project intentionally treats Shopify checkout as authoritative for the final Shopify checkout amount.

### AfterShip

This build targets AfterShip Tracking API `2026-07` and uses `as-api-key` authentication in the connector.

Official references checked for this build:

- https://www.aftership.com/docs/tracking/changelog
- https://www.aftership.com/docs/tracking/migration-guide
- https://www.aftership.com/docs/tracking/quickstart/api-quick-start


## v10.1 tenant connector execution

Admin connector configuration is now part of the execution path, not only a status registry.

Credential resolution order for logistics/tax:

1. tenant-scoped encrypted Connector Center values;
2. server `.env` fallback;
3. regional/demo rule fallback where applicable.

### Live rate engine

**EasyPost** is implemented as the live rate engine in this build.

Required Connector Center fields:
- `api_key`
- `origin_country`
- `origin_postal`
- optional `origin_city`
- optional `origin_address1`

When configured, the server creates an EasyPost Shipment and uses returned carrier rates. If the provider call fails, the quote falls back to Shipping Zone rules and returns `live_rate_error`.

Other configured logistics providers remain visible as adapter slots; a configured badge does not imply that their rate/label endpoint has been implemented.

### Live tax engine

**Avalara AvaTax** is implemented as an optional live tax estimator.

Required:
- `account_id`
- `license_key`
- shipping origin country/postal

The server sends an uncommitted `SalesOrder` tax estimate. If the call fails, the storefront keeps using the regional tax fallback and returns `live_tax_error`.

### Shopify CarrierService registration

When syncing shipping to a connected Shopify store, the backend attempts a real `carrierServiceCreate` only when all are true:

- store has an OAuth access token;
- granted scopes include `write_shipping`;
- `PUBLIC_BASE_URL` is a public URL rather than localhost;
- store is eligible for carrier-calculated shipping.

The callback is registered as:

`POST /api/shopify/carrier-rates/:storeId?secret=<per-store-secret>`

The callback converts the Shopify cart/destination request to the same server shipping quote engine and returns stable Standard / Express carrier-service codes.

If live registration cannot be performed, the store-sync result is **staged**, not falsely reported as live.

Shopify tax remains native-checkout authoritative. Internal/Avalara tax estimates are used for this project's own storefront and planning; they do not overwrite Shopify's native tax configuration.

### Storefront quote response

Important diagnostics:
- `rate_engine`: `regional_rules` or the active live adapter such as `easypost`;
- `tax_engine`: `regional_rules` or `avalara`;
- `live_rate_error`: populated when a live rate provider failed and fallback was used;
- `live_tax_error`: populated when tax provider failed and fallback was used;
- `shipping_options`: Standard / Express choices;
- `grand_total`: subtotal + selected shipping + estimated tax.
