import crypto from "node:crypto";
import {addRecord,findRecord,updateRecord} from "../saas-store.js";
import {encrypt,decrypt} from "../utils/crypto.js";

const registry={
  shopify:{label:"Shopify",group:"commerce",description:"Multi-store OAuth, products, orders, fulfillment, shipping.",fields:[["client_id","SHOPIFY_CLIENT_ID",false],["client_secret","SHOPIFY_CLIENT_SECRET",true],["redirect_uri","SHOPIFY_REDIRECT_URI",false]],docs:"docs/DEPLOYMENT.md#shopify"},
  paypal:{label:"PayPal",group:"payment",description:"Orders, capture, refund and payment webhook.",fields:[["client_id","PAYPAL_CLIENT_ID",false],["client_secret","PAYPAL_CLIENT_SECRET",true],["webhook_id","PAYPAL_WEBHOOK_ID",true]],docs:"docs/SHOPIFY_PAYPAL_SETUP.md"},
  aftership:{label:"AfterShip Tracking",group:"logistics",description:"Tracking API / webhook, API version 2026-07.",fields:[["api_key","AFTERSHIP_API_KEY",true],["webhook_secret","AFTERSHIP_WEBHOOK_SECRET",true]],docs:"docs/LOGISTICS.md"},
  aftership_shipping:{label:"AfterShip Shipping",group:"logistics",description:"Carrier accounts, shipping rates, labels and shipping operations.",fields:[["api_key","AFTERSHIP_SHIPPING_API_KEY",true]],docs:"docs/LOGISTICS.md"},
  shippo:{label:"Shippo",group:"logistics",description:"Shipping rates, labels and tracking.",fields:[["api_key","SHIPPO_API_KEY",true]],docs:"docs/LOGISTICS.md"},
  track17:{label:"17TRACK",group:"logistics",description:"Carrier tracking aggregation.",fields:[["api_key","TRACK17_API_KEY",true]],docs:"docs/LOGISTICS.md"},
  dhl:{label:"DHL",group:"logistics",description:"Direct DHL carrier adapter.",fields:[["api_key","DHL_API_KEY",true],["account_number","DHL_ACCOUNT_NUMBER",true]],docs:"docs/LOGISTICS.md"},
  ups:{label:"UPS",group:"logistics",description:"Direct UPS carrier adapter.",fields:[["client_id","UPS_CLIENT_ID",false],["client_secret","UPS_CLIENT_SECRET",true]],docs:"docs/LOGISTICS.md"},
  fedex:{label:"FedEx",group:"logistics",description:"Direct FedEx carrier adapter.",fields:[["client_id","FEDEX_CLIENT_ID",false],["client_secret","FEDEX_CLIENT_SECRET",true],["account_number","FEDEX_ACCOUNT_NUMBER",true]],docs:"docs/LOGISTICS.md"},
  easypost:{label:"EasyPost",group:"logistics",description:"Rates, labels and tracking aggregation.",fields:[["api_key","EASYPOST_API_KEY",true],["origin_country","SHIPPING_ORIGIN_COUNTRY",false],["origin_postal","SHIPPING_ORIGIN_POSTAL",false],["origin_city","SHIPPING_ORIGIN_CITY",false],["origin_address1","SHIPPING_ORIGIN_ADDRESS1",false]],docs:"docs/LOGISTICS.md"},
  shipstation:{label:"ShipStation",group:"logistics",description:"Shipping orders, carrier labels and tracking.",fields:[["api_key","SHIPSTATION_API_KEY",true],["api_secret","SHIPSTATION_API_SECRET",true]],docs:"docs/LOGISTICS.md"},
  avalara:{label:"Avalara AvaTax",group:"tax",description:"External tax calculation for supported jurisdictions.",fields:[["account_id","AVALARA_ACCOUNT_ID",false],["license_key","AVALARA_LICENSE_KEY",true],["company_code","AVALARA_COMPANY_CODE",false],["environment","AVALARA_ENV",false],["origin_country","SHIPPING_ORIGIN_COUNTRY",false],["origin_postal","SHIPPING_ORIGIN_POSTAL",false],["origin_city","SHIPPING_ORIGIN_CITY",false],["origin_address1","SHIPPING_ORIGIN_ADDRESS1",false]],docs:"docs/LOGISTICS.md"},
  google_ads:{label:"Google Ads",group:"marketing",description:"Campaign reporting and operations.",fields:[["developer_token","GOOGLE_ADS_DEVELOPER_TOKEN",true],["client_id","GOOGLE_ADS_CLIENT_ID",false],["client_secret","GOOGLE_ADS_CLIENT_SECRET",true],["refresh_token","GOOGLE_ADS_REFRESH_TOKEN",true]],docs:"docs/API_CREDENTIALS_MATRIX.md"},
  meta:{label:"Meta",group:"marketing",description:"Ads insights, Instagram / Facebook APIs.",fields:[["app_id","META_APP_ID",false],["app_secret","META_APP_SECRET",true],["system_user_token","META_SYSTEM_USER_TOKEN",true]],docs:"docs/API_CREDENTIALS_MATRIX.md"},
  tiktok:{label:"TikTok",group:"marketing",description:"Ads, creator and business messaging adapters.",fields:[["app_id","TIKTOK_APP_ID",false],["app_secret","TIKTOK_APP_SECRET",true],["access_token","TIKTOK_ACCESS_TOKEN",true]],docs:"docs/API_CREDENTIALS_MATRIX.md"},
  openai:{label:"OpenAI",group:"ai",description:"Commerce Ops Agent / RAG LLM provider.",fields:[["api_key","OPENAI_API_KEY",true],["model","OPENAI_MODEL",false]],docs:"docs/AGENT_OPERATING_MODEL.md"},
  email:{label:"Email Provider",group:"messaging",description:"SendGrid / Postmark delivery.",fields:[["sendgrid_api_key","SENDGRID_API_KEY",true],["postmark_server_token","POSTMARK_SERVER_TOKEN",true],["from_email","FROM_EMAIL",false]],docs:"docs/API_CREDENTIALS_MATRIX.md"},
  whatsapp:{label:"WhatsApp Business",group:"messaging",description:"Outbound / inbound business messaging.",fields:[["access_token","WHATSAPP_ACCESS_TOKEN",true],["phone_number_id","WHATSAPP_PHONE_NUMBER_ID",false]],docs:"docs/API_CREDENTIALS_MATRIX.md"}
};

