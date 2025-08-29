// scripts/session.js  (v2025-08-29-c)
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const SKEY = 'pu.session';

  function get() {
    try { return JSON.parse(sessionStorage.getItem(SKEY) || '{}'); }
    catch { return {}; }
  }
  function set(obj) { sessionStorage.setItem(SKEY, JSON.stringify(obj || {})); }
  function clear() { sessionStorage.removeItem(SKEY); }

  function requireLogin() {
    const s = get();
    if (!s.employeeId) {
      sessionStorage.setItem('pu.postLoginRedirect', location.pathname.split('/').pop());
      location.href = 'login.html';
    }
  }

  async function loginWithId(inputId) {
    const id = String(inputId || '').trim();
    if (!id) throw new Error('Please enter your Position ID or Employee ID.');

    const rows = await PowerUp.api.getRowsByTitle(PowerUp.api.SHEETS.EMPLOYEE_MASTER);
    const row = rows.find(r => {
      const pid = String(r['Position ID'] ?? '').trim();
      const eid = String(r['Employee ID'] ?? '').trim();
      return pid === id || eid === id;
    });
    if (!row) throw new Error('ID not found. Double-check your Position ID or Employee ID.');

    const displayName = row['Display Name'] || row['Employee Name'] || row['Name'] || id;
    const level = row['PowerUp Level (Select)'] || row['PowerUp Level'] || 'Level Unknown';

    set({ employeeId: id, displayName, level });

    const dest = sessionStorage.getItem('pu.postLoginRedirect') || 'Dashboard-Refresh.html';
    sessionStorage.removeItem('pu.postLoginRedirect');
    location.href = dest;
  }

  async function initHeader() {
    const s = get();

    // Backfill name/level if missing
    if (!s.displayName || !s.level) {
      try {
        const rows = await PowerUp.api.getRowsByTitle(PowerUp.api.SHEETS.EMPLOYEE_MASTER);
        const row = rows.find(r => {
          const pid = String(r['Position ID'] ?? '').trim();
          const eid = String(r['Employee ID'] ?? '').trim();
          return pid === s.employeeId || eid === s.employeeId;
        });
        if (row) {
          s.displayName = row['Display Name'] || row['Employee Name'] || row['Name'] || s.employeeId;
          s.level = row['PowerUp Level (Select)'] || row['PowerUp Level'] || 'Level Unknown';
          set(s);
        }
      } catch (e) {
        console.error('initHeader: Employee lookup failed', e);
      }
    }

    const $name  = document.querySelector('[data-hook="userName"]');
    const $level = document.querySelector('[data-hook="userLevel"]');

    if ($name) $name.textContent = s.displayName || s.employeeId || 'Unknown User';

    // Apply label now (if roles.js is already loaded) …
    applyLevelLabel();

    // …and also once roles.js signals it's ready
    document.removeEventListener('powerup-auth-ready', applyLevelLabel);
    document.addEventListener('powerup-auth-ready', applyLevelLabel);

    function applyLevelLabel() {
      const isAdmin = !!(PowerUp.auth && PowerUp.auth.isAdmin && PowerUp.auth.isAdmin());
      const label = isAdmin
        ? 'Admin'
        : (s.level && s.level !== 'Level Unknown' ? s.level : '');

      if ($level) {
        if (label) {
          $level.textContent = label;
          $level.closest('[data-hook="userLevelWrap"]')?.classList.remove('hidden');
        } else {
          const wrap = $level.closest('[data-hook="userLevelWrap"]');
          if (wrap) wrap.classList.add('hidden');
          else $level.textContent = '';
        }
      }
    }
  }

  function logout() {
    clear();
    location.href = 'login.html';
  }

  PowerUp.session = { get, set, clear, requireLogin, loginWithId, initHeader, logout };
  window.PowerUp = P;
}(window.PowerUp || {}));
