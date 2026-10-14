# V29 Account → Order → Proof → Production Sync

本版重点补齐客户账号与 Request order 后的完整闭环，同时保持既有 Studio 的 Design / Pricing / Delivery / Packaging / Review 组件不变。

核心流程：`首页开始设计 → 快捷登录/账号注册 → Studio → Request order → 自动创建订单/Proof/Admin Task → 自动确认邮件 → Admin 上传 Proof → 客户确认或请求修改 → Approved → Production → Shipped → Delivered`。客户可在 `account.html` 查看方案、订单、Proof、事件与邮件状态；Admin 的 `Studio / 账号` 页面同步用户、方案、Studio 订单、Proof 状态、订单事件、邀请页面和通知。

> 真正的邮件发送需要在 `.env` 配置 `SENDGRID_API_KEY` 或 `POSTMARK_SERVER_TOKEN` 以及可用的 `FROM_EMAIL`。未配置时，开发环境仍完整记录 notification，但状态为 `not_configured`，不会假装邮件已送达。

## V29 快速运行

```bash
cp .env.example .env
npm install
npm start
```

打开 `http://localhost:3000/`。登录、Request order、账号页和 Admin 数据同步都需要通过后端运行，不能只用 `file://`。

---


# Wedding Commerce OS v4.0（v23 · 场景统一 · 材质 · 隐私）

## POD Studio：场景到设计一站式

首页顶部的 **✦ POD 工作室** 进入 `studio.html`：在右上角选择身份（商家 / 企业 / 个人；商家可绑定 Shopify 或 WooCommerce 店铺，也可在最后确认时再选），按场景查看每个套装里有哪些商品（或自由挑选全部商品），左侧导航包含「场景套装 · 全部商品 · 我的方案·设计工作室」：点击场景后右侧显示它的套装并可一键加入方案，工作室内自由切换「设计 · 定价 · 寄送 · 包装 · 确认」。寄送支持商家按单代发、企业一次寄到一个地址或按名单分别寄给每个人（含尺码）、个人按活动日期倒推下单时间。直接打开文件即可使用；启动服务后可保存分享链接并提交询价。全部 57 款商品使用统一标准的白牌商品图；如需换成 AI 生成或实拍图，见 `docs/MOCKUP_PROMPTS.md`。首页与工作室使用同一套 12 个场景（婚礼风格 + 工作室场景），材质可在详情和设计编辑器中选择；上传的设计加密存储并自动删除；默认英文，语言切换为下拉菜单。详见 `docs/POD_STUDIO.md`。

这是从现有婚礼 POD 前端扩展出来的 **多租户电商 SaaS + Agent 一站式运营系统**。

业务链路：

`消费者前端 → Shopify/其他卖家店铺 → SaaS 统一订单/物流/商品/成本 → 营销/财务/联盟/Creator → Agent 会话与任务编排`

## 立即运行

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

打开：

- 前台：`http://localhost:3000/`
- SaaS 后台：`http://localhost:3000/admin.html`
- React 后台（先执行 `npm run admin:build`）：`http://localhost:3000/admin-app/`
- 健康检查：`http://localhost:3000/api/health`

开发演示后台使用 `ADMIN_API_KEY=change-me`。后台页面不再写死密钥：如果你在 `.env` 中改了密钥，页面第一次请求时会弹窗让你输入一次，只保存在当前标签页。生产环境如果密钥缺失或仍是示例值，服务会拒绝启动；正式上线建议再接 OIDC/Auth0/Clerk/企业 SSO。

`npm run test:all` 会依次运行：业务与 HTTP 自测（`test`）、业务流程测试（`test:flows`）、加固测试（`test:hardening`）和真实启动服务的端到端测试（`test:http`）。外部 API（PayPal、EasyPost、AvaTax、Shopify）全部用模拟数据，不需要联网。

### 数据保存

默认 `.env.example` 里 `STORE_PERSIST_PATH=./var/runtime-state.json`：结账订单、效果确认单、任务、已连接店铺等运行数据会写入这个文件，重启后保留。删除该文件即可回到种子数据；留空则为纯内存演示模式。正式部署应换成 PostgreSQL（参考 `server/schema.sql`）。

## API Key 在哪里填

全部集中在根目录 `.env`。先复制 `.env.example`。

### Shopify

在 Shopify Dev/Partner Dashboard 创建应用，然后把：

```env
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
SHOPIFY_API_VERSION=2026-10
SHOPIFY_REDIRECT_URI=https://YOUR_DOMAIN/api/shopify/oauth/callback
```

