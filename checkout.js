/* 3-step guest checkout: (1) contact & address → (2) shipping method → (3) payment (TWINT / PayPal) + review.
 * Every amount comes from the server quote (/api/storefront/shipping/quote); the server re-quotes again on payment create. */
(function () {
  const CART_KEY = "pod-cart-v1", CO_KEY = "pod-checkout-v1";
  const COUNTRIES = ["CH", "LI", "DE", "AT", "FR", "IT", "NL", "BE", "LU", "ES", "PT", "IE", "DK", "SE", "FI", "PL", "CZ"];
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
  const state = { step: 1, quote: null, method: saved.method === "express" ? "express" : "standard", pay: null, methods: null, busy: false };

  const payload = () => cart.map(i => ({ product_id: i.productId || undefined, sku: i.sku, name: i.name, quantity: i.qty, material: i.material, material_id: i.materialId, customization: i.customization }));
  const val = id => $(id).value.trim();
  const addr = () => ({ name: val("name"), address1: val("address1"), address2: val("address2"), postal_code: val("postal"), city: val("city"), country: $("country").value, phone: val("phone") });

  function variant(i) {
    const v = i.mode === "upload" ? K("cart.files", { t: (i.files || []).join(", ") }) : i.mode === "later" ? K("cart.later") : (i.text ? K("cart.text", { t: i.text }) : K("cart.noText"));
    return [I().t(i.material || ""), v].filter(Boolean).join(" · ");
  }

  function fillCountries() {
    let dn = null;
    try { dn = new Intl.DisplayNames([LOCALE[I().lang()] || "en"], { type: "region" }); } catch (e) {}
    const cur = $("country").value || saved.country || "CH";
    $("country").innerHTML = COUNTRIES.map(c => `<option value="${c}">${esc(dn ? dn.of(c) : c)}</option>`).join("");
    $("country").value = COUNTRIES.includes(cur) ? cur : "CH";
  }

  function renderSummary() {
    const q = state.quote, cur = q?.currency;
    $("sumLines").innerHTML = cart.map((i, idx) => {
      const ql = q?.items?.[idx];
      return `<div class="co-line"><div class="co-th">${i.thumb ? `<img src="${esc(i.thumb)}" onerror="this.onerror=null;this.src='${esc(i.thumbOrig || "")}'" alt="" width="56" height="56">` : ""}<i>${i.qty}</i></div>
        <div><b>${esc(i.name)}</b><span>${esc(variant(i))}</span></div><strong>${ql ? money(ql.line_total, cur) : "—"}</strong></div>`;
    }).join("");
    $("sumSubtotal").textContent = q ? money(q.subtotal, cur) : "—";
    const shipKnown = q && state.step >= 2;
    $("sumShipping").textContent = shipKnown ? (q.shipping_amount === 0 ? K("co.free") : money(q.shipping_amount, cur)) : K("cart.shippingLater");
    const rate = q ? Math.round(Number(q.tax?.rate || 0) * 1000) / 10 : 0;
    $("sumTaxLabel").textContent = rate ? K("co.tax", { rate }) : K("co.taxNone");
    $("sumTax").textContent = shipKnown ? money(q.tax.amount, cur) : "—";
    const total = q ? (shipKnown ? q.grand_total : q.subtotal) : null;
    $("sumTotal").textContent = total == null ? "—" : money(total, cur);
    $("sumToggleTotal").textContent = $("sumTotal").textContent;
    const fine = [];
    if (cur) fine.push(K("co.currencyNote", { c: cur }));
    if (cur === "EUR") fine.push(K("co.duties"));
    fine.push(K("co.serverNote"));
    $("sumFine").textContent = fine.join(" ");
    $("payBtn").textContent = q && state.step === 3 ? K("co.pay", { amount: money(q.grand_total, cur) }) : K("co.pay", { amount: "" }).trim();
  }

  async function fetchQuote(method) {
    const a = addr();
    const r = await fetch("/api/storefront/shipping/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cart: payload(), country: a.country, postal_code: a.postal_code, shipping_method: method || state.method }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || "generic"); e.code = d.error; throw e; }
    return d;
  }
  const errText = code => { const k = "co.err." + (code || "generic"); const t = K(k); return t === k ? K("co.err.generic") : t; };
  function msg(id, text, kind = "err") { const m = $(id); m.textContent = text || ""; m.className = "co-msg" + (text ? " show " + kind : ""); }

  function setStep(n) {
    state.step = n;
    [1, 2, 3].forEach(i => {
      const s = $("step" + i);
      s.classList.toggle("collapsed", i < n);
      s.classList.toggle("locked", i > n);
      s.setAttribute("aria-current", i === n ? "step" : "false");
    });
    document.querySelectorAll("#coProgress li").forEach(li => { const i = +li.dataset.step; li.classList.toggle("done", i < n); li.classList.toggle("active", i === n); });
    const a = addr();
    $("done1").innerHTML = esc(val("email")) + "<br>" + esc([a.name, a.address1, a.address2, `${a.postal_code} ${a.city}`, $("country").selectedOptions[0]?.textContent].filter(Boolean).join(", "));
    const opt = state.quote?.shipping_options?.find(o => o.id === state.method);
    $("done2").textContent = opt ? `${K(state.method === "express" ? "co.express" : "co.standard")} · ${K("co.days", { d: opt.eta_days })} · ${opt.amount === 0 ? K("co.free") : money(opt.amount, state.quote.currency)}` : "";
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
    } catch (e) { $("shipOptions").innerHTML = ""; msg("msg2", errText(e.code)); }
    renderSummary();
  }
  function renderShipping() {
    const q = state.quote, hasPhone = !!val("phone");
    $("shipOptions").innerHTML = q.shipping_options.map(o => {
      const dis = o.id === "express" && !hasPhone;
      return `<label class="co-opt${dis ? " disabled" : ""}"><input type="radio" name="ship" value="${o.id}" ${o.id === state.method ? "checked" : ""} ${dis ? "disabled" : ""}>
        <div><b>${esc(K(o.id === "express" ? "co.express" : "co.standard"))}</b><span>${esc(K("co.days", { d: o.eta_days }))}${dis ? " · " + esc(K("co.expressPhone")) : ""}</span></div>
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
  function renderReview() {
    const a = addr(), q = state.quote, opt = q?.shipping_options?.find(o => o.id === state.method);
    $("review").innerHTML = `
      <div><dt>${esc(K("co.contact"))}</dt><dd>${esc(val("email"))}</dd></div>
      <div><dt>${esc(K("co.shipTo"))}</dt><dd>${esc([a.name, a.address1, a.address2, `${a.postal_code} ${a.city}`, a.country].filter(Boolean).join(", "))}</dd></div>
      <div><dt>${esc(K("co.method"))}</dt><dd>${esc(opt ? `${K(state.method === "express" ? "co.express" : "co.standard")} · ${K("co.days", { d: opt.eta_days })}` : "—")}</dd></div>
      <div><dt>${esc(K("cart.total"))}</dt><dd><b>${q ? money(q.grand_total, q.currency) : "—"}</b></dd></div>`;
  }

  $("payBtn").onclick = async () => {
    msg("msg3", "");
    if (!$("terms").checked) { msg("msg3", K("co.acceptTerms")); $("terms").focus(); return; }
    if (state.busy) return;
    const a = addr();
    const body = { cart: payload(), customer: { name: a.name, email: val("email"), phone: a.phone }, shipping: a, shipping_method: state.method, currency: state.quote?.currency };
    const url = state.pay === "twint" ? "/api/payments/twint/create" : "/api/payments/paypal/create";
    state.busy = true; const btn = $("payBtn"), label = btn.textContent; btn.disabled = true; btn.textContent = K("co.paying");
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (state.pay === "twint" && /twint_not_(configured|implemented)/.test(d.error || "")) { state.methods.twint = { configured: false }; state.pay = "paypal"; renderPayments(); }
        throw Object.assign(new Error(d.error), { code: d.error });
      }
      if (d.approval_url) { location.href = d.approval_url; return; }
      if (state.pay === "twint" && d.twint) { showTwint(d); return; }
      throw Object.assign(new Error("generic"), { code: "generic" });
    } catch (e) { msg("msg3", errText(e.code)); }
    finally { state.busy = false; btn.disabled = false; btn.textContent = label; }
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
        if (s.status === "COMPLETED") { location.href = `/payment-success.html?order=${encodeURIComponent(d.order_id)}`; return; }
        if (s.status === "FAILED" || s.status === "CANCELLED") { msg("msg3", errText("generic")); return; }
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
      $("coFast").hidden = false; $("coFastBtns").innerHTML = A.buttonsHtml(A._prov);
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
    try { state.quote = await fetchQuote(); } catch (e) {}
    if (state.step >= 2) { setStep(2); await loadShipping(); } else renderSummary();
  });
  window.addEventListener("wedding-language-change", () => { fillCountries(); if (state.quote && state.step >= 2) renderShipping(); if (state.step === 3) { renderPayments(); renderReview(); } setStep(state.step); });

  if (!cart.length) {
    $("coWrap").innerHTML = `<div class="co-empty" style="grid-column:1/-1"><h2 style="font:24px Georgia,serif;font-weight:500">${esc(K("co.emptyCart"))}</h2><a class="co-btn" style="display:inline-flex;align-items:center;text-decoration:none" href="/">${esc(K("cart.empty.cta"))}</a></div>`;
    return;
  }
  fillCountries();
  setStep(1);
  initSignIn();
  window.scrollTo(0, 0);
  fetchQuote("standard").then(q => { state.quote = q; renderSummary(); }).catch(() => {});
})();
