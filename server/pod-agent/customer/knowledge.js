// Shop knowledge for the customer chat (replaces the old Chinese-only demo knowledge.json for the storefront chat).
// Structure follows the POD Agent knowledge/faq.md ("## question" → answer), but every fact that exists in the
// shop settings (production days, carrier days, VAT mode, free-shipping threshold, payment methods) is read
// live from our services, so the chat never disagrees with checkout. Retrieval: lexical terms + CJK bigrams
// (our rag.js approach; no vector DB / Supabase needed for ~20 entries).
import { studioCatalog } from "../../services/studio-service.js";
import { getFees, carrierDays, pricesIncludeVat } from "../../services/fees-service.js";
import { paymentMethods } from "../../services/checkout-service.js";
import { currencyForCountry } from "../../services/pricing-service.js";
import { FAQ_FR_IT, dynamicFrIt } from "./i18n-fr-it.js";
import { BM25 } from "../../shared/local-rag.js";
import { fixTypos } from "./nlu.js";

const FAQ = [
  { id: "what_we_sell", tags: ["products", "sell", "offer", "range", "什么", "卖", "产品", "sortiment", "angebot"],
    q: { en: "What do you sell?", zh: "你们卖什么？", de: "Was verkaufen Sie?" },
    a: { en: "POD.AI makes custom wedding stationery and personalised gifts: invitations, save-the-date cards, menus, place cards, table numbers, welcome signs, gift boxes and favours, plus mugs, tees, totes and more. Everything is printed on demand.",
         zh: "POD.AI 提供定制婚礼纸品和个性化礼品：邀请卡、Save the Date、菜单、席位卡、桌号、迎宾牌、礼盒和伴手礼，以及马克杯、T 恤、帆布袋等。所有商品按需印制。",
         de: "POD.AI fertigt individuelle Hochzeitspapeterie und personalisierte Geschenke: Einladungen, Save-the-Date-Karten, Menükarten, Platzkarten, Tischnummern, Willkommensschilder, Geschenkboxen und Gastgeschenke sowie Tassen, Shirts und Taschen. Alles wird auf Bestellung gedruckt." } },
  { id: "proof", tags: ["proof", "mockup", "approve", "preview", "效果图", "样稿", "确认", "korrektur", "abzug", "freigabe", "vorschau"],
    q: { en: "When do I get my design proof?", zh: "什么时候能看到效果图？", de: "Wann bekomme ich meinen Korrekturabzug?" },
    a: { en: "For personalised designs we e-mail you a proof link after payment; production starts only after you approve it (or right after payment if you approve the mockup at checkout). Please check names, dates and spelling carefully.",
         zh: "个性化设计在付款后我们会通过邮件发送效果图链接；您确认后才开始生产（如果在结账时直接确认样图，则付款后立即生产）。请仔细核对姓名、日期和拼写。",
         de: "Für personalisierte Designs senden wir Ihnen nach der Zahlung einen Link zum Korrekturabzug; die Produktion startet erst nach Ihrer Freigabe (oder direkt nach der Zahlung, wenn Sie das Mockup an der Kasse freigeben)." } },
  { id: "returns", tags: ["return", "returns", "exchange", "withdrawal", "defect", "damaged", "wrong", "退货", "换货", "退换", "破损", "瑕疵", "rückgabe", "umtausch", "defekt", "beschädigt"],
    q: { en: "Can I return personalised items?", zh: "个性化商品可以退货吗？", de: "Kann ich personalisierte Artikel zurückgeben?" },
    a: { en: "Personalised items are made to your specification, so they cannot be returned for change of mind. If an item arrives defective, damaged or different from your approved proof, contact us within 14 days with your order number and photos and we reprint or refund at no cost. Details: /returns",
         zh: "个性化商品按您的要求定制，因此不支持无理由退货。如果收到的商品有瑕疵、运输破损或与确认的效果图不符，请在签收后 14 天内提供订单号和照片联系我们，我们会免费重印或退款。详情：/returns",
         de: "Personalisierte Artikel werden nach Ihren Vorgaben gefertigt und sind vom Widerruf ausgeschlossen. Ist ein Artikel defekt, beschädigt oder weicht vom freigegebenen Abzug ab, melden Sie sich innerhalb von 14 Tagen mit Bestellnummer und Fotos – wir drucken neu oder erstatten. Details: /returns" } },
  { id: "cancel", tags: ["cancel", "change", "modify", "取消", "修改", "改", "stornieren", "ändern"],
    q: { en: "Can I change or cancel my order?", zh: "订单可以修改或取消吗？", de: "Kann ich meine Bestellung ändern oder stornieren?" },
    a: { en: "You can change or cancel free of charge until production starts, i.e. until you approve your proof (or right after payment if you approved the mockup at checkout). After that, cancellation is no longer possible.",
         zh: "在开始生产前（即您确认效果图之前；若结账时已确认样图，则为付款后立即）可免费修改或取消。开始生产后无法取消。",
         de: "Bis zum Produktionsstart (also bis zur Freigabe Ihres Abzugs bzw. direkt nach der Zahlung bei Mockup-Freigabe) können Sie kostenlos ändern oder stornieren. Danach ist keine Stornierung mehr möglich." } },
  { id: "customs", tags: ["customs", "duty", "duties", "import", "关税", "清关", "进口", "zoll", "einfuhr"],
    q: { en: "Do I pay customs or import VAT?", zh: "需要交关税吗？", de: "Fallen Zoll oder Einfuhrsteuern an?" },
    a: { en: "Items are made to order and shipped from China via YunExpress or 4PX. Import VAT and customs handling may apply; the checkout shows VAT for your delivery country, and any other import duties or clearance fees are paid by the recipient on delivery. Details: /shipping",
         zh: "商品按单定制，通过云途（YunExpress）或递四方（4PX）从中国发货。可能产生进口增值税和清关费用；结账页面会显示收货国家的增值税，其他进口关税或清关费在签收时由收件人承担。详情：/shipping",
         de: "Die Artikel werden auf Bestellung gefertigt und mit YunExpress oder 4PX aus China versandt. Einfuhrumsatzsteuer und Zollabwicklung können anfallen; die Kasse zeigt die MwSt. Ihres Lieferlandes, weitere Einfuhrabgaben oder Verzollungsgebühren trägt der Empfänger bei Lieferung. Details: /shipping" } },
  { id: "website", tags: ["website", "rsvp", "site", "网站", "婚礼网站", "回执", "webseite", "hochzeitswebsite"],
    q: { en: "Can I create a wedding website?", zh: "可以做婚礼网站吗？", de: "Kann ich eine Hochzeitswebsite erstellen?" },
    a: { en: "Yes — click \"Create wedding website\" in the top menu. Designing is free; guests can view it in English, Chinese or German and you can collect RSVPs.",
         zh: "可以——点击顶部菜单的“创建婚礼网站”。设计免费，宾客可用英文、中文或德文浏览，并可收集回执（RSVP）。",
         de: "Ja – klicken Sie oben auf „Hochzeitswebsite erstellen“. Die Gestaltung ist kostenlos, Gäste sehen sie auf Englisch, Chinesisch oder Deutsch und können zusagen (RSVP)." } },
  { id: "design", tags: ["design", "start", "customise", "customize", "upload", "file", "logo", "设计", "定制", "上传", "文件", "gestalten", "hochladen"],
    q: { en: "How do I start designing?", zh: "怎么开始设计？", de: "Wie fange ich mit dem Gestalten an?" },
    a: { en: "Click \"Start designing\" to open the design studio, pick a product and add your names, date, text or upload your own artwork (PNG, JPG, SVG, PDF and more). The price updates live.",
         zh: "点击“开始设计”进入设计工作室，选择产品后填写姓名、日期、文字，或上传自己的设计文件（PNG、JPG、SVG、PDF 等），价格实时更新。",
         de: "Klicken Sie auf „Jetzt gestalten“, wählen Sie ein Produkt und fügen Sie Namen, Datum, Text hinzu oder laden Sie eigene Dateien hoch (PNG, JPG, SVG, PDF …). Der Preis aktualisiert sich live." } },
  { id: "samples", tags: ["sample", "samples", "test print", "样品", "打样", "muster"],
    q: { en: "Do you offer samples?", zh: "可以先买样品吗？", de: "Gibt es Muster?" },
    a: { en: "You can order any product from quantity 1, so a single piece works as a sample before a larger order.",
         zh: "所有产品 1 件起订，您可以先下 1 件作为样品，再下大批量订单。",
         de: "Alle Produkte sind ab 1 Stück bestellbar – ein einzelnes Stück dient als Muster vor einer größeren Bestellung." } },
  { id: "eco", tags: ["eco", "sustainable", "recycled", "fsc", "环保", "再生", "nachhaltig", "recycling"],
    q: { en: "Are your products sustainable?", zh: "产品环保吗？", de: "Sind Ihre Produkte nachhaltig?" },
    a: { en: "Many paper products use FSC or recycled paper (e.g. recycled kraft); all items are made to order and shipped from China via YunExpress or 4PX. Look for the Eco label on the product list.",
         zh: "许多纸品使用 FSC 认证纸或再生纸（如再生牛皮纸）；所有商品按单定制，通过云途或递四方从中国发货。产品列表中带 Eco 标识的即为环保款。",
         de: "Viele Papierprodukte nutzen FSC- oder Recyclingpapier; alle Artikel werden auf Bestellung gefertigt und mit YunExpress oder 4PX aus China versandt. Achten Sie auf das Eco-Label." } },
  { id: "ships_from", tags: ["from", "where", "china", "made", "produced", "printed", "warehouse", "origin", "发货", "哪里", "中国", "生产", "woher", "herkunft", "produziert", "provenance", "provenienza"],
    q: { en: "Where do you ship from?", zh: "从哪里发货？", de: "Von wo wird versendet?", fr: "D'où expédiez-vous ?", it: "Da dove spedite?" },
    a: { en: "Everything is printed to order and ships from China with YunExpress or 4PX, tracked to your door. Delivery takes about 7–15 business days in total.",
         zh: "所有商品按单印制，由云途（YunExpress）或递四方（4PX）从中国发货，全程可追踪。总共大约 7–15 个工作日送达。",
         de: "Alles wird auf Bestellung gedruckt und mit YunExpress oder 4PX aus China versandt – mit Sendungsverfolgung bis zur Haustür. Insgesamt dauert die Lieferung etwa 7–15 Werktage.",
         fr: "Tout est imprimé à la commande et expédié depuis la Chine par YunExpress ou 4PX, avec suivi jusqu'à chez vous. Comptez environ 7 à 15 jours ouvrés au total.",
         it: "Tutto viene stampato su ordinazione e spedito dalla Cina con YunExpress o 4PX, tracciato fino a casa. In totale servono circa 7–15 giorni lavorativi." } },
  { id: "contact", tags: ["contact", "email", "phone", "person", "联系", "联系方式", "怎么联系", "如何联系", "联系你们", "电话", "邮箱", "kontakt"],
    q: { en: "How can I contact a person?", zh: "怎么联系人工客服？", de: "Wie erreiche ich einen Menschen?" },
    a: { en: "Just ask here for a person and leave your e-mail — I pass the chat to our team, who reply within 24 hours (Mon–Fri).",
         zh: "直接在这里说“转人工”并留下邮箱，我会把对话转给团队，他们会在 24 小时内（周一至周五）回复。",
         de: "Schreiben Sie hier einfach, dass Sie einen Menschen möchten, und hinterlassen Sie Ihre E-Mail – das Team antwortet innerhalb von 24 Stunden (Mo–Fr)." } }
];

