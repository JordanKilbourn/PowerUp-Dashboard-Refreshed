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
    members: ['Members','Member List'], // legacy CSV column (fallback only)
    objective: ['Objective','Focus','Purpose'],
    active: ['Active','Is Active?'],
    created: ['Created Date','Start Date','Started'],
    notes: ['Notes','Description']
  };
  const SMEMBER_COL = {
    squadId: ['Squad ID','SquadId','Squad'],
    employeeId: ['Employee ID','EmployeeId','Position ID']
  };

  // Categories — includes Training
  const CATS = ['All','CI','Quality','Safety','Training','Other'];
  const CAT_CLASS = {
    CI: 'cat-ci',
    Quality: 'cat-quality',
    Safety: 'cat-safety',
    Training: 'cat-training',
    Other: 'cat-other'
  };

  const pick = (row, list, d='') => { for (const k of list) if (row[k]!=null && row[k]!=='' ) return row[k]; return d; };
  const dash = (v) => (v==null || String(v).trim()==='') ? '-' : String(v);
  const isTrue = (v) => v === true || /^(true|yes|y|checked|1)$/i.test(String(v ?? "").trim());

  function normCategory(v) {
    const t = String(v || '').toLowerCase();
    if (/^ci|improve/.test(t))     return 'CI';
    if (/^quality/.test(t))        return 'Quality';
    if (/^safety/.test(t))         return 'Safety';
    if (/^training/.test(t))       return 'Training';
    return 'Other';
  }
  function parseMemberTokens(text) {
    return String(text || '').split(/[,;\n]+').map(s => s.trim()).filter(Boolean);
  }

  // Data
  let ALL = [];                 // list of squads (from SQUADS)
  let idToName = new Map();     // Employee ID -> Name (from EMPLOYEE_MASTER)
  let IS_ADMIN = false;

  // New: membership map built from SQUAD_MEMBERS
  // Map<squadId, Set<employeeId>>
  const MEMBERS_BY_SQUAD = new Map();

  // Category → CSS var
  function catVar(cat) {
    switch (cat) {
      case 'CI':       return 'var(--sq-ci)';
      case 'Quality':  return 'var(--sq-quality)';
      case 'Safety':   return 'var(--sq-safety)';
      case 'Training': return 'var(--sq-training)';
      case 'Other':    return 'var(--sq-other)';
      default:         return 'var(--accent)';
    }
  }

  // Render dot “legend-style” pills in the toolbar
  function renderCategoryPills(activeCat) {
    const wrap = document.getElementById('cat-pills');
    if (!wrap) return;
    wrap.innerHTML = CATS.map(cat => {
      const style = `--cat:${catVar(cat)};`;
      return `
        <button class="pill-cat${cat===activeCat ? ' active':''}" data-cat="${cat}" style="${style}">
          <span class="dot"></span>${cat}
        </button>
      `;
    }).join('');
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

  function userIsMemberOrLeader(squad, session) {
    const myId   = String(session.employeeId || '').trim();
    const myName = String(session.displayName || '').trim();

    // Leader privilege
    if (myId && String(squad.leaderId || '').trim() === myId) return true;

    // Prefer membership from SQUAD_MEMBERS
    const set = MEMBERS_BY_SQUAD.get(String(squad.id || '').trim());
    if (set && myId && set.has(myId)) return true;

    // Fallback: legacy CSV column on SQUADS (only if present)
    const tokensLC = parseMemberTokens(squad.members).map(t => t.toLowerCase());
    if (myId && tokensLC.includes(myId.toLowerCase())) return true;
    if (myName && tokensLC.includes(myName.toLowerCase())) return true;

    return false;
  }

  function applyFilters() {
    const session   = P.session.get();
    const cat       = document.querySelector('.pill-cat.active')?.dataset.cat || 'All';
    let   myOnly    = document.getElementById('myOnly')?.checked;
    const activeOnly= document.getElementById('activeOnly')?.checked;
    const q         = (document.getElementById('search')?.value || '').trim().toLowerCase();

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
    // Employees -> idToName
    const emRows = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    idToName = new Map();
    emRows.forEach(r => {
      const id   = pick(r, EMP_COL.id, '').toString().trim();
      const name = pick(r, EMP_COL.name, '').toString().trim();
      if (id) idToName.set(id, name);
    });

    // Squads
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
          members:   pick(r, SQUAD_COL.members, ''), // legacy fallback only
          objective: pick(r, SQUAD_COL.objective, ''),
          active:    pick(r, SQUAD_COL.active, ''),
          created:   pick(r, SQUAD_COL.created, ''),
          notes:     pick(r, SQUAD_COL.notes, '')
        };
      })
      .filter(Boolean);

    // Membership: build map from SQUAD_MEMBERS (authoritative)
    MEMBERS_BY_SQUAD.clear();
    const memRows = await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
    memRows.forEach(r => {
      const sid = pick(r, SMEMBER_COL.squadId, '').toString().trim();
      const eid = pick(r, SMEMBER_COL.employeeId, '').toString().trim();
      if (!sid || !eid) return;
      if (!MEMBERS_BY_SQUAD.has(sid)) MEMBERS_BY_SQUAD.set(sid, new Set());
      MEMBERS_BY_SQUAD.get(sid).add(eid);
    });
  }

  function wireUI() {
    renderCategoryPills('All'); // dot pills in toolbar

    const pills = document.getElementById('cat-pills');
    if (pills) {
      pills.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cat]');
        if (!btn) return;
        pills.querySelectorAll('.pill-cat').forEach(p => p.classList.remove('active'));
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
