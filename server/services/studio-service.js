// POD Studio: scenario → kit → one design on every product → server-side quote → project / quote request.
// Prices are always recomputed here with the same studio-pricing.js the browser uses; client numbers are ignored.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import "../../studio-pricing.js";
import { addRecord, findRecord, findWhere, updateRecord, removeWhere, getState } from "../saas-store.js";
import { encryptBuffer, decryptBuffer } from "../utils/blob-crypto.js";
import { HttpError } from "../http/middleware.js";
import { createProofForOrder } from "./proof-service.js";
import { ensureCustomer } from "./account-service.js";
import { sendEmail } from "./email-service.js";
import { createTask } from "./task-service.js";
import { baseUrl } from "../config.js";

const catalog = JSON.parse(fs.readFileSync(new URL("../data/studio-catalog.json", import.meta.url), "utf8"));
import { withPrices } from "./price-list-service.js";
// Catalog + live admin price list (sell prices); every server-side quote reads prices from here.
export const studioCatalog = () => withPrices(catalog);
const MAX_DESIGN_BYTES = 8 * 1024 * 1024;
const MAGIC = { png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], webp: [0x52, 0x49, 0x46, 0x46] };
const PLACEMENT_MODES = new Set(["contain", "cover", "tile"]);
export const isProjectId = id => /^sp_[a-f0-9]{20}$/.test(String(id || ""));
// Privacy: designs are stored encrypted outside the public folder and every project expires.
const DAY = 864e5;
export const retention = () => ({ draftDays: Number(process.env.STUDIO_RETENTION_DAYS || 30), quoteDays: Number(process.env.STUDIO_QUOTE_RETENTION_DAYS || 90) });
const privateDir = generatedDir => path.join(generatedDir, ".private-studio");   // dot-folder: never served by express.static
const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const expired = p => p.expires_at && Date.parse(p.expires_at) < Date.now();
export const projectExpired = expired;
let privateRoot = null; // set by the router (generatedDir) so checkout can look up stored mockups
export const setStudioDir = generatedDir => { privateRoot = privateDir(generatedDir); };
const isPid = pid => catalog.products.some(p => p.id === pid);
export const mockupUrl = (id, pid) => `/api/studio/projects/${id}/mockup/${encodeURIComponent(pid)}`;
const mockupFile = (dir, id, pid) => path.join(dir, `${id}.mockup.${pid}.enc`);
export async function hasMockup(id, pid) { if (!privateRoot || !isProjectId(id) || !isPid(pid)) return false; try { await fsp.access(mockupFile(privateRoot, id, pid)); return true; } catch { return false; } }

/** Small per-product mockup thumbnail (rendered client-side) stored server-side, encrypted like the design. */
export async function saveMockup({ id, pid, dataUrl, generatedDir, tenantId, userId }) {
  const p = await ownedProject(id, { tenantId, userId });
  if (!isPid(pid) || !(p.items || []).some(i => i.product_id === pid)) throw new HttpError(400, "unknown_product", "Product is not part of this project");
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) throw new HttpError(400, "invalid_mockup", "Mockup must be a PNG, JPEG or WebP data URL");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 400 * 1024) throw new HttpError(413, "mockup_too_large", "Mockup thumbnail must be 400 KB or smaller");
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  if (!MAGIC[ext].every((b, i) => buf[i] === b)) throw new HttpError(400, "invalid_mockup", "File content does not match its image type");
  const dir = privateDir(generatedDir); await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(mockupFile(dir, id, pid), encryptBuffer(Buffer.concat([Buffer.from(MIME[ext] + "\n"), buf])));
  return { url: mockupUrl(id, pid) };
}
export async function readMockup({ id, pid, generatedDir }) {
  if (!isProjectId(id) || !isPid(pid)) throw new HttpError(404, "not_found", "Not found");
  let raw; try { raw = decryptBuffer(await fsp.readFile(mockupFile(privateDir(generatedDir), id, pid))); } catch { throw new HttpError(404, "not_found", "Not found"); }
  const nl = raw.indexOf(10); return { mime: raw.subarray(0, nl).toString(), data: raw.subarray(nl + 1) };
}
async function ownedProject(id, { tenantId, userId }) {
  if (!isProjectId(id)) throw new HttpError(404, "project_not_found", "Project not found");
  const p = await findRecord("studio_projects", id);
  if (!p || expired(p) || (tenantId && p.tenant_id !== tenantId)) throw new HttpError(404, "project_not_found", "Project not found");
  if (p.user_id && p.user_id !== userId) throw new HttpError(403, "project_forbidden", "This project belongs to another account");
  return p;
}
/** Owner check used by the mockup GET route. */
export async function projectAccess(id, { tenantId, userId }) { return ownedProject(id, { tenantId, userId }); }

