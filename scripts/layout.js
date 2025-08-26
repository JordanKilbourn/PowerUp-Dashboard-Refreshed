// scripts/layout.js — Shared shell (sidebar + header) with NO month line + Logout button
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});

  // The shell HTML. We include a .content container so your CSS margin-left rules apply.
  // We also make the sidebar a flex column so the logout can be pinned to the bottom.
  const SHELL_HTML = `
    <div class="container" id="pu-shell">
      <!-- Sidebar -->
      <div class="sidebar" id="sidebar" style="display:flex;flex-direction:column;">
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
        <div class="sidebar-spacer" style="flex:1 1 auto;"></div>

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
        </div>

        <!-- All page-specific content will be moved into here -->
        <div class="content" id="pu-content"></div>
      </div>
    </div>
  `;

  function injectLayout() {
    // Prevent double injection
    if (document.getElementById('pu-shell')) return;

    // Insert shell at the top of <body>
    const wrap = document.createElement('div');
    wrap.innerHTML = SHELL_HTML;
    const shell = wrap.firstElementChild;
    document.body.prepend(shell);

    // Move existing page content into .content (under the header, right of sidebar)
    const content = shell.querySelector('#pu-content');
    const nodesToMove = [];
    let n = shell.nextSibling;
    while (n) { nodesToMove.push(n); n = n.nextSibling; }
    nodesToMove.forEach(node => content.appendChild(node));

    // Sidebar toggle wiring (adds/removes .sidebar-expanded on <body>)
    function toggleSidebar() {
      const sb = document.getElementById('sidebar');
      const expanded = sb.classList.toggle('expanded');
      document.body.classList.toggle('sidebar-expanded', expanded);
    }
    const toggleEl = document.getElementById('pu-toggle-item');
    if (toggleEl) toggleEl.addEventListener('click', toggleSidebar);

    // Nav click + active highlight
    shell.querySelectorAll('.sidebar .item[data-link]').forEach(el => {
      const href = el.getAttribute('data-link') || '';
      el.addEventListener('click', () => { if (href) location.href = href; });
      const here = location.pathname.split('/').pop();
      if (here && href.split('?')[0] === here.split('?')[0]) el.classList.add('active');
    });

    // Logout button
    const logoutBtn = document.getElementById('pu-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        try { PowerUp.session?.logout?.(); } catch (e) { console.error(e); }
      });
    }

    // Set default page title from document.title (can be overridden via setPageTitle)
    const h1 = document.getElementById('pu-page-title');
    if (h1 && document.title) h1.textContent = document.title;
  }

  function setPageTitle(text) {
    const h1 = document.getElementById('pu-page-title');
    if (h1) h1.textContent = text || 'PowerUp';
  }

  P.layout = { injectLayout, setPageTitle };
  window.PowerUp = P;
}(window.PowerUp || {}));
