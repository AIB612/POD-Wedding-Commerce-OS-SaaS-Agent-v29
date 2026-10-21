// Demo data for the My account portal (tests + screenshots). Never imported by the app itself.
// Usage as a server: STORE_PERSIST_PATH=/tmp/x.json PORT=4310 node server/account-demo.js → prints the demo session token.
import { addRecord } from "./saas-store.js";
import { createSession } from "./services/account-service.js";

const AVATAR = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#c9a48f"/><circle cx="40" cy="31" r="15" fill="#f6e7dc"/><path d="M12 80c4-20 15-28 28-28s24 8 28 28z" fill="#f6e7dc"/></svg>');
const day = n => new Date(Date.now() - n * 864e5).toISOString();
const line = (product_id, name, quantity, unit_price, material = "", material_id = "", customization = "") => ({ product_id, sku: product_id.toUpperCase(), name, quantity, unit_price, line_total: Math.round(unit_price * quantity * 100) / 100, material, material_id, customization, discount: 0 });

export async function seedDemo(tenantId = "tenant_demo") {
  const mk = (id, email, name, extra = {}) => addRecord("customer_accounts", { id, tenant_id: tenantId, email, name, role: "customer", status: "active", created_at: day(120), updated_at: day(1), last_login_at: day(0), ...extra });
  const home = { id: "adr_home", label: "Home", name: "Lena Meier", address1: "Seefeldstrasse 42", address2: "", postal_code: "8008", city: "Zürich", country: "CH", phone: "+41 79 123 45 67", is_default: true };
  const studio = { id: "adr_studio", label: "Parents", name: "Lena Meier c/o Meier", address1: "Hauptstrasse 7", address2: "", postal_code: "79539", city: "Lörrach", country: "DE", phone: "", is_default: false };
  const u = await mk("usr_demo_lena", "lena.meier@example.com", "Lena Meier", { avatar_url: AVATAR, identities: { google: { sub: "g-1", email: "lena.meier@example.com", linked_at: day(120) } }, addresses: [home, studio], shipping_address: (({ id, label, is_default, ...r }) => r)(home) });
  const other = await mk("usr_demo_other", "someone@example.com", "Someone Else", { identities: { shop: { sub: "s-1" } } });
  const ship = { name: "Lena Meier", address1: "Seefeldstrasse 42", address2: "", city: "Zürich", postal_code: "8008", country: "CH", phone: "+41 79 123 45 67" };
  const order = (id, user, created, extra) => {
    const sub = extra.items.reduce((a, l) => a + l.line_total, 0), shipping = extra.shipping ?? 9.9, tax = extra.tax ?? 0;
    return addRecord("orders", { id, tenant_id: tenantId, user_id: user.id, store_id: "direct_storefront", channel: "storefront", status: "Paid", payment_status: "paid", payment_provider: "twint", currency: "CHF", customer_email: user.email, customer_name: user.name, shipping_address: ship, subtotal: Math.round(sub * 100) / 100, shipping_charged: shipping, shipping_method: "standard", tax, grand_total: Math.round((sub + shipping + tax) * 100) / 100, revenue: Math.round((sub + shipping) * 100) / 100, created_at: created, updated_at: created, ...extra });
  };
  const o1 = await order("POD-2026-8F3A21C0D4", u, day(2), { status: "In production", paid_at: day(2), items: [line("invitation", "Wedding invitation", 60, 3.2, "Cotton art paper", "cotton", "Text: Lena & Marco · 12.06.2027"), line("tote", "Organic tote bag", 20, 12.5, "Natural canvas")] });
  const o2 = await order("POD-2026-1B77E0A9F2", u, day(16), { status: "Delivered", paid_at: day(16), delivered_at: day(5), shipped_at: day(9), tracking_number: "99.00.123456.78901234", payment_provider: "paypal", currency: "EUR", items: [line("tee", "Organic cotton tee", 12, 24.9, "Organic cotton 180 g/m²", "organic_180", "Text: Team Bride")], shipping: 12.5, shipping_address: { ...ship, name: "Lena Meier c/o Meier", address1: "Hauptstrasse 7", city: "Lörrach", postal_code: "79539", country: "DE", phone: "" } });
  const o3 = await order("POD-2026-C02D5E7714", u, day(0.2), { status: "Draft", payment_status: "pending", items: [line("mug", "Ceramic mug", 4, 18)] });
  const oX = await order("POD-2026-FFFF000001", other, day(1), { items: [line("tee", "Organic cotton tee", 1, 24.9)] });
  await addRecord("order_events", { id: "evt_demo1", tenant_id: tenantId, order_id: o1.id, event_type: "proof_ready", source: "admin", payload: {}, event_time: day(1.8) });
  await addRecord("order_events", { id: "evt_demo2", tenant_id: tenantId, order_id: o1.id, event_type: "proof_approved", source: "customer", payload: {}, event_time: day(1.2) });
  await addRecord("order_events", { id: "evt_demo3", tenant_id: tenantId, order_id: o2.id, event_type: "proof_ready", source: "admin", payload: {}, event_time: day(15.5) });
  await addRecord("order_events", { id: "evt_demo4", tenant_id: tenantId, order_id: o2.id, event_type: "proof_approved", source: "customer", payload: {}, event_time: day(15) });
  await addRecord("studio_projects", { id: "prj_demo1", tenant_id: tenantId, user_id: u.id, name: "Bridal party hoodies", product_id: "hoodie", status: "draft", created_at: day(6), updated_at: day(3) });
  await addRecord("studio_projects", { id: "prj_demoX", tenant_id: tenantId, user_id: other.id, name: "Not yours", product_id: "tee", status: "draft", created_at: day(6), updated_at: day(3) });
  return { user: u, other, orders: [o1, o2, o3], foreignOrder: oX, token: (await createSession(tenantId, u.id)).token, otherToken: (await createSession(tenantId, other.id)).token };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { createApp } = await import("./create-app.js");
  const app = await createApp({});
  const d = await seedDemo();
  app.listen(Number(process.env.PORT || 4310), () => console.log(`DEMO_TOKEN=${d.token}`));
}
