// Pod.AI: retention purge + customer redact removes linked events.
import assert from "node:assert/strict"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import test from "node:test";
Object.assign(process.env, { NODE_ENV: "test", STORE_PERSIST_PATH: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "podai-pv-")), "s.json") });
const { addRecord, listForTenant } = await import("../../saas-store.js");
const gdpr = await import("../gdpr.js");
test("retention purge and customer redact", async () => {
  const T = "shopagent_pv.myshopify.com", old = new Date(Date.now() - 400 * 864e5).toISOString(), nw = new Date().toISOString();
  await addRecord("podai_conversations", { id: "c_old", tenant_id: T, last_message_at: old, messages: [] });
  await addRecord("podai_conversations", { id: "c_new", tenant_id: T, last_message_at: nw, slots: { email: "anna@example.com" }, messages: [] });
  await addRecord("podai_events", { id: "e1", tenant_id: T, type: "chat_open", conversation_id: "c_new", at: nw });
  await addRecord("podai_events", { id: "e2", tenant_id: T, type: "chat_open", conversation_id: null, at: new Date(Date.now() - 500 * 864e5).toISOString() });
  await addRecord("podai_conversations", { id: "c_site", tenant_id: "tenant_site", last_message_at: old, messages: [] });
  const r = await gdpr.purgeExpired();
  assert.equal(r.podai_conversations, 1); assert.equal(r.podai_events, 1);
  assert.equal((await listForTenant("podai_conversations", "tenant_site")).length, 1, "never touches non-Pod.AI tenants");
  await gdpr.customerRedact("pv.myshopify.com", { customer: { email: "anna@example.com" } });
  assert.equal((await listForTenant("podai_conversations", T)).length, 0); assert.equal((await listForTenant("podai_events", T)).length, 0);
});

test("retention purge never removes podai_shops", async () => {
  const T = "shopagent_keep.myshopify.com";
  await addRecord("podai_shops", { id: "keep.myshopify.com", tenant_id: T, access_token_enc: "enc", scopes: "read_products" });
  await addRecord("podai_conversations", { id: "c_old2", tenant_id: T, last_message_at: new Date(Date.now() - 400 * 864e5).toISOString(), messages: [] });
  const before = (await listForTenant("podai_shops", T)).length || (await listForTenant("podai_shops", "keep.myshopify.com")).length;
  // listForTenant matches tenant_id OR id — shop id is the domain
  const { findRecord } = await import("../../saas-store.js");
  assert.ok(await findRecord("podai_shops", "keep.myshopify.com"));
  await gdpr.purgeExpired();
  assert.ok(await findRecord("podai_shops", "keep.myshopify.com"), "shop token row must survive retention purge");
});
