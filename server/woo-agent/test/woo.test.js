// Pod.AI for WooCommerce (server/woo-agent): registration verified by the site, HMAC-signed plugin API (stale / replay /
// tampered rejected), per-site isolation, catalogue sync + local search, recommendations (in-stock, real prices) + refinement,
// order lookup via signed callback (e-mail check, lock), visible coupon, shipping zones, contact-us ticket (mail only to the
// allowlisted ticket e-mail), ticket admin, disconnect cleanup; Shopify webhook still rejects unsigned calls.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "podai-woo-"));
for (const k of ["LLM_PROVIDER", "LLM_ENABLED", "OPENAI_API_KEY", "XAI_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "SENDGRID_API_KEY", "POSTMARK_SERVER_TOKEN", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"]) delete process.env[k];
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"), APP_ENCRYPTION_KEY: "w".repeat(40),
  AGENT_SHOPIFY_API_KEY: "agentkey", AGENT_SHOPIFY_API_SECRET: "agentsecret", AGENT_APP_URL: "https://app.test", TEST_EMAIL_ALLOWLIST: "sherry.branny@gmail.com", PODAI_ACCESS_LOG_DIR: path.join(tmp, "acc") });
const { createApp } = await import("../../create-app.js");
const core = await import("../core.js");
const { getState } = await import("../../saas-store.js");
const { resetWooLocks } = await import("../adapter.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;

// ---- mocked WordPress sites (verify + signed lookup callbacks) ----
const SITES = { "woo-a.test": { nonce: null, creds: null, calls: [] }, "woo-b.test": { nonce: null, creds: null, calls: [] } };
const ORDERS = { "1001": { name: "#1001", created_at: "2026-11-10T10:00:00Z", email: "buyer@example.com", cancelled: false, payment: "paid", fulfillment: "completed", total: "59.00", currency: "CHF",
  items: [{ title: "Edelweiss Mug", quantity: 2 }], tracking: [{ company: "Swiss Post", number: "99.00.123456.78901234", url: "https://service.post.ch/track?n=99.00.123456.78901234" }] } };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); const s = SITES[u.host];
  if (!s) return realFetch(url, init);
  const route = u.searchParams.get("rest_route") || u.pathname.replace(/^\/wp-json/, "");
  if (route.startsWith("/pod-ai/v1/verify")) return Response.json({ nonce: u.searchParams.get("nonce") === s.nonce ? s.nonce : "nope" });
  if (route === "/pod-ai/v1/lookup") {
    const h = init.headers, body = init.body;
    const sig = core.sign(s.creds.secret, { ts: Number(h["X-PodAI-Timestamp"]), method: "POST", route, nonce: h["X-PodAI-Nonce"], body });
    if (h["X-PodAI-Signature"] !== `v1=${sig}` || h["X-PodAI-Site"] !== s.creds.site_id) return Response.json({ ok: false, error: "bad_signature" }, { status: 401 });
    const b = JSON.parse(body); s.calls.push(b);
    if (b.type === "order") { const o = ORDERS[b.order_number]; return Response.json(o && o.email === b.email.toLowerCase() ? { ok: true, order: (({ email, ...x }) => x)(o) } : { ok: false, error: "not_found" }); }
    if (b.type === "coupon") return Response.json({ ok: true, valid: b.code === "ALPS10", summary: "10% off" });
  }
  return new Response("not found", { status: 404 });
};

async function register(host) {
  const s = SITES[host]; s.nonce = crypto.randomBytes(16).toString("hex");
  const r = await realFetch(`${base}/woo-agent/v1/register`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ site_url: `http://${host}`, rest_url: `http://${host}/index.php?rest_route=/`, name: host, nonce: s.nonce, currency: "CHF" }) });
  const d = await r.json(); if (r.ok) s.creds = d; return { status: r.status, d };
}
async function call(host, method, route, body, { tamper, headers: extra, creds } = {}) {
  const c = creds || SITES[host].creds, raw = body === undefined ? "" : JSON.stringify(body);
  const h = core.signedHeaders(c.site_id, c.secret, { method, route: `/woo-agent/v1${route.split("?")[0]}`, body: raw }); // query string is not signed
  const r = await realFetch(`${base}/woo-agent/v1${route}`, { method, headers: { "Content-Type": "application/json", ...h, ...(extra || {}) }, body: method === "GET" ? undefined : (tamper ? raw.replace("a", "b") : raw) });
  return { status: r.status, d: await r.json().catch(() => ({})), h };
}
const chat = async (host, message, conversation_id, lang = "en") => (await call(host, "POST", "/chat", { message, conversation_id, lang })).d;

