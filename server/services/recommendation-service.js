import {listForTenant} from "../saas-store.js";
export async function recommendations({tenantId,customerId}){
  const products=await listForTenant("products",tenantId),customers=await listForTenant("customers",tenantId),c=customers.find(x=>x.id===customerId);const scene=c?.favorite_scene;
  return products.map(p=>({...p,score:(p.scene_tags||[]).includes(scene)?0.92:0.58,reason:(p.scene_tags||[]).includes(scene)?`Matches ${scene} scene preference`:"Popular cross-sell"})).sort((a,b)=>b.score-a.score).slice(0,6);
}
