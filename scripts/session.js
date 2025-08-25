// /scripts/session.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  // Guard: api must exist
  if (!ns.api) ns.api = {};
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  const STORE_KEY = 'pu.session';

  // ---- storage helpers ----------------------------------------------------
  function save(session) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(session || {})); } catch {}
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
  }
  function clear() {
    try { localStorage.removeItem(STORE_KEY); } catch {}
  }

  // ---- public: read session ----------------------------------------------
  function get() {
    return load();
  }

  // ---- login by Position ID or Employee ID --------------------------------
  async function loginWithId(idOrEmp) {
    if (!fetchSheet || !rowsByTitle || !SHEETS || !SHEETS.EMPLOYEE_MASTER) {
      throw new Error("Smartsheet API not available (api.js not loaded).");
    }
    const raw = await fetchSheet(SHEETS.EMPLOYEE_MASTER);
    const rows = rowsByTitle(raw);

    const needle = String(idOrEmp || '').trim().toLowerCase();
    if (!needle) throw new Error('Please enter your Position ID or Employee ID.');

    // Try matching by Position ID or Employee ID (exact string compare after trim)
    const me = rows.find(r => {
      const pos = String(r['Position ID'] || '').trim().toLowerCase();
      const emp = String(r['Employee ID'] || '').trim().toLowerCase();
      return pos === needle || emp === needle;
    });

    if (!me) throw new Error('ID not found. Double-check your Position/Employee ID.');

    const session = {
      employeeId: String(me['Employee ID'] || me['Position ID'] || '').trim(),
      positionId: String(me['Position ID'] || '').trim(),
      name:       String(me['Employee Name'] || me['Name'] || '').trim(),
      level:      String(me['Level'] || me['Lvl'] || '').trim()
    };
    save(session);

    // redirect to dashboard
    location.href = 'Dashboard-Refresh.html';
  }

  // ---- logout -------------------------------------------------------------
  function logout() {
    clear();
    location.href = 'login.html';
  }

  // ---- require & header fill ---------------------------------------------
  function requireLogin() {
    const s = load();
    if (!s.employeeId) {
      location.href = 'login.html';
      return false;
    }
    return true;
  }

  async function initHeader() {
    const s = load();
    const nameEl  = document.querySelector('[data-hook="userName"]');
    const levelEl = document.querySelector('[data-hook="userLevel"]');
    if (nameEl)  nameEl.textContent  = s.name || '—';
    if (levelEl) levelEl.textContent = s.level ? `Level: ${s.level}` : 'Level Unknown';

    const logoutBtn = document.querySelector('[data-hook="logout"]');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }

  ns.session = { get, loginWithId, logout, requireLogin, initHeader };
})(window.PowerUp);
