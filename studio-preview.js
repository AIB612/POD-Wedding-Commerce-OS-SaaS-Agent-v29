/**
 * Enhanced Product Preview — Printful-style realistic mockups.
 * 
 * Features:
 * - Multi-angle views (front, back, detail)
 * - Realistic design placement with perspective
 * - AI design generation integration
 * - Print area visualization
 */
(function(g) {
  const ANGLES = {
    front: { label: "Front", icon: "⬜" },
    back: { label: "Back", icon: "🔲" },
    detail: { label: "Detail", icon: "🔍" },
    lifestyle: { label: "Lifestyle", icon: "🏠" }
  };

  // AI generation prompts for common design styles
  const AI_STYLES = [
    { id: "minimal", name: "Minimal", prompt: "minimal elegant design, clean lines, subtle" },
    { id: "floral", name: "Floral", prompt: "delicate floral pattern, botanical, wedding style" },
    { id: "geometric", name: "Geometric", prompt: "modern geometric pattern, abstract shapes" },
    { id: "typography", name: "Typography", prompt: "elegant typography, script font, monogram" },
    { id: "illustration", name: "Illustration", prompt: "hand-drawn illustration, artistic, unique" }
  ];

  function createPreviewUI(container, product, design, onAngleChange) {
    const angles = product.preview_angles || ["front"];
    const html = `
      <div class="preview-enhanced">
        <div class="preview-main">
          <canvas id="previewCanvas" width="600" height="600"></canvas>
          <div class="preview-overlay" id="previewOverlay"></div>
        </div>
        <div class="preview-angles">
          ${angles.map(a => `<button class="angle-btn ${a === 'front' ? 'active' : ''}" data-angle="${a}">${ANGLES[a]?.icon || '⬜'} ${ANGLES[a]?.label || a}</button>`).join('')}
        </div>
        <div class="preview-tools">
          <button class="tool-btn" id="aiGenerate">✨ AI Generate</button>
          <button class="tool-btn" id="showPrintArea">📐 Print Area</button>
        </div>
        <div class="ai-panel" id="aiPanel" hidden>
          <h4>AI Design Generator</h4>
          <div class="ai-styles">
            ${AI_STYLES.map(s => `<button class="style-btn" data-style="${s.id}">${s.name}</button>`).join('')}
          </div>
          <textarea id="aiPrompt" placeholder="Describe your design..."></textarea>
          <button class="btn dark" id="aiSubmit">Generate</button>
        </div>
      </div>
    `;
    container.innerHTML = html;
    bindEvents(container, product, design, onAngleChange);
    renderPreview(container.querySelector('#previewCanvas'), product, design, 'front');
  }

  function bindEvents(container, product, design, onAngleChange) {
    container.querySelectorAll('.angle-btn').forEach(btn => {
      btn.onclick = () => {
        container.querySelectorAll('.angle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const angle = btn.dataset.angle;
        renderPreview(container.querySelector('#previewCanvas'), product, design, angle);
        if (onAngleChange) onAngleChange(angle);
      };
    });
    container.querySelector('#aiGenerate').onclick = () => {
      container.querySelector('#aiPanel').hidden = !container.querySelector('#aiPanel').hidden;
    };
    container.querySelector('#showPrintArea').onclick = (e) => {
      e.target.classList.toggle('active');
      container.querySelector('#previewOverlay').classList.toggle('show-area');
    };
    container.querySelector('#aiSubmit').onclick = () => generateAI(container, product);
    container.querySelectorAll('.style-btn').forEach(btn => {
      btn.onclick = () => {
        const style = AI_STYLES.find(s => s.id === btn.dataset.style);
        container.querySelector('#aiPrompt').value = style?.prompt || '';
      };
    });
  }

  function renderPreview(canvas, product, design, angle) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#f8f4ef';
    ctx.fillRect(0, 0, w, h);
    
    // Load product mockup
    const img = new Image();
    const src = angle === 'front' ? product.mockup_photo?.src : 
                (product.mockup_photos?.[angle] || product.mockup_photo?.src);
    img.onload = () => {
      // Draw product
      const scale = Math.min(w / img.width, h / img.height) * 0.85;
      const pw = img.width * scale, ph = img.height * scale;
      const px = (w - pw) / 2, py = (h - ph) / 2;
      ctx.drawImage(img, px, py, pw, ph);
      
      // Draw design if present
      if (design?.canvas) {
        const area = product.mockup_photo?.area || [30, 25, 40, 50];
        const dx = px + (area[0] / 100) * pw;
        const dy = py + (area[1] / 100) * ph;
        const dw = (area[2] / 100) * pw;
        const dh = (area[3] / 100) * ph;
        
        ctx.save();
        // Perspective based on angle
        if (angle === 'detail') { ctx.transform(1.08, 0.03, -0.02, 1.04, dx * 0.02, dy * 0.01); }
        else if (angle === 'back') { ctx.transform(0.98, -0.01, 0.01, 0.98, 0, 0); }
        
        // Draw design with slight opacity for print effect
        ctx.globalAlpha = 0.95;
        ctx.drawImage(design.canvas, dx, dy, dw, dh);
        ctx.globalAlpha = 1;
        ctx.restore();
        
        // Fabric texture overlay
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        const gradient = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh);
        gradient.addColorStop(0, 'rgba(255,255,255,0.02)');
        gradient.addColorStop(0.5, 'rgba(0,0,0,0.04)');
        gradient.addColorStop(1, 'rgba(255,255,255,0.01)');
        ctx.fillStyle = gradient;
        ctx.fillRect(dx, dy, dw, dh);
        ctx.restore();
        
        // Edge softening
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        const edge = ctx.createLinearGradient(dx, dy, dx, dy + 8);
        edge.addColorStop(0, 'rgba(0,0,0,0.15)');
        edge.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = edge;
        ctx.fillRect(dx, dy, dw, 8);
        ctx.restore();
      }
    };
    img.src = src || '';
  }

  const AI_PRICE = { single: 2.90, pack10: 19.90, unlimited: 49.90 };
  
  function checkAIAccess() {
    // Check if user has AI credits or subscription
    const credits = parseInt(localStorage.getItem("pod-ai-credits") || "0");
    const sub = localStorage.getItem("pod-ai-sub");
    return { credits, hasSub: sub === "unlimited", canUse: credits > 0 || sub === "unlimited" };
  }
  
  function showPaywall(container) {
    const panel = container.querySelector('#aiPanel');
    panel.innerHTML = `
      <h4>✨ AI Design Generator</h4>
      <p style="font-size:13px;color:#7c746c;margin:0 0 16px">Generate unique designs with AI. Choose a plan:</p>
      <div class="ai-plans">
        <div class="ai-plan" data-plan="single"><b>Single</b><span>CHF ${AI_PRICE.single}</span><small>1 generation</small></div>
        <div class="ai-plan featured" data-plan="pack10"><b>Pack of 10</b><span>CHF ${AI_PRICE.pack10}</span><small>Best value</small></div>
        <div class="ai-plan" data-plan="unlimited"><b>Unlimited</b><span>CHF ${AI_PRICE.unlimited}/mo</span><small>No limits</small></div>
      </div>
      <button class="btn dark" id="aiPurchase" style="width:100%;margin-top:12px">Continue to payment</button>
    `;
    panel.querySelectorAll('.ai-plan').forEach(el => {
      el.onclick = () => { panel.querySelectorAll('.ai-plan').forEach(e => e.classList.remove('selected')); el.classList.add('selected'); };
    });
    panel.querySelector('#aiPurchase').onclick = () => {
      const plan = panel.querySelector('.ai-plan.selected')?.dataset.plan || 'single';
      location.href = `/checkout.html?addon=ai_${plan}`;
    };
  }

  async function generateAI(container, product) {
    const access = checkAIAccess();
    if (!access.canUse) { showPaywall(container); return; }

    const prompt = container.querySelector('#aiPrompt').value;
    const btn = container.querySelector('#aiSubmit');
    btn.disabled = true;
    btn.textContent = 'Generating...';
    try {
      const r = await fetch('/api/pod-agent/generate-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, product_type: product.shape || product.category })
      });
      const d = await r.json();
      if (d.image_url) {
        // Load generated image as design
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          if (g.StudioPreview?.onDesignGenerated) g.StudioPreview.onDesignGenerated({ canvas: c });
        };
        img.src = d.image_url;
      }
    } catch (e) {
      console.error('AI generation failed', e);
    }
    btn.disabled = false;
    btn.textContent = 'Generate';
  }

  g.StudioPreview = { createPreviewUI, renderPreview, ANGLES, AI_STYLES };
})(window);
