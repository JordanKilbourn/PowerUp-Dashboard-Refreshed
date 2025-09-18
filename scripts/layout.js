(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});

  const SHELL_HTML = `
    <div class="container" id="pu-shell">
      <!-- Sidebar -->
      <div class="sidebar" id="sidebar">
        <div class="item snav" data-link="Dashboard-Refresh.html">
          <i class="fas fa-home"></i><span class="snav-label">Dashboard</span>
        </div>
        <div class="item snav" data-link="level-tracker.html">
          <i class="fas fa-layer-group"></i><span class="snav-label">Level Tracker</span>
        </div>
        <div class="item snav" data-link="power-hours.html">
          <i class="fas fa-clock"></i><span class="snav-label">Power Hours</span>
        </div>
        <div class="item snav" data-link="notes.html">
          <i class="fas fa-sticky-note"></i><span class="snav-label">Notes</span>
        </div>
        <div class="item snav" data-link="squads.html">
          <i class="fas fa-users"></i><span class="snav-label">Squads</span>
        </div>

        <div class="sidebar-spacer"></div>

        <div class="item snav logout" id="pu-logout">
          <i class="fas fa-sign-out-alt"></i><span class="snav-label">Logout</span>
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

          <!-- Single, dedicated row for ALL header filters/buttons -->
          <div class="pu-filters-row" id="pu-filters-row" style="
            display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:nowrap;
          "></div>
        </div>
        <div class="content" id="pu-content"></div>
      </div>
    </div>
  `;

  // Inject the small flyout-only sidebar CSS once
  function ensureFlyoutCSS() {
    if (document.getElementById('pu-flyout-css')) return;
    const css = document.createElement('style');
    css.id = 'pu-flyout-css';
    css.textContent = `
      /* --- Compact icon bar with hover flyout (no page push) --- */
      .sidebar { width: 72px; } /* keep your collapsed width */
      .sidebar .item.snav {
        position: relative;
        width: 48px; height: 48px;
        margin: 10px 12px;
        border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
        background: var(--sidebar-bg);
        border: 1px solid rgba(255,255,255,.08);
        box-shadow: 0 2px 6px rgba(0,0,0,.35);
        cursor: pointer;
      }
      .sidebar .item.snav i { color: rgba(255,255,255,.9); font-size: 20px; }
      .sidebar .item.snav.active { box-shadow: 0 0 0 2px var(--accent) inset; }

      /* One-piece label that slides out; overlaps content */
      .sidebar .item.snav .snav-label {
        position: absolute; top: 0; left: 52px;
        height: 100%;
        display: inline-flex; align-items: center;
        padding: 0 12px;
        background: var(--sidebar-bg);
        color: var(--text);
        border: 1px solid rgba(255,255,255,.10);
        border-left: none; /* visually fuse with the icon block */
        border-top-right-radius: 12px;
        border-bottom-right-radius: 12px;
        white-space: nowrap;
        opacity: 0;
        transform: translateX(-8px);
        pointer-events: none;
        transition: transform .18s ease, opacity .18s ease, box-shadow .18s ease;
        box-shadow: 2px 2px 8px rgba(0,0,0,.35);
        z-index: 1100; /* above content */
      }
      .sidebar .item.snav:hover .snav-label {
        opacity: 1;
        transform: translateX(0);
      }
      /* Keep your existing glow-on-hover vibe, only on the icon puck */
      .sidebar .item.snav:hover { box-shadow: 0 0 8px var(--accent); }
      .sidebar .item.snav:hover i { color: var(--accent); }

      /* Logout tint on hover (matches your existing feel) */
      .sidebar .item.logout:hover {
        background: rgba(255,0,0,0.12);
        border-color: rgba(255,0,0,0.25);
      }
    `;
    document.head.appendChild(css);
  }

  function injectLayout() {
    if (document.getElementById('pu-shell')) return;

    ensureFlyoutCSS();

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

    // NOTE: removed old expand/collapse code; no margin shoves anymore

    // Nav highlighting + clicks
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

    // Admin filter UI -> header row
    const filtersRow = document.getElementById('pu-filters-row');

    function moveAdminFilterIntoRow() {
      const admin =
        document.getElementById('pu-admin-filter') ||
        document.querySelector('[data-hook="adminFilterContainer"]') ||
        (document.querySelector('[data-hook="adminFilter"]') && document.querySelector('[data-hook="adminFilter"]').closest('div')) ||
        document.querySelector('#adminFilter');
      if (admin && admin.parentElement !== filtersRow) {
        filtersRow.prepend(admin);
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

    const obs = new MutationObserver(() => { moveAdminFilterIntoRow(); });
    obs.observe(document.getElementById('pu-header'), { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 3000);
  }

  function setPageTitle(text) {
    const h1 = document.getElementById('pu-page-title');
    if (h1) h1.textContent = text || 'PowerUp';
  }

  // Render a single full-width empty row into a table body
  function setEmptyRow(tableElOrId, htmlMessage) {
    const table =
      typeof tableElOrId === 'string'
        ? document.getElementById(tableElOrId)
        : tableElOrId;
    if (!table) return;

    const tbody =
      table.tBodies?.[0] || table.querySelector('tbody') || table;
    const colCount =
      (table.tHead && table.tHead.rows[0]?.cells.length) ||
      (table.rows[0]?.cells.length) ||
      1;

    tbody.innerHTML =
      `<tr class="table-empty-row" role="status" aria-live="polite">
         <td colspan="\${colCount}">
           <div class="table-empty">\${htmlMessage}</div>
         </td>
       </tr>`;
  }

  // Unified helper for tab + header titles
  function setTitles(pageName) {
    const full = `PowerUp — ${pageName}`;
    document.title = full;   // browser tab
    setPageTitle(full);      // in-header h1
  }

  function fitDashboardBlocks() {
    const root   = document.documentElement;
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

    try { window.PU && window.PU.sizeDashboardTables && window.PU.sizeDashboardTables(); } catch {}
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

  P.layout = { injectLayout, setPageTitle, setTitles, setUserHeaderFromEmployeeMaster, setEmptyRow };
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

/* Viewport-aware height for ONLY the 3 dashboard tab tables (no wheel hijack) */
(function () {
  function onDashboard() { return document.body.classList.contains('dashboard'); }

  const BOTTOM_PAD = 24;
  const TABLE_IDS = ['ci-table', 'safety-table', 'quality-table'];

  function sizeFor(el) {
    if (!el) return;
    const scroller = el.closest('.table-scroll') || el;
    const vH  = window.innerHeight || document.documentElement.clientHeight;
    const top = scroller.getBoundingClientRect().top;
    const h   = Math.max(140, vH - top - BOTTOM_PAD);
    scroller.style.setProperty('--table-max', h + 'px');
    scroller.style.maxHeight = h + 'px';
  }

  function sizeDashboardTables() {
    if (!onDashboard()) return;
    TABLE_IDS.forEach(id => sizeFor(document.getElementById(id)));
  }

  window.PU = window.PU || {};
  window.PU.sizeDashboardTables = sizeDashboardTables;

  function sizeSoon() {
    sizeDashboardTables();
    requestAnimationFrame(sizeDashboardTables);
    setTimeout(sizeDashboardTables, 120);
  }

  window.addEventListener('load',   sizeSoon, { once: true });
  window.addEventListener('resize', sizeSoon);

  document.addEventListener('click', e => {
    if (e.target.closest('.tab-button')) setTimeout(sizeSoon, 0);
  });

  const content = document.getElementById('pu-content');
  if (content && 'ResizeObserver' in window) {
    new ResizeObserver(sizeSoon).observe(content);
  }

  const oldFit = window.fitDashboardBlocks;
  if (typeof oldFit === 'function') {
    window.fitDashboardBlocks = function () {
      oldFit();
      sizeSoon();
    };
  }
})();
