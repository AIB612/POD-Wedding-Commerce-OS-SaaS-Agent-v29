# AI 搜索、广告、Creator / Influencer 与自动营销

## AI 商品发现 / 营销搜索入口

### ChatGPT
- OpenAI Agentic Commerce Protocol / structured product feeds
- 项目 endpoint: `/api/ai-discovery/acp-feed`

### Google AI Mode / Gemini
- Merchant Center product feed
- UCP direct commerce
- Google Ads / Merchant Center 继续承担 paid + shopping discovery

### Shopify Agentic Storefronts / Catalog
- Shopify Catalog/UCP 可把商品暴露给 AI Agent
- Global Catalog / Storefront Catalog MCP 可做 Agent 搜索
- Shopify 还把多个 AI shopping surface 统一到其 agentic commerce 基础设施

### Microsoft Copilot 等
如果卖家通过 Shopify Agentic Storefronts 分发，可由 Shopify 承担部分 AI channel distribution；自建直连时再单独增加 connector。

## 广告连接器

`server/connectors/marketing.js` 统一描述：
- Google Ads
- Meta Marketing API
- TikTok API for Business
- Pinterest API
- Reddit Ads API v3
- LinkedIn Marketing API
- YouTube Data/Analytics
- X

平台 API 审核、access tier、OAuth scope 随平台变化，connector 必须独立版本化。

## 自动营销原则

自动：
- 拉取报表
- 计算 ROAS / CPA / CAC
- 异常告警
- 素材 Brief
- Campaign Draft
- Audience/产品推荐建议
- Creator shortlist
- UTM / 归因检查

需要审批：
- 发布 Campaign
- 增加预算
- 大幅降低预算
- 暂停高价值 Campaign
- 对外 Creator 联系
- 自动生成优惠券并公开

## Influencer / Creator 数据源

系统支持统一 `influencers` 数据模型，但不鼓励无授权抓取。

- TikTok：TikTok One / Discovery / API for Business（可用能力以账户权限为准）
- YouTube：YouTube Data API；授权频道可用 YouTube Analytics
- Instagram：Meta/Instagram Graph API，需符合 account type / app permissions
- Pinterest：Organic Analytics / Trends / business-authorized data
- LinkedIn：Marketing / Community / Creator analytics（受产品权限控制）
- Reddit：Ads API / Developer Platform
- X：按 API access tier 接入

也可以接合法第三方 Creator data provider，统一转换成：
`platform, external_id, handle, followers, engagement_rate, audience_geo, categories, estimated_cpm, brand_safety, status`。

## 广告分析统一指标

- spend
- impressions
- clicks
- CTR
- CPC
- conversions
- CPA
- attributed_revenue
- ROAS
- new_customer_revenue
- CAC
- contribution_margin_after_ads

平台报告只负责平台口径，最终经营判断要和内部订单/利润数据 Join。

## 当前平台能力参考

- TikTok API for Business：Marketing、Organic、TikTok One、Business Messaging
- Pinterest v5：Catalog、Shopping Ads、Campaign、Analytics/Trends
- Reddit Ads API v3：Campaign、Reporting、Creative Assets，2026 增加 Forecasting
- LinkedIn Marketing 2026 版本：Advertising、Reporting、Community、Lead Sync、Matched Audiences 等
- YouTube Analytics：授权频道报表；实时视频基础统计可配合 Data API
