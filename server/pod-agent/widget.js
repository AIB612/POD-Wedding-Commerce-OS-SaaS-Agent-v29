/**
 * Wed.AI POD Agent widget — embed the customer chat on any website (same API as the homepage panel).
 *
 *   <script src="https://wed.swisspro.site/pod-agent/widget.js" data-lang="en" async></script>
 *
 * Attributes: data-lang (en | zh | de; default = page language), data-position (bottom-right | bottom-left),
 * data-api (API origin; default = the origin this script is loaded from), data-country (ISO-2 market hint).
 * Talks to POST {api}/api/pod-agent/chat (local-first answers on Wed.AI shop data). All text is rendered with
 * textContent; links are only https URLs or Wed.AI paths (made absolute to the API origin).
 * Programmatic: WedAIWidget.open(), .close(), .send("text").
 */
(function () {
  "use strict";
  if (window.WedAIWidget) return;
  var script = document.currentScript || document.querySelector('script[src*="/pod-agent/widget.js"]');
  var attr = function (n, d) { return (script && script.getAttribute(n)) || d; };
  var origin = (function () { try { return new URL(script.src, location.href).origin; } catch (e) { return ""; } })();
  var api = String(attr("data-api", origin)).replace(/\/$/, "");
  var lang = String(attr("data-lang", (document.documentElement.lang || navigator.language || "en"))).slice(0, 2).toLowerCase();
  if (["en", "zh", "de"].indexOf(lang) < 0) lang = "en";
  var left = /left/.test(attr("data-position", "bottom-right"));
  var country = String(attr("data-country", "")).toUpperCase().slice(0, 2);
  var T = {
    en: { title: "Wed.AI assistant", sub: "Products · prices & shipping · orders", ph: "Ask about products, shipping or your order…", send: "Send", hi: "Hi! I'm the Wed.AI assistant. Ask me for product ideas, a shipping quote or your order status.", err: "Sorry, the assistant can't be reached right now. Please try again.", open: "Open chat", close: "Close chat",
          chips: ["Shipping to Switzerland for 10 invitations", "Recommend wedding favours", "Track my order"] },
    zh: { title: "Wed.AI 助手", sub: "产品推荐 · 报价与运费 · 订单查询", ph: "询问产品、运费或订单…", send: "发送", hi: "您好！我是 Wed.AI 助手，可以为您推荐产品、报价运费或查询订单。", err: "抱歉，助手暂时无法连接，请稍后再试。", open: "打开对话", close: "关闭对话",
          chips: ["10 份邀请卡寄到瑞士运费多少", "推荐婚礼伴手礼", "查询我的订单"] },
    de: { title: "Wed.AI-Assistent", sub: "Produkte · Preise & Versand · Bestellungen", ph: "Fragen zu Produkten, Versand oder Bestellung…", send: "Senden", hi: "Hallo! Ich bin der Wed.AI-Assistent. Fragen Sie nach Produktideen, Versandkosten oder Ihrer Bestellung.", err: "Der Assistent ist gerade nicht erreichbar. Bitte später erneut versuchen.", open: "Chat öffnen", close: "Chat schliessen",
          chips: ["Versand in die Schweiz für 10 Einladungen", "Gastgeschenke empfehlen", "Meine Bestellung verfolgen"] }
  }[lang];
  var KEY = "wedai-widget-v1", S = { id: null };
  try { S = JSON.parse(sessionStorage.getItem(KEY) || "null") || S; } catch (e) {}
  var side = left ? "left" : "right";
  var css =
    ".wdw-btn{position:fixed;" + side + ":20px;bottom:20px;z-index:2147483000;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,#2b2520,#6b4f3a);color:#fff;box-shadow:0 10px 30px rgba(41,30,22,.35);display:grid;place-items:center;transition:transform .2s}" +
    ".wdw-btn:hover{transform:translateY(-2px) scale(1.04)}.wdw-btn svg{width:26px;height:26px}" +
    ".wdw{position:fixed;" + side + ":20px;bottom:90px;z-index:2147483000;width:370px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 120px);background:#fffdf9;border:1px solid rgba(45,36,30,.12);border-radius:22px;box-shadow:0 24px 60px rgba(41,30,22,.22);display:flex;flex-direction:column;overflow:hidden;font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#28231f}" +
    ".wdw[hidden]{display:none}.wdw *{box-sizing:border-box}" +
    ".wdw-h{padding:14px 16px;background:linear-gradient(135deg,#2b2520,#5a4232);color:#fff;display:flex;align-items:center;gap:10px}.wdw-h b{display:block;font:600 16px/1.2 Georgia,serif}.wdw-h span{display:block;font-size:11.5px;opacity:.75}.wdw-h button{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}" +
    ".wdw-m{flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;gap:8px}" +
    ".wdw-b{max-width:85%;padding:9px 12px;border-radius:16px;white-space:pre-wrap;word-wrap:break-word}.wdw-b.u{align-self:flex-end;background:#292622;color:#fff;border-bottom-right-radius:5px}.wdw-b.a{align-self:flex-start;background:#f2ebe5;border-bottom-left-radius:5px}.wdw-b a{color:#8a5a33;font-weight:600}" +
    ".wdw-q{align-self:stretch;background:#fff;border:1px solid rgba(45,36,30,.1);border-radius:14px;padding:8px 12px;font-size:12.5px}.wdw-q div{display:flex;justify-content:space-between;gap:8px;padding:4px 0}.wdw-q a{display:inline-block;margin-top:4px;color:#8a5a33;font-weight:600}" +
    ".wdw-c{display:flex;gap:6px;flex-wrap:wrap;padding:0 14px 8px}.wdw-c button{border:1px solid rgba(184,134,91,.45);background:#fbf6f0;color:#5b4433;border-radius:999px;padding:6px 10px;font:500 12px/1.2 inherit;font-family:inherit;cursor:pointer}" +
    ".wdw-f{display:flex;gap:6px;padding:10px;border-top:1px solid rgba(45,36,30,.1)}.wdw-f input{flex:1;min-width:0;border:1px solid rgba(45,36,30,.16);border-radius:12px;padding:10px 12px;font:inherit;outline:none}.wdw-f input:focus{border-color:#b8865b}.wdw-f button{border:0;border-radius:12px;background:#292622;color:#fff;padding:0 14px;font:600 13px inherit;font-family:inherit;cursor:pointer}" +
    ".wdw-p{font-size:10.5px;color:#9a9087;text-align:center;padding:0 10px 8px}" +
    "@media(max-width:480px){.wdw{" + side + ":12px;bottom:84px;height:calc(100vh - 110px)}}";
  function h(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function href(u) { u = String(u || ""); if (/^https:\/\//i.test(u)) return u; if (/^\/(?!\/)/.test(u)) return api + u; return null; }
  function rich(node, text) {
    var re = /(https:\/\/[^\s)]+|\/(?:studio\.html|account|shipping|returns|terms|privacy|checkout)[^\s),;。，]*)/g, last = 0, m; text = String(text || "");
    while ((m = re.exec(text))) { if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index))); var a = h("a", null, m[0]), u = href(m[0]); if (u) { a.href = u; a.target = "_blank"; a.rel = "noopener"; node.appendChild(a); } else node.appendChild(document.createTextNode(m[0])); last = m.index + m[0].length; }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  }
  var btn, panel, msgs, chips, input, busy = false;
  function bubble(role, text) { var b = h("div", "wdw-b " + role); rich(b, text); msgs.appendChild(b); msgs.scrollTop = msgs.scrollHeight; return b; }
  function setChips(list) { chips.textContent = ""; (list || []).slice(0, 4).forEach(function (c) { var b = h("button", null, c); b.type = "button"; b.onclick = function () { send(c); }; chips.appendChild(b); }); }
  function quote(u) {
    var q = h("div", "wdw-q"); var head = h("div"); head.appendChild(h("b", null, u.quantity + " × " + u.product)); head.appendChild(h("span", null, u.currency + " " + Number(u.subtotal).toFixed(2))); q.appendChild(head);
    (u.options || []).forEach(function (o) { var r = h("div"); r.appendChild(h("span", null, o.label + (o.arrives_from ? " · " + o.arrives_from.slice(5) + "–" + String(o.arrives_to || "").slice(5) : ""))); r.appendChild(h("b", null, o.free ? "0.00" : u.currency + " " + Number(o.price).toFixed(2))); q.appendChild(r); });
    var l = href(u.link); if (l) { var a = h("a", null, "→ " + (lang === "zh" ? "定制下单" : lang === "de" ? "Gestalten & bestellen" : "Personalise & order")); a.href = l; a.target = "_blank"; a.rel = "noopener"; q.appendChild(a); }
    msgs.appendChild(q);
  }
  function send(text) {
    text = String(text || "").trim(); if (!text || busy) return; busy = true; input.value = ""; setChips([]); bubble("u", text);
    var typing = bubble("a", "…");
    fetch(api + "/api/pod-agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, conversation_id: S.id || undefined, lang: lang, country: country || undefined, page: "embed:" + location.hostname }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        typing.remove(); if (d.conversation_id) { S.id = d.conversation_id; try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
        bubble("a", d.answer || T.err);
        (d.ui || []).forEach(function (u) { if (u.type === "quote") quote(u); else if (u.type === "chips") setChips(u.items); });
      })
      .catch(function () { typing.remove(); bubble("a", T.err); })
      .then(function () { busy = false; msgs.scrollTop = msgs.scrollHeight; });
  }
  function open() { panel.hidden = false; btn.setAttribute("aria-expanded", "true"); input.focus(); }
  function close() { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  function init() {
    var st = h("style"); st.textContent = css; document.head.appendChild(st);
    btn = h("button", "wdw-btn"); btn.type = "button"; btn.setAttribute("aria-label", T.open); btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>';
    panel = h("section", "wdw"); panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", T.title);
    var hd = h("div", "wdw-h"), id = h("div"); id.appendChild(h("b", null, T.title)); id.appendChild(h("span", null, T.sub)); hd.appendChild(id);
    var x = h("button", null, "×"); x.type = "button"; x.setAttribute("aria-label", T.close); x.onclick = close; hd.appendChild(x);
    msgs = h("div", "wdw-m"); msgs.setAttribute("aria-live", "polite"); chips = h("div", "wdw-c");
    var f = h("form", "wdw-f"); input = h("input"); input.maxLength = 1000; input.placeholder = T.ph; input.setAttribute("aria-label", T.ph);
    var sb = h("button", null, T.send); sb.type = "submit"; f.appendChild(input); f.appendChild(sb); f.onsubmit = function (e) { e.preventDefault(); send(input.value); };
    panel.appendChild(hd); panel.appendChild(msgs); panel.appendChild(chips); panel.appendChild(f);
    panel.appendChild(h("div", "wdw-p", lang === "zh" ? "请勿在对话中发送卡号或密码。" : lang === "de" ? "Bitte keine Karten- oder Passwortdaten senden." : "Never share card details or passwords in the chat."));
    document.body.appendChild(panel); document.body.appendChild(btn);
    btn.onclick = function () { panel.hidden ? open() : close(); };
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) close(); });
    bubble("a", T.hi); setChips(T.chips);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.WedAIWidget = { open: function () { open(); }, close: function () { close(); }, send: function (t) { open(); send(t); } };
})();
