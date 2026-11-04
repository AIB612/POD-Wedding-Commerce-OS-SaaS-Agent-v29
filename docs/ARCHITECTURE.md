# Architecture

更新：2026-11-01（对应 620ba20 之后的 main，线上 https://wed.swisspro.site）。

## 当前线上系统（一句话）

单个 Node.js / Express 服务（`server/app.js`，cPanel 上经 `server/cpanel-start.cjs` 由 Passenger 启动）同时提供静态页面与 API；
业务数据保存在 `data/store.json`（`STORE_PERSIST_PATH`），承运商数据在 `data/logistics-state.json`，Shopify 集成表在 SQLite `data/app.db`。

```
浏览器（首页 / Studio / 结账 / 账户 / agent.html / 第三方网站 widget.js）
        ↓
Express（server/create-app.js）
  ├─ 页面与公开 API（routes/public.js, account.js, studio.js）
  ├─ 客户聊天 Agent  /api/pod-agent/*（本地优先，模型可选）
  ├─ 后台 API        /api/saas/*、/api/saas/carriers/*、/api/agent/ops（管理员）
  └─ Shopify App / Webhook / CarrierService 回调
        ↓
数据：store.json · logistics-state.json · app.db · admin-auth.json
外部：Shopify · YunExpress / 4PX · SendGrid · Google 登录 ·（PayPal / LLM 未配置）
```

## 文档索引

- `POD.AI-Agent-标准文档.txt` — **客户聊天 Agent 权威文档**（功能、数据、KPI、验证、文件地图、修订记录）
- `../AGENT_FRAMEWORK.txt` — 系统里三条 Agent 通道的入口与边界
- `../ARCHITECTURE_AND_OPTIMIZATION.txt` — 文件结构、外部服务线上状态、待办
- `SAAS_ARCHITECTURE.md` — 业务架构（目标 + 当前实现对照）
- `DATA_MODEL.md` — 实际数据存储与参考 PostgreSQL 模型
- `AGENT_FUNCTIONS.md` / `AGENT_OPERATING_MODEL.md` — Agent 功能与审批模型
- `LOGISTICS.md` — 运费、承运商、追踪
- `ADMIN_UX.md` — 后台分区与登录
- `DEPLOYMENT.md` — 部署与发布（cPanel / CloudLinux）
- `API_CREDENTIALS_MATRIX.md` / `CURRENT_API_REFERENCES.md` — 环境变量与外部 API 参考
- `quick-login.md` — 顾客 Google / Shop 快捷登录
- `PROTOCOLS_2026.md` — UCP / ACP / MCP / A2A
- `MARKETING_AND_CREATORS.md` — 营销、AI 搜索、Creator
