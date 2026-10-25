/* Shared site footer (Printful-style layout: link columns, contact block, bottom legal bar, payment badges).
   Usage: <div id="site-footer"></div><script src="/footer.js" defer></script>  — only links to pages that exist. */
(function(){
  var css='.sf{background:#292622;color:#e9e2d9;font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;margin-top:48px}'+
  '.sf a{color:#e9e2d9;text-decoration:none}.sf a:hover{color:#fff;text-decoration:underline}'+
  '.sf-in{max-width:1200px;margin:0 auto;padding:56px 28px 28px}'+
  '.sf-top{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr 1fr 1.4fr;gap:28px}'+
  '.sf-brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:#fff}'+
  '.sf-logo{width:38px;height:38px;border-radius:13px;background:#f8f4ef;color:#292622;display:grid;place-items:center;font-weight:800}'+
  '.sf p{margin:12px 0 0;color:#b9afa4;font-size:13px}'+
  '.sf h4{margin:0 0 14px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#fff}'+
  '.sf ul{list-style:none;margin:0;padding:0}.sf li{margin:0 0 10px}'+
  '.sf-contact{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:20px}'+
  '.sf-mail{display:inline-block;margin-top:12px;background:#f8f4ef;color:#292622!important;border-radius:999px;padding:10px 16px;font-weight:700;font-size:13px}'+
  '.sf-bottom{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;border-top:1px solid rgba(255,255,255,.12);margin-top:40px;padding-top:22px;font-size:12px;color:#b9afa4}'+
  '.sf-legal{display:flex;flex-wrap:wrap;gap:18px}.sf-pay{display:flex;gap:8px;align-items:center}'+
  '.sf-badge{height:26px;padding:0 10px;border-radius:6px;background:#fff;display:inline-flex;align-items:center;font-weight:800;font-size:12px;letter-spacing:.02em}'+
  '.sf-twint{background:#000;color:#fff;border:1px solid #444}.sf-pp{color:#003087}.sf-pp i{color:#009cde;font-style:normal}'+
  '.sf-loc{display:inline-flex;gap:6px;align-items:center;border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:5px 12px}'+
  '.sf-addr{margin-top:10px!important;color:#e9e2d9!important;font-weight:600;overflow-wrap:anywhere}'+'@media(max-width:1100px){.sf-top{grid-template-columns:repeat(3,1fr)}.sf-col-brand,.sf-contact{grid-column:span 3}}'+
  '@media(max-width:900px){.sf-top{grid-template-columns:1fr 1fr}.sf-col-brand,.sf-contact{grid-column:1/-1}}'+
  '@media(max-width:520px){.sf-in{padding:40px 20px 24px}.sf-bottom{flex-direction:column;align-items:flex-start}}';
  var y=new Date().getFullYear(),MAIL=''; /* contact e-mail shown in the footer (single place to change) */
  var html='<footer class="sf" role="contentinfo"><div class="sf-in"><div class="sf-top">'+
   '<div class="sf-col-brand"><div class="sf-brand"><span class="sf-logo">P</span>Wed.AI</div><p>Matching wedding invitations, welcome signs, favours and gifts — designed in one studio, printed on demand and shipped from Switzerland across Europe.</p></div>'+
   '<nav aria-label="Shop"><h4>Shop</h4><ul><li><a href="/">Home</a></li><li><a href="/checkout">Cart &amp; checkout</a></li></ul></nav>'+
   '<nav aria-label="Create"><h4>Create</h4><ul><li><a href="/studio.html">Design studio</a></li><li><a href="/account">My designs &amp; orders</a></li><li><a href="/agent.html">POD Agent</a></li></ul></nav>'+
   '<nav aria-label="Help"><h4>Help</h4><ul><li><a href="/shipping">Shipping &amp; production times</a></li><li><a href="/returns">Returns &amp; defects</a></li><li><a href="/account#find-order">Find my order</a></li></ul></nav>'+
   '<nav aria-label="Legal"><h4>Legal</h4><ul><li><a href="/privacy">Privacy policy</a></li><li><a href="/terms">Terms of sale</a></li><li><a href="/returns">Returns policy</a></li><li><a href="/imprint">Imprint / Impressum</a></li></ul></nav>'+
   '<div class="sf-contact"><h4>Questions about your order?</h4><p style="margin-top:0">We answer personally, usually within one business day.</p></div>'+
  '</div><div class="sf-bottom"><div class="sf-legal"><span>&copy; '+y+' Chenxue Branny, Basel</span><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/imprint">Imprint</a></div>'+
   '<span class="sf-loc" title="Market and currency (change it in the header)">'+(window.PODMarket?(PODMarket.get()+' · '+PODMarket.currency()):'CHF / EUR')+'</span>'+
   '<div class="sf-pay" aria-label="Payment methods"><span class="sf-badge sf-twint">TWINT</span><span class="sf-badge sf-pp">Pay<i>Pal</i></span></div>'+
  '</div></div></footer>';
  function mount(){if(document.querySelector('.sf'))return;var s=document.createElement('style');s.textContent=css;document.head.appendChild(s);var host=document.getElementById('site-footer');if(host)host.outerHTML=html;else document.body.insertAdjacentHTML('beforeend',html);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