填入 `.env`。**多店铺卖家不是每个店都把 token 写进 env**：卖家从后台点“连接 Shopify 店铺”，OAuth 完成后每个店的 token 应加密写数据库 `stores.encrypted_access_token`。当前演示使用内存/Seed，正式部署要接 PostgreSQL/KMS。

Shopify Webhook：

`https://YOUR_DOMAIN/api/webhooks/shopify`

### PayPal

PayPal Developer Dashboard → Apps & Credentials：

```env
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
```

Webhook：

`https://YOUR_DOMAIN/api/webhooks/paypal`（建议订阅 `PAYMENT.CAPTURE.COMPLETED`）

前台结账流程：

1. 前台提交购物车到 `POST /api/payments/paypal/create`；服务端按 `server/data/storefront-pricing.json` 重新报价（与前台价格规则一致，浏览器金额只用于展示），创建内部订单并返回 PayPal 付款链接。
2. 客户付款后回到 `/api/payments/paypal/return`，服务端扣款（只执行一次）并跳转到 `payment-success.html`；如客户没有回跳，Webhook 会补记已付款状态。
3. 付款后自动生成效果确认单。后台通过 `GET /api/saas/proofs` 查看，`PATCH /api/saas/proofs/:id`（传 `proof_url`）上传效果图；客户用 `proof.html?token=...` 确认，订单进入 Approved。

修改前台价格（`index.html` 里的 `sceneData` / `materialsByType`）时，需要同步更新 `storefront-pricing.json`；`npm test` 会检查两边是否一致。

### Agent / LLM

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

Anthropic/Gemini 也有对应配置位。

### 营销平台

Google Ads、Meta、TikTok、Pinterest、Reddit、LinkedIn、YouTube、X 的配置位都在 `.env.example`。平台通常还需要 OAuth、应用审核或 Marketing Partner 权限，不能只填一个 Key 就绕过平台审批。

## 2026 Agentic Commerce / AI Discovery

项目预留：

- `/.well-known/ucp` — UCP Profile
- `/.well-known/agent-card.json` — A2A Agent Card
- `/api/protocols/mcp` — MCP 风格 Tool endpoint scaffold（生产建议使用官方 MCP SDK）
- `/api/ai-discovery/acp-feed` — OpenAI ACP/ChatGPT 商品 Feed 输出
- `/api/a2a` — A2A 业务委派入口 scaffold

详见 `docs/PROTOCOLS_2026.md`。

## SaaS 后台模块

- 多租户 / 多卖家
- 多 Shopify 店铺 OAuth
- 统一订单
- 物流
- 商品主数据
- 授权供应商 Feed 导入
- 采购/到岸成本
- 多渠道 Listing 同步
- 财务贡献利润
- Google/Meta/TikTok/Pinterest/Reddit/LinkedIn 等营销连接器
- 广告汇总与 ROAS/CPA
- 用户多维画像 / 分群
- 产品推荐
- Influencer / Creator 列表
- Affiliate 佣金
- Agent 任务队列 / 审批
- UCP / ACP / MCP / A2A 协议适配

## 安全原则

- 价格、成本、退款、预算修改全部在服务端；结账金额由服务端报价。
- 前台客服 Agent 不会向访客返回财务、订单列表、客户邮箱等后台数据；运营类查询需要管理员身份。
- MCP / A2A 接口需要管理员身份；公开商品接口和 ACP Feed 不包含成本字段。
- 用户发布的婚礼邀请网站在沙箱中打开，无法读取主站数据。
- 广告发布、提高预算、退款、采购订单等写操作默认需要审批。
- 不通过抓取受限平台建立 Creator 数据库；使用官方 API、授权数据或合法第三方数据供应商。
- 多租户所有表必须有 tenant_id + Row Level Security/服务端过滤。
- Shopify/广告平台 token 应使用 KMS/Secrets Manager 加密，不能存明文。

## 文档

- `docs/DEPLOYMENT.md` — 部署方式与 API Key 位置
- `docs/SAAS_ARCHITECTURE.md` — 前端→卖家平台→SaaS→Agent 全架构
- `docs/PROTOCOLS_2026.md` — UCP / ACP / MCP / A2A
- `docs/MARKETING_AND_CREATORS.md` — 广告、AI 搜索、Influencer 平台
- `docs/DATA_MODEL.md` — 数据与指标架构
- `docs/AGENT_OPERATING_MODEL.md` — Agent 任务/审批/工具模型
- `docs/CHANGELOG_V3.md` — v3 升级记录
- `CHANGELOG.md` — 全部版本记录（含 v8 优化说明）

