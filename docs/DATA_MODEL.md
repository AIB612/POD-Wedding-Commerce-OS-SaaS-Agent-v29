# 数据模型与分析层

> 更新：2026-11-01（对应 620ba20 之后的 main）。线上**不使用** PostgreSQL；`server/schema.sql` 是参考模型。实际存储如下。

## 实际存储（线上）

| 存储 | 位置 | 内容 |
|---|---|---|
| 业务数据 | `data/store.json`（`STORE_PERSIST_PATH`；`server/saas-store.js`，内存 + 每次写入后延迟保存，停机时 flush） | 见下方 collection 列表 |
| 承运商数据 | `data/logistics-state.json`（`LOGISTICS_STATE_PATH`，权限 600） | `logistics_settings`、`logistics_rules`、`carrier_shipments` |
| Shopify 集成表 | SQLite `data/app.db`（sql.js；`SQLITE_PATH`）。设置 `DATABASE_URL=mysql://…` 时改用 MySQL | `shopify_shops`、`oauth_states`、`product_links`、`order_links`、`webhook_log`（`server/db/migrations.js`） |
| 后台登录 | `data/admin-auth.json`（`ADMIN_AUTH_PATH`） | 修改后的管理员密码 scrypt 哈希、会话哈希 |
| 面单文件 | `data/labels/`（`LOGISTICS_LABEL_DIR`） | 承运商 PDF 面单 |
| 种子 | `server/data/saas-seed.json`、`storefront-pricing.json`、`studio-catalog.json`、`knowledge.json` | 首次启动 / 未持久化时的数据 |

`data/` 不入库（`.gitignore`）。没有 `STORE_PERSIST_PATH` 时业务数据只在内存中。

### saas-store collections（代码中实际读写）

- 店面与价格：`products`、`price_lists`、`fee_settings`、`fx_market`、`promo_codes`、`shipping_zones`、`shipping_store_sync`
- 订单：`orders`、`order_events`、`proofs`、`shipments`、`tracking_events`、`carrier_shipments`、`notifications`
- 顾客：`customers`、`customer_accounts`、`customer_sessions`、`login_codes`、`customer_events`
- Studio / 邀请函：`studio_projects`、`studio_connections`、`invitations`、`invitation_rsvps`
- 客户聊天 Agent：`agent_conversations`、`agent_handoffs`、`agent_settings`、`agent_discounts`
- 后台与运营：`stores`、`tasks`、`pod_tasks`、`conversations`、`messages`、`connector_configs`（加密）、`logistics_settings`、`logistics_rules`
- 营销 / 达人：`campaigns`、`influencers`、`affiliates`

---

## 参考 PostgreSQL 模型（`server/schema.sql`，未在线上使用）

### 核心域

#### Tenant / Identity
- tenants
- users
- tenant_memberships
- stores

#### Product / Supply
- suppliers
- products
- product_listings
- materials

#### Customer / Recommendation
- customers
- customer_identities
- customer_events
- customer_segments
- recommendation_events

#### Commerce
- orders
- order_items
- order_events
- payments
- shipments
- tracking_events

#### Marketing
- ad_accounts
- campaigns
- campaign_metrics
- marketing_attribution

#### Creator / Affiliate
- influencers
- influencer_campaigns
- affiliates
- affiliate_conversions

#### Agent / Audit
- conversations
- messages
- agent_tasks
- agent_runs
- audit_logs
- webhook_deliveries
- knowledge_documents

## Warehouse / BI（建议，未实现）
交易数据库之外，建议把 events/metrics CDC 到 BigQuery/Snowflake/ClickHouse：
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
