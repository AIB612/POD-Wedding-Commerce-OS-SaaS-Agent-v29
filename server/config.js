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

/** Replace the default public address (and an optional placeholder) with the configured one. */
export function applyPublicContact(text) {
  const email = publicContactEmail();
  return String(text ?? "").split("__PUBLIC_CONTACT_EMAIL__").join(email).split(DEFAULT_PUBLIC_CONTACT_EMAIL).join(email);
}
