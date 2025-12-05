// scripts/session.js  — PowerUp unified login engine (retry-safe, event-driven)
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const SKEY = 'pu.session';

  // ────────────────────────────────
  // ⚙️ Session Storage Helpers
  // ────────────────────────────────
  function get() {
    try { return JSON.parse(sessionStorage.getItem(SKEY) || '{}'); }
    catch { return {}; }
  }
  function set(obj) { sessionStorage.setItem(SKEY, JSON.stringify(obj || {})); }
  function clear() { sessionStorage.removeItem(SKEY); }

  // ────────────────────────────────
  // 🔍 Employee Resolution Helpers
  // ────────────────────────────────
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

  // ────────────────────────────────
  // 🧭 Routing Guards
  // ────────────────────────────────
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

  // ────────────────────────────────
  // 🚀 Core Login (non-redirecting)
  // ────────────────────────────────
  async function loginSilently(inputId, { primeBeforeRedirect = true } = {}) {
    const id = String(inputId || '').trim();
    if (!id) throw new Error('Please enter your Position ID or Employee ID.');

    try { await P.api.ready(); } catch {}
    try { await P.api.warmProxy(); } catch {}

    const startTime = Date.now();
    let row;

    try {
      const rows = await getEmployeeRowsCachedFirst();
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

    if (!row) throw new Error('Invalid Employee ID.');

    const displayName = row['Display Name'] || row['Employee Name'] || row['Name'] || id;
    let level = resolveLevel(row);
    if (isAdminId(id)) level = 'Admin';

    set({ employeeId: id, displayName, level, levelText: level });
    mirrorCanonicalSession();

    if (primeBeforeRedirect && P.api?.prefetchEssential) {
      try { await P.api.prefetchEssential(); } catch {}
    }

    const elapsed = Date.now() - startTime;
    return { success: true, employeeId: id, displayName, level, elapsed };
  }

  // ────────────────────────────────
  // 🔁 Full Resilient Login Workflow
  // ────────────────────────────────
  async function loginWithRetry(empId, { primeBeforeRedirect = true, maxMinutes = 3 } = {}) {
    const id = String(empId || '').trim();
    if (!id) throw new Error('Please enter your Employee ID.');

    document.dispatchEvent(new CustomEvent('login:start', { detail: { id } }));

    const startTime = Date.now();
    const timeoutAt = startTime + maxMinutes * 60 * 1000;
    let attempt = 0;

    while (Date.now() < timeoutAt) {
      attempt++;
      document.dispatchEvent(new CustomEvent('login:progress', { detail: { attempt, elapsed: Date.now() - startTime } }));

      try {
        const result = await loginSilently(id, { primeBeforeRedirect });
        if (result && result.success) {
          document.dispatchEvent(new CustomEvent('login:success', { detail: result }));
          return result;
        }
      } catch (err) {
        const msg = (err && err.message || '').toLowerCase();

        // 🔴 Fatal: invalid credentials
        if (msg.includes('invalid') || msg.includes('unauthorized') || msg.includes('not found')) {
          document.dispatchEvent(new CustomEvent('login:error', {
            detail: { message: 'Invalid Employee ID. Please try again.', fatal: true }
          }));
          throw err;
        }

        // 🟠 Recoverable: network or cold server
        if (!navigator.onLine) {
          document.dispatchEvent(new CustomEvent('login:progress', {
            detail: { attempt, elapsed: Date.now() - startTime, note: 'offline' }
          }));
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        // Generic retry with exponential backoff
        const backoff = Math.min(4000 * attempt, 15000);
        document.dispatchEvent(new CustomEvent('login:progress', {
          detail: { attempt, elapsed: Date.now() - startTime, note: 'retrying', backoff }
        }));
        await new Promise(r => setTimeout(r, backoff));
      }
    }

    // ⏳ Timeout reached
    document.dispatchEvent(new CustomEvent('login:error', {
      detail: { message: 'Server did not respond within the allowed time.', fatal: true }
    }));
    throw new Error('Server timeout after multiple attempts.');
  }

  // ────────────────────────────────
  // 🧠 Header hydration + logout
  // ────────────────────────────────
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

    document.dispatchEvent(new Event('powerup-auth-ready'));
    mirrorCanonicalSession();
  }

  function logout() {
    clear();
    try { sessionStorage.removeItem('pu.sheetCache.v1'); } catch {}
    try { localStorage.removeItem('powerup_session'); } catch {}
    location.href = 'login.html';
  }

  // ────────────────────────────────
  // ✅ Public API
  // ────────────────────────────────
  P.session = {
    get, set, clear,
    requireLogin,
    loginWithRetry, // new robust workflow
    loginSilently,  // internal fast login
    initHeader,
    logout
  };

  window.PowerUp = P;
})(window.PowerUp || {});

// --- Auto-restore session on any page load (dashboard guard compatibility) ---
try {
  const restored =
    JSON.parse(sessionStorage.getItem('pu.session') || 'null') ||
    JSON.parse(localStorage.getItem('powerup_session') || 'null');

  if (restored && restored.employeeId) {
    // Rehydrate in-memory session so dashboard and guards can detect it
    if (window.PowerUp && PowerUp.session && typeof PowerUp.session.set === 'function') {
      PowerUp.session.set(restored);
      console.log('[PowerUp] Session restored for', restored.displayName || restored.employeeId);
    }
  }
} catch (err) {
  console.warn('[PowerUp] Session restore skipped:', err);
}

