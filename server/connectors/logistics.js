import {timedFetch} from "../utils/timed-fetch.js";

export function logisticsProviderStatus(){return [
  {id:"aftership",label:"AfterShip Tracking 2026-07",configured:!!process.env.AFTERSHIP_API_KEY,capabilities:["tracking","webhook","eta"]},
  {id:"aftership_shipping",label:"AfterShip Shipping",configured:!!process.env.AFTERSHIP_SHIPPING_API_KEY,capabilities:["rates","labels","carrier_accounts"]},
  {id:"shippo",label:"Shippo",configured:!!process.env.SHIPPO_API_KEY,capabilities:["rates","labels","tracking"]},
  {id:"track17",label:"17TRACK v2.4",configured:!!process.env.TRACK17_API_KEY,capabilities:["tracking"]},
  {id:"dhl",label:"DHL Direct",configured:!!process.env.DHL_API_KEY,capabilities:["rates","labels","tracking"]},
  {id:"ups",label:"UPS Direct",configured:!!process.env.UPS_CLIENT_ID,capabilities:["rates","labels","tracking"]},
  {id:"fedex",label:"FedEx Direct",configured:!!process.env.FEDEX_CLIENT_ID,capabilities:["rates","labels","tracking"]},
  {id:"easypost",label:"EasyPost",configured:!!process.env.EASYPOST_API_KEY,capabilities:["rates","labels","tracking"]},
  {id:"shipstation",label:"ShipStation",configured:!!process.env.SHIPSTATION_API_KEY,capabilities:["orders","labels","tracking"]}
];}

async function aftershipGet(id,apiKey=process.env.AFTERSHIP_API_KEY){
  const r=await timedFetch(`https://api.aftership.com/tracking/2026-07/trackings/${encodeURIComponent(id)}`,{headers:{"as-api-key":apiKey,"Accept":"application/json"}});
  if(!r.ok)throw new Error(`aftership_${r.status}:${await r.text()}`);return r.json();
}
async function track17(number,apiKey=process.env.TRACK17_API_KEY){
  const r=await timedFetch("https://api.17track.net/track/v2.4/gettrackinfo",{method:"POST",headers:{"17token":apiKey,"Content-Type":"application/json"},body:JSON.stringify([{number}])});
  if(!r.ok)throw new Error(`17track_${r.status}:${await r.text()}`);return r.json();
}
export async function getTracking(tracking,credentials={}){
  const aftershipKey=credentials.aftership_api_key||process.env.AFTERSHIP_API_KEY;
  const track17Key=credentials.track17_api_key||process.env.TRACK17_API_KEY;
  const shippoKey=credentials.shippo_api_key||process.env.SHIPPO_API_KEY;
  if(aftershipKey) return {provider:"aftership",raw:await aftershipGet(tracking,aftershipKey)};
  if(track17Key) return {provider:"17track",raw:await track17(tracking,track17Key)};
  if(shippoKey) return {provider:"shippo",tracking,status:"connector-configured",message:"Shippo tracking adapter is configured; map tracking carrier for live Track API in production."};
  const demo={"TRK-DEMO-8821":{carrier:"DHL",status:"In transit",last_checkpoint:"Basel Distribution Center",eta:"3–5 days"},"TRK-DEMO-9912":{carrier:"UPS",status:"Label created",last_checkpoint:"Shipment information received",eta:"7 days"}};
  return demo[tracking]||null;
}

export async function easyPostRates({apiKey,origin,destination,weight_kg=1}){
  if(!apiKey||!origin?.country||!origin?.postal||!destination?.country||!destination?.postal)return null;
  const auth=Buffer.from(`${apiKey}:`).toString("base64"),oz=Math.max(.1,Number(weight_kg||1)*35.27396195);
  const body={shipment:{
    from_address:{country:origin.country,zip:origin.postal,city:origin.city||undefined,street1:origin.address1||undefined},
    to_address:{country:destination.country,zip:destination.postal,city:destination.city||undefined},
    parcel:{weight:Number(oz.toFixed(2)),length:10,width:8,height:2}
  }};
  const r=await timedFetch("https://api.easypost.com/v2/shipments",{method:"POST",headers:{Authorization:`Basic ${auth}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`easypost_${r.status}:${await r.text()}`);
  const data=await r.json();return (data.rates||[]).map(x=>({provider:"easypost",carrier:x.carrier,service:x.service,amount:Number(x.rate),currency:x.currency,delivery_days:x.delivery_days||null})).filter(x=>Number.isFinite(x.amount));
}
