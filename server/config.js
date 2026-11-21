// Startup configuration checks. Fails fast in production on unsafe defaults; warns in development.
const PLACEHOLDERS = new Set(["", "change-me", "CHANGE_ME_TO_32_BYTE_SECRET", "development-only-key-change-me"]);

export function baseUrl() {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

export function validateConfig({ log = console } = {}) {
  const prod = process.env.NODE_ENV === "production";
  const problems = [];
  if (PLACEHOLDERS.has(process.env.ADMIN_API_KEY || "")) problems.push("ADMIN_API_KEY is missing or still the example value");
  if (PLACEHOLDERS.has(process.env.APP_ENCRYPTION_KEY || "") || (process.env.APP_ENCRYPTION_KEY || "").length < 32) problems.push("APP_ENCRYPTION_KEY must be a random secret of at least 32 characters");
  if (prod && !process.env.PUBLIC_BASE_URL) problems.push("PUBLIC_BASE_URL must be set (used for OAuth / PayPal return URLs)");
  if (!problems.length) return true;
  if (prod) throw new Error(`Refusing to start in production:\n - ${problems.join("\n - ")}`);
  for (const p of problems) log.warn(`[config] ${p} (ok for local development only)`);
  return false;
}

const DEFAULT_PUBLIC_CONTACT_EMAIL = "support@swisspro.site";

/** Public contact address for both sites (footer, /contact, schema.org, legal pages).
 *  Switch with one env line: PUBLIC_CONTACT_EMAIL=...  Invalid values fall back to the default. */
export function publicContactEmail() {
  const raw = String(process.env.PUBLIC_CONTACT_EMAIL || DEFAULT_PUBLIC_CONTACT_EMAIL).trim();
  if (!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(raw) || raw.length > 120) return DEFAULT_PUBLIC_CONTACT_EMAIL;
  return raw;
}

/** Replace the default public address (and an optional placeholder) with the configured one.
 *  Also substitutes the WhatsApp number placeholder and optional contact/footer markers.
 *  host is used to pick the pre-filled WhatsApp message (pod vs podai). */
export function publicWhatsAppNumber() {
  const digits = String(process.env.PUBLIC_WHATSAPP_NUMBER || "").replace(/\D+/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) return "";
  return digits;
}

export function whatsAppPrefill(host) {
  return /(?:^|\.)podai\.swisspro\.site$/i.test(String(host || ""))
    ? "Hi, I'd like to know more about POD.AI Agent for my shop"
    : "Hi SwissPro POD, I have a question about a custom order";
}

export function whatsAppHref(host) {
  const n = publicWhatsAppNumber();
  if (!n) return "";
  return `https://wa.me/${n}?text=${encodeURIComponent(whatsAppPrefill(host))}`;
}

export function applyPublicContact(text, host) {
  const email = publicContactEmail();
  let out = String(text ?? "").split("__PUBLIC_CONTACT_EMAIL__").join(email).split(DEFAULT_PUBLIC_CONTACT_EMAIL).join(email);
  out = out.split("__PUBLIC_WHATSAPP_NUMBER__").join(publicWhatsAppNumber());
  const href = whatsAppHref(host);
  const contact = href
    ? `<p class="wa-contact"><a href="${href}" target="_blank" rel="noopener noreferrer">WhatsApp</a></p>`
    : "";
  const footer = href
    ? ` · <a class="wa-footer" href="${href}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`
    : "";
  return out.split("<!--__WHATSAPP_CONTACT_LINK__-->").join(contact).split("<!--__WHATSAPP_FOOTER_LINK__-->").join(footer);
}
