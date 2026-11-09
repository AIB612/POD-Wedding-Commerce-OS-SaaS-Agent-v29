# SaaS 完整架构

> 更新：2026-11-01（对应 620ba20 之后的 main）。“当前实现”一节描述线上系统；其后的“目标链路”及各小节是设计方向，
> 未实现的部分已标注。Agent 细节见 [`POD.AI-Agent-标准文档.txt`](POD.AI-Agent-标准文档.txt) 与 [`../AGENT_FRAMEWORK.txt`](../AGENT_FRAMEWORK.txt)。

## 当前实现（线上 https://pod.swisspro.site）

```
顾客：首页 / Studio / 结账 / 账户 / 首页“Ask POD.AI”对话 / 第三方网站 widget.js
        ↓
POD.AI 单体服务（Node.js / Express，单实例，cPanel）
  ├─ 店面：目录、价目表、费用与税、优惠码、服务器报价（quoteStorefront）
  ├─ 结账与支付：PayPal（代码就绪，线上未配置）、TWINT（骨架）
  ├─ 订单 / Proof / 生产 / 承运商运单（YunExpress / 4PX）/ 追踪
  ├─ 客户账户：Google 登录（Shop 登录未配置）、地址、订单
  ├─ Shopify App：OAuth、商品推送、订单同步、Webhook、CarrierService 回调
  ├─ 客户聊天 Agent（本地优先）+ 后台运营 Agent（关键词意图、审批任务）
  └─ Admin（admin.html，21 个分区，密码登录）
        ↓
数据：data/store.json（业务）· data/logistics-state.json（承运商）· data/app.db（Shopify 表）
```

- 租户：代码按 `tenant_id` 过滤；租户取自请求头 `x-tenant-id` / 参数 `tenant_id`，默认 `DEFAULT_TENANT_ID` 或 `tenant_demo`。线上只使用 `tenant_demo`，尚无租户级鉴权（真正多租户前必须补上）。
- 订单状态（网站订单）：`Needs approval → Proof ready → Approved / Changes requested → Production → Ready to ship → Label created → Shipped → Delivered`，或 `Cancelled`。
- 营销、达人、财务、Customer 360 等分区读取种子 / 存储数据，外部广告与社媒 API 未接入。
- 未实现：PostgreSQL / RLS / KMS、Supplier Feed 自动导入、专职多 Agent 编排、审批后自动执行。

---

## 目标链路（设计方向）

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
- 婚礼场景选品（首页场景 + Studio 场景套装）
- 产品、材质、设计上传、价格
- 购物车 / 结账（PayPal、TWINT 骨架）
- 客户聊天 Agent（首页主图区面板，无悬浮气泡）
- 专属婚礼网站 / 邀请函生成器（RSVP）

## Seller / Channel Layer
每个 SaaS tenant 可以连接多个 Shopify Store。不要把 Shopify 当成内部主数据库：Shopify 是销售渠道，内部 Product/Order/Customer 是统一模型。

## Catalog Master
供应商授权 Feed / ERP / PIM → normalize → product master → landed cost → listing rules → Shopify/前端/AI discovery feeds。

避免“自动采集”直接抓取受限网站；生产使用供应商 API/CSV/XML/SFTP/授权第三方数据。

## Order Hub
所有渠道订单转内部 Order。网站订单的实际状态见上文“当前实现”；早期设计为：
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
当前：后台运营 Agent 只建审批任务，审批只改状态（见 `AGENT_OPERATING_MODEL.md`）。目标：Agent 不直接拥有所有 API Key，而是调用 Tool Registry：
- read tools 可自动
- write tools 进入 approval task
- webhook/event 回写状态
- audit log 记录 who/agent/tool/result

## 多租户
每条数据必须 tenant_id；所有 external connections 归 tenant（连接器凭证已按租户加密保存在 `connector_configs`）。目标：生产数据库使用 RLS/KMS/Audit（未实现，当前为 JSON 文件存储）。
