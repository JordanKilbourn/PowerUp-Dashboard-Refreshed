// scripts/session.js — Optimistic login + background enrichment (no blocking timeouts)
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const SKEY = 'pu.session';
  const LEGACY = 'powerup_session'; // read-only fallback for older guards

  // ---------- storage ----------
  function get() {
    try { return JSON.parse(sessionStorage.getItem(SKEY) || '{}'); }
    catch { return {}; }
  }
  function set(obj) {
    const json = JSON.stringify(obj || {});
    sessionStorage.setItem(SKEY, json);
    // also mirror to localStorage so very old guards that read legacy key still see *something*
    try { localStorage.setItem(SKEY, json); } catch {}
  }
  function clear() {
    try { sessionStorage.removeItem(SKEY); } catch {}
    try { localStorage.removeItem(SKEY); } catch {}
  }

  // ---------- helpers ----------
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
      if (P.auth?.ADMIN_IDS && typeof P.auth.ADMIN_IDS.has === 'function') {
        return !!id && P.auth.ADMIN_IDS.has(id);
      }
    } catch {}
    try { return !!(P.auth?.isAdmin && P.auth.isAdmin()); } catch {}
    return false;
  }

  // ---------- routing guard ----------
  function requireLogin() {
    const s = get();
    if (!s.employeeId) {
      sessionStorage.setItem('pu.postLoginRedirect', location.pathname.split('/').pop());
      location.href = 'login.html';
      return false;
    }
    return true;
  }

  // ---------- background enrichment with retries ----------
  async function enrichProfileWithRetry(employeeId, { attempts = 6 } = {}) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let backoff = 600; // 0.6s, 1.2s, 2.4s, ...
    for (let i = 0; i < attempts; i++) {
      try {
        const row = await findEmployeeRowById(employeeId);
        if (row) {
          const displayName = pick(row, ['Display Name', 'Employee Name', 'Name'], employeeId);
          let level = resolveLevel(row);
          if (isAdminId(employeeId)) level = 'Admin';

          const cur = get();
          set({ ...cur, displayName, level, levelText: level });
          try { document.dispatchEvent(new CustomEvent('powerup-session-updated')); } catch {}
          return true;
        }
      } catch { /* will retry */ }
      await sleep(backoff + Math.floor(Math.random() * 200));
      backoff = Math.min(backoff * 2, 8000);
    }
    return false;
  }

  // ---------- OPTIMISTIC login (instant) ----------
  async function signIn(inputId) {
    const id = String(inputId || '').trim();
    if (!id) throw new Error('Please enter your Position ID or Employee ID.');

    // 1) Store minimal session immediately so navigation is never blocked
    set({ employeeId: id });

    // 2) Fire-and-forget enrichment (name/level) — no UI blocking
    queueMicrotask(() => { enrichProfileWithRetry(id); });

    // 3) Navigate
    const dest = sessionStorage.getItem('pu.postLoginRedirect') || 'Dashboard-Refresh.html';
    sessionStorage.removeItem('pu.postLoginRedirect');
    location.href = dest;
  }

  // Legacy (kept for compatibility): still available, but now delegates to signIn
  async function loginWithId(inputId) { return signIn(inputId); }

  // ---------- header hydration ----------
  async function initHeader() {
    const s = get();

    // Ensure Admin label if needed
    if (s.employeeId && isAdminId(s.employeeId) && s.level !== 'Admin') {
      s.level = 'Admin'; s.levelText = 'Admin'; set(s);
    }

    // Fill header placeholders if present
    const $name  = document.querySelector('[data-hook="userName"]');
    const $level = document.querySelector('[data-hook="userLevel"]');
    if ($name)  $name.textContent  = s.displayName || s.employeeId || 'Unknown User';
    if ($level) $level.textContent = s.level || s.levelText || 'Level Unknown';

    // Live updates when enrichment completes
    document.addEventListener('powerup-session-updated', () => {
      const cur = get();
      if ($name)  $name.textContent  = cur.displayName || cur.employeeId || 'Unknown User';
      if ($level) $level.textContent = cur.level || cur.levelText || 'Level Unknown';
    });

    // If we still don't have displayName/level, try to enrich in the background (non-blocking)
    if (s.employeeId && (!s.displayName || !s.level)) {
      enrichProfileWithRetry(s.employeeId, { attempts: 3 });
    }

    // Wire logout
    const $logout = document.querySelector('[data-hook="logout"]');
    if ($logout && !$logout.dataset.bound) {
      $logout.dataset.bound = '1';
      $logout.addEventListener('click', logout);
    }

    try { document.dispatchEvent(new Event('powerup-auth-ready')); } catch {}
  }

  function logout() {
    clear();
    location.href = 'login.html';
  }

  P.session = { get, set, clear, requireLogin, signIn, loginWithId, initHeader, logout };
  window.PowerUp = P;
})(window.PowerUp || {});
