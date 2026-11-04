// Customer-chat tools, adapted from the POD Agent (core/src/tools.js) to OUR store and services:
//   product data + prices   → studio catalog + admin price list via quoteStorefront (same code as cart/checkout)
//   shipping quotes         → quoteStorefront (fees/zones/carrier rules) — chat price == checkout price
//   order lookup            → lookupOrder (order number + e-mail, constant-time check, per-order lock)
//   tracking                → our orders / carrier_shipments (YunExpress / 4PX polling), never a demo table
//   discounts               → our promo codes (promo-service); issuing is rule-gated and OFF by default
//   handoff                 → agent_handoffs queue in Admin (no e-mail)
// Every tool returns { ok, ... } or { ok:false, error } so the model (or the rule engine) explains instead of guessing.
// UI blocks for the web chat (product cards, quote card, chips) are pushed to ctx.ui.
import crypto from "node:crypto";
import { studioCatalog } from "../../services/studio-service.js";
import { quoteStorefront, lookupOrder } from "../../services/checkout-service.js";
import { createPromo } from "../../services/promo-service.js";
import { findWhere, listForTenant } from "../../saas-store.js";
import { LOGISTICS_STATUS, CARRIERS } from "../../logistics/index.js";
import { searchKnowledge, knowledgeEntry, POLICY_TOPICS } from "./knowledge.js";
import { createHandoff, discountsIssued, recordDiscount } from "./store.js";
import { trackParcel, statusText } from "../../tracking/index.js";

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const catalog = () => studioCatalog();
export const productById = id => (catalog().products || []).find(p => p.id === id) || null;
const pname = (p, lang) => p?.name?.[lang] || p?.name?.en || p?.id;
function scenarioFor(id) { for (const s of catalog().scenarios || []) if ((s.kits || []).some(k => k.items.includes(id))) return s.id; return null; }
export function productLink(id) { const sc = scenarioFor(id); return sc ? `/studio.html?scenario=${sc}&entry=home&product=${encodeURIComponent(id)}` : `/studio.html?product=${encodeURIComponent(id)}`; }
const image = p => p?.mockup_photo?.src ? "/" + p.mockup_photo.src.replace(/^\//, "") : null;
export function resolveProduct(q) {
  if (!q) return null;
  const s = String(q).toLowerCase().trim(), ps = catalog().products || [];
  return ps.find(p => p.id === s) || ps.find(p => Object.values(p.name || {}).some(n => String(n).toLowerCase() === s)) || ps.find(p => p.id === s.replace(/\s+/g, "_")) ||
    ps.find(p => Object.values(p.name || {}).some(n => String(n).toLowerCase().includes(s))) || null;
}
const safeCountry = c => (/^[A-Z]{2}$/.test(String(c || "").toUpperCase()) ? String(c).toUpperCase() : null);

/** Server quote for one product line (merchandise + shipping + VAT) — identical to /api/storefront/shipping/quote. */
async function lineQuote(tenantId, { product_id, quantity = 1, material_id, country = "CH", shipping_method }) {
  const line = { product_id, quantity: Math.max(1, Math.min(10000, Math.round(Number(quantity) || 1))), ...(material_id ? { material_id } : {}) };
  return quoteStorefront({ tenantId, cart: [line], country, shipping_method });
}

const QTY_TIERS = [1, 10, 25, 50, 100];
const OCCASIONS = [
  { re: /(anniversary|jahrestag|anniversaire|周年|纪念日)/i, kit: "gift_anniversary" },
  { re: /(baby|newborn|geburt|naissance|宝宝|婴儿|满月)/i, kit: "gift_baby" },
  { re: /(christmas|xmas|weihnacht|noël|natale|圣诞)/i, kit: "season_xmas" },
  { re: /(party|birthday|geburtstag|fête|festa|派对|生日)/i, kit: "season_party" },
  { re: /(company|corporate|team|office|firma|entreprise|azienda|公司|团队|企业)/i, kit: "corp_event" },
  { re: /(favou?rs?|guests?|gäste|gastgeschenk|invités|ospiti|伴手礼|回礼|宾客|客人)/i, items: ["candle", "gift_box", "coaster", "magic_mug", "tote", "sticker"] },
  { re: /(stationery|paper|papeterie|纸品|卡片)/i, items: ["invitation", "save_date", "menu_card", "place_card", "table_number", "rsvp_card"] },
  { re: /(decor|deko|décor|装饰|布置|sign|schild)/i, items: ["welcome_sign", "table_number", "banner", "candle", "photo_frame"] },
  { re: /(wedding|hochzeit|mariage|matrimonio|婚礼|结婚|婚)/i, kit: "gift_wedding" }
];

/** Every customer-safe tool the chat can use (issue_discount only when the sales discount is switched on in Admin). */
export const CUSTOMER_TOOLS = ["search_knowledge", "get_policy", "get_product", "recommend_products", "quote_shipping", "find_order", "get_tracking", "check_discount_code", "issue_discount", "handoff_to_human"];

export function createTools(ctx) {
  const { tenantId, lang, conv, settings } = ctx;
  const ui = ctx.ui;
  const country = c => safeCountry(c) || safeCountry(conv.slots?.country) || safeCountry(ctx.countryHint) || null;

  async function productCard(p, qty = 1, cc = "CH") {
    let q = null; try { q = await lineQuote(tenantId, { product_id: p.id, quantity: qty, country: cc }); } catch { q = null; }
    const it = q?.items?.[0];
    return { id: p.id, name: pname(p, lang), image: image(p), unit_price: it ? it.unit_price : null, quantity: qty, currency: q?.currency || null, link: productLink(p.id), eco: (p.eco_tags || []).length > 0 };
  }

  const impl = {
    async search_knowledge({ query }) {
      const hits = await searchKnowledge(tenantId, query, lang, { custom: settings.custom_faq });
      return { ok: true, results: hits.map(h => ({ question: h.question, answer: h.answer })) };
    },
    async get_policy({ topic }) {
      const e = await knowledgeEntry(tenantId, POLICY_TOPICS[topic] || topic, lang);
      return e ? { ok: true, topic, text: e.answer } : { ok: false, error: `No policy text for "${topic}".` };
    },
    async get_product({ product, quantity, country: cc }) {
      const p = resolveProduct(product);
      if (!p) return { ok: false, error: "product_not_found", hint: "Ask which product, or call recommend_products." };
      const dest = country(cc) || "CH", tiers = [];
      for (const n of QTY_TIERS) { try { const q = await lineQuote(tenantId, { product_id: p.id, quantity: n, country: dest }); tiers.push({ min_qty: n, unit_price: q.items[0].unit_price, currency: q.currency }); } catch { /* product not sold in this market */ } }
      if (!tiers.length) return { ok: false, error: "not_available_for_market", country: dest };
      const card = await productCard(p, Number(quantity) || 1, dest);
      ui.push({ type: "products", items: [card] });
      return { ok: true, product: { id: p.id, name: pname(p, lang), category: p.category, technique: p.technique || null,
        materials: (p.materials || []).map(m => ({ id: m.id, name: m.name?.[lang] || m.name?.en })), sizes: p.sizes || null, colors: (p.colors || []).length || null,
        eco: p.eco_tags || [], link: card.link, price_tiers: tiers, prices_note: "Unit prices per quantity tier, excl. VAT unless the shop shows incl. VAT; shipping and VAT at checkout." } };
    },
    async recommend_products({ occasion = "", budget, quantity, country: cc, limit = 4 }) {
      const text = String(occasion || ""), dest = country(cc) || "CH";
      const rule = OCCASIONS.find(o => o.re.test(text)) || OCCASIONS[OCCASIONS.length - 1];
      let ids = rule.items || (catalog().scenarios || []).flatMap(s => s.kits).find(k => k.id === rule.kit)?.items || [];
      ids = ids.filter(id => productById(id));
      const qty = Math.max(1, Number(quantity) || 1), cards = [];
      for (const id of ids) { const c = await productCard(productById(id), qty, dest); if (c.unit_price == null) continue; if (budget && c.unit_price > Number(budget)) continue; cards.push(c); if (cards.length >= Math.min(6, limit)) break; }
      if (!cards.length) return { ok: false, error: budget ? "nothing_within_budget" : "no_products", budget: budget || null };
      ui.push({ type: "products", items: cards });
      return { ok: true, occasion: rule.kit || "custom", products: cards.map(c => ({ id: c.id, name: c.name, unit_price: c.unit_price, currency: c.currency, link: c.link })) };
    },
    async quote_shipping({ country: cc, product, quantity, postcode, shipping_method }) {
      const dest = country(cc);
      if (!dest) return { ok: false, error: "country_required", hint: "Ask for the delivery country." };
      const p = resolveProduct(product || conv.slots?.product);
      if (!p) return { ok: false, error: "product_required", hint: "Ask which product (e.g. invitations, menu cards)." };
      const qty = Math.max(1, Math.round(Number(quantity || conv.slots?.quantity) || 1));
      let q;
      try { q = await lineQuote(tenantId, { product_id: p.id, quantity: qty, country: dest, shipping_method }); }
      catch (e) { return { ok: false, error: e.code === "shipping_zone_not_found" || /zone/.test(e.message) ? "no_shipping_to_country" : (e.code || e.message), country: dest }; }
      const options = q.shipping_options.map(o => ({ id: o.id, label: o.id === "express" ? "Express" : "Standard", price: o.amount, free: !!o.free_applied, arrives_from: o.delivery?.from || null, arrives_to: o.delivery?.to || null }));
      const res = { ok: true, product: pname(p, lang), product_id: p.id, quantity: qty, country: dest, currency: q.currency, unit_price: q.items[0].unit_price, subtotal: q.subtotal,
        shipping_options: options, vat_rate: q.tax?.rate ?? null, prices_include_vat: !!q.prices_include_vat, estimated_total_standard: q.grand_total,
        note: "Same server quote as the cart and checkout. Delivery dates are estimates; production starts after payment (and proof approval)." };
      ui.push({ type: "quote", product: res.product, product_id: p.id, quantity: qty, country: dest, currency: q.currency, unit_price: res.unit_price, subtotal: q.subtotal, options, vat_rate: res.vat_rate, prices_include_vat: res.prices_include_vat, link: productLink(p.id) });
      Object.assign(conv.slots, { product: p.id, quantity: qty, country: dest });
      return res;
    },
    async find_order({ order_number, email }) {
      const no = String(order_number || conv.slots?.order_number || "").trim(), em = String(email || conv.slots?.email || "").trim();
      if (!no) return { ok: false, error: "order_number_required" };
      if (!em) return { ok: false, error: "email_required", hint: "Ask for the e-mail used for the order." };
      try {
        const o = await lookupOrder(no, em);
        conv.slots.verified_order = o.id;
        // No synced events yet (or a carrier we don't integrate): live tracking via carrier API → 51Tracking (verified order only)
        if (o.tracking?.number && !o.tracking.events?.length && !o.tracking.last_event) {
          const t = await trackParcel({ number: o.tracking.number, company: o.tracking.carrier, url: o.tracking.url, lang, tenantId }).catch(() => null);
          if (t && t.source !== "link") o.tracking = { ...o.tracking, status: t.status, status_label: { en: statusText(t.status, "en"), zh: statusText(t.status, "zh") }, last_event: t.last_event, events: t.events, url: o.tracking.url || t.url, source: t.source };
        }
        ui.push({ type: "order", id: o.id, stage: o.stage, placed_at: o.placed_at, item_count: o.item_count, delivery_estimate: o.delivery_estimate,
          tracking: o.tracking ? { carrier: o.tracking.carrier, number: o.tracking.number, url: o.tracking.url, status: o.tracking.status_label?.[lang === "zh" ? "zh" : "en"] || o.tracking.status } : null });
        return { ok: true, order: o };
      } catch (e) {
        if (e.code === "too_many_attempts" || e.status === 429) return { ok: false, error: "too_many_attempts" };
        return { ok: false, error: "order_not_found", hint: "Same answer for unknown order and wrong e-mail (no enumeration)." };
      }
    },
    async get_tracking({ tracking_number }) {
      const n = String(tracking_number || "").trim().toUpperCase().slice(0, 40);
      if (!/^[A-Z0-9][A-Z0-9.\-]{5,39}$/.test(n)) return { ok: false, error: "invalid_tracking_number" };
      const ship = (await listForTenant("carrier_shipments", tenantId)).find(s => [s.tracking_number, s.last_mile_number].some(x => String(x || "").toUpperCase() === n));
      const order = ship?.order_id ? await findWhere("orders", o => o.id === ship.order_id) : await findWhere("orders", o => o.tenant_id === tenantId && String(o.tracking_number || "").toUpperCase() === n);
      if (!ship && !order) return { ok: false, error: "tracking_not_found", hint: "Check the number, or look up the order with order number + e-mail." };
      let st = ship?.status || order?.tracking_status || "", lab = LOGISTICS_STATUS[st];
      let last = (ship?.events || [])[0] || order?.tracking_last_event || null;
      if (!last) { // nothing synced yet → carrier API / 51Tracking (number belongs to one of our orders)
        const t = await trackParcel({ number: n, company: order?.carrier || (ship ? CARRIERS[ship.carrier]?.name : ""), url: order?.tracking_url || "", lang, tenantId }).catch(() => null);
        if (t && t.source !== "link") { st = t.status; lab = { en: statusText(t.status, "en"), zh: statusText(t.status, "zh") }; last = t.last_event; }
      }
      const res = { ok: true, tracking_number: n, carrier: order?.carrier || (ship ? CARRIERS[ship.carrier]?.name : "") || "", status: lab ? (lab[lang === "zh" ? "zh" : "en"]) : (st || "unknown"),
        last_event: last ? { time: last.time || "", text: last.text || "", location: last.location || "" } : null, url: order?.tracking_url || (ship && CARRIERS[ship.carrier]?.track_url ? CARRIERS[ship.carrier].track_url(n) : "") };
      ui.push({ type: "tracking", ...res });
      return res;
    },
    async check_discount_code({ code }) {
      const c = String(code || "").trim().toUpperCase().slice(0, 32);
      if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(c)) return { ok: false, error: "invalid_code_format" };
      const p = await findWhere("promo_codes", x => x.tenant_id === tenantId && x.code === c);
      if (!p || p.active === false) return { ok: true, code: c, valid: false, reason: "not_valid" };
      if (p.expires_at && Date.parse(p.expires_at) < Date.now()) return { ok: true, code: c, valid: false, reason: "expired" };
      if (p.usage_limit != null && (p.used_count || 0) >= p.usage_limit) return { ok: true, code: c, valid: false, reason: "used_up" };
      return { ok: true, code: c, valid: true, type: p.type, value: p.type === "percent" ? `${p.value}%` : [p.amounts?.CHF ? `CHF ${p.amounts.CHF}` : "", p.amounts?.EUR ? `EUR ${p.amounts.EUR}` : ""].filter(Boolean).join(" / "),
        min_order: p.min_order || null, expires_at: p.expires_at || null, how: "Enter the code in the cart or at checkout; one code per order." };
    },
    // POD Agent issue_discount (kind "sales"): the model can only REQUEST a code, these rules decide. Disabled unless switched on in Admin.
    async issue_discount({ email, reason }) {
      const r = settings.sales_discount || {};
      if (!r.enabled) return { ok: false, error: "discounts_disabled" };
      const em = String(email || conv.slots?.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return { ok: false, error: "email_required" };
      const hist = await discountsIssued(tenantId), since = Date.now() - Number(r.per_customer_days || 90) * 864e5;
      const hash = crypto.createHash("sha256").update(em).digest("hex").slice(0, 24);
      if (hist.some(h => h.email_hash === hash && Date.parse(h.created_at) >= since)) return { ok: false, error: "already_received" };
      const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
      if (hist.filter(h => Date.parse(h.created_at) >= month.getTime()).length >= Number(r.max_per_month || 0)) return { ok: false, error: "monthly_limit_reached" };
      const code = `HELLO-${crypto.randomBytes(3).toString("hex").toUpperCase()}`, expires = new Date(Date.now() + Number(r.valid_hours || 72) * 3600e3).toISOString();
      await createPromo(tenantId, { code, type: "percent", value: Number(r.percent || 5), usage_limit: 1, expires_at: expires, description: `AI chat sales code (${String(reason || "").slice(0, 80)})` });
      await recordDiscount({ id: `ad_${crypto.randomBytes(5).toString("hex")}`, tenant_id: tenantId, code, email_hash: hash, conversation_id: conv.id, percent: Number(r.percent || 5), created_at: new Date().toISOString(), expires_at: expires });
      return { ok: true, code, value: `${r.percent}%`, expires_at: expires, single_use: true };
    },
    async handoff_to_human({ reason, summary }) {
      if (conv.status === "handed_off") return { ok: true, already: true };
      const h = await createHandoff(tenantId, conv, { reason: reason || "requested by AI", summary });
      ctx.handoff = h.reason;
      return { ok: true, handoff_id: h.id, reply_within_hours: settings.human_reply_hours, needs_email: !h.customer_email };
    }
  };

  const fn = (name, description, properties, required = []) => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });
  const definitions = [
    fn("search_knowledge", "Search the shop FAQ and policies (delivery, proofs, returns, VAT, payment, website…). Use before answering any policy question.", { query: { type: "string" } }, ["query"]),
    fn("get_policy", "Get the shop policy text for a topic.", { topic: { type: "string", enum: Object.keys(POLICY_TOPICS) } }, ["topic"]),
    fn("get_product", "Get one product with materials, price per quantity tier and its design link.", { product: { type: "string", description: "Product id or name, e.g. invitation, menu card" }, quantity: { type: "integer" }, country: { type: "string" } }, ["product"]),
    fn("recommend_products", "Recommend products for an occasion (wedding, guests/favours, stationery, decor, anniversary, baby, party, corporate) and optional budget per item. Shows product cards.", { occasion: { type: "string" }, budget: { type: "number" }, quantity: { type: "integer" }, country: { type: "string" } }, ["occasion"]),
    fn("quote_shipping", "Price + shipping options + estimated arrival for a product, quantity and delivery country (2-letter ISO). Same calculation as checkout. Shows a quote card.", { country: { type: "string" }, product: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 10000 }, postcode: { type: "string" } }, ["country"]),
    fn("find_order", "Order status. Needs the order number AND the e-mail used for the order.", { order_number: { type: "string" }, email: { type: "string" } }, ["order_number"]),
    fn("get_tracking", "Shipping status for a tracking number of one of our parcels.", { tracking_number: { type: "string" } }, ["tracking_number"]),
    fn("check_discount_code", "Check whether a discount code the customer has is valid.", { code: { type: "string" } }, ["code"]),
    ...(settings.sales_discount?.enabled ? [fn("issue_discount", "Request a one-time sales discount when the customer hesitates about the price. Rules decide; needs the customer's e-mail.", { reason: { type: "string" }, email: { type: "string" } }, ["reason"])] : []),
    fn("handoff_to_human", "Hand the conversation to the team when you cannot help or the customer asks for a person.", { reason: { type: "string" }, summary: { type: "string" } }, ["reason"])
  ];
  async function execute(name, args = {}) {
    if (!impl[name] || !definitions.some(d => d.function.name === name)) return { ok: false, error: `unknown_tool:${name}` };
    const res = await impl[name](args || {});
    conv.tools[name] = (conv.tools[name] || 0) + 1;
    ctx.toolLog.push({ name, ok: !!res.ok });
    return res;
  }
  return { definitions, execute };
}
