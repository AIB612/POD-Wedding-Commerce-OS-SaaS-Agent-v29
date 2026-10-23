import express from "express";
import { ah, rateLimit } from "../http/middleware.js";
import { dashboard, login, logoutToken, publicUser, register, requestEmailCode, verifyEmailCode } from "../services/account-service.js";
import { requireUser } from "../auth.js";
import { listRsvps, rsvpCsv } from "../services/rsvp-service.js";

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
 // Built-in RSVP responses for the couple's own published wedding sites
 r.get("/api/account/invitations/:id/rsvps",requireUser,ah(async(req,res)=>res.json(await listRsvps(req.tenantId,req.user.id,req.params.id))));
 r.get("/api/account/invitations/:id/rsvps.csv",requireUser,ah(async(req,res)=>{const x=await listRsvps(req.tenantId,req.user.id,req.params.id);res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",`attachment; filename="rsvp-${x.invitation.id}.csv"`);res.setHeader("Cache-Control","no-store");res.send(rsvpCsv(x));}));

  // Gmail OAuth: redirect to Google, auto-register on callback
  r.get("/api/auth/google", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(501).json({ error: "google_not_configured", message: "Google OAuth not configured. Set GOOGLE_CLIENT_ID." });
    const returnTo = req.query.return || "/";
    const redirect = encodeURIComponent(`${req.protocol}://${req.get("host")}/api/auth/google/callback`);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirect}&response_type=code&scope=openid%20email%20profile&state=${encodeURIComponent(returnTo)}`;
    res.redirect(url);
  });
  r.get("/api/auth/google/callback", ah(async (req, res) => {
    // Placeholder: exchange code, get email, auto-register, set session
    const returnTo = req.query.state || "/";
    res.redirect(returnTo + (returnTo.includes("?") ? "&" : "?") + "auth=google_pending");
  }));

  // Shopify OAuth: redirect to Shopify authorize
  r.get("/api/auth/shopify", (req, res) => {
    const shop = String(req.query.shop || "").trim();
    if (!shop || !shop.endsWith(".myshopify.com")) return res.status(400).json({ error: "invalid_shop" });
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    if (!clientId) return res.status(501).json({ error: "shopify_not_configured", message: "Shopify OAuth not configured. Set SHOPIFY_CLIENT_ID." });
    const returnTo = req.query.return || "/";
    const redirect = encodeURIComponent(`${req.protocol}://${req.get("host")}/api/auth/shopify/callback`);
    const url = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=read_products,write_products&redirect_uri=${redirect}&state=${encodeURIComponent(returnTo)}`;
    res.redirect(url);
  });
  r.get("/api/auth/shopify/callback", ah(async (req, res) => {
    const returnTo = req.query.state || "/";
    res.redirect(returnTo + (returnTo.includes("?") ? "&" : "?") + "auth=shopify_pending");
  }));

 return r;
}
