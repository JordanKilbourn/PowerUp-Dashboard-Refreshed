// scripts/session.js  (login hardened + warmup + cached employee master)
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

  async function getEmployeeRowsCachedFirst() {
    // try shared cache (set by login.html warmup)
    const CK = 'pu.cache.EMPLOYEE_MASTER.rows';
    const cached = sessionStorage.getItem(CK);
    if (cached) {
      try { return JSON.parse(cached); } catch {}
    }
    // fallback to fetch
    const rows = await P.api.getRowsByTitle(P.api.SHEETS.EMPLOYEE_MASTER)
      .catch(async () => {
        const sheet = await P.api.fetchSheet(P.api.SHEETS.EMPLOYEE_MASTER);
        return P.api.rowsByTitle(sheet);
      });
    try { sessionStorage.setItem(CK, JSON.stringify(rows)); } catch {}
    return rows;
  }

  async function findEmployeeRowById(id) {
    const rows = await getEmployeeRowsCachedFirst();
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
      if (P.auth?.ADMIN_IDS && typeof P.auth.ADMIN_IDS.has === 'function') {
        return !!id && P.auth.ADMIN_IDS.has(id);
      }
    } catch {}
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

  // Mirror minimal session for legacy guards in localStorage
  function mirrorCanonicalSession() {
    try {
      const s = get();
      if (!s.employeeId) return;
      const canonical = { employeeId: String(s.employeeId), displayName: String(s.displayName || '') };
      localStorage.setItem('powerup_session', JSON.stringify(canonical));
    } catch {}
  }

  // ---- login (warm proxy + prefer cached employee list + prime sheets) ----
  async function loginWithId(inputId, { primeBeforeRedirect = true } = {}) {
    const id = String(inputId || '').trim();
    if (!id) throw new Error('Please enter your Position ID or Employee ID.');

    // Warm proxy once (reduces first-login timeouts)
    try { await P.api.warmProxy(); } catch {}

    let row;
    try {
      row = await findEmployeeRowById(id);
    } catch (e) {
      // try one more time after a warm attempt
      try { await P.api.warmProxy(); } catch {}
      row = await findEmployeeRowById(id);
    }
    if (!row) throw new Error('ID not found. Double-check your Position ID or Employee ID.');

    // Build session
    const displayName = pick(row, ['Display Name', 'Employee Name', 'Name'], id);
    let level = resolveLevel(row);
    if (isAdminId(id)) level = 'Admin'; // hard override if admin

    set({ employeeId: id, displayName, level, levelText: level });
    mirrorCanonicalSession(); // keep early guards happy

    // Prime key sheets (cap the wait so UI stays snappy)
    if (primeBeforeRedirect && P.api?.prefetchEssential) {
      try { await P.api.prefetchEssential(); } catch {}
    }

    // Redirect
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
        const rows = await getEmployeeRowsCachedFirst();
        const row = rows.find(r => {
          const pid = String(r['Position ID'] ?? '').trim();
          const eid = String(r['Employee ID'] ?? '').trim();
          return pid === s.employeeId || eid === s.employeeId;
        });
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

    mirrorCanonicalSession();
  }

  function logout() {
    clear();
    try { sessionStorage.removeItem('pu.sheetCache.v1'); } catch {}
    try { localStorage.removeItem('powerup_session'); } catch {}
    location.href = 'login.html';
  }

  P.session = { get, set, clear, requireLogin, loginWithId, initHeader, logout };
  window.PowerUp = P;
})(window.PowerUp || {});
