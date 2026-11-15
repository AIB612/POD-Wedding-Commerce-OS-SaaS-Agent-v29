// Natural answer composition for the LOCAL chat engine (no LLM). Turns shop data and knowledge-base hits into short,
// human replies: the direct answer first, one or two relevant details, then an optional next step. Phrasing varies per
// conversation turn (deterministic, so tests stay stable) and always stays in the shopper's language (EN / DE / FR / IT / ZH).
import { pickSentences, vary, tokenize } from "../../shared/local-rag.js";

export const SUPPORT_EMAIL = "support@swisspro.site";
const money = (cur, n) => `${cur} ${Number(n || 0).toFixed(2)}`;
const pick = (obj, lang) => obj[lang] ?? obj.en;
const join = (list, lang) => {
  const a = list.filter(Boolean); if (a.length <= 1) return a[0] || "";
  if (lang === "zh") return a.join("、");
  const and = { en: "and", de: "und", fr: "et", it: "e" }[lang] || "and", or = a.slice(0, -1).join(", ");
  return `${or} ${and} ${a.at(-1)}`;
};
const joinOr = (list, lang) => {
  const a = list.filter(Boolean); if (a.length <= 1) return a[0] || "";
  if (lang === "zh") return a.slice(0, -1).join("、") + "或" + a.at(-1);
  const or = { en: "or", de: "oder", fr: "ou", it: "o" }[lang] || "or";
  return `${a.slice(0, -1).join(", ")} ${or} ${a.at(-1)}`;
};

// ---- Colours: catalogue hex values → names; colour words in questions → canonical colour ----
const PALETTE = [
  ["white", "#ffffff"], ["cream", "#f4ede1"], ["beige", "#e3d3bc"], ["sand", "#d8c3a5"], ["grey", "#9a9a9a"], ["charcoal", "#3a3a3a"], ["black", "#1f1d1b"],
  ["navy", "#2f3a45"], ["blue", "#3d6fb6"], ["light blue", "#a9c4e3"], ["sage", "#b9c7b3"], ["green", "#4f7a4a"], ["olive", "#7a7a4a"], ["blush", "#e9c9c4"],
  ["pink", "#e59bb0"], ["red", "#b8332f"], ["burgundy", "#6e2433"], ["orange", "#e07b39"], ["yellow", "#ecc94b"], ["brown", "#7a5235"], ["lavender", "#c6b6dc"]
];
const COLOR_I18N = {
  white: { de: "Weiss", fr: "blanc", it: "bianco", zh: "白色" }, cream: { de: "Creme", fr: "crème", it: "crema", zh: "米白" }, beige: { de: "Beige", fr: "beige", it: "beige", zh: "米色" },
  sand: { de: "Sand", fr: "sable", it: "sabbia", zh: "沙色" }, grey: { de: "Grau", fr: "gris", it: "grigio", zh: "灰色" }, charcoal: { de: "Anthrazit", fr: "anthracite", it: "antracite", zh: "炭灰" },
  black: { de: "Schwarz", fr: "noir", it: "nero", zh: "黑色" }, navy: { de: "Marineblau", fr: "bleu marine", it: "blu navy", zh: "藏青" }, blue: { de: "Blau", fr: "bleu", it: "blu", zh: "蓝色" },
  "light blue": { de: "Hellblau", fr: "bleu clair", it: "azzurro", zh: "浅蓝" }, sage: { de: "Salbeigrün", fr: "vert sauge", it: "verde salvia", zh: "鼠尾草绿" }, green: { de: "Grün", fr: "vert", it: "verde", zh: "绿色" },
  olive: { de: "Oliv", fr: "olive", it: "oliva", zh: "橄榄绿" }, blush: { de: "Rosé", fr: "rose poudré", it: "rosa cipria", zh: "裸粉" }, pink: { de: "Rosa", fr: "rose", it: "rosa", zh: "粉色" },
  red: { de: "Rot", fr: "rouge", it: "rosso", zh: "红色" }, burgundy: { de: "Bordeaux", fr: "bordeaux", it: "bordeaux", zh: "酒红" }, orange: { de: "Orange", fr: "orange", it: "arancione", zh: "橙色" },
  yellow: { de: "Gelb", fr: "jaune", it: "giallo", zh: "黄色" }, brown: { de: "Braun", fr: "marron", it: "marrone", zh: "棕色" }, lavender: { de: "Lavendel", fr: "lavande", it: "lavanda", zh: "薰衣草紫" }
};
const FAMILY = { blue: ["navy", "blue", "light blue"], green: ["sage", "green", "olive"], pink: ["blush", "pink"], red: ["red", "burgundy"], white: ["white", "cream"], black: ["black", "charcoal"], grey: ["grey", "charcoal"],
  beige: ["beige", "sand", "cream"], brown: ["brown"], yellow: ["yellow"], orange: ["orange"], purple: ["lavender"] };
