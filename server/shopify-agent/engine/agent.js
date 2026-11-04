// Pod.AI copy of the POD.AI Agent engine (server/pod-agent/customer). Pod.AI-only: edit here, never the site agent.
// Customer chat main flow — port of the POD Agent handleMessage (agent.js) onto our store:
//  ① validate + redact  ② conversation (agent_conversations)  ③ per-chat rate limit  ④ injection / payment-data refusal
//  ⑤ handed-off chats stay with the team  ⑥ classify (rules; LLM classifier only on the LLM path)  ⑦ guardrails → handoff queue
//  ⑧ route (router.js): local rule engine + shop data first; LLM only for complex / unmatched questions when a key exists  ⑨ store + stats (answered_by)
import { classifyRules, detectLanguage } from "./nlu.js";
import { handoffCheck, holdingMessage, errorMessage, injectionMessage, paymentDataMessage, INJECTION_RE, containsPaymentData, redact } from "./guardrails.js";
import { getSettings, findOrCreateConversation, saveConversation, recentUserMessages, createHandoff, appendToHandoff } from "./store.js";
import { llmStatus, runToolLoop, chatJson, answerOpenQuestion } from "./llm.js";
import { CLASSIFIER_SYSTEM } from "./prompts.js";
import { decideRoute } from "./router.js";

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
const cname = (cc, lang) => (COUNTRY_LABEL[lang] || COUNTRY_LABEL.en)[cc] || cc;

// ---- Reply templates (EN / ZH / DE; FR / IT fall back to EN) ----
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
/** Languages the chat detects (LANGS) and the languages with full reply templates (REPLY_LANGS; others fall back to English). */
export const DETECTED_LANGS = LANGS;
export const REPLY_LANGS = Object.keys(T.greet);
// Pod.AI: FR / IT for the engine messages the shop app uses
Object.assign(T.muted, { fr: "Votre demande est entre les mains de notre équipe — réponse bientôt. J'ai ajouté votre message.", it: "La sua richiesta è presso il nostro team — risponderà presto. Ho aggiunto il suo messaggio." });
Object.assign(T.emailNoted, { fr: "Merci — j'ai ajouté votre e-mail pour que l'équipe puisse répondre.", it: "Grazie — ho aggiunto la sua e-mail così il team può rispondere." });
Object.assign(T.rate, { fr: "Vous avez envoyé beaucoup de messages. Patientez un instant.", it: "Ha inviato molti messaggi. Attenda un momento." });
Object.assign(T.disabled, { fr: "L'assistant est hors ligne pour le moment. Réessayez plus tard.", it: "L'assistente è offline al momento. Riprovi più tardi." });
Object.assign(T.thanks, { fr: "Avec plaisir ! Autre chose ?", it: "Prego! Posso aiutarla in altro?" });
const L = (key, lang) => { const e = T[key]; return e[lang] || e.en; };
const CHIPS = {
  en: ["Shipping to Switzerland for 10 invitations", "Recommend wedding favours", "How long does delivery take?", "Track my order"],
  zh: ["10 份邀请卡寄到瑞士运费多少", "推荐婚礼伴手礼", "多久能送达？", "查询我的订单"],
  de: ["Versand in die Schweiz für 10 Einladungen", "Gastgeschenke empfehlen", "Wie lange dauert die Lieferung?", "Meine Bestellung verfolgen"]
};
const maskEmail = e => { const [u, d] = String(e || "").split("@"); return d ? `${u.slice(0, 1)}***@${d}` : null; };
const chips = (lang, list) => ({ type: "chips", items: list || CHIPS[lang] || CHIPS.en });

/** Deterministic responder: same tools, rule-based routing. Used without an LLM key and as fallback on LLM errors. */
// Pod.AI: the rule answers come from the shop profile (server/shopify-agent/profile.js).

/**
 * Handle one customer chat message.
 * input: { message, conversation_id?, lang? (UI language), country? (visitor market country), page? }
 * Returns { answer, reply, conversation_id, language, intent, ui, handoff, mode, tools_used }.
 */