const P = (id, name, price, extra = {}) => ({ id, name, price, regular_price: price, currency: "CHF", url: `http://woo-a.test/product/${id}`, image: `http://woo-a.test/img/${id}.jpg`, in_stock: true, type: "simple", categories: ["Gifts"], tags: [], ...extra });
const PRODUCTS = [P(11, "Edelweiss Mug", 24, { categories: ["Mugs", "Gifts"], tags: ["coffee", "cup"] }), P(12, "Alpine Wool Scarf", 49, { categories: ["Accessories", "Gifts"], tags: ["women", "winter"] }),
  P(13, "Swiss Chocolate Box", 18, { categories: ["Food", "Gifts"], tags: ["chocolate", "sweet"] }), P(14, "Matterhorn Poster", 35, { categories: ["Art"], tags: ["poster", "print"] }),
  P(15, "Cowbell Keyring", 9, { categories: ["Accessories", "Gifts"], tags: ["souvenir"] }), P(16, "Sold-out Cuckoo Clock", 299, { in_stock: false, categories: ["Gifts"] }), P(17, "Free Sample", 0, { categories: ["Gifts"] }),
  P(18, "Hiking Socks", 15, { type: "variable", categories: ["Clothing"], variations: [{ id: 181, title: "Size: M", price: 15, in_stock: true }, { id: 182, title: "Size: L", price: 15, in_stock: false }] })];

test("registration is verified by the site; a wrong nonce is refused", async () => {
  const bad = await realFetch(`${base}/woo-agent/v1/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site_url: "http://woo-a.test", rest_url: "http://woo-a.test/wp-json/", nonce: "x".repeat(32) }) });
  assert.equal(bad.status, 403);
  const mism = await realFetch(`${base}/woo-agent/v1/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ site_url: "http://woo-a.test", rest_url: "http://evil.test/wp-json/", nonce: "y".repeat(32) }) });
  assert.equal(mism.status, 400);
  const a = await register("woo-a.test"); assert.equal(a.status, 200); assert.match(a.d.site_id, /^ws_[a-f0-9]{16}$/); assert.match(a.d.secret, /^[a-f0-9]{64}$/);
  const b = await register("woo-b.test"); assert.equal(b.status, 200); assert.notEqual(a.d.site_id, b.d.site_id);
  const st = JSON.parse(fs.readFileSync(process.env.STORE_PERSIST_PATH, "utf8"));
  const raw = JSON.stringify(st.podai_woo_sites || []); assert.ok(!raw.includes(a.d.secret) && !raw.includes("woo-a.test"), "site rows (secret, url) encrypted at rest");
});

test("signed API: unsigned, tampered, stale and replayed requests are rejected", async () => {
  assert.equal((await realFetch(`${base}/woo-agent/v1/chat`, { method: "POST", body: "{}" })).status, 401);
  assert.equal((await call("woo-a.test", "POST", "/chat", { message: "hi" }, { tamper: true })).status, 401);
  const c = SITES["woo-a.test"].creds, raw = JSON.stringify({ message: "hi" }), old = Math.floor(Date.now() / 1000) - 900;
  const stale = core.signedHeaders(c.site_id, c.secret, { route: "/woo-agent/v1/chat", body: raw, ts: old });
  assert.equal((await realFetch(`${base}/woo-agent/v1/chat`, { method: "POST", headers: stale, body: raw })).status, 401);
  const h = core.signedHeaders(c.site_id, c.secret, { route: "/woo-agent/v1/chat", body: raw });
  assert.equal((await realFetch(`${base}/woo-agent/v1/chat`, { method: "POST", headers: h, body: raw })).status, 200);
  assert.equal((await realFetch(`${base}/woo-agent/v1/chat`, { method: "POST", headers: h, body: raw })).status, 401, "replay");
  const wrong = { site_id: SITES["woo-b.test"].creds.site_id, secret: c.secret };
  assert.equal((await call("woo-a.test", "POST", "/chat", { message: "hi" }, { creds: wrong })).status, 401, "other site's id with this secret");
});

