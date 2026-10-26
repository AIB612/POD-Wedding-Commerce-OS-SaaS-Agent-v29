// In-page admin sections for admin.html: Price list (#prices), Fees & tax (#fees), Promo codes (#promos), Shopify (#shopify).
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
  <div class="card adm-card"><div class="card-title"><strong>Shopify FX rates</strong><span>CHF → store currency, used when pushing products to a Shopify store that does not sell in CHF</span></div><div class="card-body"><p class="adm-meta" style="margin-top:0">Market rates are fetched automatically on startup and daily (open.er-api.com, fallback ECB) and used for any store currency. If a fetch fails the last stored rates stay in use.</p><p class="adm-meta" data-r="fxm"></p><p class="adm-meta">Optional manual overrides, one per line, units per 1 CHF, e.g. <code>HKD=9.6</code>. Leave empty to follow the market.</p><textarea class="ant-input" data-r="fx" rows="3" style="height:auto;max-width:360px;padding:8px 10px"></textarea><div><button type="button" class="ant-btn" data-r="fxsync" style="margin-top:8px">Refresh market rates now</button></div></div></div>
  <div class="card adm-card"><div class="card-title"><strong>Production</strong></div><div class="card-body"><label class="form-item" style="max-width:320px"><span>Default production days (non-Studio products)</span><input class="ant-input adm-num w" data-r="prodDays" inputmode="numeric"></label></div></div>`;
  const $=n=>root.querySelector(`[data-r="${n}"]`);let F=null;
  const inp=(p,v,cls="")=>`<input class="ant-input adm-num ${cls}" inputmode="decimal" data-p="${p}" value="${v==null?"":esc(v)}">`;
  function render(){
    $("incl").checked=!!F.prices_include_vat;$("prodDays").value=F.default_production_days??3;
    $("taxZones").innerHTML=Object.entries(F.shipping).map(([z,v])=>`<tr><td><b>${esc(v.name||z)}</b><br><span class="adm-meta">${esc(z)}</span></td><td class="adm-meta" style="white-space:normal">${esc((v.countries||[]).join(", "))}</td><td style="text-align:right">${inp("tax.zones."+z,Math.round((F.tax.zones[z]||0)*10000)/100)}</td></tr>`).join("");
    $("fx").value=Object.entries(F.fx_overrides||{}).map(([c,r])=>`${c}=${r}`).join("\n");
    {const M=F.fx_market,E=F.fx_effective||{},main=["EUR","USD","HKD","GBP"].filter(c=>E[c]).map(c=>`${c} ${E[c]}`).join(" · ");$("fxm").innerHTML=M?`In use: <b>${esc(main)}</b> (+${Math.max(0,Object.keys(E).length-5)} more)<br>Last updated ${esc(new Date(M.fetched_at).toLocaleString())} from ${esc(M.source)}${M.as_of?` (rates as of ${esc(new Date(M.as_of).toLocaleString())})`:""}${M.last_error?`<br><span style="color:#b42318">Last refresh failed ${esc(new Date(M.last_error_at).toLocaleString())}: ${esc(M.last_error)}</span>`:""}`:`No market rates fetched yet, using stored rates: ${esc(main)}`;}
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
    b.fx_overrides={};for(const line of $("fx").value.split(/\n+/)){const m=/^\s*([A-Za-z]{3})\s*=\s*([\d.]+)\s*$/.exec(line);if(m)b.fx_overrides[m[1].toUpperCase()]=Number(m[2])}
    return b;
  }
  $("save").onclick=async()=>{$("save").disabled=true;try{await api("/api/saas/fees",{method:"PUT",body:JSON.stringify(collect())});F=await api("/api/saas/fees");render();say($("msg"),true,`Saved · version ${F.version}. Live in cart, checkout, PayPal, confirmation and e-mails.`)}catch(e){say($("msg"),false,e.message)}finally{$("save").disabled=false}};
  $("fxsync").onclick=async()=>{$("fxsync").disabled=true;try{const r=await api("/api/saas/fx/sync",{method:"POST",body:"{}"});F=await api("/api/saas/fees");render();say($("msg"),r.ok,r.ok?`Market rates refreshed from ${r.source}.`:`Refresh failed, kept last rates: ${r.error}`)}catch(e){say($("msg"),false,e.message)}finally{$("fxsync").disabled=false}};
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

// ---------- Shopify ----------
function shopify(root){
  root.innerHTML=`<div class="query-card adm-bar"><input class="ant-input" data-r="shop" placeholder="your-store.myshopify.com" aria-label="Shop domain" style="max-width:320px"><button class="ant-btn shopify primary" data-r="connect">Connect shop</button><button class="ant-btn" data-r="reload">Refresh</button><span class="adm-meta" data-r="info"></span><span class="adm-msg" data-r="msg" aria-live="polite"></span></div>
  <div class="card adm-card"><div class="card-title"><strong>Connected shops</strong><span data-r="cfg"></span></div><div class="card-body"><div class="table-wrap"><table class="adm-table"><thead><tr><th>Shop</th><th>Status</th><th>Scopes</th><th>Installed</th><th>Uninstalled</th></tr></thead><tbody data-r="shops"></tbody></table></div></div></div>
  <div class="card adm-card"><div class="card-title"><strong>Push product</strong><span>Creates or updates the product on Shopify via productSet (Price list CHF, lowest quantity tier, converted to the store currency with Fees &amp; tax → Shopify FX rates)</span></div><div class="card-body"><div class="adm-bar" style="padding:0"><select class="ant-select" data-r="target" aria-label="Shop" style="max-width:260px"></select><select class="ant-select" data-r="product" aria-label="Product" style="max-width:300px"></select><button class="ant-btn primary" data-r="push">Push to Shopify</button><span class="adm-msg" data-r="pmsg" aria-live="polite"></span></div>
    <div class="table-wrap" style="margin-top:12px"><table class="adm-table"><thead><tr><th>Shop</th><th>Local product</th><th>Shopify product</th><th>Variants</th><th>Last push</th></tr></thead><tbody data-r="links"></tbody></table></div></div></div>
  <div class="table-card"><div class="table-toolbar"><strong>Recent webhooks</strong><span class="adm-meta">Deduplicated on X-Shopify-Webhook-Id</span></div><div class="table-wrap"><table class="adm-table"><thead><tr><th>Received</th><th>Topic</th><th>Shop</th><th>Status</th><th>Note</th></tr></thead><tbody data-r="hooks"></tbody></table></div></div>`;
  const $=n=>root.querySelector(`[data-r="${n}"]`);let st=null;
  const when=v=>{const d=v?new Date(v):null;return d&&!isNaN(d)?esc(d.toLocaleString(undefined,{dateStyle:"short",timeStyle:"short"})):"—"};
  function render(){
    $("info").textContent=`Admin API ${st.api_version}`;
    $("cfg").innerHTML=st.configured?`<span class="tag green">App configured</span> <span class="adm-meta">${esc(st.app_url)}</span>`:`<span class="tag red">Not configured</span> <span class="adm-meta">Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET and APP_URL</span>`;
    $("shops").innerHTML=st.shops.map(s=>`<tr><td><b>${esc(s.shop)}</b></td><td><span class="tag ${s.status==="connected"?"green":"red"}">${s.status==="connected"?"Connected":"Uninstalled"}</span></td><td class="adm-meta">${esc(s.scopes)}</td><td>${when(s.installed_at)}</td><td>${when(s.uninstalled_at)}</td></tr>`).join("")||`<tr><td colspan="5" class="adm-meta">No shop connected yet. Enter a *.myshopify.com domain above.</td></tr>`;
    const live=st.shops.filter(s=>s.status==="connected");
    $("target").innerHTML=live.map(s=>`<option>${esc(s.shop)}</option>`).join("")||`<option value="">No connected shop</option>`;
    if(!$("product").options.length)$("product").innerHTML=st.products.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.id)})</option>`).join("");
    $("push").disabled=!live.length;
    $("links").innerHTML=st.product_links.map(l=>`<tr><td>${esc(l.shop)}</td><td>${esc(l.local_product_id)}</td><td class="adm-meta">${esc(l.shopify_product_id)}</td><td>${Object.keys(l.variant_ids||{}).length}</td><td>${when(l.pushed_at)}</td></tr>`).join("")||`<tr><td colspan="5" class="adm-meta">No product pushed yet.</td></tr>`;
    $("hooks").innerHTML=st.webhooks.map(w=>`<tr><td>${when(w.received_at)}</td><td><b>${esc(w.topic)}</b></td><td>${esc(w.shop)}</td><td><span class="tag ${w.status==="processed"?"green":w.status==="error"?"red":""}">${esc(w.status)}</span></td><td class="adm-meta">${esc(w.note)}</td></tr>`).join("")||`<tr><td colspan="5" class="adm-meta">No webhooks received yet.</td></tr>`;
  }
  async function load(){st=await api("/api/shopify/app/status");render()}
  $("reload").onclick=()=>load().catch(e=>say($("msg"),false,e.message));
  $("connect").onclick=async()=>{try{const r=await api("/api/shopify/app/connect",{method:"POST",body:JSON.stringify({shop:$("shop").value})});say($("msg"),true,`Redirecting to ${r.shop}…`);location.href=r.url}catch(e){say($("msg"),false,e.message==="shopify_app_not_configured"?"Shopify app not configured (SHOPIFY_API_KEY / SHOPIFY_API_SECRET / APP_URL).":e.message==="invalid_shop_domain"?"Enter a valid *.myshopify.com domain.":e.message)}};
  $("push").onclick=async()=>{$("push").disabled=true;try{const r=await api(`/api/shopify/app/products/${encodeURIComponent($("product").value)}/push`,{method:"POST",body:JSON.stringify({shop:$("target").value})});say($("pmsg"),true,`${r.updated?"Updated":"Created"} ${r.shopify_product_id} (${r.variants} variants)`);await load()}catch(e){say($("pmsg"),false,e.message)}finally{$("push").disabled=!st?.shops.some(s=>s.status==="connected")}};
  const q=new URLSearchParams(location.search).get("shop_connected");if(q)say($("msg"),true,`Connected ${q}`);
  load().catch(e=>say($("msg"),false,e.message));
}

