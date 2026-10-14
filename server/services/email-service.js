import { addRecord } from "../saas-store.js";

function htmlEscape(v){return String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

async function sendViaSendGrid({to,subject,html,text}){
  const key=process.env.SENDGRID_API_KEY;if(!key)return null;
  const from=process.env.FROM_EMAIL||"no-reply@example.com";
  const name=process.env.FROM_NAME||"POD Studio";
  const r=await fetch("https://api.sendgrid.com/v3/mail/send",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({personalizations:[{to:[{email:to}]}],from:{email:from,name},subject,content:[{type:"text/plain",value:text||subject},{type:"text/html",value:html||`<p>${htmlEscape(text||subject)}</p>`}]})});
  if(!r.ok)throw new Error(`sendgrid_${r.status}`);return {provider:"sendgrid",status:"sent"};
}
async function sendViaPostmark({to,subject,html,text}){
  const key=process.env.POSTMARK_SERVER_TOKEN;if(!key)return null;
  const from=process.env.FROM_EMAIL||"no-reply@example.com";
  const r=await fetch("https://api.postmarkapp.com/email",{method:"POST",headers:{"X-Postmark-Server-Token":key,"Content-Type":"application/json"},body:JSON.stringify({From:from,To:to,Subject:subject,HtmlBody:html||`<p>${htmlEscape(text||subject)}</p>`,TextBody:text||subject,MessageStream:"outbound"})});
  if(!r.ok)throw new Error(`postmark_${r.status}`);return {provider:"postmark",status:"sent"};
}

export async function sendEmail({tenantId="tenant_demo",userId=null,to,subject,html,text,type="transactional",related_id=null}){
  let outcome={provider:null,status:"not_configured"},error=null;
  try{outcome=await sendViaSendGrid({to,subject,html,text})||await sendViaPostmark({to,subject,html,text})||outcome;}catch(e){error=e.message;outcome={provider:process.env.SENDGRID_API_KEY?"sendgrid":"postmark",status:"failed"};}
  const row=await addRecord("notifications",{id:`ntf_${cryptoRandom()}`,tenant_id:tenantId,user_id:userId||null,type,channel:"email",to,subject,status:outcome.status,provider:outcome.provider,related_id,error,created_at:new Date().toISOString()});
  if(outcome.status==="failed")console.error("[email] delivery failed",error);
  if(outcome.status==="not_configured"&&process.env.NODE_ENV!=="production")console.log(`[email:dev] ${to} · ${subject}`);
  return {...outcome,notification_id:row.id};
}
function cryptoRandom(){return Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-6);}