export const COLOR_WORD_RE = /\b(blue|navy|blau|marine|bleu|blu|azzurr[oa]|green|grün|gruen|vert|verde|pink|rosa|rose|red|rot|rouge|ross[oa]|white|weiss|weiß|blanc|bianc[oa]|black|schwarz|noir|ner[oa]|gr[ae]y|grau|gris|grigi[oa]|beige|brown|braun|marron|marrone|yellow|gelb|jaune|giall[oa]|orange|arancione|purple|lila|violet|viola)\b|蓝|藏青|绿|粉|红|白|黑|灰|米色|棕|黄|橙|紫/i;
const WORD_FAMILY = [[/blue|navy|blau|marine|bleu|blu|azzurr|蓝|藏青/i, "blue"], [/green|grün|gruen|vert|verde|绿/i, "green"], [/pink|rosa|rose|粉/i, "pink"], [/red|rot|rouge|ross|红/i, "red"],
  [/white|weiss|weiß|blanc|bianc|白/i, "white"], [/black|schwarz|noir|ner[oa]|黑/i, "black"], [/gr[ae]y|grau|gris|grigi|灰/i, "grey"], [/beige|米色/i, "beige"], [/brown|braun|marron|棕/i, "brown"],
  [/yellow|gelb|jaune|giall|黄/i, "yellow"], [/orange|arancione|橙/i, "orange"], [/purple|lila|violet|viola|紫/i, "purple"]];
