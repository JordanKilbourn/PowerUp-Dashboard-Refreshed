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
    const CK = 'pu.cache.EMPLOYEE_MASTER.rows';
    const cached = sessionStorage.getItem(CK);
    if (cached) {
      try { return JSON.parse(cached); } catch {}
    }
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

  function mirrorCanonicalSession() {
    try {
      const s = get();
      if (!s.employeeId) return;
      const canonical = { employeeId: String(s.employeeId), displayName: String(s.displayName || '') };
      localStorage.setItem('powerup_session', JSON.stringify(canonical));
    } catch {}
  }

  // ---- login (now gated by api.ready) ----
  async function loginWithId(inputId, { primeBeforeRedirect = true } = {}) {
    const id = String(inputId || '').trim();
    if (!id) throw new Error('Please enter your Position ID or Employee ID.');

    // ✅ Ensure proxy is fully up before the first data call
    try { await P.api.ready(); } catch {}

    // Additional warm (cheap, idempotent)
    try { await P.api.warmProxy(); } catch {}

    let row;
    try {
      row = await findEmployeeRowById(id);
    } catch {
      try { await P.api.ready(); } catch {}
      row = await findEmployeeRowById(id);
    }
    if (!row) throw new Error('ID not found. Double-check your Position ID or Employee ID.');

    const displayName = pick(row, ['Display Name', 'Employee Name', 'Name'], id);
    let level = resolveLevel(row);
    if (isAdminId(id)) level = 'Admin';

    set({ employeeId: id, displayName, level, levelText: level });
    mirrorCanonicalSession();

    if (primeBeforeRedirect && P.api?.prefetchEssential) {
      try { await P.api.prefetchEssential(); } catch {}
    }

    const dest = sessionStorage.getItem('pu.postLoginRedirect') || 'Dashboard-Refresh.html';
    sessionStorage.removeItem('pu.postLoginRedirect');
    location.href = dest;
  }

  // ---- header hydration (name/level + logout) ----
  async function initHeader() {
    const s = get();

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

    try {
      if (isAdminId(s.employeeId) && s.level !== 'Admin') {
        s.level = 'Admin';
        s.levelText = 'Admin';
        set(s);
      }
    } catch {}

    const $name = document.querySelector('[data-hook="userName"]');
    const $level = document.querySelector('[data-hook="userLevel"]');
    if ($name) $name.textContent = s.displayName || s.employeeId || 'Unknown User';
    if ($level) $level.textContent = s.level || s.levelText || 'Level Unknown';

    const $logout = document.querySelector('[data-hook="logout"]');
    if ($logout && !$logout.dataset.bound) {
      $logout.dataset.bound = '1';
      $logout.addEventListener('click', logout);
    }

    try { document.dispatchEvent(new Event('powerup-auth-ready')); } catch {}

    mirrorCanonicalSession();
  }

  function logout() {
    clear();
    try { sessionStorage.removeItem('pu.sheetCache.v1'); } catch {}
    try { localStorage.removeItem('powerup_session'); } catch {}
    location.href = 'login.html';
  }




  
// --- Non-redirecting login function for splash-controlled flow ---
P.session = P.session || {};
P.session.loginSilently = async function (inputId, { primeBeforeRedirect = true } = {}) {

  const id = String(inputId || '').trim();
  if (!id) throw new Error('Please enter your Position ID or Employee ID.');

  // ✅ Ensure proxy/server is awake
  try { await P.api.ready(); } catch {}
  try { await P.api.warmProxy(); } catch {}

  // ✅ Find employee record by ID
  let row;
  try {
    const rows = await (async () => {
      const CK = 'pu.cache.EMPLOYEE_MASTER.rows';
      const cached = sessionStorage.getItem(CK);
      if (cached) {
        try { return JSON.parse(cached); } catch {}
      }
      const fresh = await P.api.getRowsByTitle(P.api.SHEETS.EMPLOYEE_MASTER)
        .catch(async () => {
          const sheet = await P.api.fetchSheet(P.api.SHEETS.EMPLOYEE_MASTER);
          return P.api.rowsByTitle(sheet);
        });
      try { sessionStorage.setItem(CK, JSON.stringify(fresh)); } catch {}
      return fresh;
    })();

    const idLC = id.toLowerCase();
    row = rows.find(r => {
      const pid = String(r['Position ID'] ?? '').trim().toLowerCase();
      const eid = String(r['Employee ID'] ?? '').trim().toLowerCase();
      return pid === idLC || eid === idLC;
    }) || null;
  } catch (err) {
    console.error('loginSilently: error finding employee', err);
    throw new Error('Login lookup failed. Please try again.');
  }

  if (!row) throw new Error('ID not found. Double-check your Position ID or Employee ID.');

  // ✅ Build session
  const displayName = row['Display Name'] || row['Employee Name'] || row['Name'] || id;
  let level = row['PowerUp Level (Select)'] || row['PowerUp Level'] || row['Level'] || 'Level Unknown';
  try {
    if (P.session && typeof P.session.isAdminId === 'function' && P.session.isAdminId(id)) {
      level = 'Admin';
    }
  } catch {}

  P.session.set({ employeeId: id, displayName, level, levelText: level });

  // ✅ Mirror canonical session for downstream pages
  try {
    localStorage.setItem('powerup_session', JSON.stringify({ employeeId: id, displayName }));
  } catch {}

  // Optional pre-fetch of dashboard data
  if (primeBeforeRedirect && P.api?.prefetchEssential) {
    try { await P.api.prefetchEssential(); } catch {}
  }

  // ✅ Return cleanly (no redirect!)
  return { success: true, employeeId: id, displayName, level };
};



  
  P.session = { get, set, clear, requireLogin, loginWithId, initHeader, logout, loginSilently };
  window.PowerUp = P;
})(window.PowerUp || {});

// Show splash for ~1.8s, then fade + redirect.
/*
PowerUp.session.playSplashThenGo = function (nextUrl = 'Dashboard-Refresh.html', totalMs = 1800) {
  try {
    let el = document.getElementById('pu-splash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pu-splash';
      el.innerHTML = '<div class="pu-splash-inner"><img src="assets/favicon.svg" alt="PowerUp" width="120" height="120"></div>';
      document.body.appendChild(el);
    }
    el.hidden = false;
    // force reflow so the 'on' class transitions
    void el.offsetWidth;
    el.classList.add('on');

    // start fade slightly before redirect
    setTimeout(() => el.classList.add('fade'), Math.max(0, totalMs - 500));
    setTimeout(() => { location.href = nextUrl; }, totalMs);
  } catch {
    location.href = nextUrl;
  }
};
*/
