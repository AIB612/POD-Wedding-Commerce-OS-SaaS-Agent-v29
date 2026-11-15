// Customer chat main flow — port of the POD Agent handleMessage (agent.js) onto our store:
//  ① validate + redact  ② conversation (agent_conversations)  ③ per-chat rate limit  ④ injection / payment-data refusal
//  ⑤ handed-off chats stay with the team  ⑥ classify (rules; LLM classifier only on the LLM path)  ⑦ guardrails → handoff queue
//  ⑧ route (router.js): local rule engine + shop data first; LLM only for complex / unmatched questions when a key exists  ⑨ store + stats (answered_by)
import { classifyRules, detectLanguage, fixTypos, attrKind, COLOR_RE, extractEmail, extractOrderNumber, extractTracking } from "./nlu.js";
import { productReply, attrReply, kbReply, deliveryReply, dontKnow, clarifyCards, CARD_CHIPS, nextChips, phrase } from "./compose.js";
import { handoffCheck, holdingMessage, errorMessage, injectionMessage, paymentDataMessage, INJECTION_RE, containsPaymentData, redact } from "./guardrails.js";
import { createTools, resolveProduct, productById } from "./tools.js";
import { shopFacts, knowledgeEntry, searchKnowledge } from "./knowledge.js";
import { getSettings, findOrCreateConversation, saveConversation, recentUserMessages, createHandoff, appendToHandoff } from "./store.js";
import { llmStatus, runToolLoop, chatJson, answerOpenQuestion } from "./llm.js";
import { systemPrompt, CLASSIFIER_SYSTEM } from "./prompts.js";
import { decideRoute } from "./router.js";
import { T_FR_IT, CHIPS_FR_IT, PRODUCT_CHIPS_FR_IT, COUNTRY_CHIPS_FR_IT, HUMAN_CHIP_FR_IT, COUNTRY_LABEL_FR_IT } from "./i18n-fr-it.js";

