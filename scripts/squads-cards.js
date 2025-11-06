// =============================================
// PowerUp: Squads Page – Stable Hybrid Version (Full Corrected Build)
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

  const pick = (r, list, d = '') => { for (const k of list) if (r[k] != null && r[k] !== '') return r[k]; return d; };
  const dash = v => (v == null || String(v).trim() === '' ? '-' : String(v));
  const isTrue = v => v === true || /^(true|yes|y|checked|1)$/i.test(String(v ?? '').trim());

  // ==== Category helpers ====
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

  // ==== Core Data ====
  const MEMBERS_BY_SQUAD = new Map();
  const LEADERS_BY_SQUAD = new Map();
  let ALL = [];
  let idToName = new Map();
  let IS_ADMIN = false;
  let activeCategory = 'All';
  let activeOnly = false;

  // ==== UI Rendering helpers ====
  function renderCategoryPills(activeCat) {
    const wrap = document.getElementById('cat-pills');
    if (!wrap) return;
    wrap.innerHTML = CATS.map(cat => {
      const style = `--cat:${getCatVar(cat)};`;
      return `<button class="pill-cat${cat === activeCat ? ' active' : ''}" data-cat="${cat}" style="${style}">
                <span class="dot"></span>${cat}
              </button>`;
    }).join('');
  }

  // ==== Toast Helper ====
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
  // Data Loading
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
  // Helper for determining membership
  // =======================
  function userIsMemberOrLeader(squad, session) {
    const myId = String(session.employeeId || session.positionId || '').trim().toLowerCase();
    const myName = String(session.displayName || session.name || '').trim().toLowerCase();

    if (myId && String(squad.leaderId || '').trim().toLowerCase() === myId) return true;

    const sid = String(squad.id || '').trim();
    const entry = MEMBERS_BY_SQUAD.get(sid);
    if (entry) {
      if (myId && entry.ids.has(myId)) return true;
      if (myName && entry.names.has(myName)) return true;
    } else if (squad.members) {
      const tokens = String(squad.members).split(/[,;\n]+/).map(t => t.trim().toLowerCase());
      if (myId && tokens.includes(myId)) return true;
      if (myName && tokens.includes(myName)) return true;
    }
    return false;
  }

  // =======================
  // Admin Filter Resolver
  // =======================
  async function getAdminTargetFromFilter() {
    try {
      const sel = (sessionStorage.getItem('pu.adminEmployeeFilter') || '').trim();
      if (!sel || sel === '__ALL__' || sel.toLowerCase() === 'all employees') return null;

      if (!idToName.size) {
        const em = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
        em.forEach(r => {
          const id = String(r['Position ID'] || r['Employee ID'] || '').trim();
          const nm = String(r['Display Name'] || r['Employee Name'] || r['Name'] || '').trim();
          if (id) idToName.set(id, nm);
        });
      }

      const norm = s => String(s || '').trim().toLowerCase();
      let targetId = '';
      for (const [id, nm] of idToName.entries()) {
        if (norm(nm) === norm(sel)) { targetId = id; break; }
      }
      return { id: targetId, name: sel };
    } catch {
      return null;
    }
  }

  // =======================
  // Card Renderer
  // =======================
  function renderCards(list) {
    const cards = document.getElementById('cards');
    const msg = document.getElementById('s-msg');
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

      let leaderLine = dash(sq.leaderName || sq.leaderId);
      const leaders = LEADERS_BY_SQUAD.get(String(sq.id || '').trim());
      if (leaders && leaders.length) {
        const names = leaders.map(x => (x.name || idToName.get(x.id) || x.id || '').toString().trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        leaderLine = names.join(', ');
      }

      const detailsHref = sq.id
        ? `squad-details.html?id=${encodeURIComponent(sq.id)}`
        : `squad-details.html?name=${encodeURIComponent(sq.name)}`;
      const catCls = CAT_CLASS[sq.category] || CAT_CLASS.Other;

      return `<div class="squad-card ${catCls}">
                <h4>${dash(sq.name)}</h4>
                <div class="squad-meta"><b>Leader(s):</b> ${leaderLine}</div>
                <div class="squad-meta"><b>Status:</b> ${status}</div>
                <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
                <div class="squad-foot">
                  <span class="member-chip">${(MEMBERS_BY_SQUAD.get(sq.id)?.ids.size || 0)} Members</span>
                  <a class="squad-link" href="${detailsHref}">View Details →</a>
                </div>
              </div>`;
    }).join('');
  }

  // =======================
  // applyFilters (restored logic)
  // =======================
  async function applyFilters() {
    const session = P.session.get?.() || {};
    const cat = document.querySelector('.pill-cat.active')?.dataset.cat || activeCategory || 'All';
    const myOnly = document.getElementById('myOnly')?.checked;
    const activeOnly = document.getElementById('activeOnly')?.checked;
    const q = (document.getElementById('search')?.value || '').trim().toLowerCase();

    let list = [...ALL];
    const isAdmin = P.auth?.isAdmin?.() || false;

    if (myOnly) {
      if (isAdmin) {
        let target = await getAdminTargetFromFilter();
        if (!target) target = { id: String(session.employeeId || ''), name: String(session.displayName || '') };

        const norm = s => String(s || '').trim().toLowerCase();
        const tgtId = norm(target.id);
        const tgtName = norm(target.name);

        list = list.filter(s => {
          const leaders = LEADERS_BY_SQUAD.get(String(s.id || '').trim()) || [];
          const leaderHit = leaders.some(x => norm(x.id) === tgtId || norm(x.name) === tgtName);
          const m = MEMBERS_BY_SQUAD.get(String(s.id || '').trim());
          const memberHit = m ? (m.ids.has(tgtId) || m.names.has(tgtName)) : false;
          return leaderHit || memberHit;
        });
      } else {
        list = list.filter(s => userIsMemberOrLeader(s, session));
      }
    }

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
  // =============================================
  // Manage Table Rendering (Stable + Scroll Safe)
  // =============================================
  async function renderManageTable() {
    const cardsContainer = document.getElementById('cards');
    const msg = document.getElementById('s-msg');
    if (msg) msg.style.display = 'none';

    cardsContainer.classList.remove('cards-grid');
    cardsContainer.classList.add('manage-view');
    cardsContainer.style.display = 'block';
    cardsContainer.innerHTML = '';

    try {
      const [squadSheet, members] = await Promise.all([
        P.api.fetchSheet(SHEETS.SQUADS, { force: true }),
        P.api.getRowsByTitle(SHEETS.SQUAD_MEMBERS, { force: true })
      ]);

      const squads = P.api.rowsByTitle(squadSheet).map((r, i) => ({
        ...r,
        __rowId: squadSheet.rows[i]?.id || ''
      }));

      const allEmps = await P.getEmployees();
      const leadersBySquad = new Map();

      members.forEach(r => {
        const active = /^(true|yes|y|1)$/i.test(String(r['Active'] || ''));
        if (!active) return;
        const sid = String(r['Squad ID'] || '').trim().toUpperCase();
        const role = String(r['Role'] || '').trim().toLowerCase();
        if (role === 'leader') {
          leadersBySquad.set(sid, {
            id: String(r['Employee ID'] || '').trim(),
            name: String(r['Employee Name'] || '').trim()
          });
        }
      });

      const table = document.createElement('table');
      table.className = 'manage-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th style="width:8%">ID</th>
            <th style="width:20%">Name</th>
            <th style="width:12%">Category</th>
            <th style="width:7%">Active</th>
            <th style="width:25%">Objective</th>
            <th style="width:18%">Leader</th>
            <th style="width:10%">Created By</th>
            <th style="width:10%">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${squads.map(r => {
            const sheetRowId = r.__rowId;
            const squadId = (r['Squad ID'] || '').trim().toUpperCase();
            const leader = leadersBySquad.get(squadId);
            const selectedName = leader ? leader.name : '';
            const rowData = {
              name: r['Squad Name'] || '',
              category: r['Category'] || '',
              active: isTrue(r['Active']),
              objective: r['Objective'] || '',
              createdBy: r['Created By'] || '',
              leader: selectedName
            };
            return `
              <tr data-rowid="${sheetRowId}" data-squadid="${squadId}"
                  data-original='${JSON.stringify(rowData)}'>
                <td>${squadId}</td>
                <td contenteditable class="editable name">${rowData.name}</td>
                <td contenteditable class="editable category">${rowData.category}</td>
                <td><input type="checkbox" class="active" ${rowData.active ? 'checked' : ''}></td>
                <td contenteditable class="editable objective">${rowData.objective}</td>
                <td>
                  <select class="leader-select-single">
                    <option value="">— Select Leader —</option>
                    ${allEmps.map(emp =>
                      `<option value="${emp.name}" ${emp.name === selectedName ? 'selected' : ''}>${emp.name}</option>`
                    ).join('')}
                  </select>
                </td>
                <td contenteditable class="editable created-by">${rowData.createdBy}</td>
                <td class="actions-cell">
                  <button class="btn-save">Save</button>
                  <button class="btn-cancel">Cancel</button>
                </td>
              </tr>`;
          }).join('')}
        </tbody>`;

      const wrapper = document.createElement('div');
      wrapper.className = 'manage-table-wrapper';
      wrapper.appendChild(table);
      cardsContainer.appendChild(wrapper);

      // ===== Save & Cancel handlers =====
      table.addEventListener('click', async e => {
        const tr = e.target.closest('tr[data-rowid]');
        if (!tr) return;
        const original = JSON.parse(tr.dataset.original || '{}');
        const rowId = tr.dataset.rowid;
        const squadId = tr.dataset.squadid;

        if (e.target.classList.contains('btn-save')) {
          const name = tr.querySelector('.name')?.textContent.trim();
          const category = tr.querySelector('.category')?.textContent.trim();
          const active = tr.querySelector('.active')?.checked;
          const objective = tr.querySelector('.objective')?.textContent.trim();
          const createdBy = tr.querySelector('.created-by')?.textContent.trim();
          const leaderName = tr.querySelector('.leader-select-single')?.value;
          const leaderEmp = allEmps.find(emp => emp.name === leaderName);

          const changed =
            name !== original.name ||
            category !== original.category ||
            active !== original.active ||
            objective !== original.objective ||
            createdBy !== original.createdBy ||
            (leaderEmp ? leaderEmp.name : leaderName) !== original.leader;

          if (!changed) {
            showToast('No changes detected — nothing to save.', 'info');
            return;
          }
          if (!leaderName) {
            showToast('Select a leader before saving.', 'warn');
            return;
          }

          try {
            document.querySelectorAll('.btn-save, .btn-cancel, .editable, .leader-select-single')
              .forEach(el => el.disabled = true);
            showLoadingOverlay('Saving squad changes...');

            await P.api.updateRowById(P.api.SHEETS.SQUADS, rowId, {
              'Squad Name': name,
              'Category': category,
              'Active': active,
              'Objective': objective,
              'Created By': createdBy
            });

            if (leaderEmp && squadId) {
              await P.api.updateOrReplaceLeader({
                squadId,
                newLeaderId: leaderEmp.id,
                newLeaderName: leaderEmp.name
              });
            }

            hideLoadingOverlay();
            document.querySelectorAll('.btn-save, .btn-cancel, .editable, .leader-select-single')
              .forEach(el => el.disabled = false);
            showToast('✅ Squad saved successfully.', 'success');
            await renderManageTable();
          } catch (err) {
            hideLoadingOverlay();
            document.querySelectorAll('.btn-save, .btn-cancel, .editable, .leader-select-single')
              .forEach(el => el.disabled = false);
            console.error('Save error:', err);
            showToast('Error saving squad. Check console.', 'error');
          }
        }

        if (e.target.classList.contains('btn-cancel')) {
          tr.querySelector('.name').textContent = original.name;
          tr.querySelector('.category').textContent = original.category;
          tr.querySelector('.active').checked = !!original.active;
          tr.querySelector('.objective').textContent = original.objective;
          tr.querySelector('.created-by').textContent = original.createdBy;
          const sel = tr.querySelector('.leader-select-single');
          if (sel) sel.value = original.leader || '';
          tr.style.backgroundColor = 'rgba(255,255,0,0.1)';
          setTimeout(() => (tr.style.backgroundColor = ''), 600);
        }
      });
    } catch (err) {
      console.error('Render Manage Table error:', err);
      showToast('⚠️ Failed to load manage view.', 'error');
    }
  }

  // Custom scrollbar & sticky header CSS injection
  const style = document.createElement('style');
  style.textContent = `
    .manage-table-wrapper {
      overflow-x: auto;
      max-height: calc(100vh - 300px);
      scrollbar-color: #00ff99 #0e1616;
      scrollbar-width: thin;
    }
    .manage-table th {
      position: sticky;
      top: 0;
      background: #121f20;
      color: #99ffcc;
      z-index: 2;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .manage-table::-webkit-scrollbar {
      height: 8px;
    }
    .manage-table::-webkit-scrollbar-thumb {
      background-color: #00ff99;
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);

    // =============================================
  // Filter Bindings & View Management
  // =============================================

  function bindFilters() {
    const catWrap = document.getElementById('cat-pills');
    const activeToggle = document.getElementById('activeOnly');
    const myToggle = document.getElementById('myOnly');
    const searchBox = document.getElementById('search');

    if (catWrap) {
      catWrap.addEventListener('click', e => {
        const btn = e.target.closest('button[data-cat]');
        if (!btn) return;
        activeCategory = btn.dataset.cat;
        renderCategoryPills(activeCategory);
        applyFilters();
      });
    }

    if (activeToggle)
      activeToggle.addEventListener('change', e => {
        activeOnly = e.target.checked;
        applyFilters();
      });

    if (myToggle)
      myToggle.addEventListener('change', () => applyFilters());

    if (searchBox)
      searchBox.addEventListener('input', applyFilters);

    // Admin filter reapply trigger
    document.addEventListener('powerup-admin-filter-change', async () => {
      if (!MEMBERS_BY_SQUAD.size || !LEADERS_BY_SQUAD.size) await load();
      applyFilters();
    });
  }

  // =============================================
  // Manage / Cards Toggle Logic
  // =============================================
  async function toggleManageView() {
    const btnManage = document.getElementById('btn-manage');
    const cardsContainer = document.getElementById('cards');
    const msg = document.getElementById('s-msg');

    if (!btnManage || !cardsContainer) return;

    const isManaging = btnManage.classList.toggle('managing');
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'view-switch-overlay';
    loadingOverlay.textContent = isManaging ? 'Loading Manage View...' : 'Loading Card View...';
    document.body.appendChild(loadingOverlay);

    setTimeout(() => loadingOverlay.classList.add('show'), 50);

    if (isManaging) {
      btnManage.textContent = 'View Cards';
      if (msg) msg.style.display = 'none';
      cardsContainer.classList.remove('cards-grid');
      cardsContainer.classList.add('manage-view');
      await renderManageTable();
    } else {
      btnManage.textContent = 'Manage Squads';
      cardsContainer.classList.remove('manage-view');
      cardsContainer.classList.add('cards-grid');
      cardsContainer.style.display = 'grid';
      await applyFilters();
    }

    setTimeout(() => {
      loadingOverlay.classList.remove('show');
      setTimeout(() => loadingOverlay.remove(), 300);
    }, 600);
  }

  // =============================================
  // Page Initialization
  // =============================================
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      P.session?.requireLogin?.();
      P.layout.injectLayout();

      const isAdminFn = P.auth && P.auth.isAdmin;
      IS_ADMIN = !!(isAdminFn && isAdminFn());
      P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');

      await P.session.initHeader();
      renderCategoryPills('All');
      bindFilters();
      await load();
      applyFilters();

      const btnManage = document.getElementById('btn-manage');
      const btnAdd = document.getElementById('btn-add-squad');
      if (btnManage) btnManage.addEventListener('click', toggleManageView);
      if (btnAdd) btnAdd.addEventListener('click', () => PowerUp.squadAddForm?.open?.());

      document.addEventListener('squad-added', async () => {
        await load();
        applyFilters();
      });

      // Graceful reset if switching categories while managing
      document.getElementById('cat-pills')?.addEventListener('click', () => {
        const btnManage = document.getElementById('btn-manage');
        if (btnManage?.classList.contains('managing')) {
          btnManage.classList.remove('managing');
          btnManage.textContent = 'Manage Squads';
        }
      });

      console.log('%c✅ squads-cards.js loaded successfully — hybrid version operational.', 'color:#00ffaa');
    } catch (err) {
      console.error('Initialization error:', err);
      showToast('⚠️ Error initializing Squads page.', 'error');
    }
  });

  // =============================================
  // Overlay styling for transitions
  // =============================================
  const overlayStyle = document.createElement('style');
  overlayStyle.textContent = `
    .view-switch-overlay {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(10, 20, 20, 0.9);
      padding: 1.2rem 2rem;
      border: 1px solid #00ff99;
      border-radius: 10px;
      color: #99ffcc;
      font-weight: 600;
      z-index: 9999;
      opacity: 0;
      transition: opacity .3s ease;
      pointer-events: none;
    }
    .view-switch-overlay.show {
      opacity: 1;
    }
    .pu-toast {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(30, 40, 40, 0.95);
      color: #fff;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 0.9rem;
      opacity: 0;
      transition: opacity .3s;
      z-index: 99999;
    }
    .pu-toast.show { opacity: 1; }
    .pu-toast.success { border-left: 4px solid #00ff99; }
    .pu-toast.error { border-left: 4px solid #ff3333; }
    .pu-toast.warn { border-left: 4px solid #ffaa33; }
  `;
  document.head.appendChild(overlayStyle);

  window.PowerUp = P;
})(window.PowerUp || {});


