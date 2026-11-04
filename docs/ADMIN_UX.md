# Admin UX / Interaction Specification

> 更新：2026-11-01（对应 620ba20 之后的 main）。“当前 Admin”一节描述线上实际情况；其余章节是交互 / 视觉规范与早期版本记录。

## 当前 Admin（线上 https://wed.swisspro.site/admin）

- 页面：零构建 `admin.html` + `admin-sections.js`（承运商、价目表、费用与税、优惠码、Shopify、AI 客服等分区）。React 版 `admin-app/` 未构建上线（`/admin-app/` 返回 404）。
- 登录：`/admin/login` 用户名 + 密码（`server/admin-auth.js`；scrypt 哈希来自 `ADMIN_PASSWORD_HASH`，后台改密码后存 `data/admin-auth.json`），
  HttpOnly 会话 cookie `wcos_admin`（SameSite=Strict，默认 12 小时）。接口返回 401 时页面跳转到登录页。
  脚本可继续用请求头 `x-admin-api-key`（`ADMIN_API_KEY`）。登录接口限流。
- 写操作：后台写接口需要审批标记（请求体 `approved: true` 或头 `x-action-approved: true`），页面在确认后自动带上。
- 旧地址 `/admin-prices.html`、`/admin-fees.html`、`/admin-promos.html` 等 302 跳转到 `/admin#prices|fees|promos`。

### 分区（21 个，按侧栏顺序）

| 分区 | 说明 / 主要接口 |
|---|---|
| 总览 | `/api/saas/overview` |
| 店铺中心 | `/api/saas/stores`、旧多店 Shopify OAuth |
| 订单管理 | `/api/saas/orders`、改状态（审批）、重发邮件 |
| Studio / 账号 | 用户、Studio 方案、Proof、订单事件、邀请函、通知 |
| 物流管理 | 物流 API 连接器卡片、运费与税费试算（见 `LOGISTICS.md`） |
| 承运商 / Carriers | YunExpress / 4PX 运单、面单、追踪（`/api/saas/carriers/*`） |
| 商品 / 采购 | `/api/saas/catalog`、导入（审批） |
| 价目表 / Price list | `/api/saas/prices` |
| 费用与税 / Fees & tax | `/api/saas/fees`（店面实际运费、VAT、配送天数、包装价）、汇率同步 |
| 优惠码 / Promo codes | `/api/saas/promos` |
| Shopify | Shopify App 连接与商品推送（`/api/shopify/app/*`） |
| 数据导入 / 导出 | `/api/saas/data/*`（Excel 模板、预览、提交） |
| 统一 Inbox | `/api/saas/conversations`、回复草稿 |
| 营销 / 广告 | `/api/saas/marketing`（种子数据；外部广告 API 未接入） |
| 用户画像 / 推荐 | `/api/saas/customers`、Customer 360 详情、分群、推荐 |
| 达人 / 联盟 | `/api/saas/influencers`、`/api/saas/affiliates` |
| 财务 / 利润 | `/api/saas/finance` |
| Agent 任务中心 | 后台运营 Agent：`POST /api/agent/ops`（见 `../AGENT_FRAMEWORK.txt`） |
| AI 客服 / Chat agent | 客户聊天 Agent：Overview（15 项 KPI）、Handoffs、Conversations、Knowledge、Settings、Data check（`/api/saas/agent/*`；见 `POD.AI-Agent-标准文档.txt`） |
| 审批中心 | `/api/saas/tasks`、`/api/saas/tasks/:id/approve`（只改状态，不自动执行） |
| API / 协议 | 连接器配置（加密保存，不回显密钥）、测试、协议状态 |

---

## 目标

Admin 是多卖家 SaaS 的运营工作台，不是 CRUD 页面集合。

每个模块必须同时呈现：
1. 当前状态；
2. 异常/风险；
3. 下一步动作；
4. Agent 可以做什么；
5. 哪些动作需要审批。

## 前端实现

### 零构建版本
`admin.html`

特点：
- 不需要 npm；
- 可直接配合现有 Node API；
- KPI 数字动画；
- SVG 趋势动画；
- Drawer / Modal / Command Palette；
- 订单多选和批量任务；
- Agent Run Trace；
- Approval Center；
- 店铺健康度；
- 营销漏斗和利润桥。

### 正式 React 管理端（未部署）
`admin-app/`

技术栈：
- React 19
- Ant Design 5 (required by pro-components 2.x)
- Ant Design Charts 2.6.5
- Vite
- Day.js

开发：

```bash
cd admin-app
npm install
npm run dev
```

生产：

```bash
npm run build
```

输出：
`admin-app/dist`

根目录也提供：

```bash
npm run admin:dev
npm run admin:build
```

## 关键交互

### Global Context
Top Bar 保持：
- Tenant
- Store
- Date Range
- Global Search
- Notification
- Ask Agent

所有 API 请求必须带 tenant context，store/date filter 进入查询条件。

### Command Palette
`Ctrl/Cmd + K`

支持：
- 跳转模块；
- 搜索订单/SKU/客户；
- 触发 Agent 任务；
- 后续可以扩展成 slash commands。

### Order Drawer
点击订单：
- Customer
- Store
- Revenue
- Contribution
- Payment
- Proof
- Production
- Shipment
- Order Timeline
- Ask Agent

### Bulk Actions
订单选择后出现底部 Batch Bar：
- Export
- Agent Analyze
- Create task
- Bulk tag

高风险批量写操作必须进入 Approval。

### Agent Run
Agent 不是纯聊天框。

每个 Run 显示：
- Intent
- Context
- RAG
- Plan
- Tool call
- Approval gate
- Result / Error
- Retry / Handoff

### Approval Center
统一承载：
- Ads publish
- Budget change
- Refund
- Purchase
- External message
- Proof approval
- Large batch operation