test("store facts, settings and catalogue sync (full sync removes stale rows)", async () => {
  const s = await call("woo-a.test", "POST", "/store", { store: { name: "Alpine Gifts", email: "shop@example.com", currency: "CHF", url: "http://woo-a.test", checkout_url: "http://woo-a.test/checkout/",
    policies: [{ type: "REFUND_POLICY", title: "Refund and Returns Policy", text: "<p>You can return unused items within 30 days of delivery for a full refund.</p>", url: "http://woo-a.test/refund_returns/" },
      { type: "SHIPPING_POLICY", title: "Shipping", text: "We ship from Zurich within 2 business days. Delivery in Switzerland takes 1-3 days.", url: "http://woo-a.test/shipping/" }],
    shipping: [{ name: "Switzerland", countries: ["CH", "LI"], methods: [{ name: "Flat rate", cost: 7, currency: "CHF" }, { name: "Free shipping", cost: 0, min_amount: 80, currency: "CHF" }] }, { name: "Europe", countries: ["DE", "FR", "IT", "AT"], methods: [{ name: "Flat rate", cost: 15, currency: "CHF" }] }],
    promo: { code: "welcome10", summary: "10% off your first order" } },
    settings: { support_email: "sherry.branny@gmail.com", widget: { color: "#0f766e", position: "left", language: "auto" }, custom_faq: [{ question: "Do you offer gift wrapping?", answer: "Yes, gift wrapping is free — add a note at checkout.", lang: "en" }] } });
  assert.equal(s.status, 200); assert.equal(s.d.support_email, "sherry.branny@gmail.com"); assert.equal(s.d.widget.position, "left"); assert.equal(s.d.faq, 1);
  let r = await call("woo-a.test", "POST", "/products/sync", { mode: "full", sync_id: "s1", products: [...PRODUCTS, P(99, "Old product", 5)], done: true });
  assert.equal(r.d.total, 9);
  r = await call("woo-a.test", "POST", "/products/sync", { mode: "full", sync_id: "s2", products: PRODUCTS, done: true });
  assert.equal(r.d.total, 8); assert.equal(r.d.removed, 1);
  r = await call("woo-a.test", "POST", "/products/sync", { products: [{ id: "x", name: "<b>bad</b>" }] }); assert.equal(r.d.rejected, 1);
  const st = await call("woo-a.test", "GET", "/status"); assert.equal(st.d.catalog.products, 8); assert.equal(st.d.billing.plan, "free"); assert.equal(st.d.billing.payments.enabled, false);
  const cfg = await call("woo-a.test", "GET", "/config"); assert.equal(cfg.d.widget.color, "#0f766e"); assert.equal(cfg.d.promo.code, "WELCOME10");
});

test("chat answers locally in 5 languages from the store's own data", async () => {
  let r = await chat("woo-a.test", "What is your return policy?"); assert.match(r.answer, /30 days/); assert.equal(r.answered_by, "local");
  r = await chat("woo-a.test", "Wie hoch sind die Versandkosten in die Schweiz?", undefined, "de"); assert.match(r.answer, /7\.00|Flat rate/); assert.equal(r.language, "de");
  r = await chat("woo-a.test", "Combien coûte la livraison en France ?", undefined, "fr"); assert.match(r.answer, /15/); assert.equal(r.language, "fr");
  r = await chat("woo-a.test", "Quanto costa la spedizione in Italia?", undefined, "it"); assert.equal(r.language, "it"); assert.match(r.answer, /15/);
  r = await chat("woo-a.test", "你们有什么商品？", undefined, "zh"); assert.equal(r.language, "zh");
  const items = r.ui.find(u => u.type === "products")?.items || []; assert.ok(items.length >= 3);
  assert.ok(items.every(p => p.unit_price > 0 && !/Sold-out|Free Sample/.test(p.name)), "only in-stock products with a real price");
  r = await chat("woo-a.test", "Do you offer gift wrapping?"); assert.match(r.answer, /gift wrapping is free/i);
});

