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
            
          </p>

          <!-- 🔹 Single, dedicated row for ALL header filters/buttons -->
          <div class="pu-filters-row" id="pu-filters-row" style="
            display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:nowrap;
          "></div>
        </div>
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

    // Logout
    const logoutBtn = document.getElementById('pu-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.PowerUpLogout && window.PowerUpLogout();
      });
    }

    // Title
    const h1 = document.getElementById('pu-page-title');
    if (h1 && document.title) h1.textContent = document.title;

    requestAnimationFrame(fitDashboardBlocks);

    // Hydrate header name + level
    setUserHeaderFromEmployeeMaster();

    // 🔹 Install Admin filter UI (if available) and force it into #pu-filters-row
    const filtersRow = document.getElementById('pu-filters-row');

    function moveAdminFilterIntoRow() {
      const admin =
        document.getElementById('pu-admin-filter') ||
        document.querySelector('[data-hook="adminFilterContainer"]') ||
        (document.querySelector('[data-hook="adminFilter"]') && document.querySelector('[data-hook="adminFilter"]').closest('div')) ||
        document.querySelector('#adminFilter');
      if (admin && admin.parentElement !== filtersRow) {
        filtersRow.prepend(admin); // ensure it's first in the row
      }
    }

    try {
      if (PowerUp.auth?.installEmployeeFilterUI) {
        PowerUp.auth.installEmployeeFilterUI();
        moveAdminFilterIntoRow();
      }
    } catch (e) {
      console.debug('[layout] admin filter UI skipped:', e);
    }

    // In case the admin control renders a bit later (async), observe and move it once
    const obs = new MutationObserver(() => {
      moveAdminFilterIntoRow();
    });
    obs.observe(document.getElementById('pu-header'), { childList: true, subtree: true });
    // Stop observing after a short grace period to avoid overhead
    setTimeout(() => obs.disconnect(), 3000);
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

// ---- robust logout wiring (unchanged) ----
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

/* Viewport-aware height for ONLY the 3 dashboard tab tables */
(function () {
  function onDashboard() {
    return document.body.classList.contains('dashboard');
  }

  const BOTTOM_PAD = 24; // slightly larger breathing room
  const TABLE_IDS = ['ci-table', 'safety-table', 'quality-table'];

  function sizeFor(el) {
    if (!el) return;
    const scroller = el.closest('.table-scroll') || el;
    const vH = window.innerHeight || document.documentElement.clientHeight;
    const top = scroller.getBoundingClientRect().top;
    const h = Math.max(140, vH - top - BOTTOM_PAD);
    scroller.style.setProperty('--table-max', h + 'px');
    scroller.style.maxHeight = h + 'px';
  }

  function sizeDashboardTables() {
    if (!onDashboard()) return;
    TABLE_IDS.forEach(id => sizeFor(document.getElementById(id)));
  }

  // Expose so renderers can call after data loads or filters change
  window.PU = window.PU || {};
  window.PU.sizeDashboardTables = sizeDashboardTables;

  // “Soon” helper — handles late reflows (fonts, filters, etc.)
  function sizeSoon() {
    sizeDashboardTables();
    requestAnimationFrame(sizeDashboardTables);
    setTimeout(sizeDashboardTables, 120);
  }

  window.addEventListener('load', sizeSoon, { once: true });
  window.addEventListener('resize', sizeSoon);

  // Recalc when switching tabs
  document.addEventListener('click', e => {
    if (e.target.closest('.tab-button')) setTimeout(sizeSoon, 0);
  });

  // Recalc when the content column shifts (sidebar expand/collapse)
  const content = document.getElementById('pu-content');
  if (content && 'ResizeObserver' in window) {
    new ResizeObserver(sizeSoon).observe(content);
  }

    // Turn vertical wheel into horizontal scroll for the dashboard tables
  function installWheel(scroller) {
    if (!scroller || scroller._hscrollWired) return;
    scroller.addEventListener('wheel', (e) => {
      // Only hijack when there's horizontal overflow and no vertical scrolling happening
      const canHX = scroller.scrollWidth > scroller.clientWidth;
      const canVY = scroller.scrollHeight > scroller.clientHeight;
      if (!canHX) return;                       // nothing to do
      if (!canVY || Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
        scroller.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
    scroller._hscrollWired = true;
  }

  function wireWheelForTables() {
    if (!onDashboard()) return;
    ['ci-table','safety-table','quality-table'].forEach(id => {
      const el = document.getElementById(id);
      const scroller = el && (el.closest('.table-scroll') || el);
      if (scroller) installWheel(scroller);
    });
  }

  // call alongside sizing hooks
  window.addEventListener('load', wireWheelForTables, { once:true });
  window.addEventListener('resize', wireWheelForTables);
  document.addEventListener('click', e => {
    if (e.target.closest('.tab-button')) setTimeout(wireWheelForTables, 0);
  });


  // If layout.js recomputes header height, also nudge tables
  const oldFit = window.fitDashboardBlocks;
  // (If you kept fitDashboardBlocks scoped, just call sizeSoon() at the end of it instead)
  if (typeof oldFit === 'function') {
    window.fitDashboardBlocks = function () {
      oldFit();
      sizeSoon();
    };
  }
})();



