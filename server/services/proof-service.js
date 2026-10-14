import crypto from "node:crypto";
import { addRecord, findRecord, findWhere, listForTenant, updateRecord } from "../saas-store.js";
import { HttpError } from "../http/middleware.js";
import { sendEmail } from "./email-service.js";
import { baseUrl } from "../config.js";

const isToken = t => typeof t === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(t);

export async function createProofForOrder(order) {
  const existing = await findWhere("proofs", p => p.order_id === order.id);
  if (existing) return existing;
  return addRecord("proofs", {
    id: `proof_${crypto.randomBytes(5).toString("hex")}`,
    tenant_id: order.tenant_id,
    order_id: order.id,
    token: crypto.randomBytes(24).toString("base64url"),
    status: "Pending",
    proof_url: "",
    material: [...new Set((order.items || []).map(i => i.material).filter(Boolean))].join(" / "),
    created_at: new Date().toISOString()
  });
}

/** Public view: only what the customer needs to approve the proof — no email, address or costs. */
export async function publicProof(token) {
  if (!isToken(token)) throw new HttpError(404, "proof_not_found", "Proof not found");
  const proof = await findWhere("proofs", p => p.token === token);
  if (!proof) throw new HttpError(404, "proof_not_found", "Proof not found");
  const order = await findRecord("orders", proof.order_id);
  return {
    proof: { status: proof.status, proof_url: proof.proof_url || "", material: proof.material || "" },
    order: { id: proof.order_id, items: (order?.items || []).map(i => ({ name: i.name, quantity: i.quantity, material: i.material || "" })) }
  };
}

export async function approvePublicProof(token) {
  if (!isToken(token)) throw new HttpError(404, "proof_not_found", "Proof not found");
  const proof = await findWhere("proofs", p => p.token === token);
  if (!proof) throw new HttpError(404, "proof_not_found", "Proof not found");
  if (proof.status === "Approved") return { ok: true, status: "Approved" };
  if (!proof.proof_url) throw new HttpError(409, "proof_not_ready", "效果图尚未上传，暂时无法确认");
  const now = new Date().toISOString();
  await updateRecord("proofs", proof.id, { status: "Approved", approved_at: now, updated_at: now });
  const order = await findRecord("orders", proof.order_id);
  if (order) {
    await updateRecord("orders", proof.order_id, { status: "Approved", updated_at: now });
    await addRecord("order_events", { id: `evt_${crypto.randomBytes(6).toString("hex")}`, tenant_id: order.tenant_id, order_id: order.id, event_type: "proof_approved", source: "customer", payload: { proof_id: proof.id }, event_time: now });
  }
  if (order?.customer_email) await sendEmail({ tenantId: order.tenant_id, userId: order.user_id || null, to: order.customer_email, type: "proof_approved", related_id: order.id, subject: `Proof approved · ${order.id}`, text: `Your proof for ${order.id} is approved. We will continue with the next production step.`, html: `<p>Your proof for <b>${order.id}</b> is approved.</p><p>We will continue with the next production step.</p><p><a href="${baseUrl()}/account.html">View order status</a></p>` });
  return { ok: true, status: "Approved" };
}


export async function requestPublicProofChanges(token, note = "") {
  if (!isToken(token)) throw new HttpError(404, "proof_not_found", "Proof not found");
  const proof = await findWhere("proofs", p => p.token === token);
  if (!proof) throw new HttpError(404, "proof_not_found", "Proof not found");
  const order = await findRecord("orders", proof.order_id);
  if (!order) throw new HttpError(404, "order_not_found", "Order not found");
  const cleanNote = String(note || "").trim().slice(0, 1000);
  if (cleanNote.length < 3) throw new HttpError(400, "change_note_required", "请简单说明需要修改的内容");
  const now = new Date().toISOString();
  await updateRecord("proofs", proof.id, { status: "ChangesRequested", change_note: cleanNote, updated_at: now });
  await updateRecord("orders", order.id, { status: "Changes requested", updated_at: now });
  await addRecord("order_events", { id: `evt_${crypto.randomBytes(6).toString("hex")}`, tenant_id: order.tenant_id, order_id: order.id, event_type: "proof_changes_requested", source: "customer", payload: { proof_id: proof.id, note: cleanNote }, event_time: now });
  if (order.customer_email) await sendEmail({ tenantId: order.tenant_id, userId: order.user_id || null, to: order.customer_email, type: "proof_changes_requested", related_id: order.id, subject: `Proof changes requested · ${order.id}`, text: `We received your proof changes: ${cleanNote}. We will prepare an updated proof.`, html: `<p>We received your requested changes for <b>${order.id}</b>.</p><p>${cleanNote.replace(/[<>&]/g, "")}</p><p>We will prepare an updated proof and email you again.</p><p><a href="${baseUrl()}/account.html">View order status</a></p>` });
  return { ok: true, status: "ChangesRequested" };
}
export async function listProofs(tenantId) {
  return listForTenant("proofs", tenantId);
}

/** Admin: attach the rendered proof and mark it as sent to the customer. */
export async function updateProof(tenantId, id, { proof_url, material, status } = {}) {
  const proof = (await listForTenant("proofs", tenantId)).find(p => p.id === id);
  if (!proof) return null;
  const patch = { updated_at: new Date().toISOString() };
  if (proof_url !== undefined) {
    const url = String(proof_url).trim();
    if (url && !/^(https:\/\/|\/)/i.test(url)) throw new HttpError(400, "invalid_proof_url", "proof_url must be https:// or a site-relative path");
    patch.proof_url = url;
    if (url && ["Pending", "ChangesRequested"].includes(proof.status)) patch.status = "Sent";
  }
  if (material !== undefined) patch.material = String(material).slice(0, 200);
  if (status && ["Pending", "Sent", "ChangesRequested"].includes(status)) patch.status = status;
  const updated = await updateRecord("proofs", id, patch);
  if (updated?.proof_url && (patch.status === "Sent" || (proof.status === "Pending" && patch.proof_url))) {
    const order = await findRecord("orders", proof.order_id);
    if (order) {
      const now = new Date().toISOString();
      await updateRecord("orders", order.id, { status: "Proof ready", updated_at: now });
      await addRecord("order_events", { id: `evt_${crypto.randomBytes(6).toString("hex")}`, tenant_id: tenantId, order_id: order.id, event_type: "proof_ready", source: "admin", payload: { proof_id: proof.id, proof_url: updated.proof_url }, event_time: now });
    }
    if (order?.customer_email) await sendEmail({ tenantId, userId: order.user_id || null, to: order.customer_email, type: "proof_ready", related_id: order.id, subject: `Your proof is ready · ${order.id}`, text: `Your proof is ready for review: ${baseUrl()}/proof.html?token=${proof.token}`, html: `<p>Your proof for <b>${order.id}</b> is ready.</p><p><a href="${baseUrl()}/proof.html?token=${proof.token}">Review and approve proof</a></p>` });
  }
  return updated;
}
