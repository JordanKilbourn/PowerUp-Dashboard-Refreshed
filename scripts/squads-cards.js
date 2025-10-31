// =============================================
// PowerUp: Squads Page – Stable Reconciled Build 5 (SRB5-Clean)
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
  // UI rendering
  // =======================
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
  // Data load
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
    const norm = s => String(s||'').trim().toLowerCase();
    let targetId = '';
    for (const [id, nm] of idToName.entries()) {
      if (norm(nm) === norm(sel)) { targetId = id; break; }
    }
    return { id: targetId, name: sel };
  } catch { return null; }
}


  
// =======================
// Filters (fixed MySquads logic)
// =======================
let activeCategory = 'All';
let activeOnly = false;
let mySquadsOnly = false;

  
function userIsMemberOrLeader(squad, session) {
  const myId   = String(session.employeeId || '').trim().toLowerCase();
  const myName = String(session.displayName || '').trim().toLowerCase();

  if (myId && String(squad.leaderId || '').trim().toLowerCase() === myId) return true;

  const sid = String(squad.id || '').trim();
  const entry = MEMBERS_BY_SQUAD.get(sid);
  if (entry) {
    if (myId && entry.ids.has(myId)) return true;
    if (myName && entry.names.has(myName)) return true;
  } else {
    const tokensLC = String(squad.members || '')
      .split(/[,;\n]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    if (myId && tokensLC.includes(myId)) return true;
    if (myName && tokensLC.includes(myName)) return true;
  }
  return false;
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
          const toks = String(s.members).split(/[,;\n]+/).map(t => norm(t));
          fallbackHit = (!!tgtId && toks.includes(tgtId)) || (!!tgtName && toks.includes(tgtName));
        }

        return leaderHit || memberHit || fallbackHit;
      });
    } else {
      list = list.filter(s => userIsMemberOrLeader(s, session));
    }
  }

  if (activeOnly) list = list.filter(s => isTrue(s.active));
  if (cat !== 'All') list = list.filter(s => s.category === cat);

if (q) {
  list = list.filter(s => {
    const sid = String(s.id || '').trim();

    // Get leaders for this squad
    const leaders = LEADERS_BY_SQUAD.get(sid) || [];
    const leaderNames = leaders.map(l => l.name || '').join(' ').toLowerCase();

    // Get members for this squad
    const members = MEMBERS_BY_SQUAD.get(sid);
    const memberNames = members
      ? [...members.names].join(' ').toLowerCase()
      : '';

    // Combine everything searchable
    const hay = [
      s.name,
      leaderNames,
      memberNames,
      s.leaderId,
      s.objective,
      s.notes
    ]
      .join(' ')
      .toLowerCase();

    return hay.includes(q);
  });
}

  renderCards(list);
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

  // =======================
