// Pod.AI copy of the Wed.AI POD Agent engine (server/pod-agent/customer). Pod.AI-only: edit here, never the site agent.
// Rule-based language detection, intent classification and entity extraction for the customer chat.
// Used (a) as the full classifier when no LLM key is configured and (b) as a deterministic safety layer
// next to the LLM classifier (the POD Agent's router.js asks the model for the same JSON shape).
// Pod.AI: no Wed.AI catalog — products come from the shop (Admin API search).
const studioCatalog = () => ({ products: [] });

const CJK = /[\u3400-\u9fff]/;
const WORDS = {
  de: /\b(ich|wir|sie|und|der|die|das|wie|viel|kostet|kosten|versand|nach|schweiz|bestellung|meine|meiner|lieferung|empfehlen|einladungen|stück|bitte|danke|hallo|grüezi|gibt|kann|könnt|möchte|für|mit|wo|ist)\b/gi,
  fr: /\b(je|nous|vous|est|combien|livraison|pour|commande|frais|suisse|bonjour|merci|mon|ma|mes|quels?|quelle|où|avec|cartes?|invitations?)\b/gi,
  it: /\b(io|voi|quanto|costa|spedizione|per|ordine|svizzera|ciao|grazie|mio|mia|dove|quali|con|inviti)\b/gi,
  en: /\b(i|we|you|the|and|how|much|cost|shipping|to|order|my|where|is|what|recommend|please|hello|hi|thanks|for|with|can|do|does|invitations?)\b/gi
};
/** ISO 639-1 language of the message; `hint` (UI language) wins for very short / ambiguous messages. */
export function detectLanguage(text, hint = "en") {
  const t = String(text || "");
  if (CJK.test(t)) return "zh";
  const score = Object.fromEntries(Object.entries(WORDS).map(([l, re]) => [l, (t.match(re) || []).length]));
  if (/[äöüß]/i.test(t)) score.de += 2;
  if (/[éèêàç]/i.test(t)) score.fr += 1;
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) return ["en", "de", "fr", "it", "zh"].includes(hint) ? hint : "en";
  if (best[0] !== "en" && best[1] === score.en) return ["de", "fr", "it"].includes(hint) ? hint : "en";
  return best[0];
}

// ---- Countries (names in EN / DE / FR / IT / ZH → ISO-2) ----
const COUNTRY_NAMES = {
  CH: ["switzerland", "swiss", "schweiz", "suisse", "svizzera", "瑞士", "zurich", "zürich", "geneva", "genf", "basel", "bern", "lausanne"],
  LI: ["liechtenstein", "列支敦士登"], DE: ["germany", "deutschland", "allemagne", "germania", "德国", "berlin", "munich", "münchen", "hamburg"],
  AT: ["austria", "österreich", "oesterreich", "autriche", "奥地利", "vienna", "wien"], FR: ["france", "frankreich", "francia", "法国", "paris"],
  IT: ["italy", "italien", "italie", "italia", "意大利", "milan", "mailand", "rome", "rom"], ES: ["spain", "spanien", "espagne", "spagna", "españa", "西班牙"],
  NL: ["netherlands", "holland", "niederlande", "pays-bas", "paesi bassi", "荷兰"], BE: ["belgium", "belgien", "belgique", "belgio", "比利时"],
  LU: ["luxembourg", "luxemburg", "卢森堡"], PT: ["portugal", "葡萄牙"], IE: ["ireland", "irland", "irlande", "爱尔兰"], DK: ["denmark", "dänemark", "丹麦"],
  SE: ["sweden", "schweden", "suède", "瑞典"], FI: ["finland", "finnland", "芬兰"], PL: ["poland", "polen", "pologne", "波兰"], CZ: ["czech", "tschechien", "捷克"],
  GR: ["greece", "griechenland", "grèce", "希腊"], HU: ["hungary", "ungarn", "匈牙利"], GB: ["united kingdom", "uk", "england", "britain", "great britain", "großbritannien", "英国", "london"],
  US: ["united states", "usa", "america", "美国", "new york"], CA: ["canada", "kanada", "加拿大"], CN: ["china", "中国"], HK: ["hong kong", "香港"], AU: ["australia", "澳大利亚"], JP: ["japan", "日本"]
};
const ISO = new Set([...Object.keys(COUNTRY_NAMES), "SK", "SI", "HR", "RO", "BG", "EE", "LV", "LT", "CY", "MT", "NO", "IS"]);
export function extractCountry(text) {
  const t = String(text || ""), low = t.toLowerCase();
  let best = null;
  for (const [cc, names] of Object.entries(COUNTRY_NAMES)) for (const n of names) {
    const hit = CJK.test(n) ? low.includes(n) : new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u").test(low);
    if (hit && (!best || n.length > best.len)) best = { cc, len: n.length };
  }
  if (best) return best.cc;
  // Upper-case ISO codes after "to / nach / en / in / a / 到 / 寄" (e.g. "shipping to CH").
  const m = t.match(/(?:\b(?:to|nach|in|en|a|vers|per)\s+|到|寄|发往|送到)\s*([A-Z]{2})\b/);
  return m && ISO.has(m[1]) ? m[1] : null;
}

