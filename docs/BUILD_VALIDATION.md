# Build validation — v11

All commands run from a clean checkout after `npm ci` (and `npm --prefix admin-app ci` for the React admin).
External providers (PayPal, EasyPost, Avalara, Shopify, AfterShip) are stubbed; no network access is needed.

| Command | What it covers | Result |
|---|---|---|
| `npm test` | Services; storefront price list in sync with `index.html`; HTTP: pages, admin auth, no data leaks from public chat / catalog / MCP, malformed input, checkout quote = PayPal amount (merchandise + shipping + tax), capture-once on return, proof flow, sandboxed invitation pages | pass |
| `npm run test:flows` | Customer 360, logistics overview, shipping/tax quotes, tracking, zone save, store sync (staged / registered), Shopify CarrierService registration, connector registry & config, live EasyPost / AvaTax adapters (mocked), Excel template / export / backup, CSV export, import preview / commit / validation | 22/22 pass |
| `npm run test:hardening` | Live-rate currency guard, free-shipping threshold with live rates, inactive zones, CSV formula-injection guard + round trip, zip-bomb rejection, outbound timeouts, Shopify carrier callback (secret, currency, time budget), tenant PayPal credentials used by checkout, connector secrets encrypted at rest, import token guard | 10/10 pass |
| `npm run test:http` | Starts `server/app.js` and exercises 23 end-to-end flows (pages, logistics, connectors, data import, agent, PayPal guard) | 23/23 pass |
| `npm --prefix admin-app run build` | React admin (antd 5 + pro-components 2.8.10 + React 19 patch) | builds; charts lazy-loaded |

Browser checks (Chromium, desktop 1440 px and mobile 390 px): storefront cart shipping/tax estimate and checkout summary;
`admin.html` all 14 pages including logistics, connector configuration (secrets never present in the DOM after saving),
data import/export (uploaded cell content rendered as text), customer 360; React admin all 14 pages incl. the new ones;
zh / en / de switching with no untranslated UI strings on the new pages.
