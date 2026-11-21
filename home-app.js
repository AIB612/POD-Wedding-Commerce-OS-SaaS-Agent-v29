
const HOME_SCENARIO_ORDER = ["gifts","seasonal","creator","community","corporate","art"];
const HOME_RECOMMENDED = new Set(["gifts","seasonal"]);
const studioCatalog = window.STUDIO_DATA || {scenarios:[],products:[]};
const studioProductsById = Object.fromEntries((studioCatalog.products||[]).map(x=>[x.id,x]));

// ---- Language-aware storefront data (studio-data.js carries zh/en/de; fall back en → zh → id) ----
function homeLang(){return window.WeddingI18n?.lang?.()||"en"}
function pick(obj,fallback=""){if(!obj)return fallback;if(typeof obj==="string")return obj;const l=homeLang();return obj[l]||obj.en||obj.zh||fallback}
const HOME_LOCALE={zh:"zh-CN",en:"en-GB",de:"de-DE"};
function homeT(zh){return window.WeddingI18n?.t?.(zh)??zh}
/** Format a EUR amount for the current language. opts.from adds the "From" / "起" prefix. */
/** Shared market (header.js PODMarket: CH → CHF, EU → EUR), the same selection studio, cart and checkout use. */
/** "excl. VAT" (default) / "incl. VAT" from the Fees & tax setting (cart.js loads /api/storefront/fees and refreshes [data-vat-label]). */
function vatTag(){return window.PODCart?.vatLabel?PODCart.vatLabel():"excl. VAT"}
window.addEventListener("wedding-language-change",()=>document.querySelectorAll("[data-vat-label]").forEach(e=>e.textContent=vatTag()));
function homeMarket(){return window.PODMarket?PODMarket.get():"CH"}
function homeCurrency(){return window.PODMarket?PODMarket.currency():"CHF"}
/** Format an amount in the shared market currency (name kept for existing callers). opts.from adds the "From" prefix. */
function fmtEur(n,opts={}){
  const l=homeLang(),v=new Intl.NumberFormat(HOME_LOCALE[l]||"en-GB",{style:"currency",currency:homeCurrency(),minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
  if(!opts.from)return v;
  return l==="zh"?`${v} 起`:l==="de"?`ab ${v}`:`From ${v}`;
}
function fmtEurDelta(d){return (d>0?"+":"−")+fmtEur(Math.abs(d))}
/** Retail ("From") price: shared studio pricing, shared market (CHF/EUR), default margin, 1 pc, cheapest material. */
const HOME_MARGIN=0.4;
function retailFrom(x){
  try{
    if(window.StudioPricing&&studioCatalog.markets){
      const mats=(x.materials||[]),cheapest=mats.slice().sort((a,b)=>a.delta_eur-b.delta_eur)[0];
      const q=StudioPricing.quote(studioCatalog,{market:homeMarket(),margin:HOME_MARGIN,items:[{product_id:x.id,qty:1,material_id:cheapest?.id}]});
      if(q.lines[0])return q.lines[0].price;
    }
  }catch(e){}
  return Number(x.base_cost_eur||0)/(1-HOME_MARGIN);
}
// Single source of truth: the Studio's product image (studio-data.js products[].mockup_photo.src, default colour).
// Thumbs are keyed by that path: <dir>/thumb/<stem>.webp (+@2x), built by scripts/build_thumbs.py; img onerror falls back to the original.
function studioImageFor(x){return x?.mockup_photo?.src||""}
function thumbFor(src){const m=/^(.*)\/([^/]+)\.(jpe?g|png|webp)$/i.exec(src||"");return m?{src:`${m[1]}/thumb/${m[2]}.webp`,src2:`${m[1]}/thumb/${m[2]}@2x.webp`,orig:src}:(src?{src,src2:src,orig:src}:null)}
function homeProduct(id){
  const x=studioProductsById[id]||{id,name:{en:id},base_cost_eur:0};
  const img=studioImageFor(x),tb=thumbFor(img);
  return {
    id:x.id,
    name:pick(x.name,x.id),
    price:retailFrom(x),
    type:"studio",
    desc:[x.technique,(x.sizes||[]).slice(0,4).join(" / ")].filter(Boolean).join(" · "),
    moq:"POD",
    lead:"Studio",
    custom:"POD Design Studio",
    studio:true,
    image:img,
    thumb:tb?.src||"",
    thumb2:tb?.src2||"",
    thumbOrig:tb?.orig||"",
    colors:x.colors||[],
    category:x.category||"",
    technique:x.technique||"POD",
    eco:Array.isArray(x.eco_tags)&&x.eco_tags.length>0
  };
}
function sceneVariants(src){const m=/^(assets\/scenes\/[^/.]+)\.(jpg|webp)$/.exec(src||"");return m?{src:`${m[1]}-1200.webp`,srcset:`${m[1]}-800.webp 800w, ${m[1]}-1200.webp 1200w`}:{src:src||"",srcset:""}}
function buildSceneData(){
  return Object.fromEntries(HOME_SCENARIO_ORDER.map(id=>{
    const sc=(studioCatalog.scenarios||[]).find(x=>x.id===id);
    if(!sc) return [id,{name:id,subtitle:"",note:"",groups:[],hotspots:[],image:"",colors:["#d8cec2","#eadfd4","#c8b9ac","#c7b29c"]}];
    return [id,{
      id,
      name:pick(sc.name,id),
      subtitle:sc.name?.zh||sc.name?.en||id,
      note:pick(sc.audience,""),
      recommended:HOME_RECOMMENDED.has(id),
      image:sc.scene_image?.src||"",
      hotspots:sc.scene_image?.hotspots||[],
      hotspotSpace:sc.scene_image?.hotspot_space||"",
      colors:["#d8cec2","#eadfd4","#c8b9ac","#c7b29c"],
      groups:(sc.kits||[]).map(k=>[pick(k.name,k.id),(k.items||[]).map(homeProduct),k.id])
    }];
  }));
}
let sceneData = buildSceneData();

/** Per-language document metadata (html lang, title, description). */
const HOME_META={
  en:{title:"Print-on-Demand Design Platform for Custom Wedding & Personalised Products | POD.AI",desc:"Online print-on-demand (POD) design platform: design custom wedding invitations, welcome signs, favours and personalised products once in our design studio, see prices instantly, printed on demand and shipped across Europe.",alt:"Wedding table scene with personalised gifts",agent:"Open the wedding customisation agent",lightbox:"Material close-up",placeholder:"e.g. Amelia & Noah / 18 June 2027 / Welcome to our wedding"},
  zh:{title:"POD 按需印刷设计平台 — 婚礼定制与个性化产品 | POD.AI",desc:"在线 POD 按需印刷设计平台：在设计工作室里一次设计婚礼邀请卡、迎宾标识、伴手礼和个性化产品，即时查看价格，按需生产并配送至欧洲各地。",alt:"婚礼餐桌场景与定制礼品",agent:"打开婚礼定制 Agent",lightbox:"材质大图",placeholder:"例如：Amelia & Noah / 18 June 2027 / Welcome to our wedding"},
  de:{title:"Print-on-Demand Designplattform für Hochzeit & personalisierte Produkte | POD.AI",desc:"Online-Print-on-Demand-Designplattform: Hochzeitseinladungen, Willkommensschilder, Gastgeschenke und personalisierte Produkte einmal im Designstudio gestalten, Preise sofort sehen – auf Bestellung gedruckt, Versand in ganz Europa.",alt:"Hochzeitstisch-Szene mit personalisierten Geschenken",agent:"Hochzeits-Agent öffnen",lightbox:"Material-Nahaufnahme",placeholder:"z. B. Amelia & Noah / 18 June 2027 / Welcome to our wedding"}
};
function applyHomeMeta(){
  const l=homeLang(),m=HOME_META[l]||HOME_META.en;
  document.documentElement.lang=l==="zh"?"zh-CN":l;
  document.title=m.title;
  let d=document.querySelector('meta[name="description"]');if(!d){d=document.createElement("meta");d.name="description";document.head.appendChild(d)}d.content=m.desc;
  const set=(id,attr,v)=>{const el=document.getElementById(id);if(el)el.setAttribute(attr,v)};
  set("sceneImg","alt",m.alt);set("materialLightboxImage","alt",m.lightbox);set("customText","placeholder",m.placeholder);
}


const materialPhotos = {
  cotton:'/assets/materials/cotton.jpg',
  pearl:'/assets/materials/pearl.jpg',
  kraft:'/assets/materials/kraft.jpg',
  vellum:'/assets/materials/vellum.jpg',
  clear:'/assets/materials/clear.jpg',
  frosted:'/assets/materials/frosted.jpg',
  wood:'/assets/materials/wood.jpg',
  canvas:'/assets/materials/canvas.jpg',
  ceramic:'/assets/materials/ceramic.jpg'
};

const materialsByType = {
  invite:[
    {id:"cotton",name:"棉纹艺术纸",delta:0,desc:"细腻棉纹，触感柔和，适合邀请卡、感谢卡与高端纸品。"},
    {id:"pearl",name:"珠光纸",delta:2.5,desc:"轻微珠光反射，适合浪漫、法式与正式婚礼。"},
    {id:"kraft",name:"牛皮纸",delta:-1.2,desc:"自然纤维与暖棕色调，适合乡村、户外与复古主题。"},
    {id:"vellum",name:"半透明硫酸纸",delta:3.2,desc:"半透明磨砂效果，常用于覆层邀请卡与叠层设计。"}
  ],
  table:[
    {id:"cotton",name:"棉纹艺术纸",delta:0,desc:"适合菜单、席位卡和桌号卡。"},
    {id:"pearl",name:"珠光纸",delta:2.0,desc:"更精致的反光质感，适合正式晚宴。"},
    {id:"kraft",name:"牛皮纸",delta:-1.0,desc:"适合乡村、谷仓和自然风格。"},
    {id:"vellum",name:"半透明硫酸纸",delta:2.8,desc:"适合叠层菜单与透明桌卡。"}
  ],
  sign:[
    {id:"clear",name:"透明亚克力",delta:0,desc:"清透现代，适合迎宾牌、桌号牌和酒水牌。"},
    {id:"frosted",name:"磨砂亚克力",delta:8,desc:"柔和雾面效果，减少反光并提升高级感。"},
    {id:"wood",name:"天然木板",delta:12,desc:"真实木纹，适合户外、谷仓与乡村婚礼。"},
    {id:"kraft",name:"轻质硬板",delta:-6,desc:"轻便经济，适合大尺寸座位图与临时标识。"}
  ],
  gift:[
    {id:"canvas",name:"棉帆布",delta:0,desc:"适合 Tote Bag 与布艺伴手礼。"},
    {id:"ceramic",name:"陶瓷",delta:4.5,desc:"光滑釉面，适合杯子和纪念器皿。"},
    {id:"kraft",name:"牛皮纸包装",delta:-1.5,desc:"适合礼盒、标签和环保包装。"},
    {id:"pearl",name:"珠光包装纸",delta:1.8,desc:"适合精致礼盒与高级伴手礼包装。"}
  ]
};
let currentMaterialIndex=0;

let sceneKey=sessionStorage.getItem("pod-home-scenario")||"gifts",currentGroup=0,currentProduct=0,currentMode="text",cart=[],cartEditId=null;
const scene=document.getElementById("scene"),stage=document.getElementById("stage"),popover=document.getElementById("popover");

// ---- v25: storefront and POD Studio share the exact same 6 scenario records. ----
function renderSceneMenu(){
  const menu=document.getElementById("sceneMenu");
  menu.innerHTML=HOME_SCENARIO_ORDER.map(key=>{
    const s=sceneData[key];
    return `<button class="scene-option ${key===sceneKey?"active":""}" data-scene="${key}"><b>${s.name}</b>${s.recommended?`<span>★ ${homeT("Recommended for you")}</span>`:""}<span>${s.note}</span></button>`;
  }).join("");
  menu.querySelectorAll("[data-scene]").forEach(b=>b.onclick=e=>{e.stopPropagation();switchScene(b.dataset.scene);menu.classList.remove("open")});
}
async function openStudio(productId="") {
  // 临时关闭强制登录，部署时再启用
  // try { await window.PODAuth?.require?.(); location.href=studioHref(productId); }
  // catch(e) { /* user cancelled or server required */ }
  location.href=studioHref(productId);
}
function studioHref(productId=""){
  const q=new URLSearchParams({scenario:sceneKey,entry:"home"});
  if(productId)q.set("product",productId);
  return `studio.html?${q.toString()}`;
}
function switchScene(key=sceneKey){
  sceneKey=sceneData[key]?key:"gifts";currentGroup=0;currentProduct=0;
  sessionStorage.setItem("pod-home-scenario",sceneKey);
  const s=sceneData[sceneKey];
  scene.classList.remove("home-photo-scene");scene.classList.add("generated-scene","studio-scene");
  const hero=document.getElementById("sceneImg"),v=sceneVariants(s.image);
  scene.style.backgroundImage="";
  if(hero&&v.src&&hero.getAttribute("src")!==v.src){hero.srcset=v.srcset;hero.src=v.src}
  if(hero)hero.style.display=v.src?"":"none";
  document.getElementById("sceneTitle").textContent=s.name;
  document.getElementById("catalogTitle").textContent=s.name;
  document.getElementById("catalogAudience").textContent=(s.recommended?"★ "+homeT("Recommended for you")+" · ":"")+s.note;
  document.getElementById("sceneNoteTitle").textContent=s.name;
  document.getElementById("sceneNoteText").textContent=s.note;

  document.getElementById("studioStartBtn").href=studioHref();
  renderSceneMenu();renderHotspots();renderCatalog();popover.classList.remove("open");
}
document.getElementById("studioStartBtn").onclick=e=>{e.preventDefault();openStudio();};
function focusKit(gi){
  currentGroup=gi;
  document.querySelectorAll(".hotspot").forEach(h=>h.classList.toggle("active",+h.dataset.group===gi));
  const group=document.querySelector(`.group[data-group="${gi}"]`);
  group?.scrollIntoView({behavior:"smooth",block:"nearest"});
}
let hotspotResizeT;window.addEventListener("resize",()=>{clearTimeout(hotspotResizeT);hotspotResizeT=setTimeout(()=>{if(sceneData[sceneKey]?.hotspotSpace==="image")renderHotspots()},150)});
function renderHotspots(){
  const wrap=document.getElementById("hotspots");
  const s=sceneData[sceneKey];
  const pos=i=>{
    if(!(s.hotspots&&s.hotspots[i]))return ["","",""];
    let [x,y]=s.hotspots[i];
    if(s.hotspotSpace==="image"){ // hotspot given in % of the 3:2 source image → map through object-fit:cover
      const r=scene.getBoundingClientRect(),A=r.width/Math.max(1,r.height),I=1.5;
      if(A<I)x=+(((x/100-.5)*I/A+.5)*100).toFixed(1);else if(A>I)y=+(((y/100-.5)*A/I+.5)*100).toFixed(1);
    }
    const flip=x>55;
    return [` style="left:${x}%;top:${y}%;bottom:auto;transform:translate(-50%,-50%)"`,` style="--x:${x}%;--y:${y}%"`,flip?" pos flip":" pos"];
  };
  wrap.innerHTML=s.groups.map((g,i)=>`
    <button class="hotspot" data-slot="${i}" data-group="${i}" aria-label="${escHtml(g[0])}"${pos(i)[0]}></button>
    <div class="hotspot-label${pos(i)[2]}"${pos(i)[1]}>${escHtml(g[0])}</div>`).join("");
  wrap.querySelectorAll(".hotspot").forEach(h=>h.onclick=()=>focusKit(+h.dataset.group));
}
function renderCatalog(){
  const s=sceneData[sceneKey],cat=document.getElementById("catalog");
  cat.innerHTML=s.groups.map((g,gi)=>`
    <section class="group" data-group="${gi}">
      <div class="group-title"><b>${escHtml(g[0])}</b><span>${g[1].length} ${homeT("PRODUCTS")}</span></div>
      ${g[1].map((p,pi)=>`
        <button class="product" data-g="${gi}" data-p="${pi}" data-product="${p.id}">
          <div class="prod-img studio">${p.thumb?`<img src="${p.thumb}" srcset="${p.thumb} 1x, ${p.thumb2} 2x" onerror="this.onerror=null;this.removeAttribute('srcset');this.src='${p.thumbOrig}'" width="68" height="56" alt="${escHtml(p.name)}" loading="lazy" decoding="async">`:""}</div>
          <div><b>${escHtml(p.name)}</b><span>${escHtml(p.technique)}${p.eco?" · ♻ "+homeT("Eco"):""}</span></div>
          <strong>${fmtEur(p.price,{from:true})}<span class="vat-tag" data-vat-label>${escHtml(vatTag())}</span></strong>
        </button>`).join("")}
    </section>`).join("");
  cat.querySelectorAll(".product").forEach(b=>b.onclick=()=>openProductModal(b.dataset.product));
}
function current(){return sceneData[sceneKey].groups[currentGroup][1][currentProduct]}

function materialOptions(){
  const type=current().type;
  return materialsByType[type] || materialsByType.invite;
}
function currentMaterial(){
  return materialOptions()[currentMaterialIndex] || materialOptions()[0];
}
function renderMaterials(){
  currentMaterialIndex=0;
  const grid=document.getElementById("materialGrid");
  const options=materialOptions();
  grid.innerHTML=options.map((m,i)=>`
    <button class="material-option ${i===0?"active":""}" data-index="${i}">
      <img class="material-photo" src="${materialPhotos[m.id]}" alt="${escHtml(homeT(m.name))}" loading="lazy" decoding="async" data-preview="${i}">
      <b>${homeT(m.name)}</b>
      <span>${m.delta===0?homeT("基础价"):fmtEurDelta(m.delta)}</span>
    </button>
  `).join("");

  grid.querySelectorAll(".material-option").forEach(btn=>{
    btn.addEventListener("click",e=>{
      const i=+btn.dataset.index;
      currentMaterialIndex=i;
      grid.querySelectorAll(".material-option").forEach(x=>x.classList.toggle("active",x===btn));
      updatePrice();
    });
  });

  grid.querySelectorAll(".material-photo").forEach(img=>{
    img.addEventListener("click",e=>{
      e.stopPropagation();
      const i=+img.dataset.preview;
      const m=options[i];
      document.getElementById("materialLightboxTitle").textContent=homeT(m.name);
      document.getElementById("materialLightboxImage").src=materialPhotos[m.id];
      document.getElementById("materialLightboxDesc").textContent=homeT(m.desc);
      document.getElementById("materialLightbox").classList.add("open");
    });
  });
}

function openProduct(gi,pi,anchor){
  const sc=sceneData[sceneKey];
  currentGroup=gi;currentProduct=pi;currentMode="text";
  document.querySelectorAll(".hotspot").forEach(h=>h.classList.toggle("active",+h.dataset.group===gi));
  document.querySelectorAll(".product").forEach(p=>p.classList.toggle("active",+p.dataset.g===gi&&+p.dataset.p===pi));
  const group=sceneData[sceneKey].groups[gi],prod=group[1][pi];
  document.getElementById("popGroup").textContent=group[0].toUpperCase();
  document.getElementById("popName").textContent=prod.name;
  document.getElementById("customText").value="";
  document.getElementById("fileInput").value="";
  document.getElementById("fileList").textContent=homeT("尚未选择文件");
  document.getElementById("qty").value=1;
  renderMaterials();setMode("text");updatePrice();positionPopover(anchor);popover.classList.add("open");
}
function positionPopover(anchor){
  if(!anchor)return;

  const ar=anchor.getBoundingClientRect();
  const margin=12;

  // Keep the user's viewport in place.
  // Default anchor: popup left-top = hotspot right-bottom + 10px.
  const desiredLeft=ar.right+10;
  const desiredTop=ar.bottom+10;

  const preferredWidth=Math.min(360,Math.max(290,window.innerWidth-24));
  popover.style.width=preferredWidth+"px";

  let left=desiredLeft;
  const top=desiredTop;

  // Only correct horizontal overflow. Do not move the page vertically.
  if(left+preferredWidth>window.innerWidth-margin){
    const leftSide=ar.left-preferredWidth-10;
    left=leftSide>=margin
      ? leftSide
      : Math.max(margin,window.innerWidth-preferredWidth-margin);
  }

  // The popup becomes shorter when the point is lower in the viewport.
  // Its body scrolls internally, so opening it never pushes the page down.
  const availableBelow=Math.max(120,window.innerHeight-top-margin);
  popover.style.maxHeight=Math.min(680,availableBelow)+"px";

  popover.style.left=Math.round(left)+"px";
  popover.style.top=Math.round(top)+"px";

  requestAnimationFrame(()=>{
    const body=popover.querySelector(".pop-body");
    if(body)body.scrollTop=0;
  });
}
function setMode(mode){
  currentMode=mode;
  document.querySelectorAll(".mode").forEach(m=>m.classList.toggle("active",m.dataset.mode===mode));
  document.getElementById("textField").style.display=mode==="text"?"grid":"none";
  document.getElementById("uploadField").style.display=mode==="upload"?"grid":"none";
  document.getElementById("laterField").style.display=mode==="later"?"block":"none";
}
/** Studio products: unit price from the admin price list (same StudioPricing.quote the server charges with), shared market, default material. */
function studioPriceInfo(qty){
  const p=current();
  try{
    const tiers=(studioCatalog.price_list?.tiers)||[...(studioCatalog.qty_tiers||[])].map(t=>t.min_qty).sort((a,b)=>a-b);
    const unitAt=q=>StudioPricing.quote(studioCatalog,{market:homeMarket(),margin:HOME_MARGIN,items:[{product_id:p.id,qty:q}]}).lines[0]?.price;
    const unit=unitAt(qty);if(unit==null)return null;
    let tier=0;tiers.forEach((t,i)=>{if(qty>=t)tier=i});
    const next=tiers[tier+1],lo=tiers[tier],base=unitAt(1),off=base?Math.round((1-unit/base)*100):0;
    const label=(next?`${lo}–${next-1}`:`${lo}+`)+(off>0?` · −${off}%`:"");
    return {unit,total:Math.round(unit*qty*100)/100,tier,label,tiers,unitAt};
  }catch(e){return null}
}
function priceInfo(qty){
  if(current().studio){const s=studioPriceInfo(qty);if(s)return s}
  const material=currentMaterial();
  const base=Math.max(0,current().price + (material ? material.delta : 0));
  let discount=0,tier=0,label=homeT("1–9 件 · 标准价");
  if(qty>=50){discount=.15;tier=3;label=homeT("50+ 件 · 85 折")}
  else if(qty>=30){discount=.10;tier=2;label=homeT("30–49 件 · 9 折")}
  else if(qty>=10){discount=.05;tier=1;label=homeT("10–29 件 · 95 折")}
  const unit=base*(1-discount);
  return {unit,total:unit*qty,tier,label}
}
function updatePrice(){
  const qty=Math.max(1,parseInt(document.getElementById("qty").value)||1),info=priceInfo(qty);
  document.getElementById("unitPrice").textContent=fmtEur(info.unit);
  document.getElementById("totalPrice").textContent=fmtEur(info.total);
  document.getElementById("tierText").textContent=info.label;
  document.querySelectorAll(".tier-pill").forEach(x=>{if(x.dataset.orig==null)x.dataset.orig=x.innerHTML;if(!info.tiers){x.innerHTML=x.dataset.orig;x.style.display=x.dataset.tier==="4"?"none":""}});
  if(info.tiers){const pills=[...document.querySelectorAll(".tier-pill")],b=info.unitAt(1);pills.forEach((x,i)=>{const lo=info.tiers[i],nx=info.tiers[i+1];if(lo==null){x.style.display="none";return}x.style.display="";const u=info.unitAt(lo),off=b?Math.round((1-u/b)*100):0;x.innerHTML=`${nx?`${lo}–${nx-1}`:`${lo}+`}<br>${off>0?`−${off}%`:fmtEur(u)}`})}
  document.querySelectorAll(".tier-pill").forEach(x=>x.classList.toggle("active",+x.dataset.tier===info.tier));
}
function addCart(){
  const qty=Math.max(1,parseInt(document.getElementById("qty").value)||1),prod=current(),info=priceInfo(qty);
  const files=[...document.getElementById("fileInput").files].map(f=>f.name);
  const text=document.getElementById("customText").value.trim();
  if(currentMode==="upload"&&files.length===0){showToast(homeT("请先上传设计文件"));return}
  const customization=currentMode==="text"?(text?"Text: "+text:"Text: (to follow)"):currentMode==="upload"?"Design files: "+files.join(", "):"Design details after checkout";
  const material=currentMaterial();
  const sku=prod.name.toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48);
  const line={id:cartEditId||("l"+Date.now().toString(36)+Math.random().toString(36).slice(2,6)),productId:prod.id||"",sku,name:prod.name,sceneKey,scene:sceneData[sceneKey].name,g:currentGroup,p:currentProduct,qty,mode:currentMode,text,files,customization,material:material.name,materialId:material.id,thumb:prod.thumb||"",thumb2:prod.thumb2||"",thumbOrig:prod.thumbOrig||prod.image||""};
  cartEditId=null;PODCart.upsert(line);
  try{popover.classList.remove("open")}catch(e){}
  showToast(K("cart.added",{name:prod.name}));
}
function K(key,vars){return window.WeddingI18n?.k?window.WeddingI18n.k(key,vars):key}
function editCartLine(id){
  const i=PODCart.items.find(x=>x.id===id);if(!i)return;
  if(i.sceneKey&&i.sceneKey!==sceneKey&&sceneData[i.sceneKey])switchScene(i.sceneKey);
  const el=document.querySelector(`.product[data-g="${i.g}"][data-p="${i.p}"]`)||document.querySelector(`.hotspot[data-group="${i.g}"]`);
  try{openProduct(+i.g,+i.p,el);document.getElementById("qty").value=i.qty;if(i.mode==="text")document.getElementById("customText").value=i.text||"";updatePrice();cartEditId=i.id}catch(e){}
}
function escHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function showToast(t){
  const el=document.getElementById("toast");el.textContent=t;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1800)
}

