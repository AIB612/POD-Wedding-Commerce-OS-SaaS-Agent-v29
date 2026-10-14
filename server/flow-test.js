import assert from "node:assert/strict";
import fs from "node:fs";
import {overview} from "./services/overview-service.js";
import {financeSummary} from "./services/finance-service.js";
import {customerProfiles,customerProfileDetail} from "./services/profile-service.js";
import {recommendations} from "./services/recommendation-service.js";
import {runOpsCommand} from "./services/agent-ops-service.js";
import {protocolRegistry} from "./protocols/commerce-protocols.js";
import {listDataEntities,templateWorkbookBuffer,parseXlsx,previewImport,exportEntity,commitImport,toCsv,parseCsv} from "./services/data-exchange-service.js";
import {listForTenant} from "./saas-store.js";
import {logisticsOverview,quoteShipping,trackingDetail,syncLogisticsToStores} from "./services/shipping-service.js";
import {connectorRegistry,saveConnectorConfig,testConnector,connectorDetail} from "./services/connector-config-service.js";
import {ensureCarrierService} from "./connectors/shopify-multistore.js";
import {encrypt} from "./utils/crypto.js";

const tenant="tenant_demo";
const result={};

const ov=await overview(tenant);assert.ok(ov.stores>=3&&ov.orders>=3);result.overview="pass";
const fin=await financeSummary(tenant);assert.ok(fin.revenue>0&&fin.contribution_margin>0);result.finance="pass";
const profiles=await customerProfiles(tenant);assert.ok(profiles.length>=3&&profiles.every(x=>x.scores?.intent>=0));result.customer_list="pass";
const detail=await customerProfileDetail(tenant,"cust_1");assert.ok(detail?.orders?.length&&detail.behavior_events?.length&&detail.recommendations?.length);result.customer_detail="pass";
const recs=await recommendations({tenantId:tenant,customerId:"cust_1"});assert.ok(recs.length>0&&typeof recs[0].score==="number");result.recommendations="pass";
const agent=await runOpsCommand({tenantId:tenant,message:"分析广告ROAS并给建议"});assert.equal(agent.intent,"marketing");result.agent="pass";
assert.equal(protocolRegistry().length,4);result.protocols="pass";
assert.ok(listDataEntities().some(x=>x.id==="products")&&listDataEntities().some(x=>x.id==="customers"));result.data_entities="pass";


