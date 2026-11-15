// Shared language + product-term layer for BOTH customer chats: the POD.AI site chat (server/pod-agent/customer)
// and the Pod.AI Shopify app chat (server/shopify-agent). One place for language detection (EN / DE / FR / IT / ZH),
// "what do you sell" detection, product synonyms (e.g. "magliette" → tee) and "do you sell X?" questions.
const CJK = /[\u3400-\u9fff]/;
export const LANGS = ["en", "de", "fr", "it", "zh"];
const WORDS = {
  de: /\b(verkauft|verkaufen|habt|ihr|euch|ich|wir|sie|und|der|die|das|wie|viel|kostet|kosten|versand|nach|schweiz|bestellung|meine|meiner|lieferung|empfehlen|einladungen|stück|bitte|danke|hallo|grüezi|gibt|kann|könnt|möchte|für|mit|wo|ist|zeig|zeigen|zeigt|mir|eure|euer|ihre|produkte|artikel|habt|haben|sendung|paket)\b/gi,
  fr: /\b(vendez|avez|acceptez|moyens|paiement|coûte|coûtent|faire-part|délai|je|nous|vous|est|combien|livraison|pour|commande|frais|suisse|bonjour|merci|mon|ma|mes|quels?|quelle|où|avec|cartes?|invitations?|montrez|produits|vos|votre|les|des|retour|colis|boutique|livrée?|suivi)\b/gi,
  it: /\b(avete|vendete|cosa|accettate|pagamento|tempi|magliette|maglietta|io|voi|quanto|costa|spedizione|per|ordine|svizzera|ciao|grazie|mio|mia|dove|quali|con|inviti|mostrami|vostri|vostro|vostra|prodotti|negozio|della|sono|reso|pacco|buongiorno|vorrei|il|gli|consegna)\b/gi,
  en: /\b(i|we|you|the|and|how|much|cost|shipping|to|order|my|where|is|what|recommend|please|hello|hi|thanks|for|with|can|do|does|invitations?|show|me|some|products?|your|any|have|sell|items?|shipping|return|refund)\b/gi
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


// ---- "What do you sell" / browse requests ----
/** Generic "show me products / what do you sell / bestsellers" requests (EN / DE / FR / IT / ZH). */
export const BROWSE_RE = /(che cosa avete|cosa vendete\??$|cosa avete da vendere|qu.est-ce que vous avez|que vendez-vous|vous vendez quoi|was habt ihr|was verkauft ihr|was verkaufen sie|was bietet ihr an|what (kind|sort|type)s? of (products?|items?|things|stuff) (do|can) you|what do you guys (sell|have|make)|卖些什么|有什么东西|what (products?|items?|things) (do|can|does) (you|the shop|the store) (sell|offer|have|carry|stock)|what do you (sell|offer|carry|stock)|what('s| is) in (your|the) (shop|store)|welche (produkte|artikel|sachen|waren) (habt|haben|verkauft|verkaufen|bietet|bieten|gibt)|was (bietet|verkauft|habt|haben|gibt es)\b.{0,12}(ihr|sie|bei euch|bei ihnen|im shop)|quel(le)?s? (produits|articles)|que vendez|qu'?est-ce que vous (vendez|proposez|avez)|vous vendez quoi|(che|quali) (prodotti|articoli)|che cosa vendete|cosa avete|你们卖|卖哪些|有哪些(商品|产品|东西)|都有什么(商品|产品|东西)|有啥(商品|产品|东西)|\b(show|see|list|browse)\b.{0,20}\b(products?|items?|things|collection|catalog(ue)?|range|stuff)\b|what (do|can) (you|i) (sell|buy|offer|have)|what('s| is) (for sale|in stock|available)|\b(your|all) (products|items)\b|best ?sellers?|top sellers?|most popular|popular (products|items)|new arrivals|what'?s new|\bcatalog(ue)?\b|\b(produkte|sortiment|angebot)\b|was (verkauft|habt|haben) (ihr|sie)|zeig(en sie)? (mir )?.{0,10}(produkte|artikel)|meistverkauft|beliebteste|vos produits|montrez(-moi)? (vos |des )?produits|\b(prodotti|catalogo)\b|cosa vendete|mostrami .{0,12}prodotti|qu'est-ce que vous vendez|有什么(商品|产品|卖)|卖什么|看看(商品|产品)|商品列表|所有商品|热卖|畅销|爆款|新品|推荐.{0,4}(商品|产品))/i;

const STOP = new Set("the and you your for can how what are with does from this that ich sie und der die das wie was ist ein eine have has do is my me i a an to of in on it please bitte".split(" "));
export const terms = q => String(q || "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)?.filter(t => !STOP.has(t)) || [];
const NOT_A_WORD = /^(do|have|sell|buy|price|prices|cost|kostet|preis|any|some|product|products|item|items|shop|store|you|recommend|looking|need|want|show|see|list|browse|all|your|me|bestseller|bestsellers|best|sellers|popular|new|arrivals|catalog|catalogue|things|stuff|produkte|zeig|zeigen|mir|artikel|sortiment|habt|haben|hast|ihr|euch|gibt|es|verkauft|verkaufen|welche|auch|avez|vous|vendez|quels|quelles|des|les|une|un|est|ce|que|qui|avete|vendete|quali|che|cosa|dei|delle|degli|il|la|le|lo|gli|any|got|carry|sold|anything|something|like|offer|is|there|are|they)$/;
// Light synonym + singular/plural matching for product search (EN / DE / FR / IT / ZH), e.g. "t-shirts" → tee / t-shirt.
const SYNONYMS = [
  [/\bt[\s-]?shirts?\b|\btees?\b|\bmagliett[ae]\b|\bshirts?\b|t恤|短袖/gi, ["tee", "t-shirt", "tshirt", "shirt"]],
  [/\bhood(ie|y)s?\b|\bsweat ?shirts?\b|\bpullis?\b|\bpullovers?\b|\bfelpe?a?\b|卫衣|帽衫/gi, ["hoodie", "sweatshirt", "pullover"]],
  [/\bmugs?\b|\bcups?\b|\btassen?\b|\bbechers?\b|\btasses?\b|\btazz[ae]\b|杯子|马克杯|水杯/gi, ["mug", "cup"]],
  [/\b(tote ?)?bags?\b|\btaschen?\b|\bbeutel\b|\bsacs?\b|\bborse?a?\b|包包|袋子|帆布袋|手提袋/gi, ["bag", "tote"]],
  [/\bhats?\b|\bcaps?\b|\bmützen?\b|\bkappen?\b|\bcasquettes?\b|\bchapeaux?\b|\bcappell[oi]\b|帽子|棒球帽/gi, ["hat", "cap"]],
  [/\bposters?\b|\bprints?\b|\baffiches?\b|海报/gi, ["poster", "print"]],
  [/\bcards?\b|\bkarten?\b|\bcartes?\b|\bbiglietti?o?\b|卡片|贺卡/gi, ["card"]],
  [/\bcandles?\b|\bkerzen?\b|\bbougies?\b|\bcandel[ae]\b|蜡烛/gi, ["candle"]],
  [/\bphone ?cases?\b|\bhandyh(ü|ue)llen?\b|\bcoques?\b|手机壳/gi, ["case", "phonecase"]],
  [/\bsocks?\b|\bsocken\b|\bchaussettes?\b|\bcalz(e|ini)\b|袜子/gi, ["sock"]]
];
const singular = t => t.length > 4 && /ies$/.test(t) ? t.slice(0, -3) + "y" : t.length > 4 && /(ses|xes|ches|shes)$/.test(t) ? t.slice(0, -2) : t.length > 3 && /[^s]s$/.test(t) ? t.slice(0, -1) : t;
const ZH_FILLER = /(请问|你们|您们|我想|我要|想要|有没有|有吗|有没|卖不卖|卖吗|什么|哪些|一下|可以|吗|呢|吧|的|有|卖|买|看看|找|要|么|啊|？|\?)/g;
export function productTerms(query) {
  let text = String(query || "");
  const extra = [];
  for (const [re, syn] of SYNONYMS) if ((re.lastIndex = 0, re.test(text))) { extra.push(...syn); text = text.replace(re, " "); }
  text = text.replace(/[\u3400-\u9fff]+/g, m => ` ${m.replace(ZH_FILLER, " ")} `); // keep CJK nouns, drop question words
  const base = terms(text).filter(t => !NOT_A_WORD.test(t) && !(/^[a-z]$/.test(t))).slice(0, 4);
  const out = [...extra];
  for (const t of base) { out.push(t); const s = singular(t); if (s !== t) out.push(s); }
  return [...new Set(out)].slice(0, 10);
}

// ---- "Do you sell X?" questions (EN / DE / FR / IT / ZH) → the product word the shopper asked about ----
const SELL_Q = [
  /\b(?:do|does) (?:you|the shop|the store|y'?all) (?:sell|have|carry|offer|stock)\s+(?:any |some |custom |personali[sz]ed )?(.{2,40}?)\s*\??$/i,
  /\b(?:can i (?:buy|order|get)|is it possible to (?:buy|order)|are there)\s+(?:any |some |a |an )?(.{2,40}?)\s*\??$/i,
  /\b(?:habt ihr|haben sie|verkauft ihr|verkaufen sie|gibt es (?:bei euch|bei ihnen)?|bietet ihr|kann ich)\s+(?:auch )?(?:eine?n? |welche |keine )?(.{2,40}?)(?:\s+(?:kaufen|bestellen|an|bei euch))?\s*\??$/i,
  /\b(?:vous (?:vendez|avez|proposez|faites)|vendez-vous|avez-vous|proposez-vous|faites-vous|est-ce que vous (?:vendez|avez|proposez)|je peux (?:acheter|commander)|tu vends|tu as)\s+(?:des |du |de la |de l'|de |les |un |une )?(.{2,40}?)\s*\??$/i,
  /\b(?:avete|vendete|fate|offrite|posso (?:comprare|ordinare)|c'?è|ci sono|hai|vendi)\s+(?:anche )?(?:delle |degli |dei |del |della |le |gli |i |il |la |un |una |uno )?(.{2,40}?)\s*\??$/i,
  /(?:你们|您们|你们店)?(?:有没有|有|卖不卖|卖|能做|可以做|可以定制)\s*(.{1,12}?)(?:吗|么|嘛|不)?[？?]?$/
];
const GENERIC_ASK = /^(?:any|some|more|others?|these|those|everything|in stock|discounts?|products?|items?|things|stuff|anything|something|it|that|this|them|one|produkte|artikel|etwas|produits|articles|quelque chose|prodotti|articoli|qualcosa|商品|产品|东西|什么|啥|哪些|多少|这个|那个)$/i;
/** The product word in a "do you sell / avete / vendez-vous / habt ihr / 有没有 X" question, or null. */
export function askedProduct(text) {
  const t = String(text || "").trim().replace(/[!.。！]+$/, "");
  for (const re of SELL_Q) {
    const m = t.match(re); if (!m) continue;
    const w = m[1].replace(/^(?:a|an|any|some|the)\s+/i, "").replace(/\s+(?:here|there|online|in (?:your|the) (?:shop|store)|too|as well|also|bitte|please|svp|s'il vous plaît|per favore)$/i, "").trim();
    if (w && !GENERIC_ASK.test(w) && !/\d/.test(w)) return w.slice(0, 40);
  }
  return null;
}
