import {timedFetch} from "../utils/timed-fetch.js";
function auth(accountId,licenseKey){return Buffer.from(`${accountId}:${licenseKey}`).toString("base64")}
export async function avalaraEstimate({accountId,licenseKey,companyCode="DEFAULT",environment="sandbox",origin,destination,subtotal=0,shipping=0,currency="USD"}){
  if(!accountId||!licenseKey||!origin?.country||!origin?.postal||!destination?.country||!destination?.postal)return null;
  const base=environment==="production"?"https://rest.avatax.com":"https://sandbox-rest.avatax.com";
  const body={type:"SalesOrder",companyCode,date:new Date().toISOString().slice(0,10),customerCode:"STOREFRONT",currencyCode:currency,commit:false,
    addresses:{shipFrom:{line1:origin.address1||undefined,city:origin.city||undefined,region:origin.region||undefined,postalCode:origin.postal,country:origin.country},shipTo:{city:destination.city||undefined,region:destination.region||undefined,postalCode:destination.postal,country:destination.country}},
    lines:[{number:"1",quantity:1,amount:Number(subtotal||0),taxCode:"P0000000",itemCode:"CART",description:"Storefront merchandise"},...(Number(shipping)>0?[{number:"2",quantity:1,amount:Number(shipping),taxCode:"FR",itemCode:"FREIGHT",description:"Shipping"}]:[])]};
  const r=await timedFetch(`${base}/api/v2/transactions/create`,{method:"POST",headers:{Authorization:`Basic ${auth(accountId,licenseKey)}`,"X-Avalara-Client":"WeddingCommerceOS; 3.4.0","Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`avalara_${r.status}:${await r.text()}`);
  const data=await r.json();return {amount:Number(data.totalTax||0),code:data.code||null,status:data.status||null,raw_summary:data.summary||null};
}
