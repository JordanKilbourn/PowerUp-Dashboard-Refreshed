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

  async function getEmployeeRowsCachedFirst({ net = null } = {}) {
    const CK = 'pu.cache.EMPLOYEE_MASTER.rows';
    const cached = sessionStorage.getItem(CK);
    if (cached) {
      try { return JSON.parse(cached); } catch {}
    }

    const rows = await P.api.getRowsByTitle(P.api.SHEETS.EMPLOYEE_MASTER, { net })
      .catch(async () => {
        const sheet = await P.api.fetchSheet(P.api.SHEETS.EMPLOYEE_MASTER, { force: true, net });
        return P.api.rowsByTitle(sheet);
      });

    try { sessionStorage.setItem(CK, JSON.stringify(rows)); } catch {}
    return rows;
  }

  async function findEmployeeRowById(id, { net = null } = {}) {
    const rows = await getEmployeeRowsCachedFirst({ net });
    const idLC = String(id || '').trim().toLowerCase();
    return rows.find(r => {
      const pid = String(r['Position ID'] ?? '').trim().toLowerCase();
      const eid = String(r['Employee ID'] ?? '').trim().toLowerCase();
      return pid === idLC || eid === idLC;
    });
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
  async function loginSilently(
    inputId,
    {
      primeBeforeRedirect = true,
      net = null,
      warmDeadlineMs = 60000,
      forceWarm = false,
      onStage = null
    } = {}
  ) {
    const id = String(inputId || '').trim();
    if (!id) throw new Error('Please enter your Position ID or Employee ID.');

    // Warm proxy (cold-start tolerant). Let failures bubble so loginWithRetry can handle.
    if (onStage) onStage('warming');
    await P.api.warmProxy({ deadlineMs: warmDeadlineMs, net, force: forceWarm });

    const startTime = Date.now();

    if (onStage) onStage('fetching');
    const row = await findEmployeeRowById(id, { net });

    if (!row) throw new Error('Invalid Employee ID.');

    const displayName = row['Display Name'] || row['Employee Name'] || row['Name'] || id;
    let level = resolveLevel(row);
    if (isAdminId(id)) level = 'Admin';

    set({ employeeId: id, displayName, level, levelText: level });
    mirrorCanonicalSession();

    if (primeBeforeRedirect && P.api?.prefetchEssential) {
      if (onStage) onStage('priming');
      try { await P.api.prefetchEssential(); } catch {}
    }

    const elapsed = Date.now() - startTime;
    return { success: true, employeeId: id, displayName, level, elapsed };
  }


  // ────────────────────────────────
  // 🔁 Full Resilient Login Workflow
  // ────────────────────────────────
  async function loginWithRetry(
    empId,
    { primeBeforeRedirect = true, maxMinutes = null, maxMs = 90000 } = {}
  ) {
    const id = String(empId || '').trim();
    if (!id) throw new Error('Please enter your Employee ID.');

    document.dispatchEvent(new CustomEvent('login:start', { detail: { id } }));

    const startTime = Date.now();
    const resolvedMaxMs = (typeof maxMinutes === 'number' && isFinite(maxMinutes))
      ? maxMinutes * 60 * 1000
      : maxMs;

    const timeoutAt = startTime + Math.max(5000, resolvedMaxMs);
    let attempt = 0;

    while (Date.now() < timeoutAt) {
      attempt++;

      document.dispatchEvent(
        new CustomEvent('login:progress', {
          detail: { attempt, elapsed: Date.now() - startTime }
        })
      );

      const remainingMs = Math.max(0, timeoutAt - Date.now());
      // Keep each individual call patient, but keep nested retries low.
      const loginNet = {
        retryLimit: 2,
        attemptTimeoutMs: Math.min(15000, Math.max(5000, remainingMs)),
        overallTimeoutMs: Math.min(30000, Math.max(8000, remainingMs)),
        backoffBaseMs: 400,
        backoffCapMs: 2500
      };

      const warmDeadlineMs = Math.min(60000, Math.max(10000, remainingMs));

      const onStage = (note) => {
        document.dispatchEvent(
          new CustomEvent('login:progress', {
            detail: { attempt, elapsed: Date.now() - startTime, note }
          })
        );
      };

      try {
        const result = await loginSilently(id, {
          primeBeforeRedirect,
          net: loginNet,
          warmDeadlineMs,
          forceWarm: attempt === 1,
          onStage
        });

        if (result && result.success) {
          document.dispatchEvent(new CustomEvent('login:success', { detail: result }));
          return result;
        }

      } catch (err) {
        const rawMsg = (err && err.message) || '';
        const msg = rawMsg.toLowerCase();

        // 🔴 Fatal: invalid ID
        const isInvalidId =
          msg.includes('invalid employee id') ||
          msg.includes('id not found') ||
          msg.includes('employee not found');

        // 🔴 Fatal: real auth/config error
        const isAuthError =
          msg.includes('unauthorized') ||
          msg.includes('forbidden') ||
          msg.includes('api key') ||
          msg.includes('auth token');

        if (isInvalidId) {
          document.dispatchEvent(
            new CustomEvent('login:error', {
              detail: { message: 'Invalid Employee ID. Please try again.', fatal: true }
            })
          );
          throw err;
        }

        if (isAuthError) {
          document.dispatchEvent(
            new CustomEvent('login:error', {
              detail: { message: 'Login service is misconfigured. Contact an admin.', fatal: true }
            })
          );
          throw err;
        }

        // 🟡 Retryable: network / timeout / cold-start
        if (!navigator.onLine) {
          document.dispatchEvent(
            new CustomEvent('login:progress', {
              detail: { attempt, elapsed: Date.now() - startTime, note: 'offline' }
            })
          );
        }

        const jitter = Math.floor(Math.random() * 250);
        const backoff = Math.min(800 * Math.pow(2, attempt - 1), 8000) + jitter;
        document.dispatchEvent(
          new CustomEvent('login:progress', {
            detail: { attempt, elapsed: Date.now() - startTime, note: 'retrying', backoff }
          })
        );
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
    }

    // ⏳ Timeout reached
    document.dispatchEvent(
      new CustomEvent('login:error', {
        detail: {
          message: 'Login is taking longer than expected (server waking up). Please try again.',
          fatal: false
        }
      })
    );
    throw new Error('Login timeout');
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

