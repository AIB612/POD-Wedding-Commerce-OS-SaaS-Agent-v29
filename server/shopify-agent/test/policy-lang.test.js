// Policy quoting: the shopper gets a note in their own language when the shop's policy is written in another language.
import assert from "node:assert/strict";
const { quotePolicy } = await import("../profile.js");
const en = "Returns are accepted within 30 days of delivery. Items must be unused and in the original packaging. Contact us with your order number.";
const de = "Rücksendungen sind innerhalb von 30 Tagen nach Lieferung möglich. Die Artikel müssen unbenutzt sein und sich in der Originalverpackung befinden.";
assert.equal(quotePolicy(en, { lang: "en", type: "REFUND_POLICY", url: "https://x.test/policies/refund" }), `${en}\nhttps://x.test/policies/refund`, "same language: plain quote");
assert.match(quotePolicy(en, { lang: "de", type: "REFUND_POLICY", url: "https://x.test/r" }), /^Hier die Rückgabe-\/Erstattungsrichtlinie des Shops \(Original auf Englisch\):\n/);
assert.match(quotePolicy(en, { lang: "fr", type: "REFUND_POLICY" }), /^Voici la politique de retour de la boutique \(original en anglais\) :/);
assert.match(quotePolicy(en, { lang: "it", type: "SHIPPING_POLICY" }), /^Ecco la politica di spedizione del negozio \(originale in inglese\):/);
assert.match(quotePolicy(en, { lang: "zh", type: "REFUND_POLICY", url: "https://x.test/r" }), /^以下是本店的退换货政策（原文为英文）：[\s\S]*完整内容： https:\/\/x\.test\/r$/);
assert.match(quotePolicy(de, { lang: "en", type: "REFUND_POLICY" }), /\(original in German\)/);
assert.equal(quotePolicy(de, { lang: "de" }), de);
console.log(JSON.stringify({ policy_language_note: "pass" }));
