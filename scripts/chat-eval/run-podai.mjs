// Pod.AI local retrieval eval (no Shopify, no network): merchant FAQ + shop policies of a fixture shop,
// paraphrases / typos / 5 languages → is the right document ranked first, and is the quoted policy part the relevant one?
// Usage: node scripts/chat-eval/run-podai.mjs [--root <repo>] [--out file.json]
import path from "node:path"; import fs from "node:fs"; import { pathToFileURL } from "node:url";
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const root = path.resolve(arg("--root") || path.join(path.dirname(new URL(import.meta.url).pathname), "../.."));
process.env.NODE_ENV = "test"; process.env.APP_ENCRYPTION_KEY = "e".repeat(40);
let outbound = 0; const realFetch = globalThis.fetch; globalThis.fetch = async (u, o) => { outbound++; throw new Error("blocked " + u); };
const { rankKnowledge, quotePolicy } = await import(pathToFileURL(path.join(root, "server/shopify-agent/profile.js")));
const nlu = await import(pathToFileURL(path.join(root, "server/shopify-agent/engine/nlu.js")));

const facts = { shop_name: "Alpine Tees", email: "team@alpine.example", policies: [
  { type: "REFUND_POLICY", title: "Refund policy", url: "https://a.example/policies/refund-policy", text: "Thank you for shopping with Alpine Tees. We want you to love your order. Unworn items can be returned within 30 days of delivery for a full refund. Personalised items cannot be returned unless they arrive damaged. To start a return, e-mail us with your order number. Refunds are issued to the original payment method within 5 business days after we receive the item. Exchanges for a different size are free of charge." },
  { type: "SHIPPING_POLICY", title: "Versandrichtlinie", url: "https://a.example/policies/shipping-policy", text: "Wir versenden innerhalb von 2 Werktagen ab Zürich. Die Lieferung in die Schweiz dauert 1–3 Werktage, nach Deutschland und Österreich 3–6 Werktage. Ab CHF 80 ist der Versand kostenlos. Zollgebühren für Länder ausserhalb der Schweiz trägt der Empfänger." },
  { type: "CONTACT_INFORMATION", title: "Contact", url: "https://a.example/policies/contact-information", text: "Alpine Tees GmbH, Bahnhofstrasse 1, 8001 Zürich. E-mail: team@alpine.example. We answer within one business day." },
  { type: "PRIVACY_POLICY", title: "Privacy policy", url: "https://a.example/policies/privacy-policy", text: "We process personal data only to fulfil your order. We never sell your data. You can ask us to delete your data at any time." }] };
const custom = [
  { id: "faq_organic", question: "Are your shirts organic?", answer: "Yes — all our tees are 100% organic cotton, GOTS certified.", tags: "organic cotton material bio" },
  { id: "faq_sizes", question: "How do your sizes fit?", answer: "Our tees fit true to size; if you are between sizes, take the larger one.", tags: "size sizes fit größe taille" },
  { id: "faq_gift", question: "Can I add a gift message?", answer: "Yes, add a gift note in the cart — we print it on a card and leave prices out of the parcel.", tags: "gift message geschenk" }];

const C = [
  ["How do I return something?", "policy_REFUND_POLICY", /30 days/], ["can i get my money back", "policy_REFUND_POLICY", /refund/i], ["Kann ich die Ware zurückgeben?", "policy_REFUND_POLICY"],
  ["Puis-je retourner un article ?", "policy_REFUND_POLICY"], ["Posso restituire un prodotto?", "policy_REFUND_POLICY"], ["可以退货吗", "policy_REFUND_POLICY"],
  ["how long does the refnd take", "policy_REFUND_POLICY", /5 business days/], ["Can I exchange for another size?", "policy_REFUND_POLICY", /size/i],
  ["How long does shipping take to Germany?", "policy_SHIPPING_POLICY", /Deutschland/], ["Wie lange dauert der Versand?", "policy_SHIPPING_POLICY"], ["Combien de temps prend la livraison ?", "policy_SHIPPING_POLICY"],
  ["Quanto tempo ci vuole per la spedizione?", "policy_SHIPPING_POLICY"], ["多久能发货", "policy_SHIPPING_POLICY"], ["is shiping free?", "policy_SHIPPING_POLICY", /kostenlos/],
  ["Do I have to pay customs?", "policy_SHIPPING_POLICY", /Zoll/], ["how can i reach you", "policy_CONTACT_INFORMATION"], ["Are the shirts made of organic cotton?", "faq_organic"],
  ["what size should i take", "faq_sizes"], ["Welche Größe soll ich nehmen?", "faq_sizes"], ["can I include a gift note", "faq_gift"], ["do you sell my data", "policy_PRIVACY_POLICY"]
];
const res = C.map(([q, want, quoteRe]) => {
  const hits = rankKnowledge(facts, custom, q, "en", 3), top = hits[0];
  let quoteOk = null;
  if (quoteRe && top) { const quoted = top.custom ? top.answer : quotePolicy(top.answer, { lang: "en", type: top.id.replace(/^policy_/, ""), url: "", query: q }); quoteOk = quoteRe.test(quoted); }
  return { q, want, got: top?.id || null, ok: top?.id === want, quoteOk };
});
const intents = [["how long does shiping take", "delivery_time"], ["I want a refnd", "return_request"], ["wher is my ordr", "order_status"], ["Wie lange dauert die Liferung?", "delivery_time"]].map(([q, want]) => {
  const t = nlu.fixTypos ? nlu.fixTypos(q).text : q; const got = nlu.classifyRules(t).intent; return { q, want, got, ok: got === want }; });
const n = res.length, ok = res.filter(r => r.ok).length, qs = res.filter(r => r.quoteOk !== null), qok = qs.filter(r => r.quoteOk).length;
const summary = { root, retrieval_top1_pct: Math.round(100 * ok / n), retrieval: `${ok}/${n}`, focused_quote: `${qok}/${qs.length}`, typo_intents: `${intents.filter(i => i.ok).length}/${intents.length}`, outbound_requests: outbound };
const out = arg("--out"); if (out) fs.writeFileSync(out, JSON.stringify({ summary, res, intents }, null, 2));
console.log(JSON.stringify(summary, null, 2));
for (const r of [...res, ...intents].filter(r => !r.ok || r.quoteOk === false)) console.log("MISS", r.q, "want", r.want, "got", r.got, r.quoteOk === false ? "(quote not focused)" : "");
globalThis.fetch = realFetch;
