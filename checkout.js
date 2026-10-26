/* 4-step guest checkout: (1) contact & address → (2) shipping method → (3) payment method (TWINT / PayPal) → (4) review & confirm.
 * Every amount comes from the server quote (/api/storefront/shipping/quote); the server re-quotes again on payment create. */
(function () {
  const CART_KEY = "pod-cart-v1", CO_KEY = "pod-checkout-v1";
  // CH/LI (CHF) · EU/EEA (EUR) · international (USD) — every country the shipping zones serve, so the checkout
  // country (which also drives the currency) never silently falls back to Switzerland/CHF.
  const COUNTRIES = ["CH", "LI", "DE", "AT", "FR", "IT", "NL", "BE", "LU", "ES", "PT", "IE", "DK", "SE", "FI", "PL", "CZ", "SK", "SI", "HU", "HR", "RO", "BG", "GR", "EE", "LV", "LT", "MT", "CY", "NO", "IS", "US", "GB", "CA", "AU", "NZ", "JP", "SG", "HK", "AE", "MX", "BR", "CN"];
  const LOCALE = { zh: "zh-CN", en: "en-GB", de: "de-CH" };
  const I = () => window.WeddingI18n || { k: x => x, t: x => x, lang: () => "en" };
  const K = (key, vars) => I().k(key, vars);
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n, cur) => new Intl.NumberFormat(I().lang() === "de" ? (cur === "EUR" ? "de-DE" : "de-CH") : (LOCALE[I().lang()] || "en-GB"), { style: "currency", currency: cur || "CHF" }).format(Number(n) || 0);

  let cart = [];
  try { cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]").filter(x => x && x.qty > 0); } catch (e) { cart = []; }
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CO_KEY) || "{}"); } catch (e) {}
  const FORM_KEY = "pod-checkout-form-v1"; // session-only copy of the form so PayPal cancel / failure returns to Review intact
  const state = { step: 1, quote: null, method: saved.method === "express" ? "express" : "standard", pay: null, methods: null, busy: false,
    promo: "", proof: cart.some(i => i.projectId) ? "proof" : "approve", notices: {} };
  const arrives = d => (window.PODDates ? window.PODDates.arrives(d) : "");

  const payload = () => cart.map(i => ({ product_id: i.productId || undefined, sku: i.sku, name: i.name, quantity: i.qty, material: i.material, material_id: i.materialId, customization: i.customization, project_id: i.projectId || undefined, sizes: i.sizes || undefined }));
  const val = id => $(id).value.trim();
  const addr = () => ({ name: val("name"), address1: val("address1"), address2: val("address2"), postal_code: val("postal"), city: val("city"), country: $("country").value, phone: val("phone") });

  function variant(i) {
    if (i.projectId) return [I().t(i.material || ""), sizesText(i.sizes), K("cart.studioDesign")].filter(Boolean).join(" · ");
    const v = i.mode === "upload" ? K("cart.files", { t: (i.files || []).join(", ") }) : i.mode === "later" ? K("cart.later") : (i.text ? K("cart.text", { t: i.text }) : K("cart.noText"));
    return [I().t(i.material || ""), v].filter(Boolean).join(" · ");
  }

  function sizesText(z) { return Object.entries(z || {}).filter(([, n]) => n > 0).map(([k, n]) => `${k}×${n}`).join(", "); }
  const thumbHtml = i => i.thumb ? `<img src="${esc(i.thumb)}" onerror="this.onerror=null;this.src='${esc(i.thumbOrig || "")}'" alt="" width="56" height="56">` : "";

  // Inline line notices: expired Studio design (re-open link) and "Price updated" since the line was added / last seen.
  function lineNotes(i, idx) {
    const q = state.quote, w = (q?.line_warnings || []).find(x => x.index === idx), out = [];
    if (w && w.code === "project_expired") out.push(`<span class="co-warn" role="alert">${esc(K("co.projectExpired"))} <a href="studio.html?project=${encodeURIComponent(i.projectId || "")}">${esc(K("co.reopenStudio"))}</a></span>`);
    const n = state.notices[i.id]; if (n) out.push(`<span class="co-note">${esc(K("co.priceUpdated", { old: money(n.old, q?.currency), now: money(n.now, q?.currency) }))}</span>`);
    return out.join("");
  }
  // Compare the quoted unit price with the one stored on the cart line; remember the new one.
  function trackPrices(q) {
    let dirty = false;
    cart.forEach((i, idx) => { const ql = q?.items?.[idx]; if (!ql) return;
      if (i.seenPrice && i.seenCurrency === q.currency && Number(i.seenPrice) !== Number(ql.unit_price)) state.notices[i.id] = { old: i.seenPrice, now: ql.unit_price };
      if (i.seenPrice !== ql.unit_price || i.seenCurrency !== q.currency) { i.seenPrice = ql.unit_price; i.seenCurrency = q.currency; dirty = true; } });
    if (dirty) try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {}
  }
  function fillCountries() {
    let dn = null;
    try { dn = new Intl.DisplayNames([LOCALE[I().lang()] || "en"], { type: "region" }); } catch (e) {}
    const cur = $("country").value || saved.country || (window.PODMarket ? PODMarket.country() : "CH");
    $("country").innerHTML = COUNTRIES.map(c => `<option value="${c}">${esc(dn ? dn.of(c) : c)}</option>`).join("");
    $("country").value = COUNTRIES.includes(cur) ? cur : ({ CH: "CH", EU: "DE", US: "US" }[window.PODMarket ? PODMarket.get() : "CH"] || "CH");
  }

  function renderSummary() {
    const q = state.quote, cur = q?.currency;
    $("sumLines").innerHTML = cart.map((i, idx) => {
      const ql = q?.items?.[idx];
      return `<div class="co-line"><div class="co-th">${thumbHtml(i)}<i>${i.qty}</i></div>
        <div><b>${esc(i.name)}</b><span>${esc(variant(i))}</span>${lineNotes(i, idx)}</div><strong>${ql ? money(ql.line_total, cur) : "—"}</strong></div>`;
    }).join("");
    $("sumSubtotal").textContent = q ? money(q.subtotal, cur) : "—";
    $("sumPackRow").hidden = !(q?.packaging_amount > 0); if (q?.packaging_amount > 0) $("sumPack").textContent = money(q.packaging_amount, cur);
    $("sumDiscRow").hidden = !q?.discount; if (q?.discount) { $("sumDiscLabel").textContent = K("co.discount", { c: q.discount.code }); $("sumDisc").textContent = "− " + money(q.discount.amount, cur); }
    const sel = q?.shipping_options?.find(o => o.id === state.method) || q?.shipping_options?.[0];
    $("sumArrives").textContent = sel?.delivery ? arrives(sel.delivery) : K("cart.trust.delivery");
    const shipKnown = q && state.step >= 2;
    $("sumShipping").textContent = shipKnown ? (q.shipping_amount === 0 ? K("co.free") : money(q.shipping_amount, cur)) : K("cart.shippingLater");
    const rate = q ? Math.round(Number(q.tax?.rate || 0) * 1000) / 10 : 0;
    $("sumTaxLabel").textContent = rate ? K(q?.prices_include_vat ? "co.taxIncl" : "co.tax", { rate }) : K("co.taxNone");
    $("sumTax").textContent = shipKnown ? money(q.tax.amount, cur) : "—";
    const total = q ? (shipKnown ? q.grand_total : q.subtotal) : null;
    $("sumTotal").textContent = total == null ? "—" : money(total, cur);
    $("sumToggleTotal").textContent = $("sumTotal").textContent;
    const fine = [];
    if (cur) fine.push(K("co.currencyNote", { c: cur }));
    if (cur === "EUR") fine.push(K("co.duties"));
    fine.push(K("co.serverNote"));
    $("sumFine").textContent = fine.join(" ");
    $("payLabel").textContent = q && state.step === 4 ? K("co.paySecure", { amount: money(q.grand_total, cur) }) : K("co.paySecure", { amount: "" }).trim();
  }

  async function fetchQuote(method) {
    const a = addr();
    let r;
    try { r = await fetch("/api/storefront/shipping/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cart: payload(), country: a.country, postal_code: a.postal_code, shipping_method: method || state.method, promo_code: state.promo || undefined, proof_choice: state.proof }) }); }
    catch (e) { throw Object.assign(new Error("network"), { code: "network" }); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || "generic"); e.code = d.error; throw e; }
    trackPrices(d);
    return d;
  }
  const errText = code => { if (code === "shipping_zone_not_found") return K("co.err.unsupported_country", { c: $("country").selectedOptions[0]?.textContent || $("country").value }); const k = "co.err." + (code || "generic"); const t = K(k); return t === k ? K("co.err.generic") : t; };
  function msg(id, text, kind = "err", retry) {
    const m = $(id); m.textContent = text || ""; m.className = "co-msg" + (text ? " show " + kind : "");
    if (text && retry) { const b = document.createElement("button"); b.type = "button"; b.className = "co-retry"; b.textContent = K("co.retry"); b.onclick = () => { msg(id, ""); retry(); }; m.appendChild(b); }
  }

  function setStep(n) {
    state.step = n;
    [1, 2, 3, 4].forEach(i => {
      const s = $("step" + i);
      s.classList.toggle("collapsed", i < n);
      s.classList.toggle("locked", i > n);
      s.setAttribute("aria-current", i === n ? "step" : "false");
    });
    document.querySelectorAll("#coProgress li").forEach(li => { const i = +li.dataset.step; li.classList.toggle("done", i < n); li.classList.toggle("active", i === n); });
    const a = addr();
    $("done1").innerHTML = esc(val("email")) + "<br>" + esc([a.name, a.address1, a.address2, `${a.postal_code} ${a.city}`, $("country").selectedOptions[0]?.textContent].filter(Boolean).join(", "));
    const opt = state.quote?.shipping_options?.find(o => o.id === state.method);
    $("done2").textContent = opt ? `${K(state.method === "express" ? "co.express" : "co.standard")} · ${arrives(opt.delivery) || K("co.days", { d: opt.eta_days })} · ${opt.amount === 0 ? K("co.free") : money(opt.amount, state.quote.currency)}` : "";
    $("done3").textContent = state.step > 3 && state.pay ? K(state.pay === "twint" ? "co.twint" : "co.paypal") : "";
    if (n === 4) renderReview();
    renderSummary();
    $("step" + n).scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- Step 1 ----
  function validate1() {
    let ok = true;
    const need = ["email", "name", "address1", "postal", "city", "country"];
    need.forEach(id => {
      const f = $(id).closest(".co-field"), v = val(id);
      let err = v ? "" : K("co.required");
      if (id === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) err = K("co.invalidEmail");
      f.classList.toggle("invalid", !!err); f.querySelector(".co-err").textContent = err;
      $(id).setAttribute("aria-invalid", err ? "true" : "false");
      if (err && ok) { $(id).focus(); ok = false; }
    });
    return ok;
  }
  $("form1").addEventListener("submit", async e => {
    e.preventDefault();
    if (!validate1()) return;
    try { localStorage.setItem(CO_KEY, JSON.stringify({ country: $("country").value, method: state.method })); } catch (e2) {}
    setStep(2);
    await loadShipping();
  });

  // ---- Step 2 ----
  async function loadShipping() {
    msg("msg2", "");
    $("shipOptions").innerHTML = `<div class="co-hint">${esc(K("co.loadingRates"))}</div>`;
    $("toStep3").disabled = true;
    try {
      if (state.method === "express" && !val("phone")) state.method = "standard";
      state.quote = await fetchQuote(state.method);
      renderShipping();
      $("toStep3").disabled = false;
    } catch (e) { $("shipOptions").innerHTML = ""; msg("msg2", errText(e.code), "err", e.code === "network" ? loadShipping : null); }
    renderSummary();
  }
  function renderShipping() {
    const q = state.quote, hasPhone = !!val("phone");
    $("shipOptions").innerHTML = q.shipping_options.map(o => {
      const dis = o.id === "express" && !hasPhone;
      return `<label class="co-opt${dis ? " disabled" : ""}"><input type="radio" name="ship" value="${o.id}" ${o.id === state.method ? "checked" : ""} ${dis ? "disabled" : ""}>
        <div><b>${esc(K(o.id === "express" ? "co.express" : "co.standard"))}</b>${o.carrier_name ? `<span class="co-carrier" style="display:block;font-size:12px;opacity:.75">${esc(K("co.via", { c: o.carrier_name }))}</span>` : ""}${o.delivery ? `<span class="co-eta" data-eta="${esc(o.delivery.from)}|${esc(o.delivery.to)}">${esc(arrives(o.delivery))}</span>` : ""}<span>${o.delivery ? esc(K("co.prodDays", { p: o.delivery.production_days, a: o.carrier_days[0], b: o.carrier_days[1] })) : esc(K("co.days", { d: o.eta_days }))}${dis ? " · " + esc(K("co.expressPhone")) : ""}</span></div>
        <strong>${o.amount === 0 ? esc(K("co.free")) : money(o.amount, q.currency)}</strong></label>`;
    }).join("");
  }
  $("shipOptions").addEventListener("change", async e => {
    if (e.target.name !== "ship") return;
    state.method = e.target.value;
    try { localStorage.setItem(CO_KEY, JSON.stringify({ country: $("country").value, method: state.method })); } catch (e2) {}
    $("toStep3").disabled = true;
    try { state.quote = await fetchQuote(state.method); renderShipping(); } catch (err) { msg("msg2", errText(err.code)); }
    $("toStep3").disabled = false; renderSummary();
  });
  $("toStep3").onclick = async () => { setStep(3); await loadPayments(); };

  // ---- Step 3 ----
  async function loadPayments() {
    if (!state.methods) {
      try { state.methods = await (await fetch("/api/payments/methods")).json(); } catch (e) { state.methods = { paypal: { configured: false }, twint: { configured: false } }; }
    }
    renderPayments(); renderReview(); renderSummary();
  }
  function renderPayments() {
    const cur = state.quote?.currency, m = state.methods || {};
    const twintOk = !!m.twint?.configured && cur === "CHF";
    const twintNote = !m.twint?.configured ? `<span class="co-soon">${esc(K("co.twintSoon"))}</span>` : "";
    const twintSub = m.twint?.configured && cur !== "CHF" ? K("co.twintChf") : K("co.twintDesc");
    if (!twintOk && state.pay === "twint") state.pay = null;
    if (!state.pay) state.pay = twintOk ? "twint" : "paypal";
    $("payOptions").innerHTML = `
      <label class="co-opt${twintOk ? "" : " disabled"}" data-method="twint"><input type="radio" name="pay" value="twint" ${state.pay === "twint" ? "checked" : ""} ${twintOk ? "" : "disabled"} aria-describedby="twintSub">
        <div><b>${esc(K("co.twint"))}${twintNote}</b><span id="twintSub">${esc(twintSub)}</span></div><span class="co-badge" aria-hidden="true">TWINT</span></label>
      <label class="co-opt" data-method="paypal"><input type="radio" name="pay" value="paypal" ${state.pay === "paypal" ? "checked" : ""}>
        <div><b>${esc(K("co.paypal"))}</b><span>${esc(m.paypal?.configured === false ? K("co.paypalDesc") : K("co.paypalDesc"))}</span></div><span class="co-badge" aria-hidden="true">PayPal</span></label>`;
  }
  $("payOptions").addEventListener("change", e => { if (e.target.name === "pay") state.pay = e.target.value; });
  $("toStep4").onclick = () => { msg("msg3", ""); if (!state.pay) { msg("msg3", K("co.choosePayment")); return; } setStep(4); };
  function renderReview() {
    const a = addr(), q = state.quote, cur = q?.currency, opt = q?.shipping_options?.find(o => o.id === state.method);
    $("review").innerHTML = `
      <div><dt>${esc(K("co.contact"))}</dt><dd>${esc(val("email"))}</dd></div>
      <div><dt>${esc(K("co.shipTo"))}</dt><dd>${esc([a.name, a.address1, a.address2, `${a.postal_code} ${a.city}`, $("country").selectedOptions[0]?.textContent || a.country].filter(Boolean).join(", "))}</dd></div>
      <div><dt>${esc(K("co.method"))}</dt><dd>${esc(opt ? `${K(state.method === "express" ? "co.express" : "co.standard")} · ${arrives(opt.delivery) || K("co.days", { d: opt.eta_days })}` : "—")}</dd></div>
      <div><dt>${esc(K("co.payment"))}</dt><dd>${esc(state.pay ? K(state.pay === "twint" ? "co.twint" : "co.paypal") : "—")}</dd></div>`;
    $("reviewLines").innerHTML = cart.map((i, idx) => { const ql = q?.items?.[idx];
      return `<div class="co-line"><div class="co-th">${thumbHtml(i)}<i>${i.qty}</i></div><div><b>${esc(i.name)}</b><span>${esc(variant(i))}</span>${i.projectId ? `<span class="co-design">✓ ${esc(K("co.designAttached"))}</span>` : ""}${lineNotes(i, idx)}</div>
        <strong>${ql ? money(ql.line_total, cur) : "—"}${ql && ql.quantity > 1 ? `<span>${esc(K("cart.each", { p: money(ql.unit_price, cur) }))}</span>` : ""}</strong></div>`; }).join("");
    const rate = q ? Math.round(Number(q.tax?.rate || 0) * 1000) / 10 : 0;
    renderProof(); renderPromo();
    $("reviewTotals").innerHTML = q ? `<div><span>${esc(K("cart.subtotal"))}</span><strong>${money(q.subtotal, cur)}</strong></div>
      ${q.packaging_amount > 0 ? `<div><span>${esc(K("co.packaging"))}</span><span>${money(q.packaging_amount, cur)}</span></div>` : ""}
      ${q.discount ? `<div class="co-disc" id="reviewDiscount"><span>${esc(K("co.discount", { c: q.discount.code }))}</span><span>− ${money(q.discount.amount, cur)}</span></div>` : ""}
      <div><span>${esc(K("cart.shipping"))}</span><span>${q.shipping_amount === 0 ? esc(K("co.free")) : money(q.shipping_amount, cur)}</span></div>
      <div><span>${esc(rate ? K(q.prices_include_vat ? "co.taxIncl" : "co.tax", { rate }) : K("co.taxNone"))}</span><span>${money(q.tax.amount, cur)}</span></div>
      <div class="total"><span>${esc(K("cart.total"))}</span><strong>${money(q.grand_total, cur)}</strong></div>` : "";
  }

  // ---- Proof choice (Printful-style): default "proof first" when the cart has Studio designs ----
  function renderProof() {
    $("proofOptions").innerHTML = ["approve", "proof"].map(v => `<label class="co-opt"><input type="radio" name="proof" value="${v}" ${state.proof === v ? "checked" : ""}>
      <div><b>${esc(K(v === "proof" ? "co.proofFirst" : "co.proofApprove"))}</b><span>${esc(K(v === "proof" ? "co.proofFirstSub" : "co.proofApproveSub"))}</span></div></label>`).join("");
  }
  $("proofOptions").addEventListener("change", async e => {
    if (e.target.name !== "proof") return; state.proof = e.target.value;
    try { state.quote = await fetchQuote(); } catch (err) { msg("msg4", errText(err.code)); }
    renderReview(); renderSummary(); setDone2();
  });
  function setDone2() { const opt = state.quote?.shipping_options?.find(o => o.id === state.method); if (opt) $("done2").textContent = `${K(state.method === "express" ? "co.express" : "co.standard")} · ${arrives(opt.delivery)} · ${opt.amount === 0 ? K("co.free") : money(opt.amount, state.quote.currency)}`; }
  // ---- Discount code (validated on the server quote) ----
  function renderPromo() {
    const d = state.quote?.discount;
    $("promoOn").hidden = !d; $("promoApply").parentElement.hidden = !!d;
    if (d) $("promoOnText").textContent = "✓ " + K("co.promoApplied", { c: d.code });
  }
  $("promoForm").addEventListener("submit", async e => {
    e.preventDefault(); msg("msgPromo", "");
    const code = $("promo").value.trim().toUpperCase(); if (!code) return;
    const prev = state.promo; state.promo = code; $("promoApply").disabled = true;
    try { state.quote = await fetchQuote(); $("promo").value = ""; }
    catch (err) { state.promo = prev; msg("msgPromo", errText(err.code), "err", err.code === "network" ? () => $("promoForm").requestSubmit() : null); }
    finally { $("promoApply").disabled = false; }
    renderReview(); renderSummary();
  });
  $("promoRemove").onclick = async () => { state.promo = ""; msg("msgPromo", ""); try { state.quote = await fetchQuote(); } catch (e) {} renderReview(); renderSummary(); };

  function saveForm() {
    try { sessionStorage.setItem(FORM_KEY, JSON.stringify({ email: val("email"), ...addr(), method: state.method, pay: state.pay, promo: state.promo, proof: state.proof })); } catch (e) {}
  }

  $("payBtn").onclick = async () => {
    msg("msg4", "");
    if (!$("terms").checked) { msg("msg4", K("co.acceptTerms")); $("terms").focus(); return; }
    if (state.busy) return;
    const a = addr();
    const body = { cart: payload(), customer: { name: a.name, email: val("email"), phone: a.phone }, shipping: a, shipping_method: state.method, currency: state.quote?.currency,
      promo_code: state.promo || undefined, proof_choice: state.proof, expected_total: state.quote?.grand_total };
    const url = state.pay === "twint" ? "/api/payments/twint/create" : "/api/payments/paypal/create";
    state.busy = true; const btn = $("payBtn"), lab = $("payLabel"), label = lab.textContent; btn.disabled = true; lab.textContent = K("co.paying");
    let redirecting = false;
    try {
      let r;
      try { r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
      catch (e) { throw Object.assign(new Error("network"), { code: "network" }); }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (state.pay === "twint" && /twint_not_(configured|implemented)/.test(d.error || "")) { state.methods.twint = { configured: false }; state.pay = "paypal"; renderPayments(); renderReview(); }
        throw Object.assign(new Error(d.error), { code: d.error });
      }
      if (d.approval_url) { saveForm(); redirecting = true; location.href = d.approval_url; return; }
      if (state.pay === "twint" && d.twint) { showTwint(d); return; }
      throw Object.assign(new Error("generic"), { code: "generic" });
    } catch (e) {
      if (e.code === "price_changed") { try { state.quote = await fetchQuote(); } catch (e2) {} renderReview(); renderSummary(); }
      if (e.code === "project_not_found") { try { state.quote = await fetchQuote(); } catch (e2) {} renderReview(); renderSummary(); }
      msg("msg4", errText(e.code), "err", e.code === "network" ? () => $("payBtn").click() : null);
    }
    // Double-submit protection: the button stays disabled while we hand over to PayPal.
    finally { if (!redirecting) { state.busy = false; btn.disabled = false; lab.textContent = label; } }
  };

  // TWINT: only reached once the server connector is implemented. Shows the code/QR and polls; never assumes success.
  function showTwint(d) {
    const box = $("twintBox"); box.hidden = false;
    box.innerHTML = `${d.twint.qr_code ? `<img src="${esc(d.twint.qr_code)}" alt="TWINT QR">` : ""}${d.twint.token ? `<div class="tok">${esc(d.twint.token)}</div>` : ""}${d.twint.app_url ? `<p><a class="co-btn" href="${esc(d.twint.app_url)}">TWINT</a></p>` : ""}`;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const s = await (await fetch(d.status_url)).json();
        if (s.status === "COMPLETED") { location.href = `/payment-success.html?order=${encodeURIComponent(d.order_id)}${d.order_token ? `&t=${d.order_token}` : ""}`; return; }
        if (s.status === "FAILED" || s.status === "CANCELLED") { msg("msg4", errText("generic")); return; }
      } catch (e) {}
      if (tries < 120) setTimeout(poll, 2500);
    };
    setTimeout(poll, 2500);
  }

  // ---- Sign in for faster checkout (optional; guest checkout always works) ----
  function prefill(p) {
    const a = p.shipping_address || {}, set = (id, v) => { if (v && $(id) && !$(id).value) $(id).value = v; };
    set("email", p.email); set("name", a.name || p.name); set("address1", a.address1); set("address2", a.address2);
    set("postal", a.postal_code); set("city", a.city); set("phone", a.phone);
    if (a.country && COUNTRIES.includes(a.country) && !saved.country) $("country").value = a.country;
  }
  async function initSignIn() {
    const A = window.PODAuth; if (!A?.ready) return;
    const user = await A.ready;
    const paint = () => {
      if (user) { $("coSigned").hidden = false; $("coFast").hidden = true; $("coSignedText").textContent = K("co.signedIn", { e: user.email }); return; }
      $("coFast").hidden = !(A.anyProvider ? A.anyProvider(A._prov) : true); $("coFastBtns").innerHTML = A.buttonsHtml(A._prov);
    };
    paint(); window.addEventListener("wedding-language-change", paint);
    $("coSignOut").onclick = () => A.logout();
    if (user) { try { const r = await fetch("/api/account/profile"); if (r.ok) prefill(await r.json()); } catch (e) {} }
  }

  // ---- shell ----
  document.querySelectorAll("[data-goto]").forEach(b => b.onclick = () => setStep(+b.dataset.goto));
  $("sumToggle").onclick = () => {
    const open = !$("coSum").classList.contains("open");
    $("coSum").classList.toggle("open", open); $("sumToggle").setAttribute("aria-expanded", String(open));
    $("sumToggleLabel").textContent = K(open ? "co.hideSummary" : "co.showSummary");
  };
  $("country").addEventListener("change", async () => {
    try { localStorage.setItem(CO_KEY, JSON.stringify({ country: $("country").value, method: state.method })); } catch (e) {}
    window.PODMarket?.setCountry($("country").value); // one shared market/currency: CH/LI → CHF, EU → EUR
    try { state.quote = await fetchQuote(); } catch (e) {}
    if (state.step >= 2) { setStep(2); await loadShipping(); } else renderSummary();
  });
  window.addEventListener("wedding-language-change", () => { fillCountries(); if (state.quote && state.step >= 2) renderShipping(); if (state.step >= 3) { renderPayments(); renderReview(); } setStep(state.step); });

  if (!cart.length) {
    // Empty cart: best-sellers, "Start designing" CTA and (signed in) saved designs — shared with the cart drawer (cart.js fillEmpty).
    $("coWrap").innerHTML = `<div class="co-empty pe-wide" style="grid-column:1/-1"><h2 style="font:28px Georgia,serif;font-weight:500;margin:0 0 6px">${esc(K("co.emptyCart"))}</h2><p style="color:#7c746c;margin:0 0 18px">${esc(K("empty.lead"))}</p><div class="cart-empty-ctas"><a class="cart-cta" href="/studio.html?scenario=gifts">${esc(K("empty.start"))}</a><a class="co-btn" style="display:inline-flex;align-items:center;text-decoration:none;width:auto;padding:0 20px" href="/">${esc(K("cart.empty.cta"))}</a></div><div id="coEmptyMore" style="max-width:980px;margin:0 auto"></div></div>`;
    window.PODCart?.fillEmpty($("coEmptyMore"), {});
    return;
  }
  fillCountries();
  // Postcode keyboard: numeric where postcodes are digits only, full keyboard elsewhere (NL, IE, PT, PL, CZ use letters / dashes / spaces).
  const postalMode = () => { $("postal").inputMode = ["NL", "IE", "PT", "PL", "CZ", "SE"].includes($("country").value) ? "text" : "numeric"; };
  postalMode(); $("country").addEventListener("change", postalMode);
  setStep(1);
  initSignIn();
  window.scrollTo(0, 0);
  const ret = new URLSearchParams(location.search).get("payment");
  let back = null; try { back = ret ? JSON.parse(sessionStorage.getItem(FORM_KEY) || "null") : null; } catch (e) {}
  if (back) {
    // Back from PayPal (cancelled / failed): restore the form and land on Review & confirm with a clear message.
    for (const [id, k] of [["email", "email"], ["name", "name"], ["address1", "address1"], ["address2", "address2"], ["postal", "postal_code"], ["city", "city"], ["phone", "phone"]]) if (back[k]) $(id).value = back[k];
    if (COUNTRIES.includes(back.country)) $("country").value = back.country;
    state.method = back.method === "express" ? "express" : "standard"; state.pay = back.pay || null; state.promo = back.promo || ""; state.proof = back.proof === "approve" ? "approve" : back.proof === "proof" ? "proof" : state.proof;
    (async () => {
      try { state.methods = await (await fetch("/api/payments/methods")).json(); } catch (e) { state.methods = { paypal: { configured: false }, twint: { configured: false } }; }
      try { state.quote = await fetchQuote(state.method); } catch (e) {}
      if (state.quote) { renderShipping(); renderPayments(); setStep(4); msg("msg4", K(ret === "cancelled" ? "co.cancelled" : "co.failed"), "err"); }
      history.replaceState(null, "", location.pathname);
    })();
  } else fetchQuote("standard").then(q => { state.quote = q; renderSummary(); }).catch(() => {});
})();