const requiredFields={
  shopify:["client_id","client_secret","redirect_uri"],paypal:["client_id","client_secret"],
  aftership:["api_key"],aftership_shipping:["api_key"],shippo:["api_key"],track17:["api_key"],dhl:["api_key"],
  ups:["client_id","client_secret"],fedex:["client_id","client_secret"],easypost:["api_key"],shipstation:["api_key","api_secret"],
  avalara:["account_id","license_key"],google_ads:["developer_token","client_id","client_secret","refresh_token"],
  meta:["app_id","app_secret","system_user_token"],tiktok:["app_id","app_secret","access_token"],openai:["api_key"],
  email:[],whatsapp:["access_token","phone_number_id"]
};

export function connectorRegistry(){return Object.entries(registry).map(([id,x])=>connectorStatus(id,x));}
function connectorStatus(id,x=registry[id]){
  if(!x)return null;
  const required=new Set(requiredFields[id]||[]),fields=x.fields.map(([key,env,secret])=>({key,env,secret,required:required.has(key),configured:!!process.env[env]}));
  const must=fields.filter(f=>f.required),configured=must.length?must.every(f=>f.configured):fields.some(f=>f.configured);
  return {id,label:x.label,group:x.group,description:x.description,docs:x.docs,configured,configured_fields:fields.filter(f=>f.configured).length,total_fields:fields.length,fields};
}
export async function connectorDetail(tenantId,id){
  const base=connectorStatus(id);if(!base)return null;
  const saved=await findRecord("connector_configs",`conn_${tenantId}_${id}`);
  const savedFields=saved?.field_status||{};
  const fields=base.fields.map(f=>({...f,configured:f.configured||!!savedFields[f.key]}));
  const must=fields.filter(f=>f.required),configured=must.length?must.every(f=>f.configured):fields.some(f=>f.configured);
  return {...base,
    configured,configured_fields:fields.filter(f=>f.configured).length,total_fields:fields.length,
    fields,
    enabled:saved?.enabled ?? true,
    last_test_at:saved?.last_test_at||null,
    last_test_status:saved?.last_test_status||"not_tested",
    webhook_url:saved?.webhook_url||null,
    notes:saved?.notes||null
  };
}
export async function saveConnectorConfig(tenantId,id,payload={}){
  const def=registry[id];if(!def)throw new Error("unknown_connector");
  const encrypted_fields={},field_status={};
  for(const [key,,secret] of def.fields){
    if(payload[key]!==undefined&&String(payload[key]).trim()!==""){
      encrypted_fields[key]=encrypt(String(payload[key]).trim());
      field_status[key]=true;
    }
  }
  const recordId=`conn_${tenantId}_${id}`;
  const existing=await findRecord("connector_configs",recordId);
  const patch={
    tenant_id:tenantId,connector_id:id,enabled:payload.enabled!==false,
    encrypted_fields:{...(existing?.encrypted_fields||{}),...encrypted_fields},
    field_status:{...(existing?.field_status||{}),...field_status},
    webhook_url:payload.webhook_url||existing?.webhook_url||null,
    notes:payload.notes||existing?.notes||null,
    updated_at:new Date().toISOString()
  };
  if(existing)await updateRecord("connector_configs",recordId,patch);
  else await addRecord("connector_configs",{id:recordId,...patch,created_at:new Date().toISOString()});
  return connectorDetail(tenantId,id);
}
export async function testConnector(tenantId,id){
  const d=await connectorDetail(tenantId,id);if(!d)throw new Error("unknown_connector");
  const status=d.configured?"configuration_ready":"credentials_missing";
  const recordId=`conn_${tenantId}_${id}`,existing=await findRecord("connector_configs",recordId);
  const patch={last_test_at:new Date().toISOString(),last_test_status:status};
  if(existing)await updateRecord("connector_configs",recordId,patch);
  else await addRecord("connector_configs",{id:recordId,tenant_id:tenantId,connector_id:id,enabled:true,field_status:{},...patch});
  return {...d,last_test_at:patch.last_test_at,last_test_status:status,live_call:false,message:status==="configuration_ready"?"Credential presence check passed. Use provider sandbox/live test after adding production credentials.":"Add required credentials before live test."};
}


export async function getConnectorCredentials(tenantId,id){
  const def=registry[id];if(!def)return null;
  const saved=await findRecord("connector_configs",`conn_${tenantId}_${id}`),out={};
  for(const [key,env] of def.fields){
    const token=saved?.encrypted_fields?.[key];
    if(token){try{out[key]=decrypt(token)}catch{} }
    if((out[key]===undefined||out[key]==="")&&process.env[env])out[key]=process.env[env];
  }
  out.enabled=saved?.enabled!==false;
  return out;
}