const hexRgb = h => { const x = String(h).replace("#", ""); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
export function colorName(hex) {
  const [r, g, b] = hexRgb(hex); let best = PALETTE[0][0], bd = Infinity;
  for (const [n, ph] of PALETTE) { const [R, G, B] = hexRgb(ph); const d = (r - R) ** 2 * 0.3 + (g - G) ** 2 * 0.59 + (b - B) ** 2 * 0.11; if (d < bd) { bd = d; best = n; } }
  return best;
}
const colorLabel = (n, lang) => (lang === "en" ? n : COLOR_I18N[n]?.[lang] || n);
export const colorFamily = text => (WORD_FAMILY.find(([re]) => re.test(text)) || [])[1] || null;

// ---- Phrase pools ----
const P = {
  yes: { en: ["Yes, we do!", "We sure do.", "Yes — happy to help with that.", "Absolutely."], de: ["Ja, haben wir!", "Ja, gerne.", "Klar, das gibt es bei uns."], fr: ["Oui, bien sûr !", "Oui, nous en proposons.", "Absolument."], it: ["Sì, certo!", "Sì, li abbiamo.", "Assolutamente sì."], zh: ["有的！", "当然有。", "有，我们可以做。"] },
  next: { en: ["Want a shipping quote, or shall I open it in the Studio for you?", "Should I calculate shipping to your country?", "Would you like to see sizes, colours or a shipping quote?"],
    de: ["Soll ich Ihnen den Versand berechnen oder es im Studio öffnen?", "Möchten Sie einen Versandpreis für Ihr Land?"],
    fr: ["Voulez-vous un devis de livraison, ou l'ouvrir dans le Studio ?", "Je calcule les frais de port pour votre pays ?"],
    it: ["Vuole un preventivo di spedizione, o lo apro nello Studio?", "Calcolo la spedizione per il suo paese?"],
    zh: ["需要我帮您算一下运费，或者在 Studio 里打开定制吗？", "要不要我帮您估算寄到您所在国家的运费？"] },
  more: { en: ["Anything else I can check for you?", "Is there anything else you'd like to know?", "Happy to help with anything else."], de: ["Kann ich sonst noch etwas für Sie prüfen?", "Haben Sie noch eine Frage?"],
    fr: ["Puis-je vous aider pour autre chose ?", "Une autre question ?"], it: ["Posso aiutarla con altro?", "Ha altre domande?"], zh: ["还有什么想了解的吗？", "还有其他问题吗？"] }
};
export const phrase = (k, lang, seed) => vary(pick(P[k], lang), seed);

// ---- Product replies ----
const VAT = { incl: { en: "incl. VAT", de: "inkl. MwSt.", fr: "TVA incluse", it: "IVA inclusa", zh: "含税" }, excl: { en: "excl. VAT", de: "exkl. MwSt.", fr: "hors TVA", it: "IVA esclusa", zh: "不含税" } };
const vatWord = (inclVat, lang) => pick(inclVat ? VAT.incl : VAT.excl, lang);
/** "starts at CHF 14.90 per piece, CHF 11.90 from 100" in every language. */
function priceLine(name, tiers, inclVat, lang) {
  const a = tiers[0], b = tiers.length > 1 ? tiers.at(-1) : null, v = vatWord(inclVat, lang);
  const lo = b && b.unit_price < a.unit_price ? b : null;
  return {
    en: `${name} starts at ${money(a.currency, a.unit_price)} per piece${lo ? ` and drops to ${money(lo.currency, lo.unit_price)} from ${lo.min_qty} pieces` : ""} (${v}).`,
    de: `${name} gibt es ab ${money(a.currency, a.unit_price)} pro Stück${lo ? `, ab ${lo.min_qty} Stück nur ${money(lo.currency, lo.unit_price)}` : ""} (${v}).`,
    fr: `${name} commence à ${money(a.currency, a.unit_price)} la pièce${lo ? ` et descend à ${money(lo.currency, lo.unit_price)} dès ${lo.min_qty} pièces` : ""} (${v}).`,
    it: `${name} parte da ${money(a.currency, a.unit_price)} al pezzo${lo ? ` e scende a ${money(lo.currency, lo.unit_price)} da ${lo.min_qty} pezzi` : ""} (${v}).`,
    zh: `${name}单价 ${money(a.currency, a.unit_price)} 起${lo ? `，${lo.min_qty} 件起降到 ${money(lo.currency, lo.unit_price)}` : ""}（${v}）。`
  }[lang] ?? "";
}
function qtyLine(name, qty, unit, cur, inclVat, lang) {
  const total = money(cur, unit * qty), u = money(cur, unit), v = vatWord(inclVat, lang);
  return { en: `For ${qty} × ${name} it's ${u} each — ${total} in total (${v}, plus shipping).`, de: `Für ${qty} × ${name} sind es ${u} pro Stück – insgesamt ${total} (${v}, zzgl. Versand).`,
    fr: `Pour ${qty} × ${name}, c'est ${u} la pièce, soit ${total} au total (${v}, hors livraison).`, it: `Per ${qty} × ${name} sono ${u} al pezzo, ${total} in totale (${v}, spedizione esclusa).`,
    zh: `${qty} 件${name}：单价 ${u}，合计 ${total}（${v}，不含运费）。` }[lang];
}
const MATERIALS = { en: m => `You can choose ${m}.`, de: m => `Zur Wahl stehen ${m}.`, fr: m => `Au choix : ${m}.`, it: m => `Può scegliere tra ${m}.`, zh: m => `可选材质：${m}。` };
/**
 * Product / price answer. p: get_product result product; opts: { lang, seed, inclVat, qty, unitAtQty, ask: "price"|"product", yes }
 */
export function productReply(p, { lang, seed, inclVat, qty, unitAtQty, cur, yes = false }) {
  const name = p.name, out = [];
  if (yes) out.push(phrase("yes", lang, seed));
  if (qty && qty > 1 && unitAtQty != null) out.push(qtyLine(name, qty, unitAtQty, cur || p.price_tiers[0].currency, inclVat, lang));
  else out.push(priceLine(name, p.price_tiers, inclVat, lang));
  const mats = (p.materials || []).map(m => m.name).slice(0, 3);
  if (mats.length > 1 && !(qty > 1)) out.push(MATERIALS[lang]?.(joinOr(mats, lang)) || MATERIALS.en(joinOr(mats, "en")));
  out.push(phrase("next", lang, seed + "n"));
  return out.join(lang === "zh" ? "" : " ");
}
const SIZES = { en: (n, s) => `The ${n} comes in sizes ${s}.`, de: (n, s) => `${n} gibt es in den Größen ${s}.`, fr: (n, s) => `${n} existe en tailles ${s}.`, it: (n, s) => `${n} è disponibile nelle taglie ${s}.`, zh: (n, s) => `${n}有 ${s} 这些尺码。` };
const NO_SIZES = { en: n => `The ${n} is one size — there's no size to choose.`, de: n => `${n} gibt es nur in einer Größe.`, fr: n => `${n} est en taille unique.`, it: n => `${n} è in taglia unica.`, zh: n => `${n}是均码，不需要选尺码。` };
const COLORS = { en: (n, c) => `The ${n} is available in ${c}.`, de: (n, c) => `${n} gibt es in ${c}.`, fr: (n, c) => `${n} est disponible en ${c}.`, it: (n, c) => `${n} è disponibile in ${c}.`, zh: (n, c) => `${n}有${c}可选。` };
const COLOR_YES = { en: (n, c) => `Yes — the ${n} comes in ${c}.`, de: (n, c) => `Ja – ${n} gibt es in ${c}.`, fr: (n, c) => `Oui — ${n} existe en ${c}.`, it: (n, c) => `Sì — ${n} è disponibile in ${c}.`, zh: (n, c) => `有的，${n}有${c}。` };
const COLOR_NO = { en: (n, w, c) => `Not in ${w}, I'm afraid — the ${n} comes in ${c}.`, de: (n, w, c) => `In ${w} leider nicht – ${n} gibt es in ${c}.`, fr: (n, w, c) => `Pas en ${w}, malheureusement — ${n} existe en ${c}.`, it: (n, w, c) => `In ${w} purtroppo no — ${n} è disponibile in ${c}.`, zh: (n, w, c) => `抱歉，没有${w}。${n}可选颜色：${c}。` };
const PRINT_COLORS = { en: n => `The ${n} itself has a fixed base colour, but your design is printed in full colour — any colours you like.`, de: n => `${n} hat eine feste Grundfarbe, Ihr Design wird aber vollfarbig gedruckt – in jeder Farbe.`,
  fr: n => `${n} a une couleur de base fixe, mais votre design est imprimé en quadrichromie — toutes les couleurs sont possibles.`, it: n => `${n} ha un colore di base fisso, ma il suo design viene stampato a colori — qualsiasi colore.`, zh: n => `${n}本身是固定底色，但您的设计可以全彩印刷，颜色随意。` };
const TECH = { en: (n, t) => `The ${n} is printed with ${t}.`, de: (n, t) => `${n} wird im ${t}-Verfahren bedruckt.`, fr: (n, t) => `${n} est imprimé en ${t}.`, it: (n, t) => `${n} viene stampato in ${t}.`, zh: (n, t) => `${n}采用 ${t} 工艺印制。` };
const ECO = { en: (n, t) => `Good news: the ${n} is tagged ${t}.`, de: (n, t) => `Gute Nachricht: ${n} ist als ${t} gekennzeichnet.`, fr: (n, t) => `Bonne nouvelle : ${n} est labellisé ${t}.`, it: (n, t) => `Buone notizie: ${n} è contrassegnato come ${t}.`, zh: (n, t) => `${n}带有环保标签：${t}。` };
const SIZES_NEXT = { en: "Want me to check the price for your quantity?", de: "Soll ich den Preis für Ihre Menge berechnen?", fr: "Je calcule le prix pour votre quantité ?", it: "Calcolo il prezzo per la sua quantità?", zh: "需要我按您的数量算一下价格吗？" };
/** Attribute answers: sizes / colours (incl. "and in blue?") / material / technique / eco. raw: catalogue product (sizes, colors hex, technique, eco_tags). */
export function attrReply(kind, raw, p, { lang, seed, colorWord }) {
  const n = p.name;
  if (kind === "sizes") return (raw.sizes?.length ? pick(SIZES, lang)(n, raw.sizes.length > 2 ? `${raw.sizes[0]}–${raw.sizes.at(-1)} (${raw.sizes.join(", ")})` : raw.sizes.join(", ")) : pick(NO_SIZES, lang)(n)) + " " + pick(SIZES_NEXT, lang);
  if (kind === "colors") {
    const names = [...new Set((raw.colors || []).map(colorName))];
    if (!names.length) return pick(PRINT_COLORS, lang)(n);
    const labels = names.map(c => colorLabel(c, lang)), list = join(labels, lang);
    if (colorWord) {
      const fam = colorFamily(colorWord), hits = names.filter(c => (FAMILY[fam] || []).includes(c));
      if (hits.length) return pick(COLOR_YES, lang)(n, join(hits.map(c => colorLabel(c, lang)), lang)) + " " + phrase("next", lang, seed);
      return pick(COLOR_NO, lang)(n, colorWord.toLowerCase(), list);
    }
    return pick(COLORS, lang)(n, list) + " " + phrase("next", lang, seed);
  }
  if (kind === "technique" && raw.technique) return pick(TECH, lang)(n, raw.technique) + " " + phrase("more", lang, seed);
  if (kind === "eco" && (raw.eco_tags || []).length) return pick(ECO, lang)(n, raw.eco_tags.join(", ")) + " " + phrase("more", lang, seed);
  const mats = (p.materials || []).map(m => m.name);
  const MAT_OF = { en: (n, m) => `For the ${n} you can choose ${m}.`, de: (n, m) => `${n} gibt es aus ${m}.`, fr: (n, m) => `Pour ${n}, vous avez le choix entre ${m}.`, it: (n, m) => `Per ${n} può scegliere tra ${m}.`, zh: (n, m) => `${n}可选材质：${m}。` };
  if (mats.length) return pick(MAT_OF, lang)(n, joinOr(mats, lang)) + " " + phrase("next", lang, seed);
  return null;
}

// ---- Knowledge-base answers: never paste a raw chunk ----
const ALSO = { en: "Also:", de: "Ausserdem:", fr: "À noter aussi :", it: "Inoltre:", zh: "另外，" };
/**
 * Fluent answer from 1–2 knowledge hits: the 1–2 sentences of the best entry that answer THIS question, optionally one
 * sentence from a second, different strong hit, then a light follow-up. hits: [{ answer, score, norm }]
 */
const POLICY_LABEL = {
  "/returns": { en: "Returns policy", de: "Rückgaberegeln", fr: "Politique de retour", it: "Politica di reso", zh: "退换政策" },
  "/shipping": { en: "Shipping details", de: "Versanddetails", fr: "Détails de livraison", it: "Dettagli spedizione", zh: "配送说明" },
  "/terms": { en: "Terms", de: "AGB", fr: "CGV", it: "Condizioni", zh: "条款" },
  "/privacy": { en: "Privacy policy", de: "Datenschutz", fr: "Confidentialité", it: "Privacy", zh: "隐私政策" } };
const JOINER = /\b(and|also|plus|und|auch|sowie|et|aussi|e|anche|oppure)\b|和|还有|以及|另外/i;
export function kbReply(hits, question, { lang, seed, followUp = true, maxSentences = 2 }) {
  if (!hits?.length) return null;
  // Pull "Details: /returns" style references out of the answer and add them back as one clean markdown link.
  let links = [];
  const strip = a => String(a).replace(/\s*(?:Details|Détails|Dettagli|Mehr|Infos?|详情|详见)(?:\s*[（(][^)）]*[)）])?\s*[:：]?\s*(\/(?:returns|shipping|terms|privacy))\b[.。]?/gi, (m, path) => { links.push(path); return ""; });
  let text = pickSentences(strip(hits[0].answer), question, { max: maxSentences });
  const second = hits[1];
  if (second && (second.norm ?? 0) >= 0.8 && JOINER.test(question) && second.answer !== hits[0].answer) {
    const extra = pickSentences(second.answer, question, { max: 1 });
    if (extra && !text.includes(extra) && tokenize(extra).some(t => tokenize(question).includes(t))) text += (lang === "zh" ? "" : " ") + pick(ALSO, lang) + (lang === "zh" ? "" : " ") + extra;
  }
  links = [...new Set(links)];
  if (links.length) text += (lang === "zh" ? " " : " ") + links.map(l => `[${pick(POLICY_LABEL[l] || POLICY_LABEL["/terms"], lang)}](${l})`).join(" · ") + (lang === "zh" ? "" : ".");
  if (followUp && !/[?？]\s*$/.test(text)) text += (lang === "zh" ? "" : " ") + phrase("more", lang, seed);
  return text;
}

