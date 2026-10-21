// In-page admin sections for admin.html: Price list (#prices), Fees & tax (#fees), Promo codes (#promos).
// Formerly standalone pages (admin-prices.html, admin-fees.html, admin-promos.html); those URLs now redirect
// to /admin#<section>. Uses the same admin key as the dashboard (passed in via AdminSections.init).
(function(){
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let cfg={getKey:()=>"",askKey:async()=>false,tenant:()=>undefined};
async function api(url,opt={},retry=true){
  const used=cfg.getKey(),t=cfg.tenant();
  const r=await fetch(url,{...opt,headers:{"Content-Type":"application/json","x-admin-api-key":used,"x-action-approved":"true",...(t?{"x-tenant-id":t}:{}),...(opt.headers||{})}});
  if(r.status===401){if(retry&&(cfg.getKey()!==used||await cfg.askKey()))return api(url,opt,false);throw new Error("Admin API key required (ADMIN_API_KEY).")}
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||"failed");return d;
}
const say=(el,ok,text)=>{el.className="adm-msg "+(ok?"ok":"err");el.textContent=text};

// ---------- Price list ----------
function prices(root){
  root.innerHTML=`<div class="query-card adm-bar">
    <input class="ant-input" type="search" data-r="q" placeholder="Search product or material…" aria-label="Search" style="max-width:320px">
    <select class="ant-select" data-r="cat" aria-label="Category" style="max-width:220px"><option value="">All categories</option></select>
    <div class="lang-switch" role="group" aria-label="Currency"><button data-cur="CHF" class="active">CHF</button><button data-cur="EUR">EUR</button></div>
    <button class="ant-btn primary" data-r="save" disabled>Save changes</button><button class="ant-btn" data-r="discard" disabled>Discard</button>
    <span class="adm-msg" data-r="msg" aria-live="polite"></span></div>
  <div class="table-card"><div class="table-toolbar"><strong>Sell prices</strong><span class="adm-meta" data-r="info"></span></div>
  <div class="table-wrap"><table class="adm-table"><thead data-r="thead"></thead><tbody data-r="tbody"></tbody></table></div></div>
  <p class="adm-meta">Prices are per unit at each quantity tier (minimum quantity shown in the column header), charged as shown to customers in the shop, Studio, cart and checkout. The grey value under each field is the original seeded price (base cost + 40% margin).</p>`;
  const $=n=>root.querySelector(`[data-r="${n}"]`);
  let data=null,cur="CHF",edits={};
  const k=r=>`${r.product_id}|${r.material_id}|${cur}`;
  const btns=()=>{const n=Object.keys(edits).length;$("save").disabled=!n;$("discard").disabled=!n;return n};
  function render(){
    const term=$("q").value.trim().toLowerCase(),cat=$("cat").value;
    $("thead").innerHTML=`<tr><th>Product</th><th>Material</th>${data.tiers.map((t,i)=>`<th style="text-align:right">${data.tiers[i+1]?`${t}–${data.tiers[i+1]-1}`:`${t}+`} pcs</th>`).join("")}</tr>`;
    const rows=data.rows.filter(r=>(!cat||r.category===cat)&&(!term||(r.product+" "+r.material+" "+r.product_id).toLowerCase().includes(term)));
    $("tbody").innerHTML=rows.map(r=>{const c=edits[k(r)]||r.prices[cur]||[],seed=r.seed?.[cur]||[];
      return `<tr><td class="adm-p"><b>${esc(r.product)}</b><span>${esc(r.product_id)}</span></td><td>${esc(r.material)}</td>${data.tiers.map((t,i)=>`<td><input class="ant-input adm-num ${edits[k(r)]&&Number(edits[k(r)][i])!==Number(r.prices[cur][i])?"chg":""}" inputmode="decimal" data-k="${esc(k(r))}" data-i="${i}" value="${c[i]==null||c[i]===""?"":(edits[k(r)]?c[i]:Number(c[i]).toFixed(2))}" aria-label="${esc(r.product)} ${esc(r.material)} ${t}+ ${cur}"><span class="adm-seed">${seed[i]!=null?seed[i].toFixed(2):""}</span></td>`).join("")}</tr>`}).join("");
    const n=btns();
    $("info").textContent=`${data.rows.length} rows · ${data.currencies.join(" / ")} · version ${data.version}${data.updated_at?` · last edited ${new Date(data.updated_at).toLocaleString()} by ${data.updated_by}`:" · seeded, not edited yet"}${n?` · ${n} unsaved row(s)`:""}`;
  }
  async function load(){data=await api("/api/saas/prices");const cats=[...new Set(data.rows.map(r=>r.category))].sort();$("cat").innerHTML=`<option value="">All categories</option>`+cats.map(c=>`<option>${esc(c)}</option>`).join("");render()}
  root.addEventListener("input",e=>{const el=e.target;if(!el.dataset.k)return;const [pid,mid,c]=el.dataset.k.split("|"),r=data.rows.find(x=>x.product_id===pid&&x.material_id===mid);const arr=(edits[el.dataset.k]||[...r.prices[c]]);arr[+el.dataset.i]=el.value;const v=Number(el.value);el.classList.toggle("bad",!(v>0));el.classList.toggle("chg",v!==Number(r.prices[c][+el.dataset.i]));if(arr.every((x,i)=>Number(x)===Number(r.prices[c][i])))delete edits[el.dataset.k];else edits[el.dataset.k]=arr;btns()});
  $("q").oninput=render;$("cat").onchange=render;
  root.querySelectorAll("[data-cur]").forEach(b=>b.onclick=()=>{cur=b.dataset.cur;root.querySelectorAll("[data-cur]").forEach(x=>x.classList.toggle("active",x===b));render()});
  $("discard").onclick=()=>{edits={};render()};
  $("save").onclick=async()=>{const changes=Object.entries(edits).map(([kk,p])=>{const [product_id,material_id,currency]=kk.split("|");return {product_id,material_id,currency,prices:p.map(Number)}});
    if(changes.some(c=>c.prices.some(v=>!(v>0))))return say($("msg"),false,"Every price must be a positive amount.");
    $("save").disabled=true;try{const r=await api("/api/saas/prices",{method:"PUT",body:JSON.stringify({changes})});edits={};say($("msg"),true,`Saved ${r.changed} row(s) · version ${r.version}. Live in shop, Studio, cart and checkout.`);await load()}catch(e){say($("msg"),false,e.message);btns()}};
  load().catch(e=>say($("msg"),false,e.message));
}

// ---------- Fees & tax ----------
function fees(root){
  root.innerHTML=`<div class="query-card adm-bar"><button class="ant-btn primary" data-r="save">Save all</button><span class="adm-meta" data-r="info"></span><span class="adm-msg" data-r="msg" aria-live="polite"></span></div>
  <div class="card adm-card"><div class="card-title"><strong>Price display</strong></div><div class="card-body"><label class="adm-tog"><input type="checkbox" data-r="incl"> Sell prices include VAT</label><p class="adm-meta">Default: off. Prices in the price list are <b>excl. VAT</b> and VAT is added and shown separately. When on, list prices are gross and the VAT share is shown as “included”.</p></div></div>
  <div class="card adm-card"><div class="card-title"><strong>VAT rates</strong><span>Per shipping zone, with optional per-country overrides (rate in %)</span></div><div class="card-body"><div class="table-wrap"><table class="adm-table"><thead><tr><th>Zone</th><th>Countries</th><th style="text-align:right">VAT %</th></tr></thead><tbody data-r="taxZones"></tbody></table></div>
    <p class="adm-meta" style="margin-top:12px">Country overrides — one per line, e.g. <code>FR=20</code></p><textarea class="ant-input" data-r="taxCountries" rows="4" style="height:auto;max-width:360px;padding:8px 10px"></textarea></div></div>
  <div class="card adm-card"><div class="card-title"><strong>Shipping rates &amp; carrier days</strong></div><div class="card-body"><p class="adm-meta" style="margin-top:0">Amount = base + weight × per kg (0.12 kg per item, min 0.2 kg); free when the merchandise subtotal reaches “free over” (empty = never). Carrier days (Mon–Fri) are added to the production lead time for “Arrives …” estimates.</p>
    <div class="table-wrap"><table class="adm-table"><thead><tr><th>Zone</th><th>Method</th><th>CHF base</th><th>CHF /kg</th><th>CHF free over</th><th>EUR base</th><th>EUR /kg</th><th>EUR free over</th><th>Days min</th><th>Days max</th></tr></thead><tbody data-r="ship"></tbody></table></div></div></div>
  <div class="card adm-card"><div class="card-title"><strong>Packaging add-ons</strong><span>Per unit, 0 = free</span></div><div class="card-body"><p class="adm-meta" style="margin-top:0">Price per unit for Studio lines that use the add-on. Charged in cart, checkout and PayPal when &gt; 0.</p><div class="table-wrap"><table class="adm-table"><thead><tr><th>Add-on</th><th>CHF</th><th>EUR</th></tr></thead><tbody data-r="pack"></tbody></table></div></div></div>
  <div class="card adm-card"><div class="card-title"><strong>Production</strong></div><div class="card-body"><label class="form-item" style="max-width:320px"><span>Default production days (non-Studio products)</span><input class="ant-input adm-num w" data-r="prodDays" inputmode="numeric"></label></div></div>`;
  const $=n=>root.querySelector(`[data-r="${n}"]`);let F=null;
  const inp=(p,v,cls="")=>`<input class="ant-input adm-num ${cls}" inputmode="decimal" data-p="${p}" value="${v==null?"":esc(v)}">`;
  function render(){
    $("incl").checked=!!F.prices_include_vat;$("prodDays").value=F.default_production_days??3;
    $("taxZones").innerHTML=Object.entries(F.shipping).map(([z,v])=>`<tr><td><b>${esc(v.name||z)}</b><br><span class="adm-meta">${esc(z)}</span></td><td class="adm-meta" style="white-space:normal">${esc((v.countries||[]).join(", "))}</td><td style="text-align:right">${inp("tax.zones."+z,Math.round((F.tax.zones[z]||0)*10000)/100)}</td></tr>`).join("");
    $("taxCountries").value=Object.entries(F.tax.countries||{}).map(([c,r])=>`${c}=${Math.round(r*10000)/100}`).join("\n");
    $("ship").innerHTML=Object.entries(F.shipping).flatMap(([z,v])=>["standard","express"].map(m=>{const t=v[m];return `<tr><td>${m==="standard"?`<b>${esc(v.name||z)}</b>`:""}</td><td>${m}</td>${["CHF","EUR"].flatMap(c=>[inp(`shipping.${z}.${m}.${c}.base`,t[c].base),inp(`shipping.${z}.${m}.${c}.per_kg`,t[c].per_kg),inp(`shipping.${z}.${m}.${c}.free_over`,t[c].free_over)]).map(x=>`<td>${x}</td>`).join("")}<td>${inp(`shipping.${z}.${m}.days.0`,t.days[0],"w")}</td><td>${inp(`shipping.${z}.${m}.days.1`,t.days[1],"w")}</td></tr>`})).join("");
    $("pack").innerHTML=Object.entries(F.packaging).map(([id,v])=>`<tr><td><b>${esc(v.name||id)}</b><br><span class="adm-meta">${esc(id)}</span></td><td>${inp(`packaging.${id}.CHF`,v.CHF)}</td><td>${inp(`packaging.${id}.EUR`,v.EUR)}</td></tr>`).join("");
    $("info").textContent=`version ${F.version}${F.updated_at?` · last edited ${new Date(F.updated_at).toLocaleString()} by ${F.updated_by}`:" · seeded from previous values, not edited yet"}`;
  }
  function collect(){
    const b={prices_include_vat:$("incl").checked,default_production_days:Number($("prodDays").value),tax:{zones:{},countries:{}},shipping:{},packaging:{}};
    root.querySelectorAll("[data-p]").forEach(el=>{const p=el.dataset.p.split("."),raw=el.value.trim();
      if(p[0]==="tax"){b.tax.zones[p[2]]=Number(raw)/100;return}
      if(p[0]==="packaging"){(b.packaging[p[1]]||={})[p[2]]=Number(raw||0);return}
      const [,z,m,c,f]=p,t=((b.shipping[z]||={})[m]||={});
      if(c==="days"){(t.days||=[])[+f]=Number(raw);return}
      (t[c]||={})[f]=f==="free_over"&&raw===""?null:Number(raw)});
    for(const line of $("taxCountries").value.split(/\n+/)){const m=/^\s*([A-Za-z]{2})\s*=\s*([\d.]+)\s*%?\s*$/.exec(line);if(m)b.tax.countries[m[1].toUpperCase()]=Number(m[2])/100}
    return b;
  }
  $("save").onclick=async()=>{$("save").disabled=true;try{F=await api("/api/saas/fees",{method:"PUT",body:JSON.stringify(collect())});render();say($("msg"),true,`Saved · version ${F.version}. Live in cart, checkout, PayPal, confirmation and e-mails.`)}catch(e){say($("msg"),false,e.message)}finally{$("save").disabled=false}};
  api("/api/saas/fees").then(f=>{F=f;render()}).catch(e=>say($("msg"),false,e.message));
}

// ---------- Promo codes ----------
function promos(root){
  root.innerHTML=`<form class="query-card adm-form" data-r="f" novalidate>
    <h2 data-r="fTitle">New promo code</h2>
    <label class="form-item"><span>Code</span><input class="ant-input" data-r="code" required maxlength="32" autocapitalize="characters" placeholder="WEDDING10"></label>
    <label class="form-item"><span>Type</span><select class="ant-select" data-r="type"><option value="percent">Percent off</option><option value="fixed">Fixed amount</option></select></label>
    <label class="form-item" data-r="lValue"><span>Percent (%)</span><input class="ant-input" data-r="value" inputmode="decimal" placeholder="10"></label>
    <label class="form-item" data-r="lChf"><span>Amount CHF</span><input class="ant-input" data-r="chf" inputmode="decimal"></label>
    <label class="form-item" data-r="lEur"><span>Amount EUR</span><input class="ant-input" data-r="eur" inputmode="decimal"></label>
    <label class="form-item"><span>Min. order CHF</span><input class="ant-input" data-r="minChf" inputmode="decimal" placeholder="0"></label>
    <label class="form-item"><span>Min. order EUR</span><input class="ant-input" data-r="minEur" inputmode="decimal" placeholder="0"></label>
    <label class="form-item"><span>Expires</span><input class="ant-input" data-r="exp" type="date"></label>
    <label class="form-item"><span>Usage limit</span><input class="ant-input" data-r="limit" inputmode="numeric" placeholder="unlimited"></label>
    <label class="adm-tog"><input type="checkbox" data-r="active" checked> Active</label>
    <div style="display:flex;gap:8px;align-items:end"><button class="ant-btn primary" data-r="saveBtn">Create</button><button class="ant-btn" type="button" data-r="cancelEdit" hidden>Cancel</button></div>
    <span class="adm-msg" data-r="msg" aria-live="polite" style="grid-column:1/-1;margin:0"></span>
  </form>
  <div class="table-card"><div class="table-toolbar"><strong>Promo codes</strong><span class="adm-meta">One code per order, applied after volume tiers</span></div><div class="table-wrap"><table class="adm-table"><thead><tr><th>Code</th><th>Discount</th><th>Min. order</th><th>Expires</th><th>Used</th><th>Status</th><th></th></tr></thead><tbody data-r="rows"></tbody></table></div></div>
  <p class="adm-meta">Usage counts only paid (captured) orders. Codes are validated on the server for every quote and again when the payment is created.</p>`;
  const $=n=>root.querySelector(`[data-r="${n}"]`);let list=[],editing=null;
  const typeUi=()=>{const p=$("type").value==="percent";$("lValue").hidden=!p;$("lChf").hidden=p;$("lEur").hidden=p};
  const disc=p=>p.type==="percent"?`${p.value}%`:[p.amounts?.CHF?`CHF ${p.amounts.CHF.toFixed(2)}`:"",p.amounts?.EUR?`EUR ${p.amounts.EUR.toFixed(2)}`:""].filter(Boolean).join(" / ");
  function render(){
    $("rows").innerHTML=list.map(p=>{const exp=p.expires_at&&Date.parse(p.expires_at)<Date.now(),full=p.usage_limit!=null&&p.used_count>=p.usage_limit;
      return `<tr><td><b>${esc(p.code)}</b></td><td>${esc(disc(p))}</td><td class="adm-meta">${[p.min_order?.CHF?`CHF ${p.min_order.CHF}`:"",p.min_order?.EUR?`EUR ${p.min_order.EUR}`:""].filter(Boolean).join(" / ")||"—"}</td><td>${p.expires_at?esc(p.expires_at.slice(0,10)):"—"}</td><td>${p.used_count||0}${p.usage_limit!=null?` / ${p.usage_limit}`:""}</td>
      <td><span class="tag ${!p.active?"":exp||full?"red":"green"}">${!p.active?"Inactive":exp?"Expired":full?"Used up":"Active"}</span></td>
      <td style="white-space:nowrap"><button class="ant-btn" data-edit="${esc(p.id)}">Edit</button> <button class="ant-btn" data-tog="${esc(p.id)}">${p.active?"Deactivate":"Activate"}</button> <button class="ant-btn" data-del="${esc(p.id)}">Delete</button></td></tr>`}).join("")||`<tr><td colspan="7" class="adm-meta">No promo codes yet.</td></tr>`;
  }
  async function load(){list=(await api("/api/saas/promos")).promos;render()}
  function fill(p){editing=p?.id||null;$("fTitle").textContent=p?`Edit ${p.code}`:"New promo code";$("saveBtn").textContent=p?"Save":"Create";$("cancelEdit").hidden=!p;
    $("code").value=p?.code||"";$("type").value=p?.type||"percent";$("value").value=p?.type==="percent"?p.value:"";$("chf").value=p?.amounts?.CHF||"";$("eur").value=p?.amounts?.EUR||"";$("minChf").value=p?.min_order?.CHF||"";$("minEur").value=p?.min_order?.EUR||"";$("exp").value=p?.expires_at?.slice(0,10)||"";$("limit").value=p?.usage_limit??"";$("active").checked=p?p.active!==false:true;typeUi()}
  $("type").onchange=typeUi;$("cancelEdit").onclick=()=>fill(null);
  $("f").onsubmit=async e=>{e.preventDefault();const b={code:$("code").value,type:$("type").value,value:Number($("value").value||0),amounts:{CHF:Number($("chf").value||0),EUR:Number($("eur").value||0)},min_order:{CHF:Number($("minChf").value||0),EUR:Number($("minEur").value||0)},expires_at:$("exp").value?$("exp").value+"T23:59:59Z":null,usage_limit:$("limit").value===""?null:Number($("limit").value),active:$("active").checked};
    try{await api(editing?`/api/saas/promos/${editing}`:"/api/saas/promos",{method:editing?"PUT":"POST",body:JSON.stringify(b)});say($("msg"),true,editing?"Saved.":"Created.");fill(null);await load()}catch(err){say($("msg"),false,err.message)}};
  $("rows").onclick=async e=>{const b=e.target.closest("button");if(!b)return;const p=list.find(x=>x.id===(b.dataset.edit||b.dataset.tog||b.dataset.del));if(!p)return;
    if(b.dataset.edit)return fill(p);
    try{if(b.dataset.tog)await api(`/api/saas/promos/${p.id}`,{method:"PUT",body:JSON.stringify({active:!p.active})});else if(confirm(`Delete ${p.code}?`))await api(`/api/saas/promos/${p.id}`,{method:"DELETE"});await load()}catch(err){say($("msg"),false,err.message)}};
  typeUi();load().catch(e=>say($("msg"),false,e.message));
}

const mounts={prices,fees,promos},mounted=new Set();
window.AdminSections={
  ids:Object.keys(mounts),
  init(o){cfg={...cfg,...o}},
  // Renders a section into its container the first time it is shown.
  mount(id){if(!mounts[id]||mounted.has(id))return;const el=document.getElementById(id+"Section");if(!el)return;mounted.add(id);mounts[id](el)}
};
})();
