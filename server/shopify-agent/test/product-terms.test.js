// Product search wording: light synonyms + singular/plural (EN / DE / FR / IT / ZH) and generic "what do you sell" requests.
import assert from "node:assert/strict";
const { productTerms, BROWSE_RE } = await import("../profile.js");

for (const q of ["What products do you sell?", "what do you sell", "Quels produits vendez-vous ?", "Qu'est-ce que vous vendez ?", "Welche Produkte habt ihr?", "Was verkauft ihr?",
  "Che prodotti vendete?", "Quali prodotti avete?", "你们卖什么？", "你们卖什么产品？", "有哪些商品", "Show me your products", "What's in your shop?"])
  assert.ok(BROWSE_RE.test(q), `browse: ${q}`);
for (const q of ["Do you have t-shirts?", "Where is my order?", "Is the code ALPS10 valid?", "What is your return policy?"]) assert.ok(!BROWSE_RE.test(q), `not browse: ${q}`);

const has = (q, ...want) => { const t = productTerms(q); for (const w of want) assert.ok(t.includes(w), `${q} → ${JSON.stringify(t)} lacks ${w}`); };
has("Do you have t-shirts?", "tee", "t-shirt"); has("Habt ihr T-Shirts?", "tee", "t-shirt"); has("Do you sell tees?", "tee"); has("tshirt", "t-shirt");
has("Avete magliette?", "tee"); has("你们有T恤吗？", "tee"); has("Haben Sie Tassen?", "mug"); has("Do you sell mugs?", "mug", "cup"); has("hoodies please", "hoodie");
has("Do you have candles", "candle"); has("organic cotton tees", "organic", "cotton", "tee"); has("Do you have blankets?", "blankets", "blanket"); has("any wallets", "wallet");
assert.deepEqual(productTerms("Do you have any?"), [], "question words only → no search terms");
assert.ok(productTerms("Do you have t-shirts?").length <= 10);
console.log(JSON.stringify({ product_terms: "pass" }));
