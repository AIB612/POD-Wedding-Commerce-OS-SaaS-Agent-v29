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
    const text = `${inv.names || "Your wedding"}\n\nName: ${data.name}\nAttending: ${data.attending ? "yes" : "no"}\nParty size: ${data.party_size}\nDietary: ${data.dietary || "-"}\nContact: ${data.contact || "-"}`;
    sendEmail({ tenantId: inv.tenant_id, userId: inv.user_id, to: inv.notify_email, subject, text, type: "invitation_rsvp", related_id: inv.id }).catch(e => console.error("[rsvp] notify failed:", e.message));
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
