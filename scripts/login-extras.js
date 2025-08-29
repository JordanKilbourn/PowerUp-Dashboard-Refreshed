// scripts/login-extras.js
(function (P) {
  const api = P?.api;

  // ---- Inject minimal CSS for overlay + modal (kept local to login page) ----
  const css = `
  .login-overlay {
    position: fixed; inset: 0; display:none; align-items:center; justify-content:center;
    background: rgba(0,0,0,.55); backdrop-filter: blur(4px); z-index: 9999;
  }
  .login-panel {
    background: #0f1a1a; border: 1px solid rgba(0,255,198,.25); color: #e9fdf8;
    padding: 16px 18px; border-radius: 10px; width: 360px; max-width: calc(100vw - 32px);
    box-shadow: 0 10px 30px rgba(0,0,0,.4);
  }
  .login-panel h3 { margin: 0 0 8px 0; color: var(--accent,#00ffc6); font-size: 16px; }
  .login-panel p  { margin: 8px 0; font-size: 14px; opacity:.95 }
  .spinner {
    width: 28px; height: 28px; border: 3px solid rgba(255,255,255,.25); border-top-color: #00ffc6;
    border-radius: 50%; margin-right:10px; animation: sp .9s linear infinite; flex: none;
  }
  @keyframes sp { to { transform: rotate(360deg); } }
  .login-row { display:flex; align-items:center; gap:10px; }
  .login-note { font-size: 12px; color:#9ccfd8; margin-top:8px }
  .login-btns { display:flex; gap:8px; justify-content:flex-end; margin-top:12px }
  .btn-ghost {
    background:#172525; color:#e7fffb; border:1px solid rgba(255,255,255,.12); padding:6px 10px; border-radius:8px; cursor:pointer;
  }
  .btn-primary {
    background: var(--accent,#00ffc6); color:#001511; border:none; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:700;
  }
  /* ID Lookup Modal */
  .id-modal { position:fixed; inset:0; display:none; align-items:center; justify-content:center; background: rgba(0,0,0,.55); z-index: 10000; }
  .id-card  { background:#0f1a1a; border:1px solid rgba(0,255,198,.25); color:#e9fdf8; width:500px; max-width: calc(100vw - 32px); border-radius:12px; padding:16px 18px; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
  .id-card h3 { margin:0 0 10px 0; color: var(--accent,#00ffc6); font-size:18px; }
  .field { margin:10px 0; }
  .field label { display:block; font-size:13px; color:#9ccfd8; margin-bottom:4px; }
  .field select, .field input[type="date"] {
    width:100%; background:#112222; color:#e9fdf8; border:1px solid #274040; border-radius:8px; padding:8px 10px;
  }
  .id-result { margin-top:10px; font-size:14px; }
  .id-result .ok { color:#a7f3d0; font-weight:700; }
  .id-result .err { color:#ffd166; }
  .id-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
  `;
  const s = document.createElement('style');
  s.textContent = css; document.head.appendChild(s);

  // ---- Build overlay (spinner + evolving messages) ----
  const overlay = document.createElement('div');
  overlay.className = 'login-overlay';
  overlay.innerHTML = `
    <div class="login-panel">
      <div class="login-row">
        <div class="spinner"></div>
        <div>
          <h3>Signing you in…</h3>
          <p id="login-msg">Loading your data…</p>
          <div class="login-note" id="login-note"></div>
        </div>
      </div>
      <div class="login-btns">
        <button class="btn-ghost" id="login-cancel" type="button">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  let progressTimers = [];
  function showOverlay() {
    if (overlay.style.display === 'flex') return;
    overlay.style.display = 'flex';

    const msg = overlay.querySelector('#login-msg');
    const note = overlay.querySelector('#login-note');
    msg.textContent = 'Loading your data…';
    note.textContent = '';

    // Friendly staged hints (helps when Render is “cold”)
    progressTimers.forEach(clearTimeout); progressTimers = [];
    progressTimers.push(setTimeout(() => {
      msg.textContent = 'Checking your Employee ID…';
    }, 800));
    progressTimers.push(setTimeout(() => {
      note.textContent = 'If this is the first login in a while, our server may be waking up.';
    }, 2000));
    progressTimers.push(setTimeout(() => {
      note.textContent = 'Still working… first load can take ~20–40 seconds on a cold start.';
    }, 5000));
  }
  function hideOverlay() {
    progressTimers.forEach(clearTimeout); progressTimers = [];
    overlay.style.display = 'none';
  }
  overlay.querySelector('#login-cancel')?.addEventListener('click', hideOverlay);

  // ---- “Find my Employee ID” modal ----
  const idModal = document.createElement('div');
  idModal.className = 'id-modal';
  idModal.innerHTML = `
    <div class="id-card">
      <h3>Find my Employee ID</h3>
      <div class="field">
        <label for="id-name">Your name</label>
        <select id="id-name"><option value="">Loading…</option></select>
      </div>
      <div class="field">
        <label for="id-hire">Hire date</label>
        <input id="id-hire" type="date" />
      </div>
      <div class="id-result" id="id-result"></div>
      <div class="id-actions">
        <button class="btn-ghost" id="id-cancel" type="button">Close</button>
        <button class="btn-primary" id="id-reveal" type="button">Reveal ID</button>
      </div>
    </div>`;
  document.body.appendChild(idModal);

  function openIdModal() { idModal.style.display = 'flex'; }
  function closeIdModal() { idModal.style.display = 'none'; }

  idModal.querySelector('#id-cancel')?.addEventListener('click', closeIdModal);
  idModal.addEventListener('click', (e) => { if (e.target === idModal) closeIdModal(); });

  // Populate the name list once
  let EMP_ROWS = [];
  async function ensureEmployees() {
    if (EMP_ROWS.length || !api?.getRowsByTitle) return;
    try {
      const rows = await api.getRowsByTitle('EMPLOYEE_MASTER');
      EMP_ROWS = rows.map(r => ({
        id:  (r['Position ID'] || r['Employee ID'] || r['ID'] || '').toString().trim(),
        name:(r['Display Name'] || r['Employee Name'] || r['Name'] || '').toString().trim(),
        hire:(r['Hire Date'] || r['Start Date'] || r['Hire'] || '').toString().slice(0,10)
      })).filter(r => r.id && r.name);
      const byName = [...EMP_ROWS].sort((a,b)=>a.name.localeCompare(b.name));
      const sel = idModal.querySelector('#id-name');
      sel.innerHTML = `<option value="">Select your name…</option>` +
        byName.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    } catch {
      const sel = idModal.querySelector('#id-name');
      sel.innerHTML = `<option value="">Unable to load employee list</option>`;
    }
  }

  function normDate(s){ return (s||'').toString().slice(0,10); }

  idModal.querySelector('#id-reveal')?.addEventListener('click', () => {
    const selId = idModal.querySelector('#id-name').value || '';
    const hire  = normDate(idModal.querySelector('#id-hire').value || '');
    const res   = idModal.querySelector('#id-result');

    if (!selId || !hire) {
      res.innerHTML = `<span class="err">Pick your name and enter your hire date.</span>`;
      return;
    }
    const row = EMP_ROWS.find(r => r.id === selId);
    if (!row) {
      res.innerHTML = `<span class="err">We couldn’t find that employee record.</span>`;
      return;
    }
    if (normDate(row.hire) !== hire) {
      res.innerHTML = `<span class="err">Hire date doesn’t match our records.</span>`;
      return;
    }

    // Success!
    const empId = row.id;
    res.innerHTML = `
      <div><span class="ok">Your Employee ID:</span> <code class="mono">${empId}</code></div>
      <div class="login-btns" style="margin-top:8px">
        <button class="btn-ghost" id="id-copy" type="button">Copy</button>
        <button class="btn-primary" id="id-use" type="button">Use this ID</button>
      </div>`;
    res.querySelector('#id-copy')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(empId); } catch {}
    });
    res.querySelector('#id-use')?.addEventListener('click', () => {
      const input = document.querySelector('#empId');
      if (input) input.value = empId;
      closeIdModal();
    });
  });

  // ---- Hook into the existing login page controls ----
  document.addEventListener('DOMContentLoaded', () => {
    const input  = document.querySelector('#empId');
    const btn    = document.querySelector('#btnLogin');
    const help   = document.querySelector('#btnWhere, #whereBtn, #helpBtn') || document.querySelector('button[data-help="empid"]');

    // Show overlay as soon as user triggers login; let your existing logic continue unchanged.
    function beginLoginOverlay() {
      const val = (input?.value || '').trim();
      if (!val) return; // let your current validator show an error
      showOverlay();
      // Safety: hide overlay if we’re still here after 60s (navigation failed)
      setTimeout(hideOverlay, 60000);
    }

    if (btn) btn.addEventListener('click', beginLoginOverlay);
    if (input) input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') beginLoginOverlay();
    });

    if (help) {
      help.addEventListener('click', async (e) => {
        e.preventDefault();
        await ensureEmployees();
        openIdModal();
      });
    }
  });

})(window.PowerUp || (window.PowerUp = {}));
