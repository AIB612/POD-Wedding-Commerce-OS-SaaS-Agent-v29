/**
 * POD Agent Widget — Embeddable chat widget for any website.
 *
 * Usage (add to any site):
 *   <script src="https://your-domain/pod-agent/widget.js" data-tenant="YOUR_TENANT" data-lang="en"></script>
 *
 * Or programmatic:
 *   PODAgentWidget.init({ tenant: "xxx", position: "bottom-right", lang: "en" });
 */
(function() {
  const script = document.currentScript;
  const tenant = script?.getAttribute("data-tenant") || "demo";
  const lang = script?.getAttribute("data-lang") || "en";
  const position = script?.getAttribute("data-position") || "bottom-right";
  const apiBase = script?.getAttribute("data-api") || "";

  const I18N = {
    en: { title: "POD Assistant", placeholder: "Ask about products, orders, shipping...", send: "Send", greeting: "Hi! I can help with product listing, orders, and shipping." },
    zh: { title: "POD 助手", placeholder: "询问产品、订单、物流...", send: "发送", greeting: "你好！我可以帮你处理产品上架、订单和物流。" },
    de: { title: "POD Assistent", placeholder: "Fragen zu Produkten, Bestellungen...", send: "Senden", greeting: "Hallo! Ich helfe bei Produktlisting, Bestellungen und Versand." }
  };
  const t = I18N[lang] || I18N.en;

  const css = `
    .pod-agent-btn{position:fixed;${position.includes("right")?"right":"left"}:20px;${position.includes("bottom")?"bottom":"top"}:20px;width:56px;height:56px;border-radius:50%;background:#28231f;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.2);z-index:9999;font-size:24px}
    .pod-agent-panel{position:fixed;${position.includes("right")?"right":"left"}:20px;${position.includes("bottom")?"bottom":"top"}:86px;width:360px;max-width:calc(100vw - 40px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.15);z-index:9998;display:flex;flex-direction:column;overflow:hidden}
    .pod-agent-head{padding:14px 16px;background:#28231f;color:#fff;font-weight:600;display:flex;justify-content:space-between;align-items:center}
    .pod-agent-head button{background:none;border:none;color:#fff;cursor:pointer;font-size:18px}
    .pod-agent-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
    .pod-agent-msg{padding:10px 12px;border-radius:12px;max-width:85%;font-size:14px;line-height:1.4}
    .pod-agent-msg.user{background:#28231f;color:#fff;align-self:flex-end}
    .pod-agent-msg.bot{background:#f6f1eb;color:#28231f;align-self:flex-start}
    .pod-agent-input{display:flex;border-top:1px solid #eee;padding:8px}
    .pod-agent-input input{flex:1;border:none;padding:8px;font-size:14px;outline:none}
    .pod-agent-input button{background:#28231f;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer}
    @media(max-width:480px){.pod-agent-panel{width:calc(100vw - 24px);height:calc(100vh - 100px);${position.includes("right")?"right":"left"}:12px}}
  `;

  function init() {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.className = "pod-agent-btn";
    btn.innerHTML = "💬";
    btn.setAttribute("aria-label", t.title);
    document.body.appendChild(btn);

    const panel = document.createElement("div");
    panel.className = "pod-agent-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="pod-agent-head"><span>${t.title}</span><button aria-label="Close">×</button></div>
      <div class="pod-agent-msgs"><div class="pod-agent-msg bot">${t.greeting}</div></div>
      <form class="pod-agent-input"><input placeholder="${t.placeholder}" autocomplete="off"><button type="submit">${t.send}</button></form>
    `;
    document.body.appendChild(panel);

    const msgs = panel.querySelector(".pod-agent-msgs");
    const input = panel.querySelector("input");
    const form = panel.querySelector("form");

    btn.onclick = () => { panel.hidden = !panel.hidden; if (!panel.hidden) input.focus(); };
    panel.querySelector(".pod-agent-head button").onclick = () => { panel.hidden = true; };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      msgs.innerHTML += `<div class="pod-agent-msg user">${esc(text)}</div>`;
      msgs.scrollTop = msgs.scrollHeight;
      try {
        const r = await fetch(`${apiBase}/api/pod-agent/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, tenant, lang }) });
        const d = await r.json();
        msgs.innerHTML += `<div class="pod-agent-msg bot">${esc(d.answer || d.error || "...")}</div>`;
      } catch { msgs.innerHTML += `<div class="pod-agent-msg bot">Network error</div>`; }
      msgs.scrollTop = msgs.scrollHeight;
    };
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&", "<": "<", ">": ">", '"': """, "'": "&#39;" }[c])); }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.PODAgentWidget = { init };
})();
