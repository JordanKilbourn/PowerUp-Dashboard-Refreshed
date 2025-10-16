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
  const SM_COL = {
    squadId:   ['Squad ID','SquadID','Squad'],
    empId:     ['Employee ID','EmployeeID','Position ID'],
    empName:   ['Employee Name','Name','Display Name'],
    active:    ['Active','Is Active?'],
  };

  const CATS = ['All','CI','Quality','Safety','Training','Other'];
  const CAT_CLASS = {
    CI: 'cat-ci',
    Quality: 'cat-quality',
    Safety: 'cat-safety',
    Training: 'cat-training',
    Other: 'cat-other'
  };

  const pick = (row, list, d='') => { for (const k of list) if (row[k]!=null && row[k]!=='') return row[k]; return d; };
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
    return String(text || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  }

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

  const MEMBERS_BY_SQUAD = new Map();
  const LEADERS_BY_SQUAD = new Map();

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

      let leaderLine = dash(sq.leaderName || sq.leaderId);
      const leaders = LEADERS_BY_SQUAD.get(String(sq.id || '').trim());
      if (leaders && leaders.length) {
        const names = leaders
          .map(x => (x.name || idToName.get(x.id) || x.id || '').toString().trim())
          .filter(Boolean)
          .sort((a,b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        if (names.length === 1) {
          leaderLine = names[0];
        } else if (names.length === 2) {
          leaderLine = `${names[0]}, ${names[1]}`;
        } else if (names.length > 2) {
          leaderLine = `${names[0]}, ${names[1]} +${names.length - 2} more`;
        }
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
        </div>
      `;
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
      const norm = s => String(s||'').trim().toLowerCase();
      let targetId = '';
      for (const [id, nm] of idToName.entries()) {
        if (norm(nm) === norm(sel)) { targetId = id; break; }
      }
      return { id: targetId, name: sel };
    } catch { return null; }
  }

  async function applyFilters() {
    const session   = P.session.get();
    const cat       = document.querySelector('.pill-cat.active')?.dataset.cat || 'All';
    let   myOnly    = document.getElementById('myOnly')?.checked;
    const activeOnly= document.getElementById('activeOnly')?.checked;
    const q         = (document.getElementById('search')?.value || '').trim().toLowerCase();

    let list = ALL.slice();

    if (myOnly) {
      if (IS_ADMIN) {
        let target = await getAdminTargetFromFilter();
        if (!target) target = { id: String(session.employeeId||'').trim(), name: String(session.displayName||'').trim() };

        const norm = s => String(s||'').trim().toLowerCase();
        const tgtId = norm(target.id);
        const tgtName = norm(target.name);

        list = list.filter(s => {
          const leaders = LEADERS_BY_SQUAD.get(String(s.id||'').trim()) || [];
          const leaderHit = leaders.some(x => norm(x.id) === tgtId || norm(x.name) === tgtName);

          const m = MEMBERS_BY_SQUAD.get(String(s.id||'').trim());
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

    if (activeOnly)  list = list.filter(s => isTrue(s.active));
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

    MEMBERS_BY_SQUAD.clear();
    LEADERS_BY_SQUAD.clear();
    try {
      if (SHEETS.SQUAD_MEMBERS) {
        const smRows = await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
        smRows.forEach(r => {
          const active = isTrue(pick(r, SM_COL.active, 'true'));
          if (!active) return;
          const sid  = pick(r, SM_COL.squadId, '').toString().trim();
          if (!sid) return;

          const eid  = pick(r, SM_COL.empId, '').toString().trim();
          const enm  = (pick(r, SM_COL.empName, '') || idToName.get(eid) || '').toString().trim();
          const role = String(r['Role'] || '').trim().toLowerCase();

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
      }
    } catch (_) {}

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
    document.addEventListener('powerup-admin-filter-change', applyFilters);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    P.session.requireLogin();
    P.layout.injectLayout();

    const isAdminFn = P.auth && P.auth.isAdmin;
    IS_ADMIN = !!(isAdminFn && isAdminFn());
    P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');

    await P.session.initHeader();
    wireUI();

    const activeOnly = document.getElementById('activeOnly');
    if (activeOnly) activeOnly.checked = false;

    await load();
    applyFilters();
  });

  // ==============================
  // Add Squad Button (existing)
  // ==============================
  document.getElementById("btn-add-squad")?.addEventListener("click", () => {
    if (PowerUp.squadAddForm && typeof PowerUp.squadAddForm.open === "function") {
      PowerUp.squadAddForm.open();
    } else {
      console.warn("⚠️ PowerUp.squadAddForm not ready");
    }
  });

  document.addEventListener("squad-added", async () => {
    if (typeof PowerUp.squads?.refresh === "function") {
      await PowerUp.squads.refresh();
    } else {
      location.reload();
    }
  });



  
// === MANAGE SQUADS FEATURE ===
document.addEventListener("DOMContentLoaded", () => {
  // Wait for layout to fully inject before binding
  const waitForManageBtn = setInterval(() => {
    const manageBtn = document.getElementById("btn-manage");
    if (manageBtn) {
      clearInterval(waitForManageBtn);
      console.log("✅ ManageSquadsFeature initialized after layout load");
      initManageSquadsFeature(manageBtn);
    }
  }, 300);

  function initManageSquadsFeature(manageBtn) {
    const cardsView = document.getElementById("cards");
    const manageView = document.createElement("div");
    manageView.id = "squad-management-view";
    manageView.style.display = "none";
    manageView.style.overflowY = "auto";
    manageView.style.maxHeight = "70vh";
    cardsView.parentNode.insertBefore(manageView, cardsView.nextSibling);

    let isTableView = false;

  manageBtn?.addEventListener("click", async () => {
    if (!window.PowerUp.auth?.isAdmin?.()) {
      window.PowerUp.ui?.toast?.("You do not have permission to manage squads.", "error");
      return;
    }

    isTableView = !isTableView;
    manageBtn.textContent = isTableView ? "Back to Cards" : "Manage Squads";
    cardsView.style.display = isTableView ? "none" : "grid";
    manageView.style.display = isTableView ? "block" : "none";

    if (isTableView) {
      const overlay = showOverlay("Loading squads...");
      try {
        const squads = await PowerUp.api.getRowsByTitle("SQUADS", { force: true });
        renderSquadTable(squads);
      } catch (err) {
        console.error("Error loading squads:", err);
        PowerUp.ui?.toast?.("Failed to load squads.", "error");
      } finally {
        hideOverlay();
      }
    }
  });

  function showOverlay(text = "Loading...") {
    let overlay = document.getElementById("manageOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "manageOverlay";
      overlay.innerHTML = `
        <div class="manage-overlay-spinner">
          <div class="spinner"></div>
          <div>${text}</div>
        </div>`;
      document.body.appendChild(overlay);
    }
    overlay.style.display = "flex";
    return overlay;
  }

  function hideOverlay() {
    const overlay = document.getElementById("manageOverlay");
    if (overlay) overlay.style.display = "none";
  }

  async function renderSquadTable(squads) {
    if (!Array.isArray(squads) || squads.length === 0) {
      manageView.innerHTML = `<div style="padding:16px;opacity:.7;">No squads available.</div>`;
      return;
    }

    const table = document.createElement("table");
    table.className = "manage-table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Squad ID</th>
          <th>Squad Name</th>
          <th>Category</th>
          <th>Leader</th>
          <th>Active</th>
          <th>Objective</th>
          <th>Created By</th>
          <th>Created Date</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${squads.map(r => `
          <tr data-id="${r["Squad ID"] || ""}" data-rowid="${r.id || ""}">
            <td>${r["Squad ID"] || "-"}</td>
            <td contenteditable="true" data-original="${r["Squad Name"] || ""}">${r["Squad Name"] || ""}</td>
            <td contenteditable="true" data-original="${r["Category"] || ""}">${r["Category"] || ""}</td>
            <td contenteditable="true" data-original="${r["Leader"] || ""}">${r["Leader"] || ""}</td>
            <td><input type="checkbox" ${r["Active"] ? "checked" : ""} data-original="${r["Active"] ? "true" : "false"}"></td>
            <td contenteditable="true" data-original="${r["Objective"] || ""}">${r["Objective"] || ""}</td>
            <td contenteditable="true" data-original="${r["Created By"] || ""}">${r["Created By"] || ""}</td>
            <td>${r["Created Date"] || "-"}</td>
            <td class="actions-cell">
              <button class="btn save-btn">Save</button>
              <button class="btn cancel-btn">Cancel</button>
            </td>
          </tr>`).join("")}
      </tbody>
    `;
    manageView.innerHTML = "";
    manageView.appendChild(table);

    // === Save logic ===
    manageView.querySelectorAll(".save-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const tr = e.target.closest("tr");
        const rowId = tr.dataset.rowid;
        const name = tr.children[1].textContent.trim();
        const category = tr.children[2].textContent.trim();
        const leader = tr.children[3].textContent.trim();
        const active = tr.children[4].querySelector("input").checked;
        const objective = tr.children[5].textContent.trim();
        const createdBy = tr.children[6].textContent.trim();

        const overlay = showOverlay("Saving changes...");
        try {
          await PowerUp.api.updateRowById("SQUADS", rowId, {
            "Squad Name": name,
            "Category": category,
            "Leader": leader,
            "Active": active,
            "Objective": objective,
            "Created By": createdBy,
          });

          // update the "original" data values after save
          tr.querySelectorAll("[data-original]").forEach(cell => {
            cell.dataset.original = cell.textContent.trim();
          });
          const chk = tr.querySelector("input[type=checkbox]");
          if (chk) chk.dataset.original = chk.checked ? "true" : "false";

          tr.style.background = "rgba(0,255,128,0.1)";
          PowerUp.ui?.toast?.(`✅ Squad "${name}" updated successfully.`);
        } catch (err) {
          console.error("Update failed:", err);
          PowerUp.ui?.toast?.("Error updating squad. See console.", "error");
        } finally {
          hideOverlay();
          setTimeout(() => (tr.style.background = ""), 1200);
        }
      });
    });

    // === Cancel logic ===
    manageView.querySelectorAll(".cancel-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const tr = e.target.closest("tr");
        tr.querySelectorAll("[data-original]").forEach(cell => {
          cell.textContent = cell.dataset.original;
        });
        const chk = tr.querySelector("input[type=checkbox]");
        if (chk) chk.checked = chk.dataset.original === "true";
        tr.style.transition = "background-color 0.4s ease";
        tr.style.backgroundColor = "rgba(255,255,0,0.1)";
        setTimeout(() => (tr.style.backgroundColor = ""), 800);
      });
    });
  }

  // === Styles for Manage Table & Overlay ===
  const style = document.createElement("style");
  style.textContent = `
    #manageOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 3000;
    }
    .manage-overlay-spinner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      background: #0f1b1b;
      border: 1px solid var(--accent, #00f08e);
      padding: 22px 26px;
      border-radius: 12px;
      color: #d9e6e6;
      font-weight: 600;
    }
    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid #00f08e;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .manage-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 13px;
    }
    .manage-table th,
    .manage-table td {
      border: 1px solid #2d3f3f;
      padding: 8px 10px;
    }
    .manage-table th {
      background: #0f1a1a;
      color: #9ffbe6;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 12px;
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: 0 2px 6px rgba(0,0,0,0.6);
    }
    .manage-table td[contenteditable="true"] {
      background: #101f1f;
    }
    .actions-cell {
      display: flex;
      gap: 8px;
      justify-content: center;
    }
    .actions-cell .btn {
      min-width: 70px;
      padding: 4px 10px;
    }
  `;
  document.head.appendChild(style);
});


  window.PowerUp = P;
})(window.PowerUp || {});
