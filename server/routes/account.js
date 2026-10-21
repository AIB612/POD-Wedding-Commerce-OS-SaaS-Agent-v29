import express from "express";
import { ah, rateLimit } from "../http/middleware.js";
import { dashboard, login, logoutToken, publicUser, register, requestEmailCode, verifyEmailCode } from "../services/account-service.js";
import { requireUser } from "../auth.js";
import { listRsvps, rsvpCsv } from "../services/rsvp-service.js";
import { providerStatus, startLogin, finishLogin, STATE_COOKIE } from "../services/oauth-login-service.js";
import { baseUrl } from "../config.js";

// Session cookie: HttpOnly, SameSite=Lax (survives the OAuth redirect back), Secure in production or on an https base URL.
const secureCookie=()=>process.env.NODE_ENV==="production"||baseUrl().startsWith("https://");
const cookieOpts=()=>({httpOnly:true,sameSite:"lax",secure:secureCookie(),path:"/",maxAge:30*864e5});
const stateOpts=()=>({httpOnly:true,sameSite:"lax",secure:secureCookie(),path:"/api/auth",maxAge:10*60e3});
const clearOpts=o=>{const{maxAge,...x}=o;return x;};
function readCookie(req,name){for(const part of String(req.headers?.cookie||"").split(";")){const i=part.indexOf("=");if(i>0&&part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());}return "";}
/** CSRF guard for state-changing auth calls: a cross-site Origin / Sec-Fetch-Site is rejected. */
export function sameOrigin(req,res,next){
 const site=req.get("sec-fetch-site");if(site&&!["same-origin","none"].includes(site))return res.status(403).json({error:"csrf_rejected"});
 const origin=req.get("origin");if(origin&&origin!=="null"){const host=req.get("host");let ok=false;try{const o=new URL(origin);ok=o.host===host||o.origin===new URL(baseUrl()).origin;}catch{}if(!ok)return res.status(403).json({error:"csrf_rejected"});}
 next();
}
const setSession=(res,token)=>res.cookie("pod_session",token,cookieOpts());
export function accountRouter(){
 const r=express.Router(),lim=rateLimit({bucket:"account-auth",windowMs:60_000,max:30});
 r.get("/api/auth/me",(req,res)=>res.json({authenticated:!!req.user,user:publicUser(req.user)}));
 r.post("/api/auth/register",lim,ah(async(req,res)=>{const x=await register({tenantId:req.tenantId,...req.body});setSession(res,x.token);res.json({ok:true,user:publicUser(x.user)});}));
 r.post("/api/auth/login",lim,ah(async(req,res)=>{const x=await login({tenantId:req.tenantId,...req.body});setSession(res,x.token);res.json({ok:true,user:publicUser(x.user)});}));
 r.post("/api/auth/email-code",lim,ah(async(req,res)=>res.json(await requestEmailCode({tenantId:req.tenantId,...req.body}))));
 r.post("/api/auth/email-code/verify",lim,ah(async(req,res)=>{const x=await verifyEmailCode({tenantId:req.tenantId,...req.body});setSession(res,x.token);res.json({ok:true,user:publicUser(x.user)});}));
 // Quick login (Google / Shop). Missing keys → configured:false, buttons render disabled.
 r.get("/api/auth/providers",(req,res)=>{res.setHeader("Cache-Control","no-store");res.json(providerStatus());});
 for(const p of ["google","shop"]){
  r.get(`/api/auth/${p}/start`,lim,ah(async(req,res)=>{
   if(!providerStatus()[p].configured)return req.accepts(["html","json"])==="json"?res.status(503).json({error:"not_configured",provider:p}):res.redirect(`/?login_error=not_configured`);
   const x=await startLogin(p,{returnTo:req.query.return_to,locale:req.query.locale});
   res.cookie(STATE_COOKIE,x.cookie,stateOpts());res.setHeader("Cache-Control","no-store");res.redirect(x.url);
  }));
  r.get(`/api/auth/${p}/callback`,lim,ah(async(req,res)=>{
   res.clearCookie(STATE_COOKIE,clearOpts(stateOpts()));res.setHeader("Cache-Control","no-store");
   try{const x=await finishLogin(p,{tenantId:req.tenantId,query:req.query,cookie:readCookie(req,STATE_COOKIE)});setSession(res,x.token);const sep=x.returnTo.includes("?")?"&":"?";res.redirect(`${x.returnTo}${sep}signed_in=${p}`);}
   catch(e){const code=/^[a-z_]+$/.test(e.message||"")?e.message:"login_failed";if(!e.status||(e.status>=500&&e.message!=="not_configured"))console.error(`[auth] ${p} callback failed:`,e.message);res.redirect(`/?login_error=${encodeURIComponent(code)}`);}
  }));
 }
 // Checkout prefill for the signed-in customer (own data only).
 r.get("/api/account/profile",requireUser,(req,res)=>{const u=req.user;res.setHeader("Cache-Control","no-store");res.json({email:u.email,name:u.name||"",shipping_address:u.shipping_address||null});});
 r.post("/api/auth/logout",sameOrigin,ah(async(req,res)=>{await logoutToken(req.sessionToken);res.clearCookie("pod_session",clearOpts(cookieOpts()));res.json({ok:true});}));
 r.get("/api/account/dashboard",requireUser,ah(async(req,res)=>res.json(await dashboard(req.tenantId,req.user.id))));
 // Built-in RSVP responses for the couple's own published wedding sites
 r.get("/api/account/invitations/:id/rsvps",requireUser,ah(async(req,res)=>res.json(await listRsvps(req.tenantId,req.user.id,req.params.id))));
 r.get("/api/account/invitations/:id/rsvps.csv",requireUser,ah(async(req,res)=>{const x=await listRsvps(req.tenantId,req.user.id,req.params.id);res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",`attachment; filename="rsvp-${x.invitation.id}.csv"`);res.setHeader("Cache-Control","no-store");res.send(rsvpCsv(x));}));
 return r;
}
