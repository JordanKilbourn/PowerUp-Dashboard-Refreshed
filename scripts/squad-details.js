// scripts/squad-details.js
// Squad Details page: summary cards + members (left) + activities (right)
// Includes compact Members table styles + Back / Add Member actions

(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

  // ---------- tiny utils ----------
  const norm = (s) => String(s || "").trim();
  const lc = (s) => norm(s).toLowerCase();
  const dash = (v) => (v == null || norm(v) === "" ? "-" : String(v));
  const isTrue = (v) => v === true || /^(true|yes|y|1|active)$/i.test(String(v ?? "").trim());

  function pick(row, candidates, d = "") {
    for (const k of candidates) if (row && row[k] != null && String(row[k]).trim() !== "") return row[k];
    return d;
  }

  // Column hints (be tolerant of sheet titles)
  const SQ_COL = {
    id:      ['Squad ID','ID'],
    name:    ['Squad Name','Squad','Name','Team'],
    leader:  ['Squad Leader','Leader Employee ID','Leader Position ID','Leader'],
    cat:     ['Category','Squad Category'],
    obj:     ['Objective','Focus','Purpose'],
    active:  ['Active','Is Active?'],
    created: ['Created Date','Start Date','Started'],
    notes:   ['Notes','Description']
  };

  const SM_COL = {
    squadId:  ['Squad ID','SquadID','Squad'],
    empId:    ['Employee ID','EmployeeID','Position ID'],
    empName:  ['Employee Name','Name','Display Name'],
    role:     ['Role','Member Role'],
    active:   ['Active','Is Active?'],
    start:    ['Start Date','Joined','Start']
  };

  const EM_COL = { id: ['Position ID','Employee ID'], name: ['Display Name','Employee Name','Name'] };

  // ---------- page-scoped CSS (compact members list) ----------
  function injectLocalStyles() {
    if (document.getElementById('sqd-local-css')) return;
    const css = `
      /* Smaller font & tighter rows just for the Members table */
      #sq-members .table { font-size: 12.5px; line-height: 1.25; }
      #sq-members .table th, #sq-members .table td { padding: 6px 8px; }

      /* Make the members pane scroll independently so rows never get cut off */
      #sq-members .table-wrap { max-height: 58vh; overflow: auto; }

      /* Keep activities visually balanced too (optional, subtle) */
      #sq-activities .table { font-size: 13px; }
      #sq-activities .table th, #sq-activities .table td { padding: 7px 9px; }

      /* Ensure columns align to top, not stretch */
      .grid-2 { align-items: start; }
      @media (max-width: 1100px){
        #sq-members .table { font-size: 12px; }
      }
    `;
    const s = document.createElement('style');
    s.id = 'sqd-local-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ---------- layout helpers ----------
  function topActionsHTML(canManage) {
    return `
      <div class="sq-actions" style="display:flex;gap:8px;justify-content:flex-end;margin:0 0 8px 0;">
        <button id="btnBack" class="btn btn-xs"
          style="padding:6px 10px;border:1px solid #2a354b;background:#0b1328;color:#e5e7eb;border-radius:8px;">
          <i class="fa fa-arrow-left"></i> Back
        </button>
        ${canManage ? `
        <button id="btnAddMember" class="btn btn-xs"
          style="padding:6px 10px;border:1px solid #2a354b;background:#0b1328;color:#e5e7eb;border-radius:8px;">
          <i class="fa fa-user-plus"></i> Add Member
        </button>` : ``}
      </div>
    `;
  }

  function summaryCardsHTML(sq, leaderName) {
    return `
      <div class="cards-row" style="display:grid;grid-template-columns:1.2fr 1fr 0.9fr;gap:10px;margin-bottom:8px;">
        <div class="card" style="padding:12px 14px;">
          <div class="card-title" style="color:#9ffbe6;font-weight:700;">Squad</div>
          <div><b>Name:</b> ${dash(sq.name)}</div>
          <div><b>Leader:</b> ${dash(leaderName || sq.leaderId)}</div>
          <div><b>Status:</b> ${isTrue(sq.active)
            ? '<span class="pill pill--green">Active</span>'
            : '<span class="pill pill--red">Inactive</span>'}</div>
          <div><b>Category:</b> ${dash(sq.cat)}</div>
          <div><b>Created:</b> ${dash(sq.created)}</div>
        </div>

        <div class="card" style="padding:12px 14px;">
          <div class="card-title" style="color:#9ffbe6;font-weight:700;">Objective</div>
          <div>${dash(sq.obj)}</div>
        </div>

        <div class="card" style="padding:12px 14px;">
          <div class="card-title" style="color:#9ffbe6;font-weight:700;">Notes</div>
          <div>${dash(sq.notes)}</div>
        </div>
      </div>
    `;
  }

  function chipsRowHTML({ completedHours = 0 } = {}) {
    return `
      <div style="display:flex;gap:8px;margin:0 0 10px 0;">
        <span class="chip" title="Sum of completed Power Hours linked to this squad"
          style="display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid #2a354b;background:#0b1328;color:#e5e7eb;">
          <i class="fa fa-bolt"></i>
          <span>Completed PH Hours</span>
          <b style="background:#192542;padding:2px 8px;border-radius:999px;">${completedHours}</b>
        </span>
      </div>
    `;
  }

  function twoColShellHTML() {
    return `
      <div class="grid-2" style="display:grid;grid-template-columns:360px 1fr;gap:12px;">
        <section id="sq-members" class="card" style="padding:10px;">
          <h3 style="margin:0 0 8px 0;">Members</h3>
          <div class="table-wrap">
            <table class="table" style="width:100%;">
              <thead><tr>
                <th>Name</th><th>Role</th><th>Status</th><th>Start</th>
              </tr></thead>
              <tbody id="sq-members-body"><tr><td colspan="4" style="opacity:.7;text-align:center;">Loading…</td></tr></tbody>
            </table>
          </div>
        </section>

        <section id="sq-activities" class="card" style="padding:10px;">
          <h3 style="margin:0 0 8px 0;">Squad Activities</h3>
          <div class="table-wrap">
            <table class="table" style="width:100%;">
              <thead><tr>
                <th>Title</th><th>Type</th><th>Status</th><th>Dates</th><th>Owner</th><th>Participants</th><th>Completed PH</th>
              </tr></thead>
              <tbody id="sq-acts-body"><tr><td colspan="7" style="opacity:.7;text-align:center;">No activities yet</td></tr></tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  }

  // ---------- data helpers ----------
  async function loadLookupMaps() {
    const em = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    const idToName = new Map();
    em.forEach(r => {
      const id = norm(pick(r, EM_COL.id, ""));
      const nm = norm(pick(r, EM_COL.name, ""));
      if (id) idToName.set(id, nm);
    });
    return { idToName };
  }

  function findSquad(rows, { id, name }) {
    const idLC = lc(id);
    const nameLC = lc(name);
    return rows.find(r => lc(pick(r, SQ_COL.id)) === idLC) ||
           rows.find(r => lc(pick(r, SQ_COL.name)) === nameLC) ||
           null;
  }

  function shapeSquad(row) {
    return {
      id:      norm(pick(row, SQ_COL.id, "")),
      name:    norm(pick(row, SQ_COL.name, "")),
      leaderId:norm(pick(row, SQ_COL.leader, "")),
      cat:     norm(pick(row, SQ_COL.cat, "")),
      obj:     norm(pick(row, SQ_COL.obj, "")),
      active:  pick(row, SQ_COL.active, ""),
      created: norm(pick(row, SQ_COL.created, "")),
      notes:   norm(pick(row, SQ_COL.notes, ""))
    };
  }

  async function computeCompletedHoursForSquad(squadName) {
    try {
      const ph = await getRowsByTitle(SHEETS.POWER_HOURS);
      let sum = 0;
      ph.forEach(r => {
        const completed = isTrue(r['Completed'] || r['Complete']);
        const hours = parseFloat(String(r['Completed Hours'] || r['Hours'] || "0").replace(/[^0-9.]/g, "")) || 0;
        const squad = String(r['Squad'] || r['Team'] || '').trim().toLowerCase();
        if (completed && squad && squad === squadName.toLowerCase()) sum += hours;
      });
      return Math.round(sum * 10) / 10;
    } catch { return 0; }
  }

  // ---------- renderers ----------
  function renderMembers(tbody, members, idToName) {
    if (!tbody) return;
    if (!members.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="opacity:.7;text-align:center;">No members</td></tr>`;
      return;
    }
    tbody.innerHTML = members.map(m => {
      const nm = norm(m.name || idToName.get(m.id) || m.id || "-");
      const role = dash(m.role);
      const st = isTrue(m.active) ? '<span class="pill pill--green">Active</span>' : '<span class="pill pill--red">Inactive</span>';
      const start = dash(m.start);
      return `<tr><td>${nm}</td><td>${role}</td><td>${st}</td><td>${start}</td></tr>`;
    }).join('');
  }

  // Placeholder (read-only for now)
  function renderActivitiesPlaceholder() {
    const tb = document.getElementById('sq-acts-body');
    if (!tb) return;
    tb.innerHTML = `<tr><td colspan="7" style="opacity:.7;text-align:center;">No activities yet</td></tr>`;
  }

  // ---------- main ----------
  document.addEventListener('DOMContentLoaded', async () => {
    // guards + shell
    P.session.requireLogin();
    P.layout.injectLayout();
    await P.session.initHeader();
    P.layout.setPageTitle('Squad Details');

    // add local styles to shrink/contain the members list
    injectLocalStyles();

    const content = document.getElementById('pu-content');
    if (!content) return;

    // Which squad?
    const url = new URL(location.href);
    const qId   = url.searchParams.get('id') || '';
    const qName = url.searchParams.get('name') || '';

    // Load data
    const [sqRows, smRows, { idToName }] = await Promise.all([
      getRowsByTitle(SHEETS.SQUADS),
      getRowsByTitle(SHEETS.SQUAD_MEMBERS),
      loadLookupMaps()
    ]);

    const raw = findSquad(sqRows, { id: qId, name: qName });
    if (!raw) {
      content.innerHTML = `<div class="card" style="padding:14px;">Squad not found.</div>`;
      return;
    }
    const squad = shapeSquad(raw);
    const leaderName = idToName.get(squad.leaderId) || '';

    // Permissions
    const isAdmin = !!(P.auth && P.auth.isAdmin && P.auth.isAdmin());
    const me = P.session.get() || {};
    let canManage = isAdmin || (lc(squad.leaderId) === lc(me.employeeId));
    try {
      if (P.auth?.canManageSquad) canManage = await P.auth.canManageSquad(String(squad.id || ''));
    } catch {}

    // Members for this squad
    const members = smRows
      .filter(r => lc(pick(r, SM_COL.squadId)) === lc(squad.id) || lc(pick(r, SM_COL.squadId)) === lc(squad.name))
      .map(r => ({
        id:    norm(pick(r, SM_COL.empId, "")),
        name:  norm(pick(r, SM_COL.empName, "")),
        role:  norm(pick(r, SM_COL.role, "Member")),
        active: pick(r, SM_COL.active, "true"),
        start: norm(pick(r, SM_COL.start, ""))
      }))
      .sort((a,b) => (a.role === b.role ? (a.name || '').localeCompare(b.name || '') : a.role.localeCompare(b.role)));

    // Completed PH hours chip
    const completedPH = await computeCompletedHoursForSquad(squad.name);

    // Render
    content.innerHTML = `
      ${topActionsHTML(canManage)}
      ${summaryCardsHTML(squad, leaderName)}
      ${chipsRowHTML({ completedHours: completedPH })}
      ${twoColShellHTML()}
    `;

    // Wire actions
    (function wireTopActions(){
      const back = document.getElementById('btnBack');
      if (back && !back.dataset.bound) {
        back.dataset.bound = '1';
        back.addEventListener('click', () => {
          if (document.referrer && /squads\.html/i.test(document.referrer)) history.back();
          else location.href = 'squads.html';
        });
      }

      const add = document.getElementById('btnAddMember');
      if (add && !add.dataset.bound) {
        add.dataset.bound = '1';
        add.addEventListener('click', () => {
          if (typeof window.openAddMemberModal === 'function') return window.openAddMemberModal(squad);
          if (window.PowerUp?.squads?.openAddMemberModal)    return window.PowerUp.squads.openAddMemberModal(squad);
          document.dispatchEvent(new CustomEvent('squad-add-member-request', { detail: { squad } }));
        });
      }
    })();

    // Fill members + activities
    renderMembers(document.getElementById('sq-members-body'), members, idToName);
    renderActivitiesPlaceholder();
  });

  window.PowerUp = P;
})(window.PowerUp || {});
