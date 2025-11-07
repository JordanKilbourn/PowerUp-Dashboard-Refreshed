// =============================================
// PowerUp: Squads Page – Stable Reconciled Build 6 (SRB6)
// =============================================
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

  // =======================
  // Admin-only button visibility
  // =======================
  document.addEventListener('DOMContentLoaded', () => {
    const isAdmin = P.auth?.isAdmin?.() || false;
    const addBtn = document.getElementById('btn-add-squad');
    const manageBtn = document.getElementById('btn-manage');
    if (!isAdmin) {
      if (addBtn) addBtn.style.display = 'none';
      if (manageBtn) manageBtn.style.display = 'none';
    }
  });

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
  // UI Rendering
  // =======================
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

  // =======================
  // Card Rendering
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

    cards.innerHTML = list.map(sq => {
      const status = isTrue(sq.active)
        ? `<span class="status-pill status-on">Active</span>`
        : `<span class="status-pill status-off">Inactive</span>`;

      const leaders = LEADERS_BY_SQUAD.get(String(sq.id || '').trim());
      let leaderLine = dash(sq.leaderName || sq.leaderId);
      if (leaders && leaders.length) leaderLine = leaders.map(x => x.name).filter(Boolean).join(', ');

      const memberEntry = MEMBERS_BY_SQUAD.get(String(sq.id || '').trim());
      const mCount = memberEntry ? memberEntry.ids.size : 0;
      const memberChip = `
        <span class="member-chip">
          <img src="https://playworld.com/wp-content/uploads/2023/09/logo-icon.svg" 
               alt="Playworld logo" 
               class="emoji-logo" />
          ${mCount} member${mCount === 1 ? '' : 's'}
        </span>`;

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
                  ${memberChip}
                  <a class="squad-link" href="${detailsHref}">View Details →</a>
                </div>
              </div>`;
    }).join('');
  }

  // =======================
  // Toast + Loading Helpers
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

  function showLoadingOverlay(message = "Saving...") {
    let overlay = document.getElementById("saveOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "saveOverlay";
      overlay.innerHTML = `<div class="spinner"></div><p>${message}</p>`;
      Object.assign(overlay.style, {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.45)",
        color: "#aefcd8",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1.1rem",
        zIndex: 9999,
        backdropFilter: "blur(2px)"
      });
      document.body.appendChild(overlay);
    }
    overlay.style.display = "flex";
  }

  function hideLoadingOverlay() {
    const overlay = document.getElementById("saveOverlay");
    if (overlay) overlay.style.display = "none";
  }

  function showViewSwitchOverlay(message = "Loading view...") {
    let overlay = document.getElementById("viewSwitchOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "viewSwitchOverlay";
      overlay.innerHTML = `<div class="spinner"></div><p>${message}</p>`;
      Object.assign(overlay.style, {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "rgba(0,0,0,0.45)",
        color: "#aefcd8",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1.1rem",
        zIndex: 9998,
        transition: "opacity 0.3s ease",
        opacity: 0
      });
      document.body.appendChild(overlay);
    }
    overlay.style.display = "flex";
    setTimeout(() => (overlay.style.opacity = 1), 50);
setTimeout(() => {
  if (overlay.style.display === "flex") {
    overlay.style.opacity = 0;
    setTimeout(() => (overlay.style.display = "none"), 300);
  }
}, 800);
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
  // Filters
  // =======================
  let activeCategory = 'All';
  let activeOnly = false;



// ============================================================
// Admin Filter Resolver (restored from working original version)
// ============================================================
async function getAdminTargetFromFilter() {
  try {
    const sel = (sessionStorage.getItem('pu.adminEmployeeFilter') || '').trim();
    if (!sel || sel === '__ALL__' || sel.toLowerCase() === 'all employees') return null;

    // Build name map if needed
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

// ============================================================
// applyFilters (restored admin-driven version)
// ============================================================
async function applyFilters() {
  const manageMode = document.getElementById('btn-manage')?.classList.contains('managing');
  if (manageMode) return;

  const cardsContainer = document.getElementById('cards');
  if (cardsContainer) {
    cardsContainer.classList.remove('manage-view');
    cardsContainer.classList.add('cards-grid');
    cardsContainer.style.display = 'grid';
    cardsContainer.style.gridTemplateColumns = 'repeat(4, 1fr)';
    cardsContainer.style.gap = '1.2rem';
  }

  const session = P.session.get?.() || {};
  const cat = document.querySelector('.pill-cat.active')?.dataset.cat || activeCategory || 'All';
  const myOnly = document.getElementById('myOnly')?.checked;
  const activeOnly = document.getElementById('activeOnly')?.checked;
  const q = (document.getElementById('search')?.value || '').trim().toLowerCase();

  let list = [...ALL];
  const isAdmin = P.auth?.isAdmin?.() || false;

  if (myOnly) {
    const isAdminUser = P.auth?.isAdmin?.();
    const sessionData = P.session.get?.() || {};
    let targetName = '';
    let targetId = '';

    if (isAdminUser) {
      // Admins filter by the Admin dropdown selection
      const adminVal = sessionStorage.getItem('pu.adminEmployeeFilter') || '';
      if (adminVal && adminVal !== '__ALL__' && adminVal.toLowerCase() !== 'all employees') {
        targetName = adminVal.trim();
        // Try to resolve ID if we have it in the employee map
        for (const [id, nm] of idToName.entries()) {
          if (nm.trim().toLowerCase() === targetName.toLowerCase()) {
            targetId = id;
            break;
          }
        }
      }
      console.debug('[My Squads] Admin filter:', { targetName, targetId });
    } else {
      // Normal users filter by their own display name
      targetName = (sessionData.displayName || sessionData.name || '').trim();
      targetId = (sessionData.employeeId || sessionData.positionId || '').trim();
      console.debug('[My Squads] User filter:', { targetName, targetId });
    }

    // Skip filtering if admin filter is set to "All Employees"
    if (targetName && targetName.toLowerCase() !== 'all employees') {
      const norm = s => String(s || '').trim().toLowerCase();
      const tgtName = norm(targetName);
      const tgtId = norm(targetId);

      list = list.filter(s => {
        const sid = String(s.id || '').trim().toLowerCase();
        const members = MEMBERS_BY_SQUAD.get(sid);
        const leaders = LEADERS_BY_SQUAD.get(sid) || [];

        const memberHit = members && (
          [...members.names].has(tgtName) ||
          [...members.ids].has(tgtId)
        );

        const leaderHit = leaders.some(l => {
          const lid = norm(l.id);
          const lname = norm(l.name);
          return lid === tgtId || lname === tgtName;
        });

        return memberHit || leaderHit;
      });
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


// =======================
// Manage Table Rendering (dynamic layout-safe version)
// =======================
async function renderManageTable() {
  const cardsContainer = document.getElementById('cards');
  const msg = document.getElementById('s-msg');
  if (msg) msg.style.display = 'none';

  // Switch layout to table mode
  cardsContainer.classList.remove("cards-grid");
  cardsContainer.classList.add("manage-view");
  cardsContainer.style.display = "none";


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
      const isActive = /^(true|yes|y|1)$/i.test(String(r["Active"] || ""));
      if (!isActive) return;
      const sid = String(r["Squad ID"] || "").trim().toUpperCase();
      const role = String(r["Role"] || "").trim().toLowerCase();
      if (role === "leader") {
        leadersBySquad.set(sid, {
          id: String(r["Employee ID"] || "").trim(),
          name: String(r["Employee Name"] || "").trim()
        });
      }
    });

    const table = document.createElement('table');
    table.className = 'manage-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:8%">ID</th>
          <th style="width:20%">Squad Name</th>
          <th style="width:12%">Category</th>
          <th style="width:6%">Active</th>
          <th style="width:26%">Objective</th>
          <th style="width:18%">Leader</th>
          <th style="width:10%">Created By</th>
          <th style="width:10%">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${squads.map(r => {
          const sheetRowId = r.__rowId;
          const squadId = (r["Squad ID"] || "").trim().toUpperCase();
          const leader = leadersBySquad.get(squadId);
          const selectedName = leader ? leader.name : "";
          const rowData = {
            name: r["Squad Name"] || "",
            category: r["Category"] || "",
            active: r["Active"] === true || String(r["Active"]).toLowerCase() === "true",
            objective: r["Objective"] || "",
            createdBy: r["Created By"] || "",
            leader: selectedName
          };
          return `
            <tr data-rowid="${sheetRowId}" data-squadid="${squadId}"
                data-original='${JSON.stringify(rowData)}'>
              <td>${squadId}</td>
              <td contenteditable class="editable name">${rowData.name}</td>
              <td contenteditable class="editable category">${rowData.category}</td>
              <td><input type="checkbox" class="active" ${rowData.active ? "checked" : ""}></td>
              <td contenteditable class="editable objective">${rowData.objective}</td>
              <td>
                <select class="leader-select-single">
                  <option value="">— Select Leader —</option>
                  ${allEmps.map(emp =>
                    `<option value="${emp.name}" ${emp.name === selectedName ? "selected" : ""}>${emp.name}</option>`
                  ).join("")}
                </select>
              </td>
              <td contenteditable class="editable created-by">${rowData.createdBy}</td>
              <td class="actions-cell">
                <button class="btn-save">Save</button>
                <button class="btn-cancel">Cancel</button>
              </td>
            </tr>`;
        }).join("")}
      </tbody>`;

    cardsContainer.innerHTML = "";
    const wrapper = document.createElement('div');
    wrapper.className = 'manage-table-wrapper';
    wrapper.appendChild(table);
    cardsContainer.style.display = "block";
    cardsContainer.appendChild(wrapper);

    // Save + Cancel handlers
    table.addEventListener("click", async e => {
      const tr = e.target.closest("tr[data-rowid]");
      if (!tr) return;
      const rowId = tr.dataset.rowid;
      const original = JSON.parse(tr.dataset.original || "{}");

      if (e.target.classList.contains("btn-save")) {
        const name = tr.querySelector(".name")?.textContent.trim();
        const category = tr.querySelector(".category")?.textContent.trim();
        const active = tr.querySelector(".active")?.checked;
        const objective = tr.querySelector(".objective")?.textContent.trim();
        const createdBy = tr.querySelector(".created-by")?.textContent.trim();
        const leaderName = tr.querySelector(".leader-select-single")?.value;
        const leaderEmp = allEmps.find(e => e.name === leaderName);
        const squadId = tr.dataset.squadid;

        const hasChanges =
          name !== original.name ||
          category !== original.category ||
          active !== original.active ||
          objective !== original.objective ||
          createdBy !== original.createdBy ||
          (leaderEmp ? leaderEmp.name : leaderName) !== original.leader;

        if (!hasChanges) {
          showToast("No changes detected — nothing to save.", "info");
          return;
        }
        if (!leaderName) {
          showToast("Select a leader before saving.", "warn");
          return;
        }

        try {
          document.querySelectorAll(".btn-save, .btn-cancel, .leader-select-single, .editable")
            .forEach(el => el.disabled = true);
          showLoadingOverlay("Saving squad changes...");

          await P.api.updateRowById(P.api.SHEETS.SQUADS, rowId, {
            "Squad Name": name,
            "Category": category,
            "Active": active,
            "Objective": objective,
            "Created By": createdBy
          });

          if (leaderEmp && squadId) {
            await P.api.updateOrReplaceLeader({
              squadId,
              newLeaderId: leaderEmp.id,
              newLeaderName: leaderEmp.name
            });
          }

          hideLoadingOverlay();
          document.querySelectorAll(".btn-save, .btn-cancel, .leader-select-single, .editable")
            .forEach(el => el.disabled = false);

          showToast("✅ Squad saved successfully.", "success");
          await renderManageTable();
        } catch (err) {
          hideLoadingOverlay();
          document.querySelectorAll(".btn-save, .btn-cancel, .leader-select-single, .editable")
            .forEach(el => el.disabled = false);
          console.error("Save error:", err);
          showToast("Error saving squad. Check console.", "error");
        }
      }

      if (e.target.classList.contains("btn-cancel")) {
        tr.querySelector(".name").textContent = original.name || "";
        tr.querySelector(".category").textContent = original.category || "";
        tr.querySelector(".active").checked = !!original.active;
        tr.querySelector(".objective").textContent = original.objective || "";
        tr.querySelector(".created-by").textContent = original.createdBy || "";
        const sel = tr.querySelector(".leader-select-single");
        if (sel) sel.value = original.leader || "";
        tr.style.backgroundColor = "rgba(255,255,0,0.1)";
        setTimeout(() => (tr.style.backgroundColor = ""), 700);
      }
    });
  } catch (err) {
    console.error("Render Manage Table error:", err);
    showToast("⚠️ Failed to load manage view.", "error");
  }
}


 
  // =======================
  // Filter Bindings
  // =======================
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
      myToggle.addEventListener('change', e => {
        mySquadsOnly = e.target.checked;
        applyFilters();
      });

    if (searchBox)
      searchBox.addEventListener('input', applyFilters);
  }


