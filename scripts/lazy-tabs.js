// scripts/lazy-tabs.js — Defer Safety/Quality data until first open (idempotent)
(function () {
  // --- helpers ---
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function norm(s){ return String(s || "").trim().toLowerCase(); }

  // Find a tab button by:
  //   1) explicit id, or
  //   2) [data-tab="safety"/"quality"], or
  //   3) button text “Safety”/“Quality”
  function findTabButton(kind) {
    const idMap = { safety: ['#tabSafety', '#btnSafety'], quality: ['#tabQuality', '#btnQuality'] };
    for (const sel of (idMap[kind] || [])) { const el = $(sel); if (el) return el; }
    const data = $(`[data-tab="${kind}"]`); if (data) return data;
    // fallback: match by visible text
    const buttons = $all('button, [role="tab"], .tab-buttons .tab, .tab-buttons button');
    const target = kind === 'safety' ? 'safety' : 'quality';
    return buttons.find(b => norm(b.textContent).includes(target)) || null;
  }

  // Find a content container:
  //   1) explicit id, or
  //   2) [data-panel="safety"/"quality"], or
  //   3) panel with aria-labelledby=button.id
  function findPanel(kind, btn) {
    const idMap = { safety: ['#panelSafety', '#safetyPanel', '#safety'], quality: ['#panelQuality', '#qualityPanel', '#quality'] };
    for (const sel of (idMap[kind] || [])) { const el = $(sel); if (el) return el; }
    const data = $(`[data-panel="${kind}"]`); if (data) return data;
    if (btn && btn.id) {
      const byAria = $(`[aria-labelledby="${btn.id}"]`); if (byAria) return byAria;
    }
    // last resort: known tab panel candidates
    const candidates = $all('.tab-panel, [role="tabpanel"]');
    return candidates.find(p => norm(p.id).includes(kind)) || null;
  }

  // Show a tiny loading hint inside a panel
  function showLoading(panel, msg) {
    if (!panel) return;
    const div = document.createElement('div');
    div.className = 'pu-lazy-loading';
    div.style.cssText = 'margin:8px 0;padding:10px;border:1px dashed #2a354b;border-radius:8px;background:#0b1328;color:#e5e7eb;font-size:12px;';
    div.textContent = msg || 'Loading…';
    panel.appendChild(div);
    return () => div.remove();
  }

  // Render trivial table if page doesn’t provide a renderer
  function defaultRenderTable(panel, rows) {
    if (!panel) return;
    // If page has its own renderer, prefer that.
    if (window.PowerUp?.render?.safety && panel.matches?.('#panelSafety, #safetyPanel, #safety,[data-panel="safety"]')) {
      try { window.PowerUp.render.safety(rows); return; } catch {}
    }
    if (window.PowerUp?.render?.quality && panel.matches?.('#panelQuality, #qualityPanel, #quality,[data-panel="quality"]')) {
      try { window.PowerUp.render.quality(rows); return; } catch {}
    }
    // Fallback: simple table
    if (!rows || !rows.length) { panel.insertAdjacentHTML('beforeend','<div class="small" style="color:#9ca3af">No rows.</div>'); return; }
    const cols = Object.keys(rows[0] || {});
    const th = cols.map(c => `<th style="padding:6px 8px;border-bottom:1px solid #2a354b;text-align:left">${c}</th>`).join('');
    const tr = rows.slice(0, 250).map(r =>
      `<tr>${cols.map(c => `<td style="padding:6px 8px;border-bottom:1px solid #1f2937">${r[c] ?? ''}</td>`).join('')}</tr>`
    ).join('');
    const html = `
      <div style="overflow:auto;border:1px solid #2a354b;border-radius:8px;margin-top:8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead style="background:#0b1328">${th}</thead>
          <tbody>${tr}</tbody>
        </table>
      </div>`;
    panel.insertAdjacentHTML('beforeend', html);
  }

  // Loaders (run once per tab)
  const once = { safety: false, quality: false };

  async function ensureLoaded(kind) {
    if (once[kind]) return;
    const btn = findTabButton(kind);
    const panel = findPanel(kind, btn);
    if (!panel) return; // nothing to do
    once[kind] = true;

    const stop = showLoading(panel, `Loading ${kind[0].toUpperCase()+kind.slice(1)}…`);
    try {
      const sheetKey = (kind === 'safety') ? 'SAFETY' : 'QUALITY';
      const rows = await window.PowerUp.api.getRowsByTitle(sheetKey);
      stop && stop();
      defaultRenderTable(panel, rows);
    } catch (e) {
      stop && stop();
      const msg = (e && e.message) ? e.message : 'Failed to load.';
      panel.insertAdjacentHTML('beforeend', `<div style="color:#fecaca;background:#450a0a;border:1px solid #7f1d1d;padding:10px;border-radius:8px">Error: ${msg}</div>`);
    }
  }

  // Wire tab clicks and also pre-load if tab is initially active/visible
  function wire(kind) {
    const btn = findTabButton(kind);
    const panel = findPanel(kind, btn);
    if (!btn || !panel) return;

    // Click → load once
    btn.addEventListener('click', () => ensureLoaded(kind), { once: false });

    // If the tab is already the active/visible one, load immediately
    const isShown = () => {
      const style = window.getComputedStyle(panel);
      const visible = style.display !== 'none' && style.visibility !== 'hidden';
      // also consider aria-selected on the button
      const selected = (btn.getAttribute('aria-selected') === 'true') || btn.classList.contains('active');
      return visible || selected;
    };
    if (isShown()) { ensureLoaded(kind); }

    // If your tab system uses custom events, listen for them (noop if they don't fire)
    panel.addEventListener('tab:show', () => ensureLoaded(kind));
  }

  document.addEventListener('DOMContentLoaded', function () {
    wire('safety');
    wire('quality');
  });
})();
