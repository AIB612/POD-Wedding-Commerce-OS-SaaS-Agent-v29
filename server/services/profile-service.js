import {listForTenant} from "../saas-store.js";
import {recommendations} from "./recommendation-service.js";

function clamp(v){return Math.max(0,Math.min(100,Math.round(v)))}
function segmentFor(c){return c.lifetime_value>=700?"VIP":c.orders>=2?"Returning":"New"}

export async function customerProfiles(tenantId){
  const [customers,orders,events,conversations]=await Promise.all([
    listForTenant("customers",tenantId),
    listForTenant("orders",tenantId),
    listForTenant("customer_events",tenantId),
    listForTenant("conversations",tenantId)
  ]);
  return customers.map(c=>{
    const co=orders.filter(o=>o.customer_id===c.id);
    const ce=events.filter(e=>e.customer_id===c.id);
    const cc=conversations.filter(x=>x.customer_id===c.id);
    const recentIntent=ce.filter(e=>["cart_add","checkout","conversation","product_view"].includes(e.type)).length;
    const avgOrder=co.length?co.reduce((s,o)=>s+Number(o.revenue||0),0)/co.length:0;
    return {
      ...c,
      segment:segmentFor(c),
      scores:{
        value:clamp(c.lifetime_value/10),
        engagement:clamp((c.site_visits_30d||0)*5+(c.email_clicks_30d||0)*4+(c.avg_session_minutes||0)*3),
        repeat:clamp((c.orders||0)*28),
        intent:clamp(recentIntent*16+(c.cart_adds_30d||0)*8),
        affinity:clamp(58+(c.preferred_categories?.length||0)*8+(c.preferred_materials?.length||0)*6),
        advocacy:clamp((c.acquisition==="affiliate"?62:35)+(c.orders||0)*7)
      },
      avg_order_value:Number(avgOrder.toFixed(2)),
      recent_events:ce.length,
      conversations:cc.length,
      last_order_at:co.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0]?.created_at||null
    };
  });
}
export async function aggregateSegments(tenantId){
  const rows=await customerProfiles(tenantId),map={};
  for(const r of rows)map[r.segment]=(map[r.segment]||0)+1;
  return Object.entries(map).map(([segment,count])=>({segment,count}));
}
export async function customerProfileDetail(tenantId,customerId){
  const customer=(await customerProfiles(tenantId)).find(c=>c.id===customerId);
  if(!customer)return null;
  const [orders,events,conversations,messages,recs]=await Promise.all([
    listForTenant("orders",tenantId),
    listForTenant("customer_events",tenantId),
    listForTenant("conversations",tenantId),
    listForTenant("messages",tenantId),
    recommendations({tenantId,customerId})
  ]);
  return {
    customer,
    behavior_events:events.filter(e=>e.customer_id===customerId).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),
    orders:orders.filter(o=>o.customer_id===customerId).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))),
    conversations:conversations.filter(c=>c.customer_id===customerId).map(c=>({...c,messages:messages.filter(m=>m.conversation_id===c.id)})),
    recommendations:recs
  };
}
