// scripts/roles.js  (v2025-09-03-a)  — allowlist-based admin + small helpers
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});

  // === ADMIN ALLOWLIST =========================================
  // Employee IDs (Position IDs) with admin powers
  const ADMIN_IDS = new Set(["IKS968538","IKS968547"].map(s => s.toUpperCase()));

  function isAdmin() {
    try {
      const me = P.session?.get?.() || {};
      const id = String(me.employeeId || "").trim().toUpperCase();
      return !!id && ADMIN_IDS.has(id);
    } catch { return false; }
  }

  // ---- Admin-aware table helpers (tiny & generic) --------------
  // Persisted selection so admins keep the same employee filter across tabs
  const ADMIN_FILTER_KEY = 'pu.adminEmployeeFilter'; // value: display name or "__ALL__"

  function norm(s){ return String(s || "").trim().toLowerCase(); }
  function pickCol(row, candidates){
    for (const c of candidates) if (Object.prototype.hasOwnProperty.call(row, c)) return c;
    return null;
  }

  // Admin-only: inject a small "Employee (Display Name)" <select> into header
  // Call once per page after DOM is ready.
  async function installEmployeeFilterUI() {
    if (!isAdmin()) return;

    // Build list from Employee Master
    let names = [];
    try {
      const rows = await P.api.getRowsByTitle('EMPLOYEE_MASTER');
      const col = pickCol(rows[0] || {}, ['Display Name','Employee Name','Name']);
       names = (rows || [])
       .map(r => String(r[col] || '').trim())
       .filter(Boolean)
       .sort((a,b) => a.localeCompare(b));
    } catch { /* keep empty, UI still renders */ }

    // Mount point: right side of your header line
    const header = document.getElementById('pu-header');
    if (!header) return;

    // Create or reuse container
    let box = document.getElementById('pu-admin-filter');
    if (!box) {
      box = document.createElement('div');
      box.id = 'pu-admin-filter';
      box.style.cssText = 'margin-top:6px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;';
      header.appendChild(box);
    } else {
      box.innerHTML = '';
    }

    const label = document.createElement('span');
    label.style.cssText = 'font-size:12px; color:#9ca3af;';
    label.textContent = 'Admin filter:';

    const sel = document.createElement('select');
    sel.style.cssText = 'padding:6px 8px;border-radius:8px;background:#0b1328;border:1px solid #2a354b;color:#e5e7eb;';
    sel.innerHTML = ['<option value="__ALL__">All Employees</option>']
      .concat(names.map(n => `<option value="${n}">${n}</option>`))
      .join('');

    // restore previous selection
    const prev = sessionStorage.getItem(ADMIN_FILTER_KEY);
    if (prev) sel.value = prev;

    // Clear Filter button
   const clearBtn = document.createElement('button');
   clearBtn.className = 'btn btn-xs';
   clearBtn.style.cssText = 'padding:6px 8px;border-radius:8px;border:1px solid #2a354b;background:#111a2f;color:#e5e7eb;cursor:pointer';
   clearBtn.textContent = 'Clear Filter';
   clearBtn.addEventListener('click', () => {
     sel.value = '__ALL__';
     sessionStorage.setItem(ADMIN_FILTER_KEY, '__ALL__');
     document.dispatchEvent(new CustomEvent('powerup-admin-filter-change', { detail:{ value: '__ALL__' }}));
   });

  
    sel.addEventListener('change', () => {
      sessionStorage.setItem(ADMIN_FILTER_KEY, sel.value);
      // Fire a small event so pages can re-render if they want
      document.dispatchEvent(new CustomEvent('powerup-admin-filter-change', { detail:{ value: sel.value }}));
    });

   box.appendChild(label);
   box.appendChild(sel);
   box.appendChild(clearBtn);
  }

  // Admin-only: apply employee filter to a rows[] array.
  // `cols` is an array of possible title keys for that dataset.
  function maybeFilterByEmployee(rows, cols) {
    if (!isAdmin()) return rows;
    const v = sessionStorage.getItem(ADMIN_FILTER_KEY) || '__ALL__';
    if (v === '__ALL__') return rows;
    const col = rows && rows.length ? pickCol(rows[0], cols) : null;
    if (!col) return rows;
    return rows.filter(r => norm(r[col]) === norm(v));
  }

  // ---- Squad powers --------------------------------------------
  async function canManageSquad(_squadId) {
    // Admins: full access
    if (isAdmin()) return true;

    // Non-admin: keep your existing behavior (leaders-only etc.)
    // If your current page already has that check, you can ignore this.
    try {
      const me = P.session?.get?.();
      const myId = norm((me.employeeId || '').toString().toUpperCase());
      const rows = await P.api.getRowsByTitle('SQUAD_MEMBERS');
      return rows.some(r => {
        const rid  = norm((r['Employee ID'] || r['Position ID'] || '').toString().toUpperCase());
        const role = norm((r['Role'] || r['Member Role'] || '').toString().toLowerCase());
        const sid  = norm((r['Squad ID'] || r['Squad'] || '').toString());
        return rid === myId && role.includes('lead') && (!_squadId || sid === norm(String(_squadId)));
      });
    } catch { return false; }
  }

  P.auth = {
    isAdmin,
    ADMIN_IDS,
    // admin table helpers:
    installEmployeeFilterUI,
    maybeFilterByEmployee,
    // squads:
    canManageSquad
  };
  window.PowerUp = P;

  // Notify when ready
  document.dispatchEvent(new Event('powerup-auth-ready'));
})(window.PowerUp || {});