const logistics=await logisticsOverview(tenant);assert.ok(logistics.configured_regions>=5&&logistics.providers.length>=6);result.logistics_overview="pass";
const shippingQuote=await quoteShipping({tenantId:tenant,country:"DE",postal_code:"10115",subtotal:1200,weight_kg:2.4,currency:"CNY",shipping_method:"express"});assert.equal(shippingQuote.zone.id,"zone_de");assert.ok(shippingQuote.grand_total>shippingQuote.subtotal&&shippingQuote.selected_shipping==="express"&&shippingQuote.rate_engine&&shippingQuote.tax_engine);result.shipping_quote="pass";
const tracking=await trackingDetail(tenant,"TRK-DEMO-8821");assert.ok(tracking.shipment&&tracking.timeline.length>=3);result.tracking_detail="pass";
const storeSync=await syncLogisticsToStores(tenant);assert.ok(storeSync.stores.length>=3);result.shipping_store_sync="pass";
const stagedCarrier=await ensureCarrierService((await listForTenant("stores",tenant)).find(x=>x.provider==="shopify"),{callbackBaseUrl:"https://commerce.example.com"});assert.ok(["staged","registered"].includes(stagedCarrier.status));result.shopify_carrier_staged="pass";
const oldFetch=globalThis.fetch,oldBase=process.env.PUBLIC_BASE_URL;let carrierMutationSeen=false;process.env.PUBLIC_BASE_URL="https://commerce.example.com";globalThis.fetch=async(url,opts)=>{carrierMutationSeen=String(opts?.body||"").includes("carrierServiceCreate");return {ok:true,json:async()=>({data:{carrierServiceCreate:{carrierService:{id:"gid://shopify/DeliveryCarrierService/1",name:"Wedding Commerce OS Rates",callbackUrl:"https://commerce.example.com/callback",active:true,supportsServiceDiscovery:true},userErrors:[]}}})}};
const mockCarrier=await ensureCarrierService({id:"mock_store",tenant_id:tenant,provider:"shopify",domain:"mock.myshopify.com",scopes:"read_orders,write_shipping",token_encrypted:encrypt("mock-token")},{callbackBaseUrl:"https://commerce.example.com"});globalThis.fetch=oldFetch;if(oldBase===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=oldBase;assert.equal(mockCarrier.status,"registered");assert.equal(carrierMutationSeen,true);result.shopify_carrier_register="pass";

assert.ok(connectorRegistry().some(x=>x.id==="aftership_shipping")&&connectorRegistry().some(x=>x.id==="easypost")&&connectorRegistry().some(x=>x.id==="shipstation"));result.connector_registry="pass";
await saveConnectorConfig(tenant,"shippo",{api_key:"test-secret",notes:"flow test"});const cd=await connectorDetail(tenant,"shippo");assert.equal(cd.configured,true);const ct=await testConnector(tenant,"shippo");assert.equal(ct.last_test_status,"configuration_ready");result.connector_config="pass";
await saveConnectorConfig(tenant,"easypost",{api_key:"EZ_TEST",origin_country:"CH",origin_postal:"4051",origin_city:"Basel",origin_address1:"Teststrasse 1"});const fetchBeforeRates=globalThis.fetch;globalThis.fetch=async(url,opts)=>{assert.ok(String(url).includes("api.easypost.com/v2/shipments"));return {ok:true,json:async()=>({rates:[{carrier:"DHLExpress",service:"Express",rate:"31.20",currency:"CHF",delivery_days:2},{carrier:"SwissPost",service:"Economy",rate:"12.40",currency:"CHF",delivery_days:5}]})}};const liveQuote=await quoteShipping({tenantId:tenant,country:"CH",postal_code:"8001",subtotal:220,weight_kg:1,currency:"CHF",shipping_method:"standard"});globalThis.fetch=fetchBeforeRates;assert.equal(liveQuote.rate_engine,"easypost");assert.equal(liveQuote.shipping_amount,12.4);result.tenant_connector_live_rate="pass";
await saveConnectorConfig(tenant,"avalara",{account_id:"AVA_ACCOUNT",license_key:"AVA_LICENSE",company_code:"DEFAULT",environment:"sandbox",origin_country:"CH",origin_postal:"4051",origin_city:"Basel",origin_address1:"Teststrasse 1"});const fetchBeforeTax=globalThis.fetch;globalThis.fetch=async(url,opts)=>{if(String(url).includes("api.easypost.com"))return {ok:true,json:async()=>({rates:[{carrier:"SwissPost",service:"Economy",rate:"12.40",currency:"CHF",delivery_days:5}]})};assert.ok(String(url).includes("sandbox-rest.avatax.com/api/v2/transactions/create"));return {ok:true,json:async()=>({totalTax:18.75,status:"Temporary",code:"tax-test"})}};const taxQuote=await quoteShipping({tenantId:tenant,country:"CH",postal_code:"8001",subtotal:220,weight_kg:1,currency:"CHF",shipping_method:"standard"});globalThis.fetch=fetchBeforeTax;assert.equal(taxQuote.tax_engine,"avalara");assert.equal(taxQuote.tax.amount,18.75);result.tenant_connector_live_tax="pass";



const template=templateWorkbookBuffer();assert.ok(template.length>1000);const parsedTemplate=parseXlsx(template,"Products");assert.equal(parsedTemplate.sheet,"Products");assert.equal(parsedTemplate.rows[0][1],"sku");result.xlsx_template="pass";

const productExport=await exportEntity({tenantId:tenant,entity:"products",format:"xlsx"});assert.ok(productExport.buffer.length>1000);const parsedProducts=parseXlsx(productExport.buffer,"Products");assert.equal(parsedProducts.rows[0][1],"sku");assert.ok(parsedProducts.rows.length>=2);result.xlsx_export="pass";


const polishedTemplate=fs.readFileSync(new URL("../templates/commerce-os-import-template.xlsx",import.meta.url));
const polishedPreview=previewImport({entity:"products",format:"xlsx",buffer:polishedTemplate});assert.equal(polishedPreview.error_rows,0);assert.equal(polishedPreview.valid_rows,1);result.polished_excel_template="pass";
const fullBackup=await exportEntity({tenantId:tenant,entity:"all",format:"xlsx"});assert.ok(fullBackup.buffer.length>5000);assert.equal(parseXlsx(fullBackup.buffer,"Customers").sheet,"Customers");assert.equal(parseXlsx(fullBackup.buffer,"Shipping Zones").sheet,"Shipping Zones");result.full_excel_backup="pass";

const csvExport=await exportEntity({tenantId:tenant,entity:"customers",format:"csv"});const csvRows=parseCsv(csvExport.buffer.toString("utf8"));assert.equal(csvRows[0][1],"email");assert.ok(csvRows.length>=2);result.csv_export="pass";

const importRows=[["id","sku","name","supplier_cost","base_price","inventory","scene_tags"],["","TEST-IMPORT-001","Test Import Product",3.2,12.5,30,"cream, modern"]];
const importBuffer=Buffer.from(toCsv(importRows));const preview=previewImport({entity:"products",format:"csv",buffer:importBuffer});assert.equal(preview.error_rows,0);assert.equal(preview.valid_rows,1);assert.deepEqual(preview.rows[0].scene_tags,["cream","modern"]);result.import_preview="pass";
const committed=await commitImport({tenantId:tenant,entity:"products",rows:preview.rows});assert.equal(committed.total,1);assert.ok((await listForTenant("products",tenant)).some(x=>x.sku==="TEST-IMPORT-001"));result.import_commit="pass";

const zoneCsv=Buffer.from('id,name,countries,currency,standard_base,standard_per_kg,express_base,express_per_kg,free_shipping_threshold,tax_mode,tax_rate,active\nzone_test,Test Zone,JP,CNY,100,20,200,40,1500,external_required,0,true');
const zonePreview=previewImport({entity:"shipping_zones",format:"csv",buffer:zoneCsv});assert.equal(zonePreview.error_rows,0);assert.equal(zonePreview.rows[0].active,true);result.shipping_zone_import="pass";
const invalid=previewImport({entity:"products",format:"csv",buffer:Buffer.from('sku,name,supplier_cost,base_price\nBAD-1,,abc,12')});assert.ok(invalid.error_rows===1&&invalid.errors.length>=2);result.import_validation="pass";

console.log(JSON.stringify({ok:true,result,counts:{customers:profiles.length,behavior_events:detail.behavior_events.length,recommendations:detail.recommendations.length,template_bytes:template.length,export_bytes:productExport.buffer.length}},null,2));
