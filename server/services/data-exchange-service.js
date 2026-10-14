import zlib from "node:zlib";
import crypto from "node:crypto";
import {listForTenant,addRecord,updateRecord,findRecord} from "../saas-store.js";
import {financeSummary} from "./finance-service.js";

const entitySchemas={
  products:{collection:"products",sheet:"Products",key:"sku",fields:[
    ["id","string",false],["sku","string",true],["name","string",true],["supplier_id","string",false],["supplier_cost","number",true],["inbound_shipping","number",false],["duty","number",false],["packaging","number",false],["base_price","number",true],["inventory","number",false],["scene_tags","array",false]
  ]},
  orders:{collection:"orders",sheet:"Orders",key:"id",fields:[
    ["id","string",true],["store_id","string",true],["external_order_id","string",false],["status","string",true],["payment_status","string",false],["customer_id","string",true],["revenue","number",true],["cogs","number",false],["shipping_cost","number",false],["payment_fee","number",false],["affiliate_commission","number",false],["ad_attributed_cost","number",false],["currency","string",true],["created_at","date",false]
  ]},
  customers:{collection:"customers",sheet:"Customers",key:"email",fields:[
    ["id","string",false],["email","string",true],["name","string",false],["country","string",false],["locale","string",false],["lifetime_value","number",false],["orders","number",false],["favorite_scene","string",false],["acquisition","string",false],["last_seen","date",false],["device","string",false],["traits","array",false],["preferred_categories","array",false],["preferred_materials","array",false],["interests","array",false]
  ]},
  shipments:{collection:"shipments",sheet:"Shipments",key:"tracking_number",fields:[
    ["id","string",false],["order_id","string",true],["carrier","string",true],["tracking_number","string",true],["status","string",true],["eta","date",false],["last_event","string",false]
  ]},
  influencers:{collection:"influencers",sheet:"Creators",key:"handle",fields:[
    ["id","string",false],["platform","string",true],["handle","string",true],["followers","number",false],["engagement_rate","number",false],["country","string",false],["categories","array",false],["estimated_cpm","number",false],["status","string",false]
  ]},
  affiliates:{collection:"affiliates",sheet:"Affiliates",key:"code",fields:[
    ["id","string",false],["name","string",true],["code","string",true],["commission_rate","number",true],["revenue","number",false],["commission_due","number",false],["status","string",false]
  ]},
  campaigns:{collection:"campaigns",sheet:"Campaigns",key:"id",fields:[
    ["id","string",true],["platform","string",true],["name","string",true],["status","string",false],["spend","number",false],["revenue","number",false],["clicks","number",false],["conversions","number",false],["currency","string",false]
  ]},
  shipping_zones:{collection:"shipping_zones",sheet:"Shipping Zones",key:"id",fields:[
    ["id","string",true],["name","string",true],["countries","array",true],["currency","string",true],
    ["standard_base","number",true],["standard_per_kg","number",true],["express_base","number",true],["express_per_kg","number",true],
    ["free_shipping_threshold","number",false],["tax_mode","string",true],["tax_rate","number",false],["active","boolean",false]
  ]}
};

export function listDataEntities(){return Object.entries(entitySchemas).map(([id,s])=>({id,sheet:s.sheet,fields:s.fields.map(([key,type,required])=>({key,type,required}))}));}
export function schemaFor(entity){const s=entitySchemas[entity];if(!s)throw new Error("unsupported_entity");return s;}