// French / Italian answers (same entries, merged in so FR / IT shoppers are answered in their language).
for (const e of FAQ) { const x = FAQ_FR_IT[e.id]; if (x) { Object.assign(e.q, x.q); Object.assign(e.a, x.a); } }
// The public support address (also on the imprint page) so shoppers can always reach a person.
{ const c = FAQ.find(e => e.id === "contact"), add = { en: " You can also e-mail us at support@swisspro.site.", zh: "也可以发邮件至 support@swisspro.site。", de: " Oder schreiben Sie an support@swisspro.site.", fr: " Vous pouvez aussi écrire à support@swisspro.site.", it: " Può anche scriverci a support@swisspro.site." };
  for (const l of Object.keys(c.a)) if (!c.a[l].includes("support@")) c.a[l] += add[l] || add.en; }

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const fmtDays = ([a, b]) => (a === b ? `${a}` : `${a}–${b}`);

/** Total business days door to door (production + fastest/slowest carrier transit over all zones), e.g. "7–15". */
function totalDays(prod) {
  const all = ["zone_ch", "zone_de", "zone_eu", "zone_uk", "zone_us", "zone_world"].flatMap(z => [...carrierDays(z, "standard"), ...carrierDays(z, "express")]).map(Number).filter(Number.isFinite);
  if (!all.length) return "7–15";
  const lo = prod + Math.min(...all), hi = prod + Math.max(...all);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/** Where each shipping zone's free-shipping threshold applies, per chat language. */
const ZONE_WHERE = {
  en: { zone_ch: "in Switzerland", zone_de: "to Germany", zone_eu: "to other EU countries", zone_uk: "to the UK", zone_us: "to the USA and Canada", zone_world: "for other countries" },
  de: { zone_ch: "Schweiz", zone_de: "Deutschland", zone_eu: "andere EU-Länder", zone_uk: "Grossbritannien", zone_us: "USA und Kanada", zone_world: "andere Länder" },
  fr: { zone_ch: "en Suisse", zone_de: "vers l'Allemagne", zone_eu: "vers les autres pays de l'UE", zone_uk: "vers le Royaume-Uni", zone_us: "vers les États-Unis et le Canada", zone_world: "vers les autres pays" },
  it: { zone_ch: "in Svizzera", zone_de: "verso la Germania", zone_eu: "verso gli altri paesi UE", zone_uk: "verso il Regno Unito", zone_us: "verso USA e Canada", zone_world: "verso gli altri paesi" },
  zh: { zone_ch: "瑞士", zone_de: "德国", zone_eu: "其他欧盟国家", zone_uk: "英国", zone_us: "美国和加拿大", zone_world: "其他国家" }
};
const fmtAmount = n => (Number(n) % 1 ? Number(n).toFixed(2) : String(Number(n)));
/** "CHF 108 in Switzerland and EUR 143 to Germany" in the chat language, from facts.free_shipping. */
export function freeShippingText(list = [], lang = "en") {
  const W = ZONE_WHERE[lang] || ZONE_WHERE.en;
  const parts = list.map(x => lang === "zh" ? `${x.currency} ${fmtAmount(x.amount)}（${W[x.zone] || x.zone}）`
    : lang === "de" ? `${x.currency} ${fmtAmount(x.amount)} (${W[x.zone] || x.zone})` : `${x.currency} ${fmtAmount(x.amount)} ${W[x.zone] || x.zone}`);
  const sep = { en: " and ", de: " bzw. ", fr: " et ", it: " e ", zh: "、" }[lang] || " and ";
  return parts.join(sep);
}
/** Shipping zone for a destination country (fee settings → zone countries; "*" = rest of world). */
function zoneFor(fees, cc) {
  const z = Object.entries(fees.shipping || {}).find(([, v]) => Array.isArray(v?.countries) && v.countries.includes(cc));
  return z ? z[0] : (fees.shipping?.zone_world ? "zone_world" : null);
}

/** Live facts from the shop settings (never hard-coded in prompts). With the shopper's market country, amounts are in
 *  that market's currency only (the same currency the page, cart and checkout show). */
export async function shopFacts(tenantId, country = null) {
  const cat = studioCatalog(), fees = getFees();
  const fac = {}; for (const f of cat.facilities || []) fac[f.region] = Math.min(fac[f.region] ?? Infinity, Number(f.days)); // fastest facility per region
  const freeOver = { CHF: fees.shipping?.zone_ch?.standard?.CHF?.free_over || null, EUR: fees.shipping?.zone_de?.standard?.EUR?.free_over || null };
  const cc = /^[A-Z]{2}$/.test(String(country || "")) ? String(country) : null;
  const freeAt = (zone, cur) => { const v = Number(fees.shipping?.[zone]?.standard?.[cur]?.free_over); return v > 0 ? { zone, currency: cur, amount: r2(v) } : null; };
  let freeList;
  if (cc) { const cur = currencyForCountry(cc), zone = zoneFor(fees, cc); freeList = [zone && freeAt(zone, cur)]; }
  else freeList = [freeAt("zone_ch", "CHF"), freeAt("zone_de", "EUR")];
  freeList = freeList.filter(Boolean);
  let pay = null; try { pay = await paymentMethods(tenantId); } catch { pay = null; }
  // Only what checkout really offers right now (GET /api/payments/methods). TWINT is listed only once it is configured.
  const methods = [pay?.twint?.configured ? "TWINT" : null, pay?.paypal?.configured ? "PayPal (incl. cards)" : null].filter(Boolean);
  return {
    production_days: { CH: fac.CH ?? 3, EU: fac.EU ?? 3 },
    delivery_days: totalDays(Number(fees.default_production_days) || Math.min(fac.CH ?? 3, fac.EU ?? 3)),
    proof_buffer_days: Number(cat.proof_buffer_days || 0),
    carrier_days: Object.fromEntries(["zone_ch", "zone_de", "zone_eu", "zone_uk", "zone_us", "zone_world"].map(z => [z, { standard: fmtDays(carrierDays(z, "standard")), express: fmtDays(carrierDays(z, "express")) }])),
    prices_include_vat: pricesIncludeVat(),
    free_standard_shipping_over: cc ? Object.fromEntries(freeList.map(x => [x.currency, x.amount])) : { CHF: freeOver.CHF ? r2(freeOver.CHF) : null, EUR: freeOver.EUR ? r2(freeOver.EUR) : null },
    free_shipping: freeList,
    payment_methods: methods.length ? methods : ["PayPal"],
    human_reply_hours: Number(process.env.HUMAN_REPLY_HOURS || 24)
  };
}

/** Dynamic FAQ entries built from the facts above (delivery time, VAT, payment, free shipping). */
function dynamicEntries(f) {
  const list = dynamicEntriesBase(f), x = dynamicFrIt(f, freeShippingText);
  for (const e of list) if (x[e.id]) { Object.assign(e.q, x[e.id].q); Object.assign(e.a, x[e.id].a); }
  return list;
}
function dynamicEntriesBase(f) {
  const vat = f.prices_include_vat;
  const free = f.free_shipping || [];
  return [
    { id: "delivery_time", tags: ["delivery", "long", "time", "arrive", "when", "days", "production", "多久", "几天", "时间", "到货", "送达", "生产", "lieferzeit", "dauert", "wann", "produktion"],
      q: { en: "How long does delivery take?", zh: "多久能收到？", de: "Wie lange dauert die Lieferung?" },
      a: { en: `Delivery takes about ${f.delivery_days} business days to all regions (Switzerland, the EU and worldwide): about ${f.production_days.CH} business days of production (made to order) plus international transit from China via YunExpress or 4PX, and about ${f.proof_buffer_days} more days if you review a proof first. Your exact dates are shown in the cart and at checkout before you pay, and you get a tracking number as soon as the parcel ships.`,
           zh: `送达时间约 ${f.delivery_days} 个工作日，适用于所有地区（瑞士、欧盟及其他国家）：按单定制生产约 ${f.production_days.CH} 个工作日，再通过云途或递四方从中国国际运输；如需先确认效果图，另加约 ${f.proof_buffer_days} 天。购物车和结账页会在付款前显示具体日期，发货后会发送追踪号。`,
           de: `Die Lieferung dauert etwa ${f.delivery_days} Werktage in alle Regionen (Schweiz, EU und weltweit): ca. ${f.production_days.CH} Werktage Produktion (auf Bestellung) plus internationaler Versand aus China mit YunExpress oder 4PX, bei Korrekturabzug ca. ${f.proof_buffer_days} Tage mehr. Die genauen Daten sehen Sie vor dem Bezahlen im Warenkorb und an der Kasse; nach dem Versand erhalten Sie eine Sendungsnummer.` } },
    { id: "vat", tags: ["vat", "tax", "mwst", "incl", "excl", "增值税", "含税", "税", "steuer"],
      q: { en: "Are prices including VAT?", zh: "价格含税吗？", de: "Sind die Preise inkl. MwSt.?" },
      a: vat ? { en: "Prices include VAT for your delivery country; the VAT share is shown at checkout.", zh: "价格已含收货国家的增值税，税额在结账时列出。", de: "Die Preise enthalten die MwSt. Ihres Lieferlandes; der Anteil wird an der Kasse ausgewiesen." }
             : { en: "Product prices are shown excluding VAT; VAT for your delivery country (e.g. 8.1% in Switzerland) is added at checkout.", zh: "商品价格不含增值税；结账时按收货国家加收增值税（如瑞士 8.1%）。", de: "Produktpreise verstehen sich exkl. MwSt.; die MwSt. Ihres Lieferlandes (z. B. 8,1 % in der Schweiz) wird an der Kasse addiert." } },
    { id: "payment", tags: ["pay", "payment", "twint", "paypal", "paiement", "pagamento", "payer", "pagare", "card", "credit", "付款", "支付", "信用卡", "zahlung", "bezahlen", "karte"],
      q: { en: "Which payment methods do you accept?", zh: "支持哪些付款方式？", de: "Welche Zahlungsarten gibt es?" },
      a: { en: `We accept ${f.payment_methods.join(", ")} — you can pay by card through PayPal, even without a PayPal account. Payment happens only in our secure checkout — never send card details in the chat.`,
           zh: `支持 ${f.payment_methods.map(m => m.replace(" (incl. cards)", "（含银行卡）")).join("、")}，没有 PayPal 账户也可以通过 PayPal 用银行卡付款。付款只在安全结账页面完成，请勿在对话中发送卡号。`,
           de: `Wir akzeptieren ${f.payment_methods.map(m => m.replace("(incl. cards)", "(inkl. Karten)")).join(", ")} – Kartenzahlung über PayPal geht auch ohne PayPal-Konto. Bezahlt wird nur an der sicheren Kasse – senden Sie keine Kartendaten im Chat.` } },
    { id: "free_shipping", tags: ["free", "shipping", "免运费", "包邮", "免费", "versandkostenfrei", "gratis"],
      q: { en: "Is there free shipping?", zh: "有包邮吗？", de: "Gibt es kostenlosen Versand?" },
      a: free.length ? { en: `Standard shipping is free from ${freeShippingText(free, "en")} (merchandise subtotal). Express is always charged.`,
           zh: `商品金额满 ${freeShippingText(free, "zh")} 标准运费免费，快递始终收费。`,
           de: `Standardversand ist ab ${freeShippingText(free, "de")} Warenwert kostenlos; Express wird immer berechnet.` }
           : { en: "Shipping is calculated in the cart for your address.", zh: "运费在购物车中按地址计算。", de: "Versandkosten werden im Warenkorb berechnet." } }
  ];
}

function terms(query = "") {
  const q = String(query).toLowerCase().slice(0, 2000);
  const out = new Set(q.split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 2));
  for (const run of q.match(/[\u3400-\u9fff]+/g) || []) {
    if (run.length === 1) out.add(run);
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
  }
  return [...out];
}
const STOP = new Set(["the", "and", "you", "your", "for", "can", "how", "what", "are", "with", "does", "from", "this", "that", "ich", "sie", "und", "der", "die", "das", "wie", "was", "我们", "你们", "可以", "什么"]);

