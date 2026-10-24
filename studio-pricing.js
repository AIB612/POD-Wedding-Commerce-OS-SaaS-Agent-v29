/* Shared pricing for the POD Studio — loaded by studio.html (browser) and imported by the server, so the
 * live numbers in the UI and the server-side quote come from the same code.
 * Written as a plain script (no import/export) so it also works when studio.html is opened from disk. */
(function (g) {
  const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  /** Charm price ending in .90 that is never below the raw price. */
  const charm = raw => r2(Math.ceil(raw - 0.9) + 0.9);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function tierFactor(data, qty) { return (data.qty_tiers.find(t => qty >= t.min_qty) || { cost_factor: 1 }).cost_factor; }

  /** Nearest facility for the market: same region first (fewest days), otherwise cross-border. */
  function facilityFor(data, product, market) {
    const facs = product.facilities.map(id => data.facilities.find(f => f.id === id)).filter(Boolean);
    const local = facs.filter(f => f.region === market.region).sort((a, b) => a.days - b.days)[0];
    if (local) return { facility: local, cross_border: false, days: local.days };
    // Cross-border: prefer "near" (e.g. EU ↔ CH) over "far" (transatlantic), then fewest days.
    const near = new Set(data.cross_border.near.regions);
    const leg = f => (near.has(f.region) && near.has(market.region) ? data.cross_border.near : data.cross_border.far);
    const best = facs.map(f => ({ f, l: leg(f) })).sort((a, b) => (a.l.days + a.f.days) - (b.l.days + b.f.days))[0];
    return best ? { facility: best.f, cross_border: true, cross_cost_eur: best.l.cost_eur, days: best.f.days + best.l.days } : null;
  }

  /**
   * quote(data, {market, margin, items:[{product_id, qty}], packaging:[option ids]})
   * Every amount is in the market currency. Lines whose price would exceed the market ceiling are
   * returned with reachable:false so the UI can grey them out (the "profit slider" filter).
   */
  function quote(data, input) {
    const market = data.markets.find(m => m.id === input.market) || data.markets[0];
    const margin = clamp(Number(input.margin) || 0.4, 0.05, 0.8);
    const fx = market.fx_from_eur, packaging = new Set(input.packaging || []);
    const lines = [], warnings = [];
    for (const it of input.items || []) {
      const p = data.products.find(x => x.id === it.product_id);
      if (!p) { warnings.push(`unknown_product:${it.product_id}`); continue; }
      const qty = clamp(Math.round(Number(it.qty) || 1), 1, 10000);
      const fac = facilityFor(data, p, market);
      if (!fac) { warnings.push(`no_facility:${p.id}`); continue; }
      const pkgCost = data.packaging.filter(o => packaging.has(o.id) && p.packaging.includes(o.id)).reduce((a, o) => a + o.cost_eur, 0);
      const mats = p.materials || [], mat = mats.find(m => m.id === it.material_id) || mats[0] || null;   // selected material (default: first)
      const costEur = (p.base_cost_eur + (mat ? mat.delta_eur : 0)) * tierFactor(data, qty) + (fac.cross_border ? fac.cross_cost_eur : 0) + pkgCost; // delivery is priced by fulfillment()
      const unit_cost = r2(costEur * fx), ceiling = r2(p.price_ceiling_eur * fx);
      // Admin-managed price list (single source of truth for sell prices) wins over the margin formula.
      const listed = input.list === false ? null : listPrice(data.price_list, p.id, mat ? mat.id : null, market.currency, qty);
      const pkgPrice = pkgCost ? r2(pkgCost * fx / (1 - margin)) : 0;
      const price = listed != null ? r2(listed + pkgPrice) : charm(unit_cost / (1 - margin));
      lines.push({ product_id: p.id, qty, material_id: mat ? mat.id : null, facility: fac.facility.id, facility_city: fac.facility.city, facility_country: fac.facility.country,
        cross_border: fac.cross_border, days: fac.days, unit_cost, price, price_source: listed != null ? "list" : "formula", unit_profit: r2(price - unit_cost), ceiling, reachable: price <= ceiling,
        line_revenue: r2(price * qty), line_cost: r2(unit_cost * qty), line_profit: r2((price - unit_cost) * qty) });
    }
    const sum = k => r2(lines.reduce((a, l) => a + l[k], 0));
    const revenue = sum("line_revenue"), cost = sum("line_cost");
    return { market: market.id, currency: market.currency, margin, lines, warnings,
      totals: { units: lines.reduce((a, l) => a + l.qty, 0), revenue, cost, profit: r2(revenue - cost), margin: revenue ? Math.round((revenue - cost) / revenue * 10000) / 10000 : 0,
        max_days: lines.reduce((a, l) => Math.max(a, l.days), 0), unreachable: lines.filter(l => !l.reachable).map(l => l.product_id) } };
  }

  /** Sell price from the admin price list: list.products[pid][material|"_"][currency] = prices per list.tiers (ascending min_qty). */
  function listPrice(list, pid, materialId, currency, qty) {
    if (!list || !list.products) return null;
    const byMat = list.products[pid]; if (!byMat) return null;
    const row = (byMat[materialId || "_"] || byMat._ || null), arr = row && row[currency];
    if (!Array.isArray(arr) || !arr.length) return null;
    const tiers = list.tiers || [1]; let idx = 0;
    tiers.forEach((t, i) => { if (qty >= t && arr[i] != null) idx = i; });
    const v = Number(arr[idx]); return v > 0 ? r2(v) : null;
  }

  /** Effective print resolution of an image placed in a print area (mm). */
  function effectiveDpi(imgW, imgH, areaMm, mode, scale) {
    const wIn = areaMm[0] / 25.4, hIn = areaMm[1] / 25.4, s = Number(scale) || 1;
    if (!imgW || !imgH) return 0;
    if (mode === "tile") return Math.round(imgW / (wIn * 0.25 * s)); // a tile spans ~1/4 of the width at scale 1
    const fit = mode === "cover" ? Math.max(wIn / imgW, hIn / imgH) : Math.min(wIn / imgW, hIn / imgH);
    return Math.round(1 / (fit * s));
  }

  // ------------------------------------------------------------------ delivery
  const REGIONS = ["CH", "EU", "US"];
  function regionOf(data, country) {
    const c = String(country || "").toUpperCase();
    if (c === "CH" || c === "LI") return "CH";
    if (c === "US") return "US";
    if (data.eu_countries.includes(c)) return "EU";
    return null; // not served yet
  }
  const marketForRegion = (data, region) => data.markets.find(m => m.region === region);
  function parcel(data, facility, destRegion, weightKg, fx) {
    const r = data.shipping_rates[facility.region]?.[destRegion];
    return { cost: r2((r.base + r.per_kg * weightKg) * fx), days: facility.days + r.days, transit_days: r.days };
  }

  /**
   * fulfillment(data, input) — delivery cost & lead time in the market currency.
   *  mode "dropship": every end-customer order ships on its own (merchant) → per-product, per-region table + sample order
   *  mode "bulk":     everything to one address (company / individual) → one parcel per facility
   *  mode "multi":    one parcel per recipient and facility (company) → recipients [{country}], per_person {product_id: n}
   */
  function fulfillment(data, input) {
    const market = data.markets.find(m => m.id === input.market) || data.markets[0], fx = market.fx_from_eur;
    const items = (input.items || []).filter(i => data.products.some(p => p.id === i.product_id));
    const prod = id => data.products.find(p => p.id === id), warnings = [];
    const route = (p, region) => facilityFor(data, p, marketForRegion(data, region));
    if (input.mode === "dropship") {
      const table = items.map(i => { const p = prod(i.product_id);
        return { product_id: p.id, regions: Object.fromEntries(REGIONS.map(reg => { const f = route(p, reg); if (!f) return [reg, null]; const x = parcel(data, f.facility, reg, p.weight_g / 1000, fx); return [reg, { facility: f.facility.id, city: f.facility.city, cost: x.cost, days: x.days, cross_border: f.cross_border }]; })) }; });
      const sampleRegion = regionOf(data, input.sample_country || { CH: "CH", EU: "DE", US: "US" }[market.region]) || market.region;
      const sample = shipmentsFor(items.map(i => ({ ...i, qty: 1 })), sampleRegion);
      return { mode: "dropship", currency: market.currency, per_order: table, sample: { region: sampleRegion, ...sample }, total_cost: sample.cost, lead_days: sample.days, warnings };
    }
    function shipmentsFor(lines, region) { // group by facility → one parcel each
      const groups = {};
      for (const i of lines) { const p = prod(i.product_id), f = route(p, region); if (!f) { warnings.push(`no_route:${p.id}:${region}`); continue; }
        (groups[f.facility.id] ||= { facility: f.facility, weight_kg: 0, products: [] }); groups[f.facility.id].weight_kg += p.weight_g * (i.qty || 1) / 1000; groups[f.facility.id].products.push(p.id); }
      const shipments = Object.values(groups).map(g => { const x = parcel(data, g.facility, region, g.weight_kg, fx);
        return { facility: g.facility.id, city: g.facility.city, region, weight_kg: r2(g.weight_kg), cost: x.cost, days: x.days, products: g.products }; });
      return { shipments, cost: r2(shipments.reduce((a, s) => a + s.cost, 0)), days: shipments.reduce((a, s) => Math.max(a, s.days), 0) };
    }
    if (input.mode === "multi") {
      const per = input.per_person || {}, byRegion = {}, unsupported = [];
      for (const r of input.recipients || []) { const reg = regionOf(data, r.country); if (!reg) { unsupported.push(r.country); continue; } byRegion[reg] = (byRegion[reg] || 0) + 1; }
      const perPerson = items.map(i => ({ product_id: i.product_id, qty: Math.max(1, Number(per[i.product_id]) || 1) }));
      const regions = Object.entries(byRegion).map(([reg, n]) => { const one = shipmentsFor(perPerson, reg); return { region: reg, recipients: n, parcels: one.shipments.length * n, cost: r2(one.cost * n), days: one.days, per_recipient: one.cost }; });
      if (unsupported.length) warnings.push(`unsupported_countries:${[...new Set(unsupported)].join(",")}`);
      return { mode: "multi", currency: market.currency, recipients: regions.reduce((a, r) => a + r.recipients, 0), regions, parcels: regions.reduce((a, r) => a + r.parcels, 0),
        total_cost: r2(regions.reduce((a, r) => a + r.cost, 0)), lead_days: regions.reduce((a, r) => Math.max(a, r.days), 0), unsupported: [...new Set(unsupported)], warnings };
    }
    const region = regionOf(data, input.address_country) || market.region;
    const bulk = shipmentsFor(items, region);
    return { mode: "bulk", currency: market.currency, region, shipments: bulk.shipments, parcels: bulk.shipments.length, total_cost: bulk.cost, lead_days: bulk.days, warnings };
  }

  /** Earliest delivery date for a lead time (+ proof approval buffer), skipping weekends. */
  function deliveryDate(data, leadDays, from) {
    const d = new Date(from || Date.now()); let n = leadDays + (data.proof_buffer_days || 0);
    while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; }
    return d.toISOString().slice(0, 10);
  }

  /**
   * Packaging add-ons (consumer Studio display) — same rule as the server checkout quote (checkout-service packagingAndWarnings):
   * per line, Σ admin "Fees & tax" price of the selected ids the product supports, × units. fees = /api/storefront/fees.
   * CHF market → CHF prices; any other market → EUR prices (USD display converts EUR × fx_from_eur, the cart charges EUR).
   */
  function packagingAddon(data, fees, input) {
    const market = data.markets.find(m => m.id === input.market) || data.markets[0];
    const has = ["CHF", "EUR", "USD"].includes(market.currency) && Object.values(fees?.packaging || {}).some(p => p && p[market.currency] != null);
    const cur = has ? market.currency : market.currency === "CHF" ? "CHF" : "EUR", fx = market.currency === cur ? 1 : (market.fx_from_eur || 1);
    const sel = input.mode === "none" ? [] : (input.packaging || []);
    const price = id => r2(Number(fees?.packaging?.[id]?.[cur] || 0) * fx);
    const lines = (input.items || []).map(it => { const prod = data.products.find(p => p.id === it.product_id) || {};
      const unit = r2(sel.filter(id => (prod.packaging || []).includes(id)).reduce((a, id) => a + price(id), 0));
      return { product_id: it.product_id, unit, amount: r2(unit * (it.qty || 0)) }; });
    return { currency: market.currency, price, lines, total: r2(lines.reduce((a, l) => a + l.amount, 0)) };
  }

  g.StudioPricing = { quote, packagingAddon, listPrice, fulfillment, deliveryDate, regionOf, facilityFor, effectiveDpi, charm, r2 };
})(typeof globalThis !== "undefined" ? globalThis : window);
