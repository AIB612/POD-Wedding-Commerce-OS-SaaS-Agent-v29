/* Homepage inline chat (POD.AI Agent). Opened from the "Ask POD.AI" entry next to the brand in the header
   (header.js #shAiBtn): the hero image area (#stage) swaps to this panel; "Back to the scene" / Esc restores the image.
   No floating bubble. Talks to POST /api/pod-agent/chat (server/pod-agent/customer). All text is rendered with
   textContent; links are only same-site paths or https URLs. Transcript lives in localStorage for 7 days ("New chat" clears it).
   Answers appear with a short typing indicator and a progressive word reveal (instant with prefers-reduced-motion);
   **bold**, [label](/path) links and "- " lists are rendered as DOM nodes (never innerHTML). */
(function(){
  "use strict";
  var KEY="wedai-chat-v2",OLD="wedai-chat-v1",TTL=7*864e5,stage=document.getElementById("stage");
  if(!stage)return;
  function K(k,en){try{var w=window.WeddingI18n;if(w&&w.k){var v=w.k(k);if(v&&v!==k)return v}}catch(e){}return en}
  function lang(){try{return (window.WeddingI18n&&WeddingI18n.lang())||"en"}catch(e){return "en"}}
  function rd(){try{var v=JSON.parse(localStorage.getItem(KEY)||"null");if(v&&v.at&&Date.now()-v.at<TTL)return v;var o=JSON.parse(sessionStorage.getItem(OLD)||"null");if(o)return o}catch(e){}return {msgs:[]}}
  function wr(){try{localStorage.setItem(KEY,JSON.stringify({id:S.id,at:Date.now(),msgs:S.msgs.slice(-40)}));sessionStorage.removeItem(OLD)}catch(e){}}
  var RM=false;try{RM=window.matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){}
  var S=rd();S.msgs=S.msgs||[];
  var css=
  "#stage.hc-open>.scene,#stage.hc-open>.popover{visibility:hidden}"+
  ".hero-chat{position:absolute;inset:0;z-index:40;border-radius:28px;overflow:hidden;display:none;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto auto;background:linear-gradient(180deg,#fffdf9 0%,#f8f2ec 100%);color:#28231f;font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}"+
  "#stage.hc-open .hero-chat{display:grid;animation:hcIn .22s ease-out}@keyframes hcIn{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}"+
  ".hc-head{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(45,36,30,.1)}"+
  ".hc-back{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(45,36,30,.14);background:#fff;border-radius:999px;padding:8px 13px;font:600 12.5px/1 inherit;font-family:inherit;color:#28231f;cursor:pointer}.hc-back:hover{border-color:#b8865b}"+
  ".hc-id{min-width:0;flex:1;display:flex;align-items:center;gap:10px}.hc-av{width:32px;height:32px;border-radius:9px;flex:none;display:block;background:#faf8f5;border:1px solid rgba(45,36,30,.08)}.hc-id b{display:block;font:600 19px/1.2 Georgia,'Times New Roman',serif}.hc-id span{display:block;font-size:12px;color:#7c746c;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
  ".hc-new{border:0;background:none;color:#8a6a4f;font:600 12px/1 inherit;font-family:inherit;cursor:pointer;padding:8px;text-decoration:underline;text-underline-offset:3px}"+
  ".hc-msgs{overflow:auto;padding:18px 20px;display:flex;flex-direction:column;gap:10px;overscroll-behavior:contain}"+
  ".hc-m{max-width:min(78%,620px);padding:11px 14px;border-radius:18px;white-space:pre-wrap;word-wrap:break-word;font-size:14px;line-height:1.55}"+
  ".hc-m.u{align-self:flex-end;background:#292622;color:#fff;border-bottom-right-radius:6px}"+
  ".hc-m.a{align-self:flex-start;background:#f2ebe5;border:1px solid rgba(60,45,35,.08);border-bottom-left-radius:6px}"+
  ".hc-m a{color:#8a5a33;font-weight:600;text-underline-offset:2px}.hc-m strong{font-weight:650}.hc-m ul{margin:4px 0;padding-left:18px;white-space:normal}.hc-m li{margin:2px 0}"+
  ".hc-m.typing{display:inline-flex;gap:5px;align-items:center;padding:14px 16px}.hc-m.typing i{width:7px;height:7px;border-radius:50%;background:#a8998b;animation:hcDot 1.1s infinite ease-in-out}.hc-m.typing i:nth-child(2){animation-delay:.15s}.hc-m.typing i:nth-child(3){animation-delay:.3s}"+
  "@keyframes hcDot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}"+
  ".hc-m.err{background:#fff4f0;border-color:rgba(176,80,50,.25)}.hc-retry{display:inline-block;margin-top:8px;border:1px solid rgba(45,36,30,.18);background:#fff;border-radius:999px;padding:5px 12px;font:600 12px/1.2 inherit;font-family:inherit;color:#28231f;cursor:pointer}"+
  ".hc-in{animation:hcFade .18s ease-out}@keyframes hcFade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}"+
  ".hero-chat button:focus-visible,.hero-chat a:focus-visible,.hero-chat textarea:focus-visible{outline:2px solid #b8865b;outline-offset:2px}"+
  "@media(prefers-reduced-motion:reduce){.hc-in,.hc-m.typing i,#stage.hc-open .hero-chat{animation:none!important}.hc-card{transition:none}}"+
  ".hc-fb{display:flex;gap:4px;margin-top:6px}.hc-fb button{border:1px solid rgba(45,36,30,.12);background:#fffdf9;border-radius:999px;font-size:12px;padding:2px 8px;cursor:pointer;color:#6f655d}.hc-fb button[aria-pressed=true]{background:#292622;color:#fff}"+
  ".hc-cards{align-self:stretch;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;max-width:640px}"+
  ".hc-card{display:flex;flex-direction:column;background:#fff;border:1px solid rgba(45,36,30,.1);border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;transition:transform .15s,box-shadow .15s}.hc-card:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(41,38,34,.1)}"+
  ".hc-card img{width:100%;aspect-ratio:1/1;object-fit:cover;background:#f4ede5}.hc-card div{padding:9px 11px 11px}.hc-card b{display:block;font-size:13px;line-height:1.3}.hc-card span{display:block;font-size:12px;color:#7c746c;margin-top:3px}.hc-card em{display:inline-block;margin-top:6px;font-style:normal;font-size:12px;font-weight:600;color:#8a5a33}"+
  ".hc-box{align-self:flex-start;width:min(100%,460px);background:#fff;border:1px solid rgba(45,36,30,.1);border-radius:16px;padding:12px 14px;font-size:13px}"+
  ".hc-box h4{margin:0 0 8px;font:600 15px/1.3 Georgia,serif}.hc-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-top:1px solid rgba(45,36,30,.07)}.hc-row:first-of-type{border-top:0}.hc-row small{display:block;color:#7c746c;font-size:11.5px}.hc-row b{white-space:nowrap}"+
  ".hc-box .hc-note{color:#7c746c;font-size:11.5px;margin-top:6px}.hc-box a.hc-cta{display:inline-block;margin-top:9px;background:#292622;color:#fff;border-radius:999px;padding:8px 14px;text-decoration:none;font-weight:600;font-size:12.5px}"+
  ".hc-chips{display:flex;gap:7px;flex-wrap:wrap;padding:0 20px 10px}.hc-chips button{border:1px solid rgba(184,134,91,.4);background:#fbf6f0;color:#5b4433;border-radius:999px;padding:7px 12px;font:500 12.5px/1.2 inherit;font-family:inherit;cursor:pointer}.hc-chips button:hover{background:#f1e6da}"+
  ".hc-form{display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px 16px 8px;border-top:1px solid rgba(45,36,30,.1);background:#fffdf9}"+
  ".hc-form textarea{border:1px solid rgba(45,36,30,.16);border-radius:16px;padding:11px 13px;resize:none;outline:none;font:16px/1.4 inherit;font-family:inherit;min-height:46px;max-height:120px;background:#fff;color:#28231f}.hc-form textarea:focus{border-color:#b8865b}"+
  ".hc-send{border:0;border-radius:16px;background:#292622;color:#fff;padding:0 18px;font:600 13px/1 inherit;font-family:inherit;cursor:pointer}.hc-send:disabled{opacity:.5;cursor:default}"+
  ".hc-priv{grid-column:1/-1;font-size:11px;color:#9a9087;padding:0 4px 2px}"+
  "@media(max-width:720px){.hero-chat{border-radius:22px}.hc-cards{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}.hc-form textarea{min-height:64px}.hc-head{padding:12px 12px;gap:8px}.hc-id b{font-size:16px}.hc-id span{font-size:11px}.hc-back{padding:7px 10px}.hc-back span{display:none}.hc-msgs{padding:12px}.hc-m{max-width:88%;font-size:13.5px}.hc-chips{padding:0 12px 8px;flex-wrap:nowrap;overflow-x:auto}.hc-chips button{white-space:nowrap}.hc-form{padding:10px 10px 6px}.hc-cards{grid-template-columns:repeat(2,1fr)}"+
  "}"+
  /* Fit the open panel into the visible viewport below the sticky header (--hc-hdr is measured in JS): input always visible, messages scroll inside. */
  "body.hc-open .layout{min-height:0!important;height:calc(100vh - var(--hc-hdr,68px))!important;height:calc(100dvh - var(--hc-hdr,68px))!important}"+
  "body.hc-open .stage{min-height:0!important}"+
  "@media(max-width:1000px){body.hc-open .layout{height:auto!important;grid-template-rows:max(360px,calc(100vh - var(--hc-hdr,68px) - 20px)) auto!important;grid-template-rows:max(360px,calc(100dvh - var(--hc-hdr,68px) - 20px)) auto!important}body.hc-open .stage{max-height:none!important;height:100%!important}}"+
  "@media(max-height:760px){.hc-head{padding:10px 16px}.hc-id b{font-size:17px}.hc-msgs{padding:12px 16px}.hc-chips{flex-wrap:nowrap;overflow-x:auto;padding-bottom:8px}.hc-chips button{white-space:nowrap}.hc-form{padding:8px 12px 6px}.hc-form textarea{min-height:42px}}"+
  "@media(max-height:620px){.hc-id span,.hc-priv{display:none}.hc-form textarea{min-height:40px}}";
  var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);

  var el=document.createElement("section");el.className="hero-chat";el.id="heroChat";el.setAttribute("role","region");el.setAttribute("aria-label","POD.AI assistant");el.setAttribute("data-no-translate","");
  el.innerHTML='<div class="hc-head"><button class="hc-back" type="button" data-hc="back" aria-label="Back to the scene"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span data-hck="hc.back">Back to the scene</span></button>'+
    '<div class="hc-id"><img class="hc-av" src="/assets/brand/mark-160.png?v=20261109e" width="32" height="32" alt=""><div><b data-hck="hc.title">POD.AI assistant</b><span data-hck="hc.sub">Product ideas · prices &amp; shipping · order status</span></div></div><button class="hc-new" type="button" data-hc="new" data-hck="hc.new">New chat</button></div>'+
    '<div class="hc-msgs" data-hc="msgs" role="log" aria-live="polite" aria-relevant="additions" tabindex="0"></div><div class="hc-chips" data-hc="chips" role="group" aria-label="Suggestions"></div>'+
    '<form class="hc-form" data-hc="form"><textarea rows="1" data-hc="input" maxlength="1000" aria-label="Message" enterkeyhint="send" autocomplete="off" autocapitalize="sentences"></textarea><button class="hc-send" data-hc="send" type="submit" data-hck="hc.send">Send</button><div class="hc-priv" data-hck="hc.privacy">Never share card details or passwords in the chat.</div></form>';
  stage.appendChild(el);
  var $=function(n){return el.querySelector('[data-hc="'+n+'"]')},msgs=$("msgs"),input=$("input"),busy=false;
  function relabel(){el.querySelectorAll("[data-hck]").forEach(function(x){x.textContent=K(x.getAttribute("data-hck"),x.textContent)});input.placeholder=K("hc.placeholder","e.g. Shipping to Switzerland for 10 invitations?");var b=$("back");b.setAttribute("aria-label",K("hc.back","Back to the scene"))}

  function safeHref(u){u=String(u||"");if(/^\/(?!\/)/.test(u))return u;if(/^https:\/\//i.test(u))return u;return null}
  // Text with clickable same-site paths and https links (built as nodes, never innerHTML).
  function linkify(node,text){
    var re=/(https:\/\/[^\s)]+|\/(?:studio\.html|account|shipping|returns|terms|privacy|imprint|checkout)[^\s),;。，]*)/g,last=0,m;text=String(text||"");
    while((m=re.exec(text))){if(m.index>last)node.appendChild(document.createTextNode(text.slice(last,m.index)));var a=document.createElement("a"),h=safeHref(m[0].replace(/[.。]$/,""));if(h){a.href=h;a.textContent=m[0].replace(/[.。]$/,"");if(/^https/.test(h)){a.target="_blank";a.rel="noopener"}node.appendChild(a);if(/[.。]$/.test(m[0]))node.appendChild(document.createTextNode(m[0].slice(-1)))}else node.appendChild(document.createTextNode(m[0]));last=m.index+m[0].length}
    if(last<text.length)node.appendChild(document.createTextNode(text.slice(last)));
  }
  // Inline markdown: **bold** and [label](/path or https://…); everything else via linkify.
  function inline(node,text){
    var re=/\*\*([^*]+)\*\*|\[([^\]]{1,80})\]\(([^)\s]+)\)/g,last=0,m;text=String(text||"");
    while((m=re.exec(text))){if(m.index>last)linkify(node,text.slice(last,m.index));
      if(m[1]!=null){var b=document.createElement("strong");b.textContent=m[1];node.appendChild(b)}
      else{var h=safeHref(m[3]);if(h){var a=document.createElement("a");a.href=h;a.textContent=m[2];if(/^https/.test(h)){a.target="_blank";a.rel="noopener"}node.appendChild(a)}else node.appendChild(document.createTextNode(m[2]))}
      last=m.index+m[0].length}
    if(last<text.length)linkify(node,text.slice(last));
  }
  function richText(node,text){
    var lines=String(text||"").split("\n"),ul=null;
    lines.forEach(function(ln,i){var li=/^\s*[-•*]\s+(.*)$/.exec(ln);
      if(li){if(!ul){ul=document.createElement("ul");node.appendChild(ul)}var x=document.createElement("li");inline(x,li[1]);ul.appendChild(x);return}
      ul=null;inline(node,ln);if(i<lines.length-1&&!/^\s*[-•*]\s+/.test(lines[i+1]||""))node.appendChild(document.createTextNode("\n"))});
  }
  function money(cur,n){return cur+" "+Number(n||0).toFixed(2)}
  function fmtD(iso){if(!iso)return "";try{return new Date(iso+"T12:00:00Z").toLocaleDateString(lang()==="zh"?"zh-CN":lang()==="de"?"de-CH":"en-GB",{day:"numeric",month:"short",timeZone:"UTC"})}catch(e){return iso}}
  function h(tag,cls,text){var x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=text;return x}
  function renderUi(list){
    (list||[]).forEach(function(u){
      if(u.type==="products"&&u.items&&u.items.length){var g=h("div","hc-cards");u.items.forEach(function(p){var a=h("a","hc-card"),href=safeHref(p.link);if(href)a.href=href;if(p.image&&safeHref(p.image)){var im=document.createElement("img");im.src=safeHref(p.image);im.alt=p.name||"";im.loading="lazy";im.decoding="async";a.appendChild(im)}var d=h("div");d.appendChild(h("b",null,p.name));if(p.unit_price!=null)d.appendChild(h("span",null,K("hc.from","from")+" "+money(p.currency,p.unit_price)+" "+K("hc.each","each")));d.appendChild(h("em",null,K("hc.design","Personalise")+" →"));a.appendChild(d);g.appendChild(a)});msgs.appendChild(g)}
      else if(u.type==="quote"){var b=h("div","hc-box");b.appendChild(h("h4",null,u.quantity+" × "+u.product+" → "+u.country));var r0=h("div","hc-row");r0.appendChild(h("span",null,K("hc.subtotal","Items")));r0.appendChild(h("b",null,money(u.currency,u.subtotal)));b.appendChild(r0);
        (u.options||[]).forEach(function(o){var r=h("div","hc-row"),l=h("span",null,K(o.id==="express"?"hc.express":"hc.standard",o.label));if(o.arrives_from)l.appendChild(h("small",null,K("hc.arrives","Arrives")+" "+fmtD(o.arrives_from)+"–"+fmtD(o.arrives_to)));r.appendChild(l);r.appendChild(h("b",null,o.free?K("hc.free","Free"):money(u.currency,o.price)));b.appendChild(r)});
        b.appendChild(h("div","hc-note",u.prices_include_vat?K("hc.vatIn","incl. VAT"):K("hc.vatEx","excl. VAT, added at checkout")+(u.vat_rate?" ("+(u.vat_rate*100).toFixed(1)+"%)":"")));var hr=safeHref(u.link);if(hr){var c=h("a","hc-cta",K("hc.design","Personalise")+" →");c.href=hr;b.appendChild(c)}msgs.appendChild(b)}
      else if(u.type==="order"||u.type==="tracking"){var bx=h("div","hc-box");bx.appendChild(h("h4",null,u.type==="order"?K("hc.order","Order")+" "+u.id:(u.carrier||"")+" "+(u.tracking_number||"")));var t=u.type==="order"?u.tracking:u;if(t&&t.status){var rr=h("div","hc-row");rr.appendChild(h("span",null,t.carrier||""));rr.appendChild(h("b",null,t.status));bx.appendChild(rr)}var url=t&&safeHref(t.url);if(url&&/^https/.test(url)){var ta=h("a","hc-cta",K("hc.track","Track parcel")+" →");ta.href=url;ta.target="_blank";ta.rel="noopener";bx.appendChild(ta)}msgs.appendChild(bx)}
    });
  }
  function setChips(items){var c=$("chips");c.textContent="";(items||[]).forEach(function(t){var b=h("button",null,t);b.type="button";b.onclick=function(){send(t)};c.appendChild(b)})}
  function nearBottom(){return msgs.scrollHeight-msgs.scrollTop-msgs.clientHeight<120}
  function toBottom(force){if(force||nearBottom())msgs.scrollTop=msgs.scrollHeight}
  function feedback(d,m){var fb=h("div","hc-fb");[[1,"👍","hc.helpful"],[-1,"👎","hc.unhelpful"]].forEach(function(x){var b=h("button",null,x[1]);b.type="button";b.setAttribute("aria-label",K(x[2],x[2]));b.setAttribute("aria-pressed",m.fb===x[0]?"true":"false");b.onclick=function(){m.fb=x[0];wr();fb.querySelectorAll("button").forEach(function(y){y.setAttribute("aria-pressed","false")});b.setAttribute("aria-pressed","true");fetch("/api/pod-agent/feedback",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversation_id:S.id,index:m.index,rating:x[0]})}).catch(function(){})};fb.appendChild(b)});d.appendChild(fb)}
  // animate: reveal the answer word by word (≈ 0.6–0.9 s in total), then show cards, feedback and chips.
  function addMsg(m,store,animate,done){
    var d=h("div","hc-m "+(m.role==="user"?"u":"a")+(m.err?" err":"")+(animate||m.role==="user"?" hc-in":""));
    var finish=function(){if(m.role==="assistant"&&m.index!=null&&S.id)feedback(d,m);if(m.ui)renderUi(m.ui);toBottom(true);if(done)done()};
    msgs.appendChild(d);if(store){S.msgs.push(m);wr()}
    var text=String(m.text||"");
    if(!animate||RM||m.role==="user"||text.length<24){richText(d,text);toBottom(true);finish();return d}
    var words=text.split(/(\s+)/),n=words.length,step=Math.max(1,Math.ceil(n/40)),i=0,cjk=/[\u3400-\u9fff]/.test(text);
    if(cjk){words=Array.from(text);n=words.length;step=Math.max(1,Math.ceil(n/40))}
    d.setAttribute("aria-busy","true");
    (function tick(){i=Math.min(n,i+step);d.textContent=words.slice(0,i).join("");toBottom();
      if(i<n)setTimeout(tick,18);else{d.textContent="";richText(d,text);d.removeAttribute("aria-busy");finish()}})();
    return d;
  }
  var CHIPS={fr:["Livraison en Suisse pour 10 faire-part","Idées de cadeaux pour les invités","Quel est le délai de livraison ?","Suivre ma commande"],it:["Spedizione in Svizzera per 10 inviti","Idee per bomboniere","Quanto ci vuole per la consegna?","Traccia il mio ordine"],en:["Shipping to Switzerland for 10 invitations","Recommend wedding favours","How long does delivery take?","Track my order"],zh:["10 份邀请卡寄到瑞士运费多少","推荐婚礼伴手礼","多久能送达？","查询我的订单"],de:["Versand in die Schweiz für 10 Einladungen","Gastgeschenke empfehlen","Wie lange dauert die Lieferung?","Meine Bestellung verfolgen"]};
  var HELLO={fr:"Bonjour ! Je suis l'assistant POD.AI. Je peux vous proposer des produits, calculer prix et livraison, et suivre votre commande.",it:"Ciao! Sono l'assistente POD.AI. Posso suggerirle prodotti, calcolare prezzi e spedizione e seguire il suo ordine."};
  // UI languages are zh/en/de; an English UI in a French / Italian browser greets in that language.
  function glang(){var l=lang();if(l==="en"){var n=String(navigator.language||"").slice(0,2).toLowerCase();if(HELLO[n])return n}return l}
  function greet(){msgs.textContent="";if(!S.msgs.length){var g=glang();addMsg({role:"assistant",text:HELLO[g]||K("hc.hello","Hi! I'm the POD.AI assistant.")},false);setChips(CHIPS[g]||CHIPS.en)}else{S.msgs.forEach(function(m){addMsg(m,false)});var last=S.msgs[S.msgs.length-1];setChips(last&&last.chips||[])}}
  function country(){try{return window.PODMarket&&PODMarket.country()||""}catch(e){return ""}}
  function typing(){var t=h("div","hc-m a typing hc-in");t.setAttribute("role","status");t.setAttribute("aria-label",K("hc.thinking","Checking…"));for(var i=0;i<3;i++)t.appendChild(document.createElement("i"));msgs.appendChild(t);toBottom(true);return t}
  function fail(text,t,busyErr){t.remove();var d=addMsg({role:"assistant",err:true,text:navigator.onLine===false?K("hc.offline","You seem to be offline — check your connection and try again."):busyErr?K("hc.slow","You're sending messages quickly — please wait a few seconds, then try again."):K("hc.error","Sorry, the assistant is unreachable right now. Please try again.")},false);
    var b=h("button","hc-retry",K("hc.retry","Try again"));b.type="button";b.onclick=function(){d.remove();var last=S.msgs[S.msgs.length-1];if(last&&last.role==="user"&&last.text===text){S.msgs.pop();wr();var u=msgs.querySelectorAll(".hc-m.u");if(u.length)u[u.length-1].remove()}send(text)};d.appendChild(b);b.focus({preventScroll:true})}
  function send(text){
    text=String(text||"").trim();if(!text||busy)return;busy=true;$("send").disabled=true;input.value="";input.style.height="";setChips([]);
    addMsg({role:"user",text:text},true);var t=typing(),ac=window.AbortController?new AbortController():null,tm=setTimeout(function(){if(ac)ac.abort()},25000),t0=Date.now();
    fetch("/api/pod-agent/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,conversation_id:S.id||undefined,lang:lang(),country:country(),page:location.pathname}),signal:ac?ac.signal:undefined})
      .then(function(r){return r.json().then(function(d){if(!r.ok&&!d.answer){var e=new Error(d.error||r.status);e.status=r.status;throw e}return d})})
      // keep the typing dots visible for at least ~350 ms so instant local answers still feel conversational
      .then(function(d){return new Promise(function(res){setTimeout(function(){res(d)},Math.max(0,350-(Date.now()-t0)))})})
      .then(function(d){t.remove();if(d.conversation_id)S.id=d.conversation_id;var ui=(d.ui||[]).filter(function(u){return u.type!=="chips"}),ch=(d.ui||[]).filter(function(u){return u.type==="chips"})[0];
        addMsg({role:"assistant",text:d.answer||K("hc.error","Sorry, please try again."),ui:ui,index:d.message_index,chips:ch?ch.items:[]},true,true,function(){setChips(ch?ch.items:[])})})
      .catch(function(e){fail(text,t,e&&e.status===429)})
      .then(function(){clearTimeout(tm);busy=false;$("send").disabled=false;if(window.innerWidth>720||document.activeElement===input)input.focus({preventScroll:true})});
  }
  $("form").onsubmit=function(e){e.preventDefault();send(input.value)};
  input.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();send(input.value)}});
  input.addEventListener("input",function(){input.style.height="auto";input.style.height=Math.min(120,input.scrollHeight)+"px"});
  input.addEventListener("focus",function(){setTimeout(function(){toBottom(true)},250)});
  if(window.visualViewport)visualViewport.addEventListener("resize",function(){if(document.activeElement===input)toBottom(true)});
  $("new").onclick=function(){S={msgs:[]};try{localStorage.removeItem(KEY)}catch(e){}greet();input.focus({preventScroll:true})};
  var btn=function(){return document.getElementById("shAiBtn")};
  function open(){if(stage.classList.contains("hc-open"))return;relabel();greet();stage.classList.add("hc-open");document.body.classList.add("hc-open");var b=btn();if(b)b.setAttribute("aria-expanded","true");
    var pop=document.getElementById("popover");if(pop)pop.classList.remove("open");fit(true);if(window.innerWidth>720)setTimeout(function(){input.focus({preventScroll:true})},60)}
  function hdrBottom(){var el=document.elementFromPoint(window.innerWidth/2,2);while(el&&el!==document.body&&el!==document.documentElement){var ps=getComputedStyle(el).position;if(ps==="sticky"||ps==="fixed")return Math.max(0,Math.round(el.getBoundingClientRect().bottom));el=el.parentElement}return 0}
  /* Measure the sticky header, size the hero to the remaining viewport and bring the panel fully into view. */
  function fit(scroll){if(!stage.classList.contains("hc-open"))return;var y=window.scrollY,hb=hdrBottom();document.documentElement.style.setProperty("--hc-hdr",(hb||0)+"px");if(!scroll)return;
    requestAnimationFrame(function(){var r=stage.getBoundingClientRect(),top=r.top+window.scrollY-hb-(window.innerWidth<=1000?8:14);if(Math.abs(window.scrollY-top)>2)window.scrollTo({top:Math.max(0,top),behavior:"auto"})})}
  var rz;window.addEventListener("resize",function(){clearTimeout(rz);rz=setTimeout(function(){fit(true)},120)});
  function close(){stage.classList.remove("hc-open");document.body.classList.remove("hc-open");var b=btn();if(b){b.setAttribute("aria-expanded","false");b.focus({preventScroll:true})}}
  $("back").onclick=close;
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&stage.classList.contains("hc-open"))close()});
  function bind(){var b=btn();if(b&&!b._hc){b._hc=1;b.addEventListener("click",function(){stage.classList.contains("hc-open")?close():open()})}}
  bind();document.addEventListener("DOMContentLoaded",bind);
  window.addEventListener("wedding-language-change",function(){relabel();if(stage.classList.contains("hc-open")&&!S.msgs.length)greet()});
  window.WedAIChat={open:open,close:close,send:send};
  // /?ask=1 (or #ask) opens the panel; &q=… pre-fills the input (never sent automatically), e.g. from /agent.html "Talk to our team".
  if(/[?&]ask=1\b/.test(location.search)||location.hash==="#ask")setTimeout(function(){open();try{var q=new URLSearchParams(location.search).get("q");if(q){input.value=String(q).slice(0,200);input.focus()}}catch(e){}},0);
})();