function xmlEscape(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}
function xmlUnescape(v){return String(v??"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&")}
function colName(n){let s="";for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
function colIndex(ref){const m=String(ref).match(/^([A-Z]+)/i);if(!m)return 0;let n=0;for(const c of m[1].toUpperCase())n=n*26+c.charCodeAt(0)-64;return n-1}

const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(buf){let c=0xffffffff;for(const b of buf)c=crcTable[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n);return b}function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b}
function zipStore(entries){let offset=0;const locals=[],centrals=[];for(const e of entries){const name=Buffer.from(e.name),data=Buffer.isBuffer(e.data)?e.data:Buffer.from(e.data),crc=crc32(data);const lh=Buffer.concat([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name]);locals.push(lh,data);const ch=Buffer.concat([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);centrals.push(ch);offset+=lh.length+data.length}const central=Buffer.concat(centrals),local=Buffer.concat(locals);const end=Buffer.concat([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(central.length),u32(local.length),u16(0)]);return Buffer.concat([local,central,end])}
// Decompression limits (zip-bomb protection): sizes come from the central directory and are enforced again by zlib.
const MAX_ZIP_ENTRIES=500,MAX_ENTRY_BYTES=40*1024*1024,MAX_TOTAL_BYTES=80*1024*1024;
function unzip(buf){let eocd=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50){eocd=i;break}if(eocd<0)throw new Error("invalid_xlsx_zip");const count=buf.readUInt16LE(eocd+10),centralOffset=buf.readUInt32LE(eocd+16);if(count>MAX_ZIP_ENTRIES)throw new Error("xlsx_too_many_entries");let p=centralOffset,total=0;const out={};for(let i=0;i<count;i++){if(buf.readUInt32LE(p)!==0x02014b50)throw new Error("invalid_xlsx_central");const method=buf.readUInt16LE(p+10),csize=buf.readUInt32LE(p+20),usize=buf.readUInt32LE(p+24),nlen=buf.readUInt16LE(p+28),elen=buf.readUInt16LE(p+30),clen=buf.readUInt16LE(p+32),lo=buf.readUInt32LE(p+42),name=buf.subarray(p+46,p+46+nlen).toString();if(buf.readUInt32LE(lo)!==0x04034b50)throw new Error("invalid_xlsx_local");const ln=buf.readUInt16LE(lo+26),le=buf.readUInt16LE(lo+28),start=lo+30+ln+le,compressed=buf.subarray(start,start+csize);let data;if(method===0)data=compressed;else if(method===8){if(usize>MAX_ENTRY_BYTES||(total+=usize)>MAX_TOTAL_BYTES)throw new Error("xlsx_uncompressed_too_large");data=zlib.inflateRawSync(compressed,{maxOutputLength:Math.max(1,usize)})}else throw new Error("unsupported_xlsx_compression");if(data.length!==usize)throw new Error("xlsx_size_mismatch");out[name]=data;p+=46+nlen+elen+clen}return out}

