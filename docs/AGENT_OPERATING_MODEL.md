# Agent 一站式会话与任务驱动模型

> 更新：2026-11-01（对应 620ba20 之后的 main）。本文前半部分是**当前实现**，后半部分（“目标模型”）是设计方向，
> 其中的 tool 名称尚未实现为独立工具。客户聊天 Agent 以 [`POD.AI-Agent-标准文档.txt`](POD.AI-Agent-标准文档.txt) 为准。

## 当前实现

| 通道 | 入口 | 模式 |
|---|---|---|
| 客户聊天 Agent | `POST /api/pod-agent/chat`（公开） | 护栏 → 意图识别 → 本地优先路由（置信度 ≥ 0.6）→ 10 个客户安全工具；模型可选（线上未配置） |
| 后台运营 Agent | `POST /api/agent/ops`（管理员） | 关键词意图 → 读取数据 → 写操作建审批任务；不调用模型 |
| A2A | `POST /api/a2a`（管理员） | 把消息转给后台运营 Agent（同上） |
| MCP 骨架 | `POST /api/protocols/mcp`（管理员，JSON-RPC） | 3 个工具：`commerce_overview`、`marketing_summary`、`create_task` |
| 旧入口 | `POST /api/agent/chat` | 无页面调用；见 `../AGENT_FRAMEWORK.txt` |

### 审批门（代码实际行为）

- 后台写接口挂 `requireApproval`：请求体 `approved: true` 或请求头 `x-action-approved: true`，否则返回 `409 approval_required`。
- 运营 Agent 的写意图只调用 `createTask`（collection `tasks`）。
- `POST /api/saas/tasks/:id/approve` 只把任务改为 `approved`；`executeApprovedTask()` 存在但未接入任何路由，审批后不会自动执行。
- 后台没有“拒绝任务”接口（页面上的 Reject 只在当前页隐藏）。
- 没有独立的审计日志表；任务记录本身保存 `approved_at`。

### 会话状态（客户聊天 Agent）

`agent_conversations` 保存消息、语言、`answered_by` / `route` / `confidence`、评价；转人工记录在 `agent_handoffs`。
卡号在存储前被脱敏；不会把密钥或其他客户数据放进模型提示词。详见标准文档 4.4。

---

## 目标模型（设计方向）

### 目标

用户可以在一个会话里说：

> “看全部店铺昨天订单和物流异常；把 TikTok 低 ROAS 广告生成暂停建议；挑 5 个婚礼达人；同步供应商新品到两个 Shopify 店，但先给我审批。”

Agent 做的是：理解 → 计划 → 查询工具 → 生成任务 → 等审批 → 执行 → 回写结果。

### Tool Domains（目标名称，未实现）

#### Commerce
- store.list
- order.search
- shipment.search
- catalog.search
- catalog.import
- shopify.sync_products
- shopify.sync_orders

#### Finance
- finance.summary
- product.landed_cost
- order.contribution_margin

#### Marketing
- marketing.report
- marketing.optimize
- campaign.create_draft
- campaign.publish (approval)
- budget.update (approval)

#### Customer
- profile.get
- segment.list
- recommendation.get

#### Creator / Affiliate
- influencer.search
- influencer.shortlist
- outreach.create_draft
- outreach.send (approval)
- affiliate.report

#### Finance / Risk
- refund.create (approval)
- supplier_purchase.create (approval)

### Approval Gate（目标）

High-risk:
- spending money
- increasing budget
- refund/payment
- supplier PO
- changing customer/order data
- public publishing
- sending external messages

这些工具不得由模型独立决定并立即执行。

### MCP / A2A
- MCP：Agent ↔ tools/data
- A2A：Orchestrator ↔ specialist agents
- UCP/ACP：commerce surfaces / discovery

### Conversation State（目标）

每轮保存：
- tenant_id
- user role
- intent
- entities
- current plan
- tool results
- pending approvals
- task ids
- last external state version

不要把敏感 token 或完整 PII 放进 LLM prompt。
