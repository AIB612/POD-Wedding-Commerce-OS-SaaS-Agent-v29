# POD Wedding Complete Project

这是一个“婚礼场景式 POD 商城 + Business Agent + Shopify + PayPal + Admin + 专属婚礼邀请网站”的完整可开发项目原型。

## 入口

### 客户端
`index.html`

功能：
- 婚礼场景式选品
- 热点产品
- 材质选择与照片放大
- 定制文字/设计上传 UI
- 数量阶梯价
- 购物车
- PayPal Checkout
- Business Agent
- 专属婚礼邀请网站生成器

### 后台
`admin.html`

开发模式 Token：

`demo-admin`

生产必须配置 `.env`：

`ADMIN_TOKEN=...`

后台功能：
- Dashboard
- Orders
- Proofing
- Proof 邮件 / 客户确认链接
- Production/Shipping
- Shopify
- PayPal Refund
- Audit
- Webhooks

### 支付结果
`payment-success.html`

---

## 快速启动

需要 Node.js 20+。

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

打开：

- Customer: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin.html`

## Demo

订单：
- `POD-2026-1008`
- `POD-2026-1009`

Tracking：
- `TRK-DEMO-8821`

Admin Token：
- `demo-admin`

---

## Shopify

填写：

```env
SHOPIFY_STORE_DOMAIN=
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_CLIENT_SECRET=
SHOPIFY_API_VERSION=2026-10
```

后台可以：
- 检测连接；
- 同步订单；
- 检查产品 API；
- 注册 Webhooks。

详细：
`docs/SHOPIFY_PAYPAL_SETUP.md`

---

## PayPal

Sandbox：

```env
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PUBLIC_BASE_URL=https://your-public-url
```

流程：
- 服务端重新报价；
- 创建 Internal Order；
- PayPal Orders v2；
- Capture；
- Webhook；
- Paid；
- Proofing。

详细：
`docs/END_TO_END_FLOW.md`

---

## 文档

- `CHANGELOG.md` — 本次全部新增/修正
- `docs/ARCHITECTURE.md` — 前端 / 后端 / 数据 / Agent
- `docs/AGENT_FUNCTIONS.md` — Agent 能力
- `docs/END_TO_END_FLOW.md` — 完整业务流程
- `docs/SHOPIFY_PAYPAL_SETUP.md` — Shopify + PayPal
- `docs/API_REFERENCE.md` — API
- `docs/GO_LIVE_CHECKLIST.md` — 上线检查
- `docs/PROJECT_STATUS.md` — 已实现与待生产化
- `docs/TESTING.md` — Sandbox / Webhook / E2E 测试
- `docs/BUILD_VALIDATION.md` — 本次打包自动检查结果
- `server/schema.sql` — PostgreSQL 参考 Schema
- `docs/CONNECTOR_REGISTRY.json` — Provider Registry

---

## 项目结构

```text
.
├── index.html
├── admin.html
├── payment-success.html
├── proof.html
├── package.json
├── .env.example
├── CHANGELOG.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── AGENT_FUNCTIONS.md
│   ├── API_REFERENCE.md
│   ├── END_TO_END_FLOW.md
│   ├── SHOPIFY_PAYPAL_SETUP.md
│   ├── GO_LIVE_CHECKLIST.md
│   ├── PROJECT_STATUS.md
│   ├── TESTING.md
│   ├── BUILD_VALIDATION.md
│   └── CONNECTOR_REGISTRY.json
└── server/
    ├── app.js
    ├── store.js
    ├── orderState.js
    ├── pricing.js
    ├── orchestrator.js
    ├── rag.js
    ├── schema.sql
    ├── selftest.js
    ├── connectors/
    │   ├── shopify.js
    │   ├── paypal.js
    │   ├── commerce.js
    │   ├── logistics.js
    │   └── llm.js
    └── data/
        ├── catalog.json
        ├── knowledge.json
        └── seed.json
```

## 重要边界

这是一个完整的“应用架构 + 可运行原型”，但不是已经拥有你的 Shopify/PayPal/物流账号的部署实例。

真实上线需要：
- 填写第三方 credentials；
- PostgreSQL；
- 用户认证；
- 真实文件存储；
- 税务/运费；
- 邮件；
- Production Queue；
- POD Supplier/ERP。

请不要跳过 `docs/GO_LIVE_CHECKLIST.md`。
