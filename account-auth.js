(()=>{const A={user:null,p:null};
const css=`.pa-mask{position:fixed;inset:0;background:rgba(24,20,17,.38);backdrop-filter:blur(8px);z-index:9999;display:none;place-items:center;padding:20px}.pa-mask.open{display:grid}.pa-card{width:min(400px,94vw);background:#fffdf9;border:1px solid rgba(45,36,30,.12);border-radius:24px;padding:28px;box-shadow:0 30px 90px rgba(30,20,15,.24);color:#28231f;font-family:Inter,system-ui,sans-serif;text-align:center}.pa-card h2{margin:0 0 6px;font:26px Georgia,serif}.pa-card p{margin:0 0 20px;color:#7c746c;font-size:13px;line-height:1.5}.pa-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;border:1px solid rgba(45,36,30,.14);background:#fff;border-radius:12px;padding:12px 16px;cursor:pointer;font-size:14px;font-weight:500;margin:8px 0;transition:background .15s}.pa-btn:hover{background:#f7f5f2}.pa-btn.gmail{border-color:#dadce0}.pa-btn.shopify{background:#95bf47;color:#fff;border-color:#95bf47}.pa-btn.shopify:hover{background:#7ea63a}.pa-close{position:absolute;top:12px;right:14px;border:0;background:transparent;cursor:pointer;font-size:20px;color:#888}.pa-msg{min-height:18px;color:#b4473a;font-size:12px;margin-top:8px}`;
document.head.insertAdjacentHTML('beforeend',`<style>${css}</style>`);
document.body.insertAdjacentHTML('beforeend',`<div class="pa-mask" id="paMask"><div class="pa-card" style="position:relative"><button class="pa-close" id="paClose">×</button><h2>Sign in</h2><p>使用快捷登录继续。首次登录将自动创建账号。</p><button class="pa-btn gmail" id="paGmail"><svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Gmail</button><button class="pa-btn shopify" id="paShopify"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M15.34 3.04c-.04-.1-.12-.16-.22-.16h-1.9c-.02 0-.04 0-.06.02-.3.02-.58.08-.86.16-.1-.28-.24-.56-.4-.82-.48-.78-1.16-1.16-1.94-1.16-.06 0-.12 0-.18.02-.04.02-.08.02-.12.04-.5.22-.9.56-1.2.98-.28.4-.48.84-.58 1.3-.42.14-.82.3-1.18.48-.1.06-.18.14-.22.24l-1.7 5.2c-.04.12 0 .24.1.32.1.08.22.1.34.06l1.16-.38v4.86c0 .14.06.26.16.34.1.1.24.14.38.1l5.4-1.74c.14-.04.24-.16.26-.3l1.04-6.4c.02-.12-.02-.24-.12-.32-.08-.08-.2-.1-.3-.08l-.9.28v-3.5c0-.04 0-.08-.02-.12zm-4.52.52c.2-.16.42-.28.66-.36.06.28.14.56.24.82-.34.08-.66.2-.96.34-.02-.28-.04-.56.06-.8zm-1.06.86c.28-.14.58-.24.9-.3.04.18.1.36.16.54-.4.1-.78.26-1.12.44.02-.24.04-.46.06-.68zm2.34 1.04c-.36.12-.72.3-1.04.52.26.84.58 1.64.96 2.4.4-.12.78-.3 1.12-.52-.32-.8-.68-1.58-1.04-2.4z"/></svg> Continue with Shopify</button><div class="pa-msg" id="paMsg"></div></div></div>`);
const mask=document.getElementById('paMask'),msg=document.getElementById('paMsg');
document.getElementById('paClose').onclick=()=>{mask.classList.remove('open');if(A.p){A.p.reject?.(new Error('auth_cancelled'));A.p=null;}};

// Gmail OAuth: redirect to Google, auto-register on return
document.getElementById('paGmail').onclick=()=>{
  const returnTo=encodeURIComponent(location.pathname+location.search);
  location.href=`/api/auth/google?return=${returnTo}`;
};
// Shopify OAuth: redirect to Shopify authorize
document.getElementById('paShopify').onclick=()=>{
  const shop=prompt('Enter your Shopify store domain (e.g. your-store.myshopify.com)');
  if(!shop)return;
  const returnTo=encodeURIComponent(location.pathname+location.search);
  location.href=`/api/auth/shopify?shop=${encodeURIComponent(shop.trim())}&return=${returnTo}`;
};

async function done(){const r=await fetch('/api/auth/me');const d=await r.json();A.user=d.user||null;mask.classList.remove('open');window.dispatchEvent(new CustomEvent('pod-auth-changed',{detail:A.user}));if(A.p){A.p.resolve(A.user);A.p=null;}return A.user;}
A.me=async()=>{if(location.protocol==='file:')return null;try{const r=await fetch('/api/auth/me');const d=await r.json();A.user=d.user||null;return A.user;}catch{return null;}};
// Skip login if not deployed (file:// or no backend)
A.require=async()=>{if(location.protocol==='file:')return null;const u=await A.me();if(u)return u;mask.classList.add('open');return new Promise((resolve,reject)=>A.p={resolve,reject});};
A.logout=async()=>{await fetch('/api/auth/logout',{method:'POST'});A.user=null;location.reload();};window.PODAuth=A;})();
