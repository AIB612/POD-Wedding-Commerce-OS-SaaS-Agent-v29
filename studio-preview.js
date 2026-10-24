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
        // Apply slight perspective for realism
        if (angle === 'detail') ctx.transform(1.1, 0.02, -0.02, 1.05, 0, 0);
        ctx.drawImage(design.canvas, dx, dy, dw, dh);
        ctx.restore();
        
        // Add subtle shadow/blend
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgba(0,0,0,0.03)';
        ctx.fillRect(dx, dy, dw, dh);
        ctx.globalCompositeOperation = 'source-over';
      }
    };
    img.src = src || '';
  }

  async function generateAI(container, product) {
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
