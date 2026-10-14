import crypto from "node:crypto";
import {encrypt,decrypt} from "../utils/crypto.js";
import {addRecord,listForTenant,updateRecord,getState} from "../saas-store.js";
const states=new Map(); // OAuth state → {tenantId, shop, expires}; single-use, 10 min TTL
const STATE_TTL_MS=10*60_000,TIMEOUT_MS=15_000;
function pruneStates(){const now=Date.now();for(const [k,v] of states) if(v.expires<now) states.delete(k);}
function cleanShop(shop=""){return shop.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"");}
function apiVersion(){return process.env.SHOPIFY_API_VERSION||"2026-10";}
export function buildOAuthStart({shop,tenantId,returnTo=null,connectionId=null}){
  shop=cleanShop(shop);if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new Error("invalid_shop_domain");
  if(!process.env.SHOPIFY_CLIENT_ID||!process.env.SHOPIFY_REDIRECT_URI) throw new Error("shopify_oauth_not_configured");
  pruneStates();const state=crypto.randomBytes(20).toString("hex");states.set(state,{tenantId,shop,returnTo,connectionId,expires:Date.now()+STATE_TTL_MS});
  const q=new URLSearchParams({client_id:process.env.SHOPIFY_CLIENT_ID,scope:process.env.SHOPIFY_SCOPES||"read_products,read_orders",redirect_uri:process.env.SHOPIFY_REDIRECT_URI,state});
  return {state,url:`https://${shop}/admin/oauth/authorize?${q}`};
}
export function verifyCallbackQuery(query){
  const {hmac,...rest}=query;if(!hmac||!process.env.SHOPIFY_CLIENT_SECRET)return false;
  const message=Object.keys(rest).sort().map(k=>`${k}=${Array.isArray(rest[k])?rest[k].join(","):rest[k]}`).join("&");
  const digest=crypto.createHmac("sha256",process.env.SHOPIFY_CLIENT_SECRET).update(message).digest("hex");
  try{return crypto.timingSafeEqual(Buffer.from(digest,"hex"),Buffer.from(String(hmac),"hex"));}catch{return false;}
}
export async function exchangeCode({shop,code,state,query={}}){
  const pending=states.get(state);states.delete(state); // single use
  if(!pending||pending.expires<Date.now()||pending.shop!==cleanShop(shop))throw new Error("invalid_oauth_state");
  if(!verifyCallbackQuery(query)) throw new Error("invalid_shopify_hmac");
  const r=await fetch(`https://${pending.shop}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:process.env.SHOPIFY_CLIENT_ID,client_secret:process.env.SHOPIFY_CLIENT_SECRET,code}),signal:AbortSignal.timeout(TIMEOUT_MS)});
  if(!r.ok)throw new Error(`shopify_token_exchange_failed:${r.status}`);const data=await r.json();
  const existing=(await listForTenant("stores",pending.tenantId)).find(x=>x.domain===pending.shop);
  const meta={return_to:pending.returnTo,connection_id:pending.connectionId};
  if(existing){await updateRecord("stores",existing.id,{status:"connected",token_encrypted:encrypt(data.access_token),scopes:data.scope||""});return {...existing,...meta};}
  return {...(await addRecord("stores",{id:`store_${crypto.randomBytes(5).toString("hex")}`,tenant_id:pending.tenantId,provider:"shopify",name:pending.shop,domain:pending.shop,status:"connected",token_encrypted:encrypt(data.access_token),scopes:data.scope||"",api_version:apiVersion()})),...meta};
}
/** Map a webhook's shop domain to the tenant that connected it (never trust a tenant header from the caller). */
export async function tenantForShop(shopDomain){
  const shop=cleanShop(shopDomain||"");if(!shop)return null;
  const s=await getState();
  return (s.stores||[]).find(x=>x.provider==="shopify"&&x.domain===shop)?.tenant_id||null;
}
export function verifyWebhook(rawBody,hmacHeader){
  if(!process.env.SHOPIFY_CLIENT_SECRET)return false;const digest=crypto.createHmac("sha256",process.env.SHOPIFY_CLIENT_SECRET).update(rawBody).digest("base64");
  try{return crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(hmacHeader||""));}catch{return false;}
}
export async function adminGraphql({domain,token,query,variables={}}){
  const r=await fetch(`https://${cleanShop(domain)}/admin/api/${apiVersion()}/graphql.json`,{method:"POST",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":token},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(TIMEOUT_MS)});
  if(!r.ok)throw new Error(`shopify_graphql_${r.status}:${await r.text()}`);const data=await r.json();if(data.errors)throw new Error(JSON.stringify(data.errors));return data.data;
}
export async function syncProductsDemo(store){
  if(!store?.domain)return {provider:"shopify",count:0,demo:true};
  return {provider:"shopify",store:store.domain,api_version:apiVersion(),count:0,demo:!store.token_encrypted,message:"Configure OAuth token storage/DB to execute live sync."};
}
export async function syncOrdersDemo(store){return {provider:"shopify",store:store?.domain,api_version:apiVersion(),count:0,demo:true};}

/** Registers this app as a Shopify CarrierService (live rates at Shopify checkout).
 *  Returns {status:"registered"|"staged"|"skipped"} — never pretends to be live. */
export async function ensureCarrierService(store,{callbackBaseUrl,name="Wedding Commerce OS Rates"}={}){
  if(!store?.domain||store.provider!=="shopify")return {status:"skipped",reason:"not_shopify"};
  if(!store.token_encrypted)return {status:"staged",reason:"shopify_oauth_token_missing"};
  const scopes=String(store.scopes||"").split(",").map(x=>x.trim());
  if(!scopes.includes("write_shipping"))return {status:"staged",reason:"write_shipping_scope_missing"};
  const base=String(callbackBaseUrl||process.env.PUBLIC_BASE_URL||"").replace(/\/$/,"");
  if(!base||/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base))return {status:"staged",reason:"public_https_base_url_required"};
  if(store.carrier_service_id&&store.carrier_callback_secret)return {status:"registered",carrier_service_id:store.carrier_service_id,callback_url:`${base}/api/shopify/carrier-rates/${store.id}?secret=${encodeURIComponent(store.carrier_callback_secret)}`};
  const secret=store.carrier_callback_secret||crypto.randomBytes(24).toString("hex");
  const callbackUrl=`${base}/api/shopify/carrier-rates/${store.id}?secret=${encodeURIComponent(secret)}`;
  const token=decrypt(store.token_encrypted);
  const query=`mutation CarrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) { carrierServiceCreate(input: $input) { carrierService { id name callbackUrl active supportsServiceDiscovery } userErrors { field message } } }`;
  const data=await adminGraphql({domain:store.domain,token,query,variables:{input:{name,callbackUrl,supportsServiceDiscovery:true,active:true}}});
  const payload=data?.carrierServiceCreate;
  if(payload?.userErrors?.length)throw new Error(`shopify_carrier_service:${payload.userErrors.map(e=>e.message).join("; ")}`);
  if(!payload?.carrierService?.id)throw new Error("shopify_carrier_service_missing_id");
  await updateRecord("stores",store.id,{carrier_service_id:payload.carrierService.id,carrier_callback_secret:secret,carrier_callback_url:callbackUrl,carrier_service_active:payload.carrierService.active});
  return {status:"registered",carrier_service_id:payload.carrierService.id,callback_url:callbackUrl,active:payload.carrierService.active};
}
