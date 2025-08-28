// scripts/squads-cards.js
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

  // Column maps
  const EMP_COL = { id: ['Position ID','Employee ID'], name: ['Display Name','Employee Name','Name'] };
  const SQUAD_COL = {
    id: ['Squad ID','ID'],
    name: ['Squad Name','Squad','Name','Team'],
    category: ['Category','Squad Category'],
    leaderId: ['Squad Leader','Leader Employee ID','Leader Position ID'],
    members: ['Members','Member List'],
    objective: ['Objective','Focus','Purpose'],
    active: ['Active','Is Active?'],
    created: ['Created Date','Start Date','Started'],
    notes: ['Notes','Description']
  };

  const CATS = ['All','CI','Quality','Safety','Other'];
  const CAT_CLASS = { CI:'cat-ci', Quality:'cat-quality', Safety:'cat-safety', Other:'cat-other' };

  const pick = (row, list, d='') => { for (const k of list) if (row[k]!=null && row[k]!=='' ) return row[k]; return d; };
  const dash = (v) => (v==null || String(v).trim()==='') ? '-' : String(v);
  const isTrue = (v) => v === true || /^(true|yes|y|checked|1)$/i.test(String(v ?? "").trim());

  function normCategory(v) {
    const t = String(v || '').toLowerCase();
    if (/^ci|improve/.test(t)) return 'CI';
    if (/^quality/.test(t))    return 'Quality';
    if (/^safety/.test(t))     return 'Safety';
    return 'Other';
  }
  function parseMemberTokens(text) {
    return String(text || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  }
  function userIsMemberOrLeader(squad, session) {
    const myId   = String(session.employeeId || '').trim();
    const myName = String(session.displayName || '').trim();
    if (myId && String(squad.leaderId || '').trim() === myId) return true;
    const tokensLC = parseMemberTokens(squad.members).map(t => t.toLowerCase());
    if (myId && tokensLC.includes(myId.toLowerCase())) return true;
    if (myName && tokensLC.includes(myName.toLowerCase())) return true;
    return false;
  }

  let ALL = [];
  let idToName = new Map();
  let IS_ADMIN = false;

  function renderCategoryPills(activeCat) {
    const wrap = document.getElementById('cat-pills');
    if (!wrap) return;
    wrap.innerHTML = CATS.map(cat =>
      `<button class="pill${cat===activeCat ? ' active':''}" data-cat="${cat}">${cat}</button>`
    ).join('');
  }

  function ensureLegend() {
    if (document.getElementById('s-legend')) return;
    const cards = document.getElementById('cards');
    if (!cards) return;
    const legend = document.createElement('div');
    legend.id = 's-legend';
    legend.className = 'squad-legend';
    legend.innerHTML = `
      <div class="chip"><span class="dot ci"></span> CI</div>
      <div class="chip"><span class="dot safety"></span> Safety</div>
      <div class="chip"><span class="dot quality"></span> Quality</div>
      <div class="chip"><span class="dot other"></span> Other</div>
    `;
    // Insert legend just above the cards grid
    cards.parentNode.insertBefore(legend, cards);
  }

  function renderCards(list) {
    const cards = document.getElementById('cards');
    const msg   = document.getElementById('s-msg');

    if (!cards) return;

    if (!list.length) {
      cards.innerHTML = '';
      if (msg) {
        msg.style.display = 'block';
        msg.innerHTML = `No squads match your filters.<br/>Try clearing search or showing inactive.`;
      }
      return;
    }
    if (msg) msg.style.display = 'none';

    cards.innerHTML = list.map(sq => {
      const status = isTrue(sq.active)
        ? `<span class="status-pill status-on">Active</span>`
        : `<span class="status-pill status-off">Inactive</span>`;
      const leader = dash(sq.leaderName || sq.leaderId);
      const detailsHref = sq.id
        ? `squad-details.html?id=${encodeURIComponent(sq.id)}`
        : `squad-details.html?name=${encodeURIComponent(sq.name)}`;
      const catCls = CAT_CLASS[sq.category] || CAT_CLASS.Other;

      return `
        <div class="squad-card card ${catCls}">
          <h4>${dash(sq.name)}</h4>
          <div class="squad-meta"><b>Leader:</b> ${leader}</div>
          <div class="squad-meta"><b>Status:</b> ${status}</div>
          <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
          <div class="squad-foot"><a class="squad-link" href="${detailsHref}">View Details →</a></div>
        </div>
      `;
    }).join('');
  }

  function applyFilters() {
    const session   = P.session.get();
    const cat       = document.querySelector('.pill.active')?.dataset.cat || 'All';
    let   myOnly    = document.getElementById('myOnly')?.checked;
    const activeOnly= document.getElementById('activeOnly')?.checked;
    const q         = (document.getElementById('search')?.value || '').trim().toLowerCase();

    // Admins see all squads; ignore myOnly
    if (IS_ADMIN) myOnly = false;

    let list = ALL.slice();

    if (myOnly) list = list.filter(s => userIsMemberOrLeader(s, session));
    if (activeOnly) list = list.filter(s => isTrue(s.active));
    if (cat !== 'All') list = list.filter(s => s.category === cat);

    if (q) {
      list = list.filter(s => {
        const hay = [s.name, s.leaderName, s.leaderId, s.objective, s.notes].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    renderCards(list);
  }

  async function load() {
    const emRows = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    idToName = new Map();
    emRows.forEach(r => {
      const id   = pick(r, EMP_COL.id, '').toString().trim();
      const name = pick(r, EMP_COL.name, '').toString().trim();
      if (id) idToName.set(id, name);
    });

    const rows = await getRowsByTitle(SHEETS.SQUADS);
    ALL = rows
      .map(r => {
        const name = pick(r, SQUAD_COL.name, '').toString().trim();
        if (!name) return null;
        const leaderId = pick(r, SQUAD_COL.leaderId, '').toString().trim();
        return {
          id:        pick(r, SQUAD_COL.id, ''),
          name,
          category:  normCategory(pick(r, SQUAD_COL.category, 'Other')),
          leaderId,
          leaderName: idToName.get(leaderId) || '',
          members:   pick(r, SQUAD_COL.members, ''),
          objective: pick(r, SQUAD_COL.objective, ''),
          active:    pick(r, SQUAD_COL.active, ''),
          created:   pick(r, SQUAD_COL.created, ''),
          notes:     pick(r, SQUAD_COL.notes, '')
        };
      })
      .filter(Boolean);
  }

  function wireUI() {
    renderCategoryPills('All');
    ensureLegend();

    const pills = document.getElementById('cat-pills');
    if (pills) {
      pills.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cat]');
        if (!btn) return;
        pills.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      });
    }

    document.getElementById('myOnly')?.addEventListener('change', applyFilters);
    document.getElementById('activeOnly')?.addEventListener('change', applyFilters);
    document.getElementById('search')?.addEventListener('input', applyFilters);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    P.session.requireLogin();
    P.layout.injectLayout();

    // Admin mode?
    const isAdminFn = P.auth && P.auth.isAdmin;
    IS_ADMIN = !!(isAdminFn && isAdminFn());
    P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');

    await P.session.initHeader();

    wireUI();

    if (IS_ADMIN) {
      const myOnly = document.getElementById('myOnly');
      if (myOnly) { myOnly.checked = false; myOnly.disabled = true; myOnly.closest('label')?.setAttribute('title','Disabled in Admin mode'); }
      const activeOnly = document.getElementById('activeOnly');
      if (activeOnly) activeOnly.checked = false;
    }

    await load();
    applyFilters();
  });

  window.PowerUp = P;
})(window.PowerUp || {});
