// External-AI-agent E2E against a LOCAL WooCommerce test store: discover the store's agent API from
// <store>/.well-known/pod-ai-agent.json, connect with the official MCP TypeScript SDK (Streamable HTTP), list tools,
// search products, read one, create a checkout link — then open the link in a real browser and check that the cart is
// prefilled, the coupon applied and the shopper lands on the store's checkout (nothing is paid).
//   MCP_SDK_DIR=/path/to/node_modules/@modelcontextprotocol/sdk  WP_URL=http://127.0.0.1:8088  [PLAYWRIGHT_MODULE=… CHROME=…]  node mcp-agent-e2e.mjs
const SDK = process.env.MCP_SDK_DIR || "@modelcontextprotocol/sdk";
const { Client } = await import(SDK.startsWith("@") ? `${SDK}/client/index.js` : `${SDK}/dist/esm/client/index.js`);
const { StreamableHTTPClientTransport } = await import(SDK.startsWith("@") ? `${SDK}/client/streamableHttp.js` : `${SDK}/dist/esm/client/streamableHttp.js`);
const WP = process.env.WP_URL || "http://127.0.0.1:8088";
const results = []; const ok = (c, n, x = "") => results.push(`${c ? "PASS" : "FAIL"}  ${n}${x ? `  — ${x}` : ""}`);

const disc = await (await fetch(`${WP}/.well-known/pod-ai-agent.json`)).json();
ok(disc.mcp?.url && disc.platform === "woocommerce", "discovery (.well-known on the store)", disc.mcp?.url);
const client = new Client({ name: "podai-e2e-agent", version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(disc.mcp.url)));
ok(client.getServerVersion()?.name === "pod-ai-store-agent", "MCP initialize (SDK)", `${client.getServerVersion()?.name} · protocol ${client.transport?.protocolVersion || "negotiated"}`);
const { tools } = await client.listTools();
ok(tools.map(t => t.name).join(",") === "get_store_info,search_products,get_product,create_checkout_link", "tools/list", tools.map(t => t.name).join(", "));
const info = (await client.callTool({ name: "get_store_info", arguments: {} })).structuredContent;
ok(info.currency && info.name, "get_store_info", `${info.name} · ${info.currency}`);
const s = (await client.callTool({ name: "search_products", arguments: { query: "warm wool scarf", max_price: 100 } })).structuredContent;
const scarf = s.products.find(p => /scarf/i.test(p.title));
ok(!!scarf && scarf.price > 0 && scarf.in_stock, "search_products (in stock, real price)", scarf ? `${scarf.title} ${scarf.price} ${s.currency}` : JSON.stringify(s).slice(0, 120));
const de = (await client.callTool({ name: "search_products", arguments: { query: "Socken" } })).structuredContent;
ok(de.count >= 0, "search_products in German", de.products.map(p => p.title).join(", ") || "(none)");
const all = (await client.callTool({ name: "search_products", arguments: { limit: 20 } })).structuredContent;
ok(all.products.every(p => p.in_stock && p.price > 0), "every product in stock with price > 0", `${all.count} products`);
const variable = all.products.find(p => p.variants.length > 1 || p.purchase === "choose a variant_id");
const detail = (await client.callTool({ name: "get_product", arguments: { product_id: scarf.id } })).structuredContent;
ok(detail.product?.id === scarf.id, "get_product", detail.product?.url);
const items = [{ product_id: scarf.id, quantity: 2 }];
if (variable) items.push({ product_id: variable.id, variant_id: variable.variants[0].id, quantity: 1 });
const co = (await client.callTool({ name: "create_checkout_link", arguments: { items, coupon: "WELCOME10" } })).structuredContent;
ok(/podai_cart=/.test(co.checkout_url) && co.subtotal > 0, "create_checkout_link", `${co.checkout_url} · subtotal ${co.subtotal} ${co.currency}`);
const err = await client.callTool({ name: "get_product", arguments: { product_id: "999999" } });
ok(err.isError === true, "unknown product → tool error (not a crash)");
await client.close();

// open the link like a shopper would
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); const jsErr = []; p.on("pageerror", e => jsErr.push(e.message));
await p.goto(co.checkout_url, { waitUntil: "networkidle" });
const cart = await p.evaluate(async () => (await fetch("/index.php?rest_route=/wc/store/v1/cart", { credentials: "same-origin" })).json());
ok(/checkout|page_id=7/.test(p.url()), "link opens the store checkout", p.url());
ok(cart.items?.length === items.length && cart.items.find(i => String(i.id) === scarf.id)?.quantity === 2, "cart prefilled", cart.items?.map(i => `${i.quantity}× ${i.name}`).join(", "));
ok((cart.coupons || []).some(c => c.code === "welcome10"), "coupon applied", `total ${cart.totals?.total_price} (minor units)`);
if (process.env.SHOTS_DIR) await p.screenshot({ path: `${process.env.SHOTS_DIR}/14-agent-checkout.png`, fullPage: false });
ok(!jsErr.length, "no JS errors", jsErr.join(" | "));
await b.close();
console.log(results.join("\n")); const f = results.filter(r => r.startsWith("FAIL")).length; console.log(`\n${results.length - f}/${results.length} passed`); process.exit(f ? 1 : 0);
