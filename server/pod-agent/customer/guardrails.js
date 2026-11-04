// Safety net for the customer chat, ported from the POD Agent (core/src/guardrails.js).
// Runs BEFORE any answer (rules, not model goodwill): human request, abuse, legal / chargeback threats,
// refund requests, repeated unresolved answers and the per-conversation budget hand the chat to the team.
// Additions for POD.AI: prompt-injection and payment-data patterns, which are refused instead of answered.

export const THREAT_RE =
  /\b(chargeback|r[üu]ckbuchung|paypal[- ]?(fall|case|dispute|konflikt|litige|reclamo)|anwalt|rechtsanwalt|avocat|avvocat[oa]|lawyer|attorney|polizei|police|polizia|betreibung|konsumentenschutz|verbraucherzentrale|tribunal|klage|anzeige|denuncia|plainte|sue you|small claims)\b/i;
export const ZH_THREAT_RE = /(骗子|垃圾店|去死|他妈的|投诉到|律师|报警|起诉|拒付|PayPal\s*争议|消协|曝光你们)/;
export const ABUSE_RE =
  /\b(schei(ss|ß)e?|arschl[öo]ch(er)?|idiot(en|s)?|betr[üu]ger(n)?|abzocke(r)?|merde|connards?|arnaques?|escrocs?|stronz[oi]|vaffanculo|truff[ae]|truffatori|fuck(ing)?|scam(mer)?s?|bullshit)\b/i;
// Customer explicitly asks for a person (EN / DE / FR / IT / ZH).
export const HUMAN_RE =
  /(\b(human|real person|a person|someone real|agent please|customer service|support team|talk to (a|an|your) (person|human|team|agent)|speak (to|with) (a|an|someone|your)|mensch|mitarbeiter|kundendienst|personne|conseiller|operatore|persona reale)\b|人工|真人|客服|转人工|找人|联系你们)/i;
export const REFUND_RE = /(\b(refund|money back|r[üu]ckerstattung|geld zur[üu]ck|rembourse|rimborso)\b|退款|退钱)/i;
export const ANGRY_RE = /(!!!|\b(furious|unacceptable|worst|disgusting|w[üu]tend|inakzeptabel)\b|太差|气死|愤怒|非常不满|忍无可忍)/i;
// Prompt injection / role override attempts: answered with a polite refusal, never forwarded to the model.
export const INJECTION_RE =
  /(ignore (all |the |your )?(previous|prior|above) (instructions|rules)|system prompt|you are now|developer mode|jailbreak|reveal (your|the) (prompt|instructions|rules)|忽略(之前|以上|所有)的?(指令|规则|提示)|系统提示词|越狱)/i;