// ---- Products ----
const SYN = {
  invitation: ["invitation", "invitations", "invite", "invites", "wedding invitation", "einladung", "einladungen", "einladungskarte", "einladungskarten", "faire-part", "faire-parts", "invito", "inviti", "请柬", "喜帖", "邀请卡", "邀请函", "请帖"],
  save_date: ["save the date", "save-the-date", "save the dates"], rsvp_card: ["rsvp", "rsvp card", "回执卡"],
  menu_card: ["menu", "menus", "menu card", "menu cards", "menükarte", "menükarten", "menukarte", "菜单", "菜单卡"],
  place_card: ["place card", "place cards", "name card", "name cards", "escort card", "platzkarte", "platzkarten", "tischkarte", "tischkarten", "marque-place", "座位卡", "席位卡", "桌卡", "名卡"],
  table_number: ["table number", "table numbers", "tischnummer", "tischnummern", "桌号", "桌牌"],
  welcome_sign: ["welcome sign", "welcome board", "willkommensschild", "迎宾牌", "欢迎牌", "迎宾板"],
  gift_box: ["gift box", "gift boxes", "geschenkbox", "礼盒", "喜糖盒"], candle: ["candle", "candles", "kerze", "kerzen", "蜡烛", "香薰蜡烛"],
  mug: ["mug", "mugs", "tasse", "tassen", "马克杯", "杯子"], magic_mug: ["magic mug", "变色杯"], tee: ["t-shirt", "t-shirts", "tshirt", "tee", "tees", "t恤"],
  hoodie: ["hoodie", "hoodies", "卫衣"], tote: ["tote", "tote bag", "tote bags", "stofftasche", "帆布袋", "托特包"], poster: ["poster", "posters", "海报"],
  sticker: ["sticker", "stickers", "aufkleber", "贴纸"], greeting: ["greeting card", "greeting cards", "grusskarte", "贺卡"], postcard: ["postcard", "postcards", "postkarte", "明信片"],
  photo_frame: ["photo frame", "picture frame", "bilderrahmen", "相框"], photo_book: ["photo book", "photobook", "fotobuch", "相册", "照片书"],
  engraved_jewelry: ["jewelry", "jewellery", "necklace", "schmuck", "首饰", "项链"], canvas: ["canvas", "leinwand", "帆布画"], notebook: ["notebook", "notizbuch", "笔记本"],
  calendar: ["calendar", "kalender", "日历"], coaster: ["coaster", "coasters", "untersetzer", "杯垫"], blanket: ["blanket", "decke", "毯子"], pillow: ["pillow", "cushion", "kissen", "抱枕"],
  phone_case: ["phone case", "handyhülle", "手机壳"], keychain: ["keychain", "schlüsselanhänger", "钥匙扣"], banner: ["banner", "横幅"], apron: ["apron", "schürze", "围裙"]
};
let ALIASES = null;
function aliases() {
  if (ALIASES) return ALIASES;
  const out = [];
  for (const p of studioCatalog().products || []) {
    const names = new Set([p.id.replace(/_/g, " "), ...Object.values(p.name || {}).map(n => String(n).toLowerCase()), ...(SYN[p.id] || [])]);
    for (const n of names) if (n && n.length >= 2) out.push({ id: p.id, alias: n.toLowerCase() });
  }
  return (ALIASES = out.sort((a, b) => b.alias.length - a.alias.length));
}
/** Catalog product ids mentioned in the text, longest alias first, without overlaps. */
export function extractProducts(text) {
  let low = " " + String(text || "").toLowerCase() + " ";
  const found = [];
  for (const { id, alias } of aliases()) {
    const re = CJK.test(alias) ? alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : `(?<![\\p{L}])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`;
    const rx = new RegExp(re, "u");
    if (rx.test(low)) { if (!found.includes(id)) found.push(id); low = low.replace(rx, " ␣ "); }
  }
  return found;
}

