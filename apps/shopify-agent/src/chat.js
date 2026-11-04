/* Pod.AI storefront chat (theme app embed). Vanilla JS, no dependencies; talks only to the shop's App Proxy (/apps/podai). */
(function () {
  var root = document.getElementById("podai-chat-root");
  if (!root || root.dataset.ready) return; root.dataset.ready = "1";
  var d = root.dataset, P = d.proxy, KEY = "podai_conv", conv = null, busy = false, opened = false, cfg = {};
  try { conv = sessionStorage.getItem(KEY); } catch (e) {}
  var lg = String(d.lang || navigator.language || "en").toLowerCase(), LANG = ["zh", "de", "fr", "it"].filter(function (x) { return lg.indexOf(x) === 0; })[0] || "en";
  // EN built in; other languages from chat-i18n.js (loaded by the embed block before this file)
  var EN = { online: "Online · replies instantly", hi: "Hi! Ask me about products, shipping or your order.", open: "Open chat", close: "Close chat", send: "Send", view: "View", add: "Add to cart", track: "Track parcel", email: "Your e-mail", ok: "Send", err: "Sorry, the chat is not available right now.", chips: ["Show products", "Where is my order?", "Shipping costs"], by: "AI assistant · may make mistakes", items: "Items", reply: "We'll reply to {e}.", change: "Change e-mail", thanks: "Thanks — our team will reply by e-mail." };
  // other languages from chat-i18n.js (deferred; looked up lazily)
  function tx(l) { var X = window.PodAIChatI18n || {}; return l === "en" ? EN : X[l] || EN; }

  var t = tx(LANG);
  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function svg(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; }
  function post(path, body) { return fetch(P + path, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) }); }
  function ev(type, extra) { try { post("/event", Object.assign({ type: type, conversation_id: conv }, extra || {})).catch(function () {}); } catch (e) {} }

  var btn = el("button", "pc-l"), win = el("div", "pc-w"), head = el("div", "pc-h"), av = el("div", "pc-av"), tt = el("div", "pc-t"), name = el("b"), sub = el("small", null, t.online), x = el("button");
  var log = el("div", "pc-log"), form = el("form", "pc-f"), ta = el("textarea"), send = el("button"), foot = el("div", "pc-ft", t.by), live = el("div", "pc-sr");
  btn.type = "button"; btn.setAttribute("aria-label", t.open); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "pc-win");
  btn.innerHTML = svg('<path class="o" d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>').replace('<svg ', '<svg class="o" ') + svg('<path d="M18 6 6 18M6 6l12 12"/>').replace('<svg ', '<svg class="x" ');
  win.id = "pc-win"; win.setAttribute("role", "dialog"); win.setAttribute("aria-modal", "false"); win.setAttribute("aria-label", d.shop || "Chat");
  x.type = "button"; x.setAttribute("aria-label", t.close); x.innerHTML = svg('<path d="M6 9l6 6 6-6"/>');
  log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite"); live.setAttribute("aria-live", "polite");
  ta.rows = 1; ta.maxLength = 1000; ta.placeholder = d.placeholder || ({ en: "Write a message…", zh: "输入您的问题…", de: "Ihre Frage…", fr: "Votre message…", it: "Scrivi un messaggio…" })[LANG]; ta.setAttribute("aria-label", ta.placeholder);
  send.type = "submit"; send.setAttribute("aria-label", t.send); send.innerHTML = svg('<path d="M5 12h14M13 6l6 6-6 6"/>');
  tt.append(name, sub); head.append(av, tt, x); form.append(ta, send); win.append(head, log, form, foot, live);

  function apply() {
    var color = /^#[0-9a-f]{6}$/i.test(d.accent || "") ? d.accent : (cfg.widget && cfg.widget.color) || "#2b2520";
    var pos = d.position === "left" || d.position === "right" ? d.position : (cfg.widget && cfg.widget.position) || "right";
    var side = pos === "left" ? "pc-lft" : "pc-r";
    [btn, win].forEach(function (n) { n.style.setProperty("--a", color); n.classList.remove("pc-lft", "pc-r"); n.classList.add(side); });
    name.textContent = d.title || (cfg.widget && cfg.widget.title) || d.shop || "Chat";
    var img = d.avatar || (cfg.widget && cfg.widget.avatar);
    av.innerHTML = ""; if (img) { var i = el("img"); i.src = img; i.alt = ""; av.append(i); } else av.textContent = String(name.textContent).trim().charAt(0).toUpperCase() || "P";
  }
  apply();
  document.body.append(btn, win);
  fetch(P + "/config", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (c) {
    cfg = c || {}; if (cfg.enabled === false) { btn.remove(); win.remove(); return; }
    if (cfg.widget && cfg.widget.language && cfg.widget.language !== "auto" && ["en", "zh", "de", "fr", "it"].indexOf(cfg.widget.language) >= 0) { LANG = cfg.widget.language; t = tx(LANG); sub.textContent = t.online; foot.textContent = t.by; }
    apply();
  }).catch(function () {});

  function scroll() { log.scrollTop = log.scrollHeight; }
  function msg(cls, text) { var m = el("div", "pc-m " + cls, text); log.append(m); scroll(); return m; }
  function chips(items) { var c = el("div", "pc-ch"); items.forEach(function (s) { var b = el("button", null, s); b.type = "button"; b.onclick = function () { c.remove(); ask(s); }; c.append(b); }); log.append(c); scroll(); }
  function link(href) { try { var u = new URL(href, location.origin); if (u.origin === location.origin) { u.searchParams.set("utm_source", "podai"); u.searchParams.set("utm_medium", "chat"); } return u.toString(); } catch (e) { return href; } }
  function money(v, c) { if (!isFinite(v)) return ""; try { return new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "currency", currency: c || "USD" }).format(v); } catch (e) { return Number(v).toFixed(2) + " " + (c || ""); } }
  function render(ui) {
    (ui || []).forEach(function (u) {
      if (u.type === "chips" && u.items && u.items.length) chips(u.items);
      if (u.type === "products") {
        var w = el("div", "pc-car"); w.setAttribute("role", "list");
        u.items.forEach(function (p) {
          if (!p.link) return; // not on the Online Store → no card
          var c = el("div", "pc-pc"); c.setAttribute("role", "listitem");
          var im = el("a", "pc-img"); im.href = link(p.link); im.tabIndex = -1; im.onclick = function () { ev("product_click", { product_id: p.id }); };
          if (p.image) { var i = el("img"); i.src = p.image + (p.image.indexOf("?") < 0 ? "?width=320" : ""); i.alt = p.name; i.loading = "lazy"; i.width = 156; i.height = 156; im.append(i); }
          var b = el("div", "pc-b"); b.append(el("b", null, p.name), el("span", "pc-p", money(p.unit_price, p.currency)));
          var bt = el("div", "pc-btn"), v = el("a", null, t.view); v.href = link(p.link); v.onclick = im.onclick; bt.append(v);
          if (p.variant_id) { var a = el("a", "pc-pri", t.add); a.href = "/cart/add?id=" + encodeURIComponent(p.variant_id) + "&quantity=1&utm_source=podai&utm_medium=chat"; a.onclick = function () { ev("add_to_cart", { product_id: p.id }); }; bt.append(a); }
          b.append(bt); c.append(im, b); w.append(c);
        });
        log.append(w);
        if (u.note) log.append(el("div", "pc-note", u.note));
      }
      if (u.type === "handoff") {
        if (u.email) { var hr = el("div", "pc-hf pc-hr"), sp = el("span", null, t.reply.replace("{e}", u.email)), ch = el("button", "pc-sm", t.change); ch.type = "button"; ch.style.flex = "0 0 auto";
          ch.onclick = function () { hr.remove(); emailForm(); }; hr.append(sp, ch); log.append(hr); }
        else emailForm();
      }
      if (u.type === "order" && u.order) {
        var o = u.order, oc = el("div", "pc-oc"), r1 = el("div", "pc-r1"), f = String(o.cancelled ? "cancelled" : o.fulfillment || "").toLowerCase().replace(/_/g, " ");
        var bd = el("span", "pc-bd" + (/^fulfilled|delivered/.test(f) ? " ok" : ""), f); r1.append(el("b", null, o.name), bd); oc.append(r1);
        oc.append(el("div", "pc-mu", (o.items || []).map(function (i) { return i.quantity + "× " + i.title; }).join(", ")));
        log.append(oc);
      }
      if (u.type === "tracking") {
        var tc = el("div", "pc-oc"), h = el("div", "pc-r1"); h.append(el("b", null, u.carrier || "")); h.append(el("span", "pc-mu", u.number)); if (u.status) h.append(el("span", "pc-bd", u.status)); tc.append(h);
        if (u.events && u.events.length) { var ul = el("ul", "pc-tl"); u.events.slice(0, 4).forEach(function (e) { var li = el("li"); li.append(el("b", null, e.text || ""), el("span", "pc-mu", [e.time && String(e.time).slice(0, 16).replace("T", " "), e.location].filter(Boolean).join(" · "))); ul.append(li); }); tc.append(ul); }
        if (u.url) { var l = el("a", "pc-sm pc-pri", t.track + " →"); l.href = u.url; l.target = "_blank"; l.rel = "noopener"; tc.append(l); }
        log.append(tc);
      }
    }); scroll();
  }
  function emailForm() {
    var f = el("form", "pc-hf"), i = el("input"), b = el("button", "pc-sm pc-pri", t.ok);
    i.type = "email"; i.required = true; i.placeholder = t.email; i.autocomplete = "email"; i.setAttribute("aria-label", t.email); b.type = "submit"; b.style.flex = "0 0 auto";
    f.append(i, b); f.onsubmit = function (e) { e.preventDefault(); if (!i.checkValidity()) return; var v = i.value; f.remove(); ask(v, false, true); };
    log.append(f); scroll(); setTimeout(function () { i.focus(); }, 50);
  }
  function ask(text, silent, isEmail) {
    text = String(text || "").trim(); if (!text || busy) return; busy = true; send.disabled = true;
    if (!silent) msg("pc-u", text);
    var ty = el("div", "pc-ty"); ty.innerHTML = "<i></i><i></i><i></i>"; ty.setAttribute("aria-label", "…"); log.append(ty); scroll();
    post("/chat", { message: text, conversation_id: conv, lang: LANG, page: location.pathname })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        ty.remove(); if (r.conversation_id) { conv = r.conversation_id; try { sessionStorage.setItem(KEY, conv); } catch (e) {} }
        if (r.language) t = tx(r.language); // cards + chips follow the language of this reply
        msg("pc-a", r.answer || t.err); live.textContent = r.answer || ""; render(r.ui);
        var hasHo = (r.ui || []).some(function (u) { return u.type === "handoff"; });
        if (r.handoff && !hasHo && !isEmail && /e-?mail|邮箱/i.test(r.answer || "")) emailForm();
      })
      .catch(function () { ty.remove(); msg("pc-a", t.err); })
      .then(function () { busy = false; send.disabled = false; });
  }
  function toggle(on) {
    on = on == null ? !win.classList.contains("pc-on") : on;
    win.classList.toggle("pc-on", on); btn.setAttribute("aria-expanded", String(on)); btn.setAttribute("aria-label", on ? t.close : t.open);
    if (on && !opened) { t = tx(LANG); sub.textContent = t.online; foot.textContent = t.by; opened = true; ev("chat_open");
      var g = cfg.greeting && cfg.greeting[LANG]; msg("pc-a", d.greeting || g || t.hi); chips(t.chips); }
    if (on) setTimeout(function () { if (window.innerWidth > 520) ta.focus(); }, 250); else btn.focus();
    if (window.innerWidth <= 520) document.documentElement.style.overflow = on ? "hidden" : "";
  }
  btn.onclick = function () { toggle(); };
  x.onclick = function () { toggle(false); };
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && win.classList.contains("pc-on")) toggle(false); });
  ta.addEventListener("input", function () { ta.style.height = "auto"; ta.style.height = Math.min(110, ta.scrollHeight) + "px"; });
  ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.onsubmit(e); } });
  form.onsubmit = function (e) { e.preventDefault(); var v = ta.value; ta.value = ""; ta.style.height = "auto"; ask(v); };
  if (/[?&]podai=open/.test(location.search)) toggle(true);
})();
