// scripts/layout.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const SHELL_HTML = `
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
    </header>
  `;
  function injectLayout(){
    if (document.querySelector('#pu-header') || document.querySelector('#pu-sidebar')) return;
    const shell = document.createElement('div'); shell.className='layout-shell'; shell.innerHTML=SHELL_HTML;
    document.body.prepend(shell);
    const main=document.createElement('main'); main.className='content';
    const rest=[]; while (shell.nextSibling){ rest.push(shell.nextSibling); shell.parentNode.removeChild(shell.nextSibling); }
    rest.forEach(n=>main.appendChild(n)); shell.after(main);
    document.body.classList.remove('sidebar-expanded');
    document.getElementById('pu-toggle').addEventListener('click',()=>{ document.body.classList.toggle('sidebar-expanded'); });
  }
  P.layout = { injectLayout };
  window.PowerUp = P;
}(window.PowerUp || {}));
