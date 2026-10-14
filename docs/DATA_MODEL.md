# 数据模型与分析层

数据库参考：`server/schema.sql`。

## 核心域

### Tenant / Identity
- tenants
- users
- tenant_memberships
- stores

### Product / Supply
- suppliers
- products
- product_listings
- materials

### Customer / Recommendation
- customers
- customer_identities
- customer_events
- customer_segments
- recommendation_events

### Commerce
- orders
- order_items
- order_events
- payments
- shipments
- tracking_events

### Marketing
- ad_accounts
- campaigns
- campaign_metrics
- marketing_attribution

### Creator / Affiliate
- influencers
- influencer_campaigns
- affiliates
- affiliate_conversions

### Agent / Audit
- conversations
- messages
- agent_tasks
- agent_runs
- audit_logs
- webhook_deliveries
- knowledge_documents

## Warehouse / BI
交易 PostgreSQL 之外，建议把 events/metrics CDC 到 BigQuery/Snowflake/ClickHouse：
- date/store/product/channel/customer_segment 粒度
- GMV / Net Revenue
- COGS
- fulfillment
- payment fee
- ad spend
- affiliate commission
- contribution margin
- CAC / LTV
- cohort retention
- recommendation CTR/CVR
- creator ROI
