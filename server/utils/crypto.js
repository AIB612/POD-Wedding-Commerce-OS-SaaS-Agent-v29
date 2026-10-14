import crypto from "node:crypto";
function key(){
  const raw=process.env.APP_ENCRYPTION_KEY||"development-only-key-change-me";
  return crypto.createHash("sha256").update(raw).digest();
}
export function encrypt(value){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);
  const ciphertext=Buffer.concat([cipher.update(String(value),"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();return Buffer.concat([iv,tag,ciphertext]).toString("base64url");
}
export function decrypt(token){
  const buf=Buffer.from(token,"base64url"),iv=buf.subarray(0,12),tag=buf.subarray(12,28),data=buf.subarray(28);
  const decipher=crypto.createDecipheriv("aes-256-gcm",key(),iv);decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString("utf8");
}
export function hmacHex(secret,text){return crypto.createHmac("sha256",secret).update(text).digest("hex");}
export function timingSafeHexEqual(a,b){try{return crypto.timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));}catch{return false;}}
