import crypto from "node:crypto";
import { userFromToken } from "./services/account-service.js";

const isProd = () => process.env.NODE_ENV === "production";

function safeEqual(a, b) {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function cookieValue(req,name){
  const raw=String(req.headers?.cookie||"");
  for(const part of raw.split(";")){const i=part.indexOf("=");if(i<0)continue;const k=part.slice(0,i).trim();if(k===name)return decodeURIComponent(part.slice(i+1).trim());}
  return "";
}

export function tenantContext(req, res, next) {
  req.tenantId = req.get("x-tenant-id") || req.query.tenant_id || process.env.DEFAULT_TENANT_ID || "tenant_demo";
  req.userRole = req.get("x-user-role") || "admin";
  next();
}

/** Attach the customer account session when present. Cookie is HttpOnly; Bearer is accepted for API clients. */
export async function userContext(req,res,next){
  try{
    const auth=String(req.get("authorization")||"");
    const token=auth.startsWith("Bearer ")?auth.slice(7).trim():cookieValue(req,"pod_session");
    req.sessionToken=token||null;
    req.user=token?await userFromToken(token):null;
    if(req.user && req.user.tenant_id !== req.tenantId) req.user=null;
    next();
  }catch(e){next(e);}
}
export function requireUser(req,res,next){
  if(req.user)return next();
  res.status(401).json({error:"login_required",message:"Please sign in to continue."});
}

/** True when the request carries a valid admin key (or dev mode with no key configured). */
export function isAdminRequest(req) {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) return !isProd();
  return safeEqual(req.get("x-admin-api-key"), configured);
}

export function requireAdmin(req, res, next) {
  if (isAdminRequest(req)) return next();
  res.status(401).json({ error: "admin_auth_required" });
}

export function requireApproval(req, res, next) {
  if (req.body?.approved === true || req.get("x-action-approved") === "true") return next();
  res.status(409).json({ error: "approval_required", message: "This write action requires explicit approval." });
}
