(function () {
  var root = document.getElementById("wedai-chat-root");
  if (!root || root.dataset.ready) return; root.dataset.ready = "1";
  var d = root.dataset, accent = d.accent || "#1f2937", side = d.position === "left" ? "wdc-left" : "wdc-right", key = "wdc_conv";
  var conv = null; try { conv = sessionStorage.getItem(key); } catch (e) {}
  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  var btn = el("button", "wdc-btn " + side); btn.style.background = accent; btn.setAttribute("aria-label", d.title || "Chat");
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  var panel = el("div", "wdc-panel " + side), head = el("div", "wdc-head"), close = el("button", null, "×"), log = el("div", "wdc-log"), form = el("form", "wdc-form"), input = el("input"), send = el("button", null, "➤");
  head.style.background = accent; head.append(el("span", null, d.title || "Chat"), close);
  input.placeholder = d.placeholder || "Type your question…"; input.maxLength = 1000; send.type = "submit"; send.style.color = accent;
  form.append(input, send); panel.append(head, log, form); document.body.append(btn, panel);
  function msg(cls, text) { var m = el("div", "wdc-m " + cls, text); if (cls === "wdc-u") m.style.background = accent; log.append(m); log.scrollTop = 1e9; return m; }
  function render(ui) {
    (ui || []).forEach(function (u) {
      if (u.type === "chips") { var c = el("div", "wdc-chips"); u.items.forEach(function (t) { var b = el("button", null, t); b.type = "button"; b.onclick = function () { ask(t); }; c.append(b); }); log.append(c); }
      if (u.type === "products") { var w = el("div", "wdc-cards"); u.items.forEach(function (p) { var a = el("a", "wdc-card"); a.href = p.link; if (p.image) { var i = el("img"); i.src = p.image; i.alt = p.name; i.loading = "lazy"; a.append(i); }
        var t = el("div"); t.append(el("b", null, p.name)); if (isFinite(p.unit_price)) t.append(el("span", null, Number(p.unit_price).toFixed(2) + " " + (p.currency || ""))); a.append(t); w.append(a); }); log.append(w); }
    }); log.scrollTop = 1e9;
  }
  var busy = false;
  function ask(text, silent) {
    text = String(text || "").trim(); if (!text || busy) return; busy = true; if (!silent) msg("wdc-u", text); var typing = el("div", "wdc-typing", "…"); log.append(typing);
    fetch(d.proxy + "/chat", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ message: text, conversation_id: conv, lang: d.lang, page: location.pathname }) })
      .then(function (r) { return r.json(); })
      .then(function (r) { typing.remove(); if (r.conversation_id) { conv = r.conversation_id; try { sessionStorage.setItem(key, conv); } catch (e) {} } msg("wdc-a", r.answer || "Sorry, the chat is not available right now."); render(r.ui); })
      .catch(function () { typing.remove(); msg("wdc-a", "Sorry, the chat is not available right now."); })
      .finally(function () { busy = false; });
  }
  var opened = false;
  btn.onclick = function () { panel.classList.toggle("wdc-open"); if (!opened) { opened = true; ask(d.lang === "de" ? "Hallo" : d.lang === "zh-CN" || d.lang === "zh" ? "你好" : "Hello", true); } input.focus(); };
  close.onclick = function () { panel.classList.remove("wdc-open"); };
  form.onsubmit = function (e) { e.preventDefault(); var t = input.value; input.value = ""; ask(t); };
})();