/** Ranked knowledge hits for a query, in the customer's language (falls back to English). */
/** Admin-written entries (Admin → AI Agent → Knowledge): { id, question, answer, tags, lang } → same shape as FAQ. */
export function normaliseCustom(list = []) {
  return (list || []).filter(x => x && x.question && x.answer && x.active !== false).map(x => ({ id: x.id, custom: true,
    tags: String(x.tags || "").toLowerCase().split(/[,;\s]+/).filter(Boolean), q: { [x.lang || "en"]: x.question, en: x.question }, a: { [x.lang || "en"]: x.answer, en: x.answer } }));
}
export async function allEntries(tenantId, custom = [], country = null) { return [...normaliseCustom(custom), ...dynamicEntries(await shopFacts(tenantId, country)), ...FAQ]; }
/**
 * Ranked knowledge hits (BM25 over questions + tags in every language, answers weighted lower; typo tolerant).
 * Each hit: { id, question, answer (shopper's language, English fallback), score (≈0–6, ≥ 2 = confident), norm (0–1) }.
 */
export async function searchKnowledge(tenantId, query, lang = "en", { limit = 3, custom = [], country = null } = {}) {
  const docs = await allEntries(tenantId, custom, country);
  const index = new BM25(docs.map(d => ({ id: d.id, entry: d, fields: { q: Object.values(d.q).join(" "), tags: d.tags.join(" "), a: Object.values(d.a).join(" ") } })), { weights: { q: 3, tags: 3, a: 0.6 } });
  // Shop-vocabulary typo fixes first ("shiping fre" → "shipping free"), so a misspelt word is not matched to a near neighbour ("ships").
  const fixed = fixTypos(query).text || query;
  return index.search(fixed, { limit: limit + 2 }).map(h => {
    const d = h.doc.entry, coverage = h.terms ? h.matched / h.terms : 0;
    const score = Math.round((h.norm * 4 + coverage * 2 + (d.custom && h.norm > 0.2 ? 1 : 0)) * 100) / 100;
    return { id: d.id, question: d.q[lang] || d.q.en, answer: d.a[lang] || d.a.en, score, norm: Math.round(h.norm * 100) / 100, ...(d.custom ? { custom: true } : {}) };
  }).filter(h => h.score >= 1).sort((a, b) => b.score - a.score).slice(0, limit);
}
export async function knowledgeEntry(tenantId, id, lang = "en", country = null) {
  const facts = await shopFacts(tenantId, country), d = [...dynamicEntries(facts), ...FAQ].find(x => x.id === id);
  return d ? { id: d.id, question: d.q[lang] || d.q.en, answer: d.a[lang] || d.a.en } : null;
}
export const POLICY_TOPICS = { shipping: "delivery_time", delivery: "delivery_time", returns: "returns", refunds: "returns", customs: "customs", payment: "payment", proofs: "proof", vat: "vat", cancel: "cancel", free_shipping: "free_shipping" };
