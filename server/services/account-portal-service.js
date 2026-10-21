// Customer "My account" portal: orders (scoped to the signed-in user — no IDOR), saved addresses (CRUD + default
// used for checkout prefill), profile, saved studio designs. Every function takes the authenticated user record.
import crypto from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { findRecord, listForTenant, updateRecord } from "../saas-store.js";
import { HttpError } from "../http/middleware.js";
import { publicUser } from "./account-service.js";

let thumbs = null;
function thumbFor(productId) {
  if (!thumbs) {
    thumbs = new Map();
    try {
      const cat = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../data/studio-catalog.json", import.meta.url)), "utf8"));
      for (const p of cat.products || []) if (p.mockup_photo?.src) thumbs.set(p.id, "/" + p.mockup_photo.src.replace(/^\/+/, ""));
    } catch {}
  }
  return thumbs.get(productId) || "";
}
const clean = (v, n = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const round2 = n => Math.round((Number(n) || 0) * 100) / 100;

/** Customer-facing status: awaiting_payment | paid | proof | in_production | shipped | delivered | cancelled. */
export function customerStatus(o) {
  const s = String(o.status || "").toLowerCase(), p = String(o.payment_status || "").toLowerCase();
  if (/cancel|refund|fail/.test(s) || p === "failed") return "cancelled";
  if (/deliver/.test(s)) return "delivered";
  if (/ship|transit|fulfil/.test(s)) return "shipped";
  if (/production|approved|printing/.test(s)) return "in_production";
  if (/proof/.test(s)) return "proof";
  if (p === "paid" || /paid/.test(s)) return "paid";
  return "awaiting_payment";
}
const STEPS = ["placed", "paid", "proof", "in_production", "shipped", "delivered"];
const RANK = { awaiting_payment: 0, paid: 1, proof: 2, in_production: 3, shipped: 4, delivered: 5 };

function lineOut(l) {
  return { product_id: l.product_id || "", sku: l.sku || "", name: l.name || l.sku || "Item", quantity: Number(l.quantity) || 1, material: l.material || "",
    material_id: l.material_id || "", unit_price: round2(l.unit_price), line_total: round2(l.line_total ?? l.unit_price * l.quantity), customization: l.customization || "", thumb: thumbFor(l.product_id) };
}
function total(o) { return round2(o.grand_total ?? o.revenue ?? 0); }
function summary(o) {
  const items = (o.items || []).map(lineOut);
  return { id: o.id, created_at: o.created_at, status: customerStatus(o), currency: o.currency || "CHF", total: total(o),
    item_count: items.reduce((a, b) => a + b.quantity, 0), items: items.slice(0, 4).map(({ name, thumb, quantity }) => ({ name, thumb, quantity })), payment_provider: o.payment_provider || "" };
}
async function ownOrders(user) {
  return (await listForTenant("orders", user.tenant_id)).filter(o => o.user_id && o.user_id === user.id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function listOrders(user, { q = "", status = "" } = {}) {
  const needle = clean(q, 80).toLowerCase();
  let rows = (await ownOrders(user)).map(o => ({ o, s: summary(o) }));
  if (status && status !== "all") rows = rows.filter(r => r.s.status === status);
  if (needle) rows = rows.filter(({ o }) => o.id.toLowerCase().includes(needle) || (o.items || []).some(l => String(l.name || "").toLowerCase().includes(needle) || String(l.sku || "").toLowerCase().includes(needle)));
  return { orders: rows.map(r => r.s) };
}

export async function orderDetail(user, id) {
  const o = await findRecord("orders", String(id || ""));
  // Same 404 for "missing" and "someone else's" so order ids cannot be probed.
  if (!o || o.tenant_id !== user.tenant_id || !o.user_id || o.user_id !== user.id) throw new HttpError(404, "order_not_found", "Order not found");
  const [events, proofs] = await Promise.all([listForTenant("order_events", user.tenant_id), listForTenant("proofs", user.tenant_id)]);
  const status = customerStatus(o), rank = RANK[status] ?? 0;
  const ev = events.filter(e => e.order_id === o.id);
  const at = type => ev.find(e => e.event_type === type)?.event_time || "";
  const proof = proofs.find(p => p.order_id === o.id);
  const when = { placed: o.created_at, paid: o.paid_at || "", proof: proof?.created_at || at("proof_ready"), in_production: proof?.approved_at || at("proof_approved") || o.production_at || "", shipped: o.shipped_at || at("shipped"), delivered: o.delivered_at || at("delivered") };
  const timeline = status === "cancelled"
    ? [{ step: "placed", done: true, at: o.created_at }, { step: "cancelled", done: true, at: o.updated_at || "" }]
    : STEPS.map((step, i) => ({ step, done: i === 0 || rank >= i, current: i === rank, at: (i === 0 || rank >= i) ? when[step] || "" : "" }));
  const a = o.shipping_address || {};
  return { order: { ...summary(o), items: (o.items || []).map(lineOut), subtotal: round2(o.subtotal), shipping: round2(o.shipping_charged), tax: round2(o.tax),
    shipping_method: typeof o.shipping_method === "object" ? clean(o.shipping_method?.label || o.shipping_method?.id) : clean(o.shipping_method),
    payment: { provider: o.payment_provider || "", status: o.payment_status || "pending" }, tracking: o.tracking_number ? { number: o.tracking_number, url: o.tracking_url || "" } : null,
    shipping_address: { name: a.name || "", address1: a.address1 || "", address2: a.address2 || "", postal_code: a.postal_code || "", city: a.city || "", country: a.country || "", phone: a.phone || "" },
    proof: proof ? { status: proof.status, approval_url: proof.proof_url && proof.token ? `/proof.html?token=${proof.token}` : "" } : null, timeline } };
}

// ---- addresses ----
const COUNTRY = /^[A-Z]{2}$/;
function addrIn(b = {}) {
  const x = { label: clean(b.label, 40), name: clean(b.name, 120), address1: clean(b.address1), address2: clean(b.address2), postal_code: clean(b.postal_code, 32), city: clean(b.city, 100), country: clean(b.country, 3).toUpperCase(), phone: clean(b.phone, 40) };
  const missing = ["name", "address1", "postal_code", "city"].filter(k => !x[k]);
  if (missing.length) throw new HttpError(400, "invalid_address", `Missing: ${missing.join(", ")}`);
  if (!COUNTRY.test(x.country)) throw new HttpError(400, "invalid_country", "Country must be a 2-letter code");
  return x;
}
function addressesOf(u) {
  if (Array.isArray(u.addresses)) return u.addresses;
  // Legacy: a single shipping_address (e.g. from the Shop login) becomes the default entry.
  const s = u.shipping_address;
  return s && s.address1 ? [{ id: "adr_legacy", label: "", name: s.name || u.name || "", address1: s.address1, address2: s.address2 || "", postal_code: s.postal_code || "", city: s.city || "", country: s.country || "", phone: s.phone || "", is_default: true }] : [];
}
async function saveAddresses(user, list) {
  if (list.length && !list.some(a => a.is_default)) list[0].is_default = true;
  const def = list.find(a => a.is_default);
  const shipping_address = def ? (({ id, label, is_default, ...rest }) => rest)(def) : null;
  const u = await updateRecord("customer_accounts", user.id, { addresses: list, shipping_address, updated_at: new Date().toISOString() });
  Object.assign(user, { addresses: u.addresses, shipping_address: u.shipping_address });
  return { addresses: list };
}
export async function listAddresses(user) { const u = await findRecord("customer_accounts", user.id); return { addresses: addressesOf(u || user) }; }
export async function createAddress(user, body) {
  const list = (await listAddresses(user)).addresses.map(a => ({ ...a }));
  if (list.length >= 20) throw new HttpError(400, "too_many_addresses", "At most 20 addresses");
  const a = { id: `adr_${crypto.randomBytes(6).toString("hex")}`, ...addrIn(body), is_default: !!body?.is_default || !list.length };
  if (a.is_default) list.forEach(x => (x.is_default = false));
  list.push(a);
  await saveAddresses(user, list);
  return { address: a };
}
async function withAddress(user, id, fn) {
  const list = (await listAddresses(user)).addresses.map(a => ({ ...a }));
  const i = list.findIndex(a => a.id === id);
  if (i < 0) throw new HttpError(404, "address_not_found", "Address not found");
  const out = fn(list, i);
  return { ...(await saveAddresses(user, out.list || list)), ...(out.address ? { address: out.address } : {}) };
}
export const updateAddress = (user, id, body) => withAddress(user, id, (list, i) => {
  list[i] = { ...list[i], ...addrIn({ ...list[i], ...body }) };
  if (body?.is_default) { list.forEach(x => (x.is_default = false)); list[i].is_default = true; }
  return { address: list[i] };
});
export const setDefaultAddress = (user, id) => withAddress(user, id, (list, i) => { list.forEach(x => (x.is_default = false)); list[i].is_default = true; return { address: list[i] }; });
export const deleteAddress = (user, id) => withAddress(user, id, (list, i) => ({ list: list.filter((_, j) => j !== i) }));

// ---- profile / designs / overview ----
export async function profile(user) {
  const u = (await findRecord("customer_accounts", user.id)) || user;
  const ids = u.identities || {};
  return { user: publicUser(u), providers: Object.entries(ids).map(([provider, x]) => ({ provider, email: x?.email || u.email, linked_at: x?.linked_at || x?.created_at || "" })), last_login_at: u.last_login_at || "" };
}
export async function updateProfileName(user, name) {
  const n = clean(name, 120);
  if (!n) throw new HttpError(400, "invalid_name", "Name is required");
  await updateRecord("customer_accounts", user.id, { name: n, updated_at: new Date().toISOString() });
  return profile(user);
}
export async function designs(user) {
  const rows = (await listForTenant("studio_projects", user.tenant_id)).filter(p => p.user_id && p.user_id === user.id)
    .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
  return { designs: rows.map(p => ({ id: p.id, name: clean(p.name || p.title || p.product_name || p.product_id || p.scenario_id || "Custom design", 120), product_id: p.product_id || "", thumb: thumbFor(p.product_id), status: p.status || "draft", updated_at: p.updated_at || p.created_at, link: `/studio.html?project=${encodeURIComponent(p.id)}` })) };
}
export async function overview(user) {
  const [orders, d, addr] = await Promise.all([ownOrders(user), designs(user), listAddresses(user)]);
  const open = orders.filter(o => !["delivered", "cancelled"].includes(customerStatus(o)));
  return { user: publicUser(user), counts: { orders: orders.length, open: open.length, designs: d.designs.length, addresses: addr.addresses.length },
    recent_orders: orders.slice(0, 3).map(summary), default_address: addr.addresses.find(a => a.is_default) || null, recent_designs: d.designs.slice(0, 3) };
}
