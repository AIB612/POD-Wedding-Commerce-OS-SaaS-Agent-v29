// Chat profile for one Shopify shop: plugs into handleChat({ profile }) of the POD Agent customer chat.
// Same pipeline (guardrails, local-first routing, LLM fallback, handoff queue, KPIs); shop-specific data:
//   knowledge   = the merchant's own FAQ (embedded admin) + the shop's legal policies (shipping / refund / contact …)
//   products    = Admin API product search (read_products)
//   orders      = Admin API order by name + e-mail check (read_orders; protected customer data), per-order lock
//   shipping    = Shopify has no generic rate API for apps outside checkout → shipping policy + "calculated at checkout"
// No Wed.AI catalog, prices or FAQ ever leak into a shop tenant.
import crypto from "node:crypto";
import { graphql } from "./core.js";
import { normaliseCustom } from "../pod-agent/customer/knowledge.js";
import { createHandoff } from "../pod-agent/customer/store.js";

const strip = h => String(h || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const POLICY_TAGS = { SHIPPING_POLICY: "shipping delivery versand livraison 运费 配送 发货 customs", REFUND_POLICY: "return returns refund exchange rückgabe retoure umtausch retour 退货 退款 换货",
  CONTACT_INFORMATION: "contact email phone address kontakt 联系", PRIVACY_POLICY: "privacy data datenschutz 隐私", TERMS_OF_SERVICE: "terms conditions agb 条款", SUBSCRIPTION_POLICY: "subscription abo 订阅", LEGAL_NOTICE: "impressum legal notice" };
const INTENT_POLICY = { shipping_quote: "SHIPPING_POLICY", delivery_time: "SHIPPING_POLICY", customs: "SHIPPING_POLICY", return_request: "REFUND_POLICY", cancel_or_change: "REFUND_POLICY", contact_info: "CONTACT_INFORMATION" };

const FACTS_TTL = 10 * 60_000, factsCache = new Map();
export const clearFactsCache = shop => shop ? factsCache.delete(shop) : factsCache.clear();
export async function shopFactsFor(shop) {
  const hit = factsCache.get(shop);
  if (hit && Date.now() - hit.at < FACTS_TTL) return hit.facts;
  let facts = { shop_name: shop.replace(/\.myshopify\.com$/, ""), email: null, currency: null, url: `https://${shop}`, policies: [] };
  try {
    const d = await graphql(shop, `{ shop { name contactEmail currencyCode primaryDomain { url } shopPolicies { type title body url } } }`);
    const s = d.shop || {};
    facts = { shop_name: s.name || facts.shop_name, email: s.contactEmail || null, currency: s.currencyCode || null, url: s.primaryDomain?.url || facts.url,
      policies: (s.shopPolicies || []).map(p => ({ type: p.type, title: p.title, text: strip(p.body).slice(0, 1500), url: p.url })).filter(p => p.text) };
  } catch (e) { facts.error = e.message; }
  factsCache.set(shop, { at: Date.now(), facts });
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

const PRODUCT_Q = `query($q: String!) { products(first: 4, query: $q) { nodes { id title handle onlineStoreUrl status featuredImage { url } priceRangeV2 { minVariantPrice { amount currencyCode } } } } }`;
export async function searchShopProducts(shop, query) {
  const ts = terms(query).filter(t => !/^(do|have|sell|buy|price|cost|kostet|preis|any|some|product|products|item|items|shop|store|you|recommend|looking|need|want|show)$/.test(t)).slice(0, 4);
  if (!ts.length) return { ok: true, products: [] };
  const q = `(${ts.map(t => `title:*${t.replace(/[^\p{L}\p{N}-]/gu, "")}*`).join(" OR ")}) AND status:active`;
  try {
    const nodes = (await graphql(shop, PRODUCT_Q, { q })).products?.nodes || [];
    return { ok: true, products: nodes.map(p => ({ id: p.id, name: p.title, image: p.featuredImage?.url || null, unit_price: Number(p.priceRangeV2?.minVariantPrice?.amount ?? NaN),
      currency: p.priceRangeV2?.minVariantPrice?.currencyCode || null, link: p.onlineStoreUrl || `/products/${p.handle}` })) };
  } catch (e) { return { ok: false, error: "product_search_failed" }; }
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
  human: { en: "Talk to a person", de: "Mit einem Menschen sprechen", fr: "Parler à une personne", zh: "转人工" },
  chips: { en: ["Where is my order?", "Shipping", "Returns"], de: ["Wo ist meine Bestellung?", "Versand", "Rückgabe"], fr: ["Où est ma commande ?", "Livraison", "Retours"], zh: ["我的订单在哪", "运费", "退货"] }
};
const t = (k, lang) => TX[k][lang] ?? TX[k].en;
const cut = (s, n = 700) => s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, "")} …` : s;

function orderText(o, lang) {
  const items = o.items.map(i => `${i.quantity}× ${i.title}`).join(", ");
  const tr = o.tracking.map(x => `${x.company || "Tracking"} ${x.number || ""}`.trim()).join(", ");
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
        async search_products({ query }) { const r = await searchShopProducts(shop, query); if (r.ok && r.products.length) ctx.ui.push({ type: "products", items: r.products }); return r; },
        async find_order({ order_number, email }) {
          const r = await findShopOrder(shop, { order_number: order_number || conv.slots?.order_number, email: email || conv.slots?.email });
          if (r.ok) { conv.slots.order_number = r.order.name; ctx.ui.push({ type: "order", order: r.order }); }
          return r;
        },
        async handoff_to_human({ reason = "customer_request", summary = "" }) { const h = await createHandoff(tenantId, conv, { reason, summary }); ctx.handoff = h.reason; return { ok: true, handoff_id: h.id }; }
      };
      const fn = (name, description, properties = {}, required = []) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } });
      const definitions = [
        fn("search_knowledge", "Search the shop FAQ and policies.", { query: { type: "string" } }, ["query"]),
        fn("get_policy", "Get a shop policy: shipping, returns, contact, privacy, terms.", { topic: { type: "string" } }, ["topic"]),
        fn("search_products", "Search active products by keywords.", { query: { type: "string" } }, ["query"]),
        fn("find_order", "Order status + tracking. Needs order number and the order e-mail.", { order_number: { type: "string" }, email: { type: "string" } }, ["order_number", "email"]),
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
        case "price": case "product_question": case "recommendation": {
          const r = await tools.execute("search_products", { query: text });
          if (r.ok && r.products.length) return t("products", lang);
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
        ctx.unanswered = true; ctx.ui.push(human); return t("noPolicy", lang);
      }
      ctx.unanswered = true; ctx.ui.push(human); return t("unknown", lang);
    }
  };
}
