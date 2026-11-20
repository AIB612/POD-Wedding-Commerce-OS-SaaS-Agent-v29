// ┌─ 文件卡片 File card ─────────────────────────────────────────────────────────────────────────────────┐
// │ 这是什么 What: Pod.AI 商家助理（对内 Agent）的入口。和平台无关：Shopify、WooCommerce，以及以后接入的        │
// │   任何店铺（例如 POD 网站）都用同一个助理，只是传入的 ctx 不同。                                          │
// │   Entry point of the Pod.AI merchant assistant (internal agent). Platform-agnostic: Shopify,          │
// │   WooCommerce and any future channel (e.g. the POD website as a Pod.AI customer) call the same        │
// │   function with their own ctx.                                                                        │
// │                                                                                                      │
// │   一句话 → planner.js 做计划 → read 工具马上执行 → write 工具变成待确认操作（actions.js）→ reply.js 写回答 │
// │   message → plan → run read tools → stage write tools as proposals → compose the reply               │
// │                                                                                                      │
// │ ctx 参数 ctx fields:                                                                                  │
// │   tenantId  店铺的租户 id（必须，由渠道的身份验证得出，不能来自请求体）tenant from the channel's auth     │
// │   actor     谁在操作（写进记录）who is acting (audit)          lang  回答语言 en|de|fr|it|zh             │
// │   llm       套餐+设置是否允许 AI 规划 plan + settings allow the LLM planner                             │
// │   usage()   可选：本月用量 optional async () => { name, used, limit }                                  │
// │   shopName  可选：回复草稿落款 optional signature for reply drafts                                       │
// │   onPersonalData(tool) 可选：读取个人数据时调用（写访问日志）optional hook for the access log             │
// │ 要不要改 Edit?: 一般不用改。新渠道 → 只需要在渠道路由里组装 ctx 并调用 runAssistant / approve / reject。   │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
import { TOOLS, ToolError } from "./tools.js";
import { plan } from "./planner.js";
import { propose, audit } from "./actions.js";
import { compose, suggestionChips, pick } from "./reply.js";
import { getSettings, saveSettings } from "../engine/store.js";
export { listActions, approve, reject, readAudit, ActionError, ACTIONS, AUDIT } from "./actions.js";
export { TOOLS, toolCatalog } from "./tools.js";
export { sendWeeklyDigest, buildDigest, digestHistory, weekKey, DIGESTS } from "./digest.js";

/**
 * 处理商家的一句话 Handle one merchant message.
 * @returns {Promise<{reply:string, planner:string, results:Array, proposals:Array, failures:Array, suggestions:Array, language:string}>}
 */
export async function runAssistant(ctx, message) {
  if (!ctx?.tenantId) throw new Error("tenant_required");
  const text = String(message || "").trim().slice(0, 2000), lang = pick(ctx.lang);
  const { steps, dropped, planner } = await plan(text, ctx);
  const results = [], proposals = [], failures = dropped.map(d => ({ tool: d.tool, error: d.error }));
  let suggestions = [];
  for (const s of steps) {
    const t = TOOLS[s.tool];
    try {
      if (t.kind === "read") {
        if (t.personal) await ctx.onPersonalData?.(t.name);
        const result = await t.run(ctx, s.args);
        results.push({ tool: t.name, args: s.args, result });
        if (result?.suggestions) suggestions = suggestionChips(lang, result.suggestions);
      } else {
        const p = await propose(ctx, t.name, s.args, { message: text });
        p.ok ? proposals.push(p.action) : failures.push({ tool: t.name, error: p.error, detail: p.detail || null });
      }
    } catch (e) {
      if (!(e instanceof ToolError)) { console.error("[pod.ai assistant]", t.name, e.message); failures.push({ tool: t.name, error: "tool_failed" }); }
      else failures.push({ tool: t.name, error: e.code, detail: e.detail });
    }
  }
  // the weekly summary e-mail is written in the language the merchant uses the assistant in
  if (ctx.lang) { const s = await getSettings(ctx.tenantId); if (s.digest_lang !== lang) await saveSettings(ctx.tenantId, { digest_lang: lang }); }
  await audit(ctx.tenantId, { actor: ctx.actor, event: "ask", detail: `${planner}: ${steps.map(s => s.tool).join(",") || "-"}` });
  return { reply: compose({ lang, results, proposals, failures }), planner, language: lang, results, proposals, failures, suggestions };
}