// Manage Table Rendering (wider layout + fixed leader lookup)
// =======================
async function renderManageTable() {
  const cardsContainer = document.getElementById('cards');
  const msg = document.getElementById('s-msg');
  if (msg) msg.style.display = 'none';

  // Loading overlay
  cardsContainer.innerHTML = `
    <div class="overlay">
      <div class="spinner"></div>
      <div class="overlay-text">Loading Manage View...</div>
    </div>`;

  try {
    // Fetch full SQUADS sheet (to keep row IDs) and lightweight members list
    const [squadSheet, members] = await Promise.all([
      P.api.fetchSheet(SHEETS.SQUADS, { force: true }),
      P.api.getRowsByTitle(SHEETS.SQUAD_MEMBERS, { force: true })
    ]);

    // Convert to title-based rows but attach Smartsheet's internal rowId
    const squads = P.api.rowsByTitle(squadSheet).map((r, i) => ({
      ...r,
      __rowId: squadSheet.rows[i]?.id || ''
    }));

    // Load employees for leader dropdown
    const allEmps = await P.getEmployees();

    // Normalize all squad IDs to uppercase for consistent lookups
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

    // Create table
    const table = document.createElement('table');
    table.className = 'manage-table';
    table.innerHTML = `
<thead>
  <tr>
    <th style="width:7%">ID</th>
    <th style="width:22%">Squad Name</th>
    <th style="width:14%">Category</th>
    <th style="width:8%">Active</th>
    <th style="width:24%">Objective</th>
    <th style="width:15%">Leader</th>
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
            <tr data-rowid="${sheetRowId}" data-squadid="${squadId}" data-original='${JSON.stringify(rowData)}'>
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
cardsContainer.appendChild(wrapper);

    // --- Save + Cancel Handlers ---
    table.addEventListener("click", async e => {
      const tr = e.target.closest("tr[data-rowid]");
      if (!tr) return;

      const rowId = tr.dataset.rowid;
      const original = JSON.parse(tr.dataset.original || "{}");

      // ===== SAVE =====
      if (e.target.classList.contains("btn-save")) {
        const name = tr.querySelector(".name")?.textContent.trim();
        const category = tr.querySelector(".category")?.textContent.trim();
        const active = tr.querySelector(".active")?.checked;
        const objective = tr.querySelector(".objective")?.textContent.trim();
        const createdBy = tr.querySelector(".created-by")?.textContent.trim();
        const leaderName = tr.querySelector(".leader-select-single")?.value;

        const leaderEmp = allEmps.find(e => e.name === leaderName);
        const squadId = tr.dataset.squadid;
        const currentLeader = leaderEmp ? leaderEmp.name : leaderName;

        // 🧭 Compare current values with the original snapshot
        const hasChanges =
          name !== original.name ||
          category !== original.category ||
          active !== original.active ||
          objective !== original.objective ||
          createdBy !== original.createdBy ||
          currentLeader !== original.leader;

        if (!hasChanges) {
          showToast("No changes detected — nothing to save.", "info");
          return;
        }

        if (!leaderName) {
          showToast("Select a leader before saving.", "warn");
          return;
        }

        try {
          // 🔒 Disable UI and show spinner
          document.querySelectorAll(".btn-save, .btn-cancel, .leader-select-single, .editable")
            .forEach(el => el.disabled = true);
          showLoadingOverlay("Saving squad changes...");

          // ✅ 1. Update SQUADS sheet info
          await P.api.updateRowById(P.api.SHEETS.SQUADS, rowId, {
            "Squad Name": name,
            "Category": category,
            "Active": active,
            "Objective": objective,
            "Created By": createdBy
          });

          // ✅ 2. Update SQUAD_MEMBERS sheet (Leader)
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

          // 🔁 Re-render table to sync new values and snapshots
          await renderManageTable();

        } catch (err) {
          hideLoadingOverlay();
          document.querySelectorAll(".btn-save, .btn-cancel, .leader-select-single, .editable")
            .forEach(el => el.disabled = false);
          console.error("Save error:", err);
          showToast("Error saving squad. Check console.", "error");
        }
      }

      // ===== CANCEL =====
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
    console.error("renderManageTable error:", err);
    showToast("Failed to load Manage Squads table.", "error");
  }
}


// =======================
// Filter Binding
// =======================
function bindFilters() {
  const catWrap = document.getElementById('cat-pills');
  const activeToggle = document.getElementById('activeOnly');
  const myToggle = document.getElementById('myOnly');
  const searchBox = document.getElementById('search');

  // Category filters
  if (catWrap) {
    catWrap.addEventListener('click', e => {
      const btn = e.target.closest('button[data-cat]');
      if (!btn) return;
      document.querySelectorAll('.pill-cat').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  }

  // "Active Only" checkbox
  if (activeToggle) {
    activeToggle.addEventListener('change', applyFilters);
  }

  // "My Squads" checkbox
  if (myToggle) {
    myToggle.addEventListener('change', applyFilters);
  }

  // Search box
  if (searchBox) {
    searchBox.addEventListener('input', () => {
      // Slight delay for smoother typing
      clearTimeout(searchBox._t);
      searchBox._t = setTimeout(applyFilters, 200);
    });
  }

  // Admin filter (dropdown) — reapply when changed
  document.addEventListener('powerup-admin-filter-change', applyFilters);
}

// =======================
// Page Init
// =======================
document.addEventListener('DOMContentLoaded', async () => {
  P.session.requireLogin();
  P.layout.injectLayout();
  P.layout.setPageTitle('Squads');
  await P.session.initHeader();
  
  IS_ADMIN = !!(P.auth && P.auth.isAdmin && P.auth.isAdmin());

  renderCategoryPills('All');
  await load();
  bindFilters();

  // Auto-enable "My Squads"
  const myToggle = document.getElementById('myOnly');
  if (myToggle) {
    myToggle.checked = true;
    mySquadsOnly = true;
  }
  applyFilters();

  const btnManage = document.getElementById('btn-manage');
  const btnAdd = document.getElementById('btn-add-squad');
  if (btnAdd) btnAdd.addEventListener('click', () => PowerUp.squadAddForm?.open?.());
  if (btnManage) {
    btnManage.addEventListener('click', async () => {
      const isManaging = btnManage.classList.toggle('managing');
      if (isManaging) {
        btnManage.textContent = 'View Cards';
        await renderManageTable();
      } else {
        btnManage.textContent = 'Manage Squads';
        document.getElementById('s-msg').style.display = 'none';
        const myToggle = document.getElementById('myOnly');
        if (myToggle) mySquadsOnly = myToggle.checked;
        applyFilters();
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


  // ==============================
// Restrict buttons to admins only
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  const isAdmin = P.auth?.isAdmin?.() || false;
  const addBtn = document.getElementById("btn-add-squad");
  const manageBtn = document.getElementById("btn-manage");

  if (!isAdmin) {
    // Hide buttons entirely for non-admin users
    if (addBtn) addBtn.style.display = "none";
    if (manageBtn) manageBtn.style.display = "none";
  }
});

// =======================
// Inline Styles — unified scroll + sticky headers + restored styling
// =======================
const style = document.createElement('style');
style.textContent = `

/* ==============================================
   SCROLL BEHAVIOR — only the big green container scrolls
   ============================================== */

#pu-content, .squads-scroll, .page-content {
  overflow: hidden !important; /* No scrolling outside green zone */
  height: 100%;
  max-height: 100vh;
}

/* Green container handles scrolling */
#cards {
  display: block;
  width: 100%;
  height: calc(100vh - 250px);
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 14px;
  padding-bottom: 20px;
}

