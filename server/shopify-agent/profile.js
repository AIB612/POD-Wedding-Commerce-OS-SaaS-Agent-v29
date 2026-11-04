// Chat profile for one Shopify shop: plugs into the Pod.AI engine (server/shopify-agent/engine, a copy of the site agent).
// ALL shop data comes from that shop's Admin GraphQL API with its own offline token — never from POD.AI site services.
// Same pipeline (guardrails, local-first routing, LLM fallback, handoff queue, KPIs); shop-specific data:
//   knowledge   = the merchant's own FAQ (embedded admin) + the shop's legal policies (shipping / refund / contact …)
//   products    = Admin API product search (read_products)
//   orders      = Admin API order by name + e-mail check (read_orders; protected customer data), per-order lock
//   shipping    = Shopify has no generic rate API for apps outside checkout → shipping policy + "calculated at checkout"
// No POD.AI catalog, prices or FAQ ever leak into a shop tenant.
import crypto from "node:crypto";
import { graphql } from "./core.js";
import { createHandoff } from "./engine/store.js";
import { trackParcel } from "./tracking.js";

/** Merchant FAQ rows (embedded admin → Knowledge) → search shape. */
function normaliseCustom(list = []) {
  return (list || []).filter(x => x && x.question && x.answer && x.active !== false).map(x => ({ id: x.id, custom: true,
    tags: String(x.tags || "").toLowerCase().split(/[,;\s]+/).filter(Boolean), q: { [x.lang || "en"]: x.question, en: x.question }, a: { [x.lang || "en"]: x.answer, en: x.answer } }));
}

