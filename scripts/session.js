// scripts/session.js  (fixed admin override)
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const SKEY = 'pu.session';

  // ---- storage ----
  function get() {
    try { return JSON.parse(sessionStorage.getItem(SKEY) || '{}'); }
    catch { return {}; }
  }
  function set(obj) { sessionStorage.setItem(SKEY, JSON.stringify(obj || {})); }
  function clear() { sessionStorage.removeItem(SKEY); }

  // ---- helpers ----
  function pick(obj, keys, d='') {
    for (const k of keys) {
      const v = obj?.[k];
      if (v != null && String(v).trim() !== '') return v;
    }
    return d;
  }
  function resolveLevel(row) {
    return (
      pick(row, [
        'PowerUp Level (Select)',
        'PowerUp Level',
        'Level',
        'Level Text',
        'PowerUp Level Text'
      ], '') || 'Level Unknown'
    );
  }
  async function findEmployeeRowById(id) {
    const rows = await P.api.getRowsByTitle(P.api.SHEETS.EMPLOYEE_MASTER);
    const idLC = String(id || '').trim().toLowerCase();
    return rows.find(r => {
      const pid = String(r['Position ID'] ?? '').trim().toLowerCase();
      const eid = String(r['Employee ID'] ?? '').trim().toLowerCase();
      return pid === idLC || eid === idLC;
    }) || null;
  }

  // Robust admin check that does NOT depend on session being set yet
  function isAdminId(rawId) {
    try {
      const id = String(rawId || '').trim().toUpperCase();
      // Prefer the explicit allowlist if available
      if (P.auth?.ADMIN_IDS && typeof P.auth.ADMIN_IDS.has === 'function') {
        return !!id && P.auth.ADMIN_IDS.has(id);
      }
    } catch {}
    // Fallback: use runtime helper (may rely on session)
    try { return !!(P.auth?.isAdmin && P.auth.isAdmin()); } catch {}
    return false;
  }

  // ---- routing guard ----
  function requireLogin() {
    const s = get();
    if (!s.employeeId) {
      sessionStorage.setItem('pu.postLoginRedirect', location.pathname.split('/').pop());
      location.href = 'login.html';
    }
  }

  // ---- login ----
  async function loginWithId(inputId) {
    const id = String(inputId || '').trim();
    if (!id) throw new Error('Please enter your Position ID or Employee ID.');

    const row = await findEmployeeRowById(id);
    if (!row) throw new Error('ID not found. Double-check your Position ID or Employee ID.');

    const displayName = pick(row, ['Display Name', 'Employee Name', 'Name'], id);

    // Base level from sheet, then override if this ID is an admin
    let level = resolveLevel(row);
    if (isAdminId(id)) level = 'Admin';

    // Store BOTH level + levelText (compat)
    set({ employeeId: id, displayName, level, levelText: level });

    const dest = sessionStorage.getItem('pu.postLoginRedirect') || 'Dashboard-Refresh.html';
    sessionStorage.removeItem('pu.postLoginRedirect');
    location.href = dest;
  }

  // ---- header hydration (name/level + logout) ----
  async function initHeader() {
    const s = get();

    // Backfill missing name/level from Employee Master if needed
    if (!s.displayName || !s.level) {
      try {
        const row = await findEmployeeRowById(s.employeeId);
        if (row) {
          s.displayName = pick(row, ['Display Name', 'Employee Name', 'Name'], s.employeeId);
          s.level = resolveLevel(row);
          s.levelText = s.level;
          set(s);
        }
      } catch (e) {
        console.error('initHeader: backfill failed', e);
      }
    }

    // ALWAYS enforce Admin label if this session’s ID is an admin
    try {
      if (isAdminId(s.employeeId) && s.level !== 'Admin') {
        s.level = 'Admin';
        s.levelText = 'Admin';
        set(s);
      }
    } catch {}

    // Fill header placeholders if present
    const $name = document.querySelector('[data-hook="userName"]');
    const $level = document.querySelector('[data-hook="userLevel"]');
    if ($name) $name.textContent = s.displayName || s.employeeId || 'Unknown User';
    if ($level) $level.textContent = s.level || s.levelText || 'Level Unknown';

    // Wire logout
    const $logout = document.querySelector('[data-hook="logout"]');
    if ($logout && !$logout.dataset.bound) {
      $logout.dataset.bound = '1';
      $logout.addEventListener('click', logout);
    }

    // Signal to pages that auth/session is ready
    try { document.dispatchEvent(new Event('powerup-auth-ready')); } catch {}
  }

  function logout() {
    clear();
    location.href = 'login.html';
  }

  P.session = { get, set, clear, requireLogin, loginWithId, initHeader, logout };
  window.PowerUp = P;
})(window.PowerUp || {});
