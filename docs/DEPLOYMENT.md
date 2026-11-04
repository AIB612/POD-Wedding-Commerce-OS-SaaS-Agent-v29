# 部署与 API 配置

> 更新：2026-11-01（对应 620ba20 之后的 main）。第一节是**当前生产部署**；后面的拓扑、Docker、Render 为备选方案，线上未使用。

## 当前生产部署（https://wed.swisspro.site）

| 项 | 值 |
|---|---|
| 主机 | cPanel 共享主机，CloudLinux Node.js Selector（Phusion Passenger / LiteSpeed） |
| Node | 22（`~/nodevenv/pod-wedding/22`；`package.json` 要求 ≥ 20） |
| 应用目录 | `~/pod-wedding`（git 工作副本，跟踪 `main`） |
| 启动文件 | `server/cpanel-start.cjs`（CommonJS 包装，`import("./app.js")`） |
| 域名配置 | `~/wed.swisspro.site/.htaccess`：`PassengerAppRoot`、`PassengerNodejs`、`PassengerStartupFile` |
| 环境变量 | `~/pod-wedding/.env`（`dotenv` 读取，不入库；模板 `.env.example`） |
| 数据 | `~/pod-wedding/data/`：`store.json`、`logistics-state.json`、`app.db`、`admin-auth.json`、`labels/`（不入库） |
| 日志 | `~/pod-wedding/stderr.log` |

### 发布流程（标准）

1. 本地提交到 `feature/home-en-images`，`git pull --rebase`，`git push`（不强推）。
2. 快进 `main`：`git push origin feature/home-en-images:main`。
3. 服务器拉取并重启（在能 SSH 的机器上执行）：

```bash
ssh -p 1988 dropking@rs8-fra.serverhostgroup.com 'cd ~/pod-wedding && git pull && cloudlinux-selector restart --json --interpreter nodejs --app-root pod-wedding'
```

不要在服务器上用 `npm start` / `node server/app.js` 直接启动生产：进程由 Passenger 管理，重启只用 `cloudlinux-selector restart`。
依赖变化时先在 Node Selector 的虚拟环境里执行 `npm ci`（或 cPanel “Run NPM Install”）。

4. 发布后检查：`/`、`/agent.html`、`/api/health` 返回 200；`/api/pod-agent/status`；
   `POST /api/storefront/shipping/quote`（`{"country":"CH","currency":"CHF","cart":[{"product_id":"invitation","quantity":10}]}`）
   标准 / 快递运费不变（2026-11-01：CHF 6.34 / 13.15）；首页 “Ask POD.AI” 可打开。
5. 涉及 Agent 的改动同步更新 `docs/POD.AI-Agent-标准文档.txt` 修订记录。

### 生产环境变量（名称，值只在服务器 `.env`）

`NODE_ENV=production`、`PUBLIC_BASE_URL`、`ADMIN_API_KEY`、`APP_ENCRYPTION_KEY`、`ADMIN_PASSWORD_HASH`、`SESSION_SECRET`、
`STORE_PERSIST_PATH=./data/store.json`、`LOGISTICS_ENABLED=true`、YunExpress / 4PX 凭证、`SHIPPING_ORIGIN_*`、
`SENDGRID_API_KEY` + `FROM_EMAIL` / `FROM_NAME`、`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`、`SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`。
未设置：PayPal、TWINT、LLM 密钥、Shop 登录、`DATABASE_URL`（因此 Shopify 表用 SQLite `data/app.db`）。完整清单见 `API_CREDENTIALS_MATRIX.md`。

### 后台登录密码

`/admin/login` 校验 `ADMIN_PASSWORD_HASH`（scrypt，格式 `scrypt:N:r:p:salt:hash`）；在后台改密码后以 `data/admin-auth.json` 为准。生成哈希：

```bash
node -e 'import("./server/admin-auth.js").then(m => console.log(m.hashPassword(process.argv[1])))' '<新密码>'
```

`ADMIN_API_KEY`（请求头 `x-admin-api-key`）供脚本调用；会话 cookie `wcos_admin` 默认 12 小时（`ADMIN_SESSION_TTL_HOURS`）。

### 备份

单实例、文件存储：定期复制 `data/` 目录（尤其 `store.json`、`logistics-state.json`、`app.db`、`admin-auth.json`）和 `.env`。

---

## 扩展方案（未使用）

仓库里的 `render.yaml`、`Dockerfile`、`docker-compose.yml` 是早期 / 备选配置；生产已不在 Render 上运行（旧地址 wed-swisspro.onrender.com 不再是生产）。


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

## Docker（备选，线上未使用）

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

线上使用 Shopify App（`shopify.app.toml`，`application_url = https://wed.swisspro.site`，回调 `/api/shopify/app/callback`，`.env` 填 `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET`），在 Admin → Shopify 分区连接店铺（`/api/shopify/app/status`、`/api/shopify/app/connect`）。以下是旧的多店 OAuth 流程（`/api/shopify/oauth/*`，仍保留）：

1. Shopify Dev Dashboard 创建 App。
2. Allowed redirection URL 添加：
   `https://YOUR_DOMAIN/api/shopify/oauth/callback`
3. `.env` 填 `SHOPIFY_CLIENT_ID`、`SHOPIFY_CLIENT_SECRET`。
4. 后台 `/admin` → 店铺中心 → 连接 Shopify。
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
- 后台接真正 RBAC/SSO；当前为单一管理员密码登录（`/admin/login`）+ 脚本用 `x-admin-api-key`


## Admin 前端部署

### 方案 A：零构建 Admin（线上使用）

`admin.html` 由现有 Node 服务直接提供（`/admin`，需先在 `/admin/login` 登录）。

适合：
- 内部测试；
- 无前端构建流程；
- 快速接入。

### 方案 B：React + Ant Design Admin（未部署；线上 `/admin-app/` 返回 404）

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
