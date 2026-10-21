/* Passwordless quick login (no registration form): "Continue with Google" and "Continue with Shop".
 * Both are full-page OAuth redirects handled by the server (/api/auth/{google,shop}/start → callback),
 * which sets an HttpOnly session cookie. Unconfigured providers render as disabled "not configured".
 * Mounts an account button next to the header cart (#cartBtn) or into [data-account-slot].
 * API (unchanged for existing callers): PODAuth.user, .me(), .require(), .open(), .logout(), .providers(). */
(()=>{
const A={user:null,p:null,_prov:null};
const FALLBACK={"auth.signIn":"Sign in","auth.account":"Account","auth.title":"Sign in or create an account","auth.sub":"One tap, no password. Your first sign-in creates your account automatically.","auth.google":"Continue with Google","auth.shop":"Continue with Shop","auth.notConfigured":"not configured","auth.terms":"By continuing you agree to our terms of sale and privacy policy.","auth.close":"Close","auth.myOrders":"My orders","auth.signOut":"Sign out","auth.signedInAs":"Signed in as {e}","auth.err.not_configured":"This sign-in option is not configured yet.","auth.err.generic":"Sign-in did not complete. Please try again.","auth.err.access_denied":"Sign-in was cancelled.","auth.err.invalid_state":"Your sign-in session expired. Please try again.","auth.or":"or"};
const K=(k,v)=>{let s=window.WeddingI18n?.k?window.WeddingI18n.k(k,v):k;if(s===k){s=FALLBACK[k]||k;if(v)for(const[a,b]of Object.entries(v))s=s.split("{"+a+"}").join(String(b));}return s};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=`.pa-acct{position:relative;display:inline-flex}.pa-acct-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:44px;min-height:44px;padding:0 13px 0 11px;border:1px solid rgba(45,36,30,.18);background:#fff;color:#28231f;border-radius:999px;cursor:pointer;font:inherit;font-size:12px;white-space:nowrap}.pa-acct-btn svg{width:20px;height:20px;flex:none}.pa-acct-btn:focus-visible,.pa-opt:focus-visible{outline:2px solid #9a6d57;outline-offset:2px}.pa-av{width:24px;height:24px;border-radius:50%;background:#9a6d57;color:#fff;display:grid;place-items:center;font-weight:700;font-size:12px;overflow:hidden;flex:none}.pa-av img{width:100%;height:100%;object-fit:cover}.pa-menu{position:absolute;right:0;top:calc(100% + 8px);min-width:230px;background:#fffdf9;border:1px solid rgba(45,36,30,.12);border-radius:16px;box-shadow:0 18px 50px rgba(30,20,15,.18);padding:8px;z-index:130;display:none}.pa-menu.open{display:block}.pa-menu .pa-who{padding:8px 10px 10px;border-bottom:1px solid rgba(45,36,30,.1);margin-bottom:6px;font-size:12px;color:#7c746c;overflow-wrap:anywhere}.pa-menu .pa-who b{display:block;color:#28231f;font-size:13.5px}.pa-menu a,.pa-menu button{display:flex;width:100%;min-height:42px;align-items:center;padding:0 10px;border:0;background:none;border-radius:10px;font:inherit;font-size:13px;color:#28231f;text-decoration:none;cursor:pointer;text-align:left}.pa-menu a:hover,.pa-menu button:hover{background:#f4eee8}
.pa-mask{position:fixed;inset:0;background:rgba(24,20,17,.42);backdrop-filter:blur(6px);z-index:9999;display:none;place-items:center;padding:16px}.pa-mask.open{display:grid}.pa-card{position:relative;width:min(420px,100%);background:#fffdf9;border:1px solid rgba(45,36,30,.12);border-radius:24px;padding:30px 26px 22px;box-shadow:0 30px 90px rgba(30,20,15,.28);color:#28231f;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}.pa-card h2{margin:0 0 8px;font:500 25px/1.2 Georgia,serif;padding-right:34px}.pa-card p{margin:0 0 20px;color:#7c746c;font-size:13px;line-height:1.55}.pa-close{position:absolute;top:14px;right:14px;width:40px;height:40px;border:1px solid rgba(45,36,30,.12);border-radius:50%;background:#fff;cursor:pointer;font-size:18px;color:#28231f}.pa-opts{display:grid;gap:10px}.pa-opt{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:50px;border-radius:999px;border:1px solid rgba(45,36,30,.22);background:#fff;color:#28231f;font:inherit;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;position:relative}.pa-opt svg{width:20px;height:20px;flex:none}.pa-opt.shop{background:#5a31f4;border-color:#5a31f4;color:#fff}.pa-opt[aria-disabled=true]{opacity:.5;cursor:not-allowed;filter:grayscale(.6)}.pa-opt small{font-size:11px;font-weight:600;border-radius:999px;padding:2px 8px;background:#f1ece6;color:#7c746c}.pa-opt.shop small{background:rgba(255,255,255,.22);color:#fff}.pa-fine{margin-top:16px;font-size:11.5px;color:#7c746c;text-align:center;line-height:1.5}.pa-msg{min-height:0;margin:0 0 12px;font-size:12.5px;color:#a8402f;background:#fbeeea;border-radius:10px;padding:9px 11px;display:none}.pa-msg.show{display:block}
@media(max-width:860px){.pa-acct-btn .pa-lbl{display:none}.pa-acct-btn{padding:0;width:44px}}`;
document.head.insertAdjacentHTML("beforeend",`<style id="paStyle">${css}</style>`);
const GOOGLE_SVG=`<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
const SHOP_SVG=`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>`;
const USER_SVG=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`;
document.body.insertAdjacentHTML("beforeend",`<div class="pa-mask" id="paMask" role="dialog" aria-modal="true" aria-labelledby="paTitle"><div class="pa-card"><button class="pa-close" id="paClose" type="button">×</button><h2 id="paTitle"></h2><p id="paSub"></p><div class="pa-msg" id="paMsg" role="alert"></div><div class="pa-opts" id="paOpts"></div><div class="pa-fine" id="paFine"></div></div></div>`);
const $=id=>document.getElementById(id),mask=$("paMask");
const here=()=>location.pathname+location.search.replace(/([?&])(signed_in|login_error)=[^&]*/g,"$1").replace(/[?&]$/,"");
const startUrl=p=>`/api/auth/${p}/start?return_to=${encodeURIComponent(here())}&locale=${encodeURIComponent(window.WeddingI18n?.lang?.()||"en")}`;
A.providers=async()=>{if(A._prov)return A._prov;if(location.protocol==="file:")return A._prov={google:{configured:false},shop:{configured:false}};try{A._prov=await (await fetch("/api/auth/providers")).json()}catch{A._prov={google:{configured:false},shop:{configured:false}}}return A._prov};
/** Buttons markup, reused by the modal and the checkout "Sign in for faster checkout" box. */
A.buttonsHtml=prov=>[["google",GOOGLE_SVG],["shop",SHOP_SVG]].map(([p,svg])=>{const ok=!!prov?.[p]?.configured;return ok?`<a class="pa-opt ${p}" data-provider="${p}" href="${esc(startUrl(p))}">${svg}<span>${esc(K("auth."+p))}</span></a>`:`<span class="pa-opt ${p}" data-provider="${p}" role="link" aria-disabled="true" title="${esc(K("auth.err.not_configured"))}">${svg}<span>${esc(K("auth."+p))}</span><small>${esc(K("auth.notConfigured"))}</small></span>`}).join("");
function renderModal(){$("paTitle").textContent=K("auth.title");$("paSub").textContent=K("auth.sub");$("paFine").textContent=K("auth.terms");$("paClose").setAttribute("aria-label",K("auth.close"));$("paOpts").innerHTML=A.buttonsHtml(A._prov)}
function showMsg(code){const m=$("paMsg");if(!code){m.className="pa-msg";m.textContent="";return}const k="auth.err."+code,t=K(k);m.textContent=t===k?K("auth.err.generic"):t;m.className="pa-msg show"}
let lastFocus=null;
A.open=async(err)=>{lastFocus=document.activeElement;await A.providers();renderModal();showMsg(err);mask.classList.add("open");setTimeout(()=>($("paOpts").querySelector("a.pa-opt")||$("paClose")).focus(),30)};
A.close=()=>{mask.classList.remove("open");if(A.p){A.p.reject?.(new Error("auth_cancelled"));A.p=null}lastFocus?.focus?.()};
$("paClose").onclick=A.close;mask.addEventListener("click",e=>{if(e.target===mask)A.close()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&mask.classList.contains("open"))A.close()});
A.me=async()=>{if(location.protocol==="file:")return null;try{const d=await (await fetch("/api/auth/me",{credentials:"same-origin"})).json();A.user=d.user||null}catch{A.user=null}return A.user};
A.require=async()=>{if(location.protocol==="file:"){alert("Sign-in needs the server: npm start");throw new Error("server_required")}const u=await A.me();if(u)return u;A.open();return new Promise((resolve,reject)=>A.p={resolve,reject})};
A.logout=async()=>{try{await fetch("/api/auth/logout",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin"})}catch{}A.user=null;location.reload()};
// ---- header account button + signed-in menu ----
function initial(u){return esc((u.name||u.email||"?").trim().charAt(0).toUpperCase())}
function renderHeader(){
  let slot=document.querySelector("[data-account-slot]");
  if(!slot){const cart=$("cartBtn");if(!cart)return;slot=document.createElement("div");slot.dataset.accountSlot="";cart.parentNode.insertBefore(slot,cart)}
  slot.className="pa-acct";const u=A.user;
  slot.innerHTML=u?`<button class="pa-acct-btn" id="paAcctBtn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(K("auth.account"))}: ${esc(u.email)}"><span class="pa-av">${u.avatar_url?`<img src="${esc(u.avatar_url)}" alt="" referrerpolicy="no-referrer">`:initial(u)}</span><span class="pa-lbl">${esc((u.name||u.email).split(" ")[0])}</span></button><div class="pa-menu" id="paMenu" role="menu"><div class="pa-who"><b>${esc(u.name||u.email)}</b>${esc(K("auth.signedInAs",{e:u.email}))}</div><a role="menuitem" href="account.html">${esc(K("auth.myOrders"))}</a><button role="menuitem" type="button" id="paSignOut">${esc(K("auth.signOut"))}</button></div>`
    :`<button class="pa-acct-btn" id="paAcctBtn" type="button" aria-haspopup="dialog">${USER_SVG}<span class="pa-lbl">${esc(K("auth.signIn"))}</span></button>`;
  const b=$("paAcctBtn");
  if(!u){b.setAttribute("aria-label",K("auth.signIn"));b.onclick=()=>A.open();return}
  const menu=$("paMenu");b.onclick=e=>{e.stopPropagation();const o=!menu.classList.contains("open");menu.classList.toggle("open",o);b.setAttribute("aria-expanded",String(o))};
  $("paSignOut").onclick=A.logout;
}
document.addEventListener("click",e=>{const m=$("paMenu");if(m&&!e.target.closest(".pa-acct")){m.classList.remove("open");$("paAcctBtn")?.setAttribute("aria-expanded","false")}});
window.addEventListener("wedding-language-change",()=>{renderHeader();if(mask.classList.contains("open"))renderModal()});
window.PODAuth=A;
A.ready=(async()=>{
  const qs=new URLSearchParams(location.search),err=qs.get("login_error"),ok=qs.get("signed_in");
  if(err||ok)history.replaceState(null,"",here()+location.hash);
  await Promise.all([A.me(),A.providers()]);renderHeader();
  if(A.user)window.dispatchEvent(new CustomEvent("pod-auth-changed",{detail:A.user}));
  if(err)A.open(/^[a-z_]+$/.test(err)?err:"generic");
  return A.user;
})();
// Translations may load after this script (studio.html): re-render once the DOM is complete.
if(document.readyState!=="complete")window.addEventListener("load",()=>A.ready.then(renderHeader));
})();
