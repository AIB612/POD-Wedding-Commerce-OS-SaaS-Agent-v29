/* Shared site header + market/currency selection for every customer page.
   Usage (top of <body>, loaded synchronously so #cartBtn exists before cart.js runs):
     <div id="site-header" data-cart data-variant="checkout|studio"> [optional children with data-slot="actions" or data-header-menu] </div>
     <script src="/header.js"></script>
   - Brand: "POD Wedding Studio" (one name everywhere).
   - Market (CH · CHF / EU · EUR) is ONE shared selection in localStorage ("pod-market-v1"), read by home, studio, cart and checkout
     through window.PODMarket. It is kept in sync with the checkout country ("pod-checkout-v1"): CH/LI → CH (CHF), other countries → EU (EUR).
   - Elements marked data-header-menu (page-specific secondary actions) are moved into the "Menu" panel. */
(function(){
  var MKEY="pod-market-v1",CO_KEY="pod-checkout-v1",MARKETS={CH:{currency:"CHF",flag:"🇨🇭",label:"Switzerland"},EU:{currency:"EUR",flag:"🇪🇺",label:"European Union"}};
  function rd(k){try{return JSON.parse(localStorage.getItem(k)||"null")}catch(e){return null}}
  function wr(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function marketForCountry(c){return (c==="CH"||c==="LI")?"CH":"EU"}
  var Market={
    KEY:MKEY,list:MARKETS,marketForCountry:marketForCountry,
    get:function(){var m=rd(MKEY);if(m&&MARKETS[m.id])return m.id;var co=rd(CO_KEY);return co&&co.country?marketForCountry(co.country):"CH"},
    currency:function(){return MARKETS[Market.get()].currency},
    /** Destination country used for cart quotes: the checkout country if it matches the market, otherwise the market's default. */
    country:function(){var co=rd(CO_KEY)||{},m=Market.get();if(co.country&&marketForCountry(co.country)===m)return co.country;var s=rd(MKEY);return m==="CH"?"CH":(s&&s.country&&marketForCountry(s.country)==="EU"?s.country:"DE")},
    set:function(id,opts){if(!MARKETS[id])return;var prev=Market.get(),s=rd(MKEY)||{};s.id=id;wr(MKEY,s);
      var co=rd(CO_KEY)||{};if(!co.country||marketForCountry(co.country)!==id){co.country=Market.country();wr(CO_KEY,co)}
      syncSelects();if(prev!==id&&!(opts&&opts.silent)){var ev=new CustomEvent("pod-market-change",{detail:{market:id,currency:MARKETS[id].currency},cancelable:true});if(window.dispatchEvent(ev))location.reload()}},
    /** Checkout country changed: remember it and switch the market when needed (no reload). */
    setCountry:function(c){if(!c)return;var s=rd(MKEY)||{},id=marketForCountry(c);s.id=id;if(id==="EU")s.country=c;wr(MKEY,s);syncSelects()}
  };
  window.PODMarket=Market;
  function syncSelects(){var v=Market.get();document.querySelectorAll("select.sh-market").forEach(function(s){s.value=v})}
  function K(k,en){try{var w=window.WeddingI18n;if(w&&w.k){var v=w.k(k);if(v&&v!==k)return v}}catch(e){}return en}
  var css=".sh{position:sticky;top:0;z-index:60;background:rgba(255,253,249,.94);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid rgba(45,36,30,.12);font:14px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#28231f}"+
  ".sh-in{max-width:1440px;margin:0 auto;display:flex;align-items:center;gap:18px;padding:10px 22px;min-height:60px}"+
  ".sh a{color:inherit;text-decoration:none}.sh-brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px;white-space:nowrap;flex:none}"+
  ".sh-logo{width:34px;height:34px;border-radius:11px;background:#292622;color:#fff;display:grid;place-items:center;font-weight:800}"+
  ".sh-nav{display:flex;gap:4px;flex:1;min-width:0}.sh-nav a{padding:8px 12px;border-radius:999px;font-weight:600;font-size:13.5px;color:#4b443e}.sh-nav a:hover,.sh-nav a[aria-current=page]{background:#f1ebe4;color:#28231f}"+
  ".sh-act{display:flex;align-items:center;gap:8px;margin-left:auto;flex:none}.sh-slot{display:flex;align-items:center;gap:8px}"+
  ".sh-market{appearance:none;-webkit-appearance:none;height:34px;border:1px solid rgba(45,36,30,.14);border-radius:8px;background:#fff;padding:0 12px;font:600 12px Inter,system-ui,sans-serif;color:#28231f;cursor:pointer}"+
  ".sh-menu-btn{display:inline-flex;align-items:center;gap:6px;height:40px;min-width:44px;justify-content:center;border:1px solid rgba(45,36,30,.16);border-radius:999px;background:#fff;padding:0 14px;font:600 13px Inter,system-ui,sans-serif;color:#28231f;cursor:pointer}"+
  ".sh-menu-btn svg{width:18px;height:18px}.sh-secure{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#4f775b;font-weight:600}"+
  ".sh-menu{position:absolute;right:16px;top:calc(100% + 6px);width:min(340px,calc(100vw - 32px));background:#fffdf9;border:1px solid rgba(45,36,30,.14);border-radius:16px;box-shadow:0 18px 50px rgba(40,30,20,.16);padding:10px;display:grid;gap:2px}"+
  ".sh-menu a,.sh-menu button.sh-mi{display:flex;align-items:center;min-height:44px;padding:0 12px;border-radius:10px;font-weight:600;font-size:14px;border:0;background:none;width:100%;text-align:left;cursor:pointer;color:#28231f;font-family:inherit}"+
  ".sh-menu a:hover,.sh-menu .sh-mi:hover{background:#f6f1eb}.sh-menu .sh-sep{height:1px;background:rgba(45,36,30,.1);margin:6px 4px}"+
  ".sh-menu .sh-extra>*{width:100%;justify-content:flex-start;min-height:44px}.sh-menu .sh-row{display:flex;gap:8px;padding:6px 8px}.sh-menu .sh-row>*{flex:1}"+
  ".sh-menu h5{margin:6px 12px 2px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7c746c}"+
  ".sh-menu[hidden]{display:none!important}.sh-only-m{display:none!important}.sh-menu-btn{display:none}"+"@media(max-width:720px){.sh-menu-btn{display:inline-flex!important}}"+
  "@media(max-width:860px){.sh-nav{display:none}}"+
  "@media(max-width:720px){.sh-in{padding:8px 12px;gap:8px;min-height:56px}.sh-name{font-size:14px}.sh-act .sh-market,.sh-act [data-lang-switch],.sh-act .sh-secure{display:none!important}.sh-only-m{display:flex!important}.sh-menu-btn .sh-mt{display:none}}"+
  "@media(max-width:380px){.sh-name{font-size:13px}}";
  var ICON_MENU='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
  var ICON_CART='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';
  function marketSelect(){var v=Market.get();return '<select class="sh-market" aria-label="Market and currency">'+Object.keys(MARKETS).map(function(id){var m=MARKETS[id];return '<option value="'+id+'"'+(id===v?' selected':'')+'>'+m.flag+' '+id+' · '+m.currency+'</option>'}).join("")+'</select>'}
  function mount(host){
    if(!host||document.querySelector("header.sh"))return;
    var st=document.createElement("style");st.id="site-header-style";st.textContent=css;document.head.appendChild(st);
    var variant=host.getAttribute("data-variant")||"",cart=host.hasAttribute("data-cart"),path=location.pathname;
    var slots=[].slice.call(host.querySelectorAll('[data-slot="actions"]')),extras=[].slice.call(document.querySelectorAll("[data-header-menu]"));
    var cur=function(h){return (h==="/"?(path==="/"||path==="/index.html"):path.indexOf(h)===0)?' aria-current="page"':''};
    var nav='<a href="/"'+cur("/")+' data-i18n="hdr.shop">Shop</a><a href="/studio.html"'+cur("/studio")+' data-i18n="hdr.studio">Design studio</a><a href="/account"'+cur("/account")+' data-i18n="hdr.account">My account</a>';
    var h=document.createElement("header");h.className="sh";h.setAttribute("data-variant",variant);
    h.innerHTML='<div class="sh-in"><a class="sh-brand" href="/" aria-label="POD Wedding Studio — home"><span class="sh-logo">P</span><span class="sh-name">POD Wedding Studio</span></a>'+
      '<nav class="sh-nav" aria-label="Main">'+nav+'</nav><div class="sh-act"><div class="sh-slot"></div>'+
      (variant==="checkout"?'<span class="sh-secure"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span data-i18n="co.secure">Secure checkout</span></span>':'')+
      marketSelect()+'<div class="lang-switch" data-lang-switch></div>'+
      (cart?'<button class="cart-btn" id="cartBtn" type="button" aria-haspopup="dialog" aria-controls="cartPanel">'+ICON_CART+'<span class="cart-btn-label" data-i18n="cart.button">Cart</span><span class="cart-badge" id="cartCount" data-n="0">0</span></button>':'')+
      '<button class="sh-menu-btn" id="shMenuBtn" type="button" aria-expanded="false" aria-controls="shMenu">'+ICON_MENU+'<span class="sh-mt" data-i18n="hdr.menu">Menu</span></button></div></div>'+
      '<div class="sh-menu" id="shMenu" hidden role="menu"><div class="sh-extra"></div>'+nav.replace(/<a /g,'<a role="menuitem" ')+
      '<div class="sh-sep"></div><a href="/shipping" role="menuitem" data-i18n="hdr.shipping">Shipping &amp; production times</a><a href="/returns" role="menuitem" data-i18n="hdr.returns">Returns &amp; defects</a><a href="/account#find-order" role="menuitem" data-i18n="hdr.findOrder">Find my order</a>'+
      '<div class="sh-only-m" style="flex-direction:column"><div class="sh-sep"></div><h5 data-i18n="hdr.prefs">Language &amp; currency</h5><div class="sh-row">'+marketSelect()+'<div class="lang-switch" data-lang-switch></div></div><div class="sh-slot-m sh-row"></div></div></div>';
    host.parentNode.replaceChild(h,host);
    var slot=h.querySelector(".sh-slot");slots.forEach(function(s){slot.appendChild(s)});
    // Page actions marked data-mobile="menu" (e.g. the studio role selector) move into the Menu on small screens.
    var slotM=h.querySelector(".sh-slot-m"),mq=window.matchMedia("(max-width:720px)");
    function place(){slots.forEach(function(el){if(el.getAttribute("data-mobile")!=="menu")return;var to=mq.matches?slotM:slot;if(el.parentNode!==to)to.appendChild(el)})}
    place();if(mq.addEventListener)mq.addEventListener("change",place);else if(mq.addListener)mq.addListener(place);
    var ex=h.querySelector(".sh-extra");extras.forEach(function(e){e.classList.add("sh-mi");ex.appendChild(e)});if(extras.length)ex.insertAdjacentHTML("afterend",'<div class="sh-sep"></div>');
    var btn=h.querySelector("#shMenuBtn"),menu=h.querySelector("#shMenu");
    function setOpen(o){menu.hidden=!o;btn.setAttribute("aria-expanded",o?"true":"false")}
    btn.addEventListener("click",function(e){e.stopPropagation();setOpen(menu.hidden)});
    menu.addEventListener("click",function(e){if(e.target.closest("a,button.sh-mi"))setOpen(false)});
    document.addEventListener("click",function(e){if(!menu.hidden&&!e.target.closest("#shMenu,#shMenuBtn"))setOpen(false)});
    document.addEventListener("keydown",function(e){if(e.key==="Escape"&&!menu.hidden){setOpen(false);btn.focus()}});
    h.querySelectorAll("select.sh-market").forEach(function(s){s.addEventListener("change",function(){Market.set(s.value)})});
    var relabel=function(){h.querySelectorAll("[data-i18n]").forEach(function(el){var k=el.getAttribute("data-i18n");if(k.indexOf("hdr.")===0||k==="co.secure")el.textContent=K(k,el.textContent)})};
    window.addEventListener("wedding-language-change",relabel);document.addEventListener("DOMContentLoaded",function(){relabel();if(window.WeddingI18n&&WeddingI18n.mountSwitches)WeddingI18n.mountSwitches()});
  }
  var host=document.getElementById("site-header");
  if(host)mount(host);else document.addEventListener("DOMContentLoaded",function(){mount(document.getElementById("site-header"))});
})();
