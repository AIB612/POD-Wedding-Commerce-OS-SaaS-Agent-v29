/* Telegram contact button + links. URL comes from PUBLIC_TELEGRAM_URL when the file is served.
   When the URL is empty, this script renders nothing. */
(function(){
  var TG='__PUBLIC_TELEGRAM_URL__';
  if(!TG) return;
  var href=TG;
  var svg='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.5 3.2 2.6 10.5c-1.2.4-1.2 1.1-.2 1.4l4.7 1.5 1.8 5.6c.2.7.4.9 1 .9.3 0 .5-.1.7-.3l2.5-2.4 4.3 3.2c.8.4 1.3.2 1.5-.7l2.8-13.2c.3-1.1-.4-1.6-1.2-1.3zM8.8 13.4l8.9-5.5c.4-.3.8-.1.5.2l-7.2 6.5-.3 3.4z"/></svg>';
  var css='.sf-tg{width:26px;height:26px;padding:0;border-radius:6px;background:#fff;color:#229ED9!important;display:inline-flex;align-items:center;justify-content:center}.sf-tg:hover{background:#f3ece4;text-decoration:none!important}.sf-tg svg{width:15px;height:15px;display:block}'+
    '.sf-tg-fab{position:fixed;right:20px;bottom:20px;z-index:45;width:48px;height:48px;border-radius:50%;background:#229ED9;color:#fff;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(34,158,217,.35);text-decoration:none!important}'+
    '.sf-tg-fab:hover{background:#1b8dc4}.sf-tg-fab svg{width:26px;height:26px;display:block}'+
    '@media(max-width:1000px){.sf-tg-fab{right:16px;bottom:88px}}';
  function ensureCss(){
    if(document.getElementById('sf-tg-css'))return;
    var s=document.createElement('style');s.id='sf-tg-css';s.textContent=css;document.head.appendChild(s);
  }
  function icon(cls){
    return '<a class="'+cls+'" href="'+href+'" target="_blank" rel="noopener noreferrer" aria-label="Telegram SwissPro POD">'+svg+'</a>';
  }
  function mount(){
    ensureCss();
    var social=document.querySelector('.sf-social');
    if(social && !social.querySelector('.sf-tg')) social.insertAdjacentHTML('beforeend', icon('sf-tg'));
    var plain=document.querySelector('footer:not(.sf)');
    if(plain && !document.querySelector('.sf') && !plain.querySelector('.tg-footer,.sf-tg')){
      plain.insertAdjacentHTML('beforeend',' · <a class="tg-footer" href="'+href+'" target="_blank" rel="noopener noreferrer">Telegram</a>');
    }
    if(!document.querySelector('.tg-contact')){
      var slot=document.getElementById('tg-slot');
      if(slot) slot.outerHTML='<p class="tg-contact"><a href="'+href+'" target="_blank" rel="noopener noreferrer">Telegram</a></p>';
    }
    if(!document.querySelector('.sf-tg-fab')){
      document.body.insertAdjacentHTML('beforeend', icon('sf-tg-fab'));
    }
  }
  function boot(){ try{ mount(); }catch(e){} }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('DOMContentLoaded', boot);
  setTimeout(boot, 0);
})();
