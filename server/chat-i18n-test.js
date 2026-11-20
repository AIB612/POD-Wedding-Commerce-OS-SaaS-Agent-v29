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
  const getHost = (p, host) => new Promise((ok, ko) => http.get({ host: "127.0.0.1", port: server.address().port, path: p, headers: { Host: host } }, res => { let b = ""; res.on("data", c => (b += c)); res.on("end", () => ok({ status: res.statusCode, headers: res.headers, body: b })); }).on("error", ko));
  for (const host of ["pod.swisspro.site", "podai.swisspro.site"]) {
    const llms = await getHost("/llms.txt", host); assert.equal(llms.status, 200, host); assert.ok(llms.body.length > 200, host);
    assert.ok(!/TWINT/i.test(llms.body) || methods.twint.configured, `${host}/llms.txt must not claim TWINT`); assert.ok(!/51tracking/i.test(llms.body), `${host}/llms.txt must not mention 51Tracking`);
  }
  // Pod.AI pages indexed on pod before the podai split → 301 to podai (clean URL); wedding legal pages stay on pod; sitemap URLs are all 200.
  for (const [p, to] of [["/support", "/support"], ["/docs", "/support"], ["/security.html", "/security"], ["/dpa", "/dpa"]]) {
    const r2 = await getHost(p, "pod.swisspro.site"); assert.equal(r2.status, 301, p); assert.equal(r2.headers.location, "https://podai.swisspro.site" + to, p);
    assert.equal((await getHost(p, "podai.swisspro.site")).status, 200, "podai " + p);
  }
  for (const p of ["/privacy", "/terms"]) assert.equal((await getHost(p, "pod.swisspro.site")).status, 200, p);
  for (const host of ["pod.swisspro.site", "podai.swisspro.site"]) {
    const sm = await getHost("/sitemap.xml", host);
    for (const loc of sm.body.match(/<loc>[^<]+/g).map(x => x.slice(5))) { const u = new URL(loc); assert.equal(u.host, host, loc); assert.equal((await getHost(u.pathname, host)).status, 200, loc); }
  }
  // Pod.AI landing: one canonical URL (podai root); duplicates 301 there; the wedding host keeps its own homepage and /agent.html.
  const podaiHome = await getHost("/", "podai.swisspro.site"); assert.equal(podaiHome.status, 200);
  assert.match(podaiHome.body, /<link rel="canonical" href="https:\/\/podai\.swisspro\.site\/"\/>/);
  for (const p of ["/agent.html", "/agent", "/index.html"]) { const r3 = await getHost(p, "podai.swisspro.site"); assert.equal(r3.status, 301, "podai " + p); assert.equal(r3.headers.location, "https://podai.swisspro.site/", "podai " + p); }
  for (const p of ["/agent.html", "/agent"]) { const r3 = await getHost(p, "wed.swisspro.site"); assert.equal(r3.status, 301, "wed " + p); assert.equal(r3.headers.location, "https://podai.swisspro.site/", "wed " + p); }
  const podHome = await getHost("/", "pod.swisspro.site"); assert.equal(podHome.status, 200); assert.ok(!/<link rel="canonical" href="https:\/\/podai/.test(podHome.body), "pod homepage is the wedding site");
  assert.equal((await getHost("/agent.html", "pod.swisspro.site")).status, 200, "pod /agent.html unchanged");
  // Two businesses, two SEO profiles: every podai page describes Pod.AI only and points at podai; the wedding pages at pod.
  const meta = (h, re) => (h.match(re) || [])[1] || "";
  for (const [host, paths, other] of [["podai.swisspro.site", ["/", "/woocommerce", "/support", "/privacy", "/terms", "/security", "/dpa"], "pod.swisspro.site"],
                                     ["pod.swisspro.site", ["/", "/studio.html", "/shipping", "/returns", "/imprint"], "podai.swisspro.site"]]) {
    for (const p of paths) {
      const h = (await getHost(p, host)).body;
      const canon = meta(h, /<link rel="canonical" href="([^"]+)"/); assert.equal(new URL(canon).host, host, `${host}${p} canonical ${canon}`);
      const og = meta(h, /<meta property="og:url" content="([^"]+)"/); if (og) assert.equal(new URL(og).host, host, `${host}${p} og:url`);
      assert.match(h, /<meta property="og:locale" content="de_CH"\/>/, `${host}${p} og:locale`);
      assert.match(h, /<meta property="og:locale:alternate" content="en_GB"\/>/, `${host}${p} locale en_GB`);
      assert.match(h, /<meta property="og:locale:alternate" content="fr_CH"\/>/, `${host}${p} locale fr_CH`);
      assert.match(h, /<meta property="og:locale:alternate" content="it_CH"\/>/, `${host}${p} locale it_CH`);
      const ogTitle = meta(h, /<meta property="og:title" content="([^"]+)"/);
      const ogDesc = meta(h, /<meta property="og:description" content="([^"]+)"/);
      assert.ok(ogTitle && !ogTitle.includes("ß") && ogTitle.length <= 60, `${host}${p} og:title ${ogTitle}`);
      assert.ok(ogDesc && !ogDesc.includes("ß") && ogDesc.length <= 155, `${host}${p} og:description length ${ogDesc.length}`);
      const ogImg = meta(h, /<meta property="og:image" content="([^"]+)"/);
      assert.ok(ogImg, `${host}${p} og:image`);
      assert.equal(new URL(ogImg).host, host, `${host}${p} og:image host`);
      assert.ok(h.includes("apple-touch-icon"), `${host}${p} apple-touch-icon`);
      for (const m of h.matchAll(/hreflang="[^"]+" href="([^"]+)"/g)) assert.equal(new URL(m[1]).host, host, `${host}${p} hreflang`);
      for (const m of h.matchAll(/"@type":"Organization","@id":"([^"]+)"/g)) assert.equal(new URL(m[1]).host, host, `${host}${p} Organization`);
      assert.ok(!new RegExp(`"@id":"https://${other.replace(/\./g, "\\.")}/#organization"`).test(h), `${host}${p} references the other business's Organization`);
    }
    const robots = (await getHost("/robots.txt", host)).body; assert.match(robots, new RegExp(`Sitemap: https://${host.replace(/\./g, "\\.")}/sitemap\\.xml`));
    const llms = (await getHost("/llms.txt", host)).body; assert.ok(!llms.includes(other), `${host}/llms.txt mentions ${other}`);
  }
  assert.match((await getHost("/", "podai.swisspro.site")).body, /"@type":"SoftwareApplication"/);
  assert.ok(!/"@type":"SoftwareApplication"/.test((await getHost("/", "pod.swisspro.site")).body));
  // Pod.AI share cards present a cross-platform agent, not a WooCommerce-only product.
  const podaiOgHome = (await getHost("/", "podai.swisspro.site")).body;
  const podaiOgTitle = meta(podaiOgHome, /<meta property="og:title" content="([^"]+)"/);
  const podaiOgDesc = meta(podaiOgHome, /<meta property="og:description" content="([^"]+)"/);
  assert.match(podaiOgTitle, /Agentic-Commerce-KI-Agent/);
  assert.ok(!/WooCommerce KI-Chatbot/i.test(podaiOgTitle));
  assert.match(podaiOgDesc, /Shopify/);
  assert.match(podaiOgDesc, /WooCommerce/);
  assert.match(podaiOgDesc, /mehr/);
  const wooOg = (await getHost("/woocommerce", "podai.swisspro.site")).body;
  const wooTitle = meta(wooOg, /<meta property="og:title" content="([^"]+)"/);
  const wooDesc = meta(wooOg, /<meta property="og:description" content="([^"]+)"/);
  assert.equal(wooTitle, "Pod.AI für WooCommerce");
  assert.match(wooDesc, /Shopify/);
  assert.ok(!/WooCommerce KI-Chatbot/i.test(wooTitle + wooDesc));
  // WooCommerce plugin download: WordPress.org slug name; the old zip name keeps working.
  const zip = await getHost("/woocommerce/pod-ai-chat-for-woocommerce.zip", "podai.swisspro.site"); assert.equal(zip.status, 200); assert.match(zip.headers["content-disposition"] || "", /pod-ai-chat-for-woocommerce\.zip/);
  const oldZip = await getHost("/woocommerce/pod-ai-chat.zip", "podai.swisspro.site"); assert.equal(oldZip.status, 301); assert.equal(oldZip.headers.location, "/woocommerce/pod-ai-chat-for-woocommerce.zip");
  const wooReadme = await getHost("/woocommerce/readme.txt", "podai.swisspro.site"); assert.equal(wooReadme.status, 200); assert.match(wooReadme.body, /Stable tag: \d/);
  // Sitemaps include lastmod; every listed URL returns 200; IndexNow key file is served on both hosts.
  const indexNowKey = fs.readFileSync(new URL("./seo/indexnow.key", import.meta.url), "utf8").trim();
  assert.match(indexNowKey, /^[a-f0-9]{32}$/);
  for (const host of ["podai.swisspro.site", "pod.swisspro.site"]) {
    const sm = await getHost("/sitemap.xml", host);
    assert.equal(sm.status, 200, host + " sitemap");
    assert.match(sm.body, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
    const locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    assert.ok(locs.length >= 5, host + " sitemap urls");
    for (const loc of locs) {
      const u = new URL(loc);
      assert.equal(u.host, host, loc);
      const page = await getHost(u.pathname, host);
      assert.equal(page.status, 200, loc);
      const ogImg = (page.body.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
      assert.ok(ogImg, loc + " og:image");
      const iu = new URL(ogImg);
      assert.equal(iu.host, host, ogImg);
      const imgRes = await getHost(iu.pathname, host);
      assert.equal(imgRes.status, 200, ogImg);
      assert.match(page.body, /<meta property="og:locale" content="de_CH"\/>/, loc + " og:locale");
    }
    const keyFile = await getHost("/" + indexNowKey + ".txt", host);
    assert.equal(keyFile.status, 200, host + " indexnow key");
    assert.equal(keyFile.body.trim(), indexNowKey);
  }
  assert.match((await getHost("/woocommerce", "podai.swisspro.site")).body, /"@type":"SoftwareApplication"/);

  result.payment_methods = "pass";
} finally { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(JSON.stringify({ ok: true, result }, null, 2));
