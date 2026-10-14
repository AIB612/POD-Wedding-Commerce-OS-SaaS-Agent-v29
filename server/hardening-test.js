// v11 hardening tests for the logistics / connector / data features merged from v10.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-h-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
  APP_ENCRYPTION_KEY: "x".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com", CARRIER_CALLBACK_BUDGET_MS: "300", EXTERNAL_API_TIMEOUT_MS: "200" });
for (const k of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "EASYPOST_API_KEY", "AVALARA_ACCOUNT_ID"]) delete process.env[k];

const { createApp } = await import("./create-app.js");
const { quoteShipping } = await import("./services/shipping-service.js");
const { saveConnectorConfig } = await import("./services/connector-config-service.js");
const { toCsv, parseCsv, previewImport } = await import("./services/data-exchange-service.js");
const { updateRecord, flushStore } = await import("./saas-store.js");
const { timedFetch } = await import("./utils/timed-fetch.js");
const T = "tenant_demo", result = {};
const realFetch = globalThis.fetch;
let route = null; // per-test fetch stub
globalThis.fetch = (url, opt) => (route && route(String(url), opt)) || realFetch(url, opt);

// 1. Live carrier rates in another currency must not be added to a CNY subtotal
await saveConnectorConfig(T, "easypost", { api_key: "EZ", origin_country: "CH", origin_postal: "4051" });
route = u => u.includes("easypost.com") ? Response.json({ rates: [{ carrier: "UPS", service: "Saver", rate: "12.00", currency: "USD", delivery_days: 3 }] }) : null;
let q = await quoteShipping({ tenantId: T, country: "CH", postal_code: "8000", subtotal: 100, currency: "CNY" });
assert.equal(q.rate_engine, "regional_rules"); assert.match(q.live_rate_error, /currency_mismatch/);
result.live_rate_currency_guard = "pass";

// 2. Matching currency → live rates; free-shipping threshold still applies to Standard
route = u => u.includes("easypost.com") ? Response.json({ rates: [{ carrier: "Post", service: "Eco", rate: "30", currency: "CNY", delivery_days: 6 }, { carrier: "DHL", service: "Express", rate: "90", currency: "CNY", delivery_days: 2 }] }) : null;
q = await quoteShipping({ tenantId: T, country: "CH", postal_code: "8000", subtotal: 100, currency: "CNY" });
assert.equal(q.rate_engine, "easypost"); assert.equal(q.shipping_options[0].amount, 30);
q = await quoteShipping({ tenantId: T, country: "CH", postal_code: "8000", subtotal: 1000, currency: "CNY" });
assert.equal(q.shipping_options[0].amount, 0); assert.equal(q.shipping_options[0].free_applied, true);
result.live_rate_free_threshold = "pass";

// 3. Deactivated zones are not matched
await updateRecord("shipping_zones", "zone_de", { active: false });
q = await quoteShipping({ tenantId: T, country: "DE", subtotal: 10, currency: "CNY", live: false });
assert.notEqual(q.zone.id, "zone_de");
await updateRecord("shipping_zones", "zone_de", { active: true });
result.inactive_zone = "pass";

// 4. CSV formula injection guard + lossless round trip
const csv = toCsv([["email", "name", "amount"], ['=HYPERLINK("http://evil","x")', "@SUM(1)", -5]]);
assert.ok(csv.includes(`"'=HYPERLINK`) && csv.includes("'@SUM(1)") && csv.includes(",-5"));
assert.deepEqual(parseCsv(csv)[1], ['=HYPERLINK("http://evil","x")', "@SUM(1)", "-5"]);
result.csv_formula_guard = "pass";