审批卡必须展示：
- Agent reason
- Current evidence
- Estimated impact
- Rollback ability
- Requester / tenant / store
- Expiry

## 数据动画

动画必须表达状态变化，而不是纯装饰。

使用场景：
- KPI count-up；
- Revenue/Profit trend draw；
- Store health progress；
- Funnel flow；
- Task progress；
- Live sync indicator；
- Anomaly highlight。

避免：
- 大量循环动画；
- 影响读数的 3D 图；
- 每次表格刷新整页闪烁。

## 下一阶段

P1：
- React Admin 完整覆盖静态版全部模块；
- React Query / TanStack Query；
- WebSocket/SSE 实时订单、任务、物流；
- URL-based routing；
- RBAC；
- saved views；
- table column preferences；
- tenant/store/date filter persist；
- audit viewer。

P2：
- drag/drop dashboard；
- custom KPI builder；
- workflow editor；
- agent automation builder；
- alert rules；
- anomaly drill-down。


## v5 视觉规范

方向：
- 简约；
- 大留白；
- 黑白灰为主；
- Shopify 绿色只用于 Shopify 连接动作；
- 减少阴影和渐变；
- 卡片边界弱化；
- 通过字号、间距和布局建立层级。

### Shopify 入口

全局 Top Bar：
`连接 Shopify`

Store Center：
- 显著 Shopify Connection Hero；
- 输入 `.myshopify.com`；
- 进入 `/api/shopify/oauth/start`；
- Shopify OAuth；
- 回调后保存店铺 token；
- 触发首次 Products / Orders / Fulfillment 同步。

Secret 永远只存在后端 `.env` / Secret Manager。


## v6 Typography

Design goal:
- readable before decorative;
- no 8px micro-text for operational information;
- no excessive uppercase labels;
- minimal letter spacing;
- consistent 12–13px operational body text.

Recommended scale:

- Page title: 22px / 650
- Section title: 14px / 650
- KPI value: 30px / 650
- Body / table: 12–13px
- Secondary text: 11–12px
- Button / input: 12px
- Navigation: 13px
- Status tag: 11px

Use font weight and whitespace for hierarchy before using color, animation or decorative styles.

## v7 Filters and localization

Global filter structure:
- Tenant
- Store
- Period
- Search

Order filter structure:
- Search
- Status
- Store
- Filter action

Supported languages:
- 中文 / zh
- English / en
- Deutsch / de

Shared browser preference:
`localStorage["wedding-commerce-language"]`

The storefront, Admin, payment page, proof page and generated wedding invitation website all expose a language switch.


## v8 Ant Design Pro architecture

The Admin should follow Ant Design Pro page architecture rather than custom dashboard composition.

### Global shell

- Sider: 208px
- Header: 64px
- content background: `#f5f5f5`
- page content padding: 24px
- primary color: Ant Blue `#1677ff`
- base UI font: 14px
- common radius: 8px

### Page composition

`ProLayout`
→ `PageContainer`
→ page action bar
→ `QueryFilter` / search form where needed
→ `ProTable` / `ProCard`
→ Drawer / Modal for details and actions

### React production Admin

`admin-app/` now includes:

- Ant Design 5 (`antd@^5.29`) + `@ant-design/v5-patch-for-react-19`
- `@ant-design/pro-components@2.8.10` (its stable line supports antd 4/5 only; antd 6 cannot be installed with it)
- `ProLayout`
- `PageContainer`
- `ProTable`
- `ProCard`
- `StatisticCard`

The static `admin.html` mirrors the same architecture without requiring an npm build.


### Data & actions (v9)

Both admins read live data from `/api/saas/*` and fall back to built-in demo data only when the
backend is unreachable; the header / KPI footers say which one is shown ("Live data" / "Demo data").

| UI action | Backend |
|---|---|
| Store **Sync** / **Sync all** | `POST /api/shopify/stores/:id/sync-products` (approval) |
| **Sync shipping** | `POST /api/saas/logistics/sync` (approval) |
| Approval **Approve** | `POST /api/saas/tasks/:id/approve` (approval) |
| Approval **Reject** | hides the task in the current page only — the backend has no reject endpoint yet |
| **Import supplier feed** | `POST /api/saas/catalog/import` (approval) |
| **New campaign** | `POST /api/saas/marketing/drafts` (draft only) |
| Inbox **Draft reply** | `POST /api/saas/conversations/:id/reply-draft` (draft, approval before sending) |
| **Segments** | `GET /api/saas/customer-segments` |
| **Test all connections** | `GET /api/saas/connectors` |
| "AI …" buttons, Settlement, Outreach | sent as a command to the Agent (`POST /api/agent/ops`) |
| **Export CSV / P&L / report** | generated in the browser from the data on screen |

Admin auth (current): the admin uses the `/admin/login` session cookie; on the first 401 the page redirects to
`/admin/login?next=…` (parallel requests share that redirect). `x-admin-api-key` still works for scripts.

`admin.html` layout notes: ☰ collapses the sider on desktop and opens it as a drawer on phones
(< 820px, where the sider is otherwise hidden); orders table supports column visibility and density.

React admin bundle: React, antd and pro-components are split into cacheable chunks; charts are
loaded only when the overview page renders (initial load ≈ 690 KB gzip instead of one 1.1 MB file).

## v9 Customer 360

Customer list:
- LTV / orders / engagement / purchase intent
- preferred wedding scene / acquisition source
- Next Best Action

Clicking a customer opens:
- multi-dimensional radar profile
- 30-day behavior intensity and recent activity
- interests, materials and product-category preferences
- historical orders
- personalized product recommendations with score and reason
- Agent follow-up action

Backend:
`GET /api/saas/customers/:customerId/detail`