test("recommendations use only this store's sellable products; refinement 'cheaper' works; simple items carry a cart action", async () => {
  let r = await chat("woo-a.test", "I'm looking for a gift for her under 50 CHF");
  const ui = r.ui.find(u => u.type === "products"); assert.ok(ui, r.answer); assert.ok(ui.items.length >= 2);
  assert.ok(ui.items.every(p => p.unit_price > 0 && p.unit_price <= 50 && p.link.startsWith("http://woo-a.test/")));
  assert.ok(ui.items.some(p => p.cart?.product_id), "add-to-cart action for simple products");
  const first = Math.min(...ui.items.map(p => p.unit_price));
  r = await chat("woo-a.test", "something cheaper", r.conversation_id);
  const ui2 = r.ui.find(u => u.type === "products"); assert.ok(ui2, r.answer); assert.ok(Math.min(...ui2.items.map(p => p.unit_price)) <= first);
  const b = await chat("woo-b.test", "I'm looking for a gift for her under 50 CHF"); assert.ok(!(b.ui || []).some(u => u.type === "products"), "store B has no catalogue → never A's products");
});

test("order lookup through the signed callback: e-mail must match, 5 misses lock the order", async () => {
  resetWooLocks();
  let r = await chat("woo-a.test", "Where is my order #1001?"); const c = r.conversation_id;
  r = await chat("woo-a.test", "buyer@example.com", c);
  const o = r.ui.find(u => u.type === "order"); assert.ok(o, r.answer); assert.equal(o.order.name, "#1001");
  const t = r.ui.find(u => u.type === "tracking"); assert.equal(t.number, "99.00.123456.78901234"); assert.match(t.url, /post\.ch/);
  for (let i = 0; i < 5; i++) { r = await chat("woo-a.test", `order 1001 wrong${i}@example.com`); assert.ok(!r.ui.some(u => u.type === "order")); }
  const n = SITES["woo-a.test"].calls.length;
  r = await chat("woo-a.test", "order #1001 buyer@example.com"); assert.ok(!r.ui.some(u => u.type === "order"), "locked"); assert.equal(SITES["woo-a.test"].calls.length, n, "no callback while locked");
  resetWooLocks();
});

test("visible coupon is offered with an apply action; codes are checked through the site", async () => {
  let r = await chat("woo-a.test", "Do you have any discount?"); const cp = r.ui.find(u => u.type === "coupon"); assert.equal(cp?.code, "WELCOME10", r.answer);
  r = await chat("woo-a.test", "Is the code ALPS10 valid?"); assert.match(r.answer, /ALPS10/);
});

test("contact us → ticket POD-T-…, transcript mailed only to the ticket e-mail; admin can list / note / close; isolation", async () => {
  let r = await chat("woo-a.test", "Can I change the colour of my order?"); const c = r.conversation_id;
  r = await chat("woo-a.test", "I want to talk to a person", c); assert.ok(r.handoff);
  const n0 = ((await getState()).notifications || []).length;
  r = await chat("woo-a.test", "anna@example.com", c); assert.match(r.answer, /POD-T-[A-Z2-9]{6}/);
  const sent = ((await getState()).notifications || []).slice(n0);
  assert.equal(sent.length, 1); assert.equal(sent[0].to, "sherry.branny@gmail.com"); assert.match(sent[0].subject, /Alpine Gifts/);
  const { wooData } = await import("../adapter.js"); assert.match(wooData({ id: "ws_x", url: "http://woo-a.test", store: {} }).adminUrl, /\/wp-admin\/admin\.php\?page=pod-ai-chat-tickets$/);
  let list = (await call("woo-a.test", "GET", "/tickets")).d; const tk = list.find(x => x.ticket_id); assert.ok(tk); assert.equal(tk.status, "open"); assert.ok(tk.messages.some(m => /colour/.test(m.text)));
  assert.equal((await call("woo-b.test", "GET", "/tickets")).d.length, 0, "site B sees nothing");
  assert.equal((await call("woo-b.test", "POST", `/tickets/${tk.id}`, { status: "closed" })).status, 404);
  let u = (await call("woo-a.test", "POST", `/tickets/${tk.id}`, { status: "pending", add_note: "Called the customer" })).d; assert.equal(u.status, "pending"); assert.equal(u.notes[0].text, "Called the customer");
  u = (await call("woo-a.test", "PATCH", `/tickets/${tk.id}`, { status: "closed", test: true })).d; assert.equal(u.status, "closed");
  list = (await call("woo-a.test", "GET", "/tickets?status=closed")).d; assert.equal(list.length, 1);
});

