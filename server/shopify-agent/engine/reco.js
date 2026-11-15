// Pod.AI local product recommendation (no API): the merchant's own Shopify products (Admin API, read_products) ranked for
// what the shopper asked — product words, recipient (her / him / kids / gift / wedding …), budget per item or total,
// colour (variant titles), quantity — with a one-line reason in the reply, real prices + storefront links on the cards
// (the widget's View / Add to cart buttons), "goes well with" items from the same collection, and refinements
// ("cheaper", "more like this", "in blue", "under 30", "for 20 people"). Only real products and prices, never invented.
import { parseCommon, colorRe, RECO_HINT } from "../../shared/reco-core.js";
import { productTerms } from "../../shared/lang-terms.js";

const RECIPIENTS = [
  ["her", /\b(für sie|pour elle|per lei|her|she|wife|girlfriend|mum|mom|mother|sister|women|woman|ladies|frau|freundin|mutter|mama|schwester|damen|elle|femme|copine|maman|sœur|lei|moglie|ragazza|mamma|sorella|donna)\b|女朋友|老婆|妈妈|姐姐|妹妹|女士|女生|她/i, /\b(women|woman|ladies|damen|femme|donna|her|she)\b|女/i],
  ["him", /\b(für ihn|pour lui|per lui|him|he|husband|boyfriend|dad|father|brother|men|man|gents|mann|freund|vater|papa|bruder|herren|lui|mari|copain|père|frère|homme|marito|ragazzo|papà|fratello|uomo)\b|男朋友|老公|爸爸|哥哥|弟弟|男士|男生|他/i, /\b(men|man|gents|herren|homme|uomo|him|he)\b|男/i],
  ["kids", /\b(kids?|child|children|baby|toddler|kinder?|baby|enfants?|bébé|bambin[io]|neonat)\b|孩子|小孩|儿童|宝宝/i, /\b(kids?|child|children|baby|kinder|enfant|bambin)\b|儿童|宝宝/i],
  ["gift", /\b(gifts?|present|geschenk\w*|cadeaux?|regal[io])\b|礼物|送人|送礼/i, /\b(gifts?|geschenk|cadeau|regalo)\b|礼/i],
  ["wedding", /\b(wedding|bride|groom|hochzeit|braut|mariage|mariée|matrimonio|sposa)\b|婚礼|结婚|新娘/i, /\b(wedding|bridal|bride|hochzeit|mariage|matrimonio)\b|婚/i]
];
const GENERIC = new Set(["gift", "gifts", "idea", "ideas", "recommend", "recommendation", "suggest", "something", "present", "geschenk", "geschenke", "idee", "ideen", "cadeau", "cadeaux", "idées", "regalo", "regali", "idee",
  "cheaper", "cheap", "more", "similar", "other", "options", "budget", "under", "below", "bestseller", "bestsellers", "products", "product", "show", "please", "best", "good", "nice"]);
const RX_RECO = /(recommend|suggest|ideas?|what should|which (one|product)|best for|gift|empfehl|vorschlag|idee|geschenk|conseill|suggér|idée|cadeau|consigli|regalo|推荐|建议|送什么|买什么|礼物)/i;

