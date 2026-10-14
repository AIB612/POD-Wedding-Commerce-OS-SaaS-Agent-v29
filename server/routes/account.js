import express from "express";
import { ah, rateLimit } from "../http/middleware.js";
import { dashboard, login, logoutToken, publicUser, register, requestEmailCode, verifyEmailCode } from "../services/account-service.js";
import { requireUser } from "../auth.js";

const cookieOpts=()=>({httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:30*864e5});
const setSession=(res,token)=>res.cookie("pod_session",token,cookieOpts());
export function accountRouter(){
 const r=express.Router(),lim=rateLimit({bucket:"account-auth",windowMs:60_000,max:30});
 r.get("/api/auth/me",(req,res)=>res.json({authenticated:!!req.user,user:publicUser(req.user)}));
 r.post("/api/auth/register",lim,ah(async(req,res)=>{const x=await register({tenantId:req.tenantId,...req.body});setSession(res,x.token);res.json({ok:true,user:publicUser(x.user)});}));
 r.post("/api/auth/login",lim,ah(async(req,res)=>{const x=await login({tenantId:req.tenantId,...req.body});setSession(res,x.token);res.json({ok:true,user:publicUser(x.user)});}));
 r.post("/api/auth/email-code",lim,ah(async(req,res)=>res.json(await requestEmailCode({tenantId:req.tenantId,...req.body}))));
 r.post("/api/auth/email-code/verify",lim,ah(async(req,res)=>{const x=await verifyEmailCode({tenantId:req.tenantId,...req.body});setSession(res,x.token);res.json({ok:true,user:publicUser(x.user)});}));
 r.post("/api/auth/logout",ah(async(req,res)=>{await logoutToken(req.sessionToken);res.clearCookie("pod_session",cookieOpts());res.json({ok:true});}));
 r.get("/api/account/dashboard",requireUser,ah(async(req,res)=>res.json(await dashboard(req.tenantId,req.user.id))));
 return r;
}
