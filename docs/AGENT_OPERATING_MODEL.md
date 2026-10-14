# Agent 一站式会话与任务驱动模型

## 目标

用户可以在一个会话里说：

> “看全部店铺昨天订单和物流异常；把 TikTok 低 ROAS 广告生成暂停建议；挑 5 个婚礼达人；同步供应商新品到两个 Shopify 店，但先给我审批。”

Agent 做的是：理解 → 计划 → 查询工具 → 生成任务 → 等审批 → 执行 → 回写结果。

## Tool Domains

### Commerce
- store.list
- order.search
- shipment.search
- catalog.search
- catalog.import
- shopify.sync_products
- shopify.sync_orders

### Finance
- finance.summary
- product.landed_cost
- order.contribution_margin

### Marketing
- marketing.report
- marketing.optimize
- campaign.create_draft
- campaign.publish (approval)
- budget.update (approval)

### Customer
- profile.get
- segment.list
- recommendation.get

### Creator / Affiliate
- influencer.search
- influencer.shortlist
- outreach.create_draft
- outreach.send (approval)
- affiliate.report

### Finance / Risk
- refund.create (approval)
- supplier_purchase.create (approval)

## Approval Gate

High-risk:
- spending money
- increasing budget
- refund/payment
- supplier PO
- changing customer/order data
- public publishing
- sending external messages

这些工具不得由模型独立决定并立即执行。

## MCP / A2A
- MCP：Agent ↔ tools/data
- A2A：Orchestrator ↔ specialist agents
- UCP/ACP：commerce surfaces / discovery

## Conversation State

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