const T = {
  en: { lead: (n, w) => `Here ${n === 1 ? "is a pick" : `are ${n} picks`}${w}.`, for: x => ` for ${x}`, under: b => ` under ${b}`, inC: c => ` in ${c}`, top: (n, p, r) => `I'd start with ${n} at ${p}${r ? ` — ${r}` : ""}.`, also: xs => `Also worth a look: ${xs}.`,
    pairs: xs => `Goes well with: ${xs}.`, ask: "Want cheaper ones, more like these, or a different colour?", clarify: "Happy to help! Who is it for, and roughly what budget? Or tell me what kind of product you have in mind.",
    none: "I couldn't find a product that matches all of that.", noneBudget: b => `Nothing is under ${b} right now — here are the most affordable options.`, noneColor: c => `I don't see ${c} in our current products — here are close matches.`,
    noMore: "That's all I have for this right now — want to try another budget or colour?", cheaperNone: "These are already our most affordable options for this.", total: (q, s) => ` (${q} pcs ≈ ${s})`,
    r: { color: c => `available in ${c}`, budget: "within your budget", her: "a nice pick for her", him: "a good pick for him", kids: "made for kids", gift: "a popular gift", wedding: "fits a wedding", term: "matches what you asked for", new: "one of our newest pieces" },
    who: { her: "her", him: "him", kids: "kids", gift: "a gift", wedding: "a wedding" }, chips: { cheaper: "Cheaper options", more: "More like this", clar: ["Gift ideas", "Under 50", "Show me your products"] } },
  de: { lead: (n, w) => `Hier ${n === 1 ? "ist ein Vorschlag" : `sind ${n} Vorschläge`}${w}.`, for: x => ` für ${x}`, under: b => ` unter ${b}`, inC: c => ` in ${c}`, top: (n, p, r) => `Ich würde mit ${n} für ${p} anfangen${r ? ` – ${r}` : ""}.`, also: xs => `Ebenfalls interessant: ${xs}.`,
    pairs: xs => `Passt gut dazu: ${xs}.`, ask: "Möchten Sie günstigere, mehr davon oder eine andere Farbe?", clarify: "Gerne! Für wen ist es und mit welchem Budget ungefähr? Oder sagen Sie mir, an welche Art Produkt Sie denken.",
    none: "Dazu habe ich kein passendes Produkt gefunden.", noneBudget: b => `Unter ${b} gibt es gerade nichts – hier die günstigsten Optionen.`, noneColor: c => `In ${c} sehe ich gerade nichts – hier ähnliche Produkte.`,
    noMore: "Mehr habe ich dazu gerade nicht – anderes Budget oder andere Farbe?", cheaperNone: "Das sind dafür bereits die günstigsten Optionen.", total: (q, s) => ` (${q} Stück ≈ ${s})`,
    r: { color: c => `in ${c} erhältlich`, budget: "im Budget", her: "schön für sie", him: "passend für ihn", kids: "für Kinder gemacht", gift: "ein beliebtes Geschenk", wedding: "passt zur Hochzeit", term: "passt zu Ihrer Suche", new: "eines unserer neuesten Produkte" },
    who: { her: "sie", him: "ihn", kids: "Kinder", gift: "ein Geschenk", wedding: "eine Hochzeit" }, chips: { cheaper: "Günstigere Optionen", more: "Mehr davon", clar: ["Geschenkideen", "Unter 50", "Zeig mir eure Produkte"] } },
  fr: { lead: (n, w) => `Voici ${n === 1 ? "une idée" : `${n} idées`}${w}.`, for: x => ` pour ${x}`, under: b => ` à moins de ${b}`, inC: c => ` en ${c}`, top: (n, p, r) => `Je commencerais par ${n} à ${p}${r ? ` — ${r}` : ""}.`, also: xs => `À voir aussi : ${xs}.`,
    pairs: xs => `Va bien avec : ${xs}.`, ask: "Vous voulez moins cher, d'autres idées similaires ou une autre couleur ?", clarify: "Avec plaisir ! C'est pour qui, et quel budget environ ? Ou dites-moi quel type de produit vous cherchez.",
    none: "Je n'ai pas trouvé de produit correspondant à tout cela.", noneBudget: b => `Rien à moins de ${b} pour le moment — voici les options les plus abordables.`, noneColor: c => `Je ne vois pas de ${c} actuellement — voici des produits proches.`,
    noMore: "C'est tout pour le moment — essayer un autre budget ou une autre couleur ?", cheaperNone: "Ce sont déjà nos options les plus abordables.", total: (q, s) => ` (${q} pièces ≈ ${s})`,
    r: { color: c => `disponible en ${c}`, budget: "dans votre budget", her: "parfait pour elle", him: "idéal pour lui", kids: "pensé pour les enfants", gift: "un cadeau apprécié", wedding: "parfait pour un mariage", term: "correspond à votre recherche", new: "une de nos nouveautés" },
    who: { her: "elle", him: "lui", kids: "les enfants", gift: "un cadeau", wedding: "un mariage" }, chips: { cheaper: "Moins cher", more: "D'autres idées similaires", clar: ["Idées cadeaux", "Moins de 50", "Quels produits vendez-vous ?"] } },
  it: { lead: (n, w) => `Ecco ${n === 1 ? "un'idea" : `${n} idee`}${w}.`, for: x => ` per ${x}`, under: b => ` sotto ${b}`, inC: c => ` in ${c}`, top: (n, p, r) => `Partirei da ${n} a ${p}${r ? ` — ${r}` : ""}.`, also: xs => `Da vedere anche: ${xs}.`,
    pairs: xs => `Si abbina bene a: ${xs}.`, ask: "Vuole opzioni più economiche, altre simili o un altro colore?", clarify: "Volentieri! Per chi è e con che budget più o meno? Oppure mi dica che tipo di prodotto cerca.",
    none: "Non ho trovato un prodotto che corrisponda a tutto questo.", noneBudget: b => `Al momento non c'è nulla sotto ${b} — ecco le opzioni più convenienti.`, noneColor: c => `Non vedo ${c} tra i prodotti attuali — ecco quelli più vicini.`,
    noMore: "Per ora è tutto — proviamo un altro budget o colore?", cheaperNone: "Queste sono già le opzioni più convenienti.", total: (q, s) => ` (${q} pezzi ≈ ${s})`,
    r: { color: c => `disponibile in ${c}`, budget: "nel suo budget", her: "perfetto per lei", him: "ideale per lui", kids: "pensato per i bambini", gift: "un regalo apprezzato", wedding: "adatto a un matrimonio", term: "corrisponde alla sua ricerca", new: "una delle nostre novità" },
    who: { her: "lei", him: "lui", kids: "i bambini", gift: "un regalo", wedding: "un matrimonio" }, chips: { cheaper: "Più economico", more: "Altre simili", clar: ["Idee regalo", "Sotto 50", "Che prodotti avete?"] } },
  zh: { lead: (n, w) => `${w ? `${w}，` : ""}为您挑了 ${n} 款。`, for: x => `送${x}`, under: b => `${b} 以内`, inC: c => c, top: (n, p, r) => `首推${n}，${p}${r ? `，${r}` : ""}。`, also: xs => `也可以看看${xs}。`,
    pairs: xs => `可以搭配：${xs}。`, ask: "要更便宜的、类似的更多款，还是换个颜色？", clarify: "好的！是送给谁的，预算大概多少？或者告诉我您想要哪类商品。",
    none: "没有找到同时满足这些条件的商品。", noneBudget: b => `${b} 以内暂时没有，下面是最实惠的几款。`, noneColor: c => `目前没有${c}的款，下面是相近的商品。`,
    noMore: "目前就这些了，要不要换个预算或颜色？", cheaperNone: "这些已经是最实惠的了。", total: (q, s) => `（${q} 件约 ${s}）`,
    r: { color: c => `有${c}`, budget: "在预算内", her: "适合送她", him: "适合送他", kids: "适合小朋友", gift: "很受欢迎的礼物", wedding: "适合婚礼", term: "符合您的要求", new: "新品" },
    who: { her: "她", him: "他", kids: "小朋友", gift: "礼物", wedding: "婚礼" }, chips: { cheaper: "更便宜的", more: "类似的更多款", clar: ["礼物推荐", "50 以内", "你们有什么商品"] } }
};
const COLOR_NAME = { en: { blue: "blue", green: "green", pink: "pink", white: "white", cream: "cream", black: "black", red: "red", grey: "grey", yellow: "yellow", purple: "purple", brown: "brown", orange: "orange" },
  de: { blue: "Blau", green: "Grün", pink: "Rosa", white: "Weiss", cream: "Creme", black: "Schwarz", red: "Rot", grey: "Grau", yellow: "Gelb", purple: "Lila", brown: "Braun", orange: "Orange" },
  fr: { blue: "bleu", green: "vert", pink: "rose", white: "blanc", cream: "crème", black: "noir", red: "rouge", grey: "gris", yellow: "jaune", purple: "violet", brown: "marron", orange: "orange" },
  it: { blue: "blu", green: "verde", pink: "rosa", white: "bianco", cream: "panna", black: "nero", red: "rosso", grey: "grigio", yellow: "giallo", purple: "viola", brown: "marrone", orange: "arancione" },
  zh: { blue: "蓝色", green: "绿色", pink: "粉色", white: "白色", cream: "米色", black: "黑色", red: "红色", grey: "灰色", yellow: "黄色", purple: "紫色", brown: "棕色", orange: "橙色" } };
