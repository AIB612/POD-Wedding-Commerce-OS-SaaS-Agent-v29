/**
 * POD Agent — Independent module for Print-on-Demand e-commerce.
 *
 * Can be integrated into Wedding Commerce OS or run standalone.
 * Handles: product listing, order fulfillment, customer service, catalog sync.
 *
 * Usage:
 *   import { PODAgent } from "./pod-agent/index.js";
 *   const agent = new PODAgent({ tenantId, connectors });
 *   await agent.handle({ intent: "list_products", payload });
 */

export class PODAgent {
  constructor({ tenantId, connectors = {}, store = null }) {
    this.tenantId = tenantId;
    this.connectors = connectors; // { shopify, messaging, logistics }
    this.store = store;           // data access layer
    this.handlers = {
      list_products: this.listProducts.bind(this),
      fulfill_orders: this.fulfillOrders.bind(this),
      reply_customer: this.replyCustomer.bind(this),
      sync_catalog: this.syncCatalog.bind(this),
      check_status: this.checkStatus.bind(this)
    };
  }

  async handle({ intent, payload = {}, autoApprove = false }) {
    const handler = this.handlers[intent];
    if (!handler) return { error: "unknown_intent", intent };
    const task = await this.createTask(intent, payload);
    if (autoApprove || payload.approved) {
      return this.execute(task);
    }
    return { task_id: task.id, status: "pending_approval", intent };
  }

  async createTask(type, payload) {
    const id = `pod_${Date.now().toString(36)}`;
    const task = { id, tenant_id: this.tenantId, type, payload, status: "pending", created_at: new Date().toISOString() };
    if (this.store?.addRecord) await this.store.addRecord("pod_tasks", task);
    return task;
  }

  async execute(task) {
    const handler = this.handlers[task.type];
    if (!handler) return { error: "no_handler", type: task.type };
    try {
      const result = await handler(task.payload);
      if (this.store?.updateRecord) await this.store.updateRecord("pod_tasks", task.id, { status: "done", result, executed_at: new Date().toISOString() });
      return { task_id: task.id, status: "done", result };
    } catch (e) {
      return { task_id: task.id, status: "failed", error: e.message };
    }
  }

  // --- Handlers ---

  async listProducts({ products = [], shops = [] }) {
    const results = [];
    const push = this.connectors.shopify?.pushProduct;
    if (!push) return { error: "shopify_not_connected" };
    for (const shop of shops.slice(0, 5)) {
      for (const prod of products.slice(0, 20)) {
        try {
          await push(shop, prod.id || prod);
          results.push({ shop, product: prod.id || prod, status: "listed" });
        } catch (e) {
          results.push({ shop, product: prod.id || prod, status: "failed", error: e.message });
        }
      }
    }
    return { listed: results.filter(r => r.status === "listed").length, failed: results.filter(r => r.status === "failed").length, details: results };
  }

  async fulfillOrders({ orders = [], tracking = {} }) {
    const results = [];
    const fulfill = this.connectors.logistics?.createFulfillment || this.connectors.shopify?.fulfillmentCreate;
    if (!fulfill) return { error: "fulfillment_not_connected" };
    for (const order of orders.slice(0, 50)) {
      try {
        const info = tracking[order.id] || {};
        await fulfill(order.shop || order.store, { orderId: order.external_id || order.id, tracking: info });
        results.push({ order: order.id, status: "fulfilled" });
      } catch (e) {
        results.push({ order: order.id, status: "failed", error: e.message });
      }
    }
    return { fulfilled: results.filter(r => r.status === "fulfilled").length, failed: results.filter(r => r.status === "failed").length, details: results };
  }

  async replyCustomer({ conversationId, message, channel = "email" }) {
    const send = this.connectors.messaging?.sendMessage;
    if (!send) return { error: "messaging_not_connected" };
    try {
      await send({ channel, conversationId, text: message });
      return { conversationId, status: "sent", channel };
    } catch (e) {
      return { conversationId, status: "failed", error: e.message };
    }
  }

  async syncCatalog({ source = "supplier" }) {
    // Placeholder: import from supplier feed, normalize, store
    return { status: "synced", source, note: "Catalog sync requires supplier connector" };
  }

  async checkStatus({ type = "orders" }) {
    if (!this.store?.listForTenant) return { error: "store_not_connected" };
    const items = await this.store.listForTenant(type, this.tenantId);
    return { type, count: items.length, sample: items.slice(0, 5) };
  }
}

export default PODAgent;
