// npm run test:seller — seller publish flow (mockup media upload, listing validation, productSet + Markets prices). Shopify HTTP mocked.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SHOPIFY_API_KEY = "test_key";
process.env.SHOPIFY_API_SECRET = "test_secret";
process.env.APP_URL = "https://app.example.com";
process.env.STORE_PERSIST_PATH = "";
process.env.ADMIN_API_KEY = "change-me";

const { openDb, setDb } = await import("./db/index.js");
const repo = await import("./shopify/repo.js");
const seller = await import("./shopify/seller.js");
const { createApp } = await import("./create-app.js");

let pass = 0;
const test = async (name, fn) => { await fn(); pass++; console.log(`  ok  ${name}`); };
const SHOP = "dropkingdev.myshopify.com";
const calls = [], realFetch = globalThis.fetch;
globalThis.fetch = async (url, opt = {}) => {
  url = String(url);
  if (!/^https:\/\/[^/]+\.myshopify\.com\//.test(url)) return realFetch(url, opt);
  const body = JSON.parse(opt.body || "{}"); calls.push(body);
  const ok = data => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  const q = body.query || "";
  if (q.includes("shop { currencyCode }")) return ok({ data: { shop: { currencyCode: "CHF" } } });
  if (q.includes("productSet")) return ok({ data: { productSet: { product: { id: "gid://shopify/Product/77", legacyResourceId: "77", handle: "tee", variants: { nodes: [{ id: "gid://shopify/ProductVariant/88", sku: body.variables.input.variants[0].sku }] } }, userErrors: [] } } });
  if (q.includes("priceLists(")) return ok({ data: { priceLists: { nodes: [{ id: "gid://shopify/PriceList/1", currency: "EUR", name: "EU" }] } } });
  if (q.includes("priceListFixedPricesAdd")) return ok({ data: { priceListFixedPricesAdd: { prices: [{ variant: { id: "x" } }], userErrors: [] } } });
  return ok({ errors: [{ message: "unmocked" }] });
};
// 1x1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const listing = images => ({ product_id: "tee", title: "Anna & Ben tee", images, prices: { EUR: 29.9, CHF: 28.9, USD: 34.9 },
  shipping: { fee: { EUR: 4.9, CHF: 6.5, USD: 5.5 }, processing_days: 3, weight_g: 180, ship_from: "CH", zones: ["CH", "EU"] } });

console.log("seller-test");
await setDb(await openDb({ driver: "memory" }));

await test("listing validation: prices in all three currencies, images required", () => {
  assert.throws(() => seller.cleanListing({ ...listing(["https://a.b/seller-media/" + "a".repeat(24) + ".png"]), prices: { EUR: 10, CHF: 10 } }), /USD/);
  assert.throws(() => seller.cleanListing(listing([])), /mockup/);
  assert.throws(() => seller.cleanListing(listing(["https://evil.example/x.png"])), /mockup/);
  const l = seller.cleanListing(listing(["https://a.b/seller-media/" + "a".repeat(24) + ".png"]));
  assert.deepEqual(l.prices, { EUR: 29.9, CHF: 28.9, USD: 34.9 }); assert.equal(l.status, "DRAFT");
});
await test("productSet input: shop-currency price, weight, files, three-currency + shipping metafields", () => {
  const l = seller.cleanListing(listing(["https://a.b/seller-media/" + "b".repeat(24) + ".png"]));
  const inp = seller.buildSellerProductInput(l, { shopCurrency: "USD" });
  assert.equal(inp.variants[0].price, "34.90");
  assert.deepEqual(inp.variants[0].inventoryItem.measurement.weight, { value: 180, unit: "GRAMS" });
  assert.equal(inp.files[0].originalSource, l.images[0]); assert.equal(inp.vendor, "POD Wedding Studio");
  const mf = Object.fromEntries(inp.metafields.map(m => [m.key, m.value]));
  assert.deepEqual(JSON.parse(mf.retail_prices), { EUR: 29.9, CHF: 28.9, USD: 34.9 });
  assert.deepEqual(JSON.parse(mf.shipping_fee), { EUR: 4.9, CHF: 6.5, USD: 5.5 });
  assert.equal(mf.processing_days, "3");
  assert.equal(seller.buildSellerProductInput(l, { shopCurrency: "GBP", fx: { GBP: 0.9 } }).variants[0].price, "26.01");
});
await test("HTTP: media upload -> public URL; publish needs connected + owned shop; returns admin link", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seller-"));
  const app = await createApp({ generatedDir: dir });
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    let r = await realFetch(`${base}/api/seller/media`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data_url: "data:image/png;base64,AAAA" }) });
    assert.equal(r.status, 400);
    r = await realFetch(`${base}/api/seller/media`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data_url: PNG }) });
    const m = await r.json(); assert.equal(r.status, 200, JSON.stringify(m));
    assert.match(m.url, /^https:\/\/app\.example\.com\/seller-media\/[a-f0-9]{24}\.png$/); assert.equal(m.public, true);
    r = await realFetch(`${base}/seller-media/${m.id}.png`); assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal((await realFetch(`${base}/seller-media/../x.png`)).status, 404);
    // not connected
    r = await realFetch(`${base}/api/seller/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop: SHOP, ...listing([m.url]) }) });
    assert.equal(r.status, 409);
    await repo.saveShop({ shop: SHOP, tenantId: "tenant_demo", accessToken: "shpat_x", scopes: "write_products" });
    // connected but anonymous non-admin session: forbidden
    r = await realFetch(`${base}/api/seller/publish`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-api-key": "wrong" }, body: JSON.stringify({ shop: SHOP, ...listing([m.url]) }) });
    assert.equal(r.status, 403);
    r = await realFetch(`${base}/api/seller/publish`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-api-key": "change-me" }, body: JSON.stringify({ shop: SHOP, ...listing([m.url]) }) });
    const d = await r.json(); assert.equal(r.status, 200, JSON.stringify(d));
    assert.equal(d.admin_url, "https://admin.shopify.com/store/dropkingdev/products/77");
    assert.deepEqual(d.prices_synced.sort(), ["CHF", "EUR"]); assert.ok(d.warnings.some(w => /USD/.test(w)));
    const ps = calls.find(c => c.query?.includes("productSet")); assert.equal(ps.variables.input.variants[0].price, "28.90");
    const fp = calls.find(c => c.query?.includes("priceListFixedPricesAdd")); assert.equal(fp.variables.prices[0].price.amount, "29.90");
  } finally { srv.close(); }
});
console.log(`seller-test: ${pass} passed`);
process.exit(0);