// ============================================================
// 🔧 ADMIN FILTER INTEGRATION PATCH (resilient async-safe version)
// ============================================================
(() => {
  const MAX_WAIT = 5000; // 5 seconds timeout
  const INTERVAL = 200; // check every 200 ms
  let waited = 0;
  const timer = setInterval(() => {
    const el = document.getElementById('pu-admin-employee-select');
    if (el) {
      clearInterval(timer);
      wireAdminFilter(el);
    } else {
      waited += INTERVAL;
      if (waited >= MAX_WAIT) {
        clearInterval(timer);
        console.warn('[Admin Filter] Gave up waiting after 5s — dropdown never found.');
      }
    }
  }, INTERVAL);

  function wireAdminFilter(selectEl) {
    console.log('%c[Admin Filter] Dropdown found — wiring events...', 'color:lime; font-weight:bold;');
    selectEl.addEventListener('change', e => {
      const val = e.target.value || '';
      sessionStorage.setItem('pu.adminEmployeeFilter', val);
      console.debug('%c[Admin Filter] Changed →', 'color:lime; font-weight:bold;', val);
      document.dispatchEvent(new CustomEvent('powerup-admin-filter-change'));
    });

    const saved = sessionStorage.getItem('pu.adminEmployeeFilter');
    if (saved && saved !== selectEl.value) {
      selectEl.value = saved;
      console.debug('%c[Admin Filter] Restored previous value:', 'color:lime;', saved);
    }
  }
})();


  // When admin filter changes, reapply filters
