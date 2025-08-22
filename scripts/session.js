// scripts/session.js
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
      // keep their intended destination so we can bounce back later if you want
      sessionStorage.setItem('pu.postLoginRedirect', location.pathname.split('/').pop());
      location.href = 'login.html';
    }
  }

  async function loginWithId(inputId) {
    const id = String(inputId || '').trim();
    if (!id) throw new Error('Please enter your Position ID or Employee ID.');
    // Find in Employee Master by Position ID or Employee ID
    const rows = await PowerUp.api.getRowsByTitle(PowerUp.api.SHEETS.EMPLOYEE_MASTER);
    const row = rows.find(r => {
      const pid = String(r['Position ID'] ?? '').trim();
      const eid = String(r['Employee ID'] ?? '').trim();
      return pid === id || eid === id;
    });
    if (!row) throw new Error('ID not found. Double-check your Position ID or Employee ID.');
    const displayName = row['Display Name'] || row['Name'] || id;
    const level = row['PowerUp Level (Select)'] || row['PowerUp Level'] || 'Level Unknown';

    set({ employeeId: id, displayName, level });

    const dest = sessionStorage.getItem('pu.postLoginRedirect') || 'Dashboard-Refresh.html';
    sessionStorage.removeItem('pu.postLoginRedirect');
    location.href = dest;
  }

  async function initHeader() {
    const s = get();
    // If we don't have name/level yet (e.g., they came from old session), backfill
    if (!s.displayName || !s.level) {
      try {
        const rows = await PowerUp.api.getRowsByTitle(PowerUp.api.SHEETS.EMPLOYEE_MASTER);
        const row = rows.find(r => {
          const pid = String(r['Position ID'] ?? '').trim();
          const eid = String(r['Employee ID'] ?? '').trim();
          return pid === s.employeeId || eid === s.employeeId;
        });
        if (row) {
          s.displayName = row['Display Name'] || row['Name'] || s.employeeId;
          s.level = row['PowerUp Level (Select)'] || row['PowerUp Level'] || 'Level Unknown';
          set(s);
        }
      } catch (e) {
        // non-fatal, fall back to whatever we have
        console.error('initHeader: Employee lookup failed', e);
      }
    }

    // Fill any header placeholders if present
    const $name = document.querySelector('[data-hook="userName"]');
    const $level = document.querySelector('[data-hook="userLevel"]');
    if ($name) $name.textContent = s.displayName || s.employeeId || 'Unknown User';
    if ($level) $level.textContent = s.level || 'Level Unknown';

    // Wire logout button if present
    const $logout = document.querySelector('[data-hook="logout"]');
    if ($logout && !$logout.dataset.bound) {
      $logout.dataset.bound = '1';
      $logout.addEventListener('click', logout);
    }
  }

  function logout() {
    clear();
    location.href = 'login.html';
  }

  PowerUp.session = { get, set, clear, requireLogin, loginWithId, initHeader, logout };
  window.PowerUp = P;
}(window.PowerUp || {}));
