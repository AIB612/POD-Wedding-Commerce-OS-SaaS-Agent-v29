# TWINT — direct merchant integration (no PSP)

Status in this repo: **skeleton only** (`server/connectors/twint.js`). The storefront shows TWINT as
"coming soon" until the connector is configured *and* implemented; the API never reports a TWINT payment as paid
unless TWINT confirms it.

## What public sources say (checked 2026-10-21)

| Topic | Finding | Source |
|---|---|---|
| API access | TWINT FAQ: the TWINT API "is not publicly accessible and is also not made available on request. TWINT can only be integrated in online shops via a payment service provider or a corresponding plug-in." | https://www.twint.ch/en/faq/how-do-i-as-a-software-developer-receive-the-twint-api/ |
| Direct integration | Offered to *software providers, platform operators and hardware makers* that integrate TWINT into scalable solutions offered to **multiple merchants** (contact form "Ich bin Direktintegrator"). Individual merchants are pointed to POS or e-commerce acceptance solutions. | https://www.twint.ch/geschaeftskunden/ressourcen/direktintegration/ |
| Official plugins | TWINT AG publishes its own shop plugins (e.g. WooCommerce) that talk to TWINT directly. Merchant enters **Store UUID**, uploads the **.p12 certificate** and its **password**. | https://github.com/Twint-AG/twint-woocommerce-extension/blob/latest/docs/twint-payment-plugin-guideline.md |
| SDK / protocol | Official PHP SDK (`twint-ag/sdk`): SOAP "TWINT Merchant Service", WSDL v8.5–v10 bundled; operations include `EnrollCashRegister`, `StartOrder`, `MonitorOrder`, `ConfirmOrder`, `CancelOrder`, `FindOrder`, `CheckSystemStatus`, `GetCertificateValidity`, `RenewCertificate`, plus check-in / Fast Checkout / UOF variants. `StartOrderResponse` returns `OrderUuid`, `OrderStatus`, `Token`, `QRCode`, `TwintURL`. | https://github.com/Twint-AG/sdk , https://packagist.org/packages/twint-ag/sdk |
| Endpoints | `https://service.twint.ch/merchant/service/TWINTMerchantServiceV<ver>` (production), `https://service-pat.twint.ch/...` (test/PAT) per SDK `src/Value/Environment.php`. A third-party plugin also lists `service-int.twint.ch` (integration). | SDK source; https://wordpress.org/plugins/pay4all-for-twint/ |
| Certificate | Ordered via the TWINT merchant portal (issued through SwissSign), password-protected (≥ 8 chars), downloadable for 30 days, one per merchant-portal business account. | https://www.twint.ch/content/uploads/2022/03/Instructions-cash-register-system-with-TWINT.pdf |
| Credentials | Store UUID + cash-register ID + .p12 + password, all from https://portal.twint.ch | pay4all plugin page; WooCommerce guide |

**Not verified / open:** whether TWINT AG will sign a direct e-commerce contract with a single small shop that
builds its own (Node) integration rather than using an official plugin or PSP; fees; whether a PAT test account is
granted without a signed contract. These must be confirmed with TWINT AG (merchant onboarding / direct-integrator contact).

## Onboarding steps (as far as publicly documented)
1. Sign a TWINT merchant acceptance contract and register at https://portal.twint.ch.
2. Create a store (e-commerce) → note the **Store UUID**; order the **certificate** and choose its password; download the .p12.
3. Choose a **cash register ID** for the web shop; the integration enrolls it (`EnrollCashRegister`).
4. Test against the PAT environment, then switch `TWINT_ENV=production`.

## Implementation TODO (server/connectors/twint.js)
- mTLS SOAP client (`https.request` with `pfx` + `passphrase`), envelopes built from the bundled WSDL.
- `StartOrder` (CHF only) → return token / QR / app-switch URL to `checkout.js` (UI already polls `/api/payments/twint/status`).
- `MonitorOrder` polling (server-side, plus background reconciliation job), `ConfirmOrder` for deferred orders, `CancelOrder` on abandon / timeout.
- On success: `markPaid()` with `paid_via: "twint"`; refunds via reversal order from Admin.
- Certificate expiry monitoring (`GetCertificateValidity`), never commit the .p12.
