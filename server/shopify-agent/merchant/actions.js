// ┌─ 文件卡片 File card ─────────────────────────────────────────────────────────────────────────────────┐
// │ 这是什么 What: 「待确认操作」+「操作记录」。商家助理所有会改数据的事都走这里。                             │
// │   Proposed actions + audit trail. Every change the assistant wants to make goes through here:        │
// │   propose（生成，检查一次）→ 商家点确认 approve（再检查一次，然后执行）或 拒绝 reject；7 天没处理 → 过期。  │
// │   propose (checked) → merchant approves (checked again, then executed) or rejects; 7 days → expired.  │
// │   同一个操作只会执行一次。An action runs at most once (status guard + in-process lock).               │
// │ 数据 Data: podai_merchant_actions（操作）· podai_merchant_audit（记录，不含聊天内容 no chat text）       │
// │   两个集合都加密保存（security/records.js），GDPR 删除 / 保留期见 gdpr.js。                              │
// │ 要不要改 Edit?: 一般不用改。✎ 可以改：EXPIRE_DAYS、MAX_OPEN。                                            │
// └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
import crypto from "node:crypto";
import { addRecord, findRecord, listForTenant, updateRecord, removeWhere } from "../../saas-store.js";
import { TOOLS, ToolError } from "./tools.js";

export const ACTIONS = "podai_merchant_actions", AUDIT = "podai_merchant_audit";
export const EXPIRE_DAYS = 7;      // ✎ 可以改：多少天没确认就过期 days before an unconfirmed proposal expires
export const MAX_OPEN = 25;        // ✎ 可以改：每家店最多同时有多少个待确认操作 max open proposals per shop
const MAX_AUDIT = 2000;            // 每家店保留的记录条数 audit rows kept per shop (oldest dropped)
const now = () => new Date().toISOString();
const id = p => `${p}_${crypto.randomBytes(6).toString("hex")}`;
const running = new Set();

/** 写一条记录（不含聊天文字或邮箱）Audit row — tool names, ids and outcome only. */
export async function audit(tenantId, { actor, event, tool = null, action_id = null, detail = null }) {
  await addRecord(AUDIT, { id: id("au"), tenant_id: tenantId, at: now(), actor: String(actor || "unknown").slice(0, 80), event, tool, action_id, detail: detail ? String(detail).slice(0, 200) : null });
  const rows = await listForTenant(AUDIT, tenantId);
  if (rows.length > MAX_AUDIT) { const drop = new Set(rows.sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(0, rows.length - MAX_AUDIT).map(r => r.id)); await removeWhere(AUDIT, r => drop.has(r.id)); }
}
export async function readAudit(tenantId, { limit = 100 } = {}) {
  return (await listForTenant(AUDIT, tenantId)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, Math.min(500, limit)).map(({ tenant_id, ...r }) => r);
}

/** 商家看到的样子 What the merchant sees. */
export const actionView = a => ({ id: a.id, tool: a.tool, args: a.args, preview: a.preview, status: a.status, created_at: a.created_at, decided_at: a.decided_at || null,
  decided_by: a.decided_by || null, result: a.result || null, error: a.error || null, expires_at: a.expires_at });

async function expireOld(tenantId) {
  const t = Date.now();
  for (const a of await listForTenant(ACTIONS, tenantId)) if (a.status === "proposed" && Date.parse(a.expires_at) < t) await updateRecord(ACTIONS, a.id, { status: "expired", decided_at: now() });
}

/**
 * 生成待确认操作 Propose a write. Runs the tool's preview (checks) now; nothing is changed.
 * @returns {Promise<{ok:true, action:object}|{ok:false, error:string, detail?:object}>}
 */
