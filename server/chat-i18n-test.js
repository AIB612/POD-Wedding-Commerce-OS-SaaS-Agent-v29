// Site chat (pod.swisspro.site): replies in the shopper's language (EN/DE/FR/IT/ZH), "what do you sell" in every language,
// product words like "magliette", products we don't carry, and payment methods that match /api/payments/methods (no TWINT unless configured).
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", PAYPAL_CLIENT_ID: "test-client", PAYPAL_CLIENT_SECRET: "test-secret" });
delete process.env.STORE_PERSIST_PATH;
for (const k of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY", "DEEPSEEK_API_KEY", "LLM_API_KEY"]) delete process.env[k];
const { detectLanguage, BROWSE_RE, askedProduct, productTerms } = await import("./shared/lang-terms.js");
const { createApp } = await import("./create-app.js");
const result = {};

// 1. Shared language + term layer (used by the site chat and the Pod.AI app chat)
for (const [q, l] of [["Que vendez-vous ?", "fr"], ["Cosa vendete?", "it"], ["Avete magliette?", "it"], ["Was verkauft ihr?", "de"], ["你们卖什么", "zh"], ["What do you sell?", "en"], ["Quels moyens de paiement acceptez-vous ?", "fr"], ["Quali metodi di pagamento accettate?", "it"]])
  assert.equal(detectLanguage(q, "en"), l, `language of "${q}"`);
for (const q of ["Que vendez-vous ?", "Cosa vendete?", "Was verkauft ihr?", "What do you sell?", "你们卖什么"]) assert.ok(BROWSE_RE.test(q), `browse: ${q}`);
assert.ok(productTerms("Avete magliette?").includes("tee"));
assert.equal(askedProduct("Do you sell sofas?"), "sofas"); assert.equal(askedProduct("Avete divani?"), "divani"); assert.equal(askedProduct("Do you have any?"), null);
result.shared_layer = "pass";

// 2. HTTP chat
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-chat-"));
const app = await createApp({ generatedDir: tmp }); const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}`;
const ask = async (message, lang = "en") => (await fetch(base + "/api/pod-agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, lang }) })).json();
try {
  let r = await ask("Que vendez-vous ?", "fr"); assert.equal(r.language, "fr"); assert.equal(r.intent, "browse"); assert.match(r.answer, /papeterie de mariage/);
  r = await ask("Cosa vendete?", "it"); assert.equal(r.language, "it"); assert.equal(r.intent, "browse"); assert.match(r.answer, /cartoleria per matrimoni/);
  r = await ask("Was verkauft ihr?", "de"); assert.equal(r.intent, "browse"); assert.match(r.answer, /Hochzeitspapeterie/);
  r = await ask("Avete magliette?", "it"); assert.equal(r.language, "it"); assert.equal(r.intent, "product_question"); assert.match(r.answer, /tee|t-shirt/i); assert.match(r.answer, / da 1/);
  r = await ask("Bonjour", "fr"); assert.match(r.answer, /^Bonjour/);
  r = await ask("Ciao", "it"); assert.match(r.answer, /^Ciao/);
  r = await ask("Combien de temps prend la livraison ?", "fr"); assert.equal(r.language, "fr"); assert.match(r.answer, /jours ouvrables/);
  r = await ask("Quanto costa la spedizione in Svizzera per 10 inviti?", "it"); assert.match(r.answer, /verso la Svizzera/);
  result.fr_it_de = "pass";
  for (const [q, l, re] of [["Do you sell sofas?", "en", /we don't sell sofas/], ["Avete divani?", "it", /non vendiamo divani/], ["Vendez-vous des canapés ?", "fr", /ne vendons pas de canapés/], ["Habt ihr Sofas?", "de", /führen wir keine Sofas/], ["你们有沙发吗", "zh", /不卖沙发/]]) {
    r = await ask(q, l); assert.equal(r.intent, "unknown_product", q); assert.match(r.answer, re, q);
  }
  r = await ask("Do you sell mugs?"); assert.equal(r.intent, "product_question", "mugs are in the catalogue"); assert.match(r.answer, /mug/i);
  result.unknown_products = "pass";
  const methods = await (await fetch(base + "/api/payments/methods")).json();
  for (const [q, l] of [["Which payment methods do you accept?", "en"], ["Quels moyens de paiement acceptez-vous ?", "fr"], ["Welche Zahlungsarten gibt es?", "de"], ["支持哪些付款方式", "zh"]]) {
    r = await ask(q, l); assert.equal(r.intent, "payment", q);
    assert.equal(/TWINT/.test(r.answer), !!methods.twint.configured, `TWINT only when configured: ${r.answer}`);
    assert.equal(/PayPal/.test(r.answer), !!methods.paypal.configured, `PayPal only when configured: ${r.answer}`);
  }
  r = await ask("my card is 4111 1111 1111 1111"); assert.ok(!/TWINT/.test(r.answer));
  const http = await import("node:http");
  const getHost = (p, host) => new Promise((ok, ko) => http.get({ host: "127.0.0.1", port: server.address().port, path: p, headers: { Host: host } }, res => { let b = ""; res.on("data", c => (b += c)); res.on("end", () => ok({ status: res.statusCode, body: b })); }).on("error", ko));
  for (const host of ["pod.swisspro.site", "podai.swisspro.site"]) {
    const llms = await getHost("/llms.txt", host); assert.equal(llms.status, 200, host); assert.ok(llms.body.length > 200, host);
    assert.ok(!/TWINT/i.test(llms.body) || methods.twint.configured, `${host}/llms.txt must not claim TWINT`); assert.ok(!/51tracking/i.test(llms.body), `${host}/llms.txt must not mention 51Tracking`);
  }
  result.payment_methods = "pass";
} finally { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, result }, null, 2));
