# 部署与 API 配置

## 推荐生产拓扑

### 方案 A：中小规模 SaaS
- Frontend + API: Railway / Render / Fly.io / AWS App Runner
- PostgreSQL: Supabase / Neon / RDS
- Redis/Queue: Upstash / Redis Cloud
- Object Storage: Cloudflare R2 / S3
- CDN/DNS: Cloudflare
- Secrets: 平台 Secrets + AWS KMS/Secrets Manager

### 方案 B：规模化
- Web/API: AWS ECS/Fargate 或 Kubernetes
- PostgreSQL: RDS/Aurora PostgreSQL
- Redis: ElastiCache
- Queue/Event Bus: SQS + EventBridge / Kafka
- Storage/CDN: S3 + CloudFront
- Analytics Warehouse: BigQuery / Snowflake / ClickHouse

## Docker

```bash
docker build -t wedding-commerce-os .
docker run --env-file .env -p 3000:3000 \
  -v wcos-data:/app/var -v wcos-sites:/app/generated \
  wedding-commerce-os
```

镜像会自动构建 React 后台（`/admin-app/`），以非 root 用户运行，并带健康检查。`docker compose up` 已配置好同样的数据卷。

### 生产上线前必须设置

- `NODE_ENV=production`
- `ADMIN_API_KEY`、`APP_ENCRYPTION_KEY`：随机生成（≥32 字符）。缺失或仍为示例值时服务拒绝启动。
- `PUBLIC_BASE_URL`：对外访问地址，用于 Shopify OAuth 与 PayPal 回跳。
- 反向代理 / 负载均衡之后：`TRUST_PROXY=true`，限流才能识别真实客户端 IP。
- 需要跨域调用 API 时设置 `CORS_ORIGINS`。
- 内置限流和文件持久化只适用于单实例；多实例部署请改用 Redis 限流和 PostgreSQL。

## Shopify 配置步骤

1. Shopify Dev Dashboard 创建 App。
2. Allowed redirection URL 添加：
   `https://YOUR_DOMAIN/api/shopify/oauth/callback`
3. `.env` 填 `SHOPIFY_CLIENT_ID`、`SHOPIFY_CLIENT_SECRET`。
4. 后台 `/admin.html` → 店铺 → 连接 Shopify。
5. OAuth 后 token 按店铺保存；生产应加密存 PostgreSQL/KMS。
6. 注册 Webhook 到：`https://YOUR_DOMAIN/api/webhooks/shopify`。
7. 每季度审查 `SHOPIFY_API_VERSION`。

当前代码默认 `2026-10`。Shopify API 版本必须显式设置，避免未来版本自动 fall-forward 造成行为变化。

## PayPal

1. PayPal Developer Dashboard 创建 Sandbox App。
2. `.env` 填 Client ID / Secret。
3. 创建 Webhook 并订阅 checkout/payment/refund 事件。
4. Webhook 地址：`https://YOUR_DOMAIN/api/webhooks/paypal`。
5. 将 Webhook ID 填入 `PAYPAL_WEBHOOK_ID`。
6. Sandbox E2E 通过后将 `PAYPAL_ENV=live` 并替换 Live credentials。

## 营销平台

每个平台最好使用 OAuth + tenant/store/ad_account 表保存 connection，不要让多卖家共享一个个人 access token。

- Google Ads：Developer Token + OAuth refresh token + manager/customer id
- Meta：App + System User/OAuth + Business/ad account permissions
- TikTok：Business developer app + advertiser authorization
- Pinterest：Business account OAuth
- Reddit：Ads API OAuth/System User（视当前可用功能）
- LinkedIn：Marketing products/application approval
- YouTube：OAuth；Analytics 只对授权频道

## 环境变量

查看根目录 `.env.example`。所有 Key 的位置都已经写明。

## 多租户安全

正式数据库：
- 每张业务表带 tenant_id
- RLS 或 server-side tenant filter
- store token / payout data 加密
- audit_logs 记录 Agent 和人工写操作
- OAuth state 必须持久化并 TTL
- webhook delivery id 幂等
- webhook raw body 验签
- 后台接真正 RBAC/SSO；示例 `x-admin-api-key` 仅开发使用


