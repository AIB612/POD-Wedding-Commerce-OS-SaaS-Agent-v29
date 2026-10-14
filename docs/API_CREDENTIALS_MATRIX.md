# API 凭证矩阵

| 系统 | `.env` 变量 | 多租户生产存储 | 用途 |
|---|---|---|---|
| Shopify App | `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` | App-level Secret Manager | 多店 OAuth |
| Shopify Store Token | OAuth 回调产生 | `stores.encrypted_access_token` + KMS | 每个卖家店铺 Admin API |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | Platform Secret / seller connection | Create/Capture/Refund/Webhook |
| Google Ads | `GOOGLE_ADS_*` | ad_accounts connection | Campaign/reporting |
| Meta | `META_*` | ad_accounts connection | Marketing/Insights/Conversions |
| TikTok | `TIKTOK_*` | ad_accounts/social connections | Ads/Organic/TikTok One |
| Pinterest | `PINTEREST_*` | ad_accounts connection | Catalog/Ads/Analytics |
| Reddit | `REDDIT_ADS_*` | ad_accounts connection | Ads v3/Reporting/Forecast |
| LinkedIn | `LINKEDIN_*` | ad_accounts/social connections | Advertising/Community/Leads |
| YouTube | `YOUTUBE_*` | social connections | Data/Analytics |
| AfterShip | `AFTERSHIP_API_KEY` | tenant logistics connection | Tracking 2026-07 |
| 17TRACK | `TRACK17_API_KEY` | tenant logistics connection | Multi-carrier tracking |
| LLM | `OPENAI_*` / `ANTHROPIC_*` / `GEMINI_*` | tenant or platform secret | Agent reasoning |

开发环境可以使用 env fallback；**SaaS 多卖家正式环境不要把所有卖家的 OAuth token 放进同一个 `.env`**。卖家连接必须进入 tenant-scoped encrypted connection table。


## Logistics / tax

| Connector | Server environment variables | Admin configuration |
|---|---|---|
| AfterShip Tracking | `AFTERSHIP_API_KEY`, `AFTERSHIP_WEBHOOK_SECRET` | Logistics / API page |
| AfterShip Shipping | `AFTERSHIP_SHIPPING_API_KEY` | Logistics / API page |
| Shippo | `SHIPPO_API_KEY` | Logistics / API page |
| 17TRACK | `TRACK17_API_KEY` | Logistics / API page |
| DHL | `DHL_API_KEY`, `DHL_ACCOUNT_NUMBER` | Logistics / API page |
| UPS | `UPS_CLIENT_ID`, `UPS_CLIENT_SECRET` | Logistics / API page |
| FedEx | `FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET` | Logistics / API page |
| Avalara | `AVALARA_ACCOUNT_ID`, `AVALARA_LICENSE_KEY`, `AVALARA_COMPANY_CODE` | API page |

Secrets are never returned by the configuration status API.

## v10 Logistics / Tax connector fields

| Connector | Environment variables | Admin configurable |
| --- | --- | --- |
| AfterShip Tracking | `AFTERSHIP_API_KEY`, `AFTERSHIP_WEBHOOK_SECRET` | Yes |
| AfterShip Shipping | `AFTERSHIP_SHIPPING_API_KEY` | Yes |
| Shippo | `SHIPPO_API_KEY` | Yes |
| 17TRACK | `TRACK17_API_KEY` | Yes |
| DHL | `DHL_API_KEY`, `DHL_ACCOUNT_NUMBER` | Yes |
| UPS | `UPS_CLIENT_ID`, `UPS_CLIENT_SECRET` | Yes |
| FedEx | `FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET`, `FEDEX_ACCOUNT_NUMBER` | Yes |
| EasyPost | `EASYPOST_API_KEY` | Yes |
| ShipStation | `SHIPSTATION_API_KEY`, `SHIPSTATION_API_SECRET` | Yes |
| Avalara AvaTax | `AVALARA_ACCOUNT_ID`, `AVALARA_LICENSE_KEY`, `AVALARA_COMPANY_CODE` | Yes |

Admin path: **API / 协议 → click connector card → Configure / Status**.

Production recommendation: use the UI only as a tenant configuration surface; persist the actual secret material in a real vault/KMS instead of browser storage.


### Shared shipping-origin fields

Live rate/tax adapters may need the fulfillment origin:

```env
SHIPPING_ORIGIN_COUNTRY=CH
SHIPPING_ORIGIN_POSTAL=4051
SHIPPING_ORIGIN_CITY=Basel
SHIPPING_ORIGIN_ADDRESS1=
AVALARA_ENV=sandbox
```

These can also be entered per tenant in the Connector Center for the EasyPost/Avalara adapters. Tenant Connector Center values take precedence over `.env` for the logistics execution path.

Status semantics:
- `configured`: required credential fields are present;
- `configuration_ready`: credential presence test passed;
- this is not the same as a successful live provider call unless the adapter explicitly executes one.
