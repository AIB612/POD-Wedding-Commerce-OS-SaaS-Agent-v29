#!/usr/bin/env node
// End-to-end test against a running WordPress + WooCommerce test store with the plugin connected to a Pod.AI backend.
// Goes through the plugin's public REST route (/pod-ai/v1/chat → signed → backend) exactly like the widget.
//   WP=http://127.0.0.1:8088 ORDER=27 node apps/woocommerce-plugin/tests/e2e-local.mjs
const WP = process.env.WP_URL || process.env.WP || "http://127.0.0.1:8088", ORDER = process.env.ORDER || "27";
const api = r => `${WP}/index.php?rest_route=/pod-ai/v1/${r}`;
let pass = 0, fail = 0; const out = [];
const ok = (cond, name, extra = "") => { (cond ? pass++ : fail++); out.push(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`); };
async function chat(message, conversation_id, lang = "en") {
  const r = await fetch(api("chat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, conversation_id, lang, page: "/" }) });
  return r.json();
}
const prods = r => (r.ui || []).find(u => u.type === "products")?.items || [];
const short = s => String(s || "").replace(/\s+/g, " ").slice(0, 140);

const cfg = await (await fetch(api("config"))).json();
ok(cfg.enabled === true && /^#[0-9a-f]{6}$/i.test(cfg.widget?.color || "") && (!process.env.EXPECT_COLOR || cfg.widget.color === process.env.EXPECT_COLOR), "widget config via WP", JSON.stringify(cfg.widget));

let r = await chat("What is your return policy?"); ok(/30 days/.test(r.answer) && r.answered_by === "local", "EN return policy (local)", short(r.answer));
r = await chat("Wie viel kostet der Versand in die Schweiz?", null, "de"); ok(r.language === "de" && /7/.test(r.answer), "DE shipping CH", short(r.answer));
r = await chat("Combien coûte la livraison en France ?", null, "fr"); ok(r.language === "fr" && /15/.test(r.answer), "FR shipping FR", short(r.answer));
r = await chat("Quanto costa la spedizione in Italia?", null, "it"); ok(r.language === "it" && /15/.test(r.answer), "IT shipping IT", short(r.answer));
r = await chat("你们卖什么？", null, "zh"); ok(r.language === "zh" && prods(r).length >= 3, "ZH browse products", short(r.answer));
ok(prods(r).every(p => p.unit_price > 0 && !/Cuckoo|Secret Draft/.test(p.name)), "only in-stock, published, priced products");
r = await chat("Do you offer gift wrapping?"); ok(/gift wrapping is free/i.test(r.answer), "merchant FAQ", short(r.answer));
r = await chat("How long does delivery to Germany take?"); ok(/4-7|business days|15/.test(r.answer), "shipping page / zone", short(r.answer));

r = await chat("I need a gift for my girlfriend under 50 CHF"); const p1 = prods(r);
ok(p1.length >= 2 && p1.every(p => p.unit_price <= 50 && p.link.startsWith(WP)), "recommendation (budget, own store)", p1.map(p => `${p.name} ${p.unit_price}`).join(", "));
ok(p1.some(p => p.cart?.product_id), "add-to-cart action on simple products");
const c1 = r.conversation_id, min1 = Math.min(...p1.map(p => p.unit_price));
r = await chat("cheaper please", c1); const p2 = prods(r); ok(p2.length >= 1 && Math.min(...p2.map(p => p.unit_price)) <= min1, "refinement: cheaper", p2.map(p => `${p.name} ${p.unit_price}`).join(", "));
r = await chat("Ich suche ein Geschenk für Kinder", null, "de"); ok(prods(r).some(p => /Kids|Plush/i.test(p.name)), "DE reco for kids", prods(r).map(p => p.name).join(", "));
r = await chat("Avez-vous des chaussettes ?", null, "fr"); ok(prods(r).some(p => /Socks/.test(p.name)), "FR product search (variable product)", short(r.answer));

r = await chat(`Where is my order #${ORDER}?`); const c2 = r.conversation_id;
r = await chat("buyer@example.com", c2); const o = (r.ui || []).find(u => u.type === "order"), tr = (r.ui || []).find(u => u.type === "tracking");
ok(o?.order?.name === `#${ORDER}` && /fulfilled/i.test(o.order.fulfillment), "order lookup (number + e-mail)", short(r.answer));
ok(tr?.number === "99.00.123456.78901234" && /post\.ch/.test(tr.url), "tracking number + carrier link from Shipment Tracking meta", tr?.url);
r = await chat(`order #${ORDER} someone@example.com`); ok(!(r.ui || []).some(u => u.type === "order") && /couldn|find|找到|finde|trouve|trovo/i.test(r.answer), "wrong e-mail → not found", short(r.answer));

r = await chat("Do you have a discount code?"); const cp = (r.ui || []).find(u => u.type === "coupon"); ok(cp?.code === "WELCOME10", "visible coupon offered (apply action)", short(r.answer));
r = await chat("Is the code WELCOME10 valid?"); ok(/WELCOME10/.test(r.answer) && !/not valid|invalid|isn't/i.test(r.answer), "coupon check via WooCommerce", short(r.answer));
r = await chat("Is the code FAKE99 valid?"); ok(/FAKE99/.test(r.answer), "unknown coupon", short(r.answer));

r = await chat("My parcel arrived damaged, I want to talk to a person"); const c3 = r.conversation_id; ok(!!r.handoff, "handoff", short(r.answer));
r = await chat(process.env.TICKET_EMAIL || "sherry.branny@gmail.com", c3); const m = /POD-T-[A-Z2-9]{6}/.exec(r.answer || ""); ok(!!m, "ticket created", short(r.answer));
console.log(out.join("\n")); console.log(`\n${pass}/${pass + fail} passed`); if (m) console.log(`TICKET ${m[0]}`);
process.exit(fail ? 1 : 0);
