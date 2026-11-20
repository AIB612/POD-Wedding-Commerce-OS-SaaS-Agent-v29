// Pod.AI listing screenshots — local preview server with realistic SAMPLE data (fictional shop "alpine-tees").
// Starts the real Pod.AI server on 127.0.0.1:4555 in test mode (no network, Shopify Admin API mocked offline) and writes
// a fresh admin session token to /tmp/podai-preview/token.txt every 20 s. Used by render-shots.py.
//   node apps/shopify-agent/listing/tools/preview-server.mjs
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const repo = process.argv[2] || new URL("../../../..", import.meta.url).pathname.replace(/\/$/, "");
fs.mkdirSync("/tmp/podai-preview", { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podai-ui-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "s.json"), APP_ENCRYPTION_KEY: "u".repeat(40),
  AGENT_SHOPIFY_API_KEY: "agentkey", AGENT_SHOPIFY_API_SECRET: "agentsecret", AGENT_APP_URL: "http://127.0.0.1:4555", PODAI_ACCESS_LOG_DIR: path.join(tmp, "acc") });
const { createApp } = await import(repo + "/server/create-app.js");
const core = await import(repo + "/server/shopify-agent/core.js");
const store = await import(repo + "/server/saas-store.js");
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, i) => { const s = String(u);
  if (/myshopify\.com\/admin\/oauth\/access_token/.test(s)) return Response.json({ access_token: "tok", scope: core.SCOPES, expires_in: 3600, refresh_token: "rt", refresh_token_expires_in: 7776000 });
  if (/myshopify\.com/.test(s)) return Response.json({ errors: [{ message: "preview" }] }, { status: 200 });
  return realFetch(u, i); };
const A = "alpine-tees.myshopify.com", T = core.tenantFor(A), iso = h => new Date(Date.now() - h * 36e5).toISOString();
const answered = ["Is the mug dishwasher safe?", "Where is my order #1042?", "Do you have size XXL?", "How long does shipping to Germany take?", "What is your return policy?", "Do you have the hoodie in navy?", "Can I pay with TWINT?", "Show me gifts under 30 CHF"];
const unans = ["Do you ship to Iceland?", "Can I change the engraving after ordering?", "Do you offer bulk discounts for 200 shirts?"];
let n = 0;
const billing = await import(repo + "/server/shopify-agent/billing.js");
for (let d = 0; d < 28; d++) for (let k = 0; k < (d % 3 ? 1 : 2); k++) { n++;
  const un = d < 3 && k === 0 ? unans[d] : null, q = un || answered[n % answered.length], handed = n % 9 === 0, prod = /gift|hoodie|XXL/i.test(q);
  const at = iso(d * 24 + 3 + k * 5 + (n % 7));
  await store.addRecord("podai_conversations", { id: "c_" + String(n).padStart(14, "0"), tenant_id: T, channel: "webchat", status: "open", language: ["en", "en", "de", "fr", "en", "it"][n % 6],
    created_at: at, last_message_at: at, intents: { [un ? "other" : /order/.test(q) ? "order_status" : prod ? "product_question" : "shipping"]: 1 }, tools: /order/.test(q) ? { find_order: 1 } : prod ? { search_products: 1 } : {}, slots: {},
    handoff_id: handed ? "ho_x" + n : null,
    messages: [{ role: "user", text: q, at }, { role: "assistant", text: un ? "Sorry." : "Sure.", at: new Date(Date.parse(at) + 2400 + (n % 5) * 600).toISOString(), answered_by: n % 10 === 0 ? "llm" : "local", ...(un ? { unanswered: true } : {}) }] });
  if (new Date(at).getUTCMonth() === new Date().getUTCMonth()) await billing.recordChat(T, "c_" + String(n).padStart(14, "0"), Date.parse(at));
  if (prod) { await store.addRecord("podai_events", { id: "ev_" + n, tenant_id: T, type: "product_click", conversation_id: "c_" + String(n).padStart(14, "0"), at });
    if (n % 2) await store.addRecord("podai_events", { id: "ev_c" + n, tenant_id: T, type: "add_to_cart", conversation_id: "c_" + String(n).padStart(14, "0"), at }); } }
await store.addRecord("podai_handoffs", { id: "ho_a1a1a1a1a1a1", tenant_id: T, conversation_id: "c_00000000000001", status: "open", ticket_id: "POD-T-AB12CD", reason: "Order not arrived", customer_email: "anna@example.com", order_number: "#1042", language: "en",
  messages: [{ role: "user", text: "My order #1042 has not arrived yet, can someone check?", at: iso(31) }, { role: "assistant", text: "I passed this to the team.", at: iso(31) }], created_at: iso(31), updated_at: iso(31) });
await store.addRecord("podai_handoffs", { id: "ho_a2a2a2a2a2a2", tenant_id: T, conversation_id: "c_00000000000002", status: "in_progress", ticket_id: "POD-T-EF34GH", reason: "Custom engraving", customer_email: "marc@example.com", language: "de", messages: [{ role: "user", text: "Kann ich die Gravur nach der Bestellung noch ändern?", at: iso(3) }, { role: "assistant", text: "Ich habe Ihre Frage an das Team weitergegeben.", at: iso(3) }], notes: [{ at: iso(2), text: "Asked production — engraving not started yet." }], created_at: iso(3), updated_at: iso(3) });
const { saveSettings } = await import(repo + "/server/shopify-agent/engine/store.js");
await saveSettings(T, { custom_faq: [
  { id: "kb_1a2b3c4d", question: "Do you offer gift wrapping?", answer: "Yes — gift wrapping is free. Add a note at checkout.", tags: "gift", lang: "en", active: true },
  { id: "kb_2b3c4d5e", question: "Can I pick up my order in Zurich?", answer: "Yes, at our Zurich shop, Mon–Sat 10–18. Choose “Pickup” at checkout.", tags: "pickup", lang: "en", active: true },
  { id: "kb_3c4d5e6f", question: "Are your T-shirts organic cotton?", answer: "Yes, all our T-shirts are made of organic cotton.", tags: "materials", lang: "en", active: true } ] });
const app = await createApp({ generatedDir: tmp }); app.listen(4555, "127.0.0.1");
fs.writeFileSync("/tmp/podai-preview/token.txt", core.signSession(A));
console.log("ready", A);
setInterval(() => fs.writeFileSync("/tmp/podai-preview/token.txt", core.signSession(A)), 20000);