function cleanInput(body = {}) {
  const sc = catalog.scenarios.find(s => s.id === body.scenario_id);
  const kit = sc?.kits.find(k => k.id === body.kit_id);
  if ((body.scenario_id && !sc) || (body.kit_id && !kit)) throw new HttpError(400, "invalid_kit", "Unknown scenario / kit");
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 30).filter(i => catalog.products.some(p => p.id === i?.product_id)).map(i => ({
    product_id: i.product_id, qty: Math.min(10000, Math.max(1, Math.round(Number(i.qty) || 1))),
    placement: { mode: PLACEMENT_MODES.has(i.placement?.mode) ? i.placement.mode : null, scale: Math.min(3, Math.max(0.2, Number(i.placement?.scale) || 1)),
      dx: Math.min(1, Math.max(-1, Number(i.placement?.dx) || 0)), dy: Math.min(1, Math.max(-1, Number(i.placement?.dy) || 0)),
      color: /^#[0-9a-f]{6}$/i.test(i.placement?.color || "") ? i.placement.color : null }
  }));
  if (!items.length) throw new HttpError(400, "no_items", "Select at least one product");
  const buyer_type = catalog.buyer_types.some(b => b.id === body.buyer_type) ? body.buyer_type : "company";
  const f = body.fulfillment || {}, cc = v => (/^[A-Za-z]{2}$/.test(String(v || "")) ? String(v).toUpperCase() : null);
  const modeOk = buyer_type === "merchant" ? ["dropship"] : buyer_type === "company" ? ["bulk", "multi"] : ["bulk"];
  const fulfillment = {
    mode: modeOk.includes(f.mode) ? f.mode : modeOk[0], address_country: cc(f.address_country) || "CH", sample_country: cc(f.sample_country) || "CH",
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(String(f.deadline || "")) ? f.deadline : null,
    recipients: (Array.isArray(f.recipients) ? f.recipients : []).slice(0, 5000).map(r => ({ name: String(r?.name || "").slice(0, 120), country: cc(r?.country), size: String(r?.size || "").slice(0, 12) })).filter(r => r.country)
  };
  for (const i of items) {
    const src = body.items.find(x => x?.product_id === i.product_id) || {}, p = catalog.products.find(x => x.id === i.product_id);
    i.per_person = Math.min(20, Math.max(1, Math.round(Number(src.per_person) || 1)));
    i.material_id = (p.materials || []).some(m => m.id === src.material_id) ? src.material_id : (p.materials?.[0]?.id || null);
    i.sizes = p.sizes ? Object.fromEntries(p.sizes.map(z => [z, Math.max(0, Math.round(Number(src.sizes?.[z]) || 0))]).filter(([, n]) => n > 0)) : {};
    if (buyer_type === "merchant") i.qty = 1; // samples; production afterwards is per customer order
    if (fulfillment.mode === "multi") i.qty = Math.max(1, fulfillment.recipients.filter(r => StudioPricing.regionOf(catalog, r.country)).length) * i.per_person;
  }
  const packaging_mode = body.packaging_mode === "none" ? "none" : "custom";
  const packaging = packaging_mode === "none" ? [] : (Array.isArray(body.packaging) ? body.packaging : []).filter(id => catalog.packaging.some(o => o.id === id));
  const ref = body.packaging_reference || {}; let refData = String(ref.data_url || "");
  if (refData && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(refData) || refData.length > 3_000_000)) refData = "";
  const packaging_reference = refData ? { name: String(ref.name || "reference.jpg").slice(0, 120), data_url: refData } : null;
  const brand = { name: String(body.brand?.name || "").slice(0, 60), message: String(body.brand?.message || "").slice(0, 240) };
  const ps = body.publish_store || {};
  const publish_store = buyer_type === "merchant" && ["shopify", "woocommerce"].includes(ps.platform) && /^sc_[a-f0-9]{16}$/.test(String(ps.connection_id || ""))
    ? { platform: ps.platform, connection_id: ps.connection_id, store: String(ps.store || "").slice(0, 200) } : null;
  return { buyer_type, fulfillment, publish_store, auto_exclude: body.auto_exclude !== false, scenario_id: sc?.id || null, kit_id: kit?.id || null, market: catalog.markets.some(m => m.id === body.market) ? body.market : "EU", margin: Number(body.margin) || 0.4, items, packaging, packaging_mode, packaging_reference, brand,
    design_meta: { name: String(body.design_meta?.name || "").slice(0, 120), width: Number(body.design_meta?.width) || 0, height: Number(body.design_meta?.height) || 0, source: body.design_meta?.source === "text" ? "text" : "upload" } };
}

