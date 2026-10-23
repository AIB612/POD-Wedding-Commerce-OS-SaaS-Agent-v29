// Minimal built-in RSVP for published wedding invitation sites.
// Guests post from the sandboxed /generated page; couples read their own responses in account.html.
import crypto from "node:crypto";
import { addRecord, findRecord, getState, updateRecord } from "../saas-store.js";
import { HttpError } from "../http/middleware.js";
import { sendEmail } from "./email-service.js";
import { toCsv } from "./data-exchange-service.js";

export const RSVP_LIMITS = { name: 80, dietary: 300, contact: 120, maxParty: 10 };
const ID_RE = /^[a-f0-9]{12}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Validate a guest submission. Throws HttpError(400) with a field-specific code. */
export function validateRsvp(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid_body");
  if (body.website) throw new HttpError(400, "invalid_body"); // honeypot field, invisible to humans
  const rawName = String(body.name ?? "").trim();
  if (!rawName) throw new HttpError(400, "name_required");
  if (rawName.length > RSVP_LIMITS.name) throw new HttpError(400, "name_too_long");
  const a = body.attending;
  const attending = a === true || a === "yes" || a === "true" ? true : a === false || a === "no" || a === "false" ? false : null;
  if (attending === null) throw new HttpError(400, "attending_required");
  let party = attending ? Number(body.party_size ?? 1) : 0;
  if (!Number.isInteger(party) || (attending && (party < 1 || party > RSVP_LIMITS.maxParty))) throw new HttpError(400, "invalid_party_size");
  const dietary = String(body.dietary ?? "");
  if (dietary.length > RSVP_LIMITS.dietary) throw new HttpError(400, "dietary_too_long");
  const rawContact = String(body.contact ?? "").trim();
  if (rawContact.length > RSVP_LIMITS.contact) throw new HttpError(400, "contact_too_long");
  const contact = clean(rawContact, RSVP_LIMITS.contact);
  if (contact && !EMAIL_RE.test(contact) && !(/^[+()\d\s./-]{5,30}$/.test(contact) && contact.replace(/\D/g, "").length >= 5)) throw new HttpError(400, "invalid_contact");
  return { name: clean(rawName, RSVP_LIMITS.name), attending, party_size: party, dietary: clean(dietary, RSVP_LIMITS.dietary), contact };
}

/** One guest = same invitation + same normalized name + same optional contact (e-mail lowercased, phone digits only). */
export function guestKey(r) {
  const name = String(r.name || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const c = String(r.contact || "").trim();
  return `${name}|${c.includes("@") ? c.toLowerCase() : c.replace(/\D/g, "")}`;
}

async function publishedInvitation(id) {
  if (!ID_RE.test(String(id || ""))) return null;
  const inv = await findRecord("invitations", id);
  return inv && inv.status === "published" ? inv : null;
}

export async function submitRsvp(invitationId, body) {
  const inv = await publishedInvitation(invitationId);
  if (!inv) throw new HttpError(404, "invitation_not_found");
  if (inv.rsvp_enabled === false) throw new HttpError(404, "rsvp_disabled");
  const data = validateRsvp(body);
  const now = new Date().toISOString(), key = guestKey(data);
  // A guest re-submitting (same name + same contact) overwrites the previous answer instead of adding a duplicate row.
  const prev = ((await getState()).invitation_rsvps || []).filter(r => r.invitation_id === inv.id && guestKey(r) === key)
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))[0];
  const row = prev ? await updateRecord("invitation_rsvps", prev.id, { ...data, updated_at: now })
    : await addRecord("invitation_rsvps", { id: `rsvp_${crypto.randomBytes(6).toString("hex")}`, tenant_id: inv.tenant_id, invitation_id: inv.id, ...data, created_at: now, updated_at: now });
  // Optional notification. sendEmail() records "not_configured" without throwing when no provider is set.
  if (inv.notify_email && EMAIL_RE.test(inv.notify_email)) {
    const subject = `RSVP${prev ? " (updated)" : ""} · ${data.name} · ${data.attending ? `yes (${data.party_size})` : "no"}`;
    const s = await getState();
    const seen = new Set();
    const all = (s.invitation_rsvps || []).filter(r => r.invitation_id === inv.id)
      .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))
      .filter(r => { const k = guestKey(r); return seen.has(k) ? false : seen.add(k); });
    const yes = all.filter(r => r.attending);
    const counts = { responses: all.length, attending: yes.length, declined: all.length - yes.length, guests: yes.reduce((n, r) => n + (r.party_size || 0), 0) };
    const attendingLabel = data.attending ? "Yes" : "No";
    const attendingColor = data.attending ? "#3d6b4f" : "#a65d57";
    const text = [
      inv.names || "Your wedding",
      inv.date ? `Date: ${inv.date}` : "",
      "",
      "New RSVP",
      `Name: ${data.name}`,
      `Attending: ${attendingLabel}`,
      `Party size: ${data.party_size}`,
      `Dietary: ${data.dietary || "—"}`,
      `Contact: ${data.contact || "—"}`,
      "",
      "Current totals",
      `Responses: ${counts.responses}`,
      `Attending: ${counts.attending}`,
      `Declined: ${counts.declined}`,
      `Total guests: ${counts.guests}`,
      "",
      "All details are in this email."
    ].filter(Boolean).join("\n");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf8f5;font-family:Georgia,'Times New Roman',serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf8f5"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">
