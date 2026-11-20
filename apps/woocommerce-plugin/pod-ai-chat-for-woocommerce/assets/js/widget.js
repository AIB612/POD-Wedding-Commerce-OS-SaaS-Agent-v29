/* Pod.AI Chat for WooCommerce — storefront widget. Vanilla JS, no dependencies.
 * Talks to this site's REST routes only (pod-ai/v1/*, signed server-side) and, for actions the shopper asks for, to the
 * WooCommerce Store API in the shopper's own session: add to cart, apply a coupon. It never handles payment. */
(function () {
  var C = window.PodAIChat; if (!C || document.getElementById("pc-win")) return;
  var KEY = "podai_conv", conv = null, busy = false, opened = false, cfg = {}, nonce = C.storeNonce || "";
  try { conv = sessionStorage.getItem(KEY); } catch (e) {}
  var lg = String(C.lang || navigator.language || "en").toLowerCase(), LANG = ["zh", "de", "fr", "it"].filter(function (x) { return lg.indexOf(x) === 0; })[0] || "en";
  var I = {
    en: { online: "Online · replies instantly", hi: "Hi! Ask me about products, shipping or your order.", open: "Open chat", close: "Close chat", send: "Send", view: "View", add: "Add to cart", added: "Added ✓", checkout: "Checkout", cart: "View cart", track: "Track parcel", email: "Your e-mail", ok: "Send", err: "Sorry, the chat is not available right now.", chips: ["Show products", "Where is my order?", "Shipping costs"], by: "AI assistant · may make mistakes", reply: "We'll reply to {e}.", change: "Change e-mail", inCart: "{n} added to your cart.", addFail: "Couldn't add it — please open the product page.", apply: "Apply code", applied: "Code {c} applied to your cart.", applyFail: "Copy code {c} and enter it at checkout.", placeholder: "Write a message…" },
    de: { online: "Online · antwortet sofort", hi: "Hallo! Fragen Sie mich zu Produkten, Versand oder Ihrer Bestellung.", open: "Chat öffnen", close: "Chat schließen", send: "Senden", view: "Ansehen", add: "In den Warenkorb", added: "Hinzugefügt ✓", checkout: "Zur Kasse", cart: "Warenkorb", track: "Sendung verfolgen", email: "Ihre E-Mail", ok: "Senden", err: "Der Chat ist gerade nicht verfügbar.", chips: ["Produkte zeigen", "Wo ist meine Bestellung?", "Versandkosten"], by: "KI-Assistent · kann Fehler machen", reply: "Wir antworten an {e}.", change: "E-Mail ändern", inCart: "{n} liegt jetzt in Ihrem Warenkorb.", addFail: "Konnte nicht hinzugefügt werden – bitte die Produktseite öffnen.", apply: "Code einlösen", applied: "Code {c} wurde im Warenkorb eingelöst.", applyFail: "Code {c} kopieren und an der Kasse eingeben.", placeholder: "Ihre Frage…" },
    fr: { online: "En ligne · répond aussitôt", hi: "Bonjour ! Posez-moi vos questions sur les produits, la livraison ou votre commande.", open: "Ouvrir le chat", close: "Fermer le chat", send: "Envoyer", view: "Voir", add: "Ajouter au panier", added: "Ajouté ✓", checkout: "Commander", cart: "Panier", track: "Suivre le colis", email: "Votre e-mail", ok: "Envoyer", err: "Désolé, le chat est indisponible pour le moment.", chips: ["Voir les produits", "Où est ma commande ?", "Frais de livraison"], by: "Assistant IA · peut se tromper", reply: "Nous répondrons à {e}.", change: "Changer d'e-mail", inCart: "{n} est dans votre panier.", addFail: "Ajout impossible — ouvrez la page du produit.", apply: "Appliquer le code", applied: "Code {c} appliqué à votre panier.", applyFail: "Copiez le code {c} et saisissez-le au paiement.", placeholder: "Votre message…" },
    it: { online: "Online · risponde subito", hi: "Ciao! Chiedimi di prodotti, spedizioni o del tuo ordine.", open: "Apri la chat", close: "Chiudi la chat", send: "Invia", view: "Vedi", add: "Aggiungi al carrello", added: "Aggiunto ✓", checkout: "Vai alla cassa", cart: "Carrello", track: "Traccia il pacco", email: "La tua e-mail", ok: "Invia", err: "Spiacenti, la chat non è disponibile al momento.", chips: ["Mostra i prodotti", "Dov'è il mio ordine?", "Costi di spedizione"], by: "Assistente IA · può sbagliare", reply: "Risponderemo a {e}.", change: "Cambia e-mail", inCart: "{n} è nel tuo carrello.", addFail: "Impossibile aggiungerlo — apri la pagina del prodotto.", apply: "Applica il codice", applied: "Codice {c} applicato al carrello.", applyFail: "Copia il codice {c} e inseriscilo alla cassa.", placeholder: "Scrivi un messaggio…" },
    zh: { online: "在线 · 即时回复", hi: "你好！可以问我商品、运费或订单的问题。", open: "打开聊天", close: "关闭聊天", send: "发送", view: "查看", add: "加入购物车", added: "已加入 ✓", checkout: "去结账", cart: "购物车", track: "查看物流", email: "您的邮箱", ok: "发送", err: "抱歉，聊天暂时不可用。", chips: ["看看商品", "我的订单到哪了？", "运费多少"], by: "AI 助手 · 可能出错", reply: "我们会回复到 {e}。", change: "修改邮箱", inCart: "{n} 已加入购物车。", addFail: "没能加入购物车，请打开商品页面。", apply: "使用优惠码", applied: "优惠码 {c} 已用到购物车。", applyFail: "请复制优惠码 {c}，结账时填写。", placeholder: "输入您的问题…" }
  };
  var t = I[LANG] || I.en;
  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function svg(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"; }
  function post(url, body, headers) { return fetch(url, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), credentials: "same-origin", body: JSON.stringify(body) }); }
  function ev(type, extra) { try { post(C.api.event, Object.assign({ type: type, conversation_id: conv }, extra || {})).catch(function () {}); } catch (e) {} }

  var btn = el("button", "pc-l"), win = el("div", "pc-w"), head = el("div", "pc-h"), av = el("div", "pc-av"), tt = el("div", "pc-t"), name = el("b"), sub = el("small", null, t.online), x = el("button");
  var log = el("div", "pc-log"), form = el("form", "pc-f"), ta = el("textarea"), send = el("button"), foot = el("div", "pc-ft", t.by), live = el("div", "pc-sr");
  btn.type = "button"; btn.setAttribute("aria-label", t.open); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "pc-win");
  btn.innerHTML = svg('<path class="o" d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>').replace("<svg ", '<svg class="o" ') + svg('<path d="M18 6 6 18M6 6l12 12"/>').replace("<svg ", '<svg class="x" ');
  win.id = "pc-win"; win.setAttribute("role", "dialog"); win.setAttribute("aria-modal", "false"); win.setAttribute("aria-label", C.shop || "Chat");
  x.type = "button"; x.setAttribute("aria-label", t.close); x.innerHTML = svg('<path d="M6 9l6 6 6-6"/>');
  log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite"); live.setAttribute("aria-live", "polite");
  ta.rows = 1; ta.maxLength = 1000; ta.placeholder = t.placeholder; ta.setAttribute("aria-label", t.placeholder);
  send.type = "submit"; send.setAttribute("aria-label", t.send); send.innerHTML = svg('<path d="M5 12h14M13 6l6 6-6 6"/>');
  tt.append(name, sub); head.append(av, tt, x); form.append(ta, send); win.append(head, log, form, foot, live);

  function apply() {
    var w = cfg.widget || {}, color = /^#[0-9a-f]{6}$/i.test(w.color || "") ? w.color : C.color || "#2b2520", side = (w.position || C.position) === "left" ? "pc-lft" : "pc-r";
    [btn, win].forEach(function (n) { n.style.setProperty("--a", color); n.classList.remove("pc-lft", "pc-r"); n.classList.add(side); });
    name.textContent = w.title || C.title || C.shop || "Chat";
    av.textContent = String(name.textContent).trim().charAt(0).toUpperCase() || "P";
  }
  function relang(l) { if (I[l]) { LANG = l; t = I[l]; sub.textContent = t.online; foot.textContent = t.by; ta.placeholder = t.placeholder; } }
  apply();
  document.body.append(btn, win);
  fetch(C.api.config, { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : {}; }).then(function (c) {
    cfg = c || {}; if (cfg.enabled === false) { btn.remove(); win.remove(); return; }
    if (cfg.widget && cfg.widget.language && cfg.widget.language !== "auto") relang(cfg.widget.language);
    apply();
    try { var k = "podai_ping", n = Date.now(); if (!(n - (+localStorage.getItem(k) || 0) < 864e5)) { localStorage.setItem(k, n); ev("embed_ping"); } } catch (e) {}
  }).catch(function () {});

  function scroll() { log.scrollTop = log.scrollHeight; }
  function msg(cls, text) { var m = el("div", "pc-m " + cls, text); log.append(m); scroll(); return m; }
  function chips(items) { var c = el("div", "pc-ch"); items.forEach(function (s) { var b = el("button", null, s); b.type = "button"; b.onclick = function () { c.remove(); ask(s); }; c.append(b); }); log.append(c); scroll(); }
  function link(href) { try { var u = new URL(href, location.origin); if (u.origin === location.origin) { u.searchParams.set("utm_source", "podai"); u.searchParams.set("utm_medium", "chat"); } return u.toString(); } catch (e) { return href; } }
  function money(v, c) { if (!isFinite(v)) return ""; try { return new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "currency", currency: c || "USD" }).format(v); } catch (e) { return Number(v).toFixed(2) + " " + (c || ""); } }
  // WooCommerce Store API (shopper session): keep the rotating Nonce header; refresh mini-cart fragments afterwards
  function store(url, body) {
    return post(url, body, { Nonce: nonce }).then(function (r) { var n = r.headers.get("Nonce"); if (n) nonce = n; return r.json().then(function (d) { if (!r.ok) throw d; return d; }); });
  }
  function refreshCart() { try { if (window.jQuery) window.jQuery(document.body).trigger("wc_fragment_refresh"); document.body.dispatchEvent(new CustomEvent("wc-blocks_added_to_cart")); } catch (e) {} }
  function actions(text) {
    var a = el("div", "pc-act"); a.append(el("span", null, text));
    var go = el("a", "pc-sm pc-pri", t.checkout + " →"); go.href = link(cfg.checkout_url || C.checkoutUrl); go.onclick = function () { ev("checkout_click"); };
    a.append(go); log.append(a); scroll();
  }
  function addToCart(p, b) {
    b.disabled = true;
    store(C.api.addItem, { id: Number(p.cart.product_id), quantity: 1 }).then(function () {
      b.textContent = t.added; ev("add_to_cart", { product_id: p.id }); refreshCart(); actions(t.inCart.replace("{n}", p.name));
    }).catch(function () { b.disabled = false; msg("pc-a", t.addFail); });
  }
  function couponBlock(u) {
    var a = el("div", "pc-act"), cp = el("span", "pc-cp", u.code), b = el("button", "pc-sm pc-pri", t.apply); b.type = "button";
    if (u.summary) a.append(el("span", null, u.summary));
    a.append(cp, b); log.append(a);
    b.onclick = function () { b.disabled = true;
      store(C.api.applyCoupon, { code: u.code }).then(function () { ev("coupon_applied"); refreshCart(); a.remove(); actions(t.applied.replace("{c}", u.code)); })
        .catch(function () { b.disabled = false; msg("pc-a", t.applyFail.replace("{c}", u.code)); });
    };
  }
  function render(ui) {
    (ui || []).forEach(function (u) {
      if (u.type === "chips" && u.items && u.items.length) chips(u.items);
      if (u.type === "coupon" && u.code) couponBlock(u);
      if (u.type === "products") {
        var w = el("div", "pc-car"); w.setAttribute("role", "list");
        u.items.forEach(function (p) {
          if (!p.link) return;
          var c = el("div", "pc-pc"); c.setAttribute("role", "listitem");
          var im = el("a", "pc-img"); im.href = link(p.link); im.tabIndex = -1; im.onclick = function () { ev("product_click", { product_id: p.id }); };
          if (p.image) { var i = el("img"); i.src = p.image; i.alt = p.name; i.loading = "lazy"; i.width = 156; i.height = 156; im.append(i); }
          var b = el("div", "pc-b"); b.append(el("b", null, p.name), el("span", "pc-p", money(p.unit_price, p.currency)));
          var bt = el("div", "pc-btn"), v = el("a", null, t.view); v.href = link(p.link); v.onclick = im.onclick; bt.append(v);
          if (p.cart && p.cart.product_id && C.api.addItem) { var a = el("button", "pc-pri", t.add); a.type = "button"; a.onclick = function () { addToCart(p, a); }; bt.append(a); }
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
        r1.append(el("b", null, o.name), el("span", "pc-bd" + (/^fulfilled|delivered/.test(f) ? " ok" : ""), f)); oc.append(r1);
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
    post(C.api.chat, { message: text, conversation_id: conv, lang: LANG, page: location.pathname })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        ty.remove(); if (r.conversation_id) { conv = r.conversation_id; try { sessionStorage.setItem(KEY, conv); } catch (e) {} }
        if (r.language && I[r.language]) t = I[r.language];
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
    if (on && !opened) { opened = true; ev("chat_open"); var g = cfg.greeting && cfg.greeting[LANG]; msg("pc-a", C.greeting || g || t.hi); chips(t.chips); }
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