const money = (c, n) => `${c || ""} ${Number(n || 0).toFixed(2)}`.trim();
const AND = { en: " and ", de: " und ", fr: " et ", it: " e ", zh: "和" };
const join = (xs, l) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(l === "zh" ? "、" : ", ") + (AND[l] || AND.en) + xs[xs.length - 1];

/** Needs from one message (Pod.AI). */
export function podaiNeeds(text, cls = {}) {
  const c = parseCommon(text, cls), t = String(text || "");
  const who = RECIPIENTS.find(([, re]) => re.test(t))?.[0] || null;
  const terms = productTerms(t).filter(w => !GENERIC.has(w.toLowerCase()) && !/^\d+$/.test(w) && !colorRe(c.color)?.test(w) && !RECIPIENTS.some(([, re]) => re.test(w)));
  return { ...c, who, terms };
}
export const wantsReco = (text, intent) => intent === "recommendation" || RX_RECO.test(text) || RECO_HINT.test(text);
export function isFollowUp(text, reco, conv) {
  if (!reco?.shown?.length && !reco?.asked) return false;
  if ((conv?.messages?.length || 0) - (reco.at || 0) > 4) return false;
  const n = podaiNeeds(text);
  if (reco.asked && (n.who || n.terms.length || n.budget || n.color)) return true;
  return !!(n.refine || n.qtyOnly || ((n.color || n.budget || n.budget_total) && String(text).length < 50));
}

