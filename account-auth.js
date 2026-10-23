/* Passwordless quick login (no registration form): "Continue with Google", "Continue with Shop", and Shopify store OAuth connect/login.
 * All are full-page OAuth redirects handled by the server (/api/auth/{google,shop}/start or /api/shopify/app/login -> callback),
 * which sets an HttpOnly session cookie. Providers that are not configured are hidden (no "not configured" badges for customers).
 * Mounts an account button next to the header cart (#cartBtn) or into [data-account-slot].
 * API (unchanged for existing callers): PODAuth.user, .me(), .require(), .open(), .openShopify(), .logout(), .providers(). */
(()=>{
const A={user:null,p:null,_prov:null};
const FALLBACK={"auth.signIn":"Sign in","auth.account":"Account","auth.title":"Sign in or create an account","auth.sub":"One tap, no password. Your first sign-in creates your account automatically.","auth.google":"Continue with Google","auth.shop":"Continue with Shop","auth.shopifyConnect":"Sign in / connect Shopify store","auth.shopifyDomainLabel":"Enter your Shopify store domain or handle","auth.shopifyGo":"Continue to Shopify \u2192","auth.unavailable":"Sign-in is not available right now. You can still order as a guest and check your order with \"Find my order\".","auth.terms":"By continuing you agree to our terms of sale and privacy policy.","auth.close":"Close","auth.myOrders":"My orders","auth.signOut":"Sign out","auth.signedInAs":"Signed in as {e}","auth.err.not_configured":"This sign-in option is not configured yet.","auth.err.invalid_shop_domain":"Please enter a valid Shopify store domain (e.g. your-store.myshopify.com).","auth.err.generic":"Sign-in did not complete. Please try again.","auth.err.access_denied":"Sign-in was cancelled.","auth.err.invalid_state":"Your sign-in session expired. Please try again.","auth.or":"or"};
const K=(k,v)=>{let s=window.WeddingI18n?.k?window.WeddingI18n.k(k,v):k;if(s===k){s=FALLBACK[k]||k;if(v)for(const[a,b]of Object.entries(v))s=s.split("{"+a+"}").join(String(b));}return s};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=`.pa-acct{position:relative;display:inline-flex}.pa-acct-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:44px;min-height:44px;padding:0 13px 0 11px;border:1px solid rgba(45,36,30,.18);background:#fff;color:#28231f;border-radius:999px;cursor:pointer;font:inherit;font-size:12px;white-space:nowrap}.pa-acct-btn svg{width:20px;height:20px;flex:none}.pa-acct-btn:focus-visible,.pa-opt:focus-visible{outline:2px solid #9a6d57;outline-offset:2px}.pa-av{width:24px;height:24px;border-radius:50%;background:#9a6d57;color:#fff;display:grid;place-items:center;font-weight:700;font-size:12px;overflow:hidden;flex:none}.pa-av img{width:100%;height:100%;object-fit:cover}.pa-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:230px;background:#fffdf9;border:1px solid rgba(45,36,30,.12);border-radius:16px;box-shadow:0 18px 50px rgba(30,20,15,.18);padding:8px;z-index:130;display:none}.pa-menu.open{display:block}.pa-menu .pa-who{padding:8px 10px 10px;border-bottom:1px solid rgba(45,36,30,.1);margin-bottom:6px;font-size:12px;color:#7c746c;overflow-wrap:anywhere}.pa-menu .pa-who b{display:block;color:#28231f;font-size:13.5px}.pa-menu a,.pa-menu button{display:flex;width:100%;min-height:42px;align-items:center;padding:0 10px;border:0;background:none;border-radius:10px;font:inherit;font-size:13px;color:#28231f;text-decoration:none;cursor:pointer;text-align:left}.pa-menu a:hover,.pa-menu button:hover{background:#f4eee8}
.pa-mask{position:fixed;inset:0;background:rgba(24,20,17,.42);backdrop-filter:blur(6px);z-index:9999;display:none;place-items:center;padding:16px}.pa-mask.open{display:grid}.pa-card{position:relative;width:min(420px,100%);background:#fffdf9;border:1px solid rgba(45,36,30,.12);border-radius:24px;padding:30px 26px 22px;box-shadow:0 30px 90px rgba(30,20,15,.28);color:#28231f;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}.pa-card h2{margin:0 0 8px;font:500 25px/1.2 Georgia,serif;padding-right:34px}.pa-card p{margin:0 0 20px;color:#7c746c;font-size:13px;line-height:1.55}.pa-close{position:absolute;top:14px;right:14px;width:40px;height:40px;border:1px solid rgba(45,36,30,.12);border-radius:50%;background:#fff;cursor:pointer;font-size:18px;color:#28231f}.pa-opts{display:grid;gap:10px}.pa-opt.guest{background:#fff;border:1px dashed #bdb6ad;cursor:pointer;font:inherit;width:100%;flex-direction:column;align-items:flex-start}.pa-opt{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:50px;border-radius:999px;border:1px solid rgba(45,36,30,.22);background:#fff;color:#28231f;font:inherit;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;position:relative}.pa-opt svg{width:20px;height:20px;flex:none}.pa-opt.shop{background:#5a31f4;border-color:#5a31f4;color:#fff}.pa-opt[aria-disabled=true]{opacity:.5;cursor:not-allowed;filter:grayscale(.6)}.pa-opt small{font-size:11px;font-weight:600;border-radius:999px;padding:2px 8px;background:#f1ece6;color:#7c746c}.pa-opt.shop small{background:rgba(255,255,255,.22);color:#fff}.pa-sh-box{display:none;gap:8px;padding:12px;border-radius:16px;background:#f6f2ec;border:1px solid rgba(45,36,30,.12)}.pa-sh-box.open{display:grid}.pa-sh-box label{font-size:12px;color:#5c534b;font-weight:600}.pa-sh-inp{width:100%;min-height:42px;padding:0 12px;border-radius:10px;border:1px solid rgba(45,36,30,.22);background:#fff;font:inherit;font-size:14px;color:#28231f;box-sizing:border-box}.pa-sh-go{min-height:42px;border-radius:999px;border:0;background:#28231f;color:#fff;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;padding:0 16px}.pa-fine{margin-top:16px;font-size:11.5px;color:#7c746c;text-align:center;line-height:1.5}.pa-msg{min-height:0;margin:0 0 12px;font-size:12.5px;color:#a8402f;background:#fbeeea;border-radius:10px;padding:9px 11px;display:none}.pa-msg.show{display:block}
@media(max-width:860px){.pa-acct-btn .pa-lbl{display:none}.pa-acct-btn{padding:0;width:44px}}`;
document.head.insertAdjacentHTML("beforeend",`<style id="paStyle">${css}</style>`);
const GOOGLE_SVG=`<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
const SHOP_SVG=`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>`;
const USER_SVG=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`;
document.body.insertAdjacentHTML("beforeend",`<div class="pa-mask" id="paMask" role="dialog" aria-modal="true" aria-labelledby="paTitle"><div class="pa-card"><button class="pa-close" id="paClose" type="button">×</button><h2 id="paTitle"></h2><p id="paSub"></p><div class="pa-msg" id="paMsg" role="alert"></div><div class="pa-opts" id="paOpts"></div><div class="pa-fine" id="paFine"></div></div></div>`);
const $=id=>document.getElementById(id),mask=$("paMask");
const here=()=>location.pathname+location.search.replace(/([?&])(signed_in|login_error|shop_connected)=[^&]*/g,"$1").replace(/[?&]$/,"");
const startUrl=p=>`/api/auth/${p}/start?return_to=${encodeURIComponent(here())}&locale=${encodeURIComponent(window.WeddingI18n?.lang?.()||"en")}`;
A.providers=async()=>{if(A._prov)return A._prov;if(location.protocol==="file:")return A._prov={google:{configured:false},shop:{configured:false}};try{A._prov=await (await fetch("/api/auth/providers")).json()}catch{A._prov={google:{configured:false},shop:{configured:false}}}return A._prov};
/** Buttons markup, reused by the modal and the checkout "Sign in for faster checkout" box. */
A.buttonsHtml=prov=>[["google",GOOGLE_SVG],["shop",SHOP_SVG]].filter(([p])=>!!prov?.[p]?.configured).map(([p,svg])=>`<a class="pa-opt ${p}" data-provider="${p}" href="${esc(startUrl(p))}">${svg}<span>${esc(K("auth."+p))}</span></a>`).join("");
/** True when at least one sign-in provider is configured (customers never see unconfigured providers). */
A.anyProvider=prov=>["google","shop"].some(p=>!!prov?.[p]?.configured);
function renderModal(){
  $("paTitle").textContent=K("auth.title");$("paSub").textContent=K("auth.sub");$("paFine").textContent=K("auth.terms");$("paClose").setAttribute("aria-label",K("auth.close"));
  const savedShop=(()=>{try{return localStorage.getItem("pod-shopify-shop")||"dropkingdev.myshopify.com"}catch{return "dropkingdev.myshopify.com"}})();
  const shopifyHtml=`<button type="button" class="pa-opt shop" id="paShopifyToggle">${SHOP_SVG}<span>${esc(K("auth.shopifyConnect"))}</span></button><form class="pa-sh-box" id="paShopifyBox"><label for="paShopifyInput">${esc(K("auth.shopifyDomainLabel"))}</label><input class="pa-sh-inp" id="paShopifyInput" type="text" placeholder="your-store.myshopify.com" value="${esc(savedShop)}" autocomplete="off" spellcheck="false"><button type="submit" class="pa-sh-go" id="paShopifyGo">${esc(K("auth.shopifyGo"))}</button></form>`;
  $("paOpts").innerHTML=A.buttonsHtml(A._prov)+shopifyHtml+(A._guest?`<button type="button" class="pa-opt guest" id="paGuest"><span>${esc(K("auth.guest"))}</span><small>${esc(K("auth.guestSub"))}</small></button>`:"");
  const g=$("paGuest");if(g)g.onclick=A.continueAsGuest;
  const stog=$("paShopifyToggle"),sbox=$("paShopifyBox"),sinp=$("paShopifyInput");
  if(stog&&sbox)stog.onclick=()=>{const open=!sbox.classList.contains("open");sbox.classList.toggle("open",open);sbox.style.display=open?"grid":"none";if(open&&sinp){sinp.focus();sinp.select?.()}};
  if(sbox&&sinp)sbox.onsubmit=e=>{
    e.preventDefault();
    let s=sinp.value.trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/.*$/,"");
    if(!s)return showMsg("invalid_shop_domain");
    if(!s.includes("."))s+=".myshopify.com";
    if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s))return showMsg("invalid_shop_domain");
    try{localStorage.setItem("pod-shopify-shop",s)}catch{}
    location.href=`/api/shopify/app/login?shop=${encodeURIComponent(s)}&return_to=${encodeURIComponent(here())}`;
  };
}
function showMsg(code){const m=$("paMsg");if(!code){m.className="pa-msg";m.textContent="";return}const k="auth.err."+code,t=K(k);m.textContent=t===k?K("auth.err.generic"):t;m.className="pa-msg show"}
let lastFocus=null;
A.open=async(err)=>{lastFocus=document.activeElement;await A.providers();renderModal();showMsg(err);mask.classList.add("open");setTimeout(()=>($("paOpts").querySelector("a.pa-opt,button.pa-opt")||$("paClose")).focus(),30)};
A.openShopify=async(prefill)=>{await A.open();const box=$("paShopifyBox"),inp=$("paShopifyInput");if(box){box.classList.add("open");box.style.display="grid"}if(inp){if(prefill)inp.value=prefill;inp.focus();inp.select?.()}};
A.close=()=>{mask.classList.remove("open");if(A.p){A.p.reject?.(new Error("auth_cancelled"));A.p=null}lastFocus?.focus?.()};
$("paClose").onclick=A.close;mask.addEventListener("click",e=>{if(e.target===mask)A.close()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&mask.classList.contains("open"))A.close()});
A.me=async()=>{if(location.protocol==="file:")return null;try{const d=await (await fetch("/api/auth/me",{credentials:"same-origin"})).json();A.user=d.user||null}catch{A.user=null}return A.user};
// require({guest:true}) also offers "Continue as guest" (Studio): the server then keys the work to an HttpOnly guest cookie,
// and attaches it to the account on a later sign-in. Resolves with the user, or {guest:true}.
const GUEST_OK="pod-guest-ok";
A.isGuest=()=>{try{return sessionStorage.getItem(GUEST_OK)==="1"}catch{return false}};
A.continueAsGuest=()=>{try{sessionStorage.setItem(GUEST_OK,"1")}catch{}const p=A.p;A.p=null;mask.classList.remove("open");p?.resolve?.({guest:true})};
A.require=async(opt={})=>{if(location.protocol==="file:"){alert("Sign-in needs the server: npm start");throw new Error("server_required")}const u=await A.me();if(u)return u;if(opt.guest&&A.isGuest())return {guest:true};A._guest=!!opt.guest;A.open();return new Promise((resolve,reject)=>A.p={resolve,reject})};
A.logout=async()=>{try{await fetch("/api/auth/logout",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin"})}catch{}A.user=null;location.reload()};
// ---- header account button + signed-in menu ----
function initial(u){return esc((u.name||u.email||"?").trim().charAt(0).toUpperCase())}
function renderHeader(){
  let slot=document.querySelector("[data-account-slot]");
  if(!slot){const cart=$("cartBtn");if(!cart)return;slot=document.createElement("div");slot.dataset.accountSlot="";cart.parentNode.insertBefore(slot,cart)}
  slot.className="pa-acct";const u=A.user;
  slot.hidden=false;
  slot.innerHTML=u?`<button class="pa-acct-btn" id="paAcctBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(K("auth.account"))}: ${esc(u.email)}"><span class="pa-av">${u.avatar_url?`<img src="${esc(u.avatar_url)}" alt="" referrerpolicy="no-referrer">`:initial(u)}</span><span class="pa-lbl">${esc((u.name||u.email).split(" ")[0])}</span></button><div class="pa-menu" id="paMenu" role="menu"><div class="pa-who"><b>${esc(u.name||u.email)}</b>${esc(K("auth.signedInAs",{e:u.email}))}</div><a role="menuitem" href="account.html">${esc(K("auth.myOrders"))}</a><button role="menuitem" type="button" id="paMenuShopify">${esc(K("auth.shopifyConnect"))}</button><button role="menuitem" type="button" id="paSignOut">${esc(K("auth.signOut"))}</button></div>`
    :`<button class="pa-acct-btn" id="paAcctBtn" type="button" aria-haspopup="dialog">${USER_SVG}<span class="pa-lbl">${esc(K("auth.signIn"))}</span></button>`;
  const b=$("paAcctBtn");
  if(!u){b.setAttribute("aria-label",K("auth.signIn"));b.onclick=()=>A.open();return}
  const menu=$("paMenu");b.onclick=e=>{e.stopPropagation();const o=!menu.classList.contains("open");menu.classList.toggle("open",o);b.setAttribute("aria-expanded",String(o))};
  $("paSignOut").onclick=A.logout;
  const ms=$("paMenuShopify");if(ms)ms.onclick=()=>{menu.classList.remove("open");A.openShopify()};
}
document.addEventListener("click",e=>{const m=$("paMenu");if(m&&!e.target.closest(".pa-acct")){m.classList.remove("open");$("paAcctBtn")?.setAttribute("aria-expanded","false")}});
window.addEventListener("wedding-language-change",()=>{renderHeader();if(mask.classList.contains("open"))renderModal()});
window.PODAuth=A;
A.ready=(async()=>{
  const qs=new URLSearchParams(location.search),err=qs.get("login_error"),ok=qs.get("signed_in"),shopConn=qs.get("shop_connected");
  if(shopConn){
    try{
      localStorage.setItem("pod-shopify-shop",shopConn);
      const entry={id:"sc_shopify_"+shopConn,platform:"shopify",store:shopConn,status:"connected"};
      const stList=JSON.parse(localStorage.getItem("pod-studio-stores")||"[]");
      localStorage.setItem("pod-studio-stores",JSON.stringify([...stList.filter(x=>x.store!==shopConn),entry]));
      const draft=JSON.parse(localStorage.getItem("pod-studio-draft-v2")||"null");
      if(draft&&Array.isArray(draft.stores)){
        draft.stores=[...draft.stores.filter(x=>x.store!==shopConn),entry];
        localStorage.setItem("pod-studio-draft-v2",JSON.stringify(draft));
      }
    }catch{}
  }
  if(err||ok||shopConn)history.replaceState(null,"",here()+location.hash);
  await Promise.all([A.me(),A.providers()]);renderHeader();
  if(shopConn)window.dispatchEvent(new CustomEvent("pod-shopify-connected",{detail:{shop:shopConn}}));
  if(A.user)window.dispatchEvent(new CustomEvent("pod-auth-changed",{detail:A.user}));
  if(err)A.open(/^[a-z_]+$/.test(err)?err:"generic");
  return A.user;
})();
// Translations may load after this script (studio.html): re-render once the DOM is complete.
if(document.readyState!=="complete")window.addEventListener("load",()=>A.ready.then(renderHeader));
})();
