// Local product recommendation for the site chat (no API): understands occasion / recipient, budget (per item or total),
// quantity, colour, style and a deadline in EN / DE / FR / IT / ZH, ranks REAL studio-catalog products with REAL server
// quotes (same quote as cart / checkout, page currency), explains each pick in one short reason and suggests matching items.
// Follow-ups refine the last recommendation: "cheaper", "more like this", "in blue", "for 80 guests", "by June 1".
// Pure module: catalog + a quote function are passed in (tools.js), the agent keeps the state in conv.slots.reco.

import { RECO_HINT, parseDeadline, parseCommon } from "../../shared/reco-core.js";
export { RECO_HINT, parseDeadline };

// ---- needs ---------------------------------------------------------------------------------------------------------
// Ordered: the first match wins (specific recipients before broad occasions).
export const POOLS = [
  { id: "bridesmaids", re: /(bridesmaids?|maid of honou?r|brautjungfern?|trauzeugin|demoiselles? d'honneur|damigell[ae]|伴娘)/i, items: ["engraved_jewelry", "tote", "pouch", "photo_frame", "candle", "travel_mug", "blanket", "mug"] },
  { id: "groomsmen", re: /(groomsm[ae]n|best man|trauzeuge[n]?|garçons? d'honneur|témoins?|testimon[ei] dello sposo|伴郎)/i, items: ["keychain", "travel_mug", "luggage_tag", "cap_emb", "enamel_mug", "socks", "thermos"] },
  { id: "hen", re: /(hen (party|do)|bachelorette|bachelor|stag|jga|junggesell|polterabend|enterrement de vie|addio al nubilato|celibato|单身派对)/i, items: ["tee", "tote", "cap_emb", "bucket_hat", "tattoo", "sticker"] },
  { id: "kids", re: /(flower girls?|page ?boys?|kids?|children|blumenkinder|kinder|enfants?|bambin[ie]|花童|小孩|孩子)/i, items: ["tee", "puzzle", "tattoo", "pillow", "sticker"] },
  { id: "parents", re: /(parents|mum|mom|dad|mother|father|eltern|mutter|vater|schwiegerelt|beaux-parents|maman|papa|genitori|mamma|父母|爸妈|妈妈|爸爸)/i, items: ["photo_book", "framed", "photo_frame", "calendar", "mug", "blanket"] },
  { id: "couple", re: /(the couple|newlyweds?|bride and groom|for the bride|for the groom|brautpaar|frischvermählt|aux mariés|les mariés|agli sposi|gli sposi|新人|新郎新娘|送新人)/i, items: ["photo_book", "framed", "canvas", "pillow", "photo_frame", "blanket", "puzzle"] },
  { id: "thankyou", re: /(thank[- ]?you|danke(s?karten)?|remerciement|ringraziament|grazie card|感谢卡|谢卡)/i, items: ["greeting", "postcard", "sticker", "hang_tag"] },
  { id: "favours", re: /(favou?rs?|guests?|gäste|gastgeschenk|mitgebsel|invités|cadeaux? (d'|pour les )invités|ospiti|bomboniere|伴手礼|回礼|宾客|客人|喜糖)/i, items: ["candle", "gift_box", "coaster", "magic_mug", "keychain", "tote", "espresso", "glass_cup", "sticker"] },
  { id: "stationery", re: /(stationery|paper goods|invitations?|einladung(en|skarten)?|papeterie|faire-part|cancelleria|partecipazion[ei]|inviti|纸品|请柬|请帖|喜帖|卡片)/i, items: ["invitation", "save_date", "rsvp_card", "menu_card", "place_card", "table_number"] },
  { id: "decor", re: /(decor|decoration|deko(ration)?|décor|décoration|decorazion[ei]|装饰|布置|signage|schild|panneau|cartell)/i, items: ["welcome_sign", "table_number", "banner", "candle", "photo_frame", "acrylic_wall"] },
  { id: "anniversary", re: /(anniversary|jahrestag|hochzeitstag|anniversaire de mariage|anniversario|周年|纪念日)/i, kit: "gift_anniversary" },
  { id: "baby", re: /(baby|newborn|geburt|naissance|neonat|宝宝|婴儿|满月)/i, kit: "gift_baby" },
  { id: "xmas", re: /(christmas|xmas|weihnacht|noël|natale|圣诞)/i, kit: "season_xmas" },
  { id: "party", re: /(party|birthday|geburtstag|fête|festa|compleanno|派对|生日)/i, kit: "season_party" },
  { id: "corporate", re: /(company|corporate|team event|office|firma|firmen|entreprise|azienda|aziendal|公司|团队|企业)/i, kit: "corp_event" },
  { id: "wedding", re: /(wedding|hochzeit|mariage|matrimonio|nozze|婚礼|结婚|婚)/i, items: ["invitation", "save_date", "candle", "gift_box", "welcome_sign", "menu_card", "place_card", "table_number"] }
];
// Latin words must start at a word boundary ("kid" must not match inside "Geschenkideen").
for (const p of POOLS) p.re = new RegExp(`(?<![a-zà-ÿß])(?:${p.re.source})`, "i");
const POOL_BY_ID = Object.fromEntries(POOLS.map(p => [p.id, p]));
// Wedding-friendly products to widen a refinement ("more like this" / "cheaper") when the first pool runs out.
const WIDEN = { bridesmaids: ["favours", "couple"], groomsmen: ["favours"], favours: ["thankyou", "bridesmaids"], stationery: ["thankyou", "decor"], decor: ["stationery"], couple: ["parents"], parents: ["couple"], wedding: ["favours", "stationery", "decor"], hen: ["favours"], kids: ["favours"], thankyou: ["stationery"] };

// Matching items (real catalog ids) — "goes well with".
export const COMPLEMENTS = {
  invitation: ["save_date", "rsvp_card", "menu_card"], save_date: ["invitation", "rsvp_card"], rsvp_card: ["invitation", "save_date"], menu_card: ["place_card", "table_number"],
  place_card: ["menu_card", "table_number"], table_number: ["place_card", "welcome_sign"], welcome_sign: ["table_number", "banner"], banner: ["welcome_sign", "sticker"],
  candle: ["gift_box", "sticker"], gift_box: ["sticker", "greeting"], coaster: ["gift_box"], magic_mug: ["gift_box"], mug: ["gift_box"], espresso: ["gift_box"], glass_cup: ["gift_box"],
  keychain: ["gift_box"], tote: ["sticker", "pouch"], pouch: ["tote"], engraved_jewelry: ["gift_box", "greeting"], photo_frame: ["gift_box", "greeting"], photo_book: ["framed"],
  framed: ["photo_book"], canvas: ["photo_book"], greeting: ["postcard", "sticker"], postcard: ["greeting"], tee: ["tote", "cap_emb"], travel_mug: ["gift_box"]
};

const COLORS = [
  ["blue", /\b(blue|navy|blau|marine|dunkelblau|bleu|blu)\b|蓝/i, ["#2f3a45"]],
  ["green", /\b(green|sage|olive|grün|salbei|vert|verde)\b|绿/i, ["#b9c7b3"]],
  ["pink", /\b(pink|blush|rose|rosa|rosé|dusty rose)\b|粉/i, ["#e9c9c4"]],
  ["white", /\b(white|weiss|weiß|blanc(he)?|bianc[oa])\b|白/i, ["#ffffff"]],
  ["cream", /\b(cream|ivory|beige|creme|crème|ivoire|avorio|panna)\b|米色|象牙|奶白/i, ["#f4ede1"]],
  ["black", /\b(black|schwarz|noir[e]?|ner[oa])\b|黑/i, ["#28231f"]]
];
const STYLE = [["eco", /\b(rustic|boho|natural|eco|eco-friendly|sustainable|recycled|green wedding|rustikal|nachhaltig|natürlich|champêtre|bohème|durable|rustico|sostenibile|naturale)\b|田园|森系|环保|自然风/i],
  ["elegant", /\b(elegant|classic|minimal|minimalist|luxury|luxurious|chic|timeless|klassisch|schlicht|edel|élégant|élégante|classique|sobre|elegante|classico|raffinato)\b|简约|优雅|高级感|经典/i],
  ["fun", /\b(fun|playful|colou?rful|modern|quirky|lustig|bunt|amusant|coloré|ludique|divertente|colorato)\b|有趣|活泼|可爱|现代/i]];
/** What the customer wants, from one message (classifier result `cls` gives budget / quantity / products). */
export function parseNeeds(text, cls = {}) {
  const t = String(text || ""), pool = POOLS.find(p => p.re.test(t))?.id || null;
  const color = COLORS.find(([, re]) => re.test(t))?.[0] || null, style = STYLE.find(([, re]) => re.test(t))?.[0] || null;
  const c = parseCommon(t, cls);
  return { pool, color, style, quantity: c.quantity, budget: c.budget, budget_total: c.budget_total, budget_cur: c.budget_cur, deadline: c.deadline, refine: c.refine, qtyOnly: c.qtyOnly };
}
/** Is this message a refinement of the last recommendation? */
export function isRecoFollowUp(text, reco) {
  if (!reco?.shown?.length) return false;
  const n = parseNeeds(text);
  return !!(n.refine || n.qtyOnly || ((n.color || n.style || n.budget_total || n.deadline) && String(text).length < 60) || (/^\s*(and |und |et |e )?(under|below|unter|moins de|sotto|max)\s/i.test(text)));
}
export function mergeNeeds(prev = {}, next = {}) {
  const out = { ...prev };
  for (const k of ["pool", "color", "style", "quantity", "budget", "budget_total", "budget_cur", "deadline"]) if (next[k] != null) out[k] = next[k];
  if (next.pool && next.pool !== prev.pool) { out.exclude = []; }
  if (next.budget) out.budget_total = next.budget_total ?? null;
  out.refine = next.refine || null;
  return out;
}
export const needsClarify = n => !n.pool && !n.color && !n.style && !n.budget && !n.budget_total && !n.deadline;
export const perItemBudget = n => n.budget || (n.budget_total && n.quantity ? Math.floor(n.budget_total / n.quantity * 100) / 100 : null);

// ---- ranking -------------------------------------------------------------------------------------------------------
const ECO = p => (p.eco_tags || []).some(t => /eco|fsc|recycled|organic|plastic-free/i.test(t));
const ELEGANT = new Set(["invitation", "save_date", "menu_card", "place_card", "gift_box", "candle", "photo_frame", "engraved_jewelry", "framed", "photo_book", "welcome_sign"]);
const FUN = new Set(["magic_mug", "tote", "sticker", "tattoo", "tee", "cap_emb", "bucket_hat", "socks", "puzzle", "keychain"]);
function poolIds(n, catalog, widen = false) {
  const pool = POOL_BY_ID[n.pool || "wedding"] || POOL_BY_ID.wedding;
  const items = p => p.items || (catalog.scenarios || []).flatMap(s => s.kits || []).find(k => k.id === p.kit)?.items || [];
  const out = items(pool).map(id => ({ id, pool: pool.id }));
  if (widen) for (const w of WIDEN[pool.id] || ["favours", "stationery"]) for (const id of items(POOL_BY_ID[w])) if (!out.some(x => x.id === id)) out.push({ id, pool: w });
  return out;
}
/**
 * Rank real products. quote(id, qty) → { unit_price, currency, std_to, exp_to } | null (server quote, page market).
 * Returns { picks: [{ p, q, reasons: [...] }], tooLate: n, dropped: {budget, color, deadline} }.
 */
export async function rankProducts(n, { catalog, quote, limit = 3 }) {
  const byId = id => (catalog.products || []).find(p => p.id === id);
  const qty = Math.max(1, Number(n.quantity) || 1), maxP = perItemBudget(n), exclude = new Set(n.exclude || []);
  const cheaperThan = n.refine === "cheaper" && n.last_prices?.length ? Math.min(...n.last_prices) : null;
  const pricierThan = n.refine === "pricier" && n.last_prices?.length ? Math.max(...n.last_prices) : null;
  const fam = COLORS.find(([k]) => k === n.color)?.[2] || null;
  const dropped = { budget: 0, color: 0, deadline: 0 };
  const run = async widen => {
    const res = [];
    const order = poolIds(n, catalog, widen).map((x, i) => ({ ...x, i })).filter(x => !exclude.has(x.id) && byId(x.id));
    for (const { id, i, pool } of order) {
      const p = byId(id), q = await quote(id, qty).catch(() => null);
      if (!q || q.unit_price == null) continue;
      const reasons = [];
      if (maxP != null && q.unit_price > maxP) { dropped.budget++; continue; }
      if (cheaperThan != null && q.unit_price >= cheaperThan) continue;
      if (pricierThan != null && q.unit_price <= pricierThan) continue;
      if (fam) { if ((p.colors || []).length) { if (!p.colors.some(c => fam.includes(String(c).toLowerCase()))) { dropped.color++; continue; } reasons.push("color_variant"); } else reasons.push("color_print"); }
      let late = null;
      if (n.deadline) { if (q.std_to && q.std_to <= n.deadline) reasons.push("deadline_std"); else if (q.exp_to && q.exp_to <= n.deadline) { reasons.push("deadline_exp"); late = "express"; } else { dropped.deadline++; continue; } }
      let score = 100 - i * 4 - (pool === (n.pool || "wedding") ? 0 : 20);
      if (n.style === "eco" && ECO(p)) { score += 15; reasons.push("eco"); }
      if (n.style === "elegant" && ELEGANT.has(id)) score += 12;
      if (n.style === "fun" && FUN.has(id)) score += 12;
      if (["favours", "thankyou", "kids", "hen"].includes(n.pool) || (n.quantity || 0) >= 20) score -= q.unit_price * 0.6; // many pieces → price matters more
      if (n.refine === "cheaper") score = 1000 - q.unit_price;
      res.push({ p, q, reasons, score, late, pool });
    }
    return res;
  };
  let out = await run(!!n.refine);
  if (out.length < 2 && !n.refine) { const w = await run(true); for (const x of w) if (!out.some(o => o.p.id === x.p.id)) out.push(x); }
  out.sort((a, b) => b.score - a.score);
  return { picks: out.slice(0, Math.max(2, Math.min(4, limit))), more: Math.max(0, out.length - limit), dropped };
}
export function complementsFor(picks, catalog, n = 2) {
  const shown = new Set(picks.map(x => x.p.id)), ids = [];
  for (const x of picks) for (const c of COMPLEMENTS[x.p.id] || []) if (!shown.has(c) && !ids.includes(c) && (catalog.products || []).some(p => p.id === c)) ids.push(c);
  return ids.slice(0, n);
}

// ---- wording -------------------------------------------------------------------------------------------------------
export const NAME_FR_IT = {
  invitation: ["Faire-part en papier coton", "Partecipazione in carta di cotone"], save_date: ["Carte save the date", "Cartolina save the date"], rsvp_card: ["Carte RSVP", "Cartolina RSVP"],
  menu_card: ["Carte de menu", "Menù"], place_card: ["Marque-place", "Segnaposto"], table_number: ["Numéro de table", "Numero del tavolo"], welcome_sign: ["Panneau de bienvenue", "Cartello di benvenuto"],
  gift_box: ["Coffret cadeau", "Scatola regalo"], candle: ["Bougie personnalisée", "Candela personalizzata"], coaster: ["Sous-verre", "Sottobicchiere"], magic_mug: ["Tasse magique", "Tazza magica"],
  mug: ["Tasse en céramique", "Tazza in ceramica"], espresso: ["Tasse à espresso", "Tazzina da espresso"], glass_cup: ["Verre imprimé", "Bicchiere stampato"], tote: ["Tote bag", "Borsa tote"],
  sticker: ["Autocollants", "Adesivi"], keychain: ["Porte-clés", "Portachiavi"], photo_frame: ["Cadre photo", "Cornice portafoto"], engraved_jewelry: ["Bijou gravé", "Gioiello inciso"],
  pouch: ["Pochette", "Pochette"], photo_book: ["Livre photo", "Fotolibro"], framed: ["Affiche encadrée", "Poster incorniciato"], canvas: ["Toile imprimée", "Tela stampata"], pillow: ["Coussin", "Cuscino"],
  blanket: ["Plaid", "Coperta"], banner: ["Bannière", "Striscione"], greeting: ["Carte de vœux", "Biglietto d'auguri"], postcard: ["Carte postale", "Cartolina"], tee: ["T-shirt en coton bio", "T-shirt in cotone bio"],
  tattoo: ["Tatouage éphémère", "Tatuaggio temporaneo"], cap_emb: ["Casquette brodée", "Cappellino ricamato"], travel_mug: ["Mug de voyage", "Tazza da viaggio"], luggage_tag: ["Étiquette de bagage", "Etichetta per bagagli"],
  socks: ["Chaussettes", "Calzini"], puzzle: ["Puzzle photo", "Puzzle fotografico"], calendar: ["Calendrier", "Calendario"], enamel_mug: ["Mug émaillé", "Tazza smaltata"], bucket_hat: ["Bob", "Cappello da pescatore"],
  thermos: ["Thermos", "Thermos"], hang_tag: ["Étiquette cadeau", "Cartellino regalo"], acrylic_wall: ["Tableau acrylique", "Quadro in acrilico"]
};
export const nameFor = (p, lang) => (lang === "fr" || lang === "it") && NAME_FR_IT[p?.id] ? NAME_FR_IT[p.id][lang === "fr" ? 0 : 1] : (p?.name?.[lang] || p?.name?.en || p?.id);

const R = {
  en: { bridesmaids: "a personal thank-you for your bridesmaids", groomsmen: "a useful keepsake for your groomsmen", hen: "fun to wear together on the day", kids: "made for little guests", parents: "a lasting memory for your parents", couple: "a keepsake of the big day", thankyou: "say thank you in your own design", favours: "a favour guests actually take home", stationery: "matches the rest of your stationery", decor: "sets the scene at the venue", wedding: "a wedding classic", anniversary: "a personal anniversary gift", baby: "sweet for a new arrival", xmas: "festive and personal", party: "great for the party", corporate: "carries your logo",
    color_variant: c => `available in ${c}`, color_print: c => `printed in ${c} or any colour`, deadline_std: d => `arrives by ${d} with standard shipping`, deadline_exp: d => `arrives by ${d} with express`, eco: "eco material", each: "each", at: n => ` at ${n} pcs` },
  de: { bridesmaids: "ein persönliches Dankeschön für Ihre Brautjungfern", groomsmen: "ein nützliches Andenken für die Trauzeugen", hen: "macht am JGA gemeinsam Spass", kids: "für die kleinen Gäste", parents: "eine bleibende Erinnerung für die Eltern", couple: "ein Andenken an den grossen Tag", thankyou: "Danke sagen im eigenen Design", favours: "ein Gastgeschenk, das man gern mitnimmt", stationery: "passt zur restlichen Papeterie", decor: "setzt die Location in Szene", wedding: "ein Hochzeitsklassiker", anniversary: "ein persönliches Jubiläumsgeschenk", baby: "süss zur Geburt", xmas: "festlich und persönlich", party: "ideal für die Party", corporate: "trägt Ihr Logo",
    color_variant: c => `in ${c} erhältlich`, color_print: c => `in ${c} oder jeder Farbe bedruckbar`, deadline_std: d => `mit Standardversand bis ${d} da`, deadline_exp: d => `mit Express bis ${d} da`, eco: "nachhaltiges Material", each: "pro Stück", at: n => ` bei ${n} Stück` },
  fr: { bridesmaids: "un merci personnel pour vos demoiselles d'honneur", groomsmen: "un souvenir utile pour vos témoins", hen: "amusant à porter ensemble", kids: "pensé pour les petits invités", parents: "un souvenir durable pour vos parents", couple: "un souvenir du grand jour", thankyou: "dire merci avec votre design", favours: "un cadeau que les invités emportent vraiment", stationery: "assorti au reste de votre papeterie", decor: "met en valeur le lieu", wedding: "un classique du mariage", anniversary: "un cadeau d'anniversaire personnel", baby: "doux pour une naissance", xmas: "festif et personnel", party: "parfait pour la fête", corporate: "porte votre logo",
    color_variant: c => `disponible en ${c}`, color_print: c => `imprimé en ${c} ou toute couleur`, deadline_std: d => `livré d'ici le ${d} en standard`, deadline_exp: d => `livré d'ici le ${d} en express`, eco: "matière écologique", each: "pièce", at: n => ` pour ${n} pièces` },
  it: { bridesmaids: "un grazie personale per le damigelle", groomsmen: "un ricordo utile per i testimoni", hen: "divertente da indossare insieme", kids: "pensato per i piccoli ospiti", parents: "un ricordo duraturo per i genitori", couple: "un ricordo del grande giorno", thankyou: "dire grazie con il vostro design", favours: "una bomboniera che gli ospiti portano davvero a casa", stationery: "in coordinato con il resto della cancelleria", decor: "valorizza la location", wedding: "un classico del matrimonio", anniversary: "un regalo d'anniversario personale", baby: "dolce per una nascita", xmas: "festivo e personale", party: "perfetto per la festa", corporate: "con il vostro logo",
    color_variant: c => `disponibile in ${c}`, color_print: c => `stampato in ${c} o in qualsiasi colore`, deadline_std: d => `arriva entro il ${d} con spedizione standard`, deadline_exp: d => `arriva entro il ${d} con l'espresso`, eco: "materiale sostenibile", each: "cad.", at: n => ` per ${n} pezzi` },
  zh: { bridesmaids: "送伴娘的贴心谢礼", groomsmen: "送伴郎的实用纪念", hen: "单身派对一起穿很有气氛", kids: "适合小朋友", parents: "送父母的长久纪念", couple: "纪念大日子的礼物", thankyou: "用自己的设计表达感谢", favours: "宾客真的会带走的伴手礼", stationery: "和其他婚礼纸品成套", decor: "布置现场很出效果", wedding: "婚礼经典款", anniversary: "有心意的纪念日礼物", baby: "迎接新生命的贴心礼物", xmas: "有节日气氛又有个人特色", party: "派对很合适", corporate: "可印公司 logo",
    color_variant: c => `有${c}可选`, color_print: c => `可印${c}或任意颜色`, deadline_std: d => `标准快递 ${d} 前可到`, deadline_exp: d => `加急 ${d} 前可到`, eco: "环保材质", each: "每件", at: n => `（${n} 件）` }
};
const COLOR_NAME = { en: { blue: "navy blue", green: "sage green", pink: "blush pink", white: "white", cream: "cream", black: "black" }, de: { blue: "Marineblau", green: "Salbeigrün", pink: "Rosé", white: "Weiss", cream: "Creme", black: "Schwarz" },
  fr: { blue: "bleu marine", green: "vert sauge", pink: "rose poudré", white: "blanc", cream: "crème", black: "noir" }, it: { blue: "blu navy", green: "verde salvia", pink: "rosa cipria", white: "bianco", cream: "panna", black: "nero" }, zh: { blue: "藏青色", green: "灰绿色", pink: "淡粉色", white: "白色", cream: "米白色", black: "黑色" } };
const WHO = {
  en: { bridesmaids: "your bridesmaids", groomsmen: "your groomsmen", hen: "the hen / stag party", kids: "the little guests", parents: "your parents", couple: "the couple", thankyou: "thank-you notes", favours: "guest favours", stationery: "your wedding stationery", decor: "the decor", wedding: "your wedding", anniversary: "an anniversary", baby: "a new baby", xmas: "Christmas", party: "the party", corporate: "your company event" },
  de: { bridesmaids: "Ihre Brautjungfern", groomsmen: "Ihre Trauzeugen", hen: "den JGA", kids: "die kleinen Gäste", parents: "Ihre Eltern", couple: "das Brautpaar", thankyou: "Dankeskarten", favours: "Gastgeschenke", stationery: "Ihre Hochzeitspapeterie", decor: "die Deko", wedding: "Ihre Hochzeit", anniversary: "einen Jahrestag", baby: "die Geburt", xmas: "Weihnachten", party: "die Party", corporate: "Ihren Firmenanlass" },
  fr: { bridesmaids: "vos demoiselles d'honneur", groomsmen: "vos témoins", hen: "l'EVJF / EVG", kids: "les petits invités", parents: "vos parents", couple: "les mariés", thankyou: "les remerciements", favours: "les cadeaux d'invités", stationery: "votre papeterie de mariage", decor: "la décoration", wedding: "votre mariage", anniversary: "un anniversaire", baby: "une naissance", xmas: "Noël", party: "la fête", corporate: "votre événement d'entreprise" },
  it: { bridesmaids: "le damigelle", groomsmen: "i testimoni", hen: "l'addio al nubilato / celibato", kids: "i piccoli ospiti", parents: "i genitori", couple: "gli sposi", thankyou: "i ringraziamenti", favours: "le bomboniere", stationery: "la cancelleria del matrimonio", decor: "le decorazioni", wedding: "il matrimonio", anniversary: "un anniversario", baby: "una nascita", xmas: "Natale", party: "la festa", corporate: "l'evento aziendale" },
  zh: { bridesmaids: "伴娘", groomsmen: "伴郎", hen: "单身派对", kids: "小朋友", parents: "父母", couple: "新人", thankyou: "感谢卡", favours: "宾客伴手礼", stationery: "婚礼纸品", decor: "婚礼布置", wedding: "婚礼", anniversary: "纪念日", baby: "宝宝", xmas: "圣诞", party: "派对", corporate: "公司活动" } };
const T = {
  en: { lead: (n, who, extra) => `Here ${n === 1 ? "is 1 idea" : `are ${n} ideas`} for ${who}${extra}:`, budget: b => `under ${b} each`, total: (b, q) => ` (${b} total for ${q})`, color: c => `in ${c}`, by: d => `by ${d}`,
    pairs: xs => `Goes well with: ${xs}.`, none: "I couldn't find a product that fits all of that.", noneBudget: b => `Nothing in our catalog is under ${b} each for this — the closest options are below.`, noneDeadline: d => `None of these can arrive by ${d}, even with express. Our team can check rush options for you.`,
    onlyExpress: "Some of these only make it with express shipping.", clarify: "Happy to help! Who is it for — your guests, the bridal party, or stationery and decor? A budget per piece helps too.", more: "Want cheaper options, more like these, or prices for your exact quantity?",
    noMore: "That's everything that fits — want to try a different budget or colour?", cheaperNone: "These are already the most affordable options for this.",
    chips: { cheaper: "Cheaper options", more: "More like this", pricier: "Something more special", qty: n => `For ${n} guests`, clar: ["Guest favours", "Bridesmaid gifts", "Wedding stationery", "Decor"] } },
  de: { lead: (n, who, extra) => `Hier ${n === 1 ? "ist 1 Idee" : `sind ${n} Ideen`} für ${who}${extra}:`, budget: b => `unter ${b} pro Stück`, total: (b, q) => ` (${b} gesamt für ${q})`, color: c => `in ${c}`, by: d => `bis ${d}`,
    pairs: xs => `Passt gut dazu: ${xs}.`, none: "Dazu habe ich leider kein passendes Produkt gefunden.", noneBudget: b => `Unter ${b} pro Stück gibt es dafür nichts – hier die nächstgünstigen Optionen.`, noneDeadline: d => `Bis ${d} schafft es keines davon, auch nicht mit Express. Unser Team kann Eiloptionen prüfen.`,
    onlyExpress: "Einige davon schaffen es nur mit Expressversand.", clarify: "Gerne! Für wen ist es – für die Gäste, die Brautjungfern/Trauzeugen oder Papeterie und Deko? Ein Budget pro Stück hilft auch.", more: "Möchten Sie günstigere Optionen, mehr in diesem Stil oder Preise für Ihre genaue Menge?",
    noMore: "Das ist alles, was passt – sollen wir ein anderes Budget oder eine andere Farbe probieren?", cheaperNone: "Das sind dafür bereits die günstigsten Optionen.",
    chips: { cheaper: "Günstigere Optionen", more: "Mehr davon", pricier: "Etwas Besonderes", qty: n => `Für ${n} Gäste`, clar: ["Gastgeschenke", "Geschenke für Brautjungfern", "Hochzeitspapeterie", "Deko"] } },
  fr: { lead: (n, who, extra) => `Voici ${n === 1 ? "1 idée" : `${n} idées`} pour ${who}${extra} :`, budget: b => `à moins de ${b} pièce`, total: (b, q) => ` (${b} au total pour ${q})`, color: c => `en ${c}`, by: d => `d'ici le ${d}`,
    pairs: xs => `Va bien avec : ${xs}.`, none: "Je n'ai pas trouvé de produit qui réponde à tout cela.", noneBudget: b => `Rien n'est à moins de ${b} pièce pour cela — voici les options les plus proches.`, noneDeadline: d => `Aucun ne peut arriver d'ici le ${d}, même en express. Notre équipe peut vérifier une option urgente.`,
    onlyExpress: "Certains n'arrivent à temps qu'en express.", clarify: "Avec plaisir ! C'est pour qui — vos invités, le cortège, ou la papeterie et la déco ? Un budget par pièce aide aussi.", more: "Vous voulez des options moins chères, d'autres dans ce style ou le prix pour votre quantité exacte ?",
    noMore: "C'est tout ce qui correspond — essayer un autre budget ou une autre couleur ?", cheaperNone: "Ce sont déjà les options les plus abordables.",
    chips: { cheaper: "Moins cher", more: "D'autres idées similaires", pricier: "Plus haut de gamme", qty: n => `Pour ${n} invités`, clar: ["Cadeaux d'invités", "Cadeaux demoiselles d'honneur", "Papeterie de mariage", "Décoration"] } },
  it: { lead: (n, who, extra) => `Ecco ${n === 1 ? "1 idea" : `${n} idee`} per ${who}${extra}:`, budget: b => `sotto ${b} cad.`, total: (b, q) => ` (${b} in totale per ${q})`, color: c => `in ${c}`, by: d => `entro il ${d}`,
    pairs: xs => `Si abbina bene a: ${xs}.`, none: "Non ho trovato un prodotto che soddisfi tutto questo.", noneBudget: b => `Non c'è nulla sotto ${b} cad. per questo: ecco le opzioni più vicine.`, noneDeadline: d => `Nessuno può arrivare entro il ${d}, nemmeno con l'espresso. Il nostro team può verificare opzioni urgenti.`,
    onlyExpress: "Alcuni arrivano in tempo solo con l'espresso.", clarify: "Volentieri! Per chi è — per gli ospiti, per damigelle e testimoni, o cancelleria e decorazioni? Anche un budget a pezzo aiuta.", more: "Vuole opzioni più economiche, altre simili o il prezzo per la sua quantità esatta?",
    noMore: "È tutto ciò che corrisponde — proviamo un altro budget o colore?", cheaperNone: "Queste sono già le opzioni più convenienti.",
    chips: { cheaper: "Più economico", more: "Altre simili", pricier: "Qualcosa di più speciale", qty: n => `Per ${n} ospiti`, clar: ["Bomboniere", "Regali per damigelle", "Cancelleria nuziale", "Decorazioni"] } },
  zh: { lead: (n, who, extra) => `为${who}推荐 ${n} 款${extra}：`, budget: b => `每件 ${b} 以内`, total: (b, q) => `，共 ${q} 件、总预算 ${b}`, color: c => c, by: d => `${d} 前送达`,
    pairs: xs => `可以搭配：${xs}。`, none: "没有找到同时满足这些条件的商品。", noneBudget: b => `每件 ${b} 以内暂时没有合适的，下面是最接近的选择。`, noneDeadline: d => `这些都赶不上 ${d}，加急也来不及。可以让团队帮您查一下加急方案。`,
    onlyExpress: "其中部分需要选加急才赶得上。", clarify: "好的！是送给谁的——宾客、伴娘伴郎，还是婚礼纸品和布置？告诉我每件的预算会更准。", more: "要看更便宜的、同类的更多款，还是按您的数量报价？",
    noMore: "符合条件的就这些了，要不要换个预算或颜色试试？", cheaperNone: "这些已经是最实惠的选择了。",
    chips: { cheaper: "更便宜的", more: "类似的更多款", pricier: "更高档一点的", qty: n => `${n} 位宾客`, clar: ["宾客伴手礼", "伴娘礼物", "婚礼纸品", "婚礼布置"] } }
};
// Budget said in another currency than the page (e.g. "2000 元" on a CHF page) → converted with the shop's storefront rates.
export const CONVERTED = { en: (a, b) => `(${a} ≈ ${b})`, de: (a, b) => `(${a} ≈ ${b})`, fr: (a, b) => `(${a} ≈ ${b})`, it: (a, b) => `(${a} ≈ ${b})`, zh: (a, b) => `（${a} ≈ ${b}）` };
// Prose (cards carry image / price / reason, so the text stays short and conversational — no bullet dump).
export const PROSE = {
  en: { top: (n, p, r) => `My top pick is the ${n} at ${p} — ${r}.`, also: xs => `Also good: ${xs}.`, ask: "Want cheaper options, more like these, or a price for your exact quantity?" },
  de: { top: (n, p, r) => `Mein Favorit: ${n} für ${p} – ${r}.`, also: xs => `Ebenfalls passend: ${xs}.`, ask: "Möchten Sie günstigere Optionen, mehr davon oder einen Preis für Ihre genaue Menge?" },
  fr: { top: (n, p, r) => `Mon premier choix : ${n} à ${p} — ${r}.`, also: xs => `Aussi bien : ${xs}.`, ask: "Vous voulez moins cher, d'autres idées similaires ou un prix pour votre quantité exacte ?" },
  it: { top: (n, p, r) => `La mia prima scelta: ${n} a ${p} — ${r}.`, also: xs => `Vanno bene anche: ${xs}.`, ask: "Vuole opzioni più economiche, altre simili o il prezzo per la sua quantità esatta?" },
  zh: { top: (n, p, r) => `首推${n}，${p}，${r}。`, also: xs => `也可以看看${xs}。`, ask: "要更便宜的、类似的更多款，还是按您的数量报价？" }
};
export const RT = T;
const fmtMoney = (cur, n) => `${cur} ${Number(n || 0).toFixed(2)}`;
const AND = { en: " and ", de: " und ", fr: " et ", it: " e ", zh: "和" };
const join = (xs, lang) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(lang === "zh" ? "、" : ", ") + (AND[lang] || AND.en) + xs[xs.length - 1];

/** One short reason per product (≤ 2 fragments): what it is good for + the constraint it meets. */
export function reasonFor(x, n, lang, fmtDate) {
  const r = R[lang] || R.en, c = (COLOR_NAME[lang] || COLOR_NAME.en)[n.color];
  const base = r[x.pool || n.pool || "wedding"] || r.wedding, parts = [base];
  for (const k of x.reasons) {
    if (k === "color_variant" || k === "color_print") parts.push(r[k](c));
    else if (k === "deadline_std" || k === "deadline_exp") parts.push(r[k](fmtDate(n.deadline, lang)));
    else if (k === "eco" && parts.length < 2) parts.push(r.eco);
  }
  return parts.slice(0, 2).join(lang === "zh" ? "，" : ", ").replace(/^./, s => s.toUpperCase());
}
export function leadLine(n, count, cur, lang, fmtDate) {
  const t = T[lang] || T.en, who = (WHO[lang] || WHO.en)[n.pool || "wedding"], cn = (COLOR_NAME[lang] || COLOR_NAME.en)[n.color];
  const bits = [];
  const per = perItemBudget(n);
  if (cn) bits.push(t.color(cn));
  if (per) bits.push(t.budget(fmtMoney(cur, per)) + (n.budget_total && n.quantity && !n.budget ? t.total(fmtMoney(cur, n.budget_total), n.quantity) : ""));
  if (n.deadline) bits.push(t.by(fmtDate(n.deadline, lang)));
  const extra = lang === "zh" ? (bits.length ? `（${bits.join("，")}）` : "") : bits.length ? ", " + bits.join(", ") : "";
  return t.lead(count, who, extra);
}
export { join as joinNames, fmtMoney };