const LANGS = ["en", "zh", "de", "fr", "it"];
const UNRESOLVED_RE = /(didn'?t help|not helpful|not what i asked|doesn'?t answer|hilft nicht|nicht geholfen|ça n'aide pas|non aiuta|没用|没解决|不是我问的|答非所问)/i;
const HESITATION_RE = /(too expensive|expensive|pricey|cheaper|zu teuer|teuer|trop cher|troppo caro|太贵|贵了|便宜点|能不能便宜)/i;
const money = (cur, n) => `${cur} ${Number(n || 0).toFixed(2)}`;
function fmtDate(iso, lang) {
  if (!iso) return "";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00Z" : ""));
  if (lang === "zh") return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  return d.toLocaleDateString(lang === "de" ? "de-CH" : lang === "fr" ? "fr-CH" : lang === "it" ? "it-CH" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
const COUNTRY_LABEL = { en: { CH: "Switzerland", DE: "Germany", AT: "Austria", FR: "France", IT: "Italy", LI: "Liechtenstein", GB: "the UK", US: "the USA" }, zh: { CH: "瑞士", DE: "德国", AT: "奥地利", FR: "法国", IT: "意大利", LI: "列支敦士登", GB: "英国", US: "美国" }, de: { CH: "die Schweiz", DE: "Deutschland", AT: "Österreich", FR: "Frankreich", IT: "Italien", LI: "Liechtenstein", GB: "Grossbritannien", US: "die USA" } };
Object.assign(COUNTRY_LABEL, COUNTRY_LABEL_FR_IT);
const cname = (cc, lang) => (COUNTRY_LABEL[lang] || COUNTRY_LABEL.en)[cc] || cc;

// ---- Reply templates (EN / ZH / DE here; FR / IT merged from i18n-fr-it.js) ----
const T = {
  greet: { en: "Hi! I'm the POD.AI assistant. I can recommend products, quote prices and shipping, and check your order.", zh: "您好！我是 POD.AI 助手，可以为您推荐产品、报价和运费，以及查询订单。", de: "Hallo! Ich bin der POD.AI-Assistent. Ich empfehle Produkte, berechne Preise und Versand und prüfe Ihre Bestellung." },
  thanks: { en: "You're welcome! Anything else I can help with?", zh: "不客气！还有什么可以帮您？", de: "Gern geschehen! Kann ich sonst noch helfen?" },
  askProduct: { en: "Which product would you like a quote for? For example invitations, menu cards or place cards.", zh: "请问您想报价哪个产品？例如邀请卡、菜单卡或席位卡。", de: "Für welches Produkt möchten Sie ein Angebot? Zum Beispiel Einladungen, Menükarten oder Platzkarten." },
  askCountry: { en: "To which country should we deliver?", zh: "请问寄往哪个国家？", de: "In welches Land sollen wir liefern?" },
  quote: {
    en: v => `${v.qty} × ${v.product} to ${v.country}: ${money(v.cur, v.subtotal)} (${money(v.cur, v.unit)} each). Shipping: ${v.opts}. ${v.vat}`,
    zh: v => `${v.qty} 份${v.product}寄往${v.country}：商品 ${money(v.cur, v.subtotal)}（单价 ${money(v.cur, v.unit)}）。运费：${v.opts}。${v.vat}`,
    de: v => `${v.qty} × ${v.product} nach ${v.country}: ${money(v.cur, v.subtotal)} (${money(v.cur, v.unit)} pro Stück). Versand: ${v.opts}. ${v.vat}` },
  opt: { en: o => `${o.label} ${o.free ? "free" : money(o.cur, o.price)} (arrives ${o.from}–${o.to})`, zh: o => `${o.label === "Express" ? "快递" : "标准"} ${o.free ? "免费" : money(o.cur, o.price)}（预计 ${o.from}–${o.to} 送达）`, de: o => `${o.label} ${o.free ? "kostenlos" : money(o.cur, o.price)} (Ankunft ca. ${o.from}–${o.to})` },
  vatEx: { en: r => `VAT (${(r * 100).toFixed(1)}%) is added at checkout. Dates are estimates; production starts after payment and proof approval.`, zh: r => `结账时另加增值税（${(r * 100).toFixed(1)}%）。日期为预估，付款并确认效果图后开始生产。`, de: r => `Die MwSt. (${(r * 100).toFixed(1)} %) wird an der Kasse addiert. Daten sind Schätzungen; die Produktion startet nach Zahlung und Freigabe.` },
  vatIn: { en: () => "Prices include VAT. Dates are estimates; production starts after payment and proof approval.", zh: () => "价格含增值税。日期为预估，付款并确认效果图后开始生产。", de: () => "Preise inkl. MwSt. Daten sind Schätzungen; die Produktion startet nach Zahlung und Freigabe." },
  noShip: { en: v => `Sorry, we don't ship to ${v} yet.`, zh: v => `抱歉，暂时不支持寄往${v}。`, de: v => `Leider liefern wir noch nicht nach ${v}.` },
  price: { en: v => `${v.product}: ${v.tiers}. ${v.vat} Personalise it here: ${v.link}`, zh: v => `${v.product}：${v.tiers}。${v.vat} 在这里定制：${v.link}`, de: v => `${v.product}: ${v.tiers}. ${v.vat} Hier gestalten: ${v.link}` },
  tier: { en: t => `${money(t.currency, t.unit_price)} from ${t.min_qty}`, zh: t => `${t.min_qty} 件起 ${money(t.currency, t.unit_price)}`, de: t => `${money(t.currency, t.unit_price)} ab ${t.min_qty}` },
  perItemEx: { en: "Prices per item excl. VAT; shipping and VAT at checkout.", zh: "单价不含增值税，运费和税在结账时计算。", de: "Stückpreise exkl. MwSt.; Versand und MwSt. an der Kasse." },
  reco: { en: v => `Here are ${v.n} ideas${v.budget ? ` within ${v.budget} per item` : ""}: ${v.list}. Tap a card to personalise it.`, zh: v => `为您推荐 ${v.n} 款${v.budget ? `（单价 ${v.budget} 以内）` : ""}：${v.list}。点击卡片即可定制。`, de: v => `Hier ${v.n} Ideen${v.budget ? ` bis ${v.budget} pro Stück` : ""}: ${v.list}. Tippen Sie auf eine Karte, um sie zu gestalten.` },
  recoNone: { en: "I couldn't find products within that budget. Would a slightly higher budget work, or shall I show our most popular wedding items?", zh: "在这个预算内没有找到合适的产品。可以稍微提高预算，或者看看热门婚礼单品？", de: "In diesem Budget habe ich nichts gefunden. Passt ein etwas höheres Budget, oder soll ich beliebte Hochzeitsartikel zeigen?" },
  askOrder: { en: "Please send your order number (e.g. POD-2026-…) and the e-mail you ordered with, and I'll check the status.", zh: "请提供订单号（如 POD-2026-…）和下单邮箱，我来为您查询。", de: "Bitte senden Sie Ihre Bestellnummer (z. B. POD-2026-…) und die E-Mail der Bestellung, dann prüfe ich den Status." },
  askEmail: { en: v => `Thanks! For your security, what e-mail address did you use for order ${v}?`, zh: v => `谢谢！为保护您的隐私，请提供订单 ${v} 的下单邮箱。`, de: v => `Danke! Zu Ihrer Sicherheit: Mit welcher E-Mail haben Sie Bestellung ${v} aufgegeben?` },
  notFound: { en: "I couldn't find an order with this number and e-mail. Please check both (the number is in your confirmation e-mail), or use Find my order: /account#find-order", zh: "没有找到与该订单号和邮箱匹配的订单。请核对两者（订单号在确认邮件中），或使用“查询订单”：/account#find-order", de: "Ich habe keine Bestellung mit dieser Nummer und E-Mail gefunden. Bitte prüfen Sie beides oder nutzen Sie „Bestellung finden“: /account#find-order" },
  tooMany: { en: "Too many attempts for this order number. Please try again in 15 minutes.", zh: "该订单号尝试次数过多，请 15 分钟后再试。", de: "Zu viele Versuche für diese Bestellnummer. Bitte in 15 Minuten erneut versuchen." },
  stage: {
    en: { awaiting_payment: "is waiting for payment", paid: "is paid and being prepared", proof: "is waiting for your proof approval", in_production: "is in production", shipped: "has shipped", delivered: "has been delivered", cancelled: "was cancelled" },
    zh: { awaiting_payment: "等待付款", paid: "已付款，正在准备", proof: "等待您确认效果图", in_production: "正在生产", shipped: "已发货", delivered: "已签收", cancelled: "已取消" },
    de: { awaiting_payment: "wartet auf Zahlung", paid: "ist bezahlt und in Vorbereitung", proof: "wartet auf Ihre Freigabe", in_production: "ist in Produktion", shipped: "wurde versandt", delivered: "wurde zugestellt", cancelled: "wurde storniert" } },
  order: { en: v => `Order ${v.id} ${v.stage}.${v.eta ? ` Estimated delivery: ${v.eta}.` : ""}${v.track ? ` ${v.track}` : ""}`, zh: v => `订单 ${v.id}：${v.stage}。${v.eta ? `预计送达：${v.eta}。` : ""}${v.track ? v.track : ""}`, de: v => `Bestellung ${v.id} ${v.stage}.${v.eta ? ` Voraussichtliche Lieferung: ${v.eta}.` : ""}${v.track ? ` ${v.track}` : ""}` },
  trackLine: { en: v => `${v.carrier || "The carrier"} shows "${v.status}"${v.last ? ` — latest: ${v.last}` : ""}.${v.url ? ` Track: ${v.url}` : ""}`, zh: v => `${v.carrier || "承运商"}显示“${v.status}”${v.last ? `，最新：${v.last}` : ""}。${v.url ? `查看：${v.url}` : ""}`, de: v => `${v.carrier || "Der Versanddienst"} meldet „${v.status}“${v.last ? ` – zuletzt: ${v.last}` : ""}.${v.url ? ` Verfolgen: ${v.url}` : ""}` },
  askTracking: { en: "Please send the tracking number from your shipping e-mail — or your order number and e-mail, and I'll look it up.", zh: "请提供发货邮件中的运单号，或者订单号和下单邮箱，我来为您查询。", de: "Bitte senden Sie die Sendungsnummer aus der Versand-E-Mail – oder Bestellnummer und E-Mail." },
  trackNotFound: { en: v => `I couldn't find a parcel with tracking number ${v}. Please check the number (it's in your shipping e-mail), or send your order number and e-mail and I'll look up the order.`, zh: v => `没有找到运单号 ${v} 的包裹。请核对运单号（在发货邮件中），或提供订单号和下单邮箱，我来查询订单。`, de: v => `Ich finde kein Paket mit der Sendungsnummer ${v}. Bitte prüfen Sie die Nummer oder senden Sie Bestellnummer und E-Mail.` },
  trackInvalid: { en: "That doesn't look like a valid tracking number. Please copy it from your shipping e-mail, or send your order number and e-mail.", zh: "这个运单号格式不正确。请从发货邮件中复制，或提供订单号和下单邮箱。", de: "Das sieht nicht nach einer gültigen Sendungsnummer aus. Bitte kopieren Sie sie aus der Versand-E-Mail." },
  discount: { en: v => `${v ? `Volume pricing is applied automatically (e.g. ${v}).` : "Some products get cheaper per piece from 10, 25, 50 or 100 pieces — the cart always shows your exact unit price."} If you have a promo code, enter it in the cart or at checkout — one code per order. Send me the code and I'll check it.`, zh: v => `${v ? `系统自动按数量阶梯计价（例如 ${v}）。` : "部分产品满 10、25、50 或 100 件单价更低，购物车会显示准确单价。"}如有优惠码，请在购物车或结账时输入（每单限一个）。也可以把优惠码发给我帮您检查。`, de: v => `${v ? `Mengenpreise werden automatisch angewendet (z. B. ${v}).` : "Einige Produkte werden ab 10, 25, 50 oder 100 Stück günstiger – der Warenkorb zeigt den genauen Stückpreis."} Einen Gutscheincode geben Sie im Warenkorb oder an der Kasse ein – ein Code pro Bestellung.` },
  codeOk: { en: v => `Code ${v.code} is valid: ${v.value} off${v.min ? `, minimum order ${v.min}` : ""}${v.exp ? `, valid until ${v.exp}` : ""}. Enter it in the cart or at checkout.`, zh: v => `优惠码 ${v.code} 有效：优惠 ${v.value}${v.min ? `，最低消费 ${v.min}` : ""}${v.exp ? `，有效期至 ${v.exp}` : ""}。请在购物车或结账时输入。`, de: v => `Der Code ${v.code} ist gültig: ${v.value} Rabatt${v.min ? `, Mindestbestellwert ${v.min}` : ""}${v.exp ? `, gültig bis ${v.exp}` : ""}.` },
  codeBad: { en: v => `Sorry, code ${v} is not valid (expired, used up or unknown).`, zh: v => `抱歉，优惠码 ${v} 无效（已过期、已用完或不存在）。`, de: v => `Leider ist der Code ${v} nicht gültig (abgelaufen, aufgebraucht oder unbekannt).` },
  issued: { en: v => `I can offer you a one-time code: ${v.code} (${v.value} off, valid until ${v.exp}). Enter it at checkout.`, zh: v => `可以为您提供一次性优惠码：${v.code}（优惠 ${v.value}，有效期至 ${v.exp}），结账时输入即可。`, de: v => `Ich kann Ihnen einen einmaligen Code anbieten: ${v.code} (${v.value} Rabatt, gültig bis ${v.exp}).` },
  product: { en: v => `${v.name}: ${v.materials ? `materials ${v.materials}; ` : ""}${v.tiers}. ${v.vat} Personalise it: ${v.link}`, zh: v => `${v.name}：${v.materials ? `材质 ${v.materials}；` : ""}${v.tiers}。${v.vat} 定制：${v.link}`, de: v => `${v.name}: ${v.materials ? `Materialien ${v.materials}; ` : ""}${v.tiers}. ${v.vat} Gestalten: ${v.link}` },
  offerHuman: { en: "If that doesn't fully answer your question, I can pass it to our team — just say \"talk to a person\".", zh: "如果这还没有完全解答您的问题，我可以为您转接人工客服——回复“转人工”即可。", de: "Falls das Ihre Frage nicht ganz beantwortet, gebe ich sie gern an unser Team weiter — schreiben Sie einfach „Mit einem Menschen sprechen“." },
  unknown: { en: "I'm not sure about that one. I can help with products and recommendations, prices and shipping quotes, delivery times and your order status — or pass you to our team.", zh: "这个问题我不太确定。我可以帮您推荐产品、报价和运费、查询送达时间和订单状态，或者为您转接人工。", de: "Da bin ich mir nicht sicher. Ich helfe bei Produkten, Preisen und Versand, Lieferzeiten und Bestellstatus – oder verbinde Sie mit dem Team." },
  muted: { en: "Your request is with our team — they'll reply soon. I've added your message to it.", zh: "您的问题已在人工团队处理中，他们会尽快回复；我已把这条消息补充给他们。", de: "Ihr Anliegen liegt bei unserem Team – es meldet sich bald. Ich habe Ihre Nachricht ergänzt." },
  emailNoted: { en: "Thank you — I've added your e-mail so the team can reply.", zh: "谢谢，已为您记录邮箱，团队会通过邮件回复。", de: "Danke – ich habe Ihre E-Mail ergänzt, damit das Team antworten kann." },
  rate: { en: "You have sent a lot of messages. Please wait a moment.", zh: "您发送的消息太多了，请稍等片刻。", de: "Sie haben sehr viele Nachrichten gesendet. Bitte warten Sie einen Moment." },
  disabled: { en: "The chat assistant is currently offline. Please use Find my order (/account#find-order) or try again later.", zh: "AI 助手暂时离线，请使用“查询订单”（/account#find-order）或稍后再试。", de: "Der Chat-Assistent ist gerade offline. Bitte nutzen Sie „Bestellung finden“ oder versuchen Sie es später." }
};
// New answers: catalogue overview ("what do you sell") and products we don't carry.
T.browse = {
  en: v => `${v.intro} Popular right now: ${v.list}. Tap a card to personalise it, or ask me about a specific product.`,
  zh: v => `${v.intro} 热门商品：${v.list}。点击卡片即可定制，也可以直接问我某个产品。`,
  de: v => `${v.intro} Gerade beliebt: ${v.list}. Tippen Sie auf eine Karte, um sie zu gestalten, oder fragen Sie mich nach einem bestimmten Produkt.`,
  fr: v => `${v.intro} En ce moment : ${v.list}. Touchez une carte pour la personnaliser, ou demandez-moi un produit précis.`,
  it: v => `${v.intro} Più richiesti ora: ${v.list}. Tocchi una scheda per personalizzarla, oppure mi chieda un prodotto specifico.` };
T.notCarried = {
  en: v => `Sorry, we don't sell ${v.item} — we focus on wedding stationery and personalised gifts like invitations, place cards, mugs and tees. Want to see a few favourites?`,
  zh: v => `抱歉，我们不卖${v.item}。我们专注婚礼纸品和个性化礼品，比如邀请卡、席位卡、马克杯和 T 恤。要看看热门款吗？`,
  de: v => `Leider führen wir keine ${v.item} – wir sind auf Hochzeitspapeterie und personalisierte Geschenke spezialisiert, etwa Einladungen, Platzkarten, Tassen und T-Shirts. Soll ich Ihnen ein paar Favoriten zeigen?`,
  fr: v => `Désolé, nous ne vendons pas de ${v.item} — nous faisons de la papeterie de mariage et des cadeaux personnalisés : faire-part, marque-places, mugs, t-shirts. Voulez-vous voir quelques favoris ?`,
  it: v => `Ci dispiace, non vendiamo ${v.item} — ci occupiamo di cartoleria per matrimoni e regali personalizzati: inviti, segnaposto, tazze e t-shirt. Vuole vedere alcuni preferiti?` };
T.from = { en: "from ", zh: "", de: "ab ", fr: "dès ", it: "da " };
T.fromSuffix = { en: "", zh: " 起", de: "", fr: "", it: "" };
for (const [k, v] of Object.entries(T_FR_IT)) T[k] = { ...(T[k] || {}), ...v };

// ---- Natural phrasing (2026-11): short direct sentence first, cards/quote box carry the detail. ----
const AND = { en: " and ", de: " und ", fr: " et ", it: " e ", zh: "和" };
const joinList = (xs, lang) => xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(lang === "zh" ? "、" : ", ") + (AND[lang] || AND.en) + xs[xs.length - 1];
Object.assign(T.reco, {
  en: v => v.plan ? `For the stationery you'll usually want ${v.names} — they start at ${v.min}. Tap a card to personalise one, or tell me how many guests you have.` : `${v.budget ? `Within ${v.budget} a piece, ` : ""}${v.budget ? "guests" : "Guests"} love ${v.names}, starting at ${v.min}. Tap a card to personalise one — or tell me your budget and guest count.`,
  de: v => v.plan ? `Für die Papeterie brauchen Sie meist ${v.names} – ab ${v.min}. Tippen Sie auf eine Karte zum Gestalten, oder sagen Sie mir die Gästezahl.` : `${v.budget ? `Bis ${v.budget} pro Stück kommen ` : "Gut an kommen "}${v.names} – ab ${v.min}. Tippen Sie auf eine Karte zum Gestalten, oder nennen Sie mir Budget und Gästezahl.`,
  fr: v => v.plan ? `Pour la papeterie, il vous faut en général ${v.names} — à partir de ${v.min}. Touchez une carte pour personnaliser, ou dites-moi le nombre d'invités.` : `${v.budget ? `Jusqu'à ${v.budget} pièce, ` : ""}les invités adorent ${v.names}, dès ${v.min}. Touchez une carte pour personnaliser, ou donnez-moi votre budget.`,
  it: v => v.plan ? `Per la cartoleria di solito servono ${v.names} — a partire da ${v.min}. Tocchi una scheda per personalizzare, o mi dica quanti invitati avete.` : `${v.budget ? `Entro ${v.budget} al pezzo, ` : ""}gli invitati adorano ${v.names}, da ${v.min}. Tocchi una scheda per personalizzare, o mi dica il budget.`,
  zh: v => v.plan ? `婚礼纸品通常需要${v.names}，${v.min}起。点卡片即可定制，也可以告诉我宾客人数。` : `${v.budget ? `单价 ${v.budget} 以内，` : ""}推荐${v.names}，${v.min}起。点卡片即可定制，也可以告诉我预算和人数。` });
T.browseIntro = {
  en: "We make custom wedding stationery and personalised gifts — invitations, menus and place cards, plus mugs, tees and totes, all printed on demand.",
  de: "Wir fertigen individuelle Hochzeitspapeterie und personalisierte Geschenke – Einladungen, Menü- und Platzkarten, dazu Tassen, T-Shirts und Taschen, alles auf Bestellung gedruckt.",
  fr: "Nous créons de la papeterie de mariage et des cadeaux personnalisés — faire-part, menus, marque-places, mais aussi mugs, t-shirts et tote bags, imprimés à la demande.",
  it: "Realizziamo cartoleria per matrimoni e regali personalizzati — inviti, menù e segnaposto, oltre a tazze, t-shirt e borse, tutto stampato su richiesta.",
  zh: "我们做定制婚礼纸品和个性化礼品：邀请卡、菜单、席位卡，还有马克杯、T 恤和帆布袋，全部按需印制。" };
Object.assign(T.browse, {
  en: v => `${v.intro} A few favourites are below — tap one to personalise it, or ask me about any product.`,
  de: v => `${v.intro} Unten ein paar Favoriten – tippen Sie zum Gestalten, oder fragen Sie mich nach einem Produkt.`,
  fr: v => `${v.intro} Quelques favoris ci-dessous — touchez-en un pour le personnaliser, ou posez-moi une question.`,
  it: v => `${v.intro} Qui sotto alcuni preferiti — ne tocchi uno per personalizzarlo, o mi chieda di un prodotto.`,
  zh: v => `${v.intro}下面是几款热门，点击即可定制，也可以问我任何产品。` });
const QT = {
  en: { lead: v => v.qty > 1 ? `${v.qty} × ${v.product} to ${v.country} come to ${v.sub}.` : `One ${v.product} to ${v.country} is ${v.sub}.`, std: (p, d) => `Standard shipping is ${p}, arriving around ${d}`, exp: (p, d) => d ? `; express is ${p} (${d})` : `; express is ${p}`, free: "free", vat: r => ` VAT (${r}%) is added at checkout.`, next: " Shall I open it in the Studio?" },
  de: { lead: v => v.qty > 1 ? `${v.qty} × ${v.product} nach ${v.country} kosten ${v.sub}.` : `1 × ${v.product} nach ${v.country} kostet ${v.sub}.`, std: (p, d) => `Standardversand ${p}, Ankunft ca. ${d}`, exp: (p, d) => d ? `; Express ${p} (${d})` : `; Express ${p}`, free: "kostenlos", vat: r => ` Die MwSt. (${r} %) kommt an der Kasse dazu.`, next: " Soll ich es im Studio öffnen?" },
  fr: { lead: v => v.qty > 1 ? `${v.qty} × ${v.product} vers ${v.country} : ${v.sub}.` : `1 × ${v.product} vers ${v.country} : ${v.sub}.`, std: (p, d) => `Livraison standard ${p}, arrivée vers ${d}`, exp: (p, d) => d ? ` ; express ${p} (${d})` : ` ; express ${p}`, free: "gratuite", vat: r => ` La TVA (${r} %) est ajoutée au paiement.`, next: " Je l'ouvre dans le Studio ?" },
  it: { lead: v => v.qty > 1 ? `${v.qty} × ${v.product} verso ${v.country}: ${v.sub}.` : `1 × ${v.product} verso ${v.country}: ${v.sub}.`, std: (p, d) => `Spedizione standard ${p}, arrivo verso ${d}`, exp: (p, d) => d ? `; express ${p} (${d})` : `; express ${p}`, free: "gratuita", vat: r => ` L'IVA (${r}%) si aggiunge al checkout.`, next: " Lo apro nello Studio?" },
  zh: { lead: v => `${v.qty} 份${v.product}寄往${v.country}，商品共 ${v.sub}。`, std: (p, d) => `标准运费 ${p}，预计 ${d} 送达`, exp: (p, d) => d ? `；快递 ${p}（${d}）` : `；快递 ${p}`, free: "免费", vat: r => `结账时另加增值税 ${r}%。`, next: "要在设计室打开吗？" } };
/** Languages the chat detects (LANGS) and the languages with full reply templates (REPLY_LANGS; others fall back to English). */
export const DETECTED_LANGS = LANGS;
export const REPLY_LANGS = Object.keys(T.greet);
const L = (key, lang) => { const e = T[key]; return e[lang] ?? e.en; };
const CHIPS = {
  en: ["Shipping to Switzerland for 10 invitations", "Recommend wedding favours", "How long does delivery take?", "Track my order"],
  zh: ["10 份邀请卡寄到瑞士运费多少", "推荐婚礼伴手礼", "多久能送达？", "查询我的订单"],
  de: ["Versand in die Schweiz für 10 Einladungen", "Gastgeschenke empfehlen", "Wie lange dauert die Lieferung?", "Meine Bestellung verfolgen"]
};
Object.assign(CHIPS, CHIPS_FR_IT);
const PRODUCT_CHIPS = { en: ["Invitations", "Menu cards", "Place cards", "Welcome sign"], zh: ["邀请卡", "菜单卡", "席位卡", "迎宾牌"], de: ["Einladungen", "Menükarten", "Platzkarten", "Willkommensschild"], ...PRODUCT_CHIPS_FR_IT };
const COUNTRY_CHIPS = { en: ["Switzerland", "Germany", "Austria", "France"], zh: ["瑞士", "德国", "奥地利", "法国"], de: ["Schweiz", "Deutschland", "Österreich", "Frankreich"], ...COUNTRY_CHIPS_FR_IT };
const HUMAN_CHIP = { en: "Talk to a person", zh: "转人工", de: "Mit einem Menschen sprechen", ...HUMAN_CHIP_FR_IT };
const chips = (lang, list) => ({ type: "chips", items: list || CHIPS[lang] || CHIPS.en });

/** Deterministic responder: same tools, rule-based routing. Used without an LLM key and as fallback on LLM errors. */
async function ruleAnswer(ctx, cls, text, tools) {
  const { lang, conv, settings } = ctx, s = conv.slots, f = ctx.facts;
  const vatLine = q => (q.prices_include_vat ? L("vatIn", lang)() : L("vatEx", lang)(q.vat_rate || 0));
  const product = cls.products[0] || null;
  if (product) s.product = product;
  if (cls.quantity) s.quantity = cls.quantity;
  if (cls.country) s.country = cls.country;
  if (cls.email) s.email = cls.email;
  if (cls.order_number) s.order_number = cls.order_number;
  let intent = cls.intent;
  // Follow-ups: "and to Germany?" after a quote, an e-mail after we asked for it, a bare product after "which product?".
  if (["other", "contact_info", "product_question", "price"].includes(intent) && s.pending === "quote" && (cls.country || cls.quantity || product)) intent = "shipping_quote";
  if ((intent === "other" || intent === "contact_info") && s.pending === "order_email" && cls.email) intent = "order_status";
  if (intent === "other" && s.pending === "order_number" && cls.order_number) intent = "order_status";
  if (intent === "other" && s.pending === "tracking" && /[A-Z0-9]{6,}/i.test(text)) { cls.tracking_number = text.trim().split(/\s+/).pop(); intent = "tracking"; }
  // Context follow-ups on the product we are talking about: "and in blue?", "which sizes?", "what about 50?", "how long for that?"
  const bareQty = text.match(/^\s*(?:and|what about|how about|und|et|e|y|oder|ou|o|per|pour|für|for)?\s*(?:for\s+|für\s+|pour\s+|per\s+)?(\d{1,5})\s*(?:pcs|pieces?|stück|stk|pezzi|pièces|个|件|份|张|只)?\s*(?:呢|吗)?\s*[?？]?\s*$/i);
  if (s.product && s.pending !== "quote" && bareQty) { cls.quantity = s.quantity = Number(bareQty[1]); intent = "price"; }
  if (s.product && (intent === "other" || intent === "product_attr") && !product && COLOR_RE.test(text)) { intent = "product_attr"; cls.attr = "colors"; cls.color_word = (text.match(COLOR_RE) || [])[0]; }
  else if (intent === "product_attr" && COLOR_RE.test(text)) cls.color_word = (text.match(COLOR_RE) || [])[0];
  if (intent === "other" && /\b(clothing|apparel|textile)\b/i.test(text)) intent = "browse";
  // Ambiguous "cards / Karten / cartes / biglietti / 卡片" without a specific product → ask which ones.
  if (!product && ["other", "price", "product_question"].includes(intent) && /\b(cards?|karten?|cartes?|biglietti)\b|卡片/i.test(text) && !/(credit|kredit|crédit|credito|gift card|geschenkkarte|信用卡)/i.test(text)) {
    s.pending = null; ctx.ui.push(chips(lang, CARD_CHIPS[lang] || CARD_CHIPS.en)); return clarifyCards(lang);
  }
  s.pending = null;
  const seed = `${conv.id}:${conv.messages.length}`;
  const kb = async (id, extra = {}) => { const e = await knowledgeEntry(ctx.tenantId, id, lang); return e ? kbReply([e], text, { lang, seed, ...extra }) : L("unknown", lang); };

  switch (intent) {
    case "greeting": ctx.ui.push(chips(lang)); return (settings.greeting?.[lang] || L("greet", lang));
    case "thanks": return L("thanks", lang);
    case "shipping_quote": {
      if (!s.product) { s.pending = "quote"; ctx.ui.push(chips(lang, PRODUCT_CHIPS[lang] || PRODUCT_CHIPS.en)); return L("askProduct", lang); }
      const cc = s.country || null;
      if (!cc) { s.pending = "quote"; ctx.ui.push(chips(lang, COUNTRY_CHIPS[lang] || COUNTRY_CHIPS.en)); return L("askCountry", lang); }
      const q = await tools.execute("quote_shipping", { product: s.product, quantity: s.quantity || 1, country: cc });
      if (!q.ok) return q.error === "no_shipping_to_country" ? L("noShip", lang)(cname(cc, lang)) : L("unknown", lang);
      s.pending = "quote";
      const Q = QT[lang] || QT.en, range = o => `${fmtDate(o.arrives_from, lang)}–${fmtDate(o.arrives_to, lang)}`;
      const std = q.shipping_options.find(o => !/express/i.test(o.label)) || q.shipping_options[0], exp = q.shipping_options.find(o => o !== std);
      const price = o => (o.free ? Q.free : money(q.currency, o.price));
      let out = Q.lead({ qty: q.quantity, product: q.product, country: cname(q.country, lang), sub: money(q.currency, q.subtotal) }) + (lang === "zh" ? "" : " ");
      if (std) out += Q.std(price(std), range(std)) + (exp ? Q.exp(price(exp), range(exp) === range(std) ? "" : range(exp)) : "") + (lang === "zh" ? "。" : ".");
      if (!q.prices_include_vat && Number(q.vat_rate) > 0) out += Q.vat((q.vat_rate * 100).toFixed(1).replace(/\.0$/, ""));
      ctx.ui.push(chips(lang, nextChips("quote", lang, q.product)));
      return out + Q.next;
    }
    case "price": case "product_question": {
      const p = resolveProduct(product || s.product);
      if (!p) { const hits = await searchKnowledge(ctx.tenantId, text, lang, { custom: settings.custom_faq }); if (hits.length && hits[0].score >= 2) return kbReply(hits, text, { lang, seed }); s.pending = "quote_product"; ctx.ui.push(chips(lang, PRODUCT_CHIPS[lang] || PRODUCT_CHIPS.en)); return L("askProduct", lang); }
      s.product = p.id;
      const qty = Number(cls.quantity || 0) > 1 ? Number(cls.quantity) : null;
      const r = await tools.execute("get_product", { product: p.id, quantity: qty || 1, country: s.country || ctx.countryHint || "CH" });
      if (!r.ok) return L("unknown", lang);
      const tiers = r.product.price_tiers.filter((t, i, a) => i === 0 || t.unit_price < a[i - 1].unit_price);
      const at = qty ? [...r.product.price_tiers].reverse().find(t => t.min_qty <= qty) || r.product.price_tiers[0] : null;
      const yes = /(do you (have|sell|make|offer|carry|do)|have you got|habt ihr|haben sie|gibt es|avez-vous|vous (avez|faites|proposez)|avete|fate|有.*吗|有没有|有卖)/i.test(text);
      ctx.ui.push(chips(lang, nextChips("product", lang, r.product.name)));
      return productReply({ ...r.product, price_tiers: tiers }, { lang, seed, inclVat: f.prices_include_vat, qty, unitAtQty: at?.unit_price, cur: at?.currency, yes });
    }
    case "product_attr": {
      const p = resolveProduct(product || s.product);
      if (!p) { s.pending = "attr"; ctx.ui.push(chips(lang, PRODUCT_CHIPS[lang] || PRODUCT_CHIPS.en)); return { en: "Sure — which product would you like to know about?", de: "Gerne – um welches Produkt geht es?", fr: "Bien sûr — de quel produit s'agit-il ?", it: "Certo — di quale prodotto si tratta?", zh: "好的，请问是哪款产品？" }[lang] || "Which product?"; }
      s.product = p.id;
      const r = await tools.execute("get_product", { product: p.id, country: s.country || ctx.countryHint || "CH" });
      if (!r.ok) return L("unknown", lang);
      const kind = cls.attr || attrKind(text) || "material";
      ctx.ui.push(chips(lang, nextChips("product", lang, r.product.name)));
      return attrReply(kind, productById(p.id) || {}, r.product, { lang, seed, colorWord: cls.color_word }) || L("unknown", lang);
    }
    case "eco": {
      const p = resolveProduct(product || s.product), raw = p && productById(p.id);
      if (raw?.eco_tags?.length) { const r = await tools.execute("get_product", { product: p.id, country: s.country || ctx.countryHint || "CH" }); if (r.ok) return attrReply("eco", raw, r.product, { lang, seed }); }
      ctx.ui.push(chips(lang, nextChips("browse", lang)));
      return kb("eco");
    }
    case "ships_from": ctx.ui.push(chips(lang, nextChips("delivery", lang))); return kb("ships_from", { followUp: false });
    case "recommendation": {
      const r = await tools.execute("recommend_products", { occasion: text, budget: cls.budget, quantity: s.quantity, country: s.country || ctx.countryHint || "CH" });
      if (!r.ok) return L("recoNone", lang);
      const cur = r.products[0]?.currency || "";
      const minP = r.products.reduce((m, p) => (p.unit_price < m.unit_price ? p : m), r.products[0]);
      return L("reco", lang)({ plan: /(stationery|papeterie|cancelleria|纸品|need|brauche|besoin|serve|准备)/i.test(text), n: r.products.length, budget: cls.budget ? `${cur} ${cls.budget}` : "", names: joinList(r.products.map(p => p.name), lang), min: money(minP.currency, minP.unit_price) });
    }
    case "order_status": {
      if (!s.order_number) { if (cls.tracking_number) return ruleAnswer(ctx, { ...cls, intent: "tracking" }, text, tools); s.pending = "order_number"; return L("askOrder", lang); }
      if (!s.email) { s.pending = "order_email"; return L("askEmail", lang)(s.order_number); }
      const r = await tools.execute("find_order", { order_number: s.order_number, email: s.email });
      const no = s.order_number; s.order_number = null;
      if (!r.ok) return r.error === "too_many_attempts" ? L("tooMany", lang) : L("notFound", lang);
      const o = r.order, st = (T.stage[lang] || T.stage.en)[o.stage] || o.stage;
      const eta = o.delivery_estimate ? `${fmtDate(o.delivery_estimate.from, lang)}–${fmtDate(o.delivery_estimate.to, lang)}` : "";
      const tr = o.tracking ? L("trackLine", lang)({ carrier: o.tracking.carrier, status: o.tracking.status_label?.[lang === "zh" ? "zh" : "en"] || o.tracking.status || "—", last: o.tracking.last_event?.text || "", url: o.tracking.url }) : "";
      return L("order", lang)({ id: o.id || no, stage: st, eta, track: tr });
    }
    case "tracking": {
      if (!cls.tracking_number) { if (s.order_number) return ruleAnswer(ctx, { ...cls, intent: "order_status" }, text, tools); s.pending = "tracking"; return L("askTracking", lang); }
      const r = await tools.execute("get_tracking", { tracking_number: cls.tracking_number });
      if (!r.ok) return r.error === "invalid_tracking_number" ? L("trackInvalid", lang) : L("trackNotFound", lang)(cls.tracking_number);
      return L("trackLine", lang)({ carrier: r.carrier, status: r.status, last: [r.last_event?.text, r.last_event?.location].filter(Boolean).join(", "), url: r.url });
    }
    case "discount": {
      const code = (text.match(/\b(?:code|gutschein|coupon|promo|优惠码)\s*[:：]?\s*([A-Z0-9][A-Z0-9_-]{2,31})\b/i) || text.match(/\b([A-Z][A-Z0-9]*\d[A-Z0-9_-]*)\b/) || [])[1];
      if (code && !/^(VAT|CHF|EUR|USD)$/i.test(code)) {
        const r = await tools.execute("check_discount_code", { code });
        if (r.ok && r.valid) return L("codeOk", lang)({ code: r.code, value: r.value, min: r.min_order?.CHF ? `CHF ${r.min_order.CHF}` : r.min_order?.EUR ? `EUR ${r.min_order.EUR}` : "", exp: r.expires_at ? fmtDate(r.expires_at.slice(0, 10), lang) : "" });
        if (r.ok) return L("codeBad", lang)(r.code);
      }
      if (HESITATION_RE.test(text) && settings.sales_discount?.enabled && s.email) {
        const r = await tools.execute("issue_discount", { email: s.email, reason: "price hesitation" });
        if (r.ok) return L("issued", lang)({ code: r.code, value: r.value, exp: fmtDate(r.expires_at.slice(0, 10), lang) });
      }
      let example = "";
      const p = resolveProduct(s.product || "invitation");
      if (p) { const g = await tools.execute("get_product", { product: p.id, country: s.country || ctx.countryHint || "CH" }); ctx.ui.length = 0;
        if (g.ok) { const a = g.product.price_tiers[0], b = g.product.price_tiers.find(t => t.min_qty === 50) || g.product.price_tiers.at(-1); if (b && b.unit_price < a.unit_price) example = `${g.product.name}: ${L("tier", lang)(a)} → ${L("tier", lang)(b)}`; } }
      return L("discount", lang)(example);
    }
    case "delivery_time": {
      if (s.product && s.country) { const q = await tools.execute("quote_shipping", { product: s.product, quantity: s.quantity || 1, country: s.country });
        if (q.ok) { const o = q.shipping_options; s.pending = "quote"; const head = { en: `${q.quantity} × ${q.product} to ${cname(q.country, lang)}: `, zh: `${q.quantity} 份${q.product}寄往${cname(q.country, lang)}：`, de: `${q.quantity} × ${q.product} nach ${cname(q.country, lang)}: `, fr: `${q.quantity} × ${q.product} vers ${cname(q.country, lang)} : `, it: `${q.quantity} × ${q.product} verso ${cname(q.country, lang)}: ` }[lang] || `${q.quantity} × ${q.product} → ${q.country}: `;
          return head + o.map(x => L("opt", lang)({ ...x, cur: q.currency, from: fmtDate(x.arrives_from, lang), to: fmtDate(x.arrives_to, lang) })).join("; "); } }
      ctx.ui.push(chips(lang, nextChips("delivery", lang)));
      const pp = s.product && productById(s.product);
      return deliveryReply(f, { lang, productName: pp ? (pp.name?.[lang] || pp.name?.en) : null });
    }
    case "browse": {
      // "What do you sell?" in any language: short catalogue overview + a few product cards from the live catalogue.
      const intro = L("browseIntro", lang);
      const r = await tools.execute("recommend_products", { occasion: "wedding", country: s.country || ctx.countryHint || "CH", limit: 4 });
      ctx.ui.push(chips(lang, nextChips("browse", lang)));
      if (!r.ok) return intro;
      return L("browse", lang)({ intro, list: r.products.map(p => `${p.name} (${L("from", lang)}${money(p.currency, p.unit_price)}${L("fromSuffix", lang)})`).join(lang === "zh" ? "、" : ", ") });
    }
    case "unknown_product": {
      // "Do you offer free shipping?" / "Can I order a sample?" look like product questions — a strong knowledge hit wins.
      const hits = await searchKnowledge(ctx.tenantId, text, lang, { custom: settings.custom_faq });
      if (hits.length && hits[0].score >= 4.5 && hits[0].id !== "what_we_sell") { ctx.ui.push(chips(lang, nextChips("browse", lang))); return kbReply(hits, text, { lang, seed }); }
      // "Do you sell sofas? / Avete divani? / 有沙发吗" for something that is not in the catalogue: say so, offer what we do sell.
      ctx.ui.push(chips(lang, nextChips("browse", lang)));
      return L("notCarried", lang)({ item: String(cls.asked_product || "").replace(/[<>]/g, "").slice(0, 40) });
    }
    case "return_request": ctx.ui.push(chips(lang, nextChips("policy", lang))); return kb("returns", { maxSentences: 3 });
    case "cancel_or_change": ctx.ui.push(chips(lang, nextChips("policy", lang))); return kb("cancel");
    case "customs": ctx.ui.push(chips(lang, nextChips("policy", lang))); return kb("customs");
    case "vat": ctx.ui.push(chips(lang, nextChips("policy", lang))); return kb("vat");
    case "payment": ctx.ui.push(chips(lang, nextChips("policy", lang))); return kb("payment", { followUp: false });
    case "proof": ctx.ui.push(chips(lang, nextChips("delivery", lang))); return kb("proof");
    case "website": return kb("website");
    default: {
      const hits = await searchKnowledge(ctx.tenantId, text, lang, { custom: settings.custom_faq });
      if (hits.length && hits[0].score >= 2.5) { ctx.ui.push(chips(lang, nextChips(["contact", "returns", "cancel", "customs", "vat", "payment"].includes(hits[0].id) ? "policy" : "browse", lang))); return kbReply(hits, text, { lang, seed }); }
      ctx.unanswered = true;
      ctx.ui.push(chips(lang, [...(CHIPS[lang] || CHIPS.en).slice(0, 3), HUMAN_CHIP[lang] || HUMAN_CHIP.en]));
      return dontKnow(lang, seed);
    }
  }
}

/**
 * Handle one customer chat message.
 * input: { message, conversation_id?, lang? (UI language), country? (visitor market country), page? }
 * Returns { answer, reply, conversation_id, language, intent, ui, handoff, mode, tools_used }.
 */
export async function handleChat({ tenantId = "tenant_demo", message, conversation_id, lang: uiLang, country, page } = {}) {
  const settings = await getSettings(tenantId);
  const hint = LANGS.includes(String(uiLang || "").slice(0, 2)) ? String(uiLang).slice(0, 2) : "en";
  let text = String(message || "").trim().slice(0, 1000);
  const llm = llmStatus();
  if (!text) return { answer: "", reply: "", skipped: "empty_message", ui: [] };
  if (!settings.enabled) return { answer: L("disabled", hint), reply: L("disabled", hint), ui: [], mode: "disabled" };
  const conv = await findOrCreateConversation(tenantId, conversation_id, { lang: hint, page: page ? String(page).slice(0, 200) : null });
  const ctx = { tenantId, settings, conv, ui: [], toolLog: [], llm, countryHint: /^[A-Z]{2}$/.test(String(country || "")) ? String(country) : null, handoff: null, unanswered: false };
  const lang = /^[\s\S]{0,6}$/.test(text) && !/[\u3400-\u9fff]/.test(text) ? (conv.language || hint) : detectLanguage(text, conv.language || hint);
  ctx.lang = conv.language = lang;
  const out = (answer, extra = {}) => ({ answer, reply: answer, conversation_id: conv.id, language: lang, ui: ctx.ui, mode: extra.mode || llm.mode, handoff: ctx.handoff, tools_used: ctx.toolLog.map(t => t.name), ...extra });
  const finish = async (answer, extra = {}) => {
    if (extra.answered_by) { conv.paths = conv.paths || {}; conv.paths[extra.answered_by] = (conv.paths[extra.answered_by] || 0) + 1; }
    conv.messages.push({ role: "assistant", text: answer, at: new Date().toISOString(), ...(extra.intent ? { intent: extra.intent } : {}), ...(extra.answered_by ? { answered_by: extra.answered_by, route: extra.route?.reason, confidence: extra.route?.confidence } : {}), ...(ctx.unanswered ? { unanswered: true } : {}), ...(ctx.toolLog.length ? { tools: ctx.toolLog.map(t => t.name) } : {}) });
    if (extra.intent) conv.intents[extra.intent] = (conv.intents[extra.intent] || 0) + 1;
    if (ctx.unanswered) conv.unanswered = (conv.unanswered || 0) + 1;
    // One chip row per answer: merge rows, drop duplicates, keep at most 4 suggestions.
    const rows = ctx.ui.filter(u => u.type === "chips");
    if (rows.length > 1) { const seen = new Set(), items = rows.flatMap(r => r.items).filter(c => { const k = typeof c === "string" ? c : c.label || JSON.stringify(c); return seen.has(k) ? false : seen.add(k); }); const first = ctx.ui.indexOf(rows[0]); rows.forEach(r => ctx.ui.splice(ctx.ui.indexOf(r), 1)); ctx.ui.splice(first, 0, { type: "chips", items: items.slice(0, 4) }); }
    const message_index = conv.messages.length - 1;
    await saveConversation(conv);
    return out(answer, { ...extra, message_index: Math.min(message_index, conv.messages.length - 1) });
  };

  // ③ per-chat rate limit (POD Agent: web chat max messages per 10 minutes)
  if (recentUserMessages(conv, 10) >= settings.max_messages_per_10min) return out(L("rate", lang), { rate_limited: true });
  // ④ refuse payment data (never stored) and prompt injection
  if (containsPaymentData(text)) { conv.messages.push({ role: "user", text: "[message with payment data removed]", at: new Date().toISOString() }); ctx.ui.push(chips(lang)); return finish(paymentDataMessage(lang), { intent: "payment_data", guardrail: "payment_data", answered_by: "local", route: { path: "local", reason: "guardrail", confidence: 1 } }); }
  text = redact(text);
  conv.messages.push({ role: "user", text, at: new Date().toISOString() });
  if (INJECTION_RE.test(text)) { ctx.ui.push(chips(lang)); return finish(injectionMessage(lang), { intent: "injection", guardrail: "prompt_injection", answered_by: "local", route: { path: "local", reason: "guardrail", confidence: 1 } }); }

  // ⑤ already with the team → add the message to the handoff, AI stays quiet
  const typo = fixTypos(text);
  const cls = classifyRules(typo.text, { hint: lang });
  if (typo.fixes.length) { cls.email = extractEmail(text); cls.order_number = extractOrderNumber(text); cls.tracking_number = extractTracking(text); cls.typo_fixes = typo.fixes; }
  if (conv.status === "handed_off") {
    await appendToHandoff(conv, { text, email: cls.email });
    if (cls.email) conv.slots.email = cls.email;
    ctx.handoff = "pending";
    return finish(cls.email ? L("emailNoted", lang) : L("muted", lang), { intent: "muted", muted: true, answered_by: "local", route: { path: "local", reason: "with_team", confidence: 1 } });
  }

  try {
    ctx.facts = await shopFacts(tenantId);
    const followUp = !!(conv.slots?.pending && (cls.country || cls.quantity || cls.products?.length || cls.email || cls.order_number || (conv.slots.pending === "tracking" && /[A-Z0-9]{6,}/i.test(text))));
    let merged = { ...cls, emotion: "calm", wants_human: false, abusive: false, threat: false, unresolved_followup: UNRESOLVED_RE.test(text), price_hesitation: HESITATION_RE.test(text) };
    conv.failed_count = merged.unresolved_followup ? (conv.failed_count || 0) + 1 : 0;

    // ⑦ guardrails before any answer → handoff queue (Admin), holding message, ask for e-mail when unknown
    const handoffIf = async m => {
      const hand = handoffCheck({ failedAnswersBeforeHandoff: settings.failed_answers_before_handoff, maxTokensPerConversation: settings.max_tokens_per_conversation }, m, { ...conv, failed_count: conv.failed_count - (m.unresolved_followup ? 1 : 0) }, text);
      if (!hand) return null;
      if (cls.email) conv.slots.email = cls.email;
      const h = await createHandoff(tenantId, conv, { reason: hand.reason, summary: `Intent: ${m.intent}, emotion: ${m.emotion}.`, email: cls.email, order_number: cls.order_number });
      ctx.handoff = h.reason;
      return finish(holdingMessage({ humanReplyHours: settings.human_reply_hours }, lang, { needEmail: !h.customer_email }), { intent: "handoff", answered_by: "local", route: { path: "local", reason: "handoff", confidence: 1 } });
    };
    const early = await handoffIf(merged); if (early) return early;

    // ⑧ route: local (rules + shop data) unless the question is complex / unmatched
    const kb = cls.intent === "other" && !followUp ? await searchKnowledge(tenantId, text, lang, { custom: settings.custom_faq }) : [];
    const route = decideRoute({ cls, text, kbScore: kb[0]?.score || 0, followUp });
    const tools = createTools(ctx);
    const local = async (extraReason) => {
      const answer = await ruleAnswer(ctx, merged, text, tools);
      const r = { ...route, path: "local", ...(extraReason ? { reason: `${route.reason}|${extraReason}` } : {}) };
      return { answer, route: r };
    };
    if (route.path === "local") {
      const l = await local();
      if (!(ctx.unanswered && llm.available)) return finish(l.answer, { intent: merged.intent, mode: "rules", answered_by: "local", route: l.route });
      // rules found nothing → let the model try (knowledge-grounded)
      ctx.unanswered = false; ctx.ui.length = 0; route.reason = `${route.reason}|rules_unanswered`; route.path = "llm";
    }
    if (!llm.available) {
      // No key: best rule-based answer + offer a person.
      const l = await local("no_llm_key");
      // Local-only mode: the composed answer stands on its own; a "talk to a person" chip is offered without extra text.
      if (!ctx.unanswered && !ctx.ui.some(u => u.type === "chips" && u.items?.some(c => (c.label || c) === (HUMAN_CHIP[lang] || HUMAN_CHIP.en)))) ctx.ui.push(chips(lang, [HUMAN_CHIP[lang] || HUMAN_CHIP.en]));
      return finish(l.answer, { intent: merged.intent, mode: "rules", answered_by: "local", route: l.route });
    }
    try {
      if (llm.tool_calling) {
        const recent = conv.messages.slice(-5, -1).map(m => `${m.role}: ${String(m.text).slice(0, 300)}`).join("\n");
        try {
          const { data, tokens } = await chatJson({ system: CLASSIFIER_SYSTEM, user: `${recent ? `Recent conversation:\n${recent}\n\n` : ""}New customer message:\n${text}` });
          conv.total_tokens += tokens || 0;
          if (data) merged = { ...merged, ...Object.fromEntries(Object.entries(data).filter(([k]) => ["emotion", "wants_human", "abusive", "threat", "unresolved_followup", "price_hesitation"].includes(k))), intent: cls.intent === "other" && data.intent ? data.intent : cls.intent };
        } catch { /* classifier optional */ }
        const late = await handoffIf(merged); if (late) return late;
        const history = conv.messages.slice(-11, -1).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
        const r = await runToolLoop({ messages: [{ role: "system", content: systemPrompt({ facts: ctx.facts, conv, lang, countryHint: ctx.countryHint, canIssueDiscount: !!settings.sales_discount?.enabled }) }, ...history, { role: "user", content: text }],
          tools: tools.definitions, executeTool: tools.execute, maxToolCalls: 4 });
        conv.total_tokens += r.tokens || 0;
        if (r.text) return finish(r.text, { intent: merged.intent, mode: "llm_tools", answered_by: "llm", route: { ...route, path: "llm" } });
      } else {
        const hits = kb.length ? kb : await searchKnowledge(tenantId, text, lang, { custom: settings.custom_faq });
        const sys = `${systemPrompt({ facts: ctx.facts, conv, lang, countryHint: ctx.countryHint, canIssueDiscount: false })}\n\nKNOWLEDGE (use only this):\n${hits.map(h => `- ${h.question} ${h.answer}`).join("\n") || "- (no match)"}\nIf the knowledge does not answer it, say you will check with the team.`;
        const a = await answerOpenQuestion({ system: sys, user: text });
        if (a) return finish(a, { intent: merged.intent, mode: "llm_answers", answered_by: "llm", route: { ...route, path: "llm" } });
      }
      throw new Error("empty_llm_answer");
    } catch (e) {
      ctx.llmError = e.message; ctx.ui.length = 0; ctx.toolLog.length = 0;
      const l = await local("llm_error");
      return finish(l.answer, { intent: merged.intent, mode: "rules_fallback", answered_by: "local", route: l.route });
    }
  } catch (e) {
    console.error("[pod-agent] chat failed:", e.message);
    return finish(errorMessage(lang), { intent: "error", error: true });
  }
}
