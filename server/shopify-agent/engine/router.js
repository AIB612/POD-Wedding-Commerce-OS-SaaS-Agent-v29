// Pod.AI copy of the Wed.AI POD Agent engine (server/pod-agent/customer). Pod.AI-only: edit here, never the site agent.
// Answer routing: local first. Our own rule engine + shop data answer everything it can answer confidently
// (products, prices, shipping quotes, orders/tracking, discount codes, FAQ / knowledge base). Only complex or
// unmatched questions go to an LLM, and only when a key is configured (LLM_PROVIDER + OPENAI_/XAI_/DEEPSEEK_API_KEY).
// Without a key the customer gets the best rule-based answer plus an offer to talk to a person.

/** Intents answered from live shop data: local unless open-ended; numbers and order data never come from a model (it must call our tools). */
export const DATA_INTENTS = new Set(["shipping_quote", "price", "order_status", "tracking", "discount", "recommendation", "greeting", "thanks"]);
/** Policy / FAQ intents with fixed answers from our knowledge base. Local unless the question is clearly open-ended. */
export const FAQ_INTENTS = new Set(["return_request", "cancel_or_change", "delivery_time", "customs", "vat", "payment", "proof", "website", "product_question", "contact_info"]);
export const CONFIDENCE_THRESHOLD = 0.6;

const OPEN_RE = /(\bwhy\b|\bexplain\b|\bcompare\b|difference between|\bversus\b|\bvs\.?\b|what do you think|your opinion|advice|ideas? for|inspiration|help me (write|choose|plan|decide)|wording|write (a|me|my)|text for|\bpoem\b|\btheme\b|colou?r (scheme|palette)|which (one )?(is|would be) better|should i|\bwarum\b|erkl[äa]r|unterschied|vergleich|pourquoi|diff[ée]rence|perch[ée]|为什么|区别|比较|怎么选|哪个更好|建议|帮我写|文案|措辞|设计思路|搭配|主题|灵感|意见)/i;

/** Complexity markers that make a question a candidate for the LLM. */
export function complexity(text) {
  const t = String(text || ""), reasons = [];
  if (t.length > 220) reasons.push("long");
  if ((t.match(/[?？]/g) || []).length >= 2) reasons.push("multi_question");
  if (OPEN_RE.test(t)) reasons.push("open_ended");
  return reasons;
}

/**
 * Decide local (rules + shop data) vs LLM for one message.
 * cls: classifyRules() result; kbScore: best knowledge-base score for the text; followUp: the message fills a pending slot.
 * Returns { path: "local"|"llm", confidence 0..1, reason, complexity: [] }.
 */
export function decideRoute({ cls, text, kbScore = 0, followUp = false }) {
  const cx = complexity(text), intent = cls?.intent || "other";
  const entity = { shipping_quote: cls.products?.length && cls.country, tracking: cls.tracking_number, order_status: cls.order_number || cls.email,
    recommendation: cls.products?.length || cls.budget, price: cls.products?.length, product_question: cls.products?.length }[intent];
  const penalty = cx.reduce((a, r) => a + (r === "open_ended" ? 0.3 : 0.1), 0);
  let confidence, reason;
  if (DATA_INTENTS.has(intent)) {
    // Shop-data questions stay local; only a clearly open-ended part ("why…", "help me choose…") on top of the data request lets the model
    // phrase the answer — and the model still gets every number from our tools.
    confidence = cx.includes("open_ended") ? 0.55 - 0.05 * (cx.length - 1) : Math.max(0.7, (entity ? 0.9 : 0.8) - 0.05 * cx.length); reason = "shop_data"; }
  else if (followUp) { confidence = 0.8; reason = "follow_up"; }
  else if (FAQ_INTENTS.has(intent)) { confidence = (entity ? 0.85 : 0.8) - penalty; reason = "faq_intent"; }
  else if (kbScore >= 2) { confidence = Math.min(0.85, 0.5 + 0.1 * kbScore) - penalty; reason = "knowledge_match"; }
  else { confidence = 0.3 - 0.05 * cx.length; reason = "unmatched"; }
  confidence = Math.round(Math.min(0.99, Math.max(0.05, confidence)) * 100) / 100;
  const local = confidence >= CONFIDENCE_THRESHOLD;
  if (!local && reason !== "unmatched") reason = `complex:${cx.join("+") || "low_confidence"}`;
  return { path: local ? "local" : "llm", confidence, reason, complexity: cx };
}
