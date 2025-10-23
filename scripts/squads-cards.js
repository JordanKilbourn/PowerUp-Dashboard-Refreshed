// =============================================
// PowerUp: Squads Page - Stable Recovery Build 3
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
  const dash = (v) => (v == null || String(v).trim() === '' ? '-' : String(v));
  const isTrue = (v) => v === true || /^(true|yes|y|checked|1)$/i.test(String(v ?? '').trim());

  const MEMBERS_BY_SQUAD = new Map();
  const LEADERS_BY_SQUAD = new Map();
  let ALL = [];
  let idToName = new Map();
  let IS_ADMIN = false;

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
      return `
        <button class="pill-cat${cat === activeCat ? ' active' : ''}" data-cat="${cat}" style="${style}">
          <span class="dot"></span>${cat}
        </button>`;
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
    if (!list.length) {
      cards.innerHTML = '';
      msg.style.display = 'block';
      msg.innerHTML = `No squads match your filters.<br/>Try clearing search or showing inactive.`;
      return;
    }
    msg.style.display = 'none';
    cards.style.opacity = '0';
    cards.innerHTML = list.map(sq => {
      const status = isTrue(sq.active)
        ? `<span class="status-pill status-on">Active</span>`
        : `<span class="status-pill status-off">Inactive</span>`;
      const leaders = LEADERS_BY_SQUAD.get(String(sq.id || '').trim());
      let leaderLine = dash(sq.leaderName || sq.leaderId);
      if (leaders && leaders.length) {
        const names = leaders.map(x => x.name).filter(Boolean);
        leaderLine = names.join(', ');
      }
      const detailsHref = sq.id
        ? `squad-details.html?id=${encodeURIComponent(sq.id)}`
        : `squad-details.html?name=${encodeURIComponent(sq.name)}`;
      const catCls = CAT_CLASS[sq.category] || CAT_CLASS.Other;
      return `
        <div class="squad-card card ${catCls}">
          <h4>${dash(sq.name)}</h4>
          <div class="squad-meta"><b>Leader(s):</b> ${leaderLine}</div>
          <div class="squad-meta"><b>Status:</b> ${status}</div>
          <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
          <div class="squad-foot"><a class="squad-link" href="${detailsHref}">View Details →</a></div>
        </div>`;
    }).join('');
    setTimeout(() => (cards.style.opacity = '1'), 200);
  }

  // =======================
  // Toast Notification
  // =======================
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
      if (!entry) {
        entry = { ids: new Set(), names: new Set() };
        MEMBERS_BY_SQUAD.set(sid, entry);
      }
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
  // Manage Table Renderer
  // =======================
  async function renderManageTable() {
    const cardsContainer = document.getElementById('cards');
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
    table.className = 'manage-table fade-in';
    table.innerHTML = `
      <thead>
        <tr>
          <th>ID</th>
          <th>Squad Name</th>
          <th>Category</th>
          <th>Active</th>
          <th>Objective</th>
          <th>Leaders</th>
          <th>Created By</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${squads.map(r => {
          const sid = r.id || '';
          const leaders = members.filter(m => m['Squad ID'] === sid && m['Role'] === 'Leader').map(x => x['Employee Name']);
          return `
          <tr data-rowid="${sid}">
            <td>${sid}</td>
            <td contenteditable class="editable name">${dash(r['Squad Name'])}</td>
            <td contenteditable class="editable category">${dash(r['Category'])}</td>
            <td><input type="checkbox" class="active" ${isTrue(r['Active']) ? 'checked' : ''}></td>
            <td contenteditable class="editable objective">${dash(r['Objective'])}</td>
            <td>
              <select multiple class="leader-select">
                ${allEmps.map(emp => `
                  <option value="${emp.name}" ${leaders.includes(emp.name) ? 'selected' : ''}>${emp.name}</option>`).join('')}
              </select>
            </td>
            <td contenteditable class="editable created-by">${dash(r['Created By'])}</td>
            <td class="actions-cell">
              <button class="btn-save">Save</button>
              <button class="btn-cancel">Cancel</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>`;
    cardsContainer.appendChild(table);
  }

  // =======================
  // Event Wiring
  // =======================
  document.addEventListener('DOMContentLoaded', async () => {
    P.session.requireLogin();
    P.layout.injectLayout();
    IS_ADMIN = !!(P.auth && P.auth.isAdmin && P.auth.isAdmin());
    P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');
    await P.session.initHeader();
    renderCategoryPills('All');
    await load();
    renderCards(ALL);

    const btnManage = document.getElementById('btn-manage');
    const btnAdd = document.getElementById('btn-add-squad');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        if (PowerUp.squadAddForm && PowerUp.squadAddForm.open) PowerUp.squadAddForm.open();
      });
    }
    if (btnManage) {
      btnManage.addEventListener('click', async () => {
        btnManage.textContent = 'View Cards';
        btnManage.id = 'btn-view-cards';
        await renderManageTable();
      });
    }
  });

  // =======================
  // Inline Styling
  // =======================
  const style = document.createElement('style');
  style.textContent = `
    .fade-in { animation: fadeIn 0.25s ease-in; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .manage-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9rem; }
    .manage-table th, .manage-table td { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
    .manage-table th { background: #0f1a1a; position: sticky; top: 0; z-index: 10; text-align: left; }
    .manage-table tbody tr:nth-child(even) { background: rgba(255,255,255,0.03); }
    .manage-table tbody tr:hover { background: rgba(0,255,153,0.05); }

    .actions-cell { display: flex; gap: 8px; justify-content: center; }
    .btn-save, .btn-cancel {
      padding: 4px 12px;
      border: 1px solid #33ff99;
      background: transparent;
      color: #33ff99;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
    }
    .btn-save:hover { background: rgba(51,255,153,0.1); }
    .btn-cancel { border-color: #ff5050; color: #ff8080; }
    .btn-cancel:hover { background: rgba(255,80,80,0.1); }

    .leader-select { width: 180px; height: 130px; background: #0d1717; color: #bdf; border: 1px solid #2a3d3d; border-radius: 6px; }

    .overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
      z-index: 100;
    }
    .spinner {
      width: 40px; height: 40px;
      border: 4px solid #33ff99;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .pu-toast {
      position: fixed; bottom: 20px; left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.9);
      color: white; padding: 10px 20px;
      border-radius: 8px;
      opacity: 0; transition: opacity 0.3s ease;
      z-index: 10000;
    }
    .pu-toast.show { opacity: 1; }
    .pu-toast.success { border-left: 5px solid #33ff99; }
    .pu-toast.warn { border-left: 5px solid #ffb84d; }
    .pu-toast.error { border-left: 5px solid #ff5050; }
  `;
  document.head.appendChild(style);
})(window.PowerUp);
