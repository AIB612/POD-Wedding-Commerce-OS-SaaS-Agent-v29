import { retrieve } from "./rag.js";
import { callLLM } from "./connectors/llm.js";
import { runOpsCommand } from "./services/agent-ops-service.js";

const OPS_PATTERN = /(广告|营销|roas|达人|influencer|财务|利润|成本|订单|物流|同步|店铺|shopify|任务|客户画像|推荐)/i;
export const isOps = (message = "") => OPS_PATTERN.test(message);

/**
 * Agent entry for /api/agent/chat.
 * Back-office (ops) intents only run for authenticated admins — storefront visitors must never
 * receive tenant finance, order or customer data. Visitors get the customer-side assistant instead.
 */
export async function runAgent({ message = "", scene = "cream", cart = [], tenantId = "tenant_demo", isAdmin = false }) {
  if (isAdmin && isOps(message)) {
    const result = await runOpsCommand({ tenantId, message });
    return { answer: `已分析为 ${result.intent} 任务。写操作默认进入审批，不会直接改预算/退款/发布。`, tool_summary: JSON.stringify(result, null, 2), plan: result.plan };
  }
  const rag = await retrieve(message, { scene });
  const system = `你是 Wedding Commerce OS 的客户侧业务 Agent。你可以辅助婚礼POD定制、产品/材质、设计Brief、邀请网站、订单和物流说明。
真实交易状态必须来自工具/API。后台运营类写操作必须走审批。不要透露其他客户、订单金额、成本或内部运营数据。
当前场景:${String(scene).slice(0, 40)}
购物车:${JSON.stringify(cart).slice(0, 2500)}
RAG:
${rag.map(x => "- " + x.text).join("\n")}`;
  const { text, configured } = await callLLM({ system, user: message });
  // fallback:true lets the storefront use its built-in demo answers when no LLM is configured.
  return { answer: text, tool_summary: rag.length ? `RAG ${rag.length} hits` : "", ...(configured ? {} : { fallback: true }) };
}
