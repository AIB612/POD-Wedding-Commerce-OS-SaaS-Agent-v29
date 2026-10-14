// fetch with a hard timeout for every outbound provider call (EXTERNAL_API_TIMEOUT_MS, default 10 s).
// Without it one slow carrier / tax API can hang checkout or the Shopify carrier-rate callback.
export function timedFetch(url, options = {}, ms = Number(process.env.EXTERNAL_API_TIMEOUT_MS || 10_000)) {
  return fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(ms) });
}
