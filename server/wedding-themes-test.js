// v30 wedding themes: old->new theme mapping, every theme renders and publishes, empty sections hide, i18n coverage, active-theme fonts only.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "index.html"), "utf8");
const result = {};

// Load the real generator (index.html) and the lazy theme module into a sandbox.
const pick = re => { const m = src.match(re); assert.ok(m, String(re)); return m[0]; };
const gen = src.slice(src.indexOf("const WEDDING_LAYOUTS="), src.indexOf("// Share image (og:image"));
assert.ok(gen.length > 1000 && gen.includes("function buildWeddingSite"), "generator block found");
const ctx = { console, URLSearchParams }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext([fs.readFileSync(path.join(root, "wedding-qr.js"), "utf8"), pick(/function escapeSiteText\(value=""\)\{[\s\S]*?\n\}/), pick(/function parseSchedule\(text\)\{[\s\S]*?\n\}/), gen,
  "globalThis.G={buildWeddingSite,wbNormTheme,WEDDING_LAYOUTS,WB_THEME_MAP,WEDDING_INVITE_I18N,WB_FONTS,WB_THEME_BASE,wbFontCss};"].join("\n"), ctx);
vm.runInContext(fs.readFileSync(path.join(root, "assets/wedding/wb-themes.js"), "utf8"), ctx);
const G = ctx.G, THEMES = [...G.WEDDING_LAYOUTS];
assert.deepEqual(THEMES, ["letterpress", "modern", "garden", "bloom", "postcard", "gallery"]);
assert.deepEqual(Object.keys(ctx.WBT.TOT).sort(), [...THEMES].sort());

const feats = { countdown: true, timeline: true, map: true, gallery: true, rsvp: true, share: true, calendar: true, addressCopy: true, envelope: true, card: true };
const photo = n => `https://example.com/p${n}.jpg`;
const FULL = { names: "Amelia & Noah", date: "2027-06-18", time: "15:00", venue: "The Garden House", address: "Münsterhof 8, 8001 Zürich", lang: "en",
  intro: "We met in a bookshop.\nSeven years later we are getting married.", schedule: [{ time: "15:00", title: "Ceremony", desc: "Rose terrace" }, { time: "18:30", title: "Dinner", desc: "Orangery" }],
  note: "Dress code: Garden formal.\nGifts: Your presence is the gift.", heroPhoto: photo(0), gallery: [1, 2, 3, 4, 5, 6].map(photo), rsvpMode: "builtin", features: feats };