/**
 * Recommend from the shop. search(query, { browse, limit }) → { ok, products } (searchShopProducts). Returns the reply text
 * (cards + chips pushed to ctx.ui) or null when this is not a recommendation.
 */
export async function podaiRecommend(ctx, cls, text, { search, follow = false }) {
  const { lang: L0, conv } = ctx, lang = T[L0] ? L0 : "en", X = T[lang], s = conv.slots;
  const fresh = podaiNeeds(text, cls), prev = follow ? (s.reco?.needs || {}) : {};
  const n = { ...prev };
  for (const k of ["who", "color", "budget", "budget_total", "quantity"]) if (fresh[k] != null) n[k] = fresh[k];
  if (fresh.terms.length && !(follow && fresh.qtyOnly)) n.terms = fresh.terms;
  if (fresh.budget) n.budget_total = null;
  const refine = fresh.refine;
  const per = n.budget || (n.budget_total && n.quantity ? Math.floor(n.budget_total / n.quantity * 100) / 100 : null);
  // one short clarifying question when nothing is known
  if (!follow && !n.who && !(n.terms || []).length && !per && !n.color && !s.reco?.asked) {
    s.reco = { needs: n, shown: [], asked: true, at: conv.messages.length }; ctx.ui.push({ type: "chips", items: X.chips.clar }); return X.clarify;
  }
  // candidates: product-word search (relevance) + newest products (for gifts / recipients / refinements)
  const pool = new Map(), add = list => (list || []).forEach(p => { if (!pool.has(p.id)) pool.set(p.id, { ...p, _i: pool.size }); });
  if ((n.terms || []).length) { const r = await search(n.terms.join(" "), { limit: 24 }); if (!r.ok) return null; add(r.products); }
  if (!(n.terms || []).length || pool.size < 6 || refine) { const r = await search("", { browse: true, limit: 24 }); if (r.ok) add(r.products); }
  if (!pool.size) return null;
  const exclude = new Set(refine === "more" || refine === "cheaper" || refine === "pricier" ? (s.reco?.shown || []) : []);
  const lastMin = s.reco?.prices?.length ? Math.min(...s.reco.prices) : null, lastMax = s.reco?.prices?.length ? Math.max(...s.reco.prices) : null;
  const cre = colorRe(n.color), who = RECIPIENTS.find(([k]) => k === n.who);
  const hay = p => [p.name, p.type, ...(p.tags || []), ...(p.collections || [])].join(" ");
  const scored = [], drop = { budget: 0, color: 0 };
  for (const p of pool.values()) {
    if (exclude.has(p.id)) continue;
    const avail = (p.variants || []).filter(v => v.available);
    if ((p.variants || []).length && !avail.length) continue;
    let price = Number.isFinite(p.unit_price) ? p.unit_price : null, variant = null, reasons = [], score = 50 - p._i;
    if (cre) { const v = avail.find(v => cre.test(v.title || "")); if (v) { variant = v; price = v.price; reasons.push("color"); score += 15; } else if (cre.test(p.name)) { reasons.push("color"); score += 10; } else { drop.color++; continue; } }
    if (price == null) continue;
    if (per != null && price > per) { drop.budget++; continue; }
    if (refine === "cheaper" && lastMin != null && price >= lastMin) continue;
    if (refine === "pricier" && lastMax != null && price <= lastMax) continue;
    const h = hay(p);
    const hits = (n.terms || []).filter(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(h)).length;
    if ((n.terms || []).length) { score += hits * 12; if (hits) reasons.unshift("term"); }
    if (who && who[2].test(h)) { score += 25; reasons.unshift(who[0]); }
    if (per != null) reasons.push("budget");
    if (refine === "cheaper") score = 1000 - price;
    scored.push({ p, price, variant, reasons, score });
  }
  // product words given and at least 2 products match them → only those (no unrelated filler)
  if ((n.terms || []).length && scored.filter(x => x.reasons.includes("term")).length >= 2) for (let i = scored.length - 1; i >= 0; i--) if (!scored[i].reasons.includes("term")) scored.splice(i, 1);
  if (n.who && n.who !== "gift" && !refine && scored.filter(x => x.reasons.includes(n.who)).length >= 2) for (let i = scored.length - 1; i >= 0; i--) if (!scored[i].reasons.includes(n.who)) scored.splice(i, 1);
  scored.sort((a, b) => b.score - a.score);
  let picks = scored.slice(0, 3);
  if (!picks.length) {
    s.reco = { ...(s.reco || {}), needs: n, at: conv.messages.length, asked: false };
    if (refine === "cheaper") { ctx.ui.push({ type: "chips", items: [X.chips.more] }); return X.cheaperNone; }
    if (refine === "more") { ctx.ui.push({ type: "chips", items: [X.chips.cheaper] }); return X.noMore; }
    if (drop.budget) {
      const okP = p => (!(p.variants || []).length || p.variants.some(v => v.available && (!cre || cre.test(v.title || "")))) && (!cre || (p.variants || []).some(v => cre.test(v.title || "")) || cre.test(p.name));
      const cheap = [...pool.values()].filter(p => Number.isFinite(p.unit_price) && okP(p)).sort((a, b) => a.unit_price - b.unit_price).slice(0, 3);
      if (cheap.length) { const cname = (COLOR_NAME[lang] || COLOR_NAME.en)[n.color];
        ctx.ui.push({ type: "products", items: cheap.map(p => cardOf(cre ? { variant: (p.variants || []).find(v => v.available && cre.test(v.title || "")) } : null)(p)), kind: "recommendation" });
        s.reco = { needs: n, shown: cheap.map(p => p.id), prices: cheap.map(p => p.unit_price), at: conv.messages.length };
        return X.noneBudget(money(cheap[0].currency, per) + (cname ? X.inC(cname) : "")); } }
    if (drop.color) return X.noneColor((COLOR_NAME[lang] || COLOR_NAME.en)[n.color] || n.color);
    return X.none;
  }
  ctx.ui.push({ type: "products", items: picks.map(x => cardOf(x)(x.p)), kind: "recommendation" });
  s.reco = { needs: n, shown: [...new Set([...(follow && !fresh.terms.length && !fresh.who ? s.reco?.shown || [] : []), ...picks.map(x => x.p.id)])], prices: picks.map(x => x.price), at: conv.messages.length, asked: false };
  // goes well with: same collection, not shown
  const cols = new Set(picks.flatMap(x => x.p.collections || []));
  const pairs = [...pool.values()].filter(p => !picks.some(x => x.p.id === p.id) && (!(p.variants || []).length || p.variants.some(v => v.available)) && (p.collections || []).some(c => cols.has(c))).slice(0, 2).map(p => p.name);
  const cur = picks[0].p.currency, cname = (COLOR_NAME[lang] || COLOR_NAME.en)[n.color];
  const w = (n.who ? X.for(X.who[n.who]) : "") + (cname ? X.inC(cname) : "") + (per != null ? X.under(money(cur, per)) : "");
  const reason = x => { const k = x.reasons.find(r => r !== "budget") || (x.reasons.includes("budget") ? "budget" : null); return k === "color" ? X.r.color(cname) : k ? X.r[k] : ""; };
  const [top, ...rest] = picks;
  const parts = [X.lead(picks.length, w), X.top(top.p.name, money(cur, top.price) + (n.quantity > 1 ? X.total(n.quantity, money(cur, top.price * n.quantity)) : ""), reason(top))];
  if (rest.length) parts.push(X.also(join(rest.map(x => `${x.p.name} (${money(cur, x.price)})`), lang)));
  if (pairs.length) parts.push(X.pairs(join(pairs, lang)));
  let out = parts.join(lang === "zh" ? "" : " ");
  if (out.length < 360) out += (lang === "zh" ? "" : " ") + X.ask;
  ctx.ui.push({ type: "chips", items: [X.chips.cheaper, X.chips.more] });
  return out;
}
// card for the widget: same fields as product search (View / Add to cart use link + variant_id), the colour variant when asked
function cardOf(x) { return p => { const { _i, tags, details, ...c } = p; return x?.variant ? { ...c, unit_price: x.variant.price, variant_id: x.variant.id || c.variant_id } : c; }; }
