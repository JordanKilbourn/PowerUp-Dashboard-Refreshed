// scripts/layout.js — Shared shell (sidebar + header) with NO month line + Logout button
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});

  const SHELL_HTML = `
    <div class="container" id="pu-shell">
      <!-- Sidebar -->
      <div class="sidebar" id="sidebar">
        <div class="item" id="pu-toggle-item">
          <i class="fas fa-bars"></i><span>Menu</span>
        </div>
        <div class="item" data-link="Dashboard-Refresh.html">
          <i class="fas fa-home"></i><span>Dashboard</span>
        </div>
        <div class="item" data-link="level-tracker.html">
          <i class="fas fa-layer-group"></i><span>Level Tracker</span>
        </div>
        <div class="item" data-link="power-hours.html">
          <i class="fas fa-clock"></i><span>Power Hours</span>
        </div>
        <div class="item" data-link="notes.html">
          <i class="fas fa-sticky-note"></i><span>Notes</span>
        </div>
        <div class="item" data-link="squads.html">
          <i class="fas fa-users"></i><span>Squads</span>
        </div>

        <!-- Spacer pushes logout to bottom -->
        <div class="sidebar-spacer"></div>

        <!-- Logout button -->
        <div class="item logout" id="pu-logout">
          <i class="fas fa-sign-out-alt"></i><span>Logout</span>
        </div>
      </div>

      <!-- Main -->
      <div class="main">
        <div class="header" id="pu-header">
          <h1 id="pu-page-title">PowerUp</h1>
          <p>
            Welcome: <span data-hook="userName">—</span>
            &emsp; Level: <span data-hook="userLevel">Level Unknown</span>
            &emsp; <button id="pu-refresh" class="btn btn-xs" style="margin-left:8px;border:1px solid #2a354b;background:#0b1328;color:#e5e7eb;border-radius:8px;padding:6px 10px;cursor:pointer">Refresh Data</button>
          </p>
        </div>
        <!-- All page-specific content will be moved into .content -->
        <div class="content" id="pu-content"></div>
      </div>
    </div>
  `;

  function injectLayout() {
    if (document.getElementById('pu-shell')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = SHELL_HTML;
    const shell = wrap.firstElementChild;
    document.body.prepend(shell);

    // Move page content into .content below the header
    const content = document.getElementById('pu-content');
    const toMove = [];
    let n = shell.nextSibling;
    while (n) { toMove.push(n); n = n.nextSibling; }
    toMove.forEach(node => content.appendChild(node));

    // Sidebar toggle
    function toggleSidebar() {
      const sb = document.getElementById('sidebar');
      const expanded = sb.classList.toggle('expanded');
      document.body.classList.toggle('sidebar-expanded', expanded);
      requestAnimationFrame(fitDashboardBlocks);
    }
    document.getElementById('pu-toggle-item').addEventListener('click', toggleSidebar);

    // Nav highlighting
    shell.querySelectorAll('.sidebar .item[data-link]').forEach(el => {
      const href = el.getAttribute('data-link') || '';
      el.addEventListener('click', () => (href ? (location.href = href) : null));
      const here = location.pathname.split('/').pop();
      if (here && href.split('?')[0] === here.split('?')[0]) el.classList.add('active');
    });

    // Logout button wiring — use robust helper so caches/session are wiped
    const logoutBtn = document.getElementById('pu-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.PowerUpLogout && window.PowerUpLogout();
      });
    }

    // Refresh button wiring (clear cache + reload)
    const refreshBtn = document.getElementById('pu-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        try { window.P && P.api && P.api.clearCache && P.api.clearCache(); } catch {}
        try { sessionStorage.removeItem('pu.sheetCache.v1'); } catch {}
        location.reload();
      });
    }

    // Set default page title from document.title
    const h1 = document.getElementById('pu-page-title');
    if (h1 && document.title) h1.textContent = document.title;

    // Initial layout sizing
    requestAnimationFrame(fitDashboardBlocks);

    // Hydrate header user info (name + level)
    setUserHeaderFromEmployeeMaster();

    // 🔹 NEW: render admin employee filter dropdown (admins only)
    try { PowerUp.auth?.installEmployeeFilterUI && PowerUp.auth.installEmployeeFilterUI(); } catch (e) { console.debug('admin filter UI failed', e); }
  }

  function setPageTitle(text) {
    const h1 = document.getElementById('pu-page-title');
    if (h1) h1.textContent = text || 'PowerUp';
  }

  function fitDashboardBlocks() {
    const root = document.documentElement;
    const header = document.getElementById('pu-header');
    const cards  = document.querySelector('.top-cards');
    const tabs   = document.querySelector('.tab-buttons');

    const vh = window.innerHeight;
    const headerH = header ? header.offsetHeight : 64;
    const cardsH  = cards  ? cards.offsetHeight  : 0;
    const tabsH   = tabs   ? tabs.offsetHeight   : 0;

    const gutter = 24;
    const tableMax = Math.max(240, vh - headerH - cardsH - tabsH - gutter);

    root.style.setProperty('--header-h', `${headerH}px`);
    root.style.setProperty('--table-max', `${tableMax}px`);
  }
  window.addEventListener('resize', fitDashboardBlocks);

  // Central header hydration
  function norm(s){ return String(s || "").trim().toLowerCase(); }
  async function setUserHeaderFromEmployeeMaster() {
    try {
      const sess = PowerUp.session?.get?.() || {};
      const nameEl  = document.querySelector('[data-hook="userName"]');
      const levelEl = document.querySelector('[data-hook="userLevel"]');
      if (nameEl && sess.displayName) nameEl.textContent = sess.displayName;

      if (PowerUp.auth?.isAdmin && PowerUp.auth.isAdmin()) {
        if (levelEl) levelEl.textContent = 'Admin';
        return;
      }

      const rows = await PowerUp.api.getRowsByTitle("EMPLOYEE_MASTER");
      const row =
        rows.find(r => norm(r["Position ID"]) === norm(sess.employeeId)) ||
        rows.find(r => norm(r["Display Name"] || r["Employee Name"] || r["Name"]) === norm(sess.displayName));

      const level = row ? (row["PowerUp Level (Select)"] ?? row["PowerUp Level"] ?? row["Level"]) : null;
      if (levelEl) levelEl.textContent = level ? String(level) : "Level Unknown";
    } catch (e) {
      console.debug("[layout] setUserHeaderFromEmployeeMaster failed:", e);
    }
  }

  P.layout = { injectLayout, setPageTitle, setUserHeaderFromEmployeeMaster };
  window.PowerUp = P;

})(window.PowerUp || {});

// ---- PowerUp: robust logout wiring (append-only)
(function () {
  function safe(fn) { try { fn && fn(); } catch (_) {} }

  window.PowerUpLogout = function () {
    safe(() => window.P && P.api && P.api.clearCache && P.api.clearCache());
    safe(() => sessionStorage.removeItem('pu.sheetCache.v1'));
    safe(() => sessionStorage.removeItem('pu.session'));
    safe(() => localStorage.removeItem('powerup_session'));
    location.href = 'login.html';
  };

  document.addEventListener('DOMContentLoaded', function () {
    var candidates = Array.from(document.querySelectorAll(
      '#btnLogout, #pu-logout, [data-action="logout"], a[href*="logout"]'
    ));
    candidates.forEach(function (el) {
      if (!el._logoutWired) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          window.PowerUpLogout();
        });
        el._logoutWired = true;
      }
    });
  });
})();