const MIN = { names: "Amelia & Noah", date: "2027-06-18", lang: "en", rsvpMode: "builtin", features: feats };
const ZH = { ...FULL, names: "欧阳婉清 & 慕容思远", lang: "zh", venue: "上海外滩华尔道夫酒店", address: "上海市黄浦区中山东一路2号", intro: "我们相识于图书馆。", note: "着装建议：正式晚装", heroPhoto: photo(9), gallery: [] };
const SECTIONS = ["story", "day", "place", "photos", "notes"];
const ids = h => SECTIONS.filter(s => h.includes(`id="${s}"`));
const scriptsParse = h => [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => { try { new Function(m[1]); } catch (e) { assert.fail(`inline script ${i}: ${e.message}`); } });
const usedKeys = new Set();
const build = p => { const h = G.buildWeddingSite(p, {}); for (const m of h.matchAll(/data-wi="([^"]+)"/g)) usedKeys.add(m[1]); return h; };

// 1. Old theme values map onto the six new themes and render that theme's page architecture.
const CLS = { letterpress: "t-lp", modern: "t-md", garden: "t-gd", bloom: "t-bl", postcard: "t-pc", gallery: "t-gl" };
for (const [old, m] of Object.entries(G.WB_THEME_MAP)) {
  const n = G.wbNormTheme({ layout: old });
  assert.equal(n.layout, m.layout, old);
  const h = build({ ...MIN, layout: old });
  assert.match(h, new RegExp(`<body class="${CLS[m.layout]}[ "]`), `${old} -> ${m.layout}`);
  if (m.plain) assert.match(h, /<body class="t-md plain/);
  if (m.palette === "olive") assert.match(h, /<body class="t-gd olive/);
}
assert.match(build({ ...MIN, layout: "nonsense" }), /<body class="t-lp/);
result.theme_mapping = "pass";

// 2. Every theme renders full, minimal and Chinese content; empty sections hide; no sample text or broken values.
const SAMPLE = /With joyful hearts|Guest Arrival|Garden formal\. Please|怀着喜悦的心情|Voller Freude|lorem/i;
for (const t of THEMES) {
  const full = build({ ...FULL, layout: t }), min = build({ ...MIN, layout: t }), zh = build({ ...ZH, layout: t });
  for (const h of [full, min, zh]) {
    scriptsParse(h);
    assert.ok(!/undefined|\[object |>NaN</.test(h), `${t}: no undefined/NaN`);
    assert.ok(h.includes('<meta name="robots" content="noindex,nofollow"/>'), `${t}: noindex`);
    assert.ok(h.includes('id="rsvpForm"') && h.includes('data-wi="privacy"'), `${t}: RSVP + privacy`);
    assert.ok(h.includes('id="cardView"') && h.includes('id="cardQr"'), `${t}: print card with QR slot`);
    assert.ok(h.includes('id="env"') && h.includes(`x-${t}`), `${t}: envelope`);
    assert.ok(h.includes("prefers-reduced-motion"), `${t}: reduced motion`);
  }
  assert.deepEqual(ids(full), SECTIONS, `${t}: full content shows every section`);
  assert.deepEqual(ids(min), [], `${t}: minimal content hides empty sections`);
  assert.ok(!SAMPLE.test(min) && !SAMPLE.test(full), `${t}: no sample text in published HTML`);
  assert.ok(!min.includes("example.com/p"), `${t}: no photos when none uploaded`);
  assert.ok(zh.includes("欧阳婉清") && zh.includes('class="' + CLS[t]) && /<body class="[^"]*cjk/.test(zh), `${t}: zh/CJK`);
  assert.ok(full.includes("uri.amap.com/search") && full.includes("calendar.google.com") && full.includes("maps.apple.com/?q="), `${t}: map + calendar links`);
  // Only the active theme's fonts, from /fonts, all files present.
  const fonts = [...new Set([...full.matchAll(/url\("?\/fonts\/([^")]+)"?\)/g)].map(m => m[1]))];
  const own = G.WB_THEME_BASE[t].fonts.map(k => G.WB_FONTS[k][1]);
  assert.deepEqual(fonts.sort(), [...new Set(own)].sort(), `${t}: only own fonts`);
  for (const f of fonts) assert.ok(fs.existsSync(path.join(root, "fonts", f)), `font file ${f}`);
}
// One photo / no photo fallbacks and variants.
for (const t of THEMES) { scriptsParse(build({ ...FULL, layout: t, heroPhoto: "", gallery: [photo(1)] })); scriptsParse(build({ ...FULL, layout: t, heroPhoto: "", gallery: [] })); }
assert.match(build({ ...FULL, layout: "modern", accent: "#ff3366", accentCustom: true }), /--lime:#ff3366/);
assert.ok(!build({ ...FULL, layout: "modern", plain: true, accent: "#ff3366", accentCustom: true }).includes("--lime:#ff3366"), "plain ignores accent");
result.themes_render = "pass";
result.empty_sections_hidden = "pass";

// 3. Every translated key used by the themes exists in en/zh/de; builder labels are translated.
for (const l of ["en", "zh", "de"]) for (const k of usedKeys) assert.ok(G.WEDDING_INVITE_I18N[l][k], `${l}.${k}`);
const i18nSrc = fs.readFileSync(path.join(root, "i18n.js"), "utf8");
for (const k of ["凸版请柬组", "瑞士海报", "植物标本", "花语篇章", "旅行手账", "杂志特刊", "素色（无亮色）", "网站模板加载失败，请检查网络后重试"]) assert.ok(i18nSrc.includes(`'${k}':{en:`), k);
result.i18n_keys = "pass";

// 4. Each theme publishes through the API and is served 200 (noindex, placeholders filled, theme module asset served).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wcos-themes-"));
Object.assign(process.env, { NODE_ENV: "test", ADMIN_API_KEY: "k", RATE_LIMIT_DISABLED: "true", STORE_PERSIST_PATH: path.join(tmp, "state.json"),
  APP_ENCRYPTION_KEY: "x".repeat(40), PUBLIC_BASE_URL: "https://shop.example.com", CORS_ORIGINS: "https://shop.example.com" });
for (const k of ["SENDGRID_API_KEY", "POSTMARK_SERVER_TOKEN"]) delete process.env[k];
const { createApp } = await import("./create-app.js");
const app = await createApp({ generatedDir: tmp });
const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}`;
try {
  const reg = await fetch(base + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `themes-${Date.now()}@example.com`, password: "ExamplePass123!", name: "Couple" }) });
  assert.equal(reg.status, 200);
  const cookie = reg.headers.get("set-cookie").split(";")[0];
  const asset = await fetch(base + "/assets/wedding/wb-themes.js?v=" + ctx.WBT.version);
  assert.equal(asset.status, 200);
  assert.ok((await asset.text()).includes("WBT"));
  for (const t of THEMES) for (const [k, p] of [["full", FULL], ["min", MIN]]) {
    const profile = { ...p, layout: t, gallery: [], heroPhoto: "" };
    const r = await fetch(base + "/api/invitations", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ profile, html: G.buildWeddingSite(profile, {}) }) });
    const inv = await r.json();
    assert.ok(inv.ok && inv.url, `${t}/${k} published`);
    const page = await fetch(base + inv.url);
    assert.equal(page.status, 200, `${t}/${k} 200`);
    assert.match(page.headers.get("x-robots-tag") || "", /noindex/);
    const html = await page.text();
    assert.ok(html.includes(`INVITE_ID="${inv.id}"`) && html.includes(`class="${CLS[t]}`), `${t}/${k} placeholders + theme`);
    scriptsParse(html);
  }
  result.publish_each_theme = "pass";
} finally { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
console.log("wedding-themes-test passed", JSON.stringify(result));
process.exit(0);
