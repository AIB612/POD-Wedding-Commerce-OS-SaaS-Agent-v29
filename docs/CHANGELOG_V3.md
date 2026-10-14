# v3 升级记录 — 2026-10-05

## 架构
- 从单店/单业务 Demo 升级为 multi-tenant commerce SaaS。
- 建立 tenant/store/product/order/customer/marketing/creator/agent 分域。
- 新增完整 PostgreSQL reference schema。

## Shopify
- 新增多店铺 OAuth scaffold。
- `.env.example` 明确 Shopify Client ID/Secret/Redirect URI/API Version。
- 默认 Shopify Admin API 版本更新为 2026-10。
- 新增 Shopify raw-body webhook HMAC 验证入口。
- 新增每个 Store 产品/订单同步任务入口。

## PayPal
- 新增 server-side create order / capture / refund connector。
- 新增 PayPal Webhook verification 调用。
- 退款 endpoint 需要审批。

## Agentic Commerce
- 新增 UCP profile。
- 新增 OpenAI ACP feed adapter。
- 新增 MCP tool endpoint scaffold。
- 新增 A2A agent card / delegation endpoint。

## 商品 / 供应链
- Supplier Feed normalize/import。
- Product Master / Channel Listing 模型。
- Landed Cost 计算。
- 商品同步任务化。

## 营销
- 新增 Google Ads / Meta / TikTok / Pinterest / Reddit / LinkedIn / YouTube / X connector registry。
- 统一 ROAS / CPA 分析。
- 自动营销采用 draft/approval guardrail，不直接自动花费。

## Customer 360 / 推荐
- 新增用户多维画像、分群、LTV、渠道、偏好、Traits。
- 新增基于场景偏好的产品推荐 service scaffold。

## Creator / Affiliate
- 新增 TikTok/YouTube/Instagram/Pinterest/LinkedIn/Reddit/X creator source registry。
- 新增 Influencer shortlist 数据模型和后台列表。
- 新增 Affiliate revenue / commission 汇总。

## 财务
- 新增贡献利润：Revenue - COGS - Shipping - Payment fee - Affiliate - Attributed Ads。
- 将采购成本/营销成本与订单收入统一。

## 后台
- admin.html 重构为 SaaS 运营后台：总览、店铺、订单物流、商品成本、营销、用户、Creator、财务、Agent、连接器。

## 部署
- 新增 Dockerfile / docker-compose.yml。
- 新增 DEPLOYMENT.md 和完整环境变量模板。
