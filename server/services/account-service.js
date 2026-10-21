import crypto from "node:crypto";
import { addRecord, findWhere, listForTenant, removeWhere, updateRecord } from "../saas-store.js";
import { HttpError } from "../http/middleware.js";
import { sendEmail } from "./email-service.js";

const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const now=()=>new Date().toISOString();
const cleanEmail=v=>String(v||"").trim().toLowerCase().slice(0,320);
const sid=()=>crypto.randomBytes(24).toString("base64url");
const uid=()=>`usr_${crypto.randomBytes(8).toString("hex")}`;
const hashToken=t=>crypto.createHash("sha256").update(t).digest("hex");
function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")){const hash=crypto.scryptSync(String(password),salt,64).toString("hex");return {salt,hash};}
function verifyPassword(password,u){if(!u?.password_hash||!u?.password_salt)return false;const h=crypto.scryptSync(String(password),u.password_salt,64);const b=Buffer.from(u.password_hash,"hex");return b.length===h.length&&crypto.timingSafeEqual(b,h);}
export function publicUser(u){return u?{id:u.id,email:u.email,name:u.name||"",role:u.role||"customer",created_at:u.created_at,avatar_url:u.avatar_url||"",providers:Object.keys(u.identities||{})}:null;}

export async function register({tenantId,email,password,name}){
  email=cleanEmail(email);if(!EMAIL.test(email))throw new HttpError(400,"invalid_email","请输入有效邮箱");
  if(String(password||"").length<8)throw new HttpError(400,"weak_password","密码至少 8 位");
  let u=await findWhere("customer_accounts",x=>x.tenant_id===tenantId&&x.email===email);
  if(u?.status==="disabled")throw new HttpError(403,"account_disabled","账号已停用，请联系支持");
  if(u?.password_hash)throw new HttpError(409,"account_exists","账号已存在，请直接登录");
  const {salt,hash}=hashPassword(password),ts=now();
  if(u)u=await updateRecord("customer_accounts",u.id,{name:String(name||u.name||"").slice(0,120),password_salt:salt,password_hash:hash,status:"active",updated_at:ts});
  else u=await addRecord("customer_accounts",{id:uid(),tenant_id:tenantId,email,name:String(name||"").slice(0,120),password_salt:salt,password_hash:hash,role:"customer",status:"active",created_at:ts,updated_at:ts});
  await ensureCustomer(tenantId,u);
  return {user:u,...await createSession(tenantId,u.id)};
}
export async function login({tenantId,email,password}){
  email=cleanEmail(email);const u=await findWhere("customer_accounts",x=>x.tenant_id===tenantId&&x.email===email&&x.status!=="disabled");
  if(!u||!verifyPassword(password,u))throw new HttpError(401,"invalid_credentials","邮箱或密码不正确");
  await updateRecord("customer_accounts",u.id,{last_login_at:now(),updated_at:now()});return {user:u,...await createSession(tenantId,u.id)};
}
export async function createSession(tenantId,userId){const token=sid();await addRecord("customer_sessions",{id:`ses_${crypto.randomBytes(6).toString("hex")}`,tenant_id:tenantId,user_id:userId,token_hash:hashToken(token),expires_at:new Date(Date.now()+30*864e5).toISOString(),created_at:now()});return {token};}
export async function userFromToken(token){if(!token)return null;const h=hashToken(token),s=await findWhere("customer_sessions",x=>x.token_hash===h&&Date.parse(x.expires_at)>Date.now());if(!s)return null;return findWhere("customer_accounts",x=>x.id===s.user_id&&x.tenant_id===s.tenant_id&&x.status!=="disabled");}
export async function logoutToken(token){if(token)await removeWhere("customer_sessions",x=>x.token_hash===hashToken(token));return {ok:true};}

