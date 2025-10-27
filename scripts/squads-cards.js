// =============================================
// PowerUp: Squads Page – Stable Reconciled Build 3 (SRB3)
// =============================================
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

  // ==== Column maps ====
  const EMP_COL = { id: ['Position ID', 'Employee ID'], name: ['Display Name', 'Employee Name', 'Name'] };
  const SQUAD_COL = {
    id: ['Squad ID', 'ID'],
    name: ['Squad Name', 'Squad', 'Name', 'Team'],
    category: ['Category', 'Squad Category'],
    leaderId: ['Squad Leader', 'Leader Employee ID', 'Leader Position ID'],
    members: ['Members', 'Member List'],
    objective: ['Objective', 'Focus', 'Purpose'],
    active: ['Active', 'Is Active?'],
    created: ['Created Date', 'Start Date', 'Started'],
    notes: ['Notes', 'Description']
  };
  const SM_COL = {
    squadId: ['Squad ID', 'SquadID', 'Squad'],
    empId: ['Employee ID', 'EmployeeID', 'Position ID'],
    empName: ['Employee Name', 'Name', 'Display Name'],
    active: ['Active', 'Is Active?'],
    role: ['Role']
  };

  const CATS = ['All', 'CI', 'Quality', 'Safety', 'Training', 'Other'];
  const CAT_CLASS = {
    CI: 'cat-ci',
    Quality: 'cat-quality',
    Safety: 'cat-safety',
    Training: 'cat-training',
    Other: 'cat-other'
  };

  const pick = (r, list, d = '') => {
    for (const k of list) if (r[k] != null && r[k] !== '') return r[k];
    return d;
  };
  const dash = v => (v == null || String(v).trim() === '' ? '-' : String(v));
  const isTrue = v => v === true || /^(true|yes|y|checked|1)$/i.test(String(v ?? '').trim());

  const MEMBERS_BY_SQUAD = new Map();
  const LEADERS_BY_SQUAD = new Map();
  let ALL = [];
  let idToName = new Map();

  function normCategory(v) {
    const t = String(v || '').toLowerCase();
    if (/^ci|improve/.test(t)) return 'CI';
    if (/^quality/.test(t)) return 'Quality';
    if (/^safety/.test(t)) return 'Safety';
    if (/^training/.test(t)) return 'Training';
    return 'Other';
  }

  // =======================
  // UI rendering functions
  // =======================
  function renderCategoryPills(activeCat) {
    const wrap = document.getElementById('cat-pills');
    if (!wrap) return;
    wrap.innerHTML = CATS.map(cat => {
      const style = `--cat:${getCatVar(cat)};`;
      return `<button class="pill-cat${cat === activeCat ? ' active' : ''}" data-cat="${cat}" style="${style}"><span class="dot"></span>${cat}</button>`;
    }).join('');
  }

  function getCatVar(cat) {
    switch (cat) {
      case 'CI': return 'var(--sq-ci)';
      case 'Quality': return 'var(--sq-quality)';
      case 'Safety': return 'var(--sq-safety)';
      case 'Training': return 'var(--sq-training)';
      case 'Other': return 'var(--sq-other)';
      default: return 'var(--accent)';
    }
  }

  function renderCards(list) {
    const cards = document.getElementById('cards');
    const msg = document.getElementById('s-msg');
    if (!cards) return;
    cards.innerHTML = '';
    if (!list.length) {
      msg.style.display = 'block';
      msg.innerHTML = `No squads match your filters.<br/>Try clearing search or showing inactive.`;
      return;
    }
    msg.style.display = 'none';
    cards.innerHTML = list.map(sq => {
      const status = isTrue(sq.active)
        ? `<span class="status-pill status-on">Active</span>`
        : `<span class="status-pill status-off">Inactive</span>`;

      const leaders = LEADERS_BY_SQUAD.get(String(sq.id || '').trim());
      let leaderLine = dash(sq.leaderName || sq.leaderId);
      if (leaders && leaders.length) leaderLine = leaders.map(x => x.name).filter(Boolean).join(', ');

      const memberCount = MEMBERS_BY_SQUAD.get(String(sq.id || '').trim());
      const mCount = memberCount ? memberCount.ids.size : 0;
      const memberChip = `<span class="member-chip">👥 ${mCount} member${mCount === 1 ? '' : 's'}</span>`;

      const detailsHref = sq.id
        ? `squad-details.html?id=${encodeURIComponent(sq.id)}`
        : `squad-details.html?name=${encodeURIComponent(sq.name)}`;
      const catCls = CAT_CLASS[sq.category] || CAT_CLASS.Other;

      return `
        <div class="squad-card ${catCls}">
          <h4>${dash(sq.name)}</h4>
          <div class="squad-meta"><b>Leader(s):</b> ${leaderLine}</div>
          <div class="squad-meta"><b>Status:</b> ${status}</div>
          <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
          <div class="squad-foot">
            ${memberChip}
            <a class="squad-link" href="${detailsHref}">View Details →</a>
          </div>
        </div>`;
    }).join('');
  }

  function showToast(msg, type = 'info') {
    const existing = document.querySelector('.pu-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `pu-toast ${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => toast.classList.remove('show'), 3500);
    setTimeout(() => toast.remove(), 4000);
  }

  // =======================
  // Data loading
  // =======================
  async function load() {
    const emRows = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    idToName = new Map();
    emRows.forEach(r => {
      const id = pick(r, EMP_COL.id, '').toString().trim();
      const name = pick(r, EMP_COL.name, '').toString().trim();
      if (id) idToName.set(id, name);
    });

    MEMBERS_BY_SQUAD.clear();
    LEADERS_BY_SQUAD.clear();

    const smRows = await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
    smRows.forEach(r => {
      if (!isTrue(pick(r, SM_COL.active, 'true'))) return;
      const sid = pick(r, SM_COL.squadId, '').trim();
      if (!sid) return;
      const eid = pick(r, SM_COL.empId, '').trim();
      const enm = (pick(r, SM_COL.empName, '') || idToName.get(eid) || '').toString().trim();
      const role = String(r['Role'] || '').toLowerCase();
      let entry = MEMBERS_BY_SQUAD.get(sid);
      if (!entry) entry = { ids: new Set(), names: new Set() }, MEMBERS_BY_SQUAD.set(sid, entry);
      if (eid) entry.ids.add(eid.toLowerCase());
      if (enm) entry.names.add(enm.toLowerCase());
      if (role === 'leader') {
        const arr = LEADERS_BY_SQUAD.get(sid) || [];
        arr.push({ id: eid, name: enm });
        LEADERS_BY_SQUAD.set(sid, arr);
      }
    });

    const rows = await getRowsByTitle(SHEETS.SQUADS);
    ALL = rows.map(r => ({
      id: pick(r, SQUAD_COL.id, ''),
      name: pick(r, SQUAD_COL.name, ''),
      category: normCategory(pick(r, SQUAD_COL.category, 'Other')),
      leaderId: pick(r, SQUAD_COL.leaderId, ''),
      leaderName: idToName.get(pick(r, SQUAD_COL.leaderId, '')) || '',
      members: pick(r, SQUAD_COL.members, ''),
      objective: pick(r, SQUAD_COL.objective, ''),
      active: pick(r, SQUAD_COL.active, ''),
      created: pick(r, SQUAD_COL.created, ''),
      notes: pick(r, SQUAD_COL.notes, '')
    }));
  }

  // =======================
  // Filters
  // =======================
  let activeCategory = 'All';
  let activeOnly = false;
  let mySquadsOnly = false;

  function applyFilters() {
    const searchBox = document.getElementById('search');
    const q = (searchBox?.value || '').trim().toLowerCase();

    let list = [...ALL];
    if (activeCategory !== 'All') list = list.filter(x => x.category === activeCategory);
    if (activeOnly) list = list.filter(x => isTrue(x.active));
    if (mySquadsOnly) {
      const sessionUser = P.session.current || P.session.getUser?.() || P.session.get?.() || {};
      const myId = (sessionUser.employeeId || '').toLowerCase();
      const myName = (sessionUser.displayName || '').toLowerCase();
      list = list.filter(x => {
        const sid = String(x.id || '');
        const entry = MEMBERS_BY_SQUAD.get(sid);
        if (!entry) return false;
        return entry.ids.has(myId) || entry.names.has(myName);
      });
    }
    if (q) list = list.filter(x => [x.name, x.leaderName, x.objective, x.notes].join(' ').toLowerCase().includes(q));
    renderCards(list);
  }

  function bindFilters() {
    const catWrap = document.getElementById('cat-pills');
    const activeToggle = document.getElementById('activeOnly');
    const myToggle = document.getElementById('myOnly');
    const searchBox = document.getElementById('search');
    if (catWrap) catWrap.addEventListener('click', e => {
      const btn = e.target.closest('button[data-cat]');
      if (!btn) return;
      activeCategory = btn.dataset.cat;
      renderCategoryPills(activeCategory);
      applyFilters();
    });
    if (activeToggle) activeToggle.addEventListener('change', e => { activeOnly = e.target.checked; applyFilters(); });
    if (myToggle) myToggle.addEventListener('change', e => { mySquadsOnly = e.target.checked; applyFilters(); });
    if (searchBox) searchBox.addEventListener('input', applyFilters);
  }

  // =======================
  // Manage Table Renderer
  // =======================
  async function renderManageTable() {
    const cardsContainer = document.getElementById('cards');
    const msg = document.getElementById('s-msg');
    if (msg) msg.style.display = 'none';
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="spinner"></div>`;
    cardsContainer.innerHTML = '';
    cardsContainer.appendChild(overlay);

    const [squads, members, employees] = await Promise.all([
      P.api.getRowsByTitle('SQUADS', { force: true }),
      P.api.getRowsByTitle('SQUAD_MEMBERS', { force: true }),
      P.getEmployees()
    ]);
    overlay.remove();

    const allEmps = employees.map(e => ({
      id: e['Employee ID'] || e['Position ID'],
      name: e['Employee Name'] || e['Display Name']
    }));

    const table = document.createElement('table');
    table.className = 'manage-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:10%">ID</th>
          <th style="width:18%">Squad Name</th>
          <th style="width:12%">Category</th>
          <th style="width:7%">Active</th>
          <th style="width:20%">Objective</th>
          <th style="width:18%">Leaders</th>
          <th style="width:10%">Created By</th>
          <th style="width:10%">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${squads.map(r => {
          const sid = r.id || '';
          const leaders = members.filter(m => m['Squad ID'] === sid && m['Role'] === 'Leader').map(x => x['Employee Name']);
          return `
          <tr data-rowid="${sid}">
            <td>${dash(sid)}</td>
            <td contenteditable class="editable name">${dash(r['Squad Name'])}</td>
            <td contenteditable class="editable category">${dash(r['Category'])}</td>
            <td><input type="checkbox" class="active" ${isTrue(r['Active']) ? 'checked' : ''}></td>
            <td contenteditable class="editable objective">${dash(r['Objective'])}</td>
            <td><select multiple class="leader-select">${allEmps.map(emp => `<option value="${emp.name}" ${leaders.includes(emp.name) ? 'selected' : ''}>${emp.name}</option>`).join('')}</select></td>
            <td contenteditable class="editable created-by">${dash(r['Created By'])}</td>
            <td class="actions-cell"><button class="btn-save">Save</button><button class="btn-cancel">Cancel</button></td>
          </tr>`;
        }).join('')}
      </tbody>`;
    cardsContainer.innerHTML = '';
    cardsContainer.appendChild(table);

    table.addEventListener('click', async e => {
      const tr = e.target.closest('tr[data-rowid]');
      if (!tr) return;
      if (e.target.classList.contains('btn-save')) {
        tr.style.background = 'rgba(51,255,153,0.08)';
        showToast('Changes saved (simulation)', 'success');
        setTimeout(() => tr.style.background = '', 800);
      }
      if (e.target.classList.contains('btn-cancel')) {
        tr.style.background = 'rgba(255,255,0,0.08)';
        setTimeout(() => tr.style.background = '', 800);
      }
    });
  }

  // =======================
  // Init
  // =======================
  document.addEventListener('DOMContentLoaded', async () => {
    P.session.requireLogin();
    P.layout.injectLayout();
    P.layout.setPageTitle('Squads');
    await P.session.initHeader();
    renderCategoryPills('All');
    await load();
    bindFilters();
    renderCards(ALL);

    const btnManage = document.getElementById('btn-manage');
    const btnAdd = document.getElementById('btn-add-squad');
    if (btnAdd) btnAdd.addEventListener('click', () => PowerUp.squadAddForm?.open?.());
    if (btnManage) {
      btnManage.addEventListener('click', async () => {
        const isManage = btnManage.dataset.mode === 'manage';
        if (isManage) {
          btnManage.textContent = 'Manage Squads';
          btnManage.dataset.mode = 'view';
          document.getElementById('s-msg').style.display = 'none';
          renderCards(ALL);
        } else {
          btnManage.textContent = 'View Cards';
          btnManage.dataset.mode = 'manage';
          await renderManageTable();
        }
      });
    }
  });

  // =======================
  // Styles
  // =======================
  const style = document.createElement('style');
  style.textContent = `
  #cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; padding: 12px; }
  .squad-card { background:#0f1a1a; border-left:5px solid var(--accent); border-radius:10px; padding:14px 18px; box-shadow:0 1px 4px rgba(0,0,0,0.4); transition:all 0.15s ease; }
  .squad-card:hover { transform:translateY(-2px); box-shadow:0 4px 10px rgba(0,0,0,0.6); }
  .squad-foot { display:flex; justify-content:space-between; align-items:center; margin-top:10px; }
  .member-chip { font-size:0.85rem; color:#9ff; opacity:0.85; }
  .squad-link { color:#33ff99; text-decoration:none; font-weight:500; }
  .squad-link:hover { text-decoration:underline; }
  .manage-table { width:100%; border-collapse:collapse; font-size:0.9rem; }
  .manage-table th, .manage-table td { padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.07); text-align:left; }
  .manage-table th { background:#0f1a1a; position:sticky; top:0; z-index:2; }
  .manage-table tr:nth-child(even) { background:rgba(255,255,255,0.02); }
  .actions-cell { display:flex; gap:6px; justify-content:center; }
  .btn-save, .btn-cancel { padding:4px 12px; border-radius:6px; font-size:0.85rem; cursor:pointer; }
  .btn-save { border:1px solid #33ff99; color:#33ff99; background:transparent; }
  .btn-save:hover { background:rgba(51,255,153,0.1); }
  .btn-cancel { border:1px solid #ff5050; color:#ff8080; background:transparent; }
  .btn-cancel:hover { background:rgba(255,80,80,0.1); }
  .leader-select { width:200px; height:110px; background:#0d1717; color:#bdf; border:1px solid #1e2a2a; border-radius:6px; }
  .overlay { display:flex; align-items:center; justify-content:center; height:180px; }
  .spinner { width:40px; height:40px; border:4px solid #33ff99; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .pu-toast { position:fixed; bottom:20px; right:20px; background:#0f1a1a; color:#9ff; border:1px solid #33ff99; padding:10px 16px; border-radius:8px; opacity:0; transition:opacity 0.4s; z-index:9999; }
  .pu-toast.show { opacity:1; }
  `;
  document.head.appendChild(style);
})(window.PowerUp);