document.addEventListener('powerup-admin-filter-change', applyFilters);


  // =======================
  // Page Init
  // =======================
  document.addEventListener('DOMContentLoaded', async () => {
    P.session?.requireLogin?.();
    P.layout.injectLayout();
    P.layout.setTitles('Squads');
    await P.session.initHeader();

    renderCategoryPills('All');
    await load();
    bindFilters?.();

    const myToggle = document.getElementById('myOnly');
    if (myToggle) {
      myToggle.checked = true;
      
    }
    applyFilters();

    const btnManage = document.getElementById('btn-manage');
    const btnAdd = document.getElementById('btn-add-squad');

    if (btnAdd)
      btnAdd.addEventListener('click', () => PowerUp.squadAddForm?.open?.());

// =======================
// Manage / Cards Toggle (stabilized layout switch)
// =======================
if (btnManage) {
  btnManage.addEventListener('click', async () => {
    const isManaging = btnManage.classList.toggle('managing');
    showViewSwitchOverlay(isManaging ? "Loading Manage View..." : "Loading Card View...");

    const cardsContainer = document.getElementById('cards');
    const msg = document.getElementById('s-msg');

    if (isManaging) {
      btnManage.textContent = 'View Cards';
      cardsContainer.classList.remove('cards-grid');
      cardsContainer.classList.add('manage-view');
      cardsContainer.style.display = 'block';
      if (msg) msg.style.display = 'none';
      await renderManageTable();
    } else {
      btnManage.textContent = 'Manage Squads';
      cardsContainer.classList.remove('manage-view');
      cardsContainer.classList.add('cards-grid');
      cardsContainer.style.display = 'grid';
      applyFilters(); // restore grid layout + filters
    }
  });
}

    document.getElementById('cat-pills')?.addEventListener('click', () => {
      const btnManage = document.getElementById('btn-manage');
      if (btnManage?.classList.contains('managing')) {
        btnManage.classList.remove('managing');
        btnManage.textContent = 'Manage Squads';
      }
    });
  });

  // =======================
  // Inline Styles (Unified Layout + Scroll)
  // =======================
  const style = document.createElement('style');
  style.textContent = `

/* =======================================
   GREEN CONTAINER SCROLL BEHAVIOR
======================================= */
.squad-container {
  flex: 1;
  background-color: var(--panel-bg, #062a24);
  border-radius: 12px;
  padding: 1rem;
  margin: 0 auto;
  overflow: auto;
  position: relative; /* 🟢 Add this line */
  max-height: calc(100vh - 220px);
  display: flex;
  flex-direction: column;
}

/* Custom scrollbars */
.squad-container::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.squad-container::-webkit-scrollbar-track {
  background: rgba(255,255,255,0.05);
  border-radius: 10px;
}
.squad-container::-webkit-scrollbar-thumb {
  background-color: #33FF99;
  border-radius: 10px;
  border: 2px solid rgba(0,0,0,0.3);
}
.squad-container::-webkit-scrollbar-thumb:hover {
  background-color: #50FFAA;
}

.squad-container::-webkit-scrollbar:horizontal {
  height: 10px;
}

/* =======================================
   CARD GRID — 4 Across
======================================= */
#cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.2rem;
  width: 100%;
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0;
  box-sizing: border-box;
}

.squad-card {
  height: 190px;
  background: #101a1a;
  border-left: 5px solid var(--accent, #33ff99);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #d7fbea;
  box-shadow: 0 0 8px rgba(0,0,0,0.3);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.squad-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 4px 10px rgba(0,0,0,0.4);
}

.squad-meta {
  font-size: 0.85rem;
  margin: 0;
  line-height: 1em;
  color: #aab;
}

.status-pill { padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; }
.status-on { background: rgba(51,255,153,0.1); color: #33ff99; }
.status-off { background: rgba(255,80,80,0.1); color: #ff5050; }
.member-chip { font-size: 0.8rem; color: #ffffff; margin-right: auto; }
.squad-foot { display: flex; justify-content: space-between; align-items: center;border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px; padding-top: 6px; }
.squad-link { color: #33ff99; text-decoration: none; font-size: 0.85rem; }
.squad-link:hover { text-decoration: underline; }

/* =======================================
   MANAGE TABLE
======================================= */
.manage-table-wrapper {
  overflow-x: auto;  /* ✅ horizontal scroll lives here */
  overflow-y: visible; /* keep vertical scroll unified in green container */
  width: 100%;
  height: auto;
  padding-bottom: 8px; /* avoids scrollbar overlap with shadow */
}

.squad-container:has(#cards.manage-view) {
  overflow: hidden !important;
}

.manage-table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  background: #0d1616;
  border: 1px solid rgba(51,255,153,0.1);
  border-radius: 8px;
  box-shadow: 0 0 8px rgba(0,0,0,0.4);
}


.manage-table td {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.manage-table th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #122020;
  color: #99ffcc;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-weight: 600;
  text-align: left;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4); /* adds nice separation when scrolling */
}

.manage-table-wrapper::-webkit-scrollbar {
  height: 10px;
}
.manage-table-wrapper::-webkit-scrollbar-track {
  background: rgba(255,255,255,0.05);
  border-radius: 10px;
}
.manage-table-wrapper::-webkit-scrollbar-thumb {
  background-color: #33ff99;
  border-radius: 10px;
  border: 2px solid rgba(0,0,0,0.3);
}
.manage-table-wrapper::-webkit-scrollbar-thumb:hover {
  background-color: #50ffaa;
}

/* Button Styles */
.btn-save, .btn-cancel {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  transition: all .2s;
}
.btn-save { color: #33ff99; border-color: #33ff99; }
.btn-save:hover { background: rgba(51,255,153,0.1); }
.btn-cancel { color: #ff8080; border-color: #ff5050; }
.btn-cancel:hover { background: rgba(255,80,80,0.1); }

/* =======================================
   SCROLLBAR STYLING
======================================= */
#cards::-webkit-scrollbar { width: 10px; }
#cards::-webkit-scrollbar-track { background: #0b1414; border-radius: 10px; }
#cards::-webkit-scrollbar-thumb {
  background-color: #33ff99;
  border-radius: 10px;
  border: 2px solid #0b1414;
}
#cards::-webkit-scrollbar-thumb:hover { background-color: #66ffc4; }

/* =======================================
   LOGO + MEDIA
======================================= */
.emoji-logo {
  width: 18px;
  height: 18px;
  filter: invert(52%) sepia(88%) saturate(3789%) hue-rotate(2deg)
    brightness(102%) contrast(101%);
  vertical-align: middle;
  margin-right: 6px;
}

@media (max-width: 1300px) {
  #cards { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 900px) {
  #cards { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  #cards { grid-template-columns: repeat(1, 1fr); }
}

/* =======================================
   TOAST + OVERLAYS
======================================= */
.pu-toast {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #0f1a1a;
  color: #9ff;
  border: 1px solid #33ff99;
  padding: 10px 18px;
  border-radius: 8px;
  opacity: 0;
  transition: opacity 0.4s ease;
  z-index: 10000;
}
.pu-toast.show { opacity: 1; }

.overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #9ff;
  z-index: 50;
}
.overlay-text {
  margin-top: 10px;
  color: #aefcd8;
  font-size: 0.9rem;
  text-align: center;
}
.spinner {
  width: 42px;
  height: 42px;
  border: 4px solid #33ff99;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* =======================================
   LEADER SELECT
======================================= */
.leader-select-single {
  width: 95%;
  max-width: 260px;
  padding: 4px 6px;
  border-radius: 6px;
  background: #0f1a1a;
  color: #cde;
  border: 1px solid #2a3d3d;
}
.leader-select-single:focus {
  outline: none;
  border-color: #33ff99;
  box-shadow: 0 0 4px rgba(51,255,153,0.3);
}

/* =======================================
   DYNAMIC VIEW SWITCH (Cards vs Manage)
======================================= */
#cards.cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.2rem;
  width: 100%;
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0;
  box-sizing: border-box;
}

#cards.manage-view {
  display: block;
  overflow: hidden;
  padding: 0;
}

.manage-table {
  min-width: 100%;
}


`;

  document.head.appendChild(style);

})(window.PowerUp);