export async function propose(ctx, tool, args, { message = "" } = {}) {
  const t = TOOLS[tool];
  if (!t || t.kind !== "write") return { ok: false, error: "not_a_write_tool" };
  await expireOld(ctx.tenantId);
  const open = (await listForTenant(ACTIONS, ctx.tenantId)).filter(a => a.status === "proposed");
  if (open.length >= MAX_OPEN) return { ok: false, error: "too_many_open_actions" };
  // 同样的操作已经在等确认 → 不重复生成 Same proposal already waiting → return it instead of a duplicate.
  const dup = open.find(a => a.tool === tool && JSON.stringify(a.args) === JSON.stringify(args));
  if (dup) return { ok: true, action: actionView(dup), duplicate: true };
  let preview;
  try { preview = await t.preview(ctx, args); }
  catch (e) { if (e instanceof ToolError) return { ok: false, error: e.code, detail: e.detail }; throw e; }
  const row = { id: id("act"), tenant_id: ctx.tenantId, tool, args, preview, status: "proposed", requested_by: String(ctx.actor || "").slice(0, 80), source: ctx.source || "assistant",
    request: String(message).slice(0, 300), created_at: now(), expires_at: new Date(Date.now() + EXPIRE_DAYS * 864e5).toISOString() };
  await addRecord(ACTIONS, row);
  await audit(ctx.tenantId, { actor: ctx.actor, event: "proposed", tool, action_id: row.id });
  return { ok: true, action: actionView(row) };
}

export async function listActions(tenantId, { status } = {}) {
  await expireOld(tenantId);
  return (await listForTenant(ACTIONS, tenantId)).filter(a => !status || a.status === status).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 100).map(actionView);
}

class ActionError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
async function load(tenantId, actionId) {
  const a = /^act_[a-f0-9]{12}$/.test(String(actionId || "")) ? await findRecord(ACTIONS, actionId) : null;
  if (!a || a.tenant_id !== tenantId) throw new ActionError(404, "action_not_found");
  if (a.status === "proposed" && Date.parse(a.expires_at) < Date.now()) { await updateRecord(ACTIONS, a.id, { status: "expired", decided_at: now() }); throw new ActionError(409, "action_expired"); }
  if (a.status !== "proposed") throw new ActionError(409, `action_${a.status}`);
  return a;
}

/**
 * 商家确认 → 执行 Merchant confirmed → execute once.
 * The tool's preview runs again first: if the data changed since the proposal the action fails safely.
 */
export async function approve(ctx, actionId) {
  if (running.has(actionId)) throw new ActionError(409, "action_running");
  running.add(actionId);
  try {
    const a = await load(ctx.tenantId, actionId), t = TOOLS[a.tool];
    // 多进程保护：先写入自己的认领号，再读回确认是自己 → 两个服务器进程同时确认时只有一个执行。
    // Cross-process guard (the host runs 2 workers): claim, re-read, continue only if the claim is still ours.
    const claim = crypto.randomBytes(8).toString("hex");
    await updateRecord(ACTIONS, a.id, { status: "running", claim, decided_by: String(ctx.actor || "").slice(0, 80), decided_at: now() });
    if ((await findRecord(ACTIONS, a.id))?.claim !== claim) throw new ActionError(409, "action_running");
    await audit(ctx.tenantId, { actor: ctx.actor, event: "approved", tool: a.tool, action_id: a.id });
    try {
      const fresh = await t.preview(ctx, a.args);
      const result = await t.run(ctx, a.args, { ...fresh, ...(a.preview?.from ? { from: a.preview.from } : {}) });
      await updateRecord(ACTIONS, a.id, { status: "done", result, done_at: now() });
      await audit(ctx.tenantId, { actor: ctx.actor, event: "executed", tool: a.tool, action_id: a.id });
    } catch (e) {
      const code = e instanceof ToolError ? e.code : "execution_failed";
      if (!(e instanceof ToolError)) console.error("[pod.ai assistant] action failed", a.tool, e.message);
      await updateRecord(ACTIONS, a.id, { status: "failed", error: code, done_at: now() });
      await audit(ctx.tenantId, { actor: ctx.actor, event: "failed", tool: a.tool, action_id: a.id, detail: code });
    }
    return actionView(await findRecord(ACTIONS, a.id));
  } finally { running.delete(actionId); }
}

/** 商家拒绝 Merchant rejected — nothing runs. */
export async function reject(ctx, actionId) {
  const a = await load(ctx.tenantId, actionId);
  await updateRecord(ACTIONS, a.id, { status: "rejected", decided_by: String(ctx.actor || "").slice(0, 80), decided_at: now() });
  await audit(ctx.tenantId, { actor: ctx.actor, event: "rejected", tool: a.tool, action_id: a.id });
  return actionView(await findRecord(ACTIONS, a.id));
}
export { ActionError };
