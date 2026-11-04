# Current API references

> Updated 2026-11-01 (main after 620ba20). The first list shows which external APIs the **live** site actually calls;
> the lists below it are references for adapters that exist in code but are not configured in production
> (see `API_CREDENTIALS_MATRIX.md`). Agent behaviour: [`POD.AI-Agent-标准文档.txt`](POD.AI-Agent-标准文档.txt).

## Used by the live site (https://wed.swisspro.site)

| Service | Endpoint used in code | Code |
|---|---|---|
| YunExpress 云途 Open API | `https://openapi.yunexpress.cn` (sandbox `https://openapi-sbx.yunexpress.cn`); docs https://open.yunexpress.cn/openApi/doc | `server/logistics/yunexpress.js` |
| 4PX 递四方 Open Platform | `https://open.4px.com/router/api/service` (test `https://open-test.4px.com/router/api/service`) | `server/logistics/fourpx.js` |
| SendGrid Mail Send v3 | `https://api.sendgrid.com/v3/mail/send` | `server/services/email-service.js` |
| Shopify Admin API (app) | OAuth + GraphQL, version `SHOPIFY_ADMIN_API_VERSION` (default `2025-10`) | `server/shopify/app.js` |
| Google OAuth / OIDC | customer quick login | `server/services/oauth-login-service.js` |
| FX rates (key-less) | `https://open.er-api.com/v6/latest/CHF`, fallback `https://api.frankfurter.dev/v1/latest?base=CHF`; on startup and daily | `server/services/fx-service.js` |

Not called in production: PayPal (not configured), TWINT (skeleton), LLM providers (no key; chat agent runs in rules mode),
EasyPost, Avalara, AfterShip, 17TRACK, marketing / social APIs.

## Reference list verified 2026-10-05

- Shopify 2026-10 release: https://shopify.dev/changelog/release-notes/2026-10
- Shopify Catalog / UCP MCP: https://shopify.dev/docs/agents/catalog
- Shopify Spring '26 Agentic Commerce: https://www.shopify.com/news/spring-26-edition-dev
- Google UCP: https://developers.google.com/merchant/ucp
- UCP: https://ucp.dev/
- OpenAI Agentic Commerce Protocol: https://developers.openai.com/commerce
- A2A: https://a2a-protocol.org/
- MCP: https://modelcontextprotocol.io/
- Google Ads API: https://developers.google.com/google-ads/api/docs/get-started/introduction
- TikTok API for Business: https://business-api.tiktok.com/portal/docs/marketing-api/v2.0
- Pinterest Ads/API: https://developers.pinterest.com/docs/work-with-ads/ads-overview/
- Reddit Ads API v3: https://ads-api.reddit.com/docs/v3/
- LinkedIn Marketing API: https://learn.microsoft.com/en-us/linkedin/marketing/
- YouTube Analytics: https://developers.google.com/youtube/analytics/reference

Versions and platform permissions change. Keep provider adapters versioned and review quarterly.


## Shipping / tax references checked 2026-10-05

- Shopify GraphQL `carrierServiceCreate`: https://shopify.dev/docs/api/admin-graphql/latest/mutations/carrierServiceCreate
- Shopify DeliveryCarrierService 2026-10: https://shopify.dev/docs/api/admin-graphql/2026-10/queries/carrierService
- AfterShip Tracking changelog / 2026-07: https://www.aftership.com/docs/tracking/changelog
- AfterShip Shipping rate calculation: https://www.aftership.com/docs/shipping/f4353677b8ac1-calculate-rates
- EasyPost Shipment / Rates: https://docs.easypost.com/docs/shipments and https://docs.easypost.com/docs/shipments/rates
- Avalara AvaTax CreateTransaction: https://developer.avalara.com/api-reference/avatax/rest/v2/methods/Transactions/CreateTransaction/
