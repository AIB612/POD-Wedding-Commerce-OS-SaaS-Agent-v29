// Offline carrier used when LOGISTICS_MOCK=true (tests / demos). Deterministic, no network.
export function createMock(id, name) {
  const store = new Map();
  return {
    id, name: `${name} (mock)`, configured: true, mode: "mock",
    async createShipment(s) { const n = `${id === "fourpx" ? "4PX" : "YT"}${String(Math.abs([...s.reference].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 7))).padStart(10, "0")}`; store.set(n, Date.now()); return { carrier_order_id: n, tracking_number: n, raw_status: "created" }; },
    async getLabel(n) { const pdf = Buffer.from(`%PDF-1.4\n% mock label ${n}\n%%EOF\n`).toString("base64"); return { url: null, pdf_base64: pdf }; },
    async track(n) { return { status: "in_transit", events: [{ time: new Date().toISOString(), location: "Shenzhen", text: `Mock: parcel ${n} accepted`, code: "ACCEPTED" }] }; },
    async listProducts() { return id === "fourpx" ? [{ code: "QC", name: "联邮通标准挂号-普货" }, { code: "S5110", name: "Cpacket-US" }] : [{ code: "THPHR", name: "YunExpress Economy -Unrestricted" }, { code: "BKZXR", name: "YunExpress Standard" }]; },
    async cancel() { return { cancelled: true }; }
  };
}
