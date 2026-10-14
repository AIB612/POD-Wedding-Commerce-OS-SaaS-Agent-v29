# SaaS 完整架构

## 目标链路

```
消费者 / 婚礼前端
        ↓
Shopify 店铺 A / B / C + Direct Store + 未来其他渠道
        ↓
Wedding Commerce OS (multi-tenant SaaS)
        ├─ Catalog Master / Supplier Feeds / Listings
        ├─ Orders / Payments / Proof / Production / Logistics
        ├─ Procurement & Landed Cost
        ├─ Customer 360 / Segmentation / Recommendation
        ├─ Marketing / Ads / Attribution
        ├─ Finance / Contribution Margin
        ├─ Influencer / Affiliate
        └─ Conversation / Tasks / Audit
        ↓
Agent Orchestrator
        ├─ Commerce Agent
        ├─ Marketing Agent
        ├─ Finance Agent
        ├─ Creator Agent
        └─ Support Agent
```

## 前端层
- 婚礼 3D 场景选品
- 产品、材质、设计上传、价格
- 购物车 / PayPal
- Agent 客户会话
- 专属婚礼网站生成器

## Seller / Channel Layer
每个 SaaS tenant 可以连接多个 Shopify Store。不要把 Shopify 当成内部主数据库：Shopify 是销售渠道，内部 Product/Order/Customer 是统一模型。

## Catalog Master
供应商授权 Feed / ERP / PIM → normalize → product master → landed cost → listing rules → Shopify/前端/AI discovery feeds。

避免“自动采集”直接抓取受限网站；生产使用供应商 API/CSV/XML/SFTP/授权第三方数据。

## Order Hub
所有渠道订单转内部 Order：
`Draft → Paid → Proofing → Approved → Production → Shipped → Delivered`

渠道字段保留 raw payload，核心业务只依赖内部状态。

## Procurement / Cost
到岸成本：
`supplier cost + inbound shipping + duty + packaging + fulfillment overhead`

订单贡献利润：
`revenue - COGS - outbound shipping - payment fees - affiliate commission - attributed ad cost`

## Customer 360
身份解析：Email/phone/shop customer id/session/ad click id/affiliate code。

画像：
- LTV
- order count
- favorite scene/material
- acquisition source
- geography
- device
- engagement
- product affinity
- promotion sensitivity
- lifecycle stage

推荐服务读取画像 + Product tags + margin/inventory guardrails。

## Marketing Data Hub
Ads APIs → campaign_metrics → attribution → order/revenue/margin。

只看平台 ROAS 不够；Agent 应优先用“贡献利润 after ads”。

## Creator / Affiliate
Creator 用官方/授权数据入库；Affiliate code 和订单归因产生佣金，Finance 统一核算。

## Agent Ops
Agent 不是直接拥有所有 API Key。它调用 Tool Registry：
- read tools 可自动
- write tools 进入 approval task
- webhook/event 回写状态
- audit log 记录 who/agent/tool/result

## 多租户
每条数据必须 tenant_id；所有 external connections 归 tenant；生产数据库使用 RLS/KMS/Audit。