async function saveDesign(dataUrl, dir, id) {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw new HttpError(400, "invalid_design", "Design must be a PNG, JPEG or WebP image");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_DESIGN_BYTES) throw new HttpError(413, "design_too_large", "Design image must be 8 MB or smaller");
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  if (!MAGIC[ext].every((b, i) => buf[i] === b)) throw new HttpError(400, "invalid_design", "File content does not match its image type");
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${id}.${ext}.enc`), encryptBuffer(buf));   // encrypted at rest
  return `/api/studio/projects/${id}/design`;
}

export async function saveProject({ tenantId, userId = null, body, generatedDir }) {
  const input = cleanInput(body);
  const id = `sp_${crypto.randomBytes(10).toString("hex")}`;
  const design_url = await saveDesign(body.design_data_url, privateDir(generatedDir), id);
  const quote = StudioPricing.quote(studioCatalog(), { ...input, list: input.buyer_type === "merchant" ? false : undefined });
  const delivery = deliveryFor(input);
  const now = new Date().toISOString();
  return addRecord("studio_projects", { id, tenant_id: tenantId, user_id: userId, ...input, design_url, quote, delivery, status: "draft", created_at: now, updated_at: now,
    expires_at: new Date(Date.now() + retention().draftDays * DAY).toISOString() });
}

function deliveryFor(p) {
  return StudioPricing.fulfillment(catalog, { mode: p.fulfillment.mode, market: p.market, items: p.items.map(i => ({ product_id: i.product_id, qty: i.qty })),
    address_country: p.fulfillment.address_country, sample_country: p.fulfillment.sample_country, recipients: p.fulfillment.recipients,
    per_person: Object.fromEntries(p.items.map(i => [i.product_id, i.per_person || 1])) });
}

export async function getProject(id, { tenantId, userId } = {}) {
  if (!isProjectId(id)) throw new HttpError(404, "project_not_found", "Project not found");
  const p = await findRecord("studio_projects", id);
  if (!p || expired(p)) throw new HttpError(404, "project_not_found", "Project not found");
  if (tenantId && p.tenant_id !== tenantId) throw new HttpError(404, "project_not_found", "Project not found");
  if (userId && p.user_id && p.user_id !== userId) throw new HttpError(403, "project_forbidden", "This project belongs to another account");
  const { tenant_id, contact, order_id, ...pub } = p;
  return { ...pub, fulfillment: { ...pub.fulfillment, recipients: (pub.fulfillment?.recipients || []).map(({ country, size }) => ({ country, size })) } };
}

/** Turn a saved project into an order / quote / sample request and start the proof lifecycle. */
export async function requestQuote({ id, contact, user = null, tenantId = null }) {
  if (!isProjectId(id)) throw new HttpError(404, "project_not_found", "Project not found");
  const p = await findRecord("studio_projects", id);
  if (!p || (tenantId && p.tenant_id !== tenantId)) throw new HttpError(404, "project_not_found", "Project not found");
  if (user?.id && p.user_id && p.user_id !== user.id) throw new HttpError(403, "project_forbidden", "This project belongs to another account");
  if (!p.design_url) throw new HttpError(409, "design_required", "A print-ready design is required before requesting an order");
  if (p.order_id) {
    const existing = await findRecord("orders", p.order_id);
    const proof = await findWhere("proofs", x => x.order_id === p.order_id);
    return { order_id: p.order_id, status: existing?.status || "already_requested", proof_id: proof?.id || null, account_url: "/account.html", already_requested: true };
  }
  const email = String(contact?.email || "").trim().slice(0, 320);
  if (!/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, "invalid_email", "请填写有效的邮箱地址");
  const q = StudioPricing.quote(studioCatalog(), { ...p, list: p.buyer_type === "merchant" ? false : undefined }); // recompute at request time
  // Merchants pay the base price for samples; the margin check only filters their catalogue (retail ceiling).
  const included = p.buyer_type === "merchant" && p.auto_exclude !== false ? q.lines.filter(l => l.reachable) : q.lines;
  const delivery = deliveryFor({ ...p, items: p.items.filter(i => included.some(l => l.product_id === i.product_id)) });
  if (!included.length) throw new HttpError(409, "nothing_reachable", "No product reaches the target margin below its market ceiling");
  const orderId = `STU-${new Date().getUTCFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const name = pid => catalog.products.find(x => x.id === pid)?.name;
  const buyerType = p.buyer_type || "company";
  const initialStatus = buyerType === "company" ? "Quote requested" : buyerType === "merchant" ? "Sample requested" : "Order requested";
  const order = await addRecord("orders", {
    id: orderId, tenant_id: p.tenant_id, user_id: user?.id || p.user_id || null, store_id: "pod_studio", channel: "studio", studio_project_id: p.id,
    status: initialStatus, payment_status: "pending", currency: q.currency, buyer_type: buyerType,
    fulfillment: { mode: delivery.mode, address_country: p.fulfillment?.address_country, deadline: p.fulfillment?.deadline || null, recipients: delivery.recipients || null, parcels: delivery.parcels ?? delivery.sample?.shipments?.length ?? null, lead_days: delivery.lead_days, earliest_delivery: StudioPricing.deliveryDate(catalog, delivery.lead_days) },
    publish_store: p.publish_store || null, packaging_mode: p.packaging_mode || "custom", packaging: p.packaging || [], brand: p.brand || {}, packaging_reference: p.packaging_reference ? { name: p.packaging_reference.name } : null,
    shipping_charged: delivery.total_cost, vat_id: String(contact?.vat_id || "").slice(0, 40),
    customer_email: email, customer_name: String(contact?.name || "").slice(0, 120), company: String(contact?.company || "").slice(0, 160),
    // Customer pays the base price (unit_cost) per unit + delivery; merchants set their own retail price later.
    items: included.map(l => { const it = p.items.find(i => i.product_id === l.product_id) || {}; const pr = catalog.products.find(x => x.id === l.product_id), mat = (pr.materials || []).find(m => m.id === l.material_id);
      return { sku: `STUDIO-${l.product_id.toUpperCase()}`, name: name(l.product_id)?.en, name_zh: name(l.product_id)?.zh, material_id: l.material_id, material: mat?.name?.en || "", quantity: l.qty, unit_price: l.unit_cost, suggested_retail: p.buyer_type === "merchant" ? l.price : null, facility: l.facility, sizes: it.sizes || {}, per_person: it.per_person || 1 }; }),
    revenue: Math.round((included.reduce((a, l) => a + l.line_cost, 0) + delivery.total_cost) * 100) / 100, cogs: 0,
    shipping_cost: 0, payment_fee: 0, affiliate_commission: 0, ad_attributed_cost: 0, design_url: p.design_url,
    note: String(contact?.note || "").slice(0, 1000), created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  });
  const proof = await createProofForOrder(order);
  await addRecord("order_events", { id: `evt_${crypto.randomBytes(6).toString("hex")}`, tenant_id: p.tenant_id, order_id: orderId, event_type: "request_received", source: "studio", payload: { project_id: p.id, buyer_type: order.buyer_type, status: order.status }, event_time: new Date().toISOString() });
  await createTask(p.tenant_id, { type: "studio_order_review", title: `Review Studio request ${orderId}`, risk: "low", payload: { order_id: orderId, project_id: p.id, proof_id: proof.id } });
  await updateRecord("studio_projects", p.id, { status: "submitted", user_id: order.user_id, order_id: orderId, expires_at: new Date(Date.now() + retention().quoteDays * DAY).toISOString(), contact: { email, name: order.customer_name, company: order.company }, updated_at: new Date().toISOString() });
  // Keep the account/customer/admin views in sync with every submitted front-end order request.
  if (user) {
    const customer = await ensureCustomer(p.tenant_id, user);
    await updateRecord("customers", customer.id, { name: order.customer_name || customer.name || user.name || "", last_seen: new Date().toISOString(), favorite_scene: p.scenario_id || customer.favorite_scene || "", orders: Number(customer.orders || 0) + 1, lifetime_value: Math.round((Number(customer.lifetime_value || 0) + Number(order.revenue || 0)) * 100) / 100 });
  }
  const accountUrl = `${baseUrl()}/account.html`;
  const customerMail = await sendEmail({ tenantId: p.tenant_id, userId: order.user_id, to: email, type: "order_request_confirmation", related_id: orderId,
    subject: `POD Studio request received · ${orderId}`,
    text: `We received your request ${orderId}. Total estimate: ${q.currency} ${order.revenue}. You can follow the order at ${accountUrl}.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto"><h2>Request received</h2><p>Reference <b>${orderId}</b></p><p>Estimated total: <b>${q.currency} ${order.revenue}</b></p><p>Next: we review the artwork and prepare the proof. Production only starts after the required approval.</p><p><a href="${accountUrl}">View order status</a></p></div>` });
  await addRecord("order_events", { id: `evt_${crypto.randomBytes(6).toString("hex")}`, tenant_id: p.tenant_id, order_id: orderId, event_type: "confirmation_email", source: "system", payload: { status: customerMail.status, notification_id: customerMail.notification_id }, event_time: new Date().toISOString() });
  const opsTo = process.env.ORDER_NOTIFICATION_EMAIL || process.env.FROM_EMAIL;
  let opsMail = null;
  if (opsTo) opsMail = await sendEmail({ tenantId: p.tenant_id, to: opsTo, type: "admin_order_request", related_id: orderId, subject: `New POD Studio request · ${orderId}`, text: `${email} requested ${included.length} product(s), ${q.currency} ${order.revenue}.`, html: `<p>New Studio request <b>${orderId}</b></p><p>${email}</p><p>${included.length} products · ${q.currency} ${order.revenue}</p>` });
  return { order_id: orderId, status: order.status, buyer_type: order.buyer_type, currency: q.currency, total: order.revenue, delivery: order.shipping_charged, items: included.length, skipped: q.lines.length - included.length, proof_id: proof.id, email_status: customerMail.status, admin_email_status: opsMail?.status || "not_configured", account_url: "/account.html" };
}