document.getElementById("popClose").onclick=()=>popover.classList.remove("open");
document.querySelectorAll(".mode").forEach(m=>m.onclick=()=>setMode(m.dataset.mode));
document.getElementById("qty").oninput=updatePrice;
document.getElementById("fileInput").onchange=e=>{
  const names=[...e.target.files].map(f=>f.name);
  document.getElementById("fileList").textContent=names.length?names.join(" · "):homeT("尚未选择文件");
};
document.getElementById("addCart").onclick=addCart;
document.getElementById("detailBtn").onclick=()=>showToast(homeT("这里可连接 Shopify / WooCommerce / 自建商品详情"));
document.getElementById("materialLightboxClose").onclick=()=>document.getElementById("materialLightbox").classList.remove("open");
document.getElementById("materialLightbox").addEventListener("click",e=>{
  if(e.target.id==="materialLightbox") document.getElementById("materialLightbox").classList.remove("open");
});


stage.addEventListener("mousemove",e=>{
  if(window.innerWidth<1000||sceneKey==="cream")return;
  const r=stage.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
  scene.style.transform=`rotateY(${x*1.3}deg) rotateX(${-y*.8}deg) scale(1.004)`;
});
stage.addEventListener("mouseleave",()=>scene.style.transform="");

function repositionOpenPopover(){
  if(!popover.classList.contains("open"))return;
  const anchor=document.querySelector(`.hotspot[data-group="${currentGroup}"]`);
  if(anchor) positionPopover(anchor);
}
window.addEventListener("resize",repositionOpenPopover);
window.addEventListener("scroll",repositionOpenPopover,{passive:true});


document.querySelectorAll("[data-jump-scene]").forEach(b=>b.addEventListener("click",()=>{
  switchScene(b.dataset.jumpScene);window.scrollTo({top:0,behavior:"smooth"});
}));


document.getElementById("sceneCurrent").addEventListener("click",e=>{e.stopPropagation();document.getElementById("sceneMenu").classList.toggle("open")});
document.addEventListener("click",()=>document.getElementById("sceneMenu").classList.remove("open"));



PODCart.init({onChange:items=>{cart=items},onEdit:editCartLine});
(function(){const id=new URLSearchParams(location.search).get("cartEdit");if(id&&PODCart.items.some(x=>x.id===id)){history.replaceState(null,"",location.pathname+location.hash);setTimeout(()=>editCartLine(id),0)}})();
renderSceneMenu();switchScene(sceneKey);applyHomeMeta();
// Re-render the localized product area when the visitor switches language (keeps the current scene).
window.addEventListener("wedding-language-change",()=>{sceneData=buildSceneData();switchScene(sceneKey);applyHomeMeta();PODCart.render()});
