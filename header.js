/* Shared site header + market/currency selection for every customer page.
   Usage (top of <body>, loaded synchronously so #cartBtn exists before cart.js runs):
     <div id="site-header" data-cart data-variant="checkout|studio"> [optional children with data-slot="actions" or data-header-menu] </div>
     <script src="/header.js"></script>
   - Brand: "POD Wedding Studio" (one name everywhere).
   - Market (CH · CHF / EU · EUR) is ONE shared selection in localStorage ("pod-market-v1"), read by home, studio, cart and checkout
     through window.PODMarket. It is kept in sync with the checkout country ("pod-checkout-v1"): CH/LI -> CH (CHF), other countries -> EU (EUR).
   - Guest order lookup lives at /account#find-order. */
(function(){
  var MKEY="pod-market-v1",CO_KEY="pod-checkout-v1",MARKETS={CH:{currency:"CHF",flag:"🇨🇭",label:"Switzerland"},EU:{currency:"EUR",flag:"🇪🇺",label:"European Union"},US:{currency:"USD",flag:"🌐",label:"International"}},
    EEA=["AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK","IS","NO"];
  function rd(k){try{return JSON.parse(localStorage.getItem(k)||"null")}catch(e){return null}}
  function wr(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function marketForCountry(c){c=String(c||"").toUpperCase();return (c==="CH"||c==="LI")?"CH":EEA.indexOf(c)>=0?"EU":"US"}
  function langCountry(){try{var m=String(navigator.language||"").match(/-([A-Za-z]{2})$/);return m?m[1].toUpperCase():""}catch(e){return ""}}
  var Market={
    KEY:MKEY,list:MARKETS,marketForCountry:marketForCountry,
    /** No user choice: checkout country if entered, else visitor geo (/api/geo, IP headers), else browser locale. */
    get:function(){var co=rd(CO_KEY);if(co&&co.country)return marketForCountry(co.country);var m=rd(MKEY);if(m&&m.geo)return marketForCountry(m.geo);var lc=langCountry();return lc?marketForCountry(lc):"US"},
    currency:function(){return MARKETS[Market.get()].currency},
    /** Destination country used for cart quotes: the checkout country if it matches the market, otherwise the market's default. */
    country:function(){var co=rd(CO_KEY)||{},m=Market.get();if(co.country&&marketForCountry(co.country)===m)return co.country;var s=rd(MKEY);if(s&&s.geo&&marketForCountry(s.geo)===m)return s.geo;return m==="CH"?"CH":m==="EU"?"DE":"US"},
    set:function(id,opts){if(!MARKETS[id])return;var prev=Market.get(),s=rd(MKEY)||{};s.id=id;wr(MKEY,s);
      var co=rd(CO_KEY)||{};if(!co.country||marketForCountry(co.country)!==id){co.country=Market.country();wr(CO_KEY,co)}
      syncSelects();if(prev!==id&&!(opts&&opts.silent)){var ev=new CustomEvent("pod-market-change",{detail:{market:id,currency:MARKETS[id].currency},cancelable:true});if(window.dispatchEvent(ev))location.reload()}},
    /** Checkout country changed: remember it and switch the market when needed (no reload). */
    setCountry:function(c){if(!c)return;var s=rd(MKEY)||{},id=marketForCountry(c);s.id=id;if(id==="EU")s.country=c;wr(MKEY,s);syncSelects()}
  };
  window.PODMarket=Market;
  (function(){var s=rd(MKEY)||{};if(s.geo_at&&Date.now()-s.geo_at<864e5)return;var before=Market.get();
    fetch("/api/geo").then(function(r){return r.ok?r.json():null}).then(function(g){if(!g||!g.country)return;var t=rd(MKEY)||{};t.geo=g.country;t.geo_at=Date.now();delete t.id;wr(MKEY,t);
      if(Market.get()!==before){var ev=new CustomEvent("pod-market-change",{detail:{market:Market.get(),currency:Market.currency()},cancelable:true});if(window.dispatchEvent(ev))location.reload()}}).catch(function(){})})();
  function syncSelects(){var v=Market.get();document.querySelectorAll("select.sh-market").forEach(function(s){s.value=v})}
  function K(k,en){try{var w=window.WeddingI18n;if(w&&w.k){var v=w.k(k);if(v&&v!==k)return v}}catch(e){}return en}
  var css=".sh.topbar{position:sticky;top:0;z-index:60;width:100%;min-height:68px;padding:0 22px;display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1px solid rgba(45,36,30,.12);background:rgba(255,253,249,.86);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font:14px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#28231f}"+
  ".sh .brand{display:flex;gap:11px;align-items:center;text-decoration:none;color:inherit;min-width:0}"+
  ".sh .logo{width:38px;height:38px;border-radius:13px;background:#292622;color:#fff;display:grid;place-items:center;font-weight:800;font-size:15px;flex:none}"+
  ".sh .brand b{display:block;font-size:13px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;line-height:1.2}"+
  ".sh .brand span{display:block;color:#7c746c;font-size:11px;margin-top:3px;font-weight:400;line-height:1.25}"+
  ".sh .actions{display:flex;align-items:center;gap:8px;margin-left:auto;flex:none}"+
  ".sh .sh-slot{display:inline-flex;align-items:center;gap:8px}"+
  ".sh .topbar-row2{display:contents}"+
  ".sh .btn{border:1px solid rgba(45,36,30,.12);background:#fff;border-radius:999px;padding:9px 13px;cursor:pointer;font-size:12px;color:#28231f;text-decoration:none;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}"+
  ".sh .topbar-shopify{border-color:rgba(90,49,244,.28);background:#f8f5ff;color:#3d1ec9;font-weight:600}"+
  ".sh .topbar-shopify:hover{background:#efe9ff}"+
  ".sh .topbar-shopify.connected{border-color:rgba(47,133,90,.3);background:#f0fff4;color:#22543d}"+
  ".sh-market{appearance:none;-webkit-appearance:none;border:1px solid rgba(45,36,30,.14);background:#fff url(\"data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2710%27 height=%276%27%3E%3Cpath d=%27M1 1l4 4 4-4%27 stroke=%27%2328231f%27 fill=%27none%27 stroke-width=%271.4%27/%3E%3C/svg%3E\") no-repeat right 11px center;border-radius:999px;padding:7px 28px 7px 12px;font:inherit;font-size:12px;color:#28231f;cursor:pointer}"+
  ".sh-secure{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#4f775b;font-weight:600}"+
  "@media(max-width:720px){.sh.topbar{padding:8px 12px;min-height:56px;height:auto;flex-wrap:wrap;gap:8px}.sh .brand{gap:8px}.sh .logo{width:30px;height:30px;border-radius:10px;font-size:13px}.sh .brand b{font-size:12px;white-space:nowrap;letter-spacing:.03em}.sh .brand span{display:none}.sh .topbar-row2{grid-column:1/-1;grid-row:2;display:flex;gap:6px;min-width:0}.sh-market{padding:5px 24px 5px 10px;font-size:11px;background-position:right 8px center}}";
  var ICON_CART='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>';
  function marketSelect(){return ""}
  function _unusedMarketSelect(){var v=Market.get();return '<select class="sh-market" aria-label="Market and currency">'+Object.keys(MARKETS).map(function(id){var m=MARKETS[id];return '<option value="'+id+'"'+(id===v?' selected':'')+'>'+m.flag+' '+id+' · '+m.currency+'</option>'}).join("")+'</select>'}
  function mount(host){
    if(!host||document.querySelector("header.sh"))return;
    var st=document.createElement("style");st.id="site-header-style";st.textContent=css;document.head.appendChild(st);
    var variant=host.getAttribute("data-variant")||"",cart=host.hasAttribute("data-cart"),path=location.pathname;
    var isHome=(path==="/"||path==="/index.html")&&!variant;
    var slots=[].slice.call(host.querySelectorAll('[data-slot="actions"]')),extras=[].slice.call(document.querySelectorAll("[data-header-menu]"));
    var sub=variant==="studio"?'<span data-i18n="hdr.studioTagline" data-t="tagline">Scenario → design → pricing → delivery</span>':variant==="checkout"?'<span data-i18n="co.title">Checkout</span>':'<span data-i18n="hdr.tagline">Scene-based selection · customisation · tiered pricing · cart</span>';
    var back=(!isHome&&variant!=="checkout")?'<a class="btn" href="/" data-i18n="hdr.backToShop"'+(variant==="studio"?' data-t="backToShop"':'')+'>Back to wedding shop</a>':'';
    var isStudio=variant==="studio"||/\/studio(\.html)?$/.test(path);
    var shopifyBtn=isStudio?'':'<button class="btn ghost topbar-shopify" id="shopifyConnectBtn" type="button" data-i18n="hdr.shopifyConnect">🔗 Connect Shopify</button>';
    var cartBtn=cart?'<button class="cart-btn" id="cartBtn" type="button" aria-haspopup="dialog" aria-controls="cartPanel">'+ICON_CART+'<span class="cart-btn-label" data-i18n="cart.button">Cart</span><span class="cart-badge" id="cartCount" data-n="0">0</span></button>':'';
    var h=document.createElement("header");h.className="sh topbar";h.setAttribute("data-variant",variant);
    if(isHome){
      h.innerHTML='<a class="brand sh-brand" href="/" aria-label="POD Wedding Studio — home"><div class="logo sh-logo">P</div><div><b class="sh-name">POD Wedding Studio</b>'+sub+'</div></a>'+
        '<div class="actions sh-act"><div class="lang-switch" data-lang-switch></div><div class="topbar-row2 sh-slot">'+marketSelect()+shopifyBtn+'</div>'+cartBtn+'</div>';
    }else{
      h.innerHTML='<a class="brand sh-brand" href="/" aria-label="POD Wedding Studio — home"><div class="logo sh-logo">P</div><div><b class="sh-name">POD Wedding Studio</b>'+sub+'</div></a>'+
        '<div class="actions sh-act">'+
        (variant==="checkout"?'<span class="sh-secure"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span data-i18n="co.secure">Secure checkout</span></span>':'<div class="sh-slot"></div>')+
        marketSelect()+'<div class="lang-switch" data-lang-switch></div>'+back+shopifyBtn+
        (variant==="checkout"?'<div class="sh-slot"></div>':'')+cartBtn+'</div>';
    }
    host.parentNode.replaceChild(h,host);
    var slot=h.querySelector(".sh-slot");
    slots.forEach(function(s){slot.appendChild(s)});
    extras.forEach(function(e){e.classList.remove("sh-mi");slot.appendChild(e)});
    h.querySelectorAll("select.sh-market").forEach(function(s){s.addEventListener("change",function(){Market.set(s.value)})});
    var shBtn=h.querySelector("#shopifyConnectBtn");
    function setShopifyConnected(shop){
      if(!shBtn||!shop)return;
      shBtn.removeAttribute("data-i18n");
      shBtn.classList.add("connected");
      shBtn.textContent="🟢 Shopify: "+String(shop).replace(/\.myshopify\.com$/,"");
      shBtn.title=shop;
    }
    if(shBtn){
      shBtn.addEventListener("click",function(){
        var saved="";
        try{saved=localStorage.getItem("pod-shopify-shop")||""}catch(e){}
        if(window.PODAuth&&window.PODAuth.openShopify)window.PODAuth.openShopify(saved||"dropkingdev.myshopify.com");
        else location.href="/api/shopify/app/login?shop="+encodeURIComponent(saved||"dropkingdev.myshopify.com")+"&return_to="+encodeURIComponent(location.pathname+location.search);
      });
      if(/^https?:$/.test(location.protocol)){
        fetch("/api/shopify/app/public-status").then(function(r){return r.ok?r.json():null}).then(function(d){
          var conn=d&&d.shops&&d.shops[0]&&d.shops[0].shop;
          if(conn){try{localStorage.setItem("pod-shopify-shop",conn)}catch(e){}setShopifyConnected(conn)}
        }).catch(function(){});
      }
      window.addEventListener("pod-shopify-connected",function(e){if(e&&e.detail&&e.detail.shop)setShopifyConnected(e.detail.shop)});
    }
    var relabel=function(){h.querySelectorAll("[data-i18n]").forEach(function(el){var k=el.getAttribute("data-i18n");if(k.indexOf("hdr.")===0||k==="co.secure"||k==="co.title"||k==="cart.button")el.textContent=K(k,el.textContent)})};
    window.addEventListener("wedding-language-change",relabel);document.addEventListener("DOMContentLoaded",function(){relabel();if(window.WeddingI18n&&WeddingI18n.mountSwitches)WeddingI18n.mountSwitches()});
  }
  var host=document.getElementById("site-header");
  if(host)mount(host);else document.addEventListener("DOMContentLoaded",function(){mount(document.getElementById("site-header"))});
})();
