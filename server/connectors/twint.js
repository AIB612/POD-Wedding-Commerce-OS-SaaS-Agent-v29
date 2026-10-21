// TWINT direct merchant integration (TWINT AG Merchant Service, SOAP over mutual TLS) — SKELETON.
//
// What is known from public sources (see docs/twint-direct-integration.md for sources):
//   • Endpoint: https://<host>/merchant/service/TWINTMerchantServiceV<version>
//       production host: service.twint.ch      test (PAT) host: service-pat.twint.ch
//     (hosts/paths as used by TWINT AG's own PHP SDK, github.com/Twint-AG/sdk, src/Value/Environment.php)
//   • Auth: client certificate (.p12, password-protected) issued via the TWINT merchant portal (portal.twint.ch).
//   • Identity: Store UUID ("MerchantUuid") + a cash register id, enrolled once with EnrollCashRegister.
//   • Regular e-commerce flow: StartOrder → customer pays in the TWINT app (QR / numeric token / app switch)
//     → MonitorOrder (poll) → ConfirmOrder (if deferred) or CancelOrder. Refunds via StartOrder with a reversal type.
//   • TWINT AG states the API is not publicly documented and is provided to direct integrators under contract;
//     the WSDL/XSD ships with the official SDK. Nothing below calls TWINT yet — every operation fails closed.
import fs from "node:fs";

const HOSTS = { production: "service.twint.ch", pat: "service-pat.twint.ch" };

function cfg() {
  const env = String(process.env.TWINT_ENV || "pat").toLowerCase() === "production" ? "production" : "pat";
  const version = String(process.env.TWINT_SERVICE_VERSION || "8_5").replace(/\./g, "_");
  return {
    env, version,
    endpoint: process.env.TWINT_ENDPOINT || `https://${HOSTS[env]}/merchant/service/TWINTMerchantServiceV${version}`,
    storeUuid: process.env.TWINT_STORE_UUID || "",
    cashRegisterId: process.env.TWINT_CASH_REGISTER_ID || "",
    certPath: process.env.TWINT_CERT_PATH || "",
    certPassword: process.env.TWINT_CERT_PASSWORD || ""
  };
}

/** All four credentials present and the certificate file readable. Says nothing about the contract being active. */
export function twintConfigured() {
  const c = cfg();
  if (!(c.storeUuid && c.cashRegisterId && c.certPath && c.certPassword)) return false;
  try { fs.accessSync(c.certPath, fs.constants.R_OK); return true; } catch { return false; }
}

/** Non-secret status for the storefront / admin. */
export function twintStatus() {
  const c = cfg();
  return { environment: c.env, implemented: false, missing: ["TWINT_STORE_UUID", "TWINT_CASH_REGISTER_ID", "TWINT_CERT_PATH", "TWINT_CERT_PASSWORD"].filter(k => !process.env[k]) };
}

function notImplemented(op) {
  // TODO(twint): build the SOAP envelope for `op` from the TWINTMerchantService WSDL, send it with
  //   https.request({ pfx: fs.readFileSync(certPath), passphrase: certPassword, ... }) to cfg().endpoint,
  //   parse the response, map TWINT faults to errors. Use TWINT's PAT environment first.
  const e = new Error("twint_not_implemented"); e.op = op; throw e;
}

/** TODO(twint): EnrollCashRegister once per cash register (idempotent; cache the result). */
export async function enrollCashRegister() { return notImplemented("EnrollCashRegister"); }

/**
 * TODO(twint): StartOrder (PAYMENT_IMMEDIATE or PAYMENT_DEFERRED) with MerchantInformation{MerchantUuid, CashRegisterId},
 * OrderRequest{Type, PostingType: GOODS, RequestedAmount{Amount, Currency: CHF}, MerchantTransactionReference}.
 * Should resolve to { orderUuid, status, token, qrCode, twintUrl } (StartOrderResponse: OrderUuid, OrderStatus, Token, QRCode, TwintURL).
 */
export async function startTwintOrder({ amount, currency, merchantReference }) {
  if (currency !== "CHF") throw new Error("twint_chf_only");
  return notImplemented("StartOrder");
}

/** TODO(twint): MonitorOrder(OrderUuid) → map OrderStatus (IN_PROGRESS / SUCCESS / FAILURE) to { status }. */
export async function monitorTwintOrder(orderUuid) { return notImplemented("MonitorOrder"); }

/** TODO(twint): ConfirmOrder for deferred payments, CancelOrder for abandoned ones, reversal for refunds. */
export async function confirmTwintOrder(orderUuid, amount) { return notImplemented("ConfirmOrder"); }
export async function cancelTwintOrder(orderUuid) { return notImplemented("CancelOrder"); }