export async function handleChat({ tenantId = "tenant_demo", message, conversation_id, lang: uiLang, country, page, profile } = {}) {
  const settings = await getSettings(tenantId);
  const hint = LANGS.includes(String(uiLang || "").slice(0, 2)) ? String(uiLang).slice(0, 2) : "en";
  let text = String(message || "").trim().slice(0, 1000);
  // Pod.AI admin switch: LLM off → rules + shop data only
  const llm = settings.llm_enabled === false ? { ...llmStatus(), available: false, mode: "rules" } : llmStatus();
  if (!text) return { answer: "", reply: "", skipped: "empty_message", ui: [] };
  if (!settings.enabled) return { answer: L("disabled", hint), reply: L("disabled", hint), ui: [], mode: "disabled" };
  const conv = await findOrCreateConversation(tenantId, conversation_id, { lang: hint, page: page ? String(page).slice(0, 200) : null });
  const ctx = { tenantId, settings, conv, ui: [], toolLog: [], llm, countryHint: /^[A-Z]{2}$/.test(String(country || "")) ? String(country) : null, handoff: null, unanswered: false, profile };
  const lang = /^[\s\S]{0,6}$/.test(text) && !/[\u3400-\u9fff]/.test(text) ? (conv.language || hint) : detectLanguage(text, conv.language || hint);
  ctx.lang = conv.language = lang;
  const out = (answer, extra = {}) => ({ answer, reply: answer, conversation_id: conv.id, language: lang, ui: ctx.ui, mode: extra.mode || llm.mode, handoff: ctx.handoff, tools_used: ctx.toolLog.map(t => t.name), ...extra });
  const finish = async (answer, extra = {}) => {
    if (extra.answered_by) { conv.paths = conv.paths || {}; conv.paths[extra.answered_by] = (conv.paths[extra.answered_by] || 0) + 1; }
    conv.messages.push({ role: "assistant", text: answer, at: new Date().toISOString(), ...(extra.intent ? { intent: extra.intent } : {}), ...(extra.answered_by ? { answered_by: extra.answered_by, route: extra.route?.reason, confidence: extra.route?.confidence } : {}), ...(ctx.unanswered ? { unanswered: true } : {}), ...(ctx.toolLog.length ? { tools: ctx.toolLog.map(t => t.name) } : {}) });
    if (extra.intent) conv.intents[extra.intent] = (conv.intents[extra.intent] || 0) + 1;
    if (ctx.unanswered) conv.unanswered = (conv.unanswered || 0) + 1;
    const message_index = conv.messages.length - 1;
    await saveConversation(conv);
    return out(answer, { ...extra, message_index: Math.min(message_index, conv.messages.length - 1) });
  };

  // ③ per-chat rate limit (POD Agent: web chat max messages per 10 minutes)
  if (recentUserMessages(conv, 10) >= settings.max_messages_per_10min) return out(L("rate", lang), { rate_limited: true });
  // ④ refuse payment data (never stored) and prompt injection
  if (containsPaymentData(text)) { conv.messages.push({ role: "user", text: "[message with payment data removed]", at: new Date().toISOString() }); return finish(paymentDataMessage(lang), { intent: "payment_data", guardrail: "payment_data", answered_by: "local", route: { path: "local", reason: "guardrail", confidence: 1 } }); }
  text = redact(text);
  conv.messages.push({ role: "user", text, at: new Date().toISOString() });
  if (INJECTION_RE.test(text)) return finish(injectionMessage(lang), { intent: "injection", guardrail: "prompt_injection", answered_by: "local", route: { path: "local", reason: "guardrail", confidence: 1 } });

  // ⑤ already with the team → add the message to the handoff, AI stays quiet
  const cls = classifyRules(text, { hint: lang });
  if (conv.status === "handed_off") {
    await appendToHandoff(conv, { text, email: cls.email });
    if (cls.email) conv.slots.email = cls.email;
    ctx.handoff = "pending";
    if (cls.email) ctx.ui.push({ type: "handoff", email: maskEmail(cls.email) });
    return finish(cls.email ? L("emailNoted", lang) : L("muted", lang), { intent: "muted", muted: true, answered_by: "local", route: { path: "local", reason: "with_team", confidence: 1 } });
  }

  try {
    ctx.facts = await profile.facts(ctx);
    const followUp = !!(conv.slots?.pending && (cls.country || cls.quantity || cls.products?.length || cls.email || cls.order_number || (conv.slots.pending === "tracking" && /[A-Z0-9]{6,}/i.test(text))));
    let merged = { ...cls, emotion: "calm", wants_human: false, abusive: false, threat: false, unresolved_followup: UNRESOLVED_RE.test(text), price_hesitation: HESITATION_RE.test(text) };
    conv.failed_count = merged.unresolved_followup ? (conv.failed_count || 0) + 1 : 0;

    // ⑦ guardrails before any answer → handoff queue (Admin), holding message, ask for e-mail when unknown
    const handoffIf = async m => {
      const hand = handoffCheck({ failedAnswersBeforeHandoff: settings.failed_answers_before_handoff, maxTokensPerConversation: settings.max_tokens_per_conversation }, m, { ...conv, failed_count: conv.failed_count - (m.unresolved_followup ? 1 : 0) }, text);
      if (!hand) return null;
      if (cls.email) conv.slots.email = cls.email;
      const h = await createHandoff(tenantId, conv, { reason: hand.reason, summary: `Intent: ${m.intent}, emotion: ${m.emotion}.`, email: cls.email || conv.slots?.email || null, order_number: cls.order_number || conv.slots?.order_number || null });
      ctx.handoff = h.reason;
      ctx.ui.push({ type: "handoff", email: maskEmail(h.customer_email) }); // widget: "We'll reply to t***@…" + change, or an e-mail field
      return finish(holdingMessage({ humanReplyHours: settings.human_reply_hours }, lang, { needEmail: !h.customer_email }), { intent: "handoff", answered_by: "local", route: { path: "local", reason: "handoff", confidence: 1 } });
    };
    const early = await handoffIf(merged); if (early) return early;

    // ⑧ route: local (rules + shop data) unless the question is complex / unmatched
    const kb = cls.intent === "other" && !followUp ? await profile.searchKnowledge(tenantId, text, lang, { custom: settings.custom_faq }) : [];
    const route = decideRoute({ cls, text, kbScore: kb[0]?.score || 0, followUp });
    const tools = profile.createTools(ctx);
    const local = async (extraReason) => {
      const answer = await profile.ruleAnswer(ctx, merged, text, tools);
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
      // Pod.AI: no trailing "I can pass it to our team" sentence — the handoff button is enough (Sherry, 2026-11-04)
      const btn = lang === "zh" ? "转人工" : lang === "de" ? "Mit einem Menschen sprechen" : lang === "fr" ? "Parler à une personne" : lang === "it" ? "Parlare con una persona" : "Talk to a person";
      if (!ctx.unanswered && !ctx.ui.some(u => u.type === "chips" && u.items.includes(btn))) ctx.ui.push(chips(lang, [btn]));
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
        const r = await runToolLoop({ messages: [{ role: "system", content: profile.systemPrompt({ facts: ctx.facts, conv, lang, countryHint: ctx.countryHint, canIssueDiscount: !!settings.sales_discount?.enabled }) }, ...history, { role: "user", content: text }],
          tools: tools.definitions, executeTool: tools.execute, maxToolCalls: 4 });
        conv.total_tokens += r.tokens || 0;
        if (r.text) return finish(r.text, { intent: merged.intent, mode: "llm_tools", answered_by: "llm", route: { ...route, path: "llm" } });
      } else {
        const hits = kb.length ? kb : await profile.searchKnowledge(tenantId, text, lang, { custom: settings.custom_faq });
        const sys = `${profile.systemPrompt({ facts: ctx.facts, conv, lang, countryHint: ctx.countryHint, canIssueDiscount: false })}\n\nKNOWLEDGE (use only this):\n${hits.map(h => `- ${h.question} ${h.answer}`).join("\n") || "- (no match)"}\nIf the knowledge does not answer it, say you will check with the team.`;
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
