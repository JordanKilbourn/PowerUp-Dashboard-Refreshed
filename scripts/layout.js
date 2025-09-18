(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});

  const SHELL_HTML = `
    <div class="container" id="pu-shell">
      <!-- Sidebar (hover pills) -->
      <nav class="sidebar sidebar--hover" id="sidebar" aria-label="Primary">
        <a class="item" data-link="Dashboard-Refresh.html">
          <i class="fas fa-home"></i><span class="label">Dashboard</span>
        </a>
        <a class="item" data-link="level-tracker.html">
          <i class="fas fa-layer-group"></i><span class="label">Level Tracker</span>
        </a>
        <a class="item" data-link="power-hours.html">
          <i class="fas fa-clock"></i><span class="label">Power Hours</span>
        </a>
        <a class="item" data-link="notes.html">
          <i class="fas fa-sticky-note"></i><span class="label">Notes</span>
        </a>
        <a class="item" data-link="squads.html">
          <i class="fas fa-users"></i><span class="label">Squads</span>
        </a>

        <div class="sidebar-spacer" aria-hidden="true"></div>

        <a class="item logout" id="pu-logout">
          <i class="fas fa-sign-out-alt"></i><span class="label">Logout</span>
        </a>
      </nav>

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

    // Nav wiring + highlighting
    shell.querySelectorAll('.sidebar .item[data-link]').forEach(el => {
      const href = el.getAttribute('data-link') || '';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        if (href) location.href = href;
      });
      const here = location.pathname.split('/').pop();
      if (here && href.split('?')[0] === here.split('?')[0]) el.classList.add('active');
      // Accessibility label
      const lbl = el.querySelector('.label')?.textContent?.trim();
      if (lbl) el.setAttribute('aria-label', lbl);
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

    // Kill any native tooltips another script might add to the sidebar
    neutralizeNativeSidebarTooltips();
  }

  function neutralizeNativeSidebarTooltips() {
    const sb = document.getElementById('sidebar');
    if (!sb) return;

    const strip = () => {
      sb.querySelectorAll('.item, .item i').forEach(el => {
        if (el.hasAttribute('title')) el.removeAttribute('title');
      });
    };
    strip();

    // If something re-adds titles later, remove them again.
    const mo = new MutationObserver(strip);
    mo.observe(sb, { attributes: true, subtree: true, attributeFilter: ['title'] });
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
         <td colspan="${colCount}">
           <div class="table-empty">${htmlMessage}</div>
         </td>
       </tr>`;
  }

  // Unified helper for titles
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

  P.layout = { injectLayout, setPageTitle, setTitles, setUserHeaderFromEmployeeMaster, setEmptyRow, fitDashboardBlocks };
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
  function onDashboard() {
    return document.body.classList.contains('dashboard');
  }

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
