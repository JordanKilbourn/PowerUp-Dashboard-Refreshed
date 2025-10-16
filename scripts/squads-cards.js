// scripts/squads-cards.js
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

  // Column maps
  const EMP_COL = {
    id: ['Position ID','Employee ID'],
    name: ['Display Name','Employee Name','Name']
  };
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
  const SM_COL = {
    squadId: ['Squad ID','SquadId','Squad'],
    empId: ['Employee ID','EmployeeID','Position ID'],
    empName: ['Employee Name','Name','Display Name'],
    active: ['Active','Is Active?'],
    role: ['Role']
  };

  const CATS = ['All','CI','Quality','Safety','Training','Other'];
  const CAT_CLASS = {
    CI: 'cat-ci',
    Quality: 'cat-quality',
    Safety: 'cat-safety',
    Training: 'cat-training',
    Other: 'cat-other'
  };

  // FIX: make pick() accept string or array safely
  const pick = (row, list, d = '') => {
    if (!row) return d;
    const keys = Array.isArray(list) ? list : [list];
    for (const k of keys) {
      if (row[k] != null && row[k] !== '') return row[k];
    }
    return d;
  };

  const dash = v => (v == null || String(v).trim() === '' ? '-' : String(v));
  const isTrue = v => v === true || /^(true|yes|y|checked|1)$/i.test(String(v || '').trim());

  function normCategory(v) {
    const t = String(v || '').toLowerCase();
    if (/^ci|improve/.test(t)) return 'CI';
    if (/^quality/.test(t)) return 'Quality';
    if (/^safety/.test(t)) return 'Safety';
    if (/^training/.test(t)) return 'Training';
    return 'Other';
  }

  function parseMemberTokens(text) {
    return String(text || '').split(/[;,\n]+/).map(s => s.trim()).filter(Boolean);
  }

  function catVar(cat) {
    switch (cat) {
      case 'CI': return 'var(--sq-ci)';
      case 'Quality': return 'var(--sq-quality)';
      case 'Safety': return 'var(--sq-safety)';
      case 'Training': return 'var(--sq-training)';
      case 'Other': return 'var(--sq-other)';
      default: return 'var(--accent)';
    }
  }

  const MEMBERS_BY_SQUAD = new Map();
  const LEADERS_BY_SQUAD = new Map();

  function userIsMemberOrLeader(squad, session) {
    const myId = String(session.employeeId || '').trim().toLowerCase();
    const myName = String(session.displayName || '').trim().toLowerCase();
    if (myId && String(squad.leaderId || '').trim().toLowerCase() === myId) return true;

    const sid = String(squad.id || '').trim();
    const entry = MEMBERS_BY_SQUAD.get(sid);
    if (entry) {
      if (myId && entry.ids.has(myId)) return true;
      if (myName && entry.names.has(myName)) return true;
    } else {
      const tokensLC = parseMemberTokens(squad.members).map(t => t.toLowerCase());
      if (myId && tokensLC.includes(myId)) return true;
      if (myName && tokensLC.includes(myName)) return true;
    }
    return false;
  }

  let ALL = [];
  let idToName = new Map();
  let IS_ADMIN = false;

  function renderCategoryPills(activeCat) {
    const wrap = document.getElementById('cat-pills');
    if (!wrap) return;
    wrap.innerHTML = CATS.map(cat => {
      const style = `--cat:${catVar(cat)};`;
      return `
        <button class="pill-cat${cat === activeCat ? ' active' : ''}" data-cat="${cat}" style="${style}">
          <span class="dot"></span>${cat}
        </button>`;
    }).join('');
  }

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
          .sort((a, b) => a.localeCompare(b));
        leaderLine = names.length === 1
          ? names[0]
          : names.length === 2
            ? `${names[0]}, ${names[1]}`
            : `${names[0]}, ${names[1]} +${names.length - 2} more`;
      }

      const detailsHref = sq.id
        ? `squad-details.html?id=${encodeURIComponent(sq.id)}`
        : `squad-details.html?name=${encodeURIComponent(sq.name)}`;
      const catCls = CAT_CLASS[sq.category] || CAT_CLASS.Other;

      return `
        <div class="squad-card card ${catCls}">
          <h4>${dash(sq.name)}</h4>
          <div class="squad-meta"><b>${(leaders && leaders.length > 1) ? 'Leaders' : 'Leader'}:</b> ${leaderLine}</div>
          <div class="squad-meta"><b>Status:</b> ${status}</div>
          <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
          <div class="squad-foot"><a class="squad-link" href="${detailsHref}">View Details →</a></div>
        </div>`;
    }).join('');
  }
  async function getAdminTargetFromFilter() {
    try {
      const sel = (sessionStorage.getItem('pu.adminEmployeeFilter') || '').trim();
      if (!sel || sel === '__ALL__') return null;

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

  async function applyFilters() {
    const session = P.session.get();
    const cat = document.querySelector('.pill-cat.active')?.dataset.cat || 'All';
    const myOnly = document.getElementById('myOnly')?.checked;
    const activeOnly = document.getElementById('activeOnly')?.checked;
    const q = (document.getElementById('search')?.value || '').trim().toLowerCase();
    let list = ALL.slice();

    if (myOnly) {
      if (IS_ADMIN) {
        let target = await getAdminTargetFromFilter();
        if (!target) target = {
          id: String(session.employeeId || '').trim(),
          name: String(session.displayName || '').trim()
        };
        const norm = s => String(s || '').trim().toLowerCase();
        const tgtId = norm(target.id);
        const tgtName = norm(target.name);

        list = list.filter(s => {
          const leaders = LEADERS_BY_SQUAD.get(String(s.id || '').trim()) || [];
          const leaderHit = leaders.some(x => norm(x.id) === tgtId || norm(x.name) === tgtName);
          const m = MEMBERS_BY_SQUAD.get(String(s.id || '').trim());
          const memberHit = m ? (m.ids.has(tgtId) || m.names.has(tgtName)) : false;
          let fallbackHit = false;
          if (!m && s.members) {
            const toks = String(s.members).split(/[;,\n]+/).map(t => norm(t));
            fallbackHit = (!!tgtId && toks.includes(tgtId)) || (!!tgtName && toks.includes(tgtName));
          }
          return leaderHit || memberHit || fallbackHit;
        });
      } else list = list.filter(s => userIsMemberOrLeader(s, session));
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
    try {
      if (SHEETS.SQUAD_MEMBERS) {
        const smRows = await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
const smRows = await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
smRows.forEach(r => {
  const active = isTrue(pick(r, SM_COL.active, 'true'));
  if (!active) return;

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

    } catch {}

    const rows = await getRowsByTitle(SHEETS.SQUADS);
    ALL = rows.map(r => {
      const name = pick(r, SQUAD_COL.name, '').toString().trim();
      if (!name) return null;
      const leaderId = pick(r, SQUAD_COL.leaderId, '').toString().trim();
      return {
        id: pick(r, SQUAD_COL.id, ''),
        name,
        category: normCategory(pick(r, SQUAD_COL.category, 'Other')),
        leaderId,
        leaderName: idToName.get(leaderId) || '',
        members: pick(r, SQUAD_COL.members, ''),
        objective: pick(r, SQUAD_COL.objective, ''),
        active: pick(r, SQUAD_COL.active, ''),
        created: pick(r, SQUAD_COL.created, ''),
        notes: pick(r, SQUAD_COL.notes, '')
      };
    }).filter(Boolean);
  }

  function wireUI() {
    renderCategoryPills('All');
    const pills = document.getElementById('cat-pills');
    if (pills) {
      pills.addEventListener('click', e => {
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
    document.addEventListener('powerup-admin-filter-change', applyFilters);
  }

document.addEventListener('DOMContentLoaded', async () => {
  P.session.requireLogin();
  P.layout.injectLayout();
  IS_ADMIN = !!(P.auth && P.auth.isAdmin && P.auth.isAdmin());
  P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');
  await P.session.initHeader();
  wireUI();
  document.getElementById('activeOnly')?.checked = false; // <- fixed here
  await load();
  applyFilters();
});

  // --- FIX 1: Manage Squads Button Initialization ---
  const waitForManageBtn = setInterval(() => {
    const manageBtn = document.getElementById('btn-manage');
    if (manageBtn) {
      clearInterval(waitForManageBtn);
      initManageSquadsFeature(manageBtn);
    }
  }, 300);
  // FIX 1 end

  // --- Manage Squads Feature (Admin Mode) ---
  async function initManageSquadsFeature(btn) {
    btn.addEventListener('click', async () => {
      const cardsContainer = document.getElementById('cards');
      const msg = document.getElementById('s-msg');
      if (msg) msg.style.display = 'none';

      // FIX: restored + enhanced loading spinner
      cardsContainer.innerHTML = `
        <div class="loading-spinner" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;color:#9ff;">
          <div class="spinner" style="width:36px;height:36px;border:4px solid #0b0;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></div>
          <p style="margin-top:12px;animation:pulse 1.5s ease-in-out infinite;">Loading Manage View…</p>
        </div>
      `;
      const anim = document.createElement('style');
      anim.textContent = `
        @keyframes spin {to{transform:rotate(360deg)}}
        @keyframes pulse {0%,100%{opacity:.5}50%{opacity:1}}
      `;
      document.head.appendChild(anim);

      // FIX 2: load all three Smartsheets
      const [squads, members, employees] = await Promise.all([
        PowerUp.api.getRowsByTitle('SQUADS', { force: true }),
        PowerUp.api.getRowsByTitle('SQUAD_MEMBERS', { force: true }),
        PowerUp.getEmployees()
      ]);

      const ALL_EMPLOYEES = employees.map(e => ({
        id: e['Employee ID'] || e['Position ID'],
        name: e['Employee Name'] || e['Display Name']
      }));

      // FIX 3: build leaders map
      const LEADERS_BY_SQUAD = new Map();
      members.forEach(r => {
        if (!isTrue(pick(r, SM_COL.active, 'true'))) return;
        const sid = pick(r, SM_COL.squadId, '').trim();
        const role = (pick(r, SM_COL.role, '') || '').toLowerCase();
        const eid = pick(r, SM_COL.empId, '').trim();
        const name = pick(r, SM_COL.empName, '').trim();
        if (role === 'leader') {
          const arr = LEADERS_BY_SQUAD.get(sid) || [];
          arr.push({ id: eid, name });
          LEADERS_BY_SQUAD.set(sid, arr);
        }
      });

      // Build Manage Table
      const table = document.createElement('table');
      table.className = 'manage-table';
      table.innerHTML = `
        <thead>
          <tr><th>ID</th><th>Squad Name</th><th>Category</th><th>Active</th>
          <th>Objective</th><th>Leaders</th><th>Created By</th><th class="actions-cell">Actions</th></tr>
        </thead>
        <tbody>
          ${squads.map(row => {
            const sid = row.id;
            const leaders = (LEADERS_BY_SQUAD.get(sid) || []).map(x => x.name);
            return `
              <tr data-rowid="${row.id}">
                <td>${row.id}</td>
                <td contenteditable class="editable name">${dash(row['Squad Name'])}</td>
                <td contenteditable class="editable category">${dash(row['Category'])}</td>
                <td><input type="checkbox" class="active" ${isTrue(row['Active']) ? 'checked' : ''}></td>
                <td contenteditable class="editable objective">${dash(row['Objective'])}</td>
                <td>
                  <select multiple class="leader-select">
                    ${ALL_EMPLOYEES.map(emp => {
                      const selected = leaders.includes(emp.name) ? 'selected' : '';
                      return `<option value="${emp.name}" ${selected}>${emp.name}</option>`;
                    }).join('')}
                  </select>
                </td>
                <td contenteditable class="editable created-by">${dash(row['Created By'])}</td>
                <td class="actions-cell"><button class="save">Save</button><button class="cancel">Cancel</button></td>
              </tr>`;
          }).join('')}
        </tbody>`;
      cardsContainer.innerHTML = '';
      cardsContainer.appendChild(table);

      // FIX 4: table CSS
      const style = document.createElement('style');
      style.textContent = `
        .manage-table th{position:sticky;top:0;background:#0f1a1a;z-index:10;box-shadow:0 2px 6px rgba(0,0,0,.6)}
        .actions-cell{display:flex;gap:10px;justify-content:center}
        .manage-table th:nth-child(2){min-width:160px}
        .manage-table th:nth-child(8){min-width:140px}
        .manage-table th:nth-child(9){min-width:120px}`;
      document.head.appendChild(style);

      // cache originals
      table.querySelectorAll('tr[data-rowid]').forEach(tr => {
        const data = {
          name: tr.querySelector('.name')?.textContent.trim(),
          category: tr.querySelector('.category')?.textContent.trim(),
          active: tr.querySelector('.active')?.checked,
          objective: tr.querySelector('.objective')?.textContent.trim(),
          createdBy: tr.querySelector('.created-by')?.textContent.trim(),
          leaders: Array.from(tr.querySelector('.leader-select')?.selectedOptions || []).map(o => o.value)
        };
        tr.dataset.original = JSON.stringify(data);
      });

      // FIX 5–7: save / cancel logic
      table.addEventListener('click', async e => {
        const tr = e.target.closest('tr[data-rowid]');
        if (!tr) return;
        const rowId = tr.dataset.rowid;

        if (e.target.classList.contains('save')) {
          const name = tr.querySelector('.name')?.textContent.trim();
          const category = tr.querySelector('.category')?.textContent.trim();
          const active = tr.querySelector('.active')?.checked;
          const objective = tr.querySelector('.objective')?.textContent.trim();
          const createdBy = tr.querySelector('.created-by')?.textContent.trim();
          const leaders = Array.from(tr.querySelector('.leader-select')?.selectedOptions || []).map(o => o.value);
          if (!leaders.length) return PowerUp.ui.toast('Each squad must have at least one leader.','warn');

          await PowerUp.api.updateRowById('SQUADS', rowId, {
            'Squad Name': name, 'Category': category, 'Active': active,
            'Objective': objective, 'Created By': createdBy
          });

          const sid = rowId;
          const existing = members.filter(r => r['Squad ID'] === sid && r['Role'] === 'Leader');
          const existingNames = existing.map(r => r['Employee Name']);
          const toRemove = existing.filter(r => !leaders.includes(r['Employee Name']));
          const toAdd = leaders.filter(l => !existingNames.includes(l));
          const toUpdate = existing.filter(r => leaders.includes(r['Employee Name']));

          for (const row of toRemove) await PowerUp.api.deleteRowById('SQUAD_MEMBERS', row.id);
          for (const row of toUpdate) {
            const emp = ALL_EMPLOYEES.find(e => e.name === row['Employee Name']);
            if (emp && emp.id !== row['Employee ID'])
              await PowerUp.api.updateRowById('SQUAD_MEMBERS', row.id, {
                'Employee ID': emp.id, 'Employee Name': emp.name
              });
          }
          for (const leaderName of toAdd) {
            const emp = ALL_EMPLOYEES.find(e => e.name === leaderName);
            if (emp) await PowerUp.addSquadMember({
              'Squad ID': sid, 'Employee ID': emp.id, 'Employee Name': emp.name,
              'Role': 'Leader', 'Active': true, 'Added By': createdBy
            });
          }

          PowerUp.ui.toast(`Saved updates for ${name}`,'success');
          tr.dataset.original = JSON.stringify({ name, category, active, objective, createdBy, leaders });
        }

        if (e.target.classList.contains('cancel')) {
          const orig = JSON.parse(tr.dataset.original || '{}');
          tr.querySelector('.name').textContent = orig.name || '';
          tr.querySelector('.category').textContent = orig.category || '';
          tr.querySelector('.active').checked = !!orig.active;
          tr.querySelector('.objective').textContent = orig.objective || '';
          tr.querySelector('.created-by').textContent = orig.createdBy || '';
          const sel = tr.querySelector('.leader-select');
          if (sel) Array.from(sel.options).forEach(opt => opt.selected = orig.leaders.includes(opt.value));
          tr.style.backgroundColor = 'rgba(255,255,0,0.1)';
          setTimeout(() => tr.style.backgroundColor = '', 800);
        }
      });
    });
  }

})(window.PowerUp);
