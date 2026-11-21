// B5 storefront pages: shared header/footer on every customer page, legal pages, no Chinese in English page sources, VAT label from settings.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-pages-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"), APP_ENCRYPTION_KEY: "z".repeat(40) });
const { createApp } = await import("./create-app.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const get = async p => { const r = await fetch(base + p); return { status: r.status, text: await r.text() }; };
const CJK = /[\u3400-\u9fff]/;
const result = {};
try {
  const pages = ["/", "/studio.html", "/checkout", "/payment-success.html", "/proof.html", "/account", "/privacy", "/terms", "/shipping", "/returns", "/imprint", "/impressum", "/contact", "/agent.html"];
  for (const p of pages) {
    const { status, text } = await get(p);
    assert.equal(status, 200, p);
    assert.ok(/id="site-header"/.test(text), `${p}: shared header`); assert.ok(/\/header\.js/.test(text), `${p}: header.js`);
    assert.ok(/\/footer\.js/.test(text), `${p}: footer`);
    assert.ok(!CJK.test(text.match(/<title>([^<]*)<\/title>/)?.[1] || ""), `${p}: title has no Chinese`);
  }
  result.shared_header_footer = "pass";

  // Brand: one name; header.js carries it, old per-page variants are gone.
  const hdr = (await get("/header.js")).text;
  assert.match(hdr, /POD.AI/); assert.match(hdr, /pod-market-v1/);
  for (const f of ["index.html", "home-app.js", "home-wedding-site.js", "studio.html", "checkout.html", "payment-success.html", "account.html", "proof.html"]) {
    const s = fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(s, /POD WEDDING STUDIO|<b>POD STUDIO<\/b>/, f);
  }
  result.one_brand = "pass";

  // Customer pages written in English: no Chinese literals in proof / payment-success / checkout / account sources.
  for (const f of ["proof.html", "payment-success.html", "checkout.html", "account.html", "account-app.js", "account-auth.js", "cart.js", "checkout.js", "footer.js", "header.js"])
    assert.ok(!CJK.test(fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replace(/data-lang="zh">[^<]*</g, "")), `${f} contains Chinese`);
  const idx = ["index.html", "home-app.js", "home-wedding-site.js"].map(f => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");
  assert.doesNotMatch(idx, /alt="材质大图"/); assert.doesNotMatch(idx, /Incl\. VAT where applicable/);
  assert.match(idx, /data-vat-label/); assert.match(idx, /homeMarket\(\)/);
  result.no_chinese_sources = "pass";

  // Footer: shipping, returns, imprint, visible contact e-mail.
  const ft = (await get("/footer.js")).text;
  for (const l of ["/shipping", "/returns", "/imprint", "/privacy", "/terms", "/contact"]) assert.ok(ft.includes(`href="${l}"`), `footer ${l}`);
  assert.match(ft, /sf-addr/);
  assert.match(ft, /MAIL='support@swisspro\.site'/);
  assert.match(ft, /href="mailto:'\+MAIL/);
  assert.match(ft, /https:\/\/www\.instagram\.com\/swisspro\.pod\//);
  assert.match(ft, /aria-label="Instagram SwissPro POD"/);
  assert.match(ft, /target="_blank"/);
  assert.match(ft, /rel="noopener/);
  assert.doesNotMatch(ft, /ai\.softwarepro/);
  const imp = (await get("/imprint")).text;
  // Final legal text: operator named, no template notes or [placeholders], no personal data, no ODR link.
  assert.match(imp, /Dropking AI/); assert.match(imp, /support@swisspro\.site/);
  for (const pg of ["/imprint", "/privacy", "/terms", "/returns", "/shipping"]) {
    const t = (await get(pg)).text, main = t.slice(t.indexOf("<main>"), t.indexOf("</main>"));
    assert.doesNotMatch(main, /Template —|\[(Company|Owner|Name|Placeholder|Street|UID|n\])/, pg);
    assert.doesNotMatch(main, /ec\.europa\.eu\/consumers\/odr|ship from Switzerland/, pg);
  }
  const ret = (await get("/returns")).text; assert.match(ret, /Art\. 16\(c\)/); assert.match(ret, /defective/i);
  result.legal_pages = "pass";
  // Homepage marketing/configurator source is English (crawlers / first paint).
  const home = (await get("/")).text;
  assert.match(home, /A wedding is not a single product,/);
  assert.match(home, /it is one visual system/);
  assert.match(home, /Upload your design once,/);
  assert.match(home, /the whole set is done together/);
  assert.match(home, /Start designing/);
  assert.match(home, /Sell with POD/);
  assert.match(home, /href="\/contact"/);
  assert.doesNotMatch(home, /婚礼不是一个单品/);
  assert.doesNotMatch(home, /上传一次设计，/);
  const contact = (await get("/contact")).text;
  assert.match(contact, /mailto:support@swisspro\.site/);
  assert.match(contact, /"contactPoint"/);
  result.en_homepage_and_contact = "pass";

  // One-line env switch for the public contact address.
  process.env.PUBLIC_CONTACT_EMAIL = "hello@example.com";
  const switched = (await get("/imprint")).text;
  assert.match(switched, /mailto:hello@example\.com/);
  assert.doesNotMatch(switched, /support@swisspro\.site/);
  assert.match((await get("/footer.js")).text, /MAIL='hello@example\.com'/);
  delete process.env.PUBLIC_CONTACT_EMAIL;
  result.public_contact_email = "pass";

  // WhatsApp Business: hidden when PUBLIC_WHATSAPP_NUMBER is empty; shown only when a valid number is set.
  const waJs = (await get("/whatsapp.js")).text;
  assert.match(waJs, /WA=''/);
  assert.doesNotMatch(waJs, /wa\.me\/[1-9]/);
  assert.doesNotMatch((await get("/contact")).text, /wa\.me/);
  assert.doesNotMatch((await get("/contact")).text, /wa-contact/);
  process.env.PUBLIC_WHATSAPP_NUMBER = "41000000000";
  const waOn = (await get("/whatsapp.js")).text;
  assert.match(waOn, /WA='41000000000'/);
  assert.match((await get("/contact")).text, /https:\/\/wa\.me\/41000000000\?text=/);
  assert.match((await get("/contact")).text, /target="_blank"/);
  assert.match((await get("/contact")).text, /rel="noopener/);
  process.env.PUBLIC_WHATSAPP_NUMBER = "00abc";
  assert.match((await get("/whatsapp.js")).text, /WA=''/);
  delete process.env.PUBLIC_WHATSAPP_NUMBER;
  result.whatsapp_optional = "pass";


  // Fees: public endpoint exposes the VAT display mode + delivery times for the shipping page (default excl. VAT).
  const fees = await (await fetch(base + "/api/storefront/fees")).json();
  assert.equal(fees.prices_include_vat, false); assert.equal(typeof fees.production_days, "number"); assert.ok(Array.isArray(fees.transit_days.zone_ch.standard));
  result.fees_public = "pass";
} finally { server.close(); }
console.log(JSON.stringify(result, null, 2));
