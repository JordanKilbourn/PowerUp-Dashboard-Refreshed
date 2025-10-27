// =============================================
// PowerUp: Squads Page - Stable Recovery Build 4
// =============================================

(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle, updateRowById } = P.api;

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
    notes: ['Notes', 'Description'],
    createdBy: ['Created By']
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
  let activeCategory = 'All';
  let showMySquads = false;
  let activeOnly = true;

  // =======================
  // Helpers
  // =======================
  function normCategory(v) {
    const t = String(v || '').toLowerCase();
    if (/^ci|improve/.test(t)) return 'CI';
    if (/^quality/.test(t)) return 'Quality';
    if (/^safety/.test(t)) return 'Safety';
    if (/^training/.test(t)) return 'Training';
    return 'Other';
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

  // =======================
  // Toasts and UX
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
      notes: pick(r, SQUAD_COL.notes, ''),
      createdBy: pick(r, SQUAD_COL.createdBy, '')
    }));
  }

  // =======================
  // Cards Renderer
  // =======================
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
  // Manage Table
  // =======================
  async function renderManageTable() {
    const cardsContainer = document.getElementById('cards');
    cardsContainer.innerHTML = `<div class="overlay"><div class="spinner"></div></div>`;

    const [squads, members, employees] = await Promise.all([
      P.api.getRowsByTitle('SQUADS', { force: true }),
      P.api.getRowsByTitle('SQUAD_MEMBERS', { force: true }),
      P.getEmployees()
    ]);

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
          const sid = r['Squad ID'] || '';
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
                ${allEmps.map(emp => `<option value="${emp.name}" ${leaders.includes(emp.name) ? 'selected' : ''}>${emp.name}</option>`).join('')}
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
    cardsContainer.innerHTML = '';
    cardsContainer.appendChild(table);

    bindSaveCancel();
  }

  function bindSaveCancel() {
    document.querySelectorAll('.btn-save').forEach(btn => {
      btn.addEventListener('click', async e => {
        const row = e.target.closest('tr');
        await saveRow(row);
      });
    });
    document.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', e => {
        const row = e.target.closest('tr');
        cancelRow(row);
      });
    });
  }

  async function saveRow(row) {
    const sid = row.dataset.rowid;
    const data = {
      'Squad Name': row.querySelector('.name').textContent.trim(),
      'Category': row.querySelector('.category').textContent.trim(),
      'Objective': row.querySelector('.objective').textContent.trim(),
      'Active': row.querySelector('.active').checked ? 'Yes' : 'No',
      'Created By': row.querySelector('.created-by').textContent.trim()
    };
    try {
      await updateRowById(SHEETS.SQUADS, sid, data);
      row.classList.add('flash-success');
      showToast('Squad updated successfully!', 'success');
      setTimeout(() => row.classList.remove('flash-success'), 800);
    } catch (err) {
      showToast('Error updating squad: ' + err.message, 'error');
    }
  }

  function cancelRow(row) {
    row.classList.add('flash-cancel');
    setTimeout(() => row.classList.remove('flash-cancel'), 600);
    showToast('Changes canceled.', 'warn');
  }

  // =======================
  // Filters and Toggle
  // =======================
  function bindFilters() {
    const catWrap = document.getElementById('cat-pills');
    if (catWrap) {
      catWrap.addEventListener('click', e => {
        const btn = e.target.closest('button[data-cat]');
        if (!btn) return;
        activeCategory = btn.dataset.cat;
        renderCategoryPills(activeCategory);
        applyFilters();
      });
    }

    const chkMySquads = document.getElementById('chk-my-squads');
    const chkActiveOnly = document.getElementById('chk-active-only');
    if (chkMySquads) chkMySquads.addEventListener('change', () => { showMySquads = chkMySquads.checked; applyFilters(); });
    if (chkActiveOnly) chkActiveOnly.addEventListener('change', () => { activeOnly = chkActiveOnly.checked; applyFilters(); });
  }

  function applyFilters() {
    let list = [...ALL];
    if (activeCategory !== 'All') list = list.filter(x => x.category === activeCategory);
    if (activeOnly) list = list.filter(x => isTrue(x.active));
        if (mySquadsOnly) {
      const myId = P.session?.getUser()?.employeeId || '';
      if (myId) {
        list = list.filter(x => {
          const members = MEMBERS_BY_SQUAD.get(String(x.id))?.ids || new Set();
          return members.has(myId.toLowerCase());
        });
      }
    }
    renderCards(list);
  }

  function bindFilters() {
    const catWrap = document.getElementById('cat-pills');
    const activeToggle = document.getElementById('filter-active');
    const myToggle = document.getElementById('filter-mine');

    if (catWrap) {
      catWrap.addEventListener('click', e => {
        const btn = e.target.closest('button[data-cat]');
        if (!btn) return;
        activeCategory = btn.dataset.cat;
        renderCategoryPills(activeCategory);
        applyFilters();
      });
    }

    if (activeToggle) {
      activeToggle.addEventListener('change', e => {
        activeOnly = e.target.checked;
        applyFilters();
      });
    }

    if (myToggle) {
      myToggle.addEventListener('change', e => {
        mySquadsOnly = e.target.checked;
        applyFilters();
      });
    }
  }

  async function saveSquadChanges(rowEl) {
    const sid = rowEl.dataset.rowid;
    if (!sid) return showToast('Missing Squad ID.', 'error');

    const payload = {};
    const name = rowEl.querySelector('.name').textContent.trim();
    const cat = rowEl.querySelector('.category').textContent.trim();
    const objective = rowEl.querySelector('.objective').textContent.trim();
    const createdBy = rowEl.querySelector('.created-by').textContent.trim();
    const active = rowEl.querySelector('.active').checked;
    const leadersSel = [...rowEl.querySelector('.leader-select').selectedOptions].map(o => o.textContent);

    payload['Squad Name'] = name;
    payload['Category'] = cat;
    payload['Objective'] = objective;
    payload['Created By'] = createdBy;
    payload['Active'] = active ? 'Yes' : 'No';
    payload['Leader'] = leadersSel.join(', ');

    rowEl.classList.add('saving');

    try {
      await P.api.updateRowById(P.api.SHEETS.SQUADS, sid, payload);
      rowEl.classList.remove('saving');
      rowEl.classList.add('saved');
      showToast(`Squad ${sid} saved successfully.`, 'success');
      setTimeout(() => rowEl.classList.remove('saved'), 800);
    } catch (err) {
      console.error(err);
      rowEl.classList.remove('saving');
      showToast(`Error saving ${sid}: ${err.message}`, 'error');
    }
  }

  function cancelSquadChanges(rowEl) {
    const original = JSON.parse(rowEl.dataset.original || '{}');
    if (!original) return;
    rowEl.querySelector('.name').textContent = dash(original.name);
    rowEl.querySelector('.category').textContent = dash(original.category);
    rowEl.querySelector('.objective').textContent = dash(original.objective);
    rowEl.querySelector('.created-by').textContent = dash(original.createdBy);
    rowEl.querySelector('.active').checked = isTrue(original.active);

    const leadersSel = rowEl.querySelector('.leader-select');
    [...leadersSel.options].forEach(opt => {
      opt.selected = (original.leaders || []).includes(opt.textContent);
    });

    rowEl.classList.add('flash');
    showToast(`Changes for ${original.id} reverted.`, 'info');
    setTimeout(() => rowEl.classList.remove('flash'), 800);
  }

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
          const sid = r['Squad ID'] || '';
          const leaders = members
            .filter(m => m['Squad ID'] === sid && m['Role'] === 'Leader')
            .map(x => x['Employee Name'] || x['Display Name']);
          const obj = {
            id: sid,
            name: r['Squad Name'],
            category: r['Category'],
            objective: r['Objective'],
            createdBy: r['Created By'],
            active: r['Active'],
            leaders
          };
          return `
          <tr data-rowid="${sid}" data-original='${JSON.stringify(obj)}'>
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

    // bind save/cancel buttons
    table.querySelectorAll('.btn-save').forEach(btn => {
      btn.addEventListener('click', e => {
        const row = e.target.closest('tr');
        saveSquadChanges(row);
      });
    });

    table.querySelectorAll('.btn-cancel').forEach(btn => {
      btn.addEventListener('click', e => {
        const row = e.target.closest('tr');
        cancelSquadChanges(row);
      });
    });
  }

  // ============================
  // Toggle & Initialization
  // ============================
  let activeCategory = 'All';
  let activeOnly = true;
  let mySquadsOnly = false;

  document.addEventListener('DOMContentLoaded', async () => {
    P.session.requireLogin();
    P.layout.injectLayout();
    IS_ADMIN = !!(P.auth && P.auth.isAdmin && P.auth.isAdmin());
    P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');
    await P.session.initHeader();
    renderCategoryPills('All');
    await load();
    renderCards(ALL);
    bindFilters();

    const btnManage = document.getElementById('btn-manage');
    const btnAdd = document.getElementById('btn-add-squad');

    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        if (PowerUp.squadAddForm && PowerUp.squadAddForm.open) PowerUp.squadAddForm.open();
      });
    }

    if (btnManage) {
      btnManage.addEventListener('click', async () => {
        const current = btnManage.textContent.includes('Manage');
        if (current) {
          btnManage.textContent = 'View Cards';
          await renderManageTable();
        } else {
          btnManage.textContent = 'Manage Squads';
          renderCards(ALL);
          bindFilters();
        }
      });
    }
  });

  // ============================
  // Extra Styling
  // ============================
  const style = document.createElement('style');
  style.textContent = `
    .manage-table td, .manage-table th { min-width: 100px; }
    .manage-table td.name { min-width: 180px; }
    .manage-table td.category { min-width: 120px; }
    .manage-table td.objective { min-width: 220px; }

    tr.flash { animation: flashRow 0.6s ease-in-out; }
    @keyframes flashRow {
      from { background-color: rgba(51,255,153,0.3); }
      to { background-color: transparent; }
    }
    tr.saving { opacity: 0.6; }
    tr.saved { background-color: rgba(51,255,153,0.15); }
  `;
  document.head.appendChild(style);

})(window.PowerUp);

   