/** Decrypted design for a project (served with no-store). */
export async function projectDesign({ id, generatedDir, tenantId = null, userId = null }) {
  if (!isProjectId(id)) throw new HttpError(404, "not_found", "Not found");
  const p = await findRecord("studio_projects", id);
  if (!p || expired(p) || (tenantId && p.tenant_id !== tenantId)) throw new HttpError(404, "not_found", "Not found");
  if (userId && p.user_id && p.user_id !== userId) throw new HttpError(403, "project_forbidden", "This project belongs to another account");
  for (const ext of Object.keys(MIME)) {
    const f = path.join(privateDir(generatedDir), `${id}.${ext}.enc`);
    try { return { mime: MIME[ext], data: decryptBuffer(await fsp.readFile(f)) }; } catch (e) { if (e.code !== "ENOENT") throw e; }
  }
  throw new HttpError(404, "not_found", "Not found");
}

/** Automatic deletion: removes expired projects and their encrypted design files. */
export async function purgeExpired({ generatedDir, now = Date.now() } = {}) {
  const gone = await removeWhere("studio_projects", p => p.expires_at && Date.parse(p.expires_at) < now);
  for (const p of gone) {
    for (const ext of Object.keys(MIME)) await fsp.rm(path.join(privateDir(generatedDir), `${p.id}.${ext}.enc`), { force: true });
    for (const it of p.items || []) await fsp.rm(mockupFile(privateDir(generatedDir), p.id, it.product_id), { force: true });
  }
  // legacy plain files from older versions
  await fsp.rm(path.join(generatedDir, "studio"), { recursive: true, force: true }).catch(() => {});
  if (gone.length) console.log(`[studio] retention: deleted ${gone.length} expired project(s)`);
  return gone.length;
}
