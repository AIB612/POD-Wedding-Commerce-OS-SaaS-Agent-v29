// Fixture shop for Pod.AI recommendation tests / eval: real-looking Shopify product rows (as searchShopProducts returns them).
const P = (id, name, price, { type = "", tags = [], collections = [], variants = null, cur = "CHF" } = {}) => ({ id: `gid://shopify/Product/${id}`, name, image: `https://cdn.example/${id}.jpg`, unit_price: price, currency: cur, max_price: price,
  link: `https://alpine.example/products/p${id}`, type, tags, collections, variants: variants || [{ id: `${id}01`, title: "Default Title", price, available: true }], variant_id: `${id}01`, details: [] });
export const PRODUCTS = [
  P(1, "Mountain Tee", 29, { type: "T-Shirt", tags: ["men", "women", "organic"], collections: ["Apparel"], variants: [{ id: "101", title: "Blue / M", price: 29, available: true }, { id: "102", title: "Black / M", price: 29, available: true }, { id: "103", title: "White / M", price: 29, available: false }] }),
  P(2, "Summit Hoodie", 69, { type: "Hoodie", tags: ["men", "gift"], collections: ["Apparel"], variants: [{ id: "201", title: "Navy / L", price: 69, available: true }, { id: "202", title: "Grey / L", price: 69, available: true }] }),
  P(3, "Edelweiss Mug", 18, { type: "Mug", tags: ["gift", "home"], collections: ["Home", "Gifts"] }),
  P(4, "Alpine Candle", 24, { type: "Candle", tags: ["gift", "women", "home"], collections: ["Home", "Gifts"] }),
  P(5, "Kids Goat Tee", 19, { type: "T-Shirt", tags: ["kids"], collections: ["Kids", "Apparel"], variants: [{ id: "501", title: "Pink / 6Y", price: 19, available: true }, { id: "502", title: "Blue / 6Y", price: 19, available: true }] }),
  P(6, "Canvas Tote", 15, { type: "Bag", tags: ["gift", "women"], collections: ["Accessories", "Gifts"] }),
  P(7, "Wool Beanie", 32, { type: "Hat", tags: ["men", "women", "gift"], collections: ["Accessories"], variants: [{ id: "701", title: "Red", price: 32, available: true }, { id: "702", title: "Black", price: 32, available: true }] }),
  P(8, "Hiking Socks", 12, { type: "Socks", tags: ["men"], collections: ["Accessories"], variants: [{ id: "801", title: "Blue", price: 12, available: true }] }),
  P(9, "Wedding Guest Tote", 9, { type: "Bag", tags: ["wedding", "gift"], collections: ["Gifts"] }),
  P(10, "Sold-out Jacket", 149, { type: "Jacket", collections: ["Apparel"], variants: [{ id: "1001", title: "Black / M", price: 149, available: false }] })
];
/** Fake searchShopProducts: title/type/tag word match; browse = newest first. */
export function fakeSearch(list = PRODUCTS) {
  return async (q, { browse = false, limit = 24 } = {}) => {
    if (browse || !String(q || "").trim()) return { ok: true, products: list.slice().reverse().slice(0, limit) };
    const ws = String(q).toLowerCase().split(/\s+/).map(w => w.replace(/s$/, "")).filter(w => w.length > 2);
    return { ok: true, products: list.filter(p => ws.some(w => `${p.name} ${p.type} ${p.tags.join(" ")}`.toLowerCase().includes(w))).slice(0, limit) };
  };
}
