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
