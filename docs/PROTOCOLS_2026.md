# 2026 Agentic Commerce / Agent Protocols

本项目不是押注单一协议，而是分层兼容。

## 1. Universal Commerce Protocol (UCP)

用途：AI 商务发现、Checkout、Order/Fulfillment 等标准能力。2026 年 Google 和 Shopify 都把 UCP 用作 agentic commerce 基础层。

项目：
- `GET /.well-known/ucp`
- `server/protocols/commerce-protocols.js`
- `UCP_VERSION=2026-01-23`

Google 的生产接入仍可能需要 Merchant Center、Google Pay 和审批/Waitlist；不要把本地 Profile 当成自动获得 AI Mode/Gemini 上线资格。

## 2. OpenAI Agentic Commerce Protocol (ACP)

用途：把结构化商品 Feed 提供给 ChatGPT 商务发现。

项目：
- `GET /api/ai-discovery/acp-feed`

Feed 当前是示例适配层。生产需要按照 OpenAI 当前 onboarding/schema 调整，并遵循 partner access 条件。

## 3. Model Context Protocol (MCP)

用途：Agent 垂直连接工具和数据。

项目提供 `POST /api/protocols/mcp` 的 JSON-RPC Tool scaffold：
- commerce_overview
- marketing_summary
- create_task

**生产建议替换为官方 MCP SDK/Streamable HTTP transport**，当前代码主要用于明确 Tool Registry 和权限边界。

Shopify 还提供 UCP Catalog MCP endpoint：Global Catalog 和单 Storefront Catalog，可用于 Agent 商品发现。

## 4. A2A (Agent2Agent)

用途：专业 Agent 之间水平委派。

项目：
- `GET /.well-known/agent-card.json`
- `POST /api/a2a`

可拆成：
- Catalog Agent
- Order/Fulfillment Agent
- Marketing Agent
- Finance Agent
- Creator/Affiliate Agent
- Customer Service Agent

主 Orchestrator 通过 A2A 委派，工具层继续由 MCP/API 控制。

## 协议分层

```
AI surfaces / external agents
        |
  UCP / ACP / A2A
        |
Commerce Orchestrator Agent
        |
       MCP
        |
Shopify / PayPal / Ads / Logistics / DB / RAG
```

## 参考（2026-10-05 校验）

- Shopify Spring '26 Agentic Commerce: https://www.shopify.com/news/spring-26-edition-dev
- Shopify Catalog/UCP MCP: https://shopify.dev/docs/agents/catalog
- Google UCP: https://developers.google.com/merchant/ucp
- UCP specification: https://ucp.dev/
- OpenAI ACP: https://developers.openai.com/commerce
- A2A: https://a2a-protocol.org/
- MCP: https://modelcontextprotocol.io/