// ---- Delivery ----
const DELIVERY = {
  en: (n, d, p) => `${n ? `For the ${n}, plan` : "Plan"} about ${d} business days door to door: roughly ${p} days of production (made to order), then shipping from China with YunExpress or 4PX.`,
  de: (n, d, p) => `${n ? `Für ${n} rechnen Sie` : "Rechnen Sie"} mit etwa ${d} Werktagen bis zur Haustür: rund ${p} Tage Produktion (auf Bestellung), dann Versand aus China mit YunExpress oder 4PX.`,
  fr: (n, d, p) => `${n ? `Pour ${n}, comptez` : "Comptez"} environ ${d} jours ouvrables jusqu'à chez vous : environ ${p} jours de production (à la commande), puis l'envoi depuis la Chine par YunExpress ou 4PX.`,
  it: (n, d, p) => `${n ? `Per ${n} conti` : "Conti"} circa ${d} giorni lavorativi fino a casa: circa ${p} giorni di produzione (su ordinazione), poi la spedizione dalla Cina con YunExpress o 4PX.`,
  zh: (n, d, p) => `${n ? `${n}从下单到送达` : "从下单到送达"}大约需要 ${d} 个工作日：按单生产约 ${p} 个工作日，然后由云途或递四方从中国寄出。`
};
const DELIVERY_NEXT = { en: "Want exact dates and the shipping price for your country?", de: "Möchten Sie genaue Daten und den Versandpreis für Ihr Land?", fr: "Voulez-vous les dates exactes et le prix de livraison pour votre pays ?", it: "Vuole le date esatte e il costo di spedizione per il suo paese?", zh: "需要我按您的国家给出具体日期和运费吗？" };
export function deliveryReply(f, { lang, productName }) {
  return pick(DELIVERY, lang)(productName, f.delivery_days, f.production_days?.CH ?? f.production_days) + " " + pick(DELIVERY_NEXT, lang);
}

