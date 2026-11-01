# Agent Functions

更新：2026-11-01（对应 620ba20 之后的 main）。客户聊天 Agent 的完整说明见
[`Wed.AI-Agent-标准文档.txt`](Wed.AI-Agent-标准文档.txt)；各通道入口见 [`../AGENT_FRAMEWORK.txt`](../AGENT_FRAMEWORK.txt)。

## 1. 客户聊天 Agent（线上主力，公开）

入口：首页页头 “Ask Wed.AI”（主图区对话面板，无悬浮气泡）、`/?ask=1`、第三方网站 `widget.js`、`POST /api/pod-agent/chat`。

- 运费报价（与结账同一报价函数）
- 商品问答、阶梯价、推荐卡片（按场合 / 预算）
- 订单查询（订单号 + 下单邮箱）与物流状态（YunExpress / 4PX 发货记录）
- 政策（运输、退换货、付款）与知识库问答
- 优惠码校验；销售折扣（默认关闭）
- 转人工（Admin 队列）、👍/👎 评价、护栏
- 中 / 英 / 德回复，识别法语、意大利语
- 本地优先：置信度 ≥ 0.6 本地回答；模型只在配置密钥时用于复杂问题（线上未配置 → 规则模式）

后台：Admin → “AI 客服 / Chat agent”（Overview 15 项 KPI、Handoffs、Conversations、Knowledge、Settings、Data check）。

## 2. 后台运营 Agent（管理员）

入口：Admin → “Agent 任务中心” 等页面的 AI 按钮 → `POST /api/agent/ops`。纯关键词意图，不调用模型。

| 意图 | 能做什么 |
|---|---|
| overview | 读后台总览 |
| catalog | 读商品；建 `catalog_sync` 或 `product_list`（推送 Shopify）审批任务 |
| marketing | 读营销指标与优化建议；投放/预算类请求建 `campaign_publish` 任务 |
| inbox | 读会话；“回复”类请求建 `cs_reply` 任务 |
| creator | 读达人数据；外联请求建 `influencer_outreach` 任务 |
| finance | 财务汇总（收入、成本、贡献利润） |
| customer | 客户画像 |
| operations | 读订单与运单（只读） |
| tasks | 列任务 |

写操作只建任务；审批（`POST /api/saas/tasks/:id/approve`）只改状态，**目前不会自动执行**。

## 3. 不在 Agent 里的功能

多店铺、商品同步、订单 / Proof / 生产 / 物流、价目表、费用与税、优惠码、Customer 360、营销草稿、财务等由 Admin 对应分区和 `/api/saas/*` 直接提供（见 `ADMIN_UX.md`），不是 Agent 自动完成的。
