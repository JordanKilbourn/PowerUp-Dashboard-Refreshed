// scripts/layout.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const html = `
  <aside class="sidebar" id="pu-sidebar">
    <div class="logo"><span class="dot"></span><span class="brand">PowerUp</span></div>
    <nav class="menu">
      <a href="Dashboard-Refresh.html" class="item"><i class="fas fa-home"></i><span>Dashboard</span></a>
      <a href="level-tracker.html" class="item"><i class="fas fa-chart-line"></i><span>Level Tracker</span></a>
      <a href="power-hours.html" class="item"><i class="fas fa-clock"></i><span>Power Hours</span></a>
      <a href="notes.html" class="item"><i class="fas fa-sticky-note"></i><span>Notes</span></a>
      <a href="squads.html" class="item"><i class="fas fa-people-group"></i><span>Squads</span></a>
    </nav>
  </aside>
  <header class="header" id="pu-header">
    <button id="pu-toggle" aria-label="Toggle menu"><i class="fas fa-bars"></i></button>
    <div class="grow"></div>
    <div class="user">
      <span data-hook="userName">—</span> · <span data-hook="userLevel">—</span>
      <button class="btn small" data-hook="logout" style="margin-left:10px;">Logout</button>
    </div>
  </header>`;
  function injectLayout() {
    // Only inject if page doesn't already have your layout
    if (!document.querySelector('#pu-header') && !document.querySelector('#pu-sidebar')) {
      const wrap = document.createElement('div');
      wrap.className = 'layout-shell';
      wrap.innerHTML = html;
      document.body.prepend(wrap);
      // push existing content into a main container for padding
      const main = document.createElement('main');
      main.className = 'content';
      // move all siblings after the shell into main
      const nodes = [];
      while (wrap.nextSibling) nodes.push(wrap.nextSibling), wrap.parentNode.removeChild(wrap.nextSibling);
      nodes.forEach(n => main.appendChild(n));
      wrap.after(main);
      // simple toggle
      const btn = document.getElementById('pu-toggle');
      const sidebar = document.getElementById('pu-sidebar');
      btn.addEventListener('click', () => sidebar.classList.toggle('expanded'));
    }
  }
  P.layout = { injectLayout };
  window.PowerUp = P;
}(window.PowerUp || {}));
