// Shared, pure helpers for local product recommendation (site chat + Pod.AI): refinement words ("cheaper", "more like
// this", "something nicer"), total budgets, guest counts, colour words and deadlines in EN / DE / FR / IT / ZH.
// No imports, no state. Each chat keeps its own catalogue logic (site: studio catalog, Pod.AI: the merchant's Shopify products).
export const RECO_HINT = /\b(ideas?|idées?|idee|suggestions?|vorschläge?|gifts?|geschenke?|cadeaux?|regal[io]|looking for|suche[n]?|cherche|cerco|need|brauchen|besoin|servono|options?|what (should|could) (i|we))\b|礼物|点子|建议|需要|有什么好/i;
export const CHEAPER_RE = /(cheaper|less expensive|lower price|more affordable|budget option|günstiger|billiger|preiswerter|moins cher|plus abordable|meno car[oie]|più economic|più convenient|便宜|实惠|低一点|更省)/i;
export const PRICIER_RE = /(premium|fancier|nicer|higher[- ]end|more special|hochwertiger|edler|exklusiver|haut de gamme|plus chic|più pregiat|di lusso|高档|好一点|更好的|更高级)/i;
export const MORE_RE = /(more like (this|these)|similar|something else|other (options|ideas)|more (options|ideas)|show more|anything else|weitere|andere (ideen|vorschläge|optionen)|ähnlich|noch mehr|d'autres|similaires|autre chose|plus d'idées|altr[ei] (idee|propost|opzion)|simil[ie]|qualcos'altro|更多|类似|其他|别的|换一批|还有吗)/i;
export const TOTAL_RE = /(total|in total|overall|insgesamt|gesamt(budget)?|au total|en tout|in totale|complessiv|总共|一共|总预算|全部)/i;
export const QTY_GUESTS_RE = /(\d{1,4})\s*(guests?|people|persons?|pax|gäste|personen|leute|invités|personnes|ospiti|persone|位客人|个客人|位宾客|个人|人|桌)/i;

const MONTHS = { jan: 0, january: 0, januar: 0, janvier: 0, gennaio: 0, feb: 1, february: 1, februar: 1, février: 1, fevrier: 1, febbraio: 1, mar: 2, march: 2, märz: 2, maerz: 2, mars: 2, marzo: 2,
  apr: 3, april: 3, avril: 3, aprile: 3, may: 4, mai: 4, maggio: 4, jun: 5, june: 5, juni: 5, juin: 5, giugno: 5, jul: 6, july: 6, juli: 6, juillet: 6, luglio: 6, aug: 7, august: 7, août: 7, aout: 7, agosto: 7,
  sep: 8, sept: 8, september: 8, septembre: 8, settembre: 8, oct: 9, october: 9, oktober: 9, octobre: 9, ottobre: 9, nov: 10, november: 10, novembre: 10, dec: 11, december: 11, dezember: 11, décembre: 11, decembre: 11, dicembre: 11 };
const ymd = d => d.toISOString().slice(0, 10);
function future(y, m, d, today) { let t = new Date(Date.UTC(y ?? today.getUTCFullYear(), m, d)); if (y == null && t < today) t = new Date(Date.UTC(today.getUTCFullYear() + 1, m, d)); return isNaN(t) ? null : t; }
/** Deadline / event date → YYYY-MM-DD (or null). */
export function parseDeadline(text, today = new Date()) {
  const t = String(text || "").toLowerCase(), base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let m = t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/); if (m) return ymd(future(+m[1], +m[2] - 1, +m[3], base));
  m = t.match(/\b(\d{1,2})\.(\d{1,2})\.(20\d\d|\d\d)?(?!\d)/); if (m && +m[2] <= 12 && +m[1] <= 31) return ymd(future(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null, +m[2] - 1, +m[1], base));
  m = t.match(/(?:(20\d\d)年)?(\d{1,2})月(\d{1,2})[日号]/); if (m) return ymd(future(m[1] ? +m[1] : null, +m[2] - 1, +m[3], base));
  const mon = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|er|\\.)?\\s+(${mon})\\b\\.?(?:\\s+(20\\d\\d))?`, "u")); if (m) return ymd(future(m[3] ? +m[3] : null, MONTHS[m[2]], +m[1], base));
  m = t.match(new RegExp(`\\b(${mon})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d\\d))?`, "u")); if (m) return ymd(future(m[3] ? +m[3] : null, MONTHS[m[1]], +m[2], base));
  const zhN = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  m = t.match(/(?:in|within|innerhalb von|in den nächsten|dans|d'ici|sous|entro|tra|fra)\s+(\d{1,2}|two|three|four|zwei|drei|vier|deux|trois|quatre|due|tre|quattro)\s+(weeks?|wochen?|semaines?|settiman[ae]|days?|tagen?|jours?|giorni)/i)
    || t.match(/(\d{1,2}|[一二两三四五六])\s*(周|个?星期|天)/);
  if (m) { const w = { two: 2, three: 3, four: 4, zwei: 2, drei: 3, vier: 4, deux: 2, trois: 3, quatre: 4, due: 2, tre: 3, quattro: 4 }; const n = Number(m[1]) || w[m[1]] || zhN[m[1]] || 0;
    const days = /week|woche|semaine|settiman|周|星期/i.test(m[2]) ? n * 7 : n; if (n) return ymd(new Date(base.getTime() + days * 864e5)); }
  if (/(next week|nächste woche|semaine prochaine|settimana prossima|下周)/i.test(t)) return ymd(new Date(base.getTime() + 7 * 864e5));
  return null;
}


// Colour words → canonical colour (variant titles / options are matched with the same lists).
export const COLOR_WORDS = [
  ["blue", /\b(blue|navy|blau|marine|dunkelblau|bleu|blu)\b|蓝/i], ["green", /\b(green|sage|olive|grün|salbei|vert|verde)\b|绿/i],
  ["pink", /\b(pink|blush|rose|rosa|rosé|dusty rose)\b|粉/i], ["white", /\b(white|weiss|weiß|blanc(he)?|bianc[oa])\b|白/i],
  ["cream", /\b(cream|ivory|beige|creme|crème|ivoire|avorio|panna)\b|米色|象牙|奶白/i], ["black", /\b(black|schwarz|noir[e]?|ner[oa])\b|黑/i],
  ["red", /\b(red|rot|rouge|ross[oa])\b|红/i], ["grey", /\b(gr[ae]y|grau|gris|grigio)\b|灰/i], ["yellow", /\b(yellow|gelb|jaune|giall[oa])\b|黄/i],
  ["purple", /\b(purple|lila|violett|violet|viola)\b|紫/i], ["brown", /\b(brown|braun|marron|marrone)\b|棕|咖啡色/i], ["orange", /\b(orange|arancione)\b|橙/i]
];
export const colorOf = text => COLOR_WORDS.find(([, re]) => re.test(String(text || "")))?.[0] || null;
export const colorRe = c => COLOR_WORDS.find(([k]) => k === c)?.[1] || null;

/** Budget / total / currency / guests / refine / deadline from one message (cls: classifier result with budget, quantity). */
export function parseCommon(text, cls = {}) {
  const t = String(text || ""), g = t.match(QTY_GUESTS_RE);
  const quantity = g ? Number(g[1]) : (cls.quantity || null);
  let budget = cls.budget || null, budget_total = null;
  if (budget && TOTAL_RE.test(t)) { budget_total = budget; budget = null; }
  else if (!budget && TOTAL_RE.test(t)) {
    const c = t.match(/(?:chf|eur|€|usd|\$|fr\.)\s*(\d{2,6}(?:[.,]\d{1,2})?)|(\d{2,6}(?:[.,]\d{1,2})?)\s*(?:chf|eur|euros?|€|usd|\$|fr\.|franken|francs?|franchi|元|块)/i);
    const w = t.match(new RegExp(TOTAL_RE.source + "[^\\d]{0,20}(\\d{2,6})", "i"));
    const v = c ? (c[1] || c[2]) : w ? w[w.length - 1] : null; if (v) budget_total = Number(String(v).replace(",", "."));
  }
  const curM = (budget || budget_total) ? t.match(/(chf|fr\.|franken|francs?|franchi)|(eur|euros?|€)|(usd|\$|dollars?)|(元|块|rmb|cny|人民币)/i) : null;
  const budget_cur = curM ? (curM[1] ? "CHF" : curM[2] ? "EUR" : curM[3] ? "USD" : "CNY") : null;
  const refine = CHEAPER_RE.test(t) ? "cheaper" : PRICIER_RE.test(t) ? "pricier" : MORE_RE.test(t) ? "more" : null;
  const qtyOnly = !!g && t.replace(QTY_GUESTS_RE, "").replace(/\b(and|for|und|für|et|pour|e|per|y|para|what about|how about)\b|[?？!.,。给要]/gi, "").trim().length < 3;
  return { quantity, budget, budget_total, budget_cur, refine, qtyOnly, color: colorOf(t), deadline: parseDeadline(t) };
}