test("plan limit: Free = 50 chats / month, then no AI answer (person / e-mail only)", async () => {
  const { recordChat } = await import("../../shopify-agent/billing.js");
  const T = core.tenantFor(SITES["woo-b.test"].creds.site_id);
  for (let i = 0; i < 50; i++) await recordChat(T, `c_fill${i}`);
  const r = await chat("woo-b.test", "What is your return policy?"); assert.ok(r.answer && !/30 days/.test(r.answer)); assert.ok(r.ui.some(u => u.type === "chips"));
});

test("disconnect deletes every record of the site; the Shopify webhook still rejects unsigned calls", async () => {
  const id = SITES["woo-a.test"].creds.site_id, T = core.tenantFor(id);
  const r = await call("woo-a.test", "POST", "/disconnect", {}); assert.equal(r.status, 200); assert.ok(r.d.removed > 0);
  const s = await getState();
  for (const col of ["podai_conversations", "podai_handoffs", "podai_settings", "podai_usage", "podai_woo_sites"]) assert.ok(!(s[col] || []).some(x => x.tenant_id === T || x.id === id), col);
  assert.equal((await call("woo-a.test", "GET", "/status")).status, 401);
  const wh = await realFetch(`${base}/shopify-agent/webhooks`, { method: "POST", body: "{}" }); assert.equal(wh.status, 401);
  server.close();
});

test("WordPress plugin: folder, main file and every translation call use the WordPress.org slug as text domain", () => {
  const SLUG = "pod-ai-chat-for-woocommerce";
  const dir = new URL(`../../../apps/woocommerce-plugin/${SLUG}/`, import.meta.url).pathname;
  const main = fs.readFileSync(path.join(dir, `${SLUG}.php`), "utf8");
  assert.match(main, new RegExp(`Text Domain:\\s+${SLUG}\\n`));
  const pluginUri = main.match(/Plugin URI:\s+(\S+)/)[1], authorUri = main.match(/Author URI:\s+(\S+)/)[1];
  assert.notEqual(pluginUri, authorUri, "Plugin URI must differ from Author URI (WordPress.org review)");
  const version = main.match(/\* Version:\s+([\d.]+)/)[1];
  assert.match(main, new RegExp(`define\\( 'PODAI_CHAT_VERSION', '${version.replace(/\./g, "\\.")}' \\)`));
  assert.match(fs.readFileSync(path.join(dir, "readme.txt"), "utf8"), new RegExp(`Stable tag: ${version.replace(/\./g, "\\.")}\\n`));
  const php = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const a = path.join(d, f); fs.statSync(a).isDirectory() ? walk(a) : a.endsWith(".php") && php.push(a); } })(dir);
  const I18N = /\b(?:__|_e|_x|_ex|_n|_nx|esc_html__|esc_html_e|esc_html_x|esc_attr__|esc_attr_e|esc_attr_x|load_plugin_textdomain)\(([^;]*?)\)\s*[,.;)]/g;
  let calls = 0;
  for (const f of php) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/'(pod-ai-chat[a-z-]*)'/g)) if (m[1] !== SLUG) {
      const line = src.slice(src.lastIndexOf("\n", m.index) + 1, src.indexOf("\n", m.index));
      assert.ok(/self::back\(|add_(sub)?menu_page\(|'page'\s*=>|SLUG\s*=/.test(line), `${path.basename(f)}: '${m[1]}' used outside an admin page slug: ${line.trim().slice(0, 120)}`);
    }
    calls += [...src.matchAll(I18N)].length;
  }
  assert.ok(calls > 100, `translation calls found: ${calls}`);
  const langs = fs.readdirSync(path.join(dir, "languages"));
  assert.ok(langs.length >= 9 && langs.every(f => f.startsWith(SLUG)), langs.join(", "));
});
