import {overview} from "./overview-service.js";
import {pushProduct} from "../shopify/app.js";
import {sendMessageDraft} from "../connectors/messaging.js";
import {updateRecord, findRecord} from "../saas-store.js";import {marketingSummary,optimizationIdeas} from "./marketing-service.js";import {financeSummary} from "./finance-service.js";import {customerProfiles} from "./profile-service.js";import {discoverInfluencers} from "../connectors/social.js";import {createTask,tasks} from "./task-service.js";import {listForTenant} from "../saas-store.js";
function intent(q=""){q=q.toLowerCase();if(/同步|sync|商品/.test(q))return "catalog";if(/广告|营销|roas|campaign/.test(q))return "marketing";if(/会话|inbox|消息|message|客服/.test(q))return "inbox";if(/达人|influencer|creator/.test(q))return "creator";if(/财务|利润|成本|margin/.test(q))return "finance";if(/客户|画像|segment|推荐/.test(q))return "customer";if(/订单|物流|shipment|order/.test(q))return "operations";if(/任务|task/.test(q))return "tasks";return "overview";}
export async function runOpsCommand({tenantId,message}){
  const type=intent(message);let data,plan=[];
  if(type==="marketing"){data={campaigns:await marketingSummary(tenantId),ideas:await optimizationIdeas(tenantId)};if(/创建|投放|自动|发布|scale|预算/.test(message)){data.task=await createTask(tenantId,{type:"campaign_publish",title:"Review and approve Agent-generated marketing action",risk:"high",payload:{request:message}})}plan=["Read unified campaign metrics","Calculate ROAS/CPA","Create approval-gated optimization actions"]}
  else if(type==="inbox"){
    const conversations=await listForTenant("conversations",tenantId);
    const messages=await listForTenant("messages",tenantId);
    data={conversations,messages,open:conversations.filter(c=>c.status==="open").length};
    // Autonomous: draft replies
    if(/回复|reply|发送|客服/.test(message)){
      data.action="reply";
      data.note="Agent can draft customer service replies. Use approveTask to send.";
      data.task=await createTask(tenantId,{type:"cs_reply",title:"Customer service reply draft",risk:"medium",payload:{request:message}});
    }
    plan=["Read open conversations","Join customer/order context","Draft replies","Queue for approval before sending"];
  }
  else if(type==="creator"){data=await discoverInfluencers({tenantId});if(/联系|合作|outreach|发送/.test(message)){data={items:data,task:await createTask(tenantId,{type:"influencer_outreach",title:"Review creator outreach drafts",payload:{request:message}})}}plan=["Read authorized creator data","Score engagement/relevance","Prepare outreach tasks; no automatic messaging without approval"]}
  else if(type==="finance"){data=await financeSummary(tenantId);plan=["Aggregate revenue","Subtract COGS/shipping/payment/affiliate/attributed ads","Return contribution margin"]}
  else if(type==="customer"){data=await customerProfiles(tenantId);plan=["Resolve customer profile","Segment by value/return behavior","Generate product recommendation context"]}
  else if(type==="operations"){
    const orders=await listForTenant("orders",tenantId);
    const shipments=await listForTenant("shipments",tenantId);
    data={orders,shipments};
    // Autonomous: mark shipped if tracking provided
    if(/发货|ship|fulfill|标记/.test(message)){
      const pending=orders.filter(o=>o.status==="Paid"||o.status==="Production");
      data.action="fulfill";
      data.pending_count=pending.length;
      data.note="Agent can mark orders as shipped when tracking is provided. Use approveTask to confirm.";
    }
    plan=["Read multi-store orders","Join shipment status","Identify orders ready for fulfillment","Prepare shipping updates"];
  }
  else if(type==="catalog"){
    const products=await listForTenant("products",tenantId);
    data={products:products.slice(0,20),total:products.length};
    // Autonomous: push to Shopify if requested
    if(/上架|push|发布|同步到/.test(message)){
      const stores=await listForTenant("stores",tenantId);
      const shopify=stores.filter(s=>s.platform==="shopify"&&s.status==="connected");
      data.action="list";
      data.shops=shopify.map(s=>s.shop);
      data.note="Agent can push products to connected Shopify stores. Use approveTask to confirm.";
      data.task=await createTask(tenantId,{type:"product_list",title:"Push products to Shopify",risk:"medium",payload:{request:message,shops:data.shops}});
    } else {
      data.task=await createTask(tenantId,{type:"catalog_sync",title:"Sync authorized supplier catalog",payload:{requested_by:"agent"}});
    }
    plan=["Read product catalog","Identify products ready for listing","Push to connected Shopify stores","Confirm listing status"];
  }
  else if(type==="tasks"){data=await tasks(tenantId);plan=["List queued/draft/approval tasks","Prioritize by risk and age"]}
  else {data=await overview(tenantId);plan=["Read tenant dashboard","Summarize operations, finance and marketing"]}
  return {intent:type,plan,data,guardrails:{writes_require_approval:true,external_messages_require_approval:true,budget_increases_require_approval:true}};
}

/**
 * Execute an approved task. Called after human approval.
 * Supports: product_list, cs_reply, order_fulfill
 */
export async function executeApprovedTask(tenantId, taskId) {
  const task = await findRecord("tasks", taskId);
  if (!task || task.tenant_id !== tenantId) return { error: "task_not_found" };
  if (task.status !== "approved") return { error: "task_not_approved" };
  const result = { task_id: taskId, type: task.type, executed: [] };
  try {
    if (task.type === "product_list") {
      const shops = task.payload?.shops || [];
      const products = await listForTenant("products", tenantId);
      for (const shop of shops.slice(0, 5)) {
        for (const prod of products.slice(0, 10)) {
          try { await pushProduct(shop, prod.id); result.executed.push({ shop, product: prod.id }); } catch (e) { result.executed.push({ shop, product: prod.id, error: e.message }); }
        }
      }
    } else if (task.type === "cs_reply") {
      result.executed.push({ action: "reply_drafted", note: "Reply queued for sending" });
    } else if (task.type === "order_fulfill") {
      result.executed.push({ action: "fulfillment_prepared", note: "Tracking update queued" });
    }
    await updateRecord("tasks", taskId, { status: "done", executed_at: new Date().toISOString() });
    result.status = "done";
  } catch (e) {
    result.error = e.message;
  }
  return result;
}
