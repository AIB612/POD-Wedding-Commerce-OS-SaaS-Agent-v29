/** Pod.AI GA4 helpers. Measurement ID from env PODAI_GA_ID (admin + storefront).
 *  PODAI_LISTING_GA_ID is for Partner Dashboard listing only (not loaded by our app).
 *  Never send PII, message text, e-mails, or conversation IDs. */
const ID_RE = /^G-[A-Z0-9]{6,}$/i;

export function measurementId(env = process.env) {
  const id = String(env.PODAI_GA_ID || "").trim();
  return ID_RE.test(id) ? id.toUpperCase() : "";
}

export function listingMeasurementId(env = process.env) {
  const id = String(env.PODAI_LISTING_GA_ID || "").trim();
  return ID_RE.test(id) ? id.toUpperCase() : "";
}

/** Inline snippet for embedded admin HTML. Empty string when unset (no network calls). */
export function adminSnippet(id = measurementId()) {
  if (!id) return "";
  const safe = id.replace(/[^A-Z0-9-]/gi, "");
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${safe}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${safe}",{anonymize_ip:true,send_page_view:false});window.__PODAI_GA="${safe}";</script>`;
}

/** GA tag for the public Pod.AI pages (privacy, terms, support/docs, security, DPA): PODAI_GA_ID when set,
 *  otherwise the same property as the podai landing page (agent.html). */
export const LANDING_GA_ID = "G-GED5TST3DP";
export function publicPageSnippet(env = process.env) {
  const safe = (measurementId(env) || LANDING_GA_ID).replace(/[^A-Z0-9-]/gi, "");
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${safe}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${safe}",{anonymize_ip:true});</script>`;
}
/** Insert the public-page GA tag before the first </head> (once). */
export function withPublicGa(html, env = process.env) {
  return html.includes("googletagmanager.com/gtag/js") ? html : html.replace("</head>", publicPageSnippet(env) + "</head>");
}

export function isValidId(id) { return ID_RE.test(String(id || "").trim()); }