// Never collect card / bank / password data in chat.
// Card numbers are only matched in the usual 4-digit groups and Luhn-checked, so long numeric tracking numbers still work.
export const PAYMENT_DATA_RE = /(\bcvv\b|\bcvc\b|\biban\b|\bpassword\b|\bpasswort\b|mot de passe|密码|卡号|信用卡号|card number|kartennummer)/i;
const CARD_RE = /\b\d{4}(?:[ -]\d{4}){2,3}(?:[ -]?\d{1,3})?\b/g;
function luhn(digits) { let s = 0, alt = false; for (let i = digits.length - 1; i >= 0; i--) { let n = +digits[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; }
export function containsCardNumber(text) { return (String(text || "").match(CARD_RE) || []).some(m => { const d = m.replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && luhn(d); }); }
export const containsPaymentData = text => PAYMENT_DATA_RE.test(text) || containsCardNumber(text);

/** Tools that change data or decide money matters. The customer chat exposes none of them (no order creation, no code issuing). */
export const WRITE_TOOLS = new Set(["create_draft_order", "issue_discount", "check_return", "send_invoice"]);

/**
 * Decide whether to hand the conversation to a human before the AI answers.
 * cls: classification ({ wants_human, abusive, threat, emotion, intent, unresolved_followup }); conv: { failed_count, total_tokens }.
 * Returns null or { reason }.
 */
export function handoffCheck(cfg, cls, conv, text) {
  if (cls.wants_human || HUMAN_RE.test(text)) return { reason: "customer asked for a human" };
  if (cls.abusive || ABUSE_RE.test(text)) return { reason: "abusive language" };
  if (cls.threat || THREAT_RE.test(text) || ZH_THREAT_RE.test(text)) return { reason: "legal / chargeback threat" };
  if (cls.emotion === "angry" || ANGRY_RE.test(text)) return { reason: "customer is very angry" };
  if (cls.intent === "refund_request" || REFUND_RE.test(text)) return { reason: "refund request" };
  const failed = (conv.failed_count || 0) + (cls.unresolved_followup ? 1 : 0);
  if (failed >= cfg.failedAnswersBeforeHandoff) return { reason: `${failed} unresolved answers in a row` };
  if ((conv.total_tokens || 0) > cfg.maxTokensPerConversation) return { reason: "conversation token limit reached" };
  return null;
}

const HOLDING = {
  de: h => `Vielen Dank für Ihre Nachricht. Ich habe Ihr Anliegen an unser Team weitergegeben. Sie erhalten innerhalb von ${h} Stunden eine Antwort.`,
  fr: h => `Merci pour votre message. J'ai transmis votre demande à notre équipe. Vous recevrez une réponse dans les ${h} heures.`,
  it: h => `Grazie per il suo messaggio. Ho inoltrato la sua richiesta al nostro team. Riceverà una risposta entro ${h} ore.`,
  en: h => `Thank you for your message. I've passed your request to our team. You'll get an answer within ${h} hours.`,
  zh: h => `感谢您的留言。我已将您的问题转交给我们的团队，您将在 ${h} 小时内收到回复。`
};
const HOLDING_NEEDS_EMAIL = {
  de: "Damit das Team Sie erreichen kann, schreiben Sie bitte Ihre E-Mail-Adresse (und, falls vorhanden, die Bestellnummer) in den Chat.",
  fr: "Pour que l'équipe puisse vous répondre, indiquez votre adresse e-mail (et le numéro de commande si vous l'avez).",
  it: "Per permettere al team di risponderle, scriva il suo indirizzo e-mail (e il numero d'ordine, se lo ha).",
  en: "So the team can reach you, please type your e-mail address (and your order number, if you have one).",
  zh: "为了让团队联系您，请在对话中留下您的邮箱（如有订单号也请一并提供）。"
};
const ERRORS = {
  de: "Entschuldigung, gerade gibt es ein technisches Problem. Bitte versuchen Sie es in ein paar Minuten noch einmal.",
  fr: "Désolé, nous rencontrons un problème technique. Veuillez réessayer dans quelques minutes.",
  it: "Ci scusi, al momento c’è un problema tecnico. Riprovi tra qualche minuto.",
  en: "Sorry, we are having a technical problem right now. Please try again in a few minutes.",
  zh: "抱歉，系统暂时出现技术问题，请几分钟后再试。"
};
const REFUSE_INJECTION = {
  de: "Dabei kann ich nicht helfen. Ich beantworte gerne Fragen zu unseren Produkten, Preisen, Versand und Bestellungen.",
  fr: "Je ne peux pas vous aider avec cela. Je réponds volontiers à vos questions sur nos produits, prix, livraisons et commandes.",
  it: "Non posso aiutarla con questo. Rispondo volentieri a domande su prodotti, prezzi, spedizioni e ordini.",
  en: "I can't help with that. I'm happy to answer questions about our products, prices, shipping and orders.",
  zh: "这个我无法协助。我可以回答关于产品、价格、运费和订单的问题。"
};
const REFUSE_PAYMENT = {
  de: "Bitte senden Sie keine Karten-, Bank- oder Passwortdaten im Chat. Bezahlt wird nur sicher an der Kasse (TWINT, PayPal oder Karte).",
  fr: "Merci de ne jamais envoyer de données de carte, bancaires ou de mot de passe dans le chat. Le paiement se fait uniquement au checkout sécurisé.",
  it: "Non invii dati di carta, bancari o password nella chat. Il pagamento avviene solo nel checkout sicuro.",
  en: "Please never send card, bank or password details in the chat. Payment only happens in our secure checkout (TWINT, PayPal or card).",
  zh: "请不要在对话中发送银行卡、账户或密码信息。付款只在安全结账页面完成（TWINT、PayPal 或银行卡）。"
};
const pick = (table, lang) => table[lang] || table[String(lang || "").slice(0, 2)] || table.en;
export const holdingMessage = (cfg, lang, { needEmail = false } = {}) => pick(HOLDING, lang)(cfg.humanReplyHours) + (needEmail ? " " + pick(HOLDING_NEEDS_EMAIL, lang) : "");
export const errorMessage = lang => pick(ERRORS, lang);
export const injectionMessage = lang => pick(REFUSE_INJECTION, lang);
export const paymentDataMessage = lang => pick(REFUSE_PAYMENT, lang);

/** Remove card-like numbers before anything is stored or sent to a model. */
export function redact(text) {
  return String(text || "").replace(CARD_RE, m => (luhn(m.replace(/\D/g, "")) ? "[redacted card number]" : m));
}