// ---- Numbers ----
const ZH_NUM = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function zhToInt(s) {
  if (/^\d+$/.test(s)) return Number(s);
  let total = 0, cur = 0;
  for (const ch of s) {
    if (ch in ZH_NUM) cur = ZH_NUM[ch];
    else if (ch === "十") { total += (cur || 1) * 10; cur = 0; }
    else if (ch === "百") { total += (cur || 1) * 100; cur = 0; }
    else if (ch === "千") { total += (cur || 1) * 1000; cur = 0; }
  }
  return total + cur || null;
}
export function extractQuantity(text) {
  const t = String(text || "");
  const zh = t.match(/([0-9]+|[一二两三四五六七八九十百千]+)\s*(份|张|个|件|套|盒|本|只|位)/);
  if (zh) return zhToInt(zh[1]);
  const m = t.match(/(?<![\w.,-])(\d{1,5})\s*(x\b|×|pcs?\b|pieces?\b|stück\b|stk\b|exemplaires?\b|pezzi\b|units?\b|copies\b)?\s*(?=[\p{L}])/iu);
  if (m) { const n = Number(m[1]); if (n >= 1 && n <= 10000 && !/^(19|20)\d\d$/.test(m[1])) return n; }
  const qty = t.match(/\b(?:quantity|qty|menge|anzahl|quantité|quantità)\s*[:=]?\s*(\d{1,5})\b/i);
  if (qty) return Number(qty[1]);
  // Number words before a noun: "ten invitations", "zehn Einladungen", "fifty menu cards"
  const w = t.toLowerCase().match(new RegExp(`\\b(${Object.keys(NUM_WORDS).join("|")})\\s+(?=[\\p{L}])`, "u"));
  return w && !/^(one|a|ein|eine|un|une|uno|una)$/.test(w[1]) ? NUM_WORDS[w[1]] : null;
}
const NUM_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  zwei: 2, drei: 3, vier: 4, "fünf": 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwanzig: 20, "dreißig": 30, "fünfzig": 50, hundert: 100 };
export function extractBudget(text) {
  const t = String(text || "");
  const m = t.match(/(?:under|below|less than|max(?:imum)?|budget(?: of)?|bis|unter|maximal|moins de|sotto|预算|以内|以下|不超过)\s*(?:chf|eur|€|fr\.?|usd|\$)?\s*(\d{1,5}(?:[.,]\d{1,2})?)/i)
    || t.match(/(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:chf|eur|€|fr\.?|元|块)?\s*(?:以内|以下|左右)/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

// ---- Identifiers ----
export const extractEmail = text => (String(text || "").match(/[^\s@<>()"',;:]{1,64}@[^\s@<>()"',;:]{1,255}\.[A-Za-z]{2,}/) || [null])[0]?.toLowerCase() || null;
export function extractOrderNumber(text) {
  const t = String(text || "");
  const pod = t.match(/\bPOD-\d{4}-[A-Z0-9]{3,12}\b/i);
  if (pod) return pod[0].toUpperCase();
  const m = t.match(/(?:order|bestellung|bestellnummer|commande|ordine|订单号?)\s*(?:no\.?|number|nr\.?|#|:|是)?\s*#?\s*([A-Z0-9][A-Z0-9-]{3,30})/i);
  if (m && /\d/.test(m[1])) return m[1].toUpperCase();
  const hash = t.match(/#([A-Z0-9-]{4,30})\b/i);
  return hash && /\d/.test(hash[1]) ? hash[1].toUpperCase() : null;
}
export function extractTracking(text) {
  const t = String(text || "");
  const upu = t.match(/\b[A-Z]{2}\d{9}[A-Z]{2}\b/); if (upu) return upu[0];
  const carrier = t.match(/\b(?:YT|4PX|UUS|LP|1Z|JD|SF|TRK-)[A-Z0-9-]{6,30}\b/i); if (carrier) return carrier[0].toUpperCase();
  const ctx = t.match(/(?:tracking|track|sendung(?:snummer)?|suivi|tracciamento|运单号?|物流单号?|快递单号?|追踪号?|跟踪号?)\s*(?:no\.?|number|nr\.?|#|:|是|为)?\s*([A-Z0-9][A-Z0-9.\-]{7,34})/i);
  return ctx && /\d/.test(ctx[1]) && !/^POD-/i.test(ctx[1]) ? ctx[1].toUpperCase() : null;
}

// ---- Intents ----
const RX = {
  greeting: /^\s*(hi|hello|hey|hallo|grüezi|gruezi|servus|bonjour|salut|ciao|buongiorno|你好|您好|嗨|哈喽|good (morning|afternoon|evening))\b[\s!.,?]*$/i,
  shipping: /(shipping|ship|postage|delivery (cost|fee|price)|send .* to|versand|porto|lieferkosten|livraison|frais de port|spedizione|运费|邮费|快递费|寄到|寄往|发到|送到|配送费)/i,
  cost: /(cost|costs|price|how much|fee|kosten|kostet|preis|wie viel|wieviel|combien|prix|quanto|costo|多少钱|多少|价格|价钱|费用|报价|几块|贵)/i,
  time: /(how long|when will|arrive|delivery time|lead time|how many days|wie lange|lieferzeit|wann|combien de temps|quanto tempo|多久|几天|多长时间|什么时候|到货|送达|时效)/i,
  order: /(order status|my order|where is my|bestellung|commande|ordine|订单|我的单|查单)/i,
  tracking: /(track|tracking|parcel|package|shipment|sendung|paket|colis|suivi|pacco|物流|快递|运单|包裹|追踪|跟踪)/i,
  recommend: /(recommend|suggest|idea|ideas|what should|which product|best for|gift for|favou?rs?|empfehl|vorschlag|idee|conseill|suggér|consigli|推荐|建议|送什么|买什么|有什么好|伴手礼|回礼|适合)/i,
  discount: /(discount|coupon|promo|voucher|code|sale|cheaper|rabatt|gutschein|aktion|réduction|code promo|sconto|优惠|折扣|打折|优惠码|便宜|满减)/i,
  returns: /(return|exchange|withdraw|defect|damaged|broken|wrong item|retour|rückgabe|umtausch|defekt|beschädigt|retourner|reso|退货|换货|退换|破损|坏了|发错)/i,
  cancel: /(cancel|change my order|modify|stornieren|ändern|annuler|modifier|annullare|取消|修改订单|改订单)/i,
  payment: /(pay|payment|twint|paypal|credit card|zahl|bezahl|paiement|pagamento|付款|支付|怎么付)/i,
  proof: /(proof|mockup|approve|korrektur|abzug|freigabe|épreuve|bozza|效果图|样稿|样图|确认图)/i,
  website: /(website|rsvp|webseite|site web|sito|网站|回执)/i,
  vat: /(vat|tax|mwst|mehrwertsteuer|tva|iva|增值税|含税|税)/i,
  customs: /(customs|duty|duties|zoll|douane|dogana|关税|清关)/i,
  material: /(material|paper|finish|papier|matériau|carta|材质|纸|面料)/i,
  thanks: /^\s*(thanks?|thank you|danke|merci|grazie|谢谢|多谢|thx)\b[\s!.]*$/i
};
/** Classification in the POD Agent router shape (intent, language, emotion…) plus extracted entities. */
export function classifyRules(text, { hint = "en" } = {}) {
  const t = String(text || "");
  const e = {
    country: extractCountry(t), products: extractProducts(t), quantity: extractQuantity(t), budget: extractBudget(t),
    email: extractEmail(t), order_number: extractOrderNumber(t), tracking_number: extractTracking(t)
  };
  if (e.tracking_number && e.order_number && e.tracking_number === e.order_number) { if (/^POD-/.test(e.order_number)) e.tracking_number = null; else e.order_number = null; }
  let intent = "other";
  if (RX.thanks.test(t)) intent = "thanks";
  else if (RX.greeting.test(t)) intent = "greeting";
  else if (e.order_number || (RX.order.test(t) && !RX.shipping.test(t))) intent = "order_status";
  else if (e.tracking_number || (RX.tracking.test(t) && !RX.cost.test(t) && !RX.time.test(t))) intent = "tracking";
  else if (RX.shipping.test(t) && (RX.cost.test(t) || e.country || /^\s*(shipping|versand|运费)/i.test(t)) && !RX.time.test(t)) intent = "shipping_quote";
  else if (RX.returns.test(t)) intent = "return_request";
  else if (RX.cancel.test(t)) intent = "cancel_or_change";
  else if (RX.discount.test(t)) intent = "discount";
  else if (RX.time.test(t)) intent = "delivery_time";
  else if (RX.recommend.test(t)) intent = "recommendation";
  else if (RX.customs.test(t)) intent = "customs";
  else if (RX.vat.test(t)) intent = "vat";
  else if (RX.payment.test(t)) intent = "payment";
  else if (RX.proof.test(t)) intent = "proof";
  else if (RX.website.test(t)) intent = "website";
  else if (e.products.length && (RX.cost.test(t) || e.quantity)) intent = "price";
  else if (e.products.length || RX.material.test(t)) intent = "product_question";
  else if (RX.cost.test(t)) intent = "price";
  else if (e.email) intent = "contact_info";
  return { intent, language: detectLanguage(t, hint), confidence: intent === "other" ? 0.3 : 0.8, ...e };
}
