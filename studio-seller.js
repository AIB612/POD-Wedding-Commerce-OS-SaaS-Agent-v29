/* Seller (merchant) publish panel: Preview → Pricing → Shipping → Publish to Shopify. No checkout / payment.
 * Mockups are rendered client-side from the existing mockup layers + design (StudioMockups.render), exported as PNG,
 * uploaded to /api/seller/media (public URLs Shopify can fetch), then /api/seller/publish creates the product. */
(function () {
  const CUR = [["EUR", "EU"], ["CHF", "CH"], ["USD", "US"]];
  const STEPS = ["preview", "pricing", "shipping", "publish"];
  const LBL = { preview: "1 · Preview", pricing: "2 · Pricing", shipping: "3 · Shipping", publish: "4 · Publish" };
  const IMG_PX = 1600, MAX_IMGS = 4;
  let A, st = null;
  const $ = s => document.querySelector(s);
  const r2 = v => Math.round(Number(v) * 100) / 100;

  function css() {
    if (document.getElementById("sellerCss")) return;
    const s = document.createElement("style"); s.id = "sellerCss";
    s.textContent = `.seller-panel{width:min(860px,100%)!important;max-height:calc(100vh - 40px);overflow:auto;background:var(--paper);border-radius:24px;padding:22px 24px;box-shadow:var(--shadow)}
.seller-steps{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 16px}.seller-steps button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer}.seller-steps button.active{background:#292622;color:#fff;border-color:#292622}.seller-steps button.done:not(.active){background:var(--accent-soft)}
.seller-imgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}.seller-imgs figure{margin:0;background:#fff;border:1px solid var(--line);border-radius:14px;padding:8px;position:relative}.seller-imgs img{width:100%;display:block;border-radius:10px;background:#efe8df}.seller-imgs figcaption{font-size:11px;color:var(--muted);margin-top:4px;display:flex;justify-content:space-between}
.seller-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.seller-grid label,.seller-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)}.seller-grid input,.seller-field input,.seller-field select,.seller-field textarea{border:1px solid var(--line);border-radius:10px;padding:8px 10px;font:inherit;font-size:13px;color:var(--ink);background:#fff}
.seller-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:18px;flex-wrap:wrap}.seller-msg{font-size:12px;min-height:16px}.seller-why{font-size:12px;color:var(--warn,#9a6b00);max-width:340px;text-align:right}.seller-msg.bad{color:var(--bad)}.seller-msg.ok{color:var(--ok)}
.seller-zones{display:flex;gap:8px;flex-wrap:wrap}.seller-zones label{flex-direction:row;align-items:center;gap:5px;color:var(--ink)}
@media(max-width:720px){.seller-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }
  function shell() {
    let m = document.getElementById("sellerModal"); if (m) return m;
    m = document.createElement("div"); m.id = "sellerModal"; m.className = "modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "sellerTitle");
    m.innerHTML = `<div class="seller-panel"><div class="spread"><h2 id="sellerTitle" style="margin:0;font:28px Georgia,serif">Publish to Shopify</h2><button class="btn ghost" id="sellerClose" aria-label="Close">✕</button></div><nav class="seller-steps" id="sellerSteps"></nav><div id="sellerBody"></div><div class="seller-foot"><div class="seller-msg" id="sellerMsg" role="status"></div><div class="row" id="sellerNav"></div></div></div>`;
    document.body.appendChild(m);
    m.addEventListener("click", onClick); m.addEventListener("input", onInput); m.addEventListener("change", onInput);
    return m;
  }
  const msg = (t, cls = "") => { const e = $("#sellerMsg"); if (e) { e.textContent = t || ""; e.className = "seller-msg " + cls; } };

  // ---------------------------------------------------------------- data
  function suggest(pid, mid) {
    const out = { cost: {}, retail: {}, ship: {} }, p = A.prod(pid), kg = (p.weight_g || 200) / 1000, from = (p.facilities || []).includes("f_ch") ? "CH" : "EU";
    for (const [c, mk] of CUR) {
      const market = A.D.markets.find(m => m.id === mk);
      const q = A.P.quote(A.D, { market: mk, margin: A.S.margin, items: [{ product_id: pid, qty: 1, material_id: mid || undefined }], list: false }).lines[0];
      out.cost[c] = q ? q.unit_cost : 0; out.retail[c] = q ? q.price : 0;
      const rate = A.D.shipping_rates?.[from]?.[mk] || A.D.shipping_rates?.[mk]?.[mk];
      out.ship[c] = rate ? Math.ceil((rate.base + rate.per_kg * kg) * market.fx_from_eur * 10) / 10 - 0.1 : 0;
    }
    return out;
  }
  function newState() {
    const items = (A.sellerItems || A.finalItems)(); // sellers set their own retail; studio margin target does not exclude products here
    const pid = items[0]?.product_id;
    st = { step: "preview", items, pid, products: {}, conn: null, result: null, busy: false };
    items.forEach(i => initProduct(i.product_id));
  }
  function initProduct(pid) {
    if (st.products[pid]) return st.products[pid];
    const p = A.prod(pid), it = st.items.find(i => i.product_id === pid) || {}, sg = suggest(pid, it.material_id);
    return (st.products[pid] = { images: [], uploaded: [], sg, title: `${A.nm(p.name) || pid}${A.S.brand?.name ? " · " + A.S.brand.name : ""}`, description: "",
      prices: { ...sg.retail }, fee: { ...sg.ship }, processing: p.production_days ?? 3, weight: p.weight_g || 200, ship_from: (p.facilities || []).includes("f_ch") ? "CH" : "EU", zones: ["CH", "EU", "US"], status: "DRAFT", material_id: it.material_id || (p.materials || [])[0]?.id || "" });
  }
  const cur = () => st.products[st.pid];

  // ---------------------------------------------------------------- mockups
  function renderOne(pid, color) {
    return new Promise(res => {
      const cv = document.createElement("canvas"), it = st.items.find(i => i.product_id === pid) || { placement: {} }, pl = { ...A.effPl(it), ...(color ? { color } : {}) };
      let done = false; const fin = () => { if (done) return; done = true; let u = ""; try { u = cv.toDataURL("image/png"); } catch { u = ""; } res(u); };
      const p = A.prod(pid), go = () => A.M.render(cv, p, pl, A.S.design, { size: IMG_PX, clean: true, onPhotoLoad: () => { A.M.render(cv, p, pl, A.S.design, { size: IMG_PX, clean: true }); setTimeout(fin, 30); } });
      go(); if (!p.mockup_photo?.src) setTimeout(fin, 30); setTimeout(fin, 4000);
    });
  }
  function designOnly() {
    const c = A.S.design?.canvas; if (!c) return "";
    const px = IMG_PX, cv = document.createElement("canvas"); cv.width = cv.height = px; const x = cv.getContext("2d");
    x.fillStyle = "#fffdf9"; x.fillRect(0, 0, px, px); const f = Math.min(px * 0.84 / c.width, px * 0.84 / c.height);
    x.drawImage(c, (px - c.width * f) / 2, (px - c.height * f) / 2, c.width * f, c.height * f);
    try { return cv.toDataURL("image/png"); } catch { return ""; }
  }
  async function generate(pid) {
    const pr = st.products[pid], p = A.prod(pid), it = st.items.find(i => i.product_id === pid) || { placement: {} };
    pr.images = []; pr.uploaded = []; draw(); msg("Rendering mockups…");
    const base = it.placement?.color || p.colors?.[0] || null;
    const colors = [base, ...(p.colors || []).filter(c => c.toLowerCase() !== String(base || "").toLowerCase()).slice(0, 2)];
    for (const c of colors) { const u = await renderOne(pid, c); if (u) pr.images.push({ data: u, label: c ? `Colour ${c}` : "Mockup", on: true }); }
    const d = designOnly(); if (d) pr.images.push({ data: d, label: "Artwork", on: true });
    pr.images = pr.images.slice(0, MAX_IMGS);
    msg(pr.images.length ? `${pr.images.length} images ready (${IMG_PX}×${IMG_PX} PNG).` : "Could not render mockups.", pr.images.length ? "ok" : "bad"); draw();
  }
  async function upload(pr) {
    const want = pr.images.filter(i => i.on);
    if (!want.length) throw new Error("Select at least one image.");
    const urls = [];
    for (const im of want) {
      if (im.url) { urls.push(im.url); continue; }
      const r = await fetch("/api/seller/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data_url: im.data }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || `Image upload failed (${r.status})`);
      im.url = d.url; im.public = d.public; urls.push(d.url);
    }
    return urls;
  }

  // ---------------------------------------------------------------- views
  const money = (v, c) => A.money(v, c);
  function vPreview(pr) {
    const opts = st.items.length > 1 ? `<label class="seller-field" style="max-width:340px;margin-bottom:12px">Product<select id="sellerProd">${st.items.map(i => `<option value="${A.esc(i.product_id)}" ${i.product_id === st.pid ? "selected" : ""}>${A.esc(A.nm(A.prod(i.product_id).name))}</option>`).join("")}</select></label>` : "";
    const imgs = pr.images.length ? `<div class="seller-imgs">${pr.images.map((im, k) => `<figure><img src="${im.data}" alt="${A.esc(im.label)}"><figcaption><span>${A.esc(im.label)}</span><label><input type="checkbox" data-img="${k}" ${im.on ? "checked" : ""}> use</label></figcaption></figure>`).join("")}</div>`
      : `<div class="box note">No images yet.</div>`;
    return `${opts}<p class="note">Final product images rendered from your design on the studio mockups. Review the result before listing; adjust placement in the Design tab if needed.</p>${imgs}<div class="row" style="margin-top:12px"><button class="btn" id="sellerGen">↻ Regenerate</button></div>`;
  }
  function vPricing(pr) {
    const row = (lab, key, src) => CUR.map(([c]) => `<label>${lab} (${c})<input type="number" min="0" step="0.1" inputmode="decimal" data-${key}="${c}" value="${src[c] ?? ""}"></label>`).join("");
    const margin = c => { const pv = Number(pr.prices[c]), co = pr.sg.cost[c]; return pv > 0 ? Math.round((pv - co) / pv * 100) : 0; };
    const mats = A.prod(st.pid).materials || [];
    const matSel = mats.length ? `<label class="seller-field" style="margin-bottom:10px;max-width:340px">Material / variant<select id="sellerMat">${mats.map(m => `<option value="${A.esc(m.id)}" ${m.id === pr.material_id ? "selected" : ""}>${A.esc(A.nm(m.name) || m.id)}${m.delta_eur ? ` (${m.delta_eur > 0 ? "+" : "−"}€${Math.abs(m.delta_eur).toFixed(2)} cost)` : ""}</option>`).join("")}</select></label>` : "";
    return `${matSel}<label class="seller-field" style="margin-bottom:10px">Product title<input id="sellerTitle2" maxlength="255" value="${A.esc(pr.title)}"></label>
      <label class="seller-field" style="margin-bottom:14px">Description (optional)<textarea id="sellerDesc" rows="3" maxlength="5000">${A.esc(pr.description)}</textarea></label>
      <h3 style="margin:0 0 8px">Retail price</h3><div class="seller-grid">${row("Price", "price", pr.prices)}</div>
      <p class="note" style="margin-top:8px">Base cost: ${CUR.map(([c]) => money(pr.sg.cost[c], c)).join(" · ")} — margin ${CUR.map(([c]) => `${c} ${margin(c)}%`).join(" · ")}</p>
      <div class="row"><button class="btn sm" id="sellerSuggest">Use suggested retail (${CUR.map(([c]) => money(pr.sg.retail[c], c)).join(" / ")})</button></div>
      <p class="note">The price in your shop's currency becomes the variant price; the other two are pinned on matching Shopify Markets price lists when available, and always saved as a product metafield.</p>`;
  }
  function vShipping(pr) {
    const fee = CUR.map(([c]) => `<label>Shipping fee (${c})<input type="number" min="0" step="0.1" data-fee="${c}" value="${pr.fee[c] ?? ""}"></label>`).join("");
    return `<h3 style="margin:0 0 8px">Shipping fee per order</h3><div class="seller-grid">${fee}</div><p class="note" style="margin-top:6px">Suggested from our per-order dropship rates. Shopify charges shipping through your store's shipping profile — use these values for your rates.</p>
      <div class="seller-grid" style="margin-top:12px"><label>Processing time (days)<input type="number" min="0" max="60" id="sellerProc" value="${pr.processing}"></label><label>Weight (g)<input type="number" min="0" max="70000" id="sellerWeight" value="${pr.weight}"></label>
      <label>Ships from<select id="sellerFrom">${["CH", "EU", "US"].map(z => `<option ${pr.ship_from === z ? "selected" : ""}>${z}</option>`).join("")}</select></label></div>
      <div class="seller-field" style="margin-top:12px">Shipping zones<div class="seller-zones">${["CH", "EU", "US", "UK", "WORLD"].map(z => `<label><input type="checkbox" data-zone="${z}" ${pr.zones.includes(z) ? "checked" : ""}> ${z}</label>`).join("")}</div></div>`;
  }
  const matLabel = pr => { const m = (A.prod(st.pid).materials || []).find(x => x.id === pr.material_id); return m ? A.nm(m.name) || m.id : ""; };
  function vPublish(pr) {
    const c = st.conn, imgs = pr.images.filter(i => i.on);
    const conn = !c ? `<div class="box note">Checking Shopify connection…</div>`
      : c.connected ? `<div class="box"><b>✓ Shopify · ${A.esc(c.shop)}</b><div class="note">${c.currency ? `Shop currency ${A.esc(c.currency)}` : ""}</div></div>`
      : `<div class="box"><b>Connect your Shopify store</b> <button class="btn sm ghost" id="sellerRecheck" type="button">↻ Re-check</button><p class="note">${c.reason === "not_owner" ? "You are not signed in with this store. Sign in with Shopify to publish to it." : "No Shopify store is connected for this account yet."}</p>
         <div class="row"><input class="input" id="sellerShop" placeholder="your-store.myshopify.com" value="${A.esc(c.shop || A.shopifyShop() || "")}" style="min-width:240px"><button class="btn dark" id="sellerConnect">Connect Shopify</button></div></div>`;
    const res = st.result ? `<div class="box" style="border-color:#cfe5d6;background:#f3faf5"><b>✓ Product created in Shopify (${A.esc(st.result.status)})</b><div class="note">${st.result.images} images · prices synced: ${A.esc(st.result.prices_synced.join(", "))}</div>
      ${st.result.admin_url ? `<a class="btn dark" style="margin-top:8px" href="${A.esc(st.result.admin_url)}" target="_blank" rel="noopener" id="sellerAdminLink">Open in Shopify admin ↗</a>` : ""}${st.result.markets_note ? `<p class="note">ℹ ${A.esc(st.result.markets_note)}</p>` : ""}${(st.result.warnings || []).map(w => `<p class="note" style="color:var(--warn)">⚠ ${A.esc(w)}</p>`).join("")}</div>` : "";
    return `${conn}<div class="box"><h3 style="margin:0 0 6px">${A.esc(pr.title)}</h3><div class="note">${imgs.length} images · ${CUR.map(([k]) => money(pr.prices[k], k)).join(" / ")} · shipping ${CUR.map(([k]) => money(pr.fee[k], k)).join(" / ")} · ${pr.processing} d processing · ${pr.weight} g${matLabel(pr) ? ` · ${A.esc(matLabel(pr))}` : ""} · from ${pr.ship_from} → ${pr.zones.join(", ")}</div>
      <label class="seller-field" style="margin-top:10px;max-width:260px">Status in Shopify<select id="sellerStatus"><option value="DRAFT" ${pr.status === "DRAFT" ? "selected" : ""}>Draft (review in Shopify)</option><option value="ACTIVE" ${pr.status === "ACTIVE" ? "selected" : ""}>Active (visible)</option></select></label>
      <p class="note">No payment is taken: we produce and ship each order when a customer buys in your store.</p></div>${res}`;
  }
  function draw() {
    const pr = cur(); if (!pr) return;
    $("#sellerSteps").innerHTML = STEPS.map(s => `<button type="button" data-step="${s}" class="${st.step === s ? "active" : ""} ${STEPS.indexOf(s) < STEPS.indexOf(st.step) ? "done" : ""}">${LBL[s]}</button>`).join("");
    $("#sellerBody").innerHTML = ({ preview: vPreview, pricing: vPricing, shipping: vShipping, publish: vPublish })[st.step](pr);
    const i = STEPS.indexOf(st.step);
    const why = i === 3 && !st.busy ? publishBlock() : "";
    $("#sellerNav").innerHTML = `${i > 0 ? `<button class="btn" data-step="${STEPS[i - 1]}">← Back</button>` : ""}${i < 3 ? `<button class="btn dark" id="sellerNext" data-step="${STEPS[i + 1]}">Next →</button>` : `${why ? `<span class="seller-why" id="sellerWhy" role="status">${A.esc(why)}</span>` : ""}<button class="btn dark" id="sellerPublish" ${st.busy || why ? "disabled" : ""} ${why ? `aria-describedby="sellerWhy" title="${A.esc(why)}"` : ""}>${st.busy ? "Publishing…" : st.result ? "Publish again" : "⇪ Publish to Shopify"}</button>`}`;
  }
  /** Why the Publish button is disabled right now ("" = ready). Shown inline next to the button. */
  function publishBlock() {
    const c = st.conn;
    if (!c) return "Checking your Shopify connection…";
    if (!c.connected) {
      if (c.reason === "network") return "Couldn't reach the server to check your Shopify connection — use Re-check.";
      if (c.configured === false) return "Shopify publishing isn't configured on this site yet.";
      if (c.reason === "not_owner") return `Sign in with Shopify as ${c.shop} to publish there (Connect Shopify above).`;
      return c.shop ? `${c.shop} isn't connected yet — click Connect Shopify above.` : "Connect your Shopify store above to publish.";
    }
    for (const s of ["preview", "pricing", "shipping"]) { const v = validate(s); if (v) return v; }
    return "";
  }
  function validate(step) {
    const pr = cur();
    if (step === "preview" && !pr.images.some(i => i.on)) return "Generate and select at least one image.";
    if (step === "pricing") { for (const [c] of CUR) if (!(Number(pr.prices[c]) > 0)) return `Enter a retail price in ${c}.`; if (!pr.title.trim()) return "Enter a product title."; }
    if (step === "shipping") { for (const [c] of CUR) if (!(Number(pr.fee[c]) >= 0) || pr.fee[c] === "") return `Enter a shipping fee in ${c} (0 for free).`; if (!pr.zones.length) return "Choose at least one shipping zone.";
      const w = Number(pr.weight), d = Number(pr.processing); if (!(w >= 0 && w <= 70000) || pr.weight === "") return "Enter the weight in grams (0–70000)."; if (!(d >= 0 && d <= 60) || pr.processing === "") return "Enter a processing time of 0–60 days."; }
    return "";
  }
  async function loadConn(shop) {
    try { const r = await fetch(`/api/seller/shopify${shop ? `?shop=${encodeURIComponent(shop)}` : ""}`, { cache: "no-store", credentials: "same-origin" }); st.conn = await r.json(); }
    catch { st.conn = { connected: false, reason: "network" }; }
    if (!st.conn.connected && !shop && A.shopifyShop()) return loadConn(A.shopifyShop());
    if (st.step === "publish") draw();
  }
  async function publish() {
    const pr = cur(); st.busy = true; st.result = null; draw(); msg("Uploading images…");
    try {
      const images = await upload(pr); msg("Creating product in Shopify…");
      const body = { shop: st.conn.shop, product_id: st.pid, material_id: pr.material_id || undefined, title: pr.title, description: pr.description, status: pr.status, images,
        prices: Object.fromEntries(CUR.map(([c]) => [c, r2(pr.prices[c])])),
        shipping: { fee: Object.fromEntries(CUR.map(([c]) => [c, r2(pr.fee[c])])), processing_days: Number(pr.processing), weight_g: Number(pr.weight), ship_from: pr.ship_from, zones: pr.zones } };
      const r = await fetch("/api/seller/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) { st.conn = { ...st.conn, connected: false, reason: "not_connected" }; throw new Error(d.message || "Connect your Shopify store first."); }
      if (!r.ok) throw new Error(d.message || d.error || `Publish failed (${r.status})`);
      st.result = d; msg("Published.", "ok");
    } catch (e) { msg(e.message, "bad"); }
    finally { st.busy = false; draw(); }
  }

  // ---------------------------------------------------------------- events
  async function onClick(e) {
    const el = e.target.closest("button,a"); if (!el) { if (e.target.id === "sellerModal") close(); return; }
    if (el.id === "sellerClose") return close();
    if (el.dataset.step) {
      const to = el.dataset.step, fwd = STEPS.indexOf(to) > STEPS.indexOf(st.step);
      if (fwd) for (const s of STEPS.slice(0, STEPS.indexOf(to))) { const v = validate(s); if (v) { st.step = s; draw(); return msg(v, "bad"); } }
      st.step = to; msg(""); draw(); if (to === "publish" && !st.conn) loadConn(); return;
    }
    if (el.id === "sellerGen") return generate(st.pid);
    if (el.id === "sellerSuggest") { cur().prices = { ...cur().sg.retail }; return draw(); }
    if (el.id === "sellerPublish") return publish();
    if (el.id === "sellerRecheck") { st.conn = null; draw(); return loadConn(); }
    if (el.id === "sellerConnect") {
      const raw = ($("#sellerShop")?.value || "").trim().toLowerCase(), shop = /^[a-z0-9][a-z0-9-]*$/.test(raw) ? `${raw}.myshopify.com` : raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) return msg("Enter your store as your-store.myshopify.com", "bad");
      try { localStorage.setItem("pod-shopify-shop", shop); } catch {}
      location.href = `/api/shopify/app/login?shop=${encodeURIComponent(shop)}&return_to=${encodeURIComponent("/studio.html")}`;
    }
  }
  function onInput(e) {
    const el = e.target, pr = cur(), d = el.dataset; if (!pr) return;
    if (el.id === "sellerProd") { st.pid = el.value; st.result = null; if (!cur().images.length) generate(st.pid); else draw(); return; }
    if (el.id === "sellerMat") { if (pr.material_id === el.value) return; const sg = suggest(st.pid, el.value), same = CUR.every(([c]) => Number(pr.prices[c]) === Number(pr.sg.retail[c]));
      pr.material_id = el.value; pr.sg = sg; if (same) pr.prices = { ...sg.retail }; st.result = null; draw(); return; }
    if (d.img) { pr.images[+d.img].on = el.checked; return; }
    if (d.price) { pr.prices[d.price] = el.value; return; }
    if (d.fee) { pr.fee[d.fee] = el.value; return; }
    if (d.zone) { pr.zones = el.checked ? [...new Set([...pr.zones, d.zone])] : pr.zones.filter(z => z !== d.zone); return; }
    if (el.id === "sellerTitle2") pr.title = el.value; if (el.id === "sellerDesc") pr.description = el.value;
    if (el.id === "sellerProc") pr.processing = el.value; if (el.id === "sellerWeight") pr.weight = el.value;
    if (el.id === "sellerFrom") pr.ship_from = el.value; if (el.id === "sellerStatus") pr.status = el.value;
  }
  function close() { document.getElementById("sellerModal")?.classList.remove("open"); }
  function onKey(e) { if (e.key === "Escape") close(); }
  async function open() {
    A = window.StudioApp; if (!A) return;
    if (!A.S.design) { A.toast("Upload or create a design first"); return; }
    if (!(A.sellerItems || A.finalItems)().length) { A.toast("Select at least one product"); return; }
    css(); shell(); newState(); document.getElementById("sellerModal").classList.add("open"); document.addEventListener("keydown", onKey);
    msg(""); draw(); loadConn(); await generate(st.pid);
  }
  window.StudioSeller = { open, close, _state: () => st, _suggest: (pid, mid) => { A = window.StudioApp; return suggest(pid, mid); } };
})();
