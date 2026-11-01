# API 凭证矩阵

> 更新：2026-11-01（对应 620ba20 之后的 main）。第一节是代码实际读取的变量与线上配置情况（只列名称，不含任何值）；
> 后面的矩阵是早期整理的连接器清单，其中营销 / 社媒 / AfterShip 等适配位在线上均未配置。

## 当前代码与线上状态（2026-11-01 核对）

| 用途 | 变量（服务器 `.env`） | 线上 | 读取位置 |
|---|---|---|---|
| 基础 / 安全 | `NODE_ENV`、`PUBLIC_BASE_URL`、`ADMIN_API_KEY`、`APP_ENCRYPTION_KEY`（≥32 字符，加密连接器凭证）、`SESSION_SECRET` | 已设置 | `server/config.js`、`server/utils/crypto.js` |
| 后台登录 | `ADMIN_PASSWORD_HASH`（scrypt；可选 `ADMIN_USERNAME`、`ADMIN_SESSION_TTL_HOURS`、`ADMIN_AUTH_PATH`） | 已设置 | `server/admin-auth.js` |
| 存储 | `STORE_PERSIST_PATH`、`LOGISTICS_STATE_PATH`、`SQLITE_PATH` / `DATABASE_URL` | `STORE_PERSIST_PATH` 已设置；无 `DATABASE_URL`（SQLite） | `server/saas-store.js`、`server/db/index.js` |
| 顾客登录 Google | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`（可选 `GOOGLE_REDIRECT_URI`） | 已配置 | `oauth-login-service.js`（见 `quick-login.md`） |
| 顾客登录 Shop | `SHOPIFY_SHOP_DOMAIN`、`SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_ID`（+ `_SECRET`、`_REDIRECT_URI`） | 未配置 | 同上 |
| Shopify App | `SHOPIFY_API_KEY`、`SHOPIFY_API_SECRET`（回退 `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`）、`SHOPIFY_SCOPES`、`SHOPIFY_ADMIN_API_VERSION` | 已配置，1 店已连接 | `server/shopify/app.js` |
| Shopify 旧多店 OAuth | `SHOPIFY_CLIENT_ID`、`SHOPIFY_CLIENT_SECRET`、`SHOPIFY_REDIRECT_URI`、`SHOPIFY_API_VERSION` | 未配置 | `server/connectors/shopify-multistore.js` |
| PayPal | `PAYPAL_CLIENT_ID`、`PAYPAL_CLIENT_SECRET`、`PAYPAL_WEBHOOK_ID`、`PAYPAL_ENV`、`PAYPAL_RETURN_URL` / `PAYPAL_CANCEL_URL` | 未配置 | `server/connectors/paypal.js` |
| TWINT | `TWINT_STORE_UUID`、`TWINT_CASH_REGISTER_ID`、`TWINT_CERT_PATH`、`TWINT_CERT_PASSWORD`、`TWINT_ENV`、`TWINT_ENDPOINT` | 未配置（代码为骨架） | `server/connectors/twint.js` |
| 邮件 | `SENDGRID_API_KEY` 或 `POSTMARK_SERVER_TOKEN` 或 `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`；`FROM_EMAIL`、`FROM_NAME` | SendGrid 已配置 | `email-service.js`、`smtp.js` |
| 承运商 | `LOGISTICS_ENABLED`、`YUNEXPRESS_APP_ID` / `_APP_SECRET`（+ `YUNEXPRESS_PROD_*`）、`FOURPX_APP_KEY` / `_APP_SECRET`、`SHIPPING_ORIGIN_*`、`IOSS_NO` | 已启用并配置 | `server/logistics/*`（见 `LOGISTICS.md`） |
| LLM | `LLM_PROVIDER` + `OPENAI_*` / `ANTHROPIC_*` / `GEMINI_*` / `DEEPSEEK_*` / `XAI_*`、`LLM_TIMEOUT_MS` | 未配置 → 客户聊天 Agent 规则模式 | `pod-agent/customer/llm.js`、`connectors/llm.js`、`pod-agent/ai.js` |
| 实时运费 / 税 | `EASYPOST_API_KEY`、`AVALARA_*` | 未配置 | `shipping-service.js`、`connector-config-service.js` |

规则：
- 真实值只在服务器 `.env`（不入库，`.gitignore`）；仓库只有 `.env.example`。
- 连接器中心（Admin → API / 协议）保存的凭证用 `APP_ENCRYPTION_KEY` 加密存入 `connector_configs`，状态接口不回显密钥。
- `/api/pod-agent/status` 只返回模式与代码常量，不返回密钥名称。

---

## 早期连接器矩阵（参考）

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
| LLM | `LLM_PROVIDER`、`OPENAI_*` / `ANTHROPIC_*` / `GEMINI_*` / `DEEPSEEK_*` / `XAI_*` | platform secret | 客户聊天 Agent（可选）与旧入口 |

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
