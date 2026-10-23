# POD Agent

Independent, embeddable AI agent for Print-on-Demand e-commerce.

## Features

- **Multi-AI**: OpenAI (ChatGPT), Anthropic, Gemini, Deepseek, Grok (xAI)
- **Product Listing**: Push products to Shopify
- **Order Fulfillment**: Mark orders shipped with tracking
- **Customer Service**: Reply to customer conversations
- **Embeddable Widget**: Add to any website with one script tag

## Embed on Any Website

```html
<script src="https://your-domain/pod-agent/widget.js" 
        data-tenant="YOUR_TENANT" 
        data-lang="en"
        data-position="bottom-right"></script>
```

## API

```
GET  /api/pod-agent/providers     → { available: ["openai", "gemini", ...] }
POST /api/pod-agent/chat          → { message, tenant, lang, provider? }
POST /api/pod-agent/task          → { intent, payload, tenant, autoApprove? }
```

## Configuration

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-chat
XAI_API_KEY=...
XAI_MODEL=grok-2
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

## Separation

This module has no hard dependencies on Wedding Commerce OS.
To run standalone, mount the router and serve the widget.js file.
