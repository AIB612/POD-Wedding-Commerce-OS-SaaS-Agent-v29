import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";

const port=3199,base=`http://127.0.0.1:${port}`,headers={"x-tenant-id":"tenant_demo","x-admin-api-key":"change-me"};
const child=spawn(process.execPath,["server/app.js"],{
  cwd:new URL("../",import.meta.url),
  env:{...process.env,STORE_PERSIST_PATH:"",RATE_LIMIT_DISABLED:"true",PORT:String(port),PUBLIC_BASE_URL:base,ADMIN_API_KEY:"change-me",NODE_ENV:"development",PAYPAL_CLIENT_ID:"",PAYPAL_CLIENT_SECRET:"",SHOPIFY_CLIENT_ID:"",SHOPIFY_REDIRECT_URI:""},
  stdio:["ignore","pipe","pipe"]
});
let logs="";child.stdout.on("data",d=>logs+=d);child.stderr.on("data",d=>logs+=d);

async function waitHealth(){
 for(let i=0;i<60;i++){try{const r=await fetch(base+"/api/health");if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}
 throw new Error("server did not start: "+logs);
}
async function json(url,opt={}){
 const r=await fetch(base+url,{...opt,headers:{...headers,...(opt.headers||{})}});
 const text=await r.text();let d={};try{d=JSON.parse(text)}catch{d={text}}
 return {r,d};
}
const result={};
try{
 await waitHealth();
 for(const page of ["/","/admin.html","/proof.html","/payment-success.html"]){const r=await fetch(base+page);assert.equal(r.status,200);result[`page_${page}`]="pass"}
 let x=await json("/api/health");assert.equal(x.d.ok,true);result.health="pass";
 x=await json("/api/saas/overview");assert.ok(x.d.orders>=3);result.overview="pass";
 x=await json("/api/saas/customers/cust_1/detail");assert.ok(x.d.behavior_events.length>0&&x.d.recommendations.length>0);result.customer360="pass";
 x=await json("/api/saas/logistics/overview");assert.ok(x.d.configured_regions>=5&&x.d.providers.length>=6);result.logistics="pass";
 x=await json("/api/saas/logistics/zones");assert.ok(Array.isArray(x.d)&&x.d.some(z=>z.id==="zone_ch"));result.logistics_zones="pass";
 x=await json("/api/saas/logistics/zones/zone_ch",{method:"POST",headers:{"Content-Type":"application/json","x-action-approved":"true"},body:JSON.stringify({name:"Switzerland",countries:"CH,LI",currency:"CNY",standard_base:42,standard_per_kg:9,express_base:88,express_per_kg:18,free_shipping_threshold:899,tax_mode:"manual_demo",tax_rate:.081,active:true,approved:true})});assert.equal(x.d.id,"zone_ch");result.logistics_zone_save="pass";
 x=await json("/api/saas/logistics/tracking/TRK-DEMO-8821");assert.ok(x.d.timeline.length>=3);result.tracking="pass";
 x=await json("/api/storefront/shipping/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cart:[{sku:"COTTON-PAPER-INVITATION",name:"Cotton Paper Invitation",quantity:10,material:"珠光纸"}],country:"CH",postal_code:"4051",currency:"CNY",shipping_method:"express"})});
 assert.ok(x.r.ok&&x.d.grand_total>x.d.subtotal&&x.d.items[0].unit_price>0&&x.d.selected_shipping==="express"&&x.d.rate_engine);result.storefront_quote="pass";
 x=await json("/api/payments/paypal/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cart:[{sku:"COTTON-PAPER-INVITATION",name:"Cotton Paper Invitation",quantity:10,material:"珠光纸"}],customer:{email:"anna@example.com"},shipping:{country:"CH",postal_code:"4051"},currency:"CNY",shipping_method:"express"})});
 assert.equal(x.r.status,503);assert.equal(x.d.error,"paypal_not_configured");result.paypal_safe_quote="pass";
 x=await json("/api/shopify/oauth/start?shop=test-shop.myshopify.com");assert.equal(x.r.status,400);assert.equal(x.d.error,"shopify_oauth_not_configured");result.shopify_config_guard="pass";
 x=await json("/api/saas/connectors/registry");assert.ok(Array.isArray(x.d)&&x.d.some(c=>c.id==="aftership"));result.connector_registry="pass";
 x=await json("/api/saas/connectors/aftership/config",{method:"POST",headers:{"Content-Type":"application/json","x-action-approved":"true"},body:JSON.stringify({api_key:"test-aftership-key",approved:true,notes:"http flow"})});assert.equal(x.d.configured,true);result.connector_save="pass";
 x=await json("/api/saas/connectors/aftership/test",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});assert.equal(x.d.last_test_status,"configuration_ready");result.connector_test="pass";
 x=await json("/api/saas/logistics/sync-stores",{method:"POST",headers:{"Content-Type":"application/json","x-action-approved":"true"},body:JSON.stringify({approved:true})});assert.ok(x.d.stores.length>=3);result.store_sync="pass";
 const template=await fetch(base+"/api/saas/data/template.xlsx",{headers});assert.ok(template.ok&&(await template.arrayBuffer()).byteLength>1000);result.xlsx_template="pass";
 const exp=await fetch(base+"/api/saas/data/export/shipping_zones?format=xlsx",{headers});assert.ok(exp.ok&&(await exp.arrayBuffer()).byteLength>1000);result.shipping_zone_export="pass";
 const csv='id,name,countries,currency,standard_base,standard_per_kg,express_base,express_per_kg,free_shipping_threshold,tax_mode,tax_rate,active\nzone_http,HTTP Zone,JP,CNY,100,20,200,40,1500,external_required,0,true';
 let r=await fetch(base+"/api/saas/data/import/preview?entity=shipping_zones&format=csv",{method:"POST",headers:{...headers,"x-file-name":"zones.csv","Content-Type":"text/csv"},body:csv});let d=await r.json();assert.ok(r.ok&&d.error_rows===0&&d.preview_token);result.import_preview="pass";
 r=await fetch(base+"/api/saas/data/import/commit",{method:"POST",headers:{...headers,"Content-Type":"application/json","x-action-approved":"true"},body:JSON.stringify({preview_token:d.preview_token,approved:true})});d=await r.json();assert.ok(r.ok&&d.total===1);result.import_commit="pass";
 x=await json("/api/agent/ops",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"检查订单和物流异常"})});assert.ok(x.r.ok&&x.d.intent);result.agent="pass";
 console.log(JSON.stringify({ok:true,result},null,2));
} finally {
 child.kill("SIGTERM");
 await new Promise(r=>setTimeout(r,100));
 if(!child.killed)child.kill("SIGKILL");
}