export async function requestEmailCode({tenantId,email,name}){
  email=cleanEmail(email);if(!EMAIL.test(email))throw new HttpError(400,"invalid_email","请输入有效邮箱");
  const existing=await findWhere("customer_accounts",x=>x.tenant_id===tenantId&&x.email===email);if(existing?.status==="disabled")throw new HttpError(403,"account_disabled","账号已停用，请联系支持");
  const code=String(crypto.randomInt(100000,1000000)),codeHash=hashToken(`${email}:${code}`),ts=now();
  await removeWhere("login_codes",x=>x.tenant_id===tenantId&&x.email===email);
  await addRecord("login_codes",{id:`otp_${crypto.randomBytes(6).toString("hex")}`,tenant_id:tenantId,email,name:String(name||"").slice(0,120),code_hash:codeHash,expires_at:new Date(Date.now()+10*60e3).toISOString(),created_at:ts});
  const sent=await sendEmail({tenantId,to:email,type:"login_code",related_id:email,subject:"Your POD Studio login code",text:`Your login code is ${code}. It expires in 10 minutes.`,html:`<div style="font-family:Arial,sans-serif"><h2>${code}</h2><p>Your POD Studio login code. It expires in 10 minutes.</p></div>`});
  return {ok:true,email_status:sent.status,...(process.env.NODE_ENV!=="production"&&sent.status!=="sent"?{dev_code:code}:{})};
}
export async function verifyEmailCode({tenantId,email,code}){
  email=cleanEmail(email);const rec=await findWhere("login_codes",x=>x.tenant_id===tenantId&&x.email===email&&Date.parse(x.expires_at)>Date.now());
  if(!rec||rec.code_hash!==hashToken(`${email}:${String(code||"").trim()}`))throw new HttpError(401,"invalid_code","验证码无效或已过期");
  await removeWhere("login_codes",x=>x.id===rec.id);
  let u=await findWhere("customer_accounts",x=>x.tenant_id===tenantId&&x.email===email);const ts=now();
  if(u?.status==="disabled")throw new HttpError(403,"account_disabled","账号已停用，请联系支持");
  if(!u)u=await addRecord("customer_accounts",{id:uid(),tenant_id:tenantId,email,name:rec.name||"",role:"customer",status:"active",created_at:ts,updated_at:ts,last_login_at:ts});
  else await updateRecord("customer_accounts",u.id,{last_login_at:ts,updated_at:ts});
  await ensureCustomer(tenantId,u);return {user:u,...await createSession(tenantId,u.id)};
}
export async function ensureCustomer(tenantId,u){let c=await findWhere("customers",x=>x.tenant_id===tenantId&&String(x.email||"").toLowerCase()===u.email);if(c){if(!c.user_id)await updateRecord("customers",c.id,{user_id:u.id,name:c.name||u.name||""});return c;}return addRecord("customers",{id:`cus_${crypto.randomBytes(6).toString("hex")}`,tenant_id:tenantId,user_id:u.id,email:u.email,name:u.name||"",country:"",locale:"en",lifetime_value:0,orders:0,favorite_scene:"",acquisition:"POD Studio account",last_seen:now(),device:"web",traits:["registered"],preferred_categories:[],preferred_materials:[],interests:[],created_at:now()});}
export async function dashboard(tenantId,userId){const [users,orders,projects,notifications,proofs,events,invitations]=await Promise.all([listForTenant("customer_accounts",tenantId),listForTenant("orders",tenantId),listForTenant("studio_projects",tenantId),listForTenant("notifications",tenantId),listForTenant("proofs",tenantId),listForTenant("order_events",tenantId),listForTenant("invitations",tenantId)]);const u=users.find(x=>x.id===userId);if(!u)throw new HttpError(404,"user_not_found","User not found");const mine=orders.filter(x=>x.user_id===userId).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));const ids=new Set(mine.map(o=>o.id));return {user:publicUser(u),orders:mine,projects:projects.filter(x=>x.user_id===userId).map(({tenant_id,contact,...p})=>p).sort((a,b)=>String(b.updated_at||b.created_at).localeCompare(String(a.updated_at||a.created_at))),proofs:proofs.filter(x=>ids.has(x.order_id)).map(({token,...p})=>({...p,ready:!!p.proof_url,approval_url:p.proof_url?`/proof.html?token=${token}`:""})),order_events:events.filter(x=>ids.has(x.order_id)).sort((a,b)=>String(b.event_time||b.created_at).localeCompare(String(a.event_time||a.created_at))),invitations:invitations.filter(x=>x.user_id===userId).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),notifications:notifications.filter(x=>x.user_id===userId||ids.has(x.related_id)).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))};}