// 5. Zip bomb: an entry claiming 1 GB uncompressed is rejected before inflating
function zipWith(name, data, claimedSize) {
  const comp = zlib.deflateRawSync(data), n = Buffer.from(name);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(claimedSize, 22); local.writeUInt16LE(n.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(claimedSize, 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(0, 42);
  const body = Buffer.concat([local, n, comp]), central = Buffer.concat([cen, n]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, central, end]);
}
assert.throws(() => previewImport({ entity: "customers", format: "xlsx", buffer: zipWith("xl/workbook.xml", Buffer.alloc(1000), 1_000_000_000) }), /too_large/);
assert.throws(() => previewImport({ entity: "customers", format: "xlsx", buffer: zipWith("xl/workbook.xml", Buffer.alloc(5_000_000), 1000) }));
result.zip_bomb_guard = "pass";

// 6. timedFetch aborts slow providers
route = (u, opt) => u.includes("slow.example") ? new Promise((_, rej) => opt.signal.addEventListener("abort", () => rej(opt.signal.reason))) : null;
const keepAlive = setTimeout(() => {}, 2000); // AbortSignal.timeout timers do not keep the process alive
await assert.rejects(timedFetch("https://slow.example/x"), /abort|timeout/i);
clearTimeout(keepAlive);
result.outbound_timeout = "pass";

// HTTP part
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}`;
const post = (p, b) => realFetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
try {
  // 7. Shopify carrier-rate callback: secret, currency, time budget
  await updateRecord("stores", "store_ch_1", { carrier_callback_secret: "s3cret-s3cret-s3cret" });
  const rateReq = cur => ({ rate: { currency: cur, destination: { country: "CH", postal_code: "8000" }, items: [{ quantity: 2, grams: 200, price: 2500 }] } });
  assert.equal((await post("/api/shopify/carrier-rates/store_ch_1?secret=wrong-wrong-wrong-wr", rateReq("CNY"))).status, 401);
  route = u => u.includes("easypost.com") ? new Promise(() => {}) : null; // EasyPost hangs
  const t0 = Date.now();
  let r = await (await post("/api/shopify/carrier-rates/store_ch_1?secret=s3cret-s3cret-s3cret", rateReq("CNY"))).json();
  assert.ok(Date.now() - t0 < 2000, "callback must answer within the budget");
  assert.ok(r.rates.length === 2 && r.rates[0].currency === "CNY" && /^\d+$/.test(r.rates[0].total_price));
  r = await (await post("/api/shopify/carrier-rates/store_ch_1?secret=s3cret-s3cret-s3cret", rateReq("USD"))).json();
  assert.deepEqual(r.rates, [], "regional CNY amounts must not be reported as USD");
  result.carrier_callback = "pass";

  // 8. PayPal credentials from the tenant connector center are used by checkout (no .env)
  await saveConnectorConfig(T, "paypal", { client_id: "TENANT-CLIENT", client_secret: "TENANT-SECRET" });
  let tokenAuth = null;
  route = (u, opt) => {
    if (u.includes("/v1/oauth2/token")) { tokenAuth = Buffer.from(opt.headers.Authorization.split(" ")[1], "base64").toString(); return Response.json({ access_token: "t", expires_in: 3600 }); }
    if (u.endsWith("/v2/checkout/orders")) return Response.json({ id: "PP-T", links: [{ rel: "payer-action", href: "https://paypal.test/T" }] });
    return null;
  };
  const co = await (await post("/api/payments/paypal/create", { cart: [{ sku: "MENU-CARD", quantity: 20 }], customer: { email: "a@b.co" }, shipping: { country: "CH", postal_code: "4051" }, currency: "CNY" })).json();
  assert.equal(co.approval_url, "https://paypal.test/T"); assert.equal(tokenAuth, "TENANT-CLIENT:TENANT-SECRET");
  result.tenant_paypal_credentials = "pass";

  // 9. Connector secrets persist across restarts, encrypted at rest, never returned by the API
  await flushStore();
  const disk = fs.readFileSync(process.env.STORE_PERSIST_PATH, "utf8");
  assert.ok(disk.includes("conn_tenant_demo_paypal") && !disk.includes("TENANT-SECRET"));
  const cfg = await (await realFetch(base + "/api/saas/connectors/paypal/config", { headers: { "x-admin-api-key": "k" } })).text();
  assert.ok(!cfg.includes("TENANT-SECRET") && !cfg.includes("TENANT-CLIENT"));
  result.connector_secrets_at_rest = "pass";

  // 10. Import preview tokens are tenant-bound and expire
  assert.equal((await realFetch(base + "/api/saas/data/import/commit", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-api-key": "k" }, body: JSON.stringify({ approved: true, preview_token: "nope" }) })).status, 400);
  result.import_token_guard = "pass";
} finally {
  server.close(); globalThis.fetch = realFetch; fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, result }, null, 2));
