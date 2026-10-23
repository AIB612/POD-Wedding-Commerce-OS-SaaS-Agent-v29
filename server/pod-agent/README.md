# POD Agent

Independent module for Print-on-Demand e-commerce operations.

## Features

- **Product Listing**: Push products to connected Shopify stores
- **Order Fulfillment**: Mark orders as shipped with tracking
- **Customer Service**: Send replies to customer conversations
- **Catalog Sync**: Import and normalize supplier feeds
- **Status Check**: Query orders, products, shipments

## Integration

```js
import { PODAgent } from "./server/pod-agent/index.js";

const agent = new PODAgent({
  tenantId: "tenant_demo",
  connectors: {
    shopify: { pushProduct, fulfillmentCreate },
    messaging: { sendMessage },
    logistics: { createFulfillment }
  },
  store: { addRecord, updateRecord, listForTenant, findRecord }
});

// Create task (pending approval)
const task = await agent.handle({ intent: "list_products", payload: { products, shops } });

// Execute approved task
const result = await agent.execute(task);
```

## Separation

This module has no hard dependencies on Wedding Commerce OS internals.
To run standalone, provide your own connectors and store implementations.

## Intents

| Intent | Description |
|--------|-------------|
| `list_products` | Push products to Shopify |
| `fulfill_orders` | Mark orders as shipped |
| `reply_customer` | Send customer service reply |
| `sync_catalog` | Import supplier catalog |
| `check_status` | Query current status |
