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
  const pages = ["/", "/studio.html", "/checkout", "/payment-success.html", "/proof.html", "/account", "/privacy", "/terms", "/shipping", "/returns", "/imprint", "/impressum"];
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
  assert.match(hdr, /POD Wedding Studio/); assert.match(hdr, /pod-market-v1/);
  for (const f of ["index.html", "studio.html", "checkout.html", "payment-success.html", "account.html", "proof.html"]) {
    const s = fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(s, /POD WEDDING STUDIO|<b>POD STUDIO<\/b>/, f);
  }
  result.one_brand = "pass";

  // Customer pages written in English: no Chinese literals in proof / payment-success / checkout / account sources.
  for (const f of ["proof.html", "payment-success.html", "checkout.html", "account.html", "account-app.js", "account-auth.js", "cart.js", "checkout.js", "footer.js", "header.js"])
    assert.ok(!CJK.test(fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replace(/data-lang="zh">[^<]*</g, "")), `${f} contains Chinese`);
  const idx = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(idx, /alt="材质大图"/); assert.doesNotMatch(idx, /Incl\. VAT where applicable/);
  assert.match(idx, /data-vat-label/); assert.match(idx, /homeMarket\(\)/);
  result.no_chinese_sources = "pass";

  // Footer: shipping, returns, imprint, visible contact e-mail; imprint uses placeholders (no invented company data).
  const ft = (await get("/footer.js")).text;
  for (const l of ["/shipping", "/returns", "/imprint", "/privacy", "/terms"]) assert.ok(ft.includes(`href="${l}"`), `footer ${l}`);
  assert.match(ft, /sf-addr/);
  const imp = (await get("/imprint")).text;
  for (const ph of ["[Company name]", "[UID/VAT no.", "[Street and number]"]) assert.ok(imp.includes(ph), ph);
  const ret = (await get("/returns")).text; assert.match(ret, /Art\. 16\(c\)/); assert.match(ret, /defective/i);
  result.legal_pages = "pass";

  // Fees: public endpoint exposes the VAT display mode + delivery times for the shipping page (default excl. VAT).
  const fees = await (await fetch(base + "/api/storefront/fees")).json();
  assert.equal(fees.prices_include_vat, false); assert.equal(typeof fees.production_days, "number"); assert.ok(Array.isArray(fees.transit_days.zone_ch.standard));
  result.fees_public = "pass";
} finally { server.close(); }
console.log(JSON.stringify(result, null, 2));