function worksheetXml(rows){let xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';rows.forEach((row,ri)=>{xml+=`<row r="${ri+1}">`;row.forEach((v,ci)=>{if(v===null||v===undefined||v==="")return;const ref=`${colName(ci)}${ri+1}`;if(typeof v==="number"&&Number.isFinite(v))xml+=`<c r="${ref}"><v>${v}</v></c>`;else if(typeof v==="boolean")xml+=`<c r="${ref}" t="b"><v>${v?1:0}</v></c>`;else xml+=`<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(Array.isArray(v)?v.join(", "):v)}</t></is></c>`});xml+='</row>'});return xml+'</sheetData></worksheet>'}
export function workbookBuffer(sheets){const entries=[];const overrides=sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");entries.push({name:"[Content_Types].xml",data:`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`});entries.push({name:"_rels/.rels",data:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'});entries.push({name:"xl/workbook.xml",data:`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xmlEscape(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`});entries.push({name:"xl/_rels/workbook.xml.rels",data:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}</Relationships>`});sheets.forEach((s,i)=>entries.push({name:`xl/worksheets/sheet${i+1}.xml`,data:worksheetXml(s.rows)}));return zipStore(entries)}

function parseSharedStrings(xml){if(!xml)return[];return [...xml.matchAll(/<(?:\w+:)?si[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>[...m[1].matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(t=>xmlUnescape(t[1])).join(""))}
function parseSheetXml(xml,shared){const rows=[];for(const rm of xml.matchAll(/<(?:\w+:)?row[^>]*r="?(\d+)"?[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)){const ri=Number(rm[1])-1;rows[ri]||=[];for(const cm of rm[2].matchAll(/<(?:\w+:)?c\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g)){const attrs=cm[1],body=cm[2],ref=(attrs.match(/\br="([^"]+)"/)||[])[1],type=(attrs.match(/\bt="([^"]+)"/)||[])[1]||"n",ci=colIndex(ref);let v="";if(type==="inlineStr")v=xmlUnescape(([...body.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(x=>x[1]).join("")));else{const raw=(body.match(/<(?:\w+:)?v[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)||[])[1]??"";if(type==="s")v=shared[Number(raw)]??"";else if(type==="b")v=raw==="1";else if(type==="str")v=xmlUnescape(raw);else v=raw===""?"":Number(raw)}rows[ri][ci]=v}}return rows}
export function parseXlsx(buf,preferredSheet){
  const files=unzip(buf),workbook=files["xl/workbook.xml"]?.toString("utf8");if(!workbook)throw new Error("xlsx_workbook_missing");
  const rels=files["xl/_rels/workbook.xml.rels"]?.toString("utf8")||"",shared=parseSharedStrings(files["xl/sharedStrings.xml"]?.toString("utf8"));
  const relMap={};
  for(const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>(?:<\/(?:\w+:)?Relationship>)?/g)){
    const attrs=m[1],id=(attrs.match(/\bId="([^"]+)"/)||[])[1],target=(attrs.match(/\bTarget="([^"]+)"/)||[])[1];if(id&&target)relMap[id]=target;
  }
  const sheets=[];
  for(const m of workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>(?:<\/(?:\w+:)?sheet>)?/g)){
    const attrs=m[1],name=(attrs.match(/\bname="([^"]+)"/)||[])[1],rid=(attrs.match(/\br:id="([^"]+)"/)||[])[1];if(name&&rid)sheets.push({name:xmlUnescape(name),rid});
  }
  const chosen=sheets.find(s=>s.name.toLowerCase()===String(preferredSheet||"").toLowerCase())||sheets[0];if(!chosen)throw new Error("xlsx_sheet_missing");
  const target=relMap[chosen.rid];if(!target)throw new Error("xlsx_sheet_relationship_missing");
  let full;if(target.startsWith("/"))full=target.slice(1);else full=`xl/${target.replace(/^\.\//,"")}`;
  const xml=files[full]?.toString("utf8");if(!xml)throw new Error("xlsx_sheet_missing");return {sheet:chosen.name,rows:parseSheetXml(xml,shared)};
}

export function parseCsv(text){return parseCsvRaw(text).map(r=>r.map(c=>typeof c==="string"&&/^'[=+\-@\t\r]/.test(c)?c.slice(1):c))}
function parseCsvRaw(text){const rows=[];let row=[],cell="",q=false;for(let i=0;i<=text.length;i++){const c=text[i]??"\n";if(q){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')q=false;else cell+=c}else if(c==='"')q=true;else if(c===','){row.push(cell);cell=""}else if(c==='\n'){row.push(cell.replace(/\r$/, ""));cell="";if(row.some(x=>String(x).trim()!==""))rows.push(row);row=[]}else cell+=c}return rows}
// Spreadsheet formula-injection guard: text cells starting with = + - @ TAB CR get a leading apostrophe,
// so a customer-supplied "=HYPERLINK(...)" is shown as text in Excel. parseCsv strips it again on import.
const FORMULA_START=/^[=+\-@\t\r]/;
function neutralize(v){return typeof v==="string"&&FORMULA_START.test(v)&&!/^-?\d+(\.\d+)?$/.test(v)?"'"+v:v}
export function toCsv(rows){const e=v=>{const s=Array.isArray(v)?neutralize(v.join(", ")):String(neutralize(v)??"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};return rows.map(r=>r.map(e).join(",")).join("\r\n")}
function rowsToObjects(rows){
  if(!rows.length)return {objects:[],startRow:2};
  const headers=rows[0].map(x=>String(x??"").trim());
  const metaRow=(rows[1]||[]).map(x=>String(x??"").trim().toLowerCase());
  const typeRow=(rows[2]||[]).map(x=>String(x??"").trim().toLowerCase());
  const hasTemplateMeta=metaRow.length>0 && metaRow.filter(x=>x==="required"||x==="optional").length>=Math.max(1,Math.floor(headers.length*.6)) && typeRow.some(x=>["string","number","array","date","boolean"].includes(x));
  const startIndex=hasTemplateMeta?3:1;
  const objects=rows.slice(startIndex).filter(r=>r.some(x=>String(x??"").trim()!=="")).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??""])));
  return {objects,startRow:startIndex+1};
}
function asDate(v){if(v===null||v===undefined||v==="")return"";if(typeof v==="number"){const ms=Math.round((v-25569)*86400*1000);return new Date(ms).toISOString().slice(0,10)}const s=String(v).trim();const d=new Date(s);return Number.isNaN(d.valueOf())?s:d.toISOString().slice(0,10)}
function normalizeRow(row,schema,rowNumber){const out={},errors=[];for(const [key,type,required] of schema.fields){let v=row[key];if(v===undefined){const alias=Object.keys(row).find(k=>k.trim().toLowerCase()===key.toLowerCase());v=alias?row[alias]:undefined}if((v===undefined||v===null||String(v).trim()==="")&&required){errors.push({row:rowNumber,field:key,code:"required",message:`${key} is required`});continue}if(v===undefined||v===null||String(v).trim()==="")continue;if(type==="number"){const n=Number(String(v).replace(/[%,$\s]/g,""));if(!Number.isFinite(n))errors.push({row:rowNumber,field:key,code:"number",message:`${key} must be numeric`});else out[key]=n}else if(type==="array")out[key]=Array.isArray(v)?v:String(v).split(/[|,;]/).map(x=>x.trim()).filter(Boolean);else if(type==="date")out[key]=asDate(v);else if(type==="boolean"){const b=String(v).trim().toLowerCase();if(["true","1","yes","y"].includes(b))out[key]=true;else if(["false","0","no","n"].includes(b))out[key]=false;else errors.push({row:rowNumber,field:key,code:"boolean",message:`${key} must be true/false`})}else out[key]=String(v).trim()}return {out,errors}}
export function previewImport({entity,format,buffer}){const schema=schemaFor(entity),parsed=format==="csv"?{sheet:schema.sheet,rows:parseCsv(buffer.toString("utf8"))}:parseXlsx(buffer,schema.sheet),converted=rowsToObjects(parsed.rows),objects=converted.objects,rows=[],errors=[];objects.forEach((r,i)=>{const n=normalizeRow(r,schema,converted.startRow+i);rows.push(n.out);errors.push(...n.errors)});return {entity,sheet:parsed.sheet,total_rows:objects.length,valid_rows:rows.length-new Set(errors.map(e=>e.row)).size,error_rows:new Set(errors.map(e=>e.row)).size,errors,rows}}

function stableId(prefix,value){return `${prefix}_${crypto.createHash("sha1").update(String(value)).digest("hex").slice(0,10)}`}
export async function commitImport({tenantId,entity,rows}){const schema=schemaFor(entity),existing=await listForTenant(schema.collection,tenantId);let inserted=0,updated=0;for(const raw of rows){const n=normalizeRow(raw,schema,0);if(n.errors.length)continue;const row={...n.out,tenant_id:tenantId};if(!row.id)row.id=stableId(entity.slice(0,4),row[schema.key]||crypto.randomUUID());const match=existing.find(x=>x.id===row.id||String(x[schema.key]??"")===String(row[schema.key]??""));if(match){await updateRecord(schema.collection,match.id,row);updated++}else{await addRecord(schema.collection,row);existing.push(row);inserted++}}return {entity,inserted,updated,total:inserted+updated}}

function exportValue(v){return Array.isArray(v)?v.join(", "):v??""}
export async function exportEntity({tenantId,entity,format="xlsx"}){
  if(entity==="all"){
    if(format==="csv")throw new Error("all_export_requires_xlsx");
    const sheets=[];
    for(const s of Object.values(entitySchemas)){const items=await listForTenant(s.collection,tenantId),headers=s.fields.map(x=>x[0]);sheets.push({name:s.sheet,rows:[headers,...items.map(x=>headers.map(h=>exportValue(x[h])))]})}
    const f=await financeSummary(tenantId);sheets.push({name:"Finance",rows:[["metric","value"],...Object.entries(f).filter(([,v])=>typeof v!=="object").map(([k,v])=>[k,v])]});
    return {filename:`commerce-os-backup-${tenantId}.xlsx`,mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:workbookBuffer(sheets)};
  }
  if(entity==="finance"){const f=await financeSummary(tenantId),rows=[["metric","value"],...Object.entries(f).filter(([,v])=>typeof v!=="object").map(([k,v])=>[k,v])];return {filename:`finance-${tenantId}.${format}`,mime:format==="csv"?"text/csv; charset=utf-8":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:format==="csv"?Buffer.from(toCsv(rows)):workbookBuffer([{name:"Finance",rows}])}}
  const s=schemaFor(entity),items=await listForTenant(s.collection,tenantId),headers=s.fields.map(x=>x[0]),rows=[headers,...items.map(x=>headers.map(h=>exportValue(x[h])))];return {filename:`${entity}-${tenantId}.${format}`,mime:format==="csv"?"text/csv; charset=utf-8":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:format==="csv"?Buffer.from(toCsv(rows)):workbookBuffer([{name:s.sheet,rows}])}
}
export function templateWorkbookBuffer(){const intro=[["Wedding Commerce OS Data Import Template"],["Instructions"],["1. Keep the header names unchanged."],["2. Required fields are listed on each sheet."],["3. Array fields accept comma-separated values."],["4. Dates should use YYYY-MM-DD or ISO-8601."],["5. Upload one sheet at a time from Admin > Data Import / Export."]];const sheets=[{name:"Instructions",rows:intro}];for(const s of Object.values(entitySchemas)){const headers=s.fields.map(x=>x[0]),required=s.fields.map(x=>x[2]?"required":"optional"),types=s.fields.map(x=>x[1]);sheets.push({name:s.sheet,rows:[headers,required,types]})}return workbookBuffer(sheets)}