// ---------- Carriers (YunExpress 云途 / 4PX 递四方) — gated by LOGISTICS_ENABLED ----------
function carriers(root){
  const C={yunexpress:"YunExpress 云途",fourpx:"4PX 递四方"},ST=["created","label_ready","info_received","in_transit","delivered","exception","cancelled","error"];
  const opts=(o,sel)=>Object.entries(o).map(([v,l])=>`<option value="${esc(v)}"${v===sel?" selected":""}>${esc(l)}</option>`).join("");
  root.innerHTML=`<div class="query-card adm-bar"><div class="lang-switch" role="group" aria-label="Tabs">${["shipments","create","manual","settings","rules"].map((t,i)=>`<button data-tab="${t}"${i?"":` class="active"`}>${{shipments:"Shipments",create:"From order / batch",manual:"Manual shipment",settings:"Carrier settings & routes",rules:"Shipping fees"}[t]}</button>`).join("")}</div><span class="adm-msg" data-r="msg" aria-live="polite"></span></div><div data-r="body"></div>`;
  const $=n=>root.querySelector(`[data-r="${n}"]`),msg=(ok,t)=>say($("msg"),ok,t),body=()=>$("body");
  let tab="shipments";
  root.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{root.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===b));tab=b.dataset.tab;show()});
  async function label(id,refresh){const t=cfg.tenant();const r=await fetch(`/api/saas/carriers/shipments/${encodeURIComponent(id)}/label${refresh?"?refresh=1":""}`,{headers:{"x-admin-api-key":cfg.getKey(),...(t?{"x-tenant-id":t}:{})}});
    if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||"label failed")}const u=URL.createObjectURL(await r.blob());const a=document.createElement("a");a.href=u;a.download=`label-${id}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000)}
  async function shipments(){
    body().innerHTML=`<div class="query-card adm-bar"><input class="ant-input" type="search" data-f="q" placeholder="Order or tracking number…" style="max-width:240px"><select class="ant-select" data-f="carrier"><option value="">All carriers</option>${opts(C)}</select>
      <select class="ant-select" data-f="status"><option value="">All statuses</option>${ST.map(s=>`<option>${s}</option>`).join("")}</select><input class="ant-input" type="date" data-f="from" aria-label="From"><input class="ant-input" type="date" data-f="to" aria-label="To">
      <label><input type="checkbox" data-f="alerts"> Alerts only</label><button class="ant-btn" data-a="poll">Refresh all tracking</button></div>
      <div class="table-card"><div class="table-wrap"><table class="adm-table"><thead><tr><th>Order</th><th>Carrier</th><th>Tracking</th><th>Status</th><th>Alert</th><th>Created</th><th></th></tr></thead><tbody data-r="rows"></tbody></table></div></div><div data-r="detail"></div>`;
    const f=n=>body().querySelector(`[data-f="${n}"]`);
    async function load(){const q=new URLSearchParams();for(const n of ["q","carrier","status","from","to"])if(f(n).value)q.set(n,f(n).value);if(f("alerts").checked)q.set("alerts","1");
      const rows=await api("/api/saas/carriers/shipments?"+q);
      $("rows").innerHTML=rows.map(s=>`<tr><td>${esc(s.order_id||("manual · "+(s.reference||"")))}</td><td>${esc(C[s.carrier]||s.carrier)}<br><span class="adm-meta">${esc(s.mode)}</span></td><td>${s.tracking_url?`<a href="${esc(s.tracking_url)}" target="_blank" rel="noopener">${esc(s.tracking_number)}</a>`:esc(s.tracking_number||"—")}</td><td>${esc(s.status)}</td><td>${s.alert?`<b style="color:#c0392b">${esc(s.alert.text)}</b>`:""}</td><td>${esc(String(s.created_at).slice(0,16).replace("T"," "))}</td>
        <td><button class="ant-btn" data-d="${esc(s.id)}">Detail</button></td></tr>`).join("")||`<tr><td colspan="7">No shipments</td></tr>`;
      $("rows").querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>detail(b.dataset.d))}
    async function detail(id){const s=await api(`/api/saas/carriers/shipments/${encodeURIComponent(id)}`);
      $("detail").innerHTML=`<div class="table-card" style="padding:16px"><strong>${esc(s.order_id)} · ${esc(C[s.carrier])} · ${esc(s.tracking_number||"")}</strong> <span class="adm-meta">${esc(s.status)} · ${esc(s.mode)} · route ${esc(s.product||"")} · ${esc(s.weight_kg)} kg · ${esc(s.country)}${s.recipient?" · "+esc(s.recipient):""}${s.last_error?" · "+esc(s.last_error):""}${s.label_at?" · label ✓":s.label_error?` · label pending (${esc(s.label_attempts||0)} tries: ${esc(s.label_error)})`:""}</span>
        <div class="adm-bar" style="margin:10px 0"><button class="ant-btn" data-x="refresh">Refresh tracking</button><button class="ant-btn" data-x="label">Download label</button><button class="ant-btn" data-x="reprint">Re-fetch label</button><button class="ant-btn" data-x="retry">Retry label in background</button><button class="ant-btn" data-x="cancel">Cancel shipment</button></div>
        <ol>${(s.events||[]).map(e=>`<li><b>${esc(String(e.time||"").replace("T"," ").slice(0,16))}</b> ${esc(e.location)} — ${esc(e.text)}</li>`).join("")||"<li>No tracking events yet</li>"}</ol></div>`;
      const x=n=>$("detail").querySelector(`[data-x="${n}"]`);
      x("refresh").onclick=()=>api(`/api/saas/carriers/shipments/${id}/refresh`,{method:"POST"}).then(()=>{msg(true,"Tracking refreshed");load();detail(id)}).catch(e=>msg(false,e.message));
      x("retry").onclick=()=>api(`/api/saas/carriers/shipments/${id}/label/retry`,{method:"POST"}).then(()=>msg(true,"Label retry scheduled — refresh the detail in a minute")).catch(e=>msg(false,e.message));
      x("label").onclick=()=>label(id,false).catch(e=>msg(false,e.message));x("reprint").onclick=()=>label(id,true).catch(e=>msg(false,e.message));
      x("cancel").onclick=()=>confirm("Cancel this shipment with the carrier?")&&api(`/api/saas/carriers/shipments/${id}/cancel`,{method:"POST"}).then(()=>{msg(true,"Cancelled");load();detail(id)}).catch(e=>msg(false,e.message))}
    body().querySelectorAll("[data-f]").forEach(e=>e.onchange=()=>load().catch(er=>msg(false,er.message)));f("q").oninput=()=>load().catch(()=>{});
    body().querySelector('[data-a="poll"]').onclick=()=>api("/api/saas/carriers/poll",{method:"POST"}).then(r=>{msg(true,`Polled ${r.polled}`);load()}).catch(e=>msg(false,e.message));
    await load()}
  // Shared shipment form (prefilled from an order draft, or blank for a manual shipment).
  async function productOptions(carrier,country,sel){try{const l=await api(`/api/saas/carriers/${carrier}/products?country=${encodeURIComponent(country||"")}`);return `<option value="">(default route)</option>`+l.map(p=>`<option value="${esc(p.code)}"${p.code===sel?" selected":""}>${esc(p.code)} — ${esc(p.name)}</option>`).join("")+(sel&&!l.some(p=>p.code===sel)?`<option selected value="${esc(sel)}">${esc(sel)}</option>`:"")}catch(e){return `<option value="${esc(sel||"")}">${esc(sel||"(default route)")} (product list: ${esc(e.message)})</option>`}}
  function shipForm(el,{orderId,draft,onDone}){
    const r=draft?.request||{to:{country:"CH"},items:[{sku:"item",name_en:"Printed paper card",name_cn:"纸质印刷品",quantity:1,unit_value:2,unit_weight_kg:0.1,hs_code:"4909"}],weight_kg:0.2};
    const to=r.to||{},F=["first_name","last_name","company","address1","address2","city","state","postal_code","country","phone","email"];
    el.innerHTML=`<div class="table-card" style="padding:16px"><strong>${orderId?`Shipment for order ${esc(orderId)}`:"Manual shipment (not linked to an order)"}</strong>
      <div class="adm-bar" style="margin:8px 0">Carrier <select class="ant-select" data-sf="carrier">${opts(C,draft?.carrier||"yunexpress")}</select> Route / product <select class="ant-select" data-sf="product" style="max-width:420px"></select>
      ${orderId?"":`Reference <input class="ant-input" data-sf="reference" placeholder="auto" style="width:160px">`} Weight kg <input class="ant-input adm-num" data-sf="weight" value="${esc(r.weight_kg)}" style="width:70px"></div>
      <div style="display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:6px">${F.map(k=>`<label class="adm-meta">${k}<input class="ant-input" data-to="${k}" value="${esc(to[k]||"")}"></label>`).join("")}</div>
      <p class="adm-meta" style="margin:8px 0 2px">Customs items (one per line: name_en | quantity | unit value USD | unit kg | HS code)</p>
      <textarea class="ant-input" rows="3" data-sf="items" style="width:100%">${esc((r.items||[]).map(i=>[i.name_en,i.quantity,i.unit_value,i.unit_weight_kg,i.hs_code].join(" | ")).join("\n"))}</textarea>
      ${orderId&&draft?.payment_status!=="paid"?`<p><label><input type="checkbox" data-sf="unpaid"> Order is not paid — create anyway (test)</label></p>`:""}
      <button class="ant-btn primary" data-sf="go">Create shipment with carrier</button> <span class="adm-meta">Mode: ${esc(draft?.mode||"see Carrier settings")}</span></div>`;
    const g=n=>el.querySelector(`[data-sf="${n}"]`);
    const loadP=async()=>{g("product").innerHTML=await productOptions(g("carrier").value,el.querySelector('[data-to="country"]').value,g("carrier").value===(draft?.carrier)?draft?.product:"")};
    g("carrier").onchange=loadP;el.querySelector('[data-to="country"]').onchange=loadP;loadP();
    g("go").onclick=async()=>{
      const toV=Object.fromEntries(F.map(k=>[k,el.querySelector(`[data-to="${k}"]`).value]));
      const items=g("items").value.split("\n").map(l=>l.split("|").map(x=>x.trim())).filter(x=>x[0]).map(([name_en,quantity,unit_value,unit_weight_kg,hs_code])=>({name_en,quantity:+quantity||1,unit_value:+unit_value,unit_weight_kg:+unit_weight_kg||0.1,hs_code}));
      const common={carrier:g("carrier").value,product:g("product").value||undefined};
      const body=orderId?{order_id:orderId,...common,allow_unpaid:!!g("unpaid")?.checked,overrides:{to:toV,items,weight_kg:+g("weight").value}}:{...common,reference:g("reference").value||undefined,to:toV,items,weight_kg:+g("weight").value};
      g("go").disabled=true;
      try{const s=await api(orderId?"/api/saas/carriers/shipments":"/api/saas/carriers/shipments/manual",{method:"POST",body:JSON.stringify(body)});msg(true,`Created ${s.tracking_number} (${s.product}) — label is fetched automatically`);onDone&&onDone(s)}catch(e){msg(false,e.message)}finally{g("go").disabled=false}};
  }
  async function create(){
    const [rows,all]=await Promise.all([api("/api/saas/carriers/shippable-orders"),api("/api/saas/orders").catch(()=>[])]);
    body().innerHTML=`<div class="query-card adm-bar"><input class="ant-input" data-c="q" placeholder="Any order number…" style="max-width:220px" list="carrierOrders"><datalist id="carrierOrders">${all.slice(0,300).map(o=>`<option value="${esc(o.id)}">${esc(o.status||"")}</option>`).join("")}</datalist><button class="ant-btn" data-c="prep">Prepare shipment</button>
      <span style="flex:1"></span><select class="ant-select" data-c="carrier"><option value="">Default carrier per destination</option>${opts(C)}</select><button class="ant-btn primary" data-c="go">Batch-create for selected</button></div>
      <div data-c="form"></div>
      <div class="table-card"><div class="table-toolbar"><strong>Paid orders without a shipment</strong></div><div class="table-wrap"><table class="adm-table"><thead><tr><th><input type="checkbox" data-c="all"></th><th>Order</th><th>Status</th><th>Country</th><th>Items</th><th>Placed</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td><input type="checkbox" data-o="${esc(o.id)}"></td><td>${esc(o.id)}</td><td>${esc(o.status)}</td><td>${esc(o.country)}</td><td>${o.items}</td><td>${esc(String(o.created_at||"").slice(0,10))}</td><td><button class="ant-btn" data-p="${esc(o.id)}">Prepare…</button></td></tr>`).join("")||`<tr><td colspan="7">No paid orders waiting for a shipment</td></tr>`}</tbody></table></div></div><pre data-c="out" class="adm-meta"></pre>`;
    const c=n=>body().querySelector(`[data-c="${n}"]`);c("all").onchange=e=>body().querySelectorAll("[data-o]").forEach(x=>x.checked=e.target.checked);
    const prep=async id=>{try{const d=await api(`/api/saas/carriers/draft?order_id=${encodeURIComponent(id)}`);shipForm(c("form"),{orderId:id,draft:d,onDone:()=>{tab="shipments";root.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab==="shipments"));show()}})}catch(e){msg(false,e.message)}};
    c("prep").onclick=()=>c("q").value&&prep(c("q").value.trim());body().querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>prep(b.dataset.p));
    c("go").onclick=async()=>{const ids=[...body().querySelectorAll("[data-o]:checked")].map(x=>x.dataset.o);if(!ids.length)return msg(false,"Select orders first");
      try{const r=await api("/api/saas/carriers/shipments/batch",{method:"POST",body:JSON.stringify({order_ids:ids,carrier:c("carrier").value||undefined})});msg(r.failed===0,`${r.created} created, ${r.failed} failed`);c("out").textContent=r.results.map(x=>`${x.order_id}: ${x.ok?x.tracking_number:x.error}`).join("\n")}catch(e){msg(false,e.message)}}}
  async function manual(){body().innerHTML=`<div data-m="f"></div>`;shipForm(body().querySelector('[data-m="f"]'),{onDone:()=>{tab="shipments";root.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab==="shipments"));show()}})}
  async function settings(){
    const d=await api("/api/saas/carriers/settings"),s=d.settings;
    body().innerHTML=`<div class="table-card" style="padding:16px"><table class="adm-table"><thead><tr><th>Carrier</th><th>Enabled</th><th>Environment</th><th>Default route / product</th><th>Credentials</th></tr></thead><tbody>${d.carriers.map(c=>`<tr><td>${esc(c.name)}</td><td><input type="checkbox" data-s="${c.id}.enabled"${c.enabled?" checked":""}></td><td><select class="ant-select" data-s="${c.id}.mode">${opts({sandbox:"Sandbox",production:"Production"},c.mode)}</select></td><td><input class="ant-input" data-s="${c.id}.service" value="${esc(c.service)}" placeholder="adapter default"></td><td>${c.mock?"mock mode":c.configured?"configured":"missing: "+esc(c.required_env.join(", "))}</td></tr>`).join("")}</tbody></table>
      <h3 style="margin:16px 0 6px">Route per destination country</h3><p class="adm-meta">Pick the carrier and its route/product for each country. The list is loaded live from the carrier (current environment).</p>
      <table class="adm-table"><thead><tr><th>Country</th><th>Carrier</th><th>Route / product</th><th></th></tr></thead><tbody data-g="routes"></tbody></table>
      <div class="adm-bar" style="margin-top:6px"><input class="ant-input" data-g="newcc" placeholder="Country, e.g. DE" style="width:120px"><button class="ant-btn" data-g="add">Add country</button></div>
      <p>Default carrier for other countries <select class="ant-select" data-g="default_carrier">${opts(C,s.default_carrier)}</select></p>
      <p>Alert when no tracking update for <input class="ant-input adm-num" data-g="nu" value="${s.alert_days_no_update}" style="width:60px"> days, or not delivered after <input class="ant-input adm-num" data-g="ud" value="${s.alert_days_undelivered}" style="width:60px"> days</p>
      <button class="ant-btn primary" data-g="save">Save settings</button></div>`;
    const g=n=>body().querySelector(`[data-g="${n}"]`),v=k=>body().querySelector(`[data-s="${k}"]`);
    const ccs=[...new Set([...Object.keys(s.default_by_country),...Object.keys(s.carriers.yunexpress.products_by_country||{}),...Object.keys(s.carriers.fourpx.products_by_country||{})])].sort();
    const row=cc=>{const car=s.default_by_country[cc]||s.default_carrier,prod=s.carriers[car]?.products_by_country?.[cc]||"";const tr=document.createElement("tr");tr.dataset.cc=cc;
      tr.innerHTML=`<td><b>${esc(cc)}</b></td><td><select class="ant-select" data-k="car">${opts(C,car)}</select></td><td><select class="ant-select" data-k="prod" style="max-width:460px"><option>${esc(prod||"(default route)")}</option></select></td><td><button class="ant-btn" data-k="del">✕</button></td>`;
      const ld=async(sel)=>{tr.querySelector('[data-k="prod"]').innerHTML=await productOptions(tr.querySelector('[data-k="car"]').value,cc,sel)};
      tr.querySelector('[data-k="car"]').onchange=()=>ld("");tr.querySelector('[data-k="del"]').onclick=()=>tr.remove();ld(prod);g("routes").appendChild(tr)};
    ccs.forEach(row);g("add").onclick=()=>{const cc=g("newcc").value.trim().toUpperCase();if(/^[A-Z]{2}$/.test(cc)&&!g("routes").querySelector(`[data-cc="${cc}"]`)){row(cc);g("newcc").value=""}};
    g("save").onclick=()=>{const by={},pbc={yunexpress:{},fourpx:{}};g("routes").querySelectorAll("tr").forEach(tr=>{const car=tr.querySelector('[data-k="car"]').value,p=tr.querySelector('[data-k="prod"]').value;by[tr.dataset.cc]=car;if(p)pbc[car][tr.dataset.cc]=p});
      api("/api/saas/carriers/settings",{method:"PUT",body:JSON.stringify({carriers:Object.fromEntries(Object.keys(C).map(id=>[id,{enabled:v(id+".enabled").checked,mode:v(id+".mode").value,service:v(id+".service").value,products_by_country:pbc[id]}])),
        default_carrier:g("default_carrier").value,default_by_country:by,alert_days_no_update:+g("nu").value,alert_days_undelivered:+g("ud").value})}).then(()=>{msg(true,"Saved");settings()}).catch(e=>msg(false,e.message))}}
  async function rules(){
    const d=await api("/api/saas/carriers/rules");
    body().innerHTML=`<div class="table-card" style="padding:16px"><p class="adm-meta">Customer shipping fee per channel (carrier + optional route) in CHF, converted to the checkout currency. Free-shipping thresholds from Fees &amp; tax still apply. Tiers: <code>max_kg:price</code>, comma-separated. Destinations or weights without a matching rule keep the current Fees &amp; tax price.</p>
      <p>Mode <select class="ant-select" data-r2="mode">${opts({off:"Off — checkout uses Fees & tax",preview:"Preview — admin quote previews only",live:"Live — customers pay these fees"},d.mode||(d.active?"live":"off"))}</select> · Markup % <input class="ant-input adm-num" data-r2="pct" value="${d.markup_pct}" style="width:70px"> + fixed CHF <input class="ant-input adm-num" data-r2="fix" value="${d.markup_fixed}" style="width:70px"></p>
      <table class="adm-table"><thead><tr><th>Name</th><th>Carrier</th><th>Route (empty = any)</th><th>Countries (ISO, * = rest)</th><th>Method</th><th>Weight tiers</th><th></th></tr></thead><tbody data-r2="rows"></tbody></table>
      <button class="ant-btn" data-r2="add">Add rule</button> <button class="ant-btn primary" data-r2="save">Save rules</button>
      <p>Test: country <input class="ant-input" data-r2="pc" value="CH" style="width:50px"> weight kg <input class="ant-input adm-num" data-r2="pw" value="0.5" style="width:60px"> <button class="ant-btn" data-r2="prev">Rule price</button> <button class="ant-btn" data-r2="quote">Real checkout quote (saved rules)</button> <span data-r2="pout"></span></p></div>`;
    const q=n=>body().querySelector(`[data-r2="${n}"]`);
    const row=r=>`<tr data-rule="${esc(r.id||"")}"><td><input class="ant-input" data-k="name" value="${esc(r.name||"")}"></td><td><select class="ant-select" data-k="carrier">${opts(C,r.carrier)}</select></td><td><input class="ant-input" data-k="product" value="${esc(r.product||"")}" style="width:90px"></td><td><input class="ant-input" data-k="countries" value="${esc((r.countries||[]).join(","))}"></td><td><select class="ant-select" data-k="method">${opts({standard:"Standard",express:"Express"},r.method)}</select></td><td><input class="ant-input" data-k="tiers" value="${esc((r.tiers||[]).map(t=>`${t.max_kg}:${t.price}`).join(", "))}"></td><td><button class="ant-btn" data-del>✕</button></td></tr>`;
    const bind=()=>q("rows").querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>b.closest("tr").remove());
    q("rows").innerHTML=d.rules.map(row).join("");bind();
    q("add").onclick=()=>{q("rows").insertAdjacentHTML("beforeend",row({carrier:"yunexpress",countries:["*"],method:"standard",tiers:[{max_kg:0.5,price:9.9},{max_kg:2,price:19.9}]}));bind()};
    const collect=()=>({mode:q("mode").value,markup_pct:+q("pct").value||0,markup_fixed:+q("fix").value||0,rules:[...q("rows").querySelectorAll("tr")].map(tr=>{const k=n=>tr.querySelector(`[data-k="${n}"]`).value;
      return {id:tr.dataset.rule||undefined,name:k("name"),carrier:k("carrier"),product:k("product"),countries:k("countries"),method:k("method"),tiers:k("tiers").split(",").map(x=>x.split(":").map(Number)).filter(x=>x.length===2).map(([max_kg,price])=>({max_kg,price}))}})});
    q("save").onclick=()=>{const c=collect();if(c.mode==="live"&&!confirm("Live mode changes what customers pay at checkout. Continue?"))return;api("/api/saas/carriers/rules",{method:"PUT",body:JSON.stringify(c)}).then(r=>msg(true,`Saved ${r.rules.length} rule(s) — mode ${r.mode}`)).catch(e=>msg(false,e.message))};
    q("prev").onclick=()=>api("/api/saas/carriers/rules/preview",{method:"POST",body:JSON.stringify({rules:{...collect(),mode:"live"},country:q("pc").value,weight_kg:+q("pw").value})}).then(r=>q("pout").textContent=r.fee?`${r.fee.carrier}: CHF ${r.fee.amount_chf}`:"no matching rule → current checkout price").catch(e=>msg(false,e.message));
    q("quote").onclick=()=>api("/api/storefront/shipping/quote",{method:"POST",headers:{"x-logistics-preview":"true"},body:JSON.stringify({cart:[{name:"Menu card",product_id:"menu_card",quantity:Math.max(1,Math.round((+q("pw").value||0.2)/0.12))}],currency:"CHF",country:q("pc").value})}).then(r=>q("pout").textContent=r.shipping_options.map(o=>`${o.id}: ${r.currency} ${o.amount}${o.carrier?` (${o.carrier} rule)`:" (Fees & tax)"}`).join(" · ")).catch(e=>msg(false,e.message));
  }
  async function show(){try{body().innerHTML="Loading…";await({shipments,create,manual,settings,rules})[tab]()}catch(e){body().innerHTML=`<div class="table-card" style="padding:16px">${/disabled/.test(e.message)?"Carrier logistics is switched off. Set <code>LOGISTICS_ENABLED=true</code> in the server .env to use it.":esc(e.message)}</div>`}}
  show();
}

const mounts={prices,fees,promos,shopify,carriers},mounted=new Set();
window.AdminSections={
  ids:Object.keys(mounts),
  init(o){cfg={...cfg,...o}},
  // Renders a section into its container the first time it is shown.
  mount(id){if(!mounts[id]||mounted.has(id))return;const el=document.getElementById(id+"Section");if(!el)return;mounted.add(id);mounts[id](el)}
};
})();