## 后端代码结构

```
server/
  app.js              启动入口（配置检查、监听、优雅关停）
  create-app.js       组装 Express 应用（中间件、路由）
  config.js           启动配置校验
  http/middleware.js  错误处理、安全响应头、限流
  routes/
    webhooks.js       Shopify / PayPal Webhook（原始请求体验签）
    public.js         页面、前台、结账、效果确认、邀请网站、协议发现
    admin.js          SaaS 后台、Shopify OAuth、退款、运营 Agent、MCP / A2A
  services/           业务逻辑（pricing / checkout / proof / finance / marketing ...）
  connectors/         外部平台适配（Shopify、PayPal、LLM、广告、物流、消息）
  saas-store.js       数据存储（内存 + 可选文件持久化）
```


## Admin UI v4

本版增加两套 Admin：

1. `admin.html`
   - 零构建；
   - 直接运行；
   - 读取真实数据，后端不可用时自动切换到演示数据；

2. `admin-app/`
   - React + Ant Design 5 + Ant Design Pro Components + Ant Design Charts（pro-components 稳定版不支持 antd 6）；
   - 作为正式生产管理端代码入口。

新增交互：
- KPI 数字动画；
- 趋势图动画；
- 店铺健康度；
- 订单 Detail Drawer；
- 多选 / Bulk Action；
- Command Palette；
- Approval Center；
- Agent Run Trace；
- Marketing Funnel；
- Profit Bridge；
- Notification Drawer。

详细说明：`docs/ADMIN_UX.md`

## Excel / CSV Data Exchange

Admin now includes **数据导入 / 导出** with:
- `.xlsx` / `.csv` preview and validation
- row-level error reporting
- approval-gated commit with short-lived preview token
- module exports and full multi-sheet Excel backup
- template: `templates/commerce-os-import-template.xlsx`

Run validation:
```bash
npm run test:all
```

See `docs/DATA_IMPORT_EXPORT.md` and `docs/FLOW_TEST_REPORT.md`.


## Logistics Control Center v10

New standalone Admin module:

- carrier API configuration and status
- tracking / ETA / exceptions
- shipping region rules
- Standard / Express rate calculation
- tax mode / estimate
- sync to connected seller stores
- storefront quote calculation
- Excel Shipping Zones import/export

Key documentation:
`docs/LOGISTICS.md`

Key endpoints:

- `/api/saas/logistics/overview`
- `/api/saas/logistics/tracking/:tracking`
- `/api/saas/logistics/quote`
- `/api/saas/logistics/sync`
- `/api/saas/logistics/sync-stores`
- `/api/storefront/shipping/quote`
- `/api/saas/connectors/registry`
- `/api/saas/connectors/:id/config`
- `/api/saas/connectors/:id/test`


## Logistics + Connector Center v10

Admin now separates **订单管理** and **物流管理**.

Logistics Center includes:
- carrier API configuration/status;
- tracking timelines and synchronization;
- Standard / Express shipping quotes;
- regional shipping rules and free-shipping thresholds;
- regional tax fallback and AvaTax tenant adapter;
- connected-store shipping synchronization;
- Shopify CarrierService registration when the store has OAuth + `write_shipping` + public HTTPS callback;
- storefront and PayPal server-side shipping/tax recalculation;
- Shipping Zones Excel / CSV import/export.

Connector credentials entered in Admin are tenant-scoped and take precedence over `.env` fallback in the logistics execution path. Production must replace the demo in-memory encrypted store with a persistent database + KMS/Secret Manager.

Implemented live execution adapters in this build:
- AfterShip Tracking `2026-07` when configured;
- 17TRACK tracking when configured;
- EasyPost live shipment rating when configured with an origin address;
- Avalara AvaTax `SalesOrder` estimate when configured with an origin address;
- Shopify `carrierServiceCreate` registration for eligible OAuth-connected stores.

Connector slots present but still provider-specific production work:
- AfterShip Shipping rate payload/account mapping;
- Shippo live rate/label mapping;
- DHL / UPS / FedEx direct rate/label flows;
- ShipStation order/label mapping.

See:
- `docs/LOGISTICS.md`
- `docs/API_CREDENTIALS_MATRIX.md`
- `docs/FLOW_TEST_REPORT.md`
- `docs/BUILD_VALIDATION.md`