<tr><td style="background:#2f3a45;padding:28px 32px;text-align:center">
<p style="margin:0;font-size:11px;letter-spacing:3px;color:#c9b99a;text-transform:uppercase">Wedding RSVP</p>
<h1 style="margin:8px 0 0;font-size:26px;font-weight:400;color:#ffffff;font-family:Georgia,serif">${inv.names || "Your wedding"}</h1>
${inv.date ? `<p style="margin:6px 0 0;font-size:13px;color:#b8c0c8">${inv.date}</p>` : ""}
</td></tr>
<tr><td style="padding:28px 32px">
<p style="margin:0 0 16px;font-size:13px;letter-spacing:1px;color:#8a7a66;text-transform:uppercase">New reply</p>
<table role="presentation" width="100%" style="font-size:15px;line-height:1.6;color:#2a2a2a">
<tr><td style="padding:6px 0;color:#888;width:110px">Name</td><td style="padding:6px 0;font-weight:500">${data.name}</td></tr>
<tr><td style="padding:6px 0;color:#888">Attending</td><td style="padding:6px 0;color:${attendingColor};font-weight:500">${attendingLabel}</td></tr>
<tr><td style="padding:6px 0;color:#888">Party size</td><td style="padding:6px 0">${data.party_size}</td></tr>
<tr><td style="padding:6px 0;color:#888">Dietary</td><td style="padding:6px 0">${data.dietary || "—"}</td></tr>
<tr><td style="padding:6px 0;color:#888">Contact</td><td style="padding:6px 0">${data.contact || "—"}</td></tr>
</table>
</td></tr>
<tr><td style="padding:0 32px 28px">
<div style="background:#f7f5f2;border-radius:8px;padding:16px 20px">
<p style="margin:0 0 12px;font-size:12px;letter-spacing:1px;color:#8a7a66;text-transform:uppercase">Current totals</p>
<table role="presentation" width="100%" style="font-size:14px;color:#2a2a2a">
<tr>
<td style="text-align:center;padding:8px"><div style="font-size:22px;font-weight:500;color:#2f3a45">${counts.responses}</div><div style="font-size:11px;color:#888;margin-top:2px">Responses</div></td>
<td style="text-align:center;padding:8px"><div style="font-size:22px;font-weight:500;color:#3d6b4f">${counts.attending}</div><div style="font-size:11px;color:#888;margin-top:2px">Attending</div></td>
<td style="text-align:center;padding:8px"><div style="font-size:22px;font-weight:500;color:#a65d57">${counts.declined}</div><div style="font-size:11px;color:#888;margin-top:2px">Declined</div></td>
<td style="text-align:center;padding:8px"><div style="font-size:22px;font-weight:500;color:#2f3a45">${counts.guests}</div><div style="font-size:11px;color:#888;margin-top:2px">Guests</div></td>
</tr>
</table>
</div>
</td></tr>
<tr><td style="padding:16px 32px 24px;border-top:1px solid #eee;text-align:center">
<p style="margin:0;font-size:12px;color:#999">All details are included in this email.<br>No further action needed.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
    sendEmail({ tenantId: inv.tenant_id, userId: inv.user_id, to: inv.notify_email, subject, text, html, type: "invitation_rsvp", related_id: inv.id }).catch(e => console.error("[rsvp] notify failed:", e.message));
  }
  return { ok: true, id: row.id, attending: data.attending, party_size: data.party_size, updated: !!prev };
}

/** Responses for one invitation, only for the couple that published it. */
export async function listRsvps(tenantId, userId, invitationId) {
  // Owners still see answers after taking the site offline.
  const inv = ID_RE.test(String(invitationId || "")) ? await findRecord("invitations", invitationId) : null;
  if (!inv || inv.tenant_id !== tenantId || !userId || inv.user_id !== userId) throw new HttpError(404, "invitation_not_found");
  const s = await getState();
  // One row per guest, newest answer wins (also collapses duplicates stored before updates existed).
  const seen = new Set();
  const rows = (s.invitation_rsvps || []).filter(r => r.invitation_id === inv.id)
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)))
    .filter(r => { const k = guestKey(r); return seen.has(k) ? false : seen.add(k); })
    .map(({ tenant_id, ...r }) => ({ ...r, updated_at: r.updated_at || r.created_at }));
  const yes = rows.filter(r => r.attending);
  return { invitation: { id: inv.id, names: inv.names, date: inv.date, url: inv.url, status: inv.status }, rsvps: rows,
    counts: { responses: rows.length, attending: yes.length, declined: rows.length - yes.length, guests: yes.reduce((n, r) => n + (r.party_size || 0), 0) } };
}

export function rsvpCsv(list) {
  return "\ufeff" + toCsv([["name", "attending", "party_size", "dietary", "contact", "created_at", "updated_at"], ...list.rsvps.map(r => [r.name, r.attending ? "yes" : "no", r.party_size, r.dietary, r.contact || "", r.created_at, r.updated_at])]);
}