## Admin 前端部署

### 方案 A：零构建 Admin

`admin.html` 由现有 Node 服务直接提供。

适合：
- 内部测试；
- 无前端构建流程；
- 快速接入。

### 方案 B：React + Ant Design Admin（推荐生产）

```bash
cd admin-app
npm install
npm run build
```

将 `admin-app/dist` 部署到：
- 同一 Node/Express 服务 `/admin-app/`
- 或 Vercel / Cloudflare Pages / Netlify / S3 + CDN

生产环境建议：
- `https://admin.your-domain.com`
- API：`https://api.your-domain.com`

Vite 环境变量建议：

```env
VITE_API_BASE_URL=https://api.your-domain.com
```

不要把：
- Shopify client secret
- PayPal secret
- Admin API secret
- Marketing refresh token

放进 Vite / 浏览器环境变量。
这些只能放服务端 Secret Manager。


## Logistics / Shipping credentials

Server-only variables:

```env
AFTERSHIP_API_KEY=
AFTERSHIP_WEBHOOK_SECRET=
AFTERSHIP_SHIPPING_API_KEY=
SHIPPO_API_KEY=
TRACK17_API_KEY=
DHL_API_KEY=
DHL_ACCOUNT_NUMBER=
UPS_CLIENT_ID=
UPS_CLIENT_SECRET=
FEDEX_CLIENT_ID=
FEDEX_CLIENT_SECRET=

AVALARA_ACCOUNT_ID=
AVALARA_LICENSE_KEY=
AVALARA_COMPANY_CODE=
```

Do not put these values in Vite/browser environment variables.

Admin configuration flow:

`API / 协议` or `物流管理`
→ click connector
→ configure
→ test
→ save
→ review current status.

Production should persist credentials to a Secret Manager / encrypted credential store rather than an in-memory process.

## v10 logistics credentials

Optional logistics/tax secrets can be set in `.env` or your production secret manager:

```env
AFTERSHIP_API_KEY=
AFTERSHIP_WEBHOOK_SECRET=
AFTERSHIP_SHIPPING_API_KEY=
SHIPPO_API_KEY=
TRACK17_API_KEY=
EASYPOST_API_KEY=
SHIPSTATION_API_KEY=
SHIPSTATION_API_SECRET=
DHL_API_KEY=
DHL_ACCOUNT_NUMBER=
UPS_CLIENT_ID=
UPS_CLIENT_SECRET=
FEDEX_CLIENT_ID=
FEDEX_CLIENT_SECRET=
FEDEX_ACCOUNT_NUMBER=
AVALARA_ACCOUNT_ID=
AVALARA_LICENSE_KEY=
AVALARA_COMPANY_CODE=
```

You can also enter tenant connector values from **Admin → API / 协议**. For production, the API should store secret material in a secret vault and persist only references / encrypted envelopes in the application database.


## Logistics production deployment v10

1. Set a public HTTPS `PUBLIC_BASE_URL`.
2. Add `write_shipping` to `SHOPIFY_SCOPES` before seller OAuth so eligible stores can register CarrierService.
3. Configure logistics/tax credentials either:
   - in Admin → API / 协议 (tenant-scoped), or
   - in the server secret environment as fallback.
4. Configure fulfillment origin for live rating/tax calculation.
5. Open Admin → 物流管理:
   - test quote by region;
   - verify tracking timeline;
   - inspect Shipping Zones;
   - run “同步到所有网店”.
6. Shopify store-sync status meanings:
   - `registered`: live CarrierService registered;
   - `staged`: missing OAuth token / `write_shipping` / public callback eligibility;
   - `error`: Shopify API registration failed;
   - non-Shopify channels use their own adapter boundary.
7. Use Shopify Sandbox/development store or an eligible plan when validating carrier-calculated rates.

Do not put carrier/tax API secrets in the frontend bundle or Excel templates.
