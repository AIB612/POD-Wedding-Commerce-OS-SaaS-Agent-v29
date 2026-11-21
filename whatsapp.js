/* WhatsApp Business button + links. Number comes from PUBLIC_WHATSAPP_NUMBER when the file is served.
   When the number is empty, this script renders nothing. */
(function(){
  var WA='__PUBLIC_WHATSAPP_NUMBER__';
  if(!WA) return;
  var podai=/(?:^|\.)podai\.swisspro\.site$/i.test(location.hostname);
  var text=podai
    ? "Hi, I'd like to know more about POD.AI Agent for my shop"
    : "Hi SwissPro POD, I have a question about a custom order";
  var href="https://wa.me/"+WA+"?text="+encodeURIComponent(text);
  var svg='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.5 14.4c-.2-.1-1.2-.6-1.4-.7-.2-.1-.4-.1-.5.1-.2.2-.6.7-.7.8-.1.1-.3.2-.5.1-.2-.1-.9-.3-1.7-1.1-.6-.6-1.1-1.3-1.2-1.5-.1-.2 0-.4.1-.5l.4-.5c.1-.1.2-.3.2-.4 0-.1 0-.3-.1-.4-.1-.1-.5-1.3-.7-1.7-.2-.5-.4-.4-.5-.4h-.4c-.1 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.4.5.2 1 .4 1.3.5.6.2 1.1.1 1.5.1.5-.1 1.2-.5 1.4-1 .2-.5.2-.9.1-1 0-.1-.2-.1-.4-.2zM12.04 20.8h-.01c-1.7 0-3.3-.5-4.7-1.3L3 20.8l1.3-4.2c-1-1.5-1.5-3.2-1.5-5 0-5.1 4.2-9.3 9.3-9.3 2.5 0 4.8 1 6.6 2.7 1.8 1.8 2.7 4.1 2.7 6.6-.1 5.1-4.2 9.2-9.35 9.2zm0-18.9C6.8 1.9 2.6 6.1 2.6 11.3c0 1.7.4 3.3 1.3 4.7L2 22l6.1-1.6c1.4.8 2.9 1.2 4.5 1.2h.01c5.2 0 9.4-4.2 9.4-9.4 0-2.5-1-4.9-2.8-6.6-1.8-1.8-4.2-2.7-6.17-2.7z"/></svg>';
  var css='.sf-wa{width:26px;height:26px;padding:0;border-radius:6px;background:#fff;color:#25D366!important;display:inline-flex;align-items:center;justify-content:center}.sf-wa:hover{background:#f3ece4;text-decoration:none!important}.sf-wa svg{width:15px;height:15px;display:block}'+
    '.sf-wa-fab{position:fixed;right:20px;bottom:20px;z-index:45;width:48px;height:48px;border-radius:50%;background:#25D366;color:#fff;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(18,140,70,.35);text-decoration:none!important}'+
    '.sf-wa-fab:hover{background:#1ebe5d}.sf-wa-fab svg{width:26px;height:26px;display:block}'+
    '@media(max-width:1000px){.sf-wa-fab{right:16px;bottom:88px}}';
  function ensureCss(){
    if(document.getElementById('sf-wa-css'))return;
    var s=document.createElement('style');s.id='sf-wa-css';s.textContent=css;document.head.appendChild(s);
  }
  function icon(cls,label){
    return '<a class="'+cls+'" href="'+href+'" target="_blank" rel="noopener noreferrer" aria-label="'+label+'">'+svg+'</a>';
  }
  function mount(){
    ensureCss();
    var social=document.querySelector('.sf-social');
    if(social && !social.querySelector('.sf-wa')) social.insertAdjacentHTML('beforeend', icon('sf-wa','WhatsApp'));
    var plain=document.querySelector('footer:not(.sf)');
    if(plain && !document.querySelector('.sf') && !plain.querySelector('.wa-footer,.sf-wa')){
      plain.insertAdjacentHTML('beforeend',' · <a class="wa-footer" href="'+href+'" target="_blank" rel="noopener noreferrer">WhatsApp</a>');
    }
    if(!document.querySelector('.wa-contact')){
      var slot=document.getElementById('wa-slot');
      if(slot) slot.outerHTML='<p class="wa-contact"><a href="'+href+'" target="_blank" rel="noopener noreferrer">WhatsApp</a></p>';
    }
    if(!document.querySelector('.sf-wa-fab')){
      document.body.insertAdjacentHTML('beforeend', icon('sf-wa-fab','WhatsApp'));
    }
  }
  function boot(){ try{ mount(); }catch(e){} }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 0);
})();