// ---- Don't know / greeting / clarify ----
const DONT_KNOW = {
  en: [`Hmm, I don't have a reliable answer to that. I'm best with products, prices, shipping and orders — or our team can help at ${SUPPORT_EMAIL}.`, `I'm not sure about that one, and I'd rather not guess. Ask me about products, prices, delivery or your order — or write to ${SUPPORT_EMAIL}.`],
  de: [`Darauf habe ich leider keine verlässliche Antwort. Ich helfe gern bei Produkten, Preisen, Versand und Bestellungen – oder unser Team unter ${SUPPORT_EMAIL}.`],
  fr: [`Je n'ai pas de réponse fiable à cela. Je peux vous aider pour les produits, les prix, la livraison et les commandes — ou notre équipe à ${SUPPORT_EMAIL}.`],
  it: [`Non ho una risposta affidabile su questo. Posso aiutarla con prodotti, prezzi, spedizioni e ordini — oppure il nostro team a ${SUPPORT_EMAIL}.`],
  zh: [`这个问题我没有把握，不想乱答。我擅长产品、价格、运费和订单方面的问题；也可以发邮件到 ${SUPPORT_EMAIL} 联系团队。`]
};
export const dontKnow = (lang, seed) => vary(pick(DONT_KNOW, lang), seed);
const CLARIFY_CARDS = { en: "Happy to help! Which cards do you mean — invitations, menu cards, place cards or greeting cards?", de: "Gerne! Welche Karten meinen Sie – Einladungen, Menükarten, Platzkarten oder Grusskarten?",
  fr: "Avec plaisir ! De quelles cartes parlez-vous — faire-part, cartes de menu, marque-places ou cartes de vœux ?", it: "Volentieri! Quali biglietti intende — inviti, menù, segnaposto o biglietti d'auguri?", zh: "好的！请问是哪种卡片：邀请卡、菜单卡、席位卡还是贺卡？" };