const strip = h => String(h || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const POLICY_TAGS = { SHIPPING_POLICY: "shipping delivery versand livraison 运费 配送 发货 customs", REFUND_POLICY: "return returns refund exchange rückgabe retoure umtausch retour 退货 退款 换货",
  CONTACT_INFORMATION: "contact email phone address kontakt 联系", PRIVACY_POLICY: "privacy data datenschutz 隐私", TERMS_OF_SERVICE: "terms conditions agb 条款", SUBSCRIPTION_POLICY: "subscription abo 订阅", LEGAL_NOTICE: "impressum legal notice" };
const POLICY_NAME = { REFUND_POLICY: { en: "return / refund policy", de: "Rückgabe-/Erstattungsrichtlinie", fr: "politique de retour", zh: "退换货政策" },
  SHIPPING_POLICY: { en: "shipping policy", de: "Versandrichtlinie", fr: "politique d'expédition", zh: "配送政策" },
  CONTACT_INFORMATION: { en: "contact page", de: "Kontaktseite", fr: "page de contact", zh: "联系方式" } };
const INTENT_POLICY = { shipping_quote: "SHIPPING_POLICY", delivery_time: "SHIPPING_POLICY", customs: "SHIPPING_POLICY", return_request: "REFUND_POLICY", cancel_or_change: "REFUND_POLICY", contact_info: "CONTACT_INFORMATION" };

const FACTS_TTL = 10 * 60_000, factsCache = new Map();
export const clearFactsCache = shop => shop ? factsCache.delete(shop) : factsCache.clear();
export async function shopFactsFor(shop) {
  const hit = factsCache.get(shop);
  if (hit && Date.now() - hit.at < FACTS_TTL) return hit.facts;
  let facts = { shop_name: shop.replace(/\.myshopify\.com$/, ""), email: null, currency: null, url: `https://${shop}`, policies: [] };
  try {
    const d = await graphql(shop, `{ shop { name contactEmail currencyCode taxesIncluded primaryDomain { url } shopPolicies { type title body url } } }`);
    const s = d.shop || {};
    facts = { shop_name: s.name || facts.shop_name, email: s.contactEmail || null, currency: s.currencyCode || null, taxes_included: !!s.taxesIncluded, url: s.primaryDomain?.url || facts.url,
      policies: (s.shopPolicies || []).map(p => ({ type: p.type, title: p.title, text: strip(p.body).slice(0, 1500), url: p.url })).filter(p => p.text) };
  } catch (e) { facts.error = e.message; console.error("[pod.ai] shop facts failed:", shop, String(e.message).slice(0, 200)); }
  // errors are cached only briefly so a fixed scope / token is picked up at once
  factsCache.set(shop, { at: facts.error ? Date.now() - FACTS_TTL + 30_000 : Date.now(), facts });
  return facts;
}

const STOP = new Set("the and you your for can how what are with does from this that ich sie und der die das wie was ist ein eine have has do is my me i a an to of in on it please bitte".split(" "));
const terms = q => String(q || "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)?.filter(t => !STOP.has(t)) || [];
const policyDocs = facts => facts.policies.map(p => ({ id: `policy_${p.type}`, tags: (POLICY_TAGS[p.type] || "").split(" "), question: p.title, answer: p.text, url: p.url }));
export function rankKnowledge(facts, custom, query, lang = "en", limit = 3) {
  const docs = [...normaliseCustom(custom).map(d => ({ id: d.id, custom: true, tags: d.tags, question: d.q[lang] || d.q.en, answer: d.a[lang] || d.a.en })), ...policyDocs(facts)];
  const ts = terms(query);
  return docs.map(d => { const hay = `${d.tags.join(" ")} ${d.question}`.toLowerCase(), body = d.answer.toLowerCase();
    const score = ts.reduce((s, t) => s + (d.tags.includes(t) ? 2 : hay.includes(t) ? 1.5 : body.includes(t) ? 0.5 : 0), 0);
    return { ...d, score: score + (d.custom && score ? 1 : 0) }; }).filter(d => d.score >= 1).sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---- order lookup: e-mail must match, same answer for "no order" and "wrong e-mail", 5 failures → 15 min lock per order ----
const fails = new Map();
const lockKey = (shop, n) => `${shop}|${String(n).replace(/^#/, "").toUpperCase()}`;
export const resetOrderLocks = () => fails.clear();
const eqMail = (a, b) => { const x = crypto.createHash("sha256").update(String(a || "").trim().toLowerCase()).digest(), y = crypto.createHash("sha256").update(String(b || "").trim().toLowerCase()).digest(); return crypto.timingSafeEqual(x, y); };
const ORDER_Q = `query($q: String!) { orders(first: 1, query: $q) { nodes { name createdAt email cancelledAt displayFinancialStatus displayFulfillmentStatus
  totalPriceSet { shopMoney { amount currencyCode } } lineItems(first: 10) { nodes { title quantity } } fulfillments(first: 5) { status trackingInfo(first: 3) { company number url } } } } }`;
export async function findShopOrder(shop, { order_number, email }) {
  const n = String(order_number || "").replace(/^#/, "").trim();
  if (!/^[A-Z0-9-]{1,30}$/i.test(n) || !email) return { ok: false, error: "need_order_and_email" };
  const k = lockKey(shop, n), f = fails.get(k);
  if (f && f.count >= 5 && Date.now() - f.at < 15 * 60_000) return { ok: false, error: "locked" };
  let o;
  try { o = (await graphql(shop, ORDER_Q, { q: `name:#${n}` })).orders?.nodes?.[0]; }
  catch (e) { return { ok: false, error: /access|protected|denied/i.test(e.message) ? "order_access_not_approved" : "order_lookup_failed" }; }
  if (!o || !o.email || !eqMail(o.email, email)) { fails.set(k, { count: (f && Date.now() - f.at < 15 * 60_000 ? f.count : 0) + 1, at: Date.now() }); return { ok: false, error: "not_found" }; }
  fails.delete(k);
  const tracking = (o.fulfillments || []).flatMap(x => (x.trackingInfo || []).map(t => ({ company: t.company, number: t.number, url: t.url })));
  return { ok: true, order: { name: o.name, created_at: o.createdAt, cancelled: !!o.cancelledAt, payment: o.displayFinancialStatus, fulfillment: o.displayFulfillmentStatus,
    total: o.totalPriceSet?.shopMoney?.amount, currency: o.totalPriceSet?.shopMoney?.currencyCode, items: (o.lineItems?.nodes || []).map(i => ({ title: i.title, quantity: i.quantity })), tracking } };
}

const PRODUCT_Q = `query($q: String!, $first: Int!, $sort: ProductSortKeys!, $rev: Boolean!) { products(first: $first, query: $q, sortKey: $sort, reverse: $rev) { nodes { id title handle onlineStoreUrl status productType featuredImage { url }
  priceRangeV2 { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } } collections(first: 3) { nodes { title } }
  variants(first: 5) { nodes { id title price availableForSale } } metafields(first: 5) { nodes { namespace key value type } } } } }`;
/** Generic "show me products / what do you sell / bestsellers" requests (EN / DE / FR / ZH). */
export const BROWSE_RE = /(\b(show|see|list|browse)\b.{0,20}\b(products?|items?|things|collection|catalog(ue)?|range|stuff)\b|what (do|can) (you|i) (sell|buy|offer|have)|what('s| is) (for sale|in stock|available)|\b(your|all) (products|items)\b|best ?sellers?|top sellers?|most popular|popular (products|items)|new arrivals|what'?s new|\bcatalog(ue)?\b|\b(produkte|sortiment|angebot)\b|was (verkauft|habt|haben) (ihr|sie)|zeig(en sie)? (mir )?.{0,10}(produkte|artikel)|meistverkauft|beliebteste|vos produits|qu'est-ce que vous vendez|有什么(商品|产品|卖)|卖什么|看看(商品|产品)|商品列表|所有商品|热卖|畅销|爆款|新品|推荐.{0,4}(商品|产品))/i;
const NOT_A_WORD = /^(do|have|sell|buy|price|prices|cost|kostet|preis|any|some|product|products|item|items|shop|store|you|recommend|looking|need|want|show|see|list|browse|all|your|me|bestseller|bestsellers|best|sellers|popular|new|arrivals|catalog|catalogue|things|stuff|produkte|zeig|zeigen|mir|artikel|sortiment)$/;
export async function searchShopProducts(shop, query, { browse = false } = {}) {
  const ts = browse ? [] : terms(query).filter(t => !NOT_A_WORD.test(t)).slice(0, 4);
  if (!ts.length && !browse) return { ok: true, products: [] };
  // browse: newest active products first (Shopify's product query has no best-selling sort)
  const q = ts.length ? `(${ts.map(t => `title:*${t.replace(/[^\p{L}\p{N}-]/gu, "")}*`).join(" OR ")}) AND status:active` : "status:active";
  try {
    const nodes = (await graphql(shop, PRODUCT_Q, { q, first: browse ? 6 : 4, sort: ts.length ? "RELEVANCE" : "UPDATED_AT", rev: !ts.length })).products?.nodes || [];
    return { ok: true, products: nodes.map(p => ({ id: p.id, name: p.title, image: p.featuredImage?.url || null, unit_price: Number(p.priceRangeV2?.minVariantPrice?.amount ?? NaN),
      currency: p.priceRangeV2?.minVariantPrice?.currencyCode || null, max_price: Number(p.priceRangeV2?.maxVariantPrice?.amount ?? NaN), link: p.onlineStoreUrl || `/products/${p.handle}`,
      type: p.productType || "", collections: (p.collections?.nodes || []).map(c => c.title),
      variants: (p.variants?.nodes || []).map(v => ({ title: v.title, price: Number(v.price), available: !!v.availableForSale })),
      variant_id: String((p.variants?.nodes || []).find(v => v.availableForSale)?.id || "").split("/").pop() || null,
      details: (p.metafields?.nodes || []).filter(m => /^(single_line_text_field|multi_line_text_field|number_integer|number_decimal|boolean|dimension|weight|volume)$/.test(m.type)).map(m => ({ key: m.key, value: String(m.value).slice(0, 200) })) })) };
  } catch (e) { console.error("[pod.ai] product search failed:", shop, String(e.message).slice(0, 200)); return { ok: false, error: "product_search_failed" }; }
}

// ---- shipping: delivery profiles → zones → rates (read_shipping). Calculated (carrier-service) rates → "at checkout". ----
const SHIP_Q = `{ deliveryProfiles(first: 5) { nodes { name default profileLocationGroups { locationGroupZones(first: 40) { nodes {
  zone { name countries { name code { countryCode restOfWorld } } }
  methodDefinitions(first: 10) { nodes { name active rateProvider { __typename ... on DeliveryRateDefinition { price { amount currencyCode } } }
    methodConditions { field operator conditionCriteria { __typename ... on MoneyV2 { amount currencyCode } ... on Weight { value unit } } } } } } } } } } }`;
const shipCache = new Map();
export async function shippingRates(shop, country) {
  const cc = String(country || "").toUpperCase();
  let profiles = shipCache.get(shop);
  if (!profiles || Date.now() - profiles.at > FACTS_TTL) {
    try { profiles = { at: Date.now(), list: (await graphql(shop, SHIP_Q)).deliveryProfiles?.nodes || [] }; } catch (e) { return { ok: false, error: "shipping_unavailable" }; }
    shipCache.set(shop, profiles);
  }
  const prof = profiles.list.find(p => p.default) || profiles.list[0];
  const zones = (prof?.profileLocationGroups || []).flatMap(g => g.locationGroupZones?.nodes || []);
  const hasCc = z => (z.zone?.countries || []).some(c => c.code?.countryCode === cc);
  const zone = zones.find(hasCc) || zones.find(z => (z.zone?.countries || []).some(c => c.code?.restOfWorld));
  if (!zones.length) return { ok: true, country: cc, ships: null, rates: [] }; // no readable delivery setup → policy text
  if (!zone) return { ok: true, country: cc, ships: false, rates: [] };
  const rates = (zone.methodDefinitions?.nodes || []).filter(m => m.active).map(m => {
    const fixed = m.rateProvider?.__typename === "DeliveryRateDefinition";
    const cond = (m.methodConditions || []).map(c => { const v = c.conditionCriteria; const val = v?.__typename === "MoneyV2" ? `${v.amount} ${v.currencyCode}` : v ? `${v.value} ${String(v.unit).toLowerCase()}` : "";
      return `${c.field === "TOTAL_PRICE" ? "order" : "weight"} ${c.operator === "GREATER_THAN_OR_EQUAL_TO" ? "≥" : "≤"} ${val}`; });
    return { name: m.name, price: fixed ? Number(m.rateProvider.price.amount) : null, currency: fixed ? m.rateProvider.price.currencyCode : null, calculated: !fixed, conditions: cond };
  });
  return { ok: true, country: cc, zone: zone.zone?.name || "", ships: true, rates };
}
export const clearShippingCache = () => shipCache.clear();

// ---- discount codes: read-only check of a code the customer already has (read_discounts). Codes are never listed to customers. ----
const DISC_Q = `query($q: String!) { codeDiscountNodes(first: 1, query: $q) { nodes { codeDiscount { __typename
  ... on DiscountCodeBasic { title status summary endsAt } ... on DiscountCodeFreeShipping { title status summary endsAt } ... on DiscountCodeBxgy { title status summary endsAt } } } } }`;
export async function checkDiscount(shop, code) {
  const c = String(code || "").trim().toUpperCase().slice(0, 40);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(c)) return { ok: false, error: "invalid_code_format" };
  try {
    const d = (await graphql(shop, DISC_Q, { q: `code:${c}` })).codeDiscountNodes?.nodes?.[0]?.codeDiscount;
    if (!d || d.status !== "ACTIVE") return { ok: true, code: c, valid: false };
    return { ok: true, code: c, valid: true, summary: d.summary || d.title || "", ends_at: d.endsAt || null };
  } catch { return { ok: false, error: "discount_check_failed" }; }
}

// ---- reply templates (en/de/fr/zh; other languages fall back to en) ----
const TX = {
  greet: { en: n => `Hi! I'm the ${n} assistant. I can help with orders, shipping, returns and products.`, de: n => `Hallo! Ich bin der Assistent von ${n}. Ich helfe bei Bestellungen, Versand, Rückgaben und Produkten.`, fr: n => `Bonjour ! Je suis l'assistant de ${n}. Je peux vous aider pour les commandes, la livraison, les retours et les produits.`, zh: n => `你好！我是 ${n} 的智能客服，可以帮你查订单、运费、退货和商品。` },
  thanks: { en: "You're welcome! Anything else?", de: "Gern geschehen! Noch etwas?", fr: "Avec plaisir ! Autre chose ?", zh: "不客气！还有其他问题吗？" },
  askOrder: { en: "Please send your order number (e.g. #1001) and the e-mail used for the order.", de: "Bitte senden Sie Ihre Bestellnummer (z. B. #1001) und die E-Mail der Bestellung.", fr: "Envoyez votre numéro de commande (ex. #1001) et l'e-mail de la commande.", zh: "请发送订单号（如 #1001）和下单邮箱。" },
  askEmail: { en: "Thanks! Which e-mail address did you use for this order?", de: "Danke! Mit welcher E-Mail haben Sie bestellt?", fr: "Merci ! Quel e-mail avez-vous utilisé ?", zh: "谢谢！下单时用的是哪个邮箱？" },
  askNumber: { en: "Thanks! What is the order number (e.g. #1001)?", de: "Danke! Wie lautet die Bestellnummer (z. B. #1001)?", fr: "Merci ! Quel est le numéro de commande (ex. #1001) ?", zh: "谢谢！订单号是多少（如 #1001）？" },
  notFound: { en: "I couldn't find an order with that number and e-mail. Please check both, or I can pass you to the team.", de: "Ich finde keine Bestellung mit dieser Nummer und E-Mail. Bitte prüfen – oder ich leite Sie an das Team weiter.", fr: "Je ne trouve pas de commande avec ce numéro et cet e-mail. Vérifiez-les, ou je vous passe l'équipe.", zh: "没有找到与该订单号和邮箱匹配的订单。请核对，或我帮你转人工。" },
  locked: { en: "Too many attempts for this order. Please try again in 15 minutes or ask for a person.", de: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen oder nach einem Menschen fragen.", fr: "Trop de tentatives. Réessayez dans 15 minutes ou demandez une personne.", zh: "尝试次数过多，请 15 分钟后再试或转人工。" },
  orderErr: { en: "Order lookup is not available right now. I can pass you to the team.", de: "Die Bestellabfrage ist gerade nicht verfügbar. Ich kann Sie an das Team weiterleiten.", fr: "La recherche de commande est indisponible. Je peux vous passer l'équipe.", zh: "暂时无法查询订单，我可以帮你转人工。" },
  shipCheckout: { en: "Exact shipping costs are calculated at checkout from your address.", de: "Die genauen Versandkosten werden im Checkout anhand Ihrer Adresse berechnet.", fr: "Les frais exacts sont calculés au paiement selon votre adresse.", zh: "具体运费会在结账时按收货地址计算。" },
  noPolicy: { en: "I don't have that policy yet. I can pass your question to the team.", de: "Dazu habe ich noch keine Angaben. Ich kann Ihre Frage an das Team weitergeben.", fr: "Je n'ai pas encore cette information. Je peux transmettre à l'équipe.", zh: "暂时没有这方面的说明，我可以帮你转给团队。" },
  products: { en: "Here is what I found:", de: "Das habe ich gefunden:", fr: "Voici ce que j'ai trouvé :", zh: "为你找到这些商品：" },
  noProducts: { en: "I couldn't find a matching product. Try another word, or browse the shop.", de: "Kein passendes Produkt gefunden. Versuchen Sie ein anderes Wort.", fr: "Aucun produit correspondant. Essayez un autre mot.", zh: "没有找到匹配的商品，换个关键词试试。" },
  unknown: { en: "I'm not sure about that one. Shall I pass it to the team?", de: "Da bin ich nicht sicher. Soll ich es an das Team weitergeben?", fr: "Je ne suis pas sûr. Voulez-vous que je transmette à l'équipe ?", zh: "这个问题我不确定，要帮你转人工吗？" },
  ship: { en: (z, l) => `Shipping to ${z}: ${l}.`, de: (z, l) => `Versand nach ${z}: ${l}.`, fr: (z, l) => `Livraison vers ${z} : ${l}.`, zh: (z, l) => `寄往 ${z}：${l}。` },
  noShip: { en: c => `Sorry, we don't ship to ${c} at the moment.`, de: c => `Leider liefern wir derzeit nicht nach ${c}.`, fr: c => `Désolé, nous ne livrons pas vers ${c} pour le moment.`, zh: c => `抱歉，目前不发货到 ${c}。` },
  askCountry: { en: "Which country should we ship to?", de: "In welches Land sollen wir liefern?", fr: "Vers quel pays ?", zh: "请问寄往哪个国家？" },
  codeOk: { en: (c, s) => `The code ${c} is valid${s ? `: ${s}` : ""}. Enter it at checkout.`, de: (c, s) => `Der Code ${c} ist gültig${s ? `: ${s}` : ""}. Im Checkout eingeben.`, fr: (c, s) => `Le code ${c} est valide${s ? ` : ${s}` : ""}. Saisissez-le au paiement.`, zh: (c, s) => `优惠码 ${c} 有效${s ? `：${s}` : ""}，结账时输入即可。` },
  codeBad: { en: c => `The code ${c} isn't active.`, de: c => `Der Code ${c} ist nicht aktiv.`, fr: c => `Le code ${c} n'est pas actif.`, zh: c => `优惠码 ${c} 无效或已过期。` },
  askCode: { en: "Do you have a discount code? Send it and I'll check it.", de: "Haben Sie einen Rabattcode? Senden Sie ihn, ich prüfe ihn.", fr: "Vous avez un code ? Envoyez-le, je le vérifie.", zh: "有优惠码吗？发给我帮你查。" },
  taxIncl: { en: "Prices include tax.", de: "Preise inkl. Steuern.", fr: "Prix TTC.", zh: "价格含税。" },
  taxExcl: { en: "Taxes are added at checkout.", de: "Steuern werden im Checkout berechnet.", fr: "Taxes calculées au paiement.", zh: "税费在结账时计算。" },
  browse: { en: "Here are some of our products:", de: "Hier sind einige unserer Produkte:", fr: "Voici quelques-uns de nos produits :", zh: "这是我们的部分商品：" },
  noCatalog: { en: "There are no products in the shop yet. I can pass your question to the team.", de: "Im Shop sind noch keine Produkte. Ich kann Ihre Frage an das Team weitergeben.", fr: "La boutique n'a pas encore de produits. Je peux transmettre à l'équipe.", zh: "店铺暂时还没有商品，我可以帮你转给团队。" },
  productErr: { en: "I can't load the products right now. I can pass your question to the team.", de: "Ich kann die Produkte gerade nicht laden. Ich kann Ihre Frage an das Team weitergeben.", fr: "Je ne peux pas charger les produits. Je peux transmettre à l'équipe.", zh: "暂时无法加载商品，我可以帮你转给团队。" },
  noPolicyFor: { en: n => `This shop hasn't published a ${n} yet.`, de: n => `Dieser Shop hat noch keine ${n} veröffentlicht.`, fr: n => `Cette boutique n'a pas encore publié de ${n}.`, zh: n => `本店暂未发布${n}。` },
  shipInfo: { en: "Shipping:", de: "Versand:", fr: "Livraison :", zh: "配送说明：" },
  mailUs: { en: e => `For questions you can e-mail ${e}.`, de: e => `Bei Fragen schreiben Sie an ${e}.`, fr: e => `Pour toute question : ${e}.`, zh: e => `如有问题可发邮件至 ${e}。` },
  offerTeam: { en: "Or I can pass your question to the team right here.", de: "Oder ich gebe Ihre Frage direkt an das Team weiter.", fr: "Ou je transmets votre question à l'équipe.", zh: "也可以由我直接帮你转给团队。" },
  human: { en: "Talk to a person", de: "Mit einem Menschen sprechen", fr: "Parler à une personne", zh: "转人工" },
  chips: { en: ["Where is my order?", "Shipping", "Returns"], de: ["Wo ist meine Bestellung?", "Versand", "Rückgabe"], fr: ["Où est ma commande ?", "Livraison", "Retours"], zh: ["我的订单在哪", "运费", "退货"] }
};
const t = (k, lang) => TX[k][lang] ?? TX[k].en;
const cut = (s, n = 700) => s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")} …` : s;

function orderText(o, lang) {
  const items = o.items.map(i => `${i.quantity}× ${i.title}`).join(", ");
  const tr = o.tracking.map(x => {
    const head = `${x.company || "Tracking"} ${x.number || ""}`.trim();
    const st = x.status_text && x.status !== "unknown" ? ` — ${x.status_text}` : "";
    const le = x.last_event ? ` (${[x.last_event.time, x.last_event.location, x.last_event.text].filter(Boolean).join(", ")})` : "";
    const link = !x.last_event && x.url ? ` ${x.url}` : "";
    return head + st + le + link;
  }).join("; ");
  const st = o.cancelled ? "cancelled" : String(o.fulfillment || "").toLowerCase().replace(/_/g, " ");
  if (lang === "zh") return `订单 ${o.name}：${st}（付款：${String(o.payment || "").toLowerCase()}）。商品：${items}。${tr ? `物流：${tr}` : "暂无物流单号。"}`;
  if (lang === "de") return `Bestellung ${o.name}: ${st} (Zahlung: ${String(o.payment || "").toLowerCase()}). Artikel: ${items}. ${tr ? `Sendungsverfolgung: ${tr}` : "Noch keine Sendungsnummer."}`;
  return `Order ${o.name}: ${st} (payment: ${String(o.payment || "").toLowerCase()}). Items: ${items}. ${tr ? `Tracking: ${tr}` : "No tracking number yet."}`;
}

/** Build the handleChat profile for a verified shop. */
export function makeProfile(shop) {
  const facts = () => shopFactsFor(shop);
  return {
    shop,
    facts,
    async searchKnowledge(_tenant, query, lang, { custom = [], limit = 3 } = {}) { return rankKnowledge(await facts(), custom, query, lang, limit); },
    systemPrompt({ facts: f, lang }) {
      return `You are the customer-service assistant of the online shop "${f.shop_name}" (Shopify). Answer in the customer's language (${lang}). Be short and friendly.
Use ONLY the tools and the shop's policies for facts: order status needs order number + e-mail (find_order); product info comes from search_products; policies from get_policy / search_knowledge.
Never invent prices, delivery dates, discounts or order data. Shipping costs are calculated at checkout. If you cannot help, offer handoff_to_human. Never ask for card numbers or passwords.`;
    },
    createTools(ctx) {
      const { lang, conv, settings, tenantId } = ctx;
      const impl = {
        async search_knowledge({ query }) { return { ok: true, results: rankKnowledge(await facts(), settings.custom_faq, query, lang).map(h => ({ question: h.question, answer: cut(h.answer, 1200) })) }; },
        async get_policy({ topic }) { const f = await facts(), type = { shipping: "SHIPPING_POLICY", returns: "REFUND_POLICY", refund: "REFUND_POLICY", contact: "CONTACT_INFORMATION", privacy: "PRIVACY_POLICY", terms: "TERMS_OF_SERVICE" }[topic] || topic;
          const p = f.policies.find(x => x.type === type); return p ? { ok: true, title: p.title, text: cut(p.text, 1500), url: p.url } : { ok: false, error: "policy_not_set" }; },
        async search_products({ query, browse = false }) { const r = await searchShopProducts(shop, query, { browse: browse || BROWSE_RE.test(String(query || "")) || !String(query || "").trim() }); if (r.ok && r.products.length) ctx.ui.push({ type: "products", items: r.products }); return r; },
        async find_order({ order_number, email }) {
          const r = await findShopOrder(shop, { order_number: order_number || conv.slots?.order_number, email: email || conv.slots?.email });
          if (r.ok) {
            conv.slots.order_number = r.order.name;
            // live tracking: carrier API (YunExpress / 4PX) → 51Tracking → Shopify tracking link
            r.order.tracking = await Promise.all(r.order.tracking.filter(x => x.number).slice(0, 3).map(async x => {
              const t = await trackParcel({ number: x.number, company: x.company, url: x.url, lang }).catch(() => null);
              return t ? { ...x, company: t.carrier || x.company, url: t.url || x.url, source: t.source, status: t.status, status_text: t.status_text, last_event: t.last_event, events: t.events.slice(0, 8) } : x;
            }));
            ctx.ui.push({ type: "order", order: r.order });
            for (const t of r.order.tracking) ctx.ui.push({ type: "tracking", carrier: t.company || "", number: t.number, status: t.status_text || "", url: t.url || "", source: t.source || "link", events: t.events || [] });
          }
          return r;
        },
        async quote_shipping({ country }) { const r = await shippingRates(shop, country || conv.slots?.country || ctx.countryHint); if (r.ok && r.ships) ctx.ui.push({ type: "shipping", country: r.country, rates: r.rates }); return r; },
        async check_discount_code({ code }) { return checkDiscount(shop, code); },
        async handoff_to_human({ reason = "customer_request", summary = "" }) { const h = await createHandoff(tenantId, conv, { reason, summary }); ctx.handoff = h.reason; return { ok: true, handoff_id: h.id }; }
      };
      const fn = (name, description, properties = {}, required = []) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } });
      const definitions = [
        fn("search_knowledge", "Search the shop FAQ and policies.", { query: { type: "string" } }, ["query"]),
        fn("get_policy", "Get a shop policy: shipping, returns, contact, privacy, terms.", { topic: { type: "string" } }, ["topic"]),
        fn("search_products", "Search active products by keywords; empty query or browse=true lists the shop's products.", { query: { type: "string" }, browse: { type: "boolean" } }),
        fn("find_order", "Order status + tracking. Needs order number and the order e-mail.", { order_number: { type: "string" }, email: { type: "string" } }, ["order_number", "email"]),
        fn("quote_shipping", "Shipping methods and rates of the shop for a destination country (ISO-2).", { country: { type: "string" } }, ["country"]),
        fn("check_discount_code", "Check whether a discount code the customer has is active (read-only).", { code: { type: "string" } }, ["code"]),
        fn("handoff_to_human", "Pass the conversation to the shop team.", { reason: { type: "string" }, summary: { type: "string" } })
      ];
      const execute = async (name, args = {}) => {
        if (!impl[name]) return { ok: false, error: `unknown_tool:${name}` };
        const r = await impl[name](args || {});
        ctx.toolLog.push({ name, ok: !!r.ok }); conv.tools[name] = (conv.tools[name] || 0) + 1;
        return r;
      };
      return { definitions, execute };
    },
    async ruleAnswer(ctx, m, text, tools) {
      const { lang, conv, settings } = ctx, f = ctx.facts || await facts();
      const human = { type: "chips", items: [t("human", lang)] };
      if (m.order_number) conv.slots.order_number = m.order_number;
      if (m.email) conv.slots.email = m.email;
      let intent = m.intent;
      if (conv.slots.pending === "order" && (m.order_number || m.email) && !["greeting", "thanks"].includes(intent)) intent = "order_status";
      if (BROWSE_RE.test(text) && !["order_status", "tracking", "shipping_quote", "discount"].includes(intent)) intent = "browse";
      if (conv.slots.pending === "shipping" && m.country && !["greeting", "thanks"].includes(intent)) intent = "shipping_quote";
      switch (intent) {
        case "greeting": ctx.ui.push({ type: "chips", items: t("chips", lang) }); return settings.greeting?.[lang] || settings.greeting?.en || t("greet", lang)(f.shop_name);
        case "thanks": return t("thanks", lang);
        case "order_status": case "tracking": {
          const { order_number: n, email } = conv.slots;
          if (!n && !email) { conv.slots.pending = "order"; return t("askOrder", lang); }
          if (!n) { conv.slots.pending = "order"; return t("askNumber", lang); }
          if (!email) { conv.slots.pending = "order"; return t("askEmail", lang); }
          const r = await tools.execute("find_order", { order_number: n, email });
          conv.slots.pending = null;
          if (r.ok) return orderText(r.order, lang);
          if (r.error !== "not_found") { conv.slots.order_number = null; }
          else { conv.slots.order_number = null; conv.slots.email = null; }
          ctx.ui.push(human);
          return t(r.error === "locked" ? "locked" : r.error === "not_found" ? "notFound" : "orderErr", lang);
        }
        case "shipping_quote": {
          const own = rankKnowledge(f, settings.custom_faq, text, lang, 1)[0];
          if (own?.custom) return cut(own.answer); // the merchant's own answer wins
          if (m.country) conv.slots.country = m.country;
          const cc = conv.slots.country || ctx.countryHint;
          if (!cc) { conv.slots.pending = "shipping"; return t("askCountry", lang); }
          conv.slots.pending = null;
          const r = await tools.execute("quote_shipping", { country: cc });
          if (r.ok && r.ships === false) return t("noShip", lang)(cc);
          if (r.ok && r.rates.length) {
            const list = r.rates.map(x => `${x.name} ${x.calculated ? `(${t("shipCheckout", lang).replace(/\.$/, "")})` : x.price === 0 ? (lang === "de" ? "gratis" : lang === "zh" ? "免运费" : "free") : `${x.currency} ${x.price.toFixed(2)}`}${x.conditions.length ? ` [${x.conditions.join(", ")}]` : ""}`).join("; ");
            return t("ship", lang)(r.zone || cc, list);
          }
          break; // no rates readable → shipping policy below
        }
        case "discount": {
          // a code is a token the customer wrote in capitals or with digits (e.g. ALPS10, summer25)
          const code = (text.match(/[A-Za-z0-9][A-Za-z0-9_-]{3,39}/g) || []).find(w => /\d/.test(w) || (w === w.toUpperCase() && /[A-Z]/.test(w)));
          if (!code) return t("askCode", lang);
          const r = await tools.execute("check_discount_code", { code });
          if (!r.ok) break;
          return r.valid ? t("codeOk", lang)(r.code, r.summary) : t("codeBad", lang)(r.code);
        }
        case "browse": {
          const r = await tools.execute("search_products", { query: text, browse: true });
          if (r.ok && r.products.length) return `${t("browse", lang)} ${t(f.taxes_included ? "taxIncl" : "taxExcl", lang)}`;
          ctx.ui.push(human); return t(r.ok ? "noCatalog" : "productErr", lang);
        }
        case "price": case "product_question": case "recommendation": {
          const r = await tools.execute("search_products", { query: text });
          if (r.ok && r.products.length) return `${t("products", lang)} ${t(f.taxes_included ? "taxIncl" : "taxExcl", lang)}`;
          const kb = rankKnowledge(f, settings.custom_faq, text, lang, 1)[0];
          if (kb) return cut(kb.answer);
          return t("noProducts", lang);
        }
      }
      const type = INTENT_POLICY[intent];
      const kb = rankKnowledge(f, settings.custom_faq, text, lang, 1)[0];
      if (kb && (kb.custom || !type || kb.id === `policy_${type}`)) return cut(kb.answer) + (intent === "shipping_quote" ? `\n\n${t("shipCheckout", lang)}` : "") + (kb.url ? `\n${kb.url}` : "");
      if (type) {
        const p = f.policies.find(x => x.type === type);
        if (p) return cut(p.text) + (intent === "shipping_quote" ? `\n\n${t("shipCheckout", lang)}` : "") + (p.url ? `\n${p.url}` : "");
        if (intent === "shipping_quote") return t("shipCheckout", lang);
        if (intent === "contact_info" && f.email) return f.email;
        // no published policy: say so, give what the shop does publish (shipping policy / contact) and offer a person
        const ship = type !== "SHIPPING_POLICY" ? f.policies.find(x => x.type === "SHIPPING_POLICY") : null;
        const contact = f.policies.find(x => x.type === "CONTACT_INFORMATION");
        const parts = [t("noPolicyFor", lang)(POLICY_NAME[type]?.[lang] || POLICY_NAME[type]?.en || "")];
        if (ship) parts.push(`${t("shipInfo", lang)} ${cut(ship.text, 300)}${ship.url ? ` ${ship.url}` : ""}`);
        if (f.email) parts.push(t("mailUs", lang)(f.email)); else if (contact) parts.push(cut(contact.text, 300));
        parts.push(t("offerTeam", lang));
        ctx.ui.push(human); return parts.join("\n\n");
      }
      // nothing matched: maybe the customer named a product of this shop (the engine has no catalog of its own)
      const pr = await tools.execute("search_products", { query: text });
      if (pr.ok && pr.products.length) return `${t("products", lang)} ${t(f.taxes_included ? "taxIncl" : "taxExcl", lang)}`;
      ctx.unanswered = true; ctx.ui.push(human); return t("unknown", lang);
    }
  };
}
