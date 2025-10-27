<script>
// ======================================================================
// PowerUp — Squads Cards + Manage View  (Stabilized Merge)
// Fixes in this build:
// - Filters work again (All/CI/Quality/Safety/Training/Other, My squads, Active only, search)
// - "Manage Squads" <-> "View Cards" toggle actually switches views
// - ID column shows correct Squad ID
// - Leaders column preloads current leaders and supports multi-select changes
// - Save/Cancel wired; Cancel reverts row + highlight flash
// - Toasts embedded; no external dependency required
// - Wider columns; consistent buttons; subtle green Save / red Cancel
// - Centered overlay spinner during view switches
// - Keeps existing IDs/structure used in your app
// ======================================================================

(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

  // ---------- Column maps (match your main branch) ----------
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
  const SM_COL = {
    squadId:   ['Squad ID','SquadID','Squad','Squad Id'],
    empId:     ['Employee ID','EmployeeID','Position ID'],
    empName:   ['Employee Name','Name','Display Name'],
    role:      ['Role'],
    active:    ['Active','Is Active?']
  };

  // ---------- Small helpers ----------
  const pick = (row, list, d='') => {
    if (!row) return d;
    const keys = Array.isArray(list) ? list : [list];
    for (const k of keys) if (row[k] != null && row[k] !== '') return row[k];
    return d;
  };
  const dash  = v => (v==null || String(v).trim()==='') ? '-' : String(v);
  const isTrue= v => v===true || /^(true|yes|y|checked|1)$/i.test(String(v ?? '').trim());
  const normCategory = (v) => {
    const t = String(v||'').toLowerCase();
    if (/^ci|improve/.test(t)) return 'CI';
    if (/^quality/.test(t))    return 'Quality';
    if (/^safety/.test(t))     return 'Safety';
    if (/^training/.test(t))   return 'Training';
    return 'Other';
  };

  // ---------- Toast (embedded, theme-aware) ----------
  function ensureToastRoot() {
    let el = document.getElementById('pu-toast-root');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pu-toast-root';
      document.body.appendChild(el);
    }
    return el;
  }
  function showToast(msg, type='info', ms=3000) {
    ensureToastRoot();
    const t = document.createElement('div');
    t.className = `pu-toast ${type}`;
    t.textContent = msg;
    document.getElementById('pu-toast-root').appendChild(t);
    // force layout then animate in
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => {
      t.classList.remove('in');
      setTimeout(() => t.remove(), 250);
    }, ms);
  }

  // ---------- Data state ----------
  let ALL = [];                 // normalized squads
  let idToName = new Map();     // employeeId -> displayName
  let MEMBERS_BY_SQUAD = new Map(); // sid -> {ids:Set, names:Set}
  let LEADERS_BY_SQUAD  = new Map(); // sid -> [{id,name}]
  let IS_ADMIN = false;

  // ---------- Category pills ----------
  const CAT_CLASS = { CI:'cat-ci', Quality:'cat-quality', Safety:'cat-safety', Training:'cat-training', Other:'cat-other' };
  function renderCategoryPills(activeCat='All') {
    const cats = ['All','CI','Quality','Safety','Training','Other'];
    const wrap = document.getElementById('cat-pills');
    if (!wrap) return;
    wrap.innerHTML = cats.map(cat => `
      <button class="pill-cat${cat===activeCat?' active':''}" data-cat="${cat}">
        <span class="dot"></span>${cat}
      </button>
    `).join('');
  }

  // ---------- Cards ----------
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
      const sid = String(sq.id||'').trim();
      const leaders = LEADERS_BY_SQUAD.get(sid) || [];
      let leaderLine = dash(sq.leaderName || sq.leaderId);
      if (leaders.length) {
        const names = leaders.map(x => (x.name || idToName.get(x.id) || x.id || '').toString().trim())
          .filter(Boolean).sort((a,b) => a.localeCompare(b, undefined, {sensitivity:'base'}));
        leaderLine = names.length <= 2 ? names.join(', ') : `${names[0]}, ${names[1]} +${names.length-2} more`;
      }

      const detailsHref = sid
        ? `squad-details.html?id=${encodeURIComponent(sid)}`
        : `squad-details.html?name=${encodeURIComponent(sq.name)}`;

      const catCls = CAT_CLASS[sq.category] || CAT_CLASS.Other;
      const status = isTrue(sq.active)
        ? `<span class="status-pill status-on">Active</span>`
        : `<span class="status-pill status-off">Inactive</span>`;

      return `
        <div class="squad-card card ${catCls}">
          <h4>${dash(sq.name)}</h4>
          <div class="squad-meta"><b>${leaders.length>1?'Leaders':'Leader'}:</b> ${leaderLine}</div>
          <div class="squad-meta"><b>Status:</b> ${status}</div>
          <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
          <div class="squad-foot"><a class="squad-link" href="${detailsHref}">View Details →</a></div>
        </div>`;
    }).join('');
  }

  // ---------- Filters ----------
  function userIsMemberOrLeader(squad, session) {
    const myId   = String(session.employeeId || '').trim().toLowerCase();
    const myName = String(session.displayName || '').trim().toLowerCase();
    if (myId && String(squad.leaderId || '').trim().toLowerCase() === myId) return true;
    const sid = String(squad.id||'').trim();
    const entry = MEMBERS_BY_SQUAD.get(sid);
    if (!entry) return false;
    return (myId && entry.ids.has(myId)) || (myName && entry.names.has(myName));
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
    } catch { return null; }
  }

  async function applyFilters() {
    const session   = P.session.get?.() || {};
    const cat       = document.querySelector('.pill-cat.active')?.dataset.cat || 'All';
    const myOnly    = document.getElementById('myOnly')?.checked;
    const activeOnly= document.getElementById('activeOnly')?.checked;
    const q         = (document.getElementById('search')?.value || '').trim().toLowerCase();

    let list = ALL.slice();

    if (myOnly) {
      if (IS_ADMIN) {
        let target = await getAdminTargetFromFilter();
        if (!target) target = { id: String(session.employeeId||'').trim(), name: String(session.displayName||'').trim() };
        const norm = s => String(s||'').trim().toLowerCase();
        const tgtId = norm(target.id);
        const tgtNm = norm(target.name);
        list = list.filter(s => {
          const sid = String(s.id||'').trim();
          const leaders = LEADERS_BY_SQUAD.get(sid) || [];
          const leaderHit = leaders.some(x => norm(x.id)===tgtId || norm(x.name)===tgtNm);
          const m = MEMBERS_BY_SQUAD.get(sid);
          const memberHit = m ? (m.ids.has(tgtId) || m.names.has(tgtNm)) : false;
          if (!m && s.members) {
            const toks = String(s.members).split(/[;,\n,]+/).map(t => norm(t));
            return leaderHit || memberHit || toks.includes(tgtId) || toks.includes(tgtNm);
          }
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

  function wireUI() {
    renderCategoryPills('All');
    const pills = document.getElementById('cat-pills');
    pills?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      pills.querySelectorAll('.pill-cat').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
    document.getElementById('myOnly')?.addEventListener('change', applyFilters);
    document.getElementById('activeOnly')?.addEventListener('change', applyFilters);
    document.getElementById('search')?.addEventListener('input', applyFilters);
    document.addEventListener('powerup-admin-filter-change', applyFilters);
  }

  // ---------- Data load ----------
  async function loadAll() {
    // Employees
    idToName.clear();
    const emRows = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    emRows.forEach(r => {
      const id = String(pick(r, EMP_COL.id, '')).trim();
      const nm = String(pick(r, EMP_COL.name, '')).trim();
      if (id) idToName.set(id, nm);
    });

    // Members/Leaders
    MEMBERS_BY_SQUAD = new Map();
    LEADERS_BY_SQUAD = new Map();
    try {
      const smRows = await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
      smRows.forEach(r => {
        if (!isTrue(pick(r, SM_COL.active, 'true'))) return;
        const sid = String(pick(r, SM_COL.squadId, '')).trim(); if (!sid) return;
        const eid = String(pick(r, SM_COL.empId, '')).trim();
        const enm = String(pick(r, SM_COL.empName, '') || idToName.get(eid) || '').trim();
        const role = String(pick(r, SM_COL.role, '')).toLowerCase();

        let entry = MEMBERS_BY_SQUAD.get(sid);
        if (!entry) { entry = { ids: new Set(), names: new Set() }; MEMBERS_BY_SQUAD.set(sid, entry); }
        if (eid) entry.ids.add(eid.toLowerCase());
        if (enm) entry.names.add(enm.toLowerCase());

        if (role === 'leader') {
          const arr = LEADERS_BY_SQUAD.get(sid) || [];
          arr.push({ id: eid, name: enm });
          LEADERS_BY_SQUAD.set(sid, arr);
        }
      });
    } catch (e) { /* sheet may be absent temporarily */ }

    // Squads
    const rows = await getRowsByTitle(SHEETS.SQUADS);
    ALL = rows.map(r => {
      const name = String(pick(r, SQUAD_COL.name, '')).trim();
      if (!name) return null;
      const leaderId = String(pick(r, SQUAD_COL.leaderId, '')).trim();
      return {
        id:       pick(r, SQUAD_COL.id, ''),
        name,
        category: normCategory(pick(r, SQUAD_COL.category, 'Other')),
        leaderId,
        leaderName: idToName.get(leaderId) || '',
        members:  pick(r, SQUAD_COL.members, ''),
        objective:pick(r, SQUAD_COL.objective, ''),
        active:   pick(r, SQUAD_COL.active, ''),
        created:  pick(r, SQUAD_COL.created, ''),
        notes:    pick(r, SQUAD_COL.notes, '')
      };
    }).filter(Boolean);
  }

  // ---------- Overlay spinner ----------
  function showOverlay(text='Loading…') {
    let o = document.getElementById('manageOverlay');
    if (!o) {
      o = document.createElement('div');
      o.id = 'manageOverlay';
      o.innerHTML = `
        <div class="manage-overlay-spinner">
          <div class="spinner"></div>
          <div class="label">${text}</div>
        </div>`;
      document.body.appendChild(o);
    }
    o.querySelector('.label').textContent = text;
    o.style.display = 'flex';
    return o;
  }
  function hideOverlay() { const o = document.getElementById('manageOverlay'); if (o) o.style.display='none'; }

  // ---------- Manage table ----------
  async function buildManageTable(squads, members, employees, mountEl) {
    let view = document.getElementById('squad-management-view');
    if (!view) {
      view = document.createElement('div');
      view.id = 'squad-management-view';
      mountEl.parentNode.insertBefore(view, mountEl.nextSibling);
    }
    view.innerHTML = '';

    // employees -> [{id,name}]
    const empMap = employees.map(e => ({
      id:   e['Position ID'] || e['Employee ID'],
      name: e['Display Name'] || e['Employee Name']
    })).filter(e => e.id && e.name);

    // leadersById for preselect
    const leadersById = new Map(); // sid -> Set(ids)
    members.forEach(m => {
      if (!isTrue(pick(m, SM_COL.active, 'true'))) return;
      if (String(pick(m, SM_COL.role, '')).toLowerCase() !== 'leader') return;
      const sid = String(pick(m, SM_COL.squadId,'')).trim();
      const eid = String(pick(m, SM_COL.empId,'')).trim();
      if (!sid || !eid) return;
      let set = leadersById.get(sid);
      if (!set) { set = new Set(); leadersById.set(sid, set); }
      set.add(eid);
    });

    const table = document.createElement('table');
    table.className = 'manage-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th class="col-id">ID</th>
          <th class="col-name">Squad Name</th>
          <th class="col-cat">Category</th>
          <th class="col-active">Active</th>
          <th class="col-obj">Objective</th>
          <th class="col-lead">Leaders</th>
          <th class="col-created">Created By</th>
          <th class="col-actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${squads.map(r => {
          const sid = r['Squad ID'] || r.id || '';
          const selected = leadersById.get(sid) || new Set();
          return `
          <tr data-id="${sid}">
            <td class="id">${dash(sid)}</td>
            <td class="name" contenteditable="true">${dash(r['Squad Name'])}</td>
            <td class="category" contenteditable="true">${dash(r['Category'])}</td>
            <td class="active"><input type="checkbox" ${isTrue(r['Active'])?'checked':''}></td>
            <td class="objective" contenteditable="true">${dash(r['Objective'])}</td>
            <td class="leaders">
              <select multiple size="6" class="leader-select">
                ${empMap.map(emp => `<option value="${emp.id}" data-name="${emp.name}" ${selected.has(emp.id)?'selected':''}>${emp.name}</option>`).join('')}
              </select>
            </td>
            <td class="createdBy" contenteditable="true">${dash(r['Created By'])}</td>
            <td class="actions">
              <button class="btn btn-save">Save</button>
              <button class="btn btn-cancel">Cancel</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>`;
    view.appendChild(table);

    // snapshot for cancel
    table.querySelectorAll('tr[data-id]').forEach(tr => {
      const orig = {
        name: tr.querySelector('.name').textContent.trim(),
        category: tr.querySelector('.category').textContent.trim(),
        active: tr.querySelector('.active input').checked,
        objective: tr.querySelector('.objective').textContent.trim(),
        createdBy: tr.querySelector('.createdBy').textContent.trim(),
        leaders: [...tr.querySelectorAll('.leader-select option:checked')].map(o => o.value) // IDs
      };
      tr.dataset.original = JSON.stringify(orig);
    });

    // click handlers
    table.addEventListener('click', async (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const sid = tr.dataset.id;

      if (e.target.classList.contains('btn-save')) {
        const name = tr.querySelector('.name').textContent.trim();
        const category = tr.querySelector('.category').textContent.trim();
        const active = tr.querySelector('.active input').checked;
        const objective = tr.querySelector('.objective').textContent.trim();
        const createdBy = tr.querySelector('.createdBy').textContent.trim();
        const selected = [...tr.querySelectorAll('.leader-select option:checked')].map(o => ({id:o.value, name:o.dataset.name}));

        if (!selected.length) { showToast('Each squad must have at least one leader.','warn'); return; }

        try {
          await P.api.updateRowById('SQUADS', sid, {
            'Squad Name': name,
            'Category': category,
            'Active': active,
            'Objective': objective,
            'Created By': createdBy
          });

          // reconcile leaders (by ID)
          const existing = members.filter(m => (m['Squad ID']||m['SquadId']) === sid && String(m['Role']).toLowerCase()==='leader');
          const existingIDs = existing.map(m => String(m['Employee ID']));
          const selIDs = selected.map(s => String(s.id));

          const toRemove = existing.filter(m => !selIDs.includes(String(m['Employee ID'])));
          const toAdd    = selected.filter(s => !existingIDs.includes(String(s.id)));

          for (const r of toRemove) await P.api.deleteRowById('SQUAD_MEMBERS', r.id);
          for (const l of toAdd) await P.api.addRow('SQUAD_MEMBERS', {
            'Squad ID': sid,
            'Employee ID': l.id,
            'Employee Name': l.name,
            'Role': 'Leader',
            'Active': true
          });

          tr.dataset.original = JSON.stringify({ name, category, active, objective, createdBy, leaders: selIDs });
          showToast(`Saved updates for “${name}”.`,'success');
        } catch (err) {
          console.error(err);
          showToast('Error saving squad changes.','error');
        }
      }

      if (e.target.classList.contains('btn-cancel')) {
        const orig = JSON.parse(tr.dataset.original || '{}');
        tr.querySelector('.name').textContent = orig.name || '';
        tr.querySelector('.category').textContent = orig.category || '';
        tr.querySelector('.active input').checked = !!orig.active;
        tr.querySelector('.objective').textContent = orig.objective || '';
        tr.querySelector('.createdBy').textContent = orig.createdBy || '';
        const sel = tr.querySelector('.leader-select');
        if (sel) [...sel.options].forEach(o => { o.selected = (orig.leaders||[]).includes(o.value); });
        tr.classList.add('row-flash');
        setTimeout(() => tr.classList.remove('row-flash'), 500);
      }
    });

    return view;
  }

  // ---------- Manage toggle wiring ----------
  function wireManageToggle() {
    const manageBtn = document.getElementById('btn-manage');
    const viewCardsBtn = document.getElementById('btn-view-cards') || document.querySelector('[data-view="cards"]'); // allow either id or data attr
    const cardsContainer = document.getElementById('cards');

    let activeView = 'cards'; // 'cards' | 'manage'
    async function toManage() {
      activeView = 'manage';
      manageBtn && (manageBtn.textContent = 'View Cards');
      showOverlay('Loading Squads…');
      try {
        const [squadsRes, membersRes, employeesRes] = await Promise.all([
          P.api.getRowsByTitle('SQUADS', { force: true }),
          P.api.getRowsByTitle('SQUAD_MEMBERS', { force: true }),
          P.getEmployees()
        ]);
        const mv = await buildManageTable(squadsRes, membersRes, employeesRes, cardsContainer);
        cardsContainer.style.display = 'none';
        mv.style.display = 'block';
      } finally { hideOverlay(); }
    }
    async function toCards() {
      activeView = 'cards';
      manageBtn && (manageBtn.textContent = 'Manage Squads');
      const mv = document.getElementById('squad-management-view');
      if (mv) mv.style.display = 'none';
      cardsContainer.style.display = 'block';
      showOverlay('Refreshing cards…');
      try {
        await loadAll();
        await applyFilters();
      } finally { hideOverlay(); }
    }

    manageBtn?.addEventListener('click', () => {
      if (activeView === 'cards') toManage(); else toCards();
    });
    viewCardsBtn?.addEventListener('click', () => {
      if (activeView === 'manage') toCards();
    });
  }

  // ---------- Add New Squad modal (unchanged from your main) ----------
  document.getElementById("btn-add-squad")?.addEventListener("click", () => {
    if (PowerUp.squadAddForm && typeof PowerUp.squadAddForm.open === "function") {
      PowerUp.squadAddForm.open();
    } else {
      showToast("Add Squad form not ready.","info");
    }
  });
  document.addEventListener("squad-added", async () => {
    if (typeof PowerUp.squads?.refresh === "function") {
      await PowerUp.squads.refresh();
    } else {
      location.reload();
    }
  });

  // ---------- Startup ----------
document.addEventListener('DOMContentLoaded', async () => {
  P.session.requireLogin();

  // Wait for the shared layout to fully inject before touching the DOM
  await P.layout.injectLayout();
  await P.session.initHeader();

  IS_ADMIN = !!(P.auth && P.auth.isAdmin && P.auth.isAdmin());
  P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');

  // Now safe to wire the page-specific UI
  wireUI();

  const activeOnly = document.getElementById('activeOnly');
  if (activeOnly) activeOnly.checked = false;

  await loadAll();
  await applyFilters();
  wireManageToggle();
});

  // ---------- Inline CSS (kept here per your request) ----------
  const style = document.createElement('style');
  style.textContent = `
  /* Toast */
  #pu-toast-root{position:fixed;left:0;right:0;bottom:18px;display:flex;justify-content:center;z-index:4000;pointer-events:none}
  .pu-toast{min-width:280px;max-width:560px;padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.14);
    background:#152325;color:#d9e6e6;box-shadow:0 8px 18px rgba(0,0,0,.45);opacity:0;transform:translateY(6px);transition:.22s}
  .pu-toast.in{opacity:1;transform:translateY(0)}
  .pu-toast.info{border-color:var(--accent,#00ffcc)}
  .pu-toast.success{border-color:var(--success,#30d158)}
  .pu-toast.warn{border-color:#ffc857;background:#2a2417;color:#ffd98a}
  .pu-toast.error{border-color:#ff5757;background:#2a1717;color:#ffb3b3}

  /* Cards (unchanged visuals) */
  .squad-card{ border:2px solid rgba(255,255,255,.08); padding:12px 14px; border-radius:8px; }
  .squad-card h4{ font-size:16px; color:#9ffbe6; margin-bottom:6px; }
  .squad-meta{ font-size:13px; color:#e5e7eb; }
  .squad-foot{ display:flex; justify-content:flex-end; margin-top:6px; }
  .squad-link{ font-size:13px; color:var(--accent,#00ffcc); text-decoration:none; }
  .squad-link:hover{ text-decoration:underline; }
  .status-pill{ display:inline-block; padding:3px 8px; border-radius:999px; font-size:12px; font-weight:700; }
  .status-on{ background: var(--success,#30d158); color:#000; }
  .status-off{ background:#3a4e4e; color:#fff; }

  /* Pills */
  .pill-cat{ display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border:1.5px solid rgba(255,255,255,.12);
    border-radius:999px; background: var(--card-bg,#0f1a1a); color: var(--text,#d9e6e6); cursor:pointer; }
  .pill-cat .dot{ width:8px; height:8px; border-radius:50%; background: var(--accent,#00ffcc); }
  .pill-cat.active{ background: rgba(0,0,0,.12); border-color: var(--accent,#00ffcc); }

  /* Manage table */
  .manage-table{ width:100%; border-collapse:collapse; font-size:13px; position:relative; }
  .manage-table th,.manage-table td{ border:1px solid #2d3f3f; padding:10px 12px; background:#0f1a1a; color:#d9e6e6; }
  .manage-table th{ text-transform:uppercase; font-size:12px; font-weight:600; position:sticky; top:0; z-index:10; }
  .manage-table thead::after{ content:""; position:absolute; top:0; left:0; right:0; height:40px;
    background:linear-gradient(to bottom, rgba(15,26,26,1) 70%, transparent); pointer-events:none; }
  /* widen columns */
  .manage-table .col-id{min-width:84px}
  .manage-table .col-name{min-width:220px}
  .manage-table .col-cat{min-width:120px}
  .manage-table .col-active{min-width:90px;text-align:center}
  .manage-table .col-obj{min-width:240px}
  .manage-table .col-lead{min-width:260px}
  .manage-table .col-created{min-width:140px}
  .manage-table .col-actions{min-width:160px;text-align:center}
  .manage-table td.active{ text-align:center }
  .manage-table tr.row-flash{ box-shadow:inset 0 0 0 9999px rgba(80,120,20,.15); transition:box-shadow .5s }

  .leader-select{ width:100%; max-width:360px; height:auto; background:#101f1f; color:#e5e7eb; border:1px solid #2d3f3f; border-radius:6px; }

  .actions .btn{ display:inline-block; min-width:72px; padding:6px 10px; border-radius:7px; border:1px solid rgba(0,255,204,.35);
    background:#0f1a1a; color:#d9e6e6; margin:0 4px; cursor:pointer; line-height:1.1; }
  .actions .btn-save{ border-color:rgba(48,209,88,.6); box-shadow:0 0 0 1px rgba(48,209,88,.2) inset; }
  .actions .btn-cancel{ border-color:rgba(255,99,99,.55); box-shadow:0 0 0 1px rgba(255,99,99,.18) inset; }
  .actions .btn:hover{ background:#152525; }

  /* Overlay */
  #manageOverlay{ position:fixed; inset:0; background:rgba(0,0,0,.5); display:none; align-items:center; justify-content:center; z-index:3000; }
  .manage-overlay-spinner{ display:flex; flex-direction:column; align-items:center; gap:12px; background:#0f1b1b; border:1px solid var(--accent,#00ffcc);
    padding:22px 26px; border-radius:12px; color:#d9e6e6; font-weight:600; }
  .spinner{ width:28px; height:28px; border:3px solid var(--accent,#00ffcc); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; }
  @keyframes spin{ to{ transform:rotate(360deg);} }
  `;
  document.head.appendChild(style);

})(window.PowerUp || {});
</script>
