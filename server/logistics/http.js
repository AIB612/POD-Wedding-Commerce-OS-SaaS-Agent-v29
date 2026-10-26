// Tiny injectable HTTP layer so carrier adapters can be unit-tested with mocked responses.
let impl = (...a) => globalThis.fetch(...a);
export function setFetch(fn) { impl = fn || ((...a) => globalThis.fetch(...a)); }
export async function httpJson(url, opt = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), Number(process.env.EXTERNAL_API_TIMEOUT_MS || 15000));
  try {
    const r = await impl(url, { ...opt, signal: ctl.signal });
    const text = await r.text(); let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    return { status: r.status, ok: r.ok, body };
  } finally { clearTimeout(t); }
}
export class CarrierError extends Error { constructor(carrier, message, detail) { super(`${carrier}: ${message}`); this.carrier = carrier; this.detail = detail; } }
