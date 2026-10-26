/* My account (customer dashboard): Overview · Orders (+ detail, reorder) · My designs · Addresses · Profile · Sign out.
 * Hash routes: #overview #orders #orders/<id> #designs #addresses #profile, #find-order (guest lookup, also signed out). Strings: i18n.js keys "acct.*", "fo.*". */
(()=>{
const $=id=>document.getElementById(id),app=$("app");
const K=(k,v)=>window.WeddingI18n?.k?window.WeddingI18n.k(k,v):k;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=(n,c)=>window.PODCart?.fmtMoney?PODCart.fmtMoney(n,c):`${c} ${Number(n||0).toFixed(2)}`;
const dt=(s,time)=>{const d=new Date(s);if(!s||isNaN(d))return "";return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric",...(time?{hour:"2-digit",minute:"2-digit"}:{})})};
const COUNTRIES={CH:"Switzerland",LI:"Liechtenstein",DE:"Germany",AT:"Austria",FR:"France",IT:"Italy",NL:"Netherlands",BE:"Belgium",LU:"Luxembourg",ES:"Spain",PT:"Portugal",IE:"Ireland",DK:"Denmark",SE:"Sweden",FI:"Finland",PL:"Poland",CZ:"Czechia"};
const I={
 overview:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
 orders:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/></svg>',
 designs:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
 addresses:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
 profile:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
 out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/></svg>',
 google:'<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
 shop:'<svg viewBox="0 0 24 24" fill="none" stroke="#5a31f4" stroke-width="1.8" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>'
};
const NAV=["overview","orders","designs","addresses","profile"];
let user=null;
const api=async(path,opt={})=>{const r=await fetch(path,{credentials:"same-origin",...opt,headers:{...(opt.body?{"Content-Type":"application/json"}:{}),...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||"request_failed");e.status=r.status;e.data=d;throw e}return d};
const toast=m=>{const t=$("toast");t.textContent=m;t.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove("show"),2600)};
const pill=s=>`<span class="pill ${esc(s)}">${esc(K("acct.st."+s))}</span>`;
const avatar=(u,cls="")=>`<span class="av ${cls}">${u.avatar_url?`<img src="${esc(u.avatar_url)}" alt="" referrerpolicy="no-referrer">`:esc((u.name||u.email||"?").trim().charAt(0).toUpperCase())}</span>`;
const thumbs=items=>`<div class="thumbs">${items.slice(0,3).map(i=>i.thumb?`<img src="${esc(i.thumb)}" alt="${esc(i.name)}" title="${esc(i.name)}" width="40" height="40" loading="lazy">`:`<span class="ph0" title="${esc(i.name)}">${esc((i.name||"?").charAt(0))}</span>`).join("")}${items.length>3?`<span class="ph0">+${items.length-3}</span>`:""}</div>`;
const empty=(icon,title,text,cta)=>`<div class="empty"><div class="ic">${I[icon]}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${cta||""}</div>`;
const header=(title,sub,actions="",crumb="")=>`${crumb}<div class="ph"><div><h1>${esc(title)}</h1>${sub?`<p>${esc(sub)}</p>`:""}</div>${actions?`<div>${actions}</div>`:""}</div>`;
const payName=p=>p==="twint"?"TWINT":p==="paypal"?"PayPal":(p||"—");
const addrLines=a=>[a.name,a.address1,a.address2,[a.postal_code,a.city].filter(Boolean).join(" "),COUNTRIES[a.country]||a.country,a.phone].filter(Boolean).map(esc).join("<br>");

function route(){const h=location.hash.replace(/^#\/?/,"");const [sec,id]=h.split("/");return {sec:NAV.includes(sec)?sec:"overview",id:id?decodeURIComponent(id):""}}
function frame(sec,inner){
 document.title=`${K("acct.nav."+sec)} · ${K("acct.title")} · Wed.AI`;
 return `<div class="shell"><aside class="side" aria-label="${esc(K("acct.title"))}"><div class="who">${avatar(user)}<div><b>${esc(user.name||user.email)}</b><span>${esc(user.email)}</span></div></div>
 <nav class="nav">${NAV.map(n=>`<a href="#${n}" ${n===sec?'aria-current="page"':""}>${I[n]}<span>${esc(K("acct.nav."+n))}</span></a>`).join("")}<div class="sep"></div><button type="button" id="signOut">${I.out}<span>${esc(K("acct.nav.signout"))}</span></button></nav></aside>
 <main class="main" id="main">${inner}</main></div>`;
}
async function render(){
 const {sec,id}=route();
 app.innerHTML=frame(sec,`<div class="card muted">${esc(K("acct.loading"))}</div>`);
 $("signOut").onclick=()=>PODAuth.logout();
 {const nav=app.querySelector(".nav"),a=nav.querySelector("[aria-current]");if(a&&nav.scrollWidth>nav.clientWidth)nav.scrollLeft=a.offsetLeft-(nav.clientWidth-a.offsetWidth)/2}
 const m=$("main");
 if(location.hash==="#find-order"){m.innerHTML=findOrderCard();wireFindOrder();return}
 try{m.innerHTML=await VIEWS[sec](id);WIRE[sec]?.(m,id)}
 catch(e){if(e.status===401)return signedOut();m.innerHTML=e.status===404?`<div class="card">${empty("orders",K("acct.order.notFound"),K("acct.order.notFoundText"),`<a class="btn dark" href="#orders">${esc(K("acct.order.back"))}</a>`)}</div>`:`<div class="card err">${esc(K("acct.error"))}</div>`}
 window.scrollTo({top:0});
}
const VIEWS={
 async overview(){
  const d=await api("/api/account/overview"),c=d.counts;
  const first=(user.name||"").split(" ")[0];
  const stat=(n,k,h)=>`<a class="stat" href="#${h}"><b>${n}</b><span>${esc(K(k))}</span></a>`;
  return header(first?K("acct.ov.hi",{n:first}):K("acct.nav.overview"),K("acct.ov.sub"),`<a class="btn dark" href="/studio.html">${esc(K("acct.ov.newDesign"))}</a>`)+
  `<div class="stats">${stat(c.orders,"acct.ov.orders","orders")}${stat(c.open,"acct.ov.open","orders")}${stat(c.designs,"acct.ov.designs","designs")}${stat(c.addresses,"acct.ov.addresses","addresses")}</div>
  <div class="grid2"><section class="card"><div class="card-h"><h2>${esc(K("acct.ov.recent"))}</h2>${d.recent_orders.length?`<a class="btn sm" href="#orders">${esc(K("acct.ov.viewAll"))}</a>`:""}</div>
  ${d.recent_orders.length?ordersTable(d.recent_orders):empty("orders",K("acct.orders.emptyTitle"),K("acct.orders.emptyText"),`<a class="btn dark" href="/">${esc(K("acct.orders.shop"))}</a>`)}</section>
  <div><section class="card"><div class="card-h"><h2>${esc(K("acct.ov.defaultAddr"))}</h2><a class="btn sm" href="#addresses">${esc(K("acct.manage"))}</a></div>${d.default_address?`<div class="small">${addrLines(d.default_address)}</div><p class="muted small" style="margin:10px 0 0">${esc(K("acct.addr.prefillNote"))}</p>`:`<p class="muted small" style="margin:0">${esc(K("acct.addr.none"))}</p>`}</section>
  <section class="card"><div class="card-h"><h2>${esc(K("acct.nav.designs"))}</h2><a class="btn sm" href="#designs">${esc(K("acct.ov.viewAll"))}</a></div>${d.recent_designs.length?d.recent_designs.map(x=>`<div class="prov"><span class="thumbs">${x.thumb?`<img src="${esc(x.thumb)}" alt="">`:`<span class="ph0">✎</span>`}</span><div style="flex:1;min-width:0"><b class="small">${esc(x.name)}</b><div class="muted small">${esc(dt(x.updated_at))}</div></div><a class="btn sm" href="${esc(x.link)}">${esc(K("acct.open"))}</a></div>`).join(""):`<p class="muted small" style="margin:0">${esc(K("acct.designs.short"))}</p>`}</section></div></div>`;
 },
 async orders(id){
  if(id)return orderView(id);
  const d=await api("/api/account/orders");
  if(!d.orders.length)return header(K("acct.nav.orders"),K("acct.orders.sub"))+`<div class="card">${empty("orders",K("acct.orders.emptyTitle"),K("acct.orders.emptyText"),`<a class="btn dark" href="/">${esc(K("acct.orders.shop"))}</a>`)}</div>`;
  const sts=["all","awaiting_payment","paid","proof","in_production","shipped","delivered","cancelled"];
  return header(K("acct.nav.orders"),K("acct.orders.sub"))+`<section class="card"><div class="toolbar"><input type="search" id="oq" placeholder="${esc(K("acct.orders.search"))}" aria-label="${esc(K("acct.orders.search"))}"><select id="ost" aria-label="${esc(K("acct.orders.status"))}">${sts.map(s=>`<option value="${s}">${esc(s==="all"?K("acct.orders.allStatus"):K("acct.st."+s))}</option>`).join("")}</select></div><div id="olist">${ordersTable(d.orders)}</div></section>`;
 },
 async designs(){
  const d=await api("/api/account/designs");
  const act=`<a class="btn dark" href="/studio.html">${esc(K("acct.ov.newDesign"))}</a>`;
  if(!d.designs.length)return header(K("acct.nav.designs"),K("acct.designs.sub"))+`<div class="card">${empty("designs",K("acct.designs.emptyTitle"),K("acct.designs.emptyText"),`<a class="btn dark" href="/studio.html">${esc(K("acct.designs.open"))}</a>`)}</div>`;
  return header(K("acct.nav.designs"),K("acct.designs.sub"),act)+`<div class="addrs">${d.designs.map(x=>`<article class="addr">${x.thumb?`<img src="${esc(x.thumb)}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;background:var(--soft)">`:""}<b>${esc(x.name)}</b><div class="muted small">${esc(K("acct.designs.updated",{d:dt(x.updated_at)}))}</div><div><span class="pill">${esc(x.status)}</span></div><div class="acts"><a class="btn sm dark" href="${esc(x.link)}">${esc(K("acct.designs.edit"))}</a></div></article>`).join("")}</div>`;
 },
 async addresses(){
  const d=await api("/api/account/addresses");VIEWS._addr=d.addresses;
  const add=`<button class="btn dark" type="button" data-a="new">${esc(K("acct.addr.add"))}</button>`;
  return header(K("acct.nav.addresses"),K("acct.addr.sub"),d.addresses.length?add:"")+`<div id="aform"></div>`+(d.addresses.length?`<div class="addrs">${d.addresses.map(a=>`<article class="addr ${a.is_default?"def":""}" data-id="${esc(a.id)}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(a.label||a.name)}</b>${a.is_default?`<span class="pill delivered">${esc(K("acct.addr.default"))}</span>`:""}</div><div class="small">${addrLines(a)}</div><div class="acts"><button class="btn sm" type="button" data-a="edit">${esc(K("acct.edit"))}</button>${a.is_default?"":`<button class="btn sm" type="button" data-a="def">${esc(K("acct.addr.makeDefault"))}</button>`}<button class="btn sm link" type="button" data-a="del">${esc(K("acct.delete"))}</button></div></article>`).join("")}</div>`:`<div class="card">${empty("addresses",K("acct.addr.emptyTitle"),K("acct.addr.emptyText"),add)}</div>`);
 },
 async profile(){
  const d=await api("/api/account/me"),u=d.user;
  return header(K("acct.nav.profile"),K("acct.prof.sub"))+`<div class="grid2"><section class="card"><div style="display:flex;gap:16px;align-items:center;margin-bottom:18px">${avatar(u,"lg")}<div><b style="font-size:17px">${esc(u.name||"—")}</b><div class="muted">${esc(u.email)}</div></div></div>
  <form class="form" id="pform"><label class="full">${esc(K("acct.prof.name"))}<input name="name" value="${esc(u.name)}" maxlength="120" required autocomplete="name"></label><label class="full">${esc(K("acct.prof.email"))}<input value="${esc(u.email)}" readonly aria-readonly="true"></label><p class="muted small full" style="margin:0">${esc(K("acct.prof.emailNote"))}</p><div class="full"><button class="btn dark" type="submit">${esc(K("acct.save"))}</button></div></form></section>
  <section class="card"><h2>${esc(K("acct.prof.signin"))}</h2>${(d.providers.length?d.providers:[]).map(p=>`<div class="prov">${I[p.provider]||I.profile}<div style="flex:1;min-width:0"><b>${esc(p.provider==="shop"?"Shop":p.provider==="google"?"Google":p.provider)}</b><div class="muted small">${esc(p.email)}</div></div><span class="pill delivered">${esc(K("acct.prof.connected"))}</span></div>`).join("")||`<p class="muted small">${esc(K("acct.prof.noProv"))}</p>`}
  <dl class="kv small" style="margin-top:14px"><dt>${esc(K("acct.prof.since"))}</dt><dd>${esc(dt(u.created_at))}</dd>${d.last_login_at?`<dt>${esc(K("acct.prof.last"))}</dt><dd>${esc(dt(d.last_login_at,1))}</dd>`:""}</dl><p class="muted small" style="margin:12px 0 0">${esc(K("acct.prof.provNote"))}</p></section></div>`;
 }
};
function ordersTable(rows){
 return `<div class="tblwrap orders"><table class="tbl"><thead><tr><th>${esc(K("acct.orders.no"))}</th><th>${esc(K("acct.orders.date"))}</th><th>${esc(K("acct.orders.items"))}</th><th class="r">${esc(K("acct.orders.total"))}</th><th>${esc(K("acct.orders.status"))}</th></tr></thead><tbody>${rows.map(o=>`<tr data-href="#orders/${encodeURIComponent(o.id)}"><td><a class="oid" href="#orders/${encodeURIComponent(o.id)}">${esc(o.id)}</a></td><td>${esc(dt(o.created_at))}</td><td><div style="display:flex;align-items:center;gap:10px">${thumbs(o.items)}<span class="muted small">${esc(K("acct.orders.count",{n:o.item_count}))}</span></div></td><td class="r"><b>${esc(money(o.total,o.currency))}</b></td><td>${pill(o.status)}</td></tr>`).join("")||`<tr><td colspan="5" class="muted">${esc(K("acct.orders.noMatch"))}</td></tr>`}</tbody></table></div>
 <div class="mcards">${rows.map(o=>`<a class="mcard" href="#orders/${encodeURIComponent(o.id)}"><div class="row"><b>${esc(o.id)}</b>${pill(o.status)}</div><div class="row">${thumbs(o.items)}<b>${esc(money(o.total,o.currency))}</b></div><div class="muted small">${esc(dt(o.created_at))} · ${esc(K("acct.orders.count",{n:o.item_count}))}</div></a>`).join("")||`<p class="muted">${esc(K("acct.orders.noMatch"))}</p>`}</div>`;
}
let current=null;
async function orderView(id){
 const {order:o}=await api(`/api/account/orders/${encodeURIComponent(id)}`);current=o;
 const crumb=`<div class="crumb"><a href="#orders">← ${esc(K("acct.order.back"))}</a></div>`;
 const cur=o.timeline.findIndex(s=>!s.done)-1;
 return header(K("acct.order.title",{id:o.id}),K("acct.order.placed",{d:dt(o.created_at,1)}),`<span style="display:inline-flex;gap:8px;align-items:center">${pill(o.status)}<button class="btn dark" type="button" id="reorder">${esc(K("acct.order.reorder"))}</button></span>`,crumb)+
 `<div class="grid2"><div><section class="card"><h2>${esc(K("acct.order.items"))}</h2><div class="lines">${o.items.map(l=>`<div class="ln">${l.mockup||l.thumb?`<img src="${esc(l.mockup||l.thumb)}" onerror="this.onerror=null;this.src='${esc(l.thumb||"")}'" alt="" width="64" height="64">`:`<span class="ph0"></span>`}<div style="min-width:0"><b>${esc(l.name)}</b><div class="muted small">${[l.material,Object.entries(l.sizes||{}).map(([z,n])=>`${z}×${n}`).join(", "),l.studio_project_id?"":l.customization].filter(Boolean).map(esc).join(" · ")}</div><div class="muted small">${esc(K("acct.order.qty",{n:l.quantity,p:money(l.unit_price,o.currency)}))}</div>${o.proof&&l.studio_project_id?`<div class="small"><span class="pill">${esc(K("acct.od.proof"))}: ${esc(o.proof.ready||o.proof.status==="Approved"?K("acct.proof."+o.proof.status):K("acct.od.proofPreparing"))}</span>${o.proof.ready&&o.proof.approval_url&&o.proof.status!=="Approved"?` <a href="${esc(o.proof.approval_url)}">${esc(K("acct.od.proofOpen"))}</a>`:""}</div>`:""}${l.reopen_url?`<a class="small reopen" href="${esc(l.reopen_url)}">✎ ${esc(K("acct.od.reopen"))}</a>`:""}</div><b>${esc(money(l.line_total,o.currency))}</b></div>`).join("")}</div>
 <div class="sum"><div><span>${esc(K("cart.subtotal"))}</span><span>${esc(money(o.subtotal,o.currency))}</span></div>${o.packaging>0?`<div><span>${esc(K("acct.od.packaging"))}</span><span>${esc(money(o.packaging,o.currency))}</span></div>`:""}${o.discount>0?`<div><span>${esc(K("acct.od.discount"))}${o.promo_code?` · ${esc(o.promo_code)}`:""}</span><span>− ${esc(money(o.discount,o.currency))}</span></div>`:""}<div><span>${esc(K("cart.shipping"))}${o.shipping_method?` · ${esc(o.shipping_method)}`:""}</span><span>${esc(money(o.shipping,o.currency))}</span></div>${o.tax?`<div><span>${esc(K("acct.order.tax"))}</span><span>${esc(money(o.tax,o.currency))}</span></div>`:""}<div class="tot"><span>${esc(K("cart.total"))}</span><span>${esc(money(o.total,o.currency))}</span></div></div></section>
 <section class="card"><div class="grid2" style="grid-template-columns:1fr 1fr"><div><h2>${esc(K("acct.order.shipTo"))}</h2><div class="small">${addrLines(o.shipping_address)||"—"}</div></div><div><h2>${esc(K("acct.order.payment"))}</h2><span class="paybadge">${esc(payName(o.payment.provider))}</span><div class="muted small" style="margin-top:6px">${esc(K("acct.pay."+(o.payment.status==="paid"?"paid":o.payment.status==="failed"?"failed":"pending")))}</div>${o.tracking?`<h2 style="margin-top:16px">${esc(K("acct.order.tracking"))}</h2>${o.tracking.url?`<a href="${esc(o.tracking.url)}" target="_blank" rel="noopener">${esc(o.tracking.number)}</a>`:esc(o.tracking.number)}`:""}</div></div></section></div>
 <section class="card"><h2>${esc(K("acct.order.timeline"))}</h2><p class="small muted">${esc(K(o.proof_choice==="approve"?"acct.od.proofChoiceApprove":"acct.od.proofChoiceProof"))}${o.delivery_estimate&&window.PODDates?` · ${esc(K("acct.od.delivery"))}: <b>${esc(window.PODDates.range(o.delivery_estimate.from,o.delivery_estimate.to))}</b>`:""}</p>${o.proof?.production_blocked?(o.proof.ready?`<p class="small" style="color:#a8402f">${esc(K("acct.od.proofWaiting"))}</p>`:`<p class="small muted proof-prep" data-proof="preparing">⏳ ${esc(K("acct.od.proofPreparing"))} — ${esc(K("acct.od.proofPreparingSub"))}</p>`):""}<ol class="tl">${o.timeline.map((s,i)=>`<li class="${s.done?"done":""} ${i===cur&&o.status!=="delivered"&&o.status!=="cancelled"?"cur":""}"><b>${esc(K("acct.tl."+s.step))}</b>${s.at?`<time>${esc(dt(s.at,1))}</time>`:`<time>${esc(K("acct.tl.pending"))}</time>`}</li>`).join("")}</ol>${o.proof?.ready&&o.proof.approval_url&&o.proof.status!=="Approved"?`<a class="btn dark" href="${esc(o.proof.approval_url)}">${esc(K("acct.order.reviewProof"))}</a>`:""}</section></div>`;
}
const WIRE={
 overview(m){wireRows(m)},
 orders(m,id){
  if(id){$("reorder").onclick=()=>{const n=current.items.length;for(const l of current.items)PODCart.upsert({id:"r"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),productId:l.product_id,sku:l.sku,name:l.name,scene:"",qty:l.quantity,mode:l.customization?"text":"later",text:l.customization,customization:l.customization,material:l.material,materialId:l.material_id,thumb:l.thumb,thumb2:l.thumb,thumbOrig:l.thumb});toast(K("acct.order.reordered",{n}));PODCart.open()};return}
  wireRows(m);const q=$("oq"),s=$("ost");if(!q)return;let t;
  const go=async()=>{const d=await api(`/api/account/orders?q=${encodeURIComponent(q.value)}&status=${encodeURIComponent(s.value)}`);$("olist").innerHTML=ordersTable(d.orders);wireRows(m)};
  q.oninput=()=>{clearTimeout(t);t=setTimeout(go,220)};s.onchange=go;
 },
 addresses(m){
  m.onclick=async e=>{const b=e.target.closest("[data-a]");if(!b)return;const id=b.closest("[data-id]")?.dataset.id,a=(VIEWS._addr||[]).find(x=>x.id===id);
   if(b.dataset.a==="new")return addrForm(null);if(b.dataset.a==="edit")return addrForm(a);
   try{if(b.dataset.a==="def"){await api(`/api/account/addresses/${encodeURIComponent(id)}/default`,{method:"POST"});toast(K("acct.addr.defaultSet"))}
    if(b.dataset.a==="del"){if(!confirm(K("acct.addr.confirmDel")))return;await api(`/api/account/addresses/${encodeURIComponent(id)}`,{method:"DELETE"});toast(K("acct.addr.deleted"))}
    render()}catch{toast(K("acct.error"))}};
 },
 profile(){$("pform").onsubmit=async e=>{e.preventDefault();try{const d=await api("/api/account/me",{method:"PATCH",body:JSON.stringify({name:e.target.name.value})});user=d.user;toast(K("acct.saved"));render()}catch{toast(K("acct.error"))}}}
};
function wireRows(m){m.querySelectorAll("tr[data-href]").forEach(tr=>tr.onclick=e=>{if(!e.target.closest("a"))location.hash=tr.dataset.href})}
function addrForm(a){
 const f=$("aform"),v=a||{country:"CH",name:user.name||""};
 const opt=Object.entries(COUNTRIES).map(([c,n])=>`<option value="${c}" ${v.country===c?"selected":""}>${esc(n)}</option>`).join("");
 const fld=(n,l,cls="",ac="")=>`<label class="${cls}">${esc(K(l))}<input name="${n}" value="${esc(v[n]||"")}" ${ac?`autocomplete="${ac}"`:""} ${["name","address1","postal_code","city"].includes(n)?"required":""}></label>`;
 f.innerHTML=`<section class="card"><h2>${esc(K(a?"acct.addr.editTitle":"acct.addr.add"))}</h2><form class="form" id="af">${fld("label","acct.addr.label","full")}${fld("name","acct.addr.name","full","name")}${fld("address1","acct.addr.line1","full","address-line1")}${fld("address2","acct.addr.line2","full","address-line2")}${fld("postal_code","acct.addr.postal","","postal-code")}${fld("city","acct.addr.city","","address-level2")}<label>${esc(K("acct.addr.country"))}<select name="country">${opt}</select></label>${fld("phone","acct.addr.phone","","tel")}<label class="chk full"><input type="checkbox" name="is_default" ${v.is_default||!(VIEWS._addr||[]).length?"checked":""}> ${esc(K("acct.addr.useDefault"))}</label><div class="err full" id="aerr" hidden></div><div class="full" style="display:flex;gap:8px"><button class="btn dark" type="submit">${esc(K("acct.save"))}</button><button class="btn" type="button" id="acancel">${esc(K("acct.cancel"))}</button></div></form></section>`;
 f.querySelector("input[name=name]").focus();$("acancel").onclick=()=>f.innerHTML="";
 $("af").onsubmit=async e=>{e.preventDefault();const fd=Object.fromEntries(new FormData(e.target));fd.is_default=!!fd.is_default;
  try{await api(a?`/api/account/addresses/${encodeURIComponent(a.id)}`:"/api/account/addresses",{method:a?"PUT":"POST",body:JSON.stringify(fd)});toast(K("acct.saved"));render()}
  catch(err){const x=$("aerr");x.hidden=false;x.textContent=err.data?.message||K("acct.error")}};
}
/** Guest "Find my order": order number + e-mail → POST /api/orders/lookup (rate-limited, same answer for every mismatch). */
function findOrderCard(){return `<section class="card" id="find-order" aria-labelledby="foTitle"><h2 id="foTitle">${esc(K("fo.title"))}</h2><p class="muted small" style="margin:-4px 0 14px">${esc(K("fo.lead"))}</p>
 <form class="form" id="foForm" novalidate><label>${esc(K("fo.order"))}<input id="foOrder" name="order" autocomplete="off" required maxlength="80" placeholder="e.g. ord_…"></label><label>${esc(K("fo.email"))}<input id="foEmail" name="email" type="email" autocomplete="email" required maxlength="254"></label>
 <div class="full"><button class="btn dark" type="submit" id="foBtn">${esc(K("fo.submit"))}</button></div></form><div id="foOut" aria-live="polite" style="margin-top:14px"></div></section>`}
function wireFindOrder(){const f=$("foForm");if(!f)return;f.onsubmit=async e=>{e.preventDefault();const out=$("foOut"),b=$("foBtn"),order=$("foOrder").value.trim(),email=$("foEmail").value.trim();
 if(!order||!email){out.innerHTML=`<div class="err">${esc(K("fo.notFound"))}</div>`;return}
 b.disabled=true;out.innerHTML="";
 try{const r=await fetch("/api/orders/lookup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({order,email})});const d=await r.json().catch(()=>({}));
  if(r.status===429){out.innerHTML=`<div class="err">${esc(K("fo.limit"))}</div>`;return}
  if(!r.ok){out.innerHTML=`<div class="err">${esc(K("fo.notFound"))}</div>`;return}
  const o=d.order,est=o.delivery_estimate&&window.PODDates?PODDates.range(o.delivery_estimate.from,o.delivery_estimate.to):"";
  out.innerHTML=`<div class="addr def" style="gap:8px"><div class="card-h" style="margin:0"><b>${esc(o.id)}</b>${pill(o.stage)}</div><dl class="kv small"><dt>${esc(K("fo.placed"))}</dt><dd>${esc(dt(o.placed_at))||"—"}</dd><dt>${esc(K("fo.items"))}</dt><dd>${o.item_count}</dd>${est?`<dt>${esc(K("pay.delivery"))}</dt><dd>${esc(est)}</dd>`:""}${o.proof?`<dt>${esc(K("ps.step.proof"))}</dt><dd>${esc(o.proof.ready?(o.proof.status==="Approved"?K("pf.approved"):K("acct.od.proofOpen")):K("acct.od.proofPreparing"))}</dd>`:""}${o.tracking?`<dt>${esc(K("fo.tracking"))}</dt><dd>${esc(o.tracking.carrier)} ${o.tracking.url?`<a href="${esc(o.tracking.url)}" rel="noopener" target="_blank">${esc(o.tracking.number)}</a>`:esc(o.tracking.number)}${o.tracking.status?` · ${esc(K("fo.trk."+o.tracking.status))}`:""}${o.tracking.last_event?`<br><span class="muted">${esc(dt(o.tracking.last_event.time))} ${esc(o.tracking.last_event.text)}</span>`:""}</dd>`:""}</dl><p class="muted small" style="margin:0">${esc(K("ps.noToken"))}</p></div>`;
 }catch(err){out.innerHTML=`<div class="err">${esc(K("co.err.network"))}</div>`}finally{b.disabled=false}}}
async function signedOut(){
 document.title=`${K("acct.title")} · Wed.AI`;
 const prov=await PODAuth.providers(),any=PODAuth.anyProvider?PODAuth.anyProvider(prov):true;
 const signin=any?`<main class="card signin"><div class="empty" style="padding:10px 0 0"><div class="ic">${I.profile}</div></div><h1>${esc(K("acct.so.title"))}</h1><p>${esc(K("acct.so.text"))}</p><div class="pa-opts">${PODAuth.buttonsHtml(prov)}</div><p class="muted small" style="margin:16px 0 0">${esc(K("auth.terms"))}</p></main>`:"";
 app.innerHTML=`<div class="shell acct-out" style="grid-template-columns:${any?"minmax(0,1fr) minmax(0,1fr)":"minmax(0,560px)"};justify-content:center;align-items:start">${signin}<div style="${any?"margin-top:60px":"margin-top:40px"}">${findOrderCard()}</div></div>`;
 wireFindOrder();if(location.hash==="#find-order")setTimeout(()=>$("foOrder")?.focus(),50);
}
async function boot(){
 window.PODCart?.init({});
 user=await PODAuth.ready;
 if(!user){window.addEventListener("hashchange",()=>{if(location.hash==="#find-order")$("foOrder")?.focus()});return signedOut();}
 render();window.addEventListener("hashchange",render);
}
window.addEventListener("wedding-language-change",()=>user?render():signedOut());
boot();
})();