/* ==============================================
   SQUAD CARDS
   ============================================== */
.squad-card {
  background: #101a1a;
  border-left: 5px solid var(--accent, #33ff99);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 0 8px rgba(0,0,0,0.3);
  transition: transform .2s ease, box-shadow .2s ease;
}
.squad-card:hover { transform: translateY(-3px); box-shadow: 0 0 12px rgba(51,255,153,0.4); }

/* ==============================================
   MANAGE TABLE
   ============================================== */
.manage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  background: #0d1616;
  border: 1px solid rgba(51,255,153,0.1);
  border-radius: 8px;
  box-shadow: 0 0 8px rgba(0,0,0,0.4);
}

/* Sticky header — sticks inside #cards scrolling */
.manage-table th {
  position: sticky;
  top: 0;
  background: #122020;
  color: #99ffcc;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  z-index: 20;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  text-align: left;
}

/* Table cells */
.manage-table th, .manage-table td {
  padding: 10px 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  vertical-align: middle;
}

/* Column widths — reduced slightly for balance */
.manage-table th:nth-child(1), .manage-table td:nth-child(1) { width: 70px; text-align: center; }  /* ID */
.manage-table th:nth-child(2), .manage-table td:nth-child(2) { width: 170px; }                     /* Squad Name */
.manage-table th:nth-child(3), .manage-table td:nth-child(3) { width: 110px; text-align: center; } /* Category */
.manage-table th:nth-child(4), .manage-table td:nth-child(4) { width: 70px; text-align: center; }  /* Active */
.manage-table th:nth-child(5), .manage-table td:nth-child(5) { width: 240px; }                     /* Objective */
.manage-table th:nth-child(6), .manage-table td:nth-child(6) { width: 200px; }                     /* Leader */
.manage-table th:nth-child(7), .manage-table td:nth-child(7) { width: 140px; }                     /* Created By */
.manage-table th:nth-child(8), .manage-table td:nth-child(8) { width: 140px; text-align: center; } /* Actions */

.manage-table tbody tr:nth-child(even) { background: rgba(255,255,255,0.02); }
.manage-table tbody tr:hover { background: rgba(51,255,153,0.08); }

/* ==============================================
   BUTTONS (Save / Cancel)
   ============================================== */
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

/* Stack buttons vertically when screen is narrow */
@media (max-width: 1300px) {
  .actions-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .btn-save, .btn-cancel {
    width: 100%;
    text-align: center;
  }
}

/* ==============================================
   LEADER DROPDOWN RESTORE
   ============================================== */
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

/* ==============================================
   SCROLLBAR STYLING
   ============================================== */
#cards::-webkit-scrollbar { width: 10px; }
#cards::-webkit-scrollbar-track { background: #0b1414; border-radius: 10px; }
#cards::-webkit-scrollbar-thumb {
  background-color: #33ff99;
  border-radius: 10px;
  border: 2px solid #0b1414;
}
#cards::-webkit-scrollbar-thumb:hover { background-color: #66ffc4; }

/* ==============================================
   MISC
   ============================================== */
.emoji-logo {
  width: 18px;
  height: 18px;
  filter: invert(52%) sepia(88%) saturate(3789%) hue-rotate(2deg)
    brightness(102%) contrast(101%);
  vertical-align: middle;
  margin-right: 6px;
}
`;
document.head.appendChild(style);


})(window.PowerUp);

