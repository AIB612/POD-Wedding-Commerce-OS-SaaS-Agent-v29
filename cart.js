/* Shared storefront cart (header bag button + drawer), used by index.html and studio.html.
 * One localStorage cart ("pod-cart-v1") so lines are identical on every page.
 * Page markup: a #cartBtn (with #cartCount badge) in the header. The drawer markup is injected if the page
 * does not already contain #cartPanel. Strings come from i18n.js (WeddingI18n.k / .t).
 * PODCart.init({onEdit(line), onChange(items)}) wires the page; PODCart.upsert(line) adds/replaces a line. */
(function(){
const CART_KEY="pod-cart-v1",CO_KEY="pod-checkout-v1";
const DRAWER="<div class=\"cart-scrim\" id=\"cartScrim\"></div>\n<aside class=\"cart-panel\" id=\"cartPanel\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"cartTitle\" aria-hidden=\"true\">\n  <div class=\"cart-head\"><h3 id=\"cartTitle\"><span data-i18n=\"cart.title\">Your cart</span><small id=\"cartItemsLabel\"></small></h3><button class=\"cart-close\" id=\"cartClose\" type=\"button\" data-i18n-attr=\"aria-label:cart.close\" aria-label=\"Close cart\">\u00d7</button></div>\n  <div class=\"cart-list\" id=\"cartList\"></div>\n  <div class=\"cart-foot\" id=\"cartFoot\">\n    <div class=\"cart-row\"><span data-i18n=\"cart.subtotal\">Subtotal</span><strong id=\"cartSubtotal\">\u2014</strong></div>\n    <div class=\"cart-row\"><span data-i18n=\"cart.shipping\">Shipping</span><span data-i18n=\"cart.shippingLater\">Calculated at checkout</span></div>\n    <div class=\"cart-row total\"><span data-i18n=\"cart.total\">Total</span><strong id=\"cartTotal\">\u2014</strong></div>\n    <div class=\"cart-vat\" data-i18n=\"cart.vatIncl\">Incl. VAT where applicable</div>\n    <div class=\"cart-status\" id=\"cartStatus\" aria-live=\"polite\"></div>\n    <button class=\"cart-checkout\" id=\"checkoutBtn\" type=\"button\" data-i18n=\"cart.checkout\">Checkout</button>\n    <div class=\"pay-marks\"><span data-i18n=\"cart.weAccept\">We accept</span><span class=\"pay-mark\">TWINT</span><span class=\"pay-mark\">PayPal</span></div>\n    <ul class=\"cart-trust\"><li data-i18n=\"cart.trust.secure\">Secure, encrypted payment</li><li data-i18n=\"cart.trust.proof\">Digital proof by e-mail within 2 h of payment</li><li data-i18n=\"cart.trust.delivery\">Delivered in about 14 days after approval</li></ul>\n  </div>\n</aside>";
const HOME_LOCALE={zh:"zh-CN",en:"en-GB",de:"de-DE"};
const $=id=>document.getElementById(id);
let cart=loadCart(),cartQuote=null,opts={},seq=0,timer=null;
function K(key,vars){return window.WeddingI18n?.k?window.WeddingI18n.k(key,vars):key}
function T(zh){return window.WeddingI18n?.t?.(zh)??zh}
function lang(){return window.WeddingI18n?.lang?.()||"en"}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function loadCart(){try{const v=JSON.parse(localStorage.getItem(CART_KEY)||"[]");return Array.isArray(v)?v.filter(x=>x&&x.name&&x.qty>0).slice(0,50):[]}catch(e){return []}}
function saveCart(){try{localStorage.setItem(CART_KEY,JSON.stringify(cart))}catch(e){}}
function changed(){try{opts.onChange?.(cart)}catch(e){}}
function cartCountry(){try{return JSON.parse(localStorage.getItem(CO_KEY)||"{}").country||"CH"}catch(e){return "CH"}}
function fmtMoney(n,cur){const l=lang();return new Intl.NumberFormat(l==="de"?(cur==="EUR"?"de-DE":"de-CH"):(HOME_LOCALE[l]||"en-GB"),{style:"currency",currency:cur||"CHF"}).format(Number(n)||0)}
function cartVariant(i){
  const parts=[T(i.scene)];
  if(i.material)parts.push(K("cart.material",{m:T(i.material)}));
  const v=i.mode==="upload"?K("cart.files",{t:(i.files||[]).join(", ")}):i.mode==="later"?K("cart.later"):(i.text?K("cart.text",{t:i.text}):K("cart.noText"));
  return parts.filter(Boolean).map(esc).join(" · ")+"<br>"+esc(v);
}
function render(bump){
  const badge=$("cartCount");if(!badge||!$("cartList"))return;
  const n=cart.reduce((a,b)=>a+b.qty,0);
  badge.textContent=n>99?"99+":n;badge.dataset.n=n;
  $("cartBtn").setAttribute("aria-label",K("cart.open",{n}));
  if(bump){badge.classList.remove("bump");void badge.offsetWidth;badge.classList.add("bump")}
  $("cartItemsLabel").textContent=n?K("cart.items",{n}):"";
  const list=$("cartList"),foot=$("cartFoot");
  foot.hidden=!cart.length;
  if(!cart.length){list.innerHTML=`<div class="cart-empty"><b>${esc(K("cart.empty.title"))}</b><p>${esc(K("cart.empty.text"))}</p><button type="button" id="cartContinue">${esc(K("cart.empty.cta"))}</button></div>`;$("cartContinue").onclick=close;return}
  const q=cartQuote,cur=q?.currency;
  list.innerHTML=cart.map((i,idx)=>{const ql=q?.items?.[idx];return `
    <div class="cart-item" data-id="${esc(i.id)}">
      <div class="cart-thumb">${i.thumb?`<img src="${esc(i.thumb)}" srcset="${esc(i.thumb)} 1x, ${esc(i.thumb2||i.thumb)} 2x" onerror="this.onerror=null;this.removeAttribute('srcset');this.src='${esc(i.thumbOrig)}'" width="72" height="72" alt="" loading="lazy" decoding="async">`:""}</div>
      <div class="cart-info"><b>${esc(i.name)}</b><div class="cart-variant">${cartVariant(i)}</div>
        <div class="cart-controls">
          <div class="cart-qty" role="group" aria-label="${esc(K("cart.qty"))}"><button type="button" data-act="dec" aria-label="${esc(K("cart.decrease"))}" ${i.qty<=1?"disabled":""}>−</button><input type="number" inputmode="numeric" min="1" max="10000" value="${i.qty}" data-act="set" aria-label="${esc(K("cart.qty"))}"><button type="button" data-act="inc" aria-label="${esc(K("cart.increase"))}">+</button></div>
          <button type="button" class="cart-link" data-act="edit">${esc(K("cart.edit"))}</button><button type="button" class="cart-link" data-act="remove">${esc(K("cart.remove"))}</button>
        </div></div>
      <div class="cart-price"><strong>${ql?fmtMoney(ql.line_total,cur):"—"}</strong>${ql&&ql.quantity>1?`<span>${esc(K("cart.each",{p:fmtMoney(ql.unit_price,cur)}))}</span>`:""}</div>
    </div>`}).join("");
  $("cartSubtotal").textContent=q?fmtMoney(q.subtotal,cur):"—";
  $("cartTotal").textContent=q?fmtMoney(q.subtotal,cur):"—";
}
function cartPayload(){return cart.map(i=>({product_id:i.productId||undefined,sku:i.sku,name:i.name,quantity:i.qty,material:i.material,material_id:i.materialId,customization:i.customization}))}
function refreshQuote(){clearTimeout(timer);timer=setTimeout(fetchQuote,200)}
async function fetchQuote(){
  if(!cart.length){cartQuote=null;render();return}
  const s=++seq,st=$("cartStatus");st.textContent=K("cart.updating");
  try{
    const r=await fetch("/api/storefront/shipping/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cart:cartPayload(),country:cartCountry(),shipping_method:"standard"})});
    const d=await r.json();if(!r.ok)throw new Error(d.error||"quote_failed");
    if(s!==seq)return;cartQuote=d;st.textContent="";
  }catch(e){if(s!==seq)return;cartQuote=null;st.textContent=K("cart.priceError")}
  render();
}
function commit(bump){saveCart();changed();render(bump);refreshQuote()}
function setQty(id,qty){const i=cart.find(x=>x.id===id);if(!i)return;i.qty=Math.max(1,Math.min(10000,parseInt(qty)||1));commit(true)}
function upsert(line){const at=cart.findIndex(x=>x.id===line.id);if(at>=0)cart[at]=line;else cart.push(line);commit(true)}
function remove(id){cart=cart.filter(x=>x.id!==id);commit(true)}
function open(){const p=$("cartPanel");p.classList.add("open");p.setAttribute("aria-hidden","false");$("cartScrim").classList.add("open");document.body.classList.add("cart-open");refreshQuote();setTimeout(()=>$("cartClose").focus(),50)}
function close(){const p=$("cartPanel");p.classList.remove("open");p.setAttribute("aria-hidden","true");$("cartScrim").classList.remove("open");document.body.classList.remove("cart-open");$("cartBtn").focus()}
function isOpen(){return !!$("cartPanel")?.classList.contains("open")}
function init(o){
  opts=o||{};
  if(!$("cartPanel")){const w=document.createElement("div");w.innerHTML=DRAWER;while(w.firstChild)document.body.appendChild(w.firstChild);window.WeddingI18n?.translate?.($("cartPanel"));try{window.WeddingI18n?.k&&document.querySelectorAll("#cartPanel [data-i18n],#cartScrim [data-i18n]").forEach(el=>el.textContent=K(el.dataset.i18n));const c=$("cartClose");c.setAttribute("aria-label",K("cart.close"))}catch(e){}}
  const b=$("cartBtn");if(b){const l=b.querySelector("[data-i18n]");if(l&&window.WeddingI18n?.k)l.textContent=K(l.dataset.i18n)}
  $("cartList").addEventListener("click",e=>{
    const b=e.target.closest("[data-act]"),row=e.target.closest(".cart-item");if(!b||!row||b.tagName==="INPUT")return;
    const id=row.dataset.id,i=cart.find(x=>x.id===id);if(!i)return;
    if(b.dataset.act==="inc")setQty(id,i.qty+1);
    else if(b.dataset.act==="dec")setQty(id,i.qty-1);
    else if(b.dataset.act==="remove")remove(id);
    else if(b.dataset.act==="edit"){if(opts.onEdit){close();opts.onEdit(i)}}
  });
  $("cartList").addEventListener("change",e=>{const row=e.target.closest(".cart-item");if(row&&e.target.dataset.act==="set")setQty(row.dataset.id,e.target.value)});
  $("cartBtn").onclick=open;$("cartClose").onclick=close;$("cartScrim").onclick=close;
  $("checkoutBtn").onclick=()=>{if(!cart.length)return;saveCart();location.href="checkout.html"};
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&isOpen())close()});
  window.addEventListener("storage",e=>{if(e.key===CART_KEY){cart=loadCart();changed();render();refreshQuote()}});
  window.addEventListener("wedding-language-change",()=>render());
  changed();render();if(cart.length)refreshQuote();
}
function relabel(){const b=$("cartBtn");const l=b&&b.querySelector("[data-i18n]");if(l&&window.WeddingI18n?.k)l.textContent=K(l.dataset.i18n);document.querySelectorAll("#cartPanel [data-i18n]").forEach(el=>el.textContent=K(el.dataset.i18n));const c=$("cartClose");if(c)c.setAttribute("aria-label",K("cart.close"));render()}
window.PODCart={KEY:CART_KEY,init,upsert,remove,setQty,open,close,isOpen,render,relabel,refreshQuote,fmtMoney,get items(){return cart}};
})();