export const clarifyCards = lang => pick(CLARIFY_CARDS, lang);
export const CARD_CHIPS = { en: ["Invitations", "Menu cards", "Place cards", "Greeting cards"], de: ["Einladungen", "Menükarten", "Platzkarten", "Grusskarten"], fr: ["Faire-part", "Cartes de menu", "Marque-places", "Cartes de vœux"], it: ["Inviti", "Menù", "Segnaposto", "Biglietti d'auguri"], zh: ["邀请卡", "菜单卡", "席位卡", "贺卡"] };

// ---- Contextual next-question chips (phrased so the engine understands them) ----
const C = {
  product: { en: p => [`Shipping for 10 ${p} to Switzerland`, "How long does delivery take?", `Sizes and colours of the ${p}`], de: p => [`Versand für 10 × ${p} in die Schweiz`, "Wie lange dauert die Lieferung?", `Größen und Farben: ${p}`],
    fr: p => [`Livraison de 10 ${p} en Suisse`, "Délai de livraison ?", `Tailles et couleurs : ${p}`], it: p => [`Spedizione di 10 ${p} in Svizzera`, "Tempi di consegna?", `Taglie e colori: ${p}`], zh: p => [`10 件${p}寄到瑞士运费`, "多久能送达？", `${p}有哪些尺码和颜色`] },
  quote: { en: () => ["How long does delivery take?", "Which payment methods?", "Talk to a person"], de: () => ["Wie lange dauert die Lieferung?", "Welche Zahlungsarten?", "Mit einem Menschen sprechen"],
    fr: () => ["Délai de livraison ?", "Moyens de paiement ?", "Parler à une personne"], it: () => ["Tempi di consegna?", "Metodi di pagamento?", "Parlare con una persona"], zh: () => ["多久能送达？", "支持哪些付款方式？", "转人工"] },
  delivery: { en: () => ["Shipping to Switzerland for 10 invitations", "Track my order", "Can I see a proof first?"], de: () => ["Versand in die Schweiz für 10 Einladungen", "Meine Bestellung verfolgen", "Bekomme ich vorher einen Korrekturabzug?"],
    fr: () => ["Livraison de 10 faire-part en Suisse", "Suivre ma commande", "Vais-je recevoir une épreuve ?"], it: () => ["Spedizione di 10 inviti in Svizzera", "Traccia il mio ordine", "Ricevo una bozza prima?"], zh: () => ["10 份邀请卡寄到瑞士运费多少", "查询我的订单", "生产前能看到效果图吗？"] },
  policy: { en: () => ["How long does delivery take?", "Which payment methods?", "Talk to a person"], de: () => ["Wie lange dauert die Lieferung?", "Welche Zahlungsarten?", "Mit einem Menschen sprechen"],
    fr: () => ["Délai de livraison ?", "Moyens de paiement ?", "Parler à une personne"], it: () => ["Tempi di consegna?", "Metodi di pagamento?", "Parlare con una persona"], zh: () => ["多久能送达？", "支持哪些付款方式？", "转人工"] },
  browse: { en: () => ["Recommend wedding favours", "How much are invitations?", "Do you have t-shirts?"], de: () => ["Gastgeschenke empfehlen", "Was kosten Einladungen?", "Habt ihr T-Shirts?"],
    fr: () => ["Idées de cadeaux invités", "Prix des faire-part ?", "Avez-vous des t-shirts ?"], it: () => ["Idee per bomboniere", "Quanto costano gli inviti?", "Avete magliette?"], zh: () => ["推荐婚礼伴手礼", "邀请卡多少钱？", "有 T 恤吗？"] }
};
export function nextChips(kind, lang, productName) { const e = C[kind]; if (!e) return null; return (e[lang] || e.en)(productName || ""); }
