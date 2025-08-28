// scripts/squad-details.js
(function (PowerUp) {
  const P = (window.PowerUp = PowerUp || {});
  const { SHEETS, getRowsByTitle } = P.api;

  // Smartsheet forms (members required; activities optional)
  const SQUAD_MEMBER_FORM_URL   = "https://app.smartsheet.com/b/form/fc4952f03a3c4e85a548d492c848b536";
  const SQUAD_ACTIVITY_FORM_URL = ""; // optional; paste if/when you make an Activities form

  // helpers
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[m]));
  const fmtDate = (v) => {
    if (!v) return "-";
    const d = new Date(v); if (isNaN(d)) return esc(v);
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const yy = d.getFullYear();
    return `${mm}/${dd}/${yy}`;
  };
  const isTrue = (v) => v === true || /^(true|yes|y|checked|1)$/i.test(String(v ?? "").trim());
  const byId = (x) => document.getElementById(x);
  const qparam = (k) => new URL(location.href).searchParams.get(k) || "";
  const IS_ADMIN = !!(P.auth && P.auth.isAdmin && P.auth.isAdmin());

  function normalizeEmployees(rows) {
    const m = new Map();
    rows.forEach(r => {
      const id = String(r["Position ID"] || r["Employee ID"] || "").trim();
      if (!id) return;
      m.set(id, {
        id,
        name: String(r["Display Name"] || r["Employee Name"] || "").trim() || id,
        dept: String(r["Department"] || "").trim()
      });
    });
    return m;
  }
  function normSquad(r){
    return {
      id:        String(r["Squad ID"] || r["ID"] || "").trim(),
      name:      String(r["Squad Name"] || r["Name"] || "").trim(),
      category:  String(r["Category"] || "").trim(),
      leaderId:  String(r["Squad Leader"] || "").trim(),
      active:    String(r["Active"] || "").trim(),
      objective: String(r["Objective"] || "").trim(),
      notes:     String(r["Notes"] || "").trim(),
      created:   r["Created Date"] || r["Created"] || ""
    };
  }
  function normMember(r){
    return {
      squadId:   String(r["Squad ID"] || "").trim(),
      empId:     String(r["Employee ID"] || "").trim(),
      role:      String(r["Role"] || "Member").trim(),
      active:    String(r["Active"] || "").trim(),
      start:     r["Start Date"] || "",
      end:       r["End Date"] || "",
      notes:     String(r["Notes"] || "").trim(),
    };
  }

  // ---- Activities (if configured) ----
  function normActivity(r){
    return {
      squadId:   String(r["Squad ID"] || "").trim(),
      title:     String(r["Title"] || r["Activity"] || "").trim(),
      status:    String(r["Status"] || "").trim(),
      ownerId:   String(r["Owner Employee ID"] || r["Employee ID"] || "").trim(),
      start:     r["Start Date"] || "",
      due:       r["Due Date"] || "",
      priority:  String(r["Priority"] || "").trim(),
      progress:  String(r["Progress %"] || r["Progress"] || "").trim(),
      active:    String(r["Active"] || "").trim(),
      notes:     String(r["Notes"] || "").trim(),
    };
  }
  function statusPill(s){
    const t = String(s||'').toLowerCase();
    if (/done|complete/.test(t)) return `<span class="pill pill--green">${esc(s)}</span>`;
    if (/blocked|risk|hold/.test(t)) return `<span class="pill pill--red">${esc(s)}</span>`;
    if (/progress|doing/.test(t)) return `<span class="pill pill--blue">${esc(s)}</span>`;
    return `<span class="pill pill--gray">${esc(s||'—')}</span>`;
  }

  function renderSkeleton(squad, leaderName) {
    P.layout.setPageTitle(`Squad: ${esc(squad.name || squad.id)}${IS_ADMIN ? ' (Admin)' : ''}`);

    const html = `
      <div class="card" style="margin:12px 12px 0 12px; padding:12px;">
        <div style="display:flex; gap:12px; align-items:center; justify-content:flex-end;">
          <button id="btn-back" class="btn small">← Back</button>
          <button id="btn-addmember" class="btn small" style="display:none;">＋ Add Member</button>
          <button id="btn-addleader" class="btn small" style="display:none;">★ Add Leader</button>
          <button id="btn-addactivity" class="btn small" style="display:none;">＋ Add Activity</button>
        </div>
      </div>

      <div style="display:grid; gap:12px; grid-template-columns: 1.2fr 1fr 1fr; padding:12px;">
        <div class="card">
          <h3 style="margin-bottom:8px;">Squad</h3>
          <div>Name: <strong>${esc(squad.name || "-")}</strong></div>
          <div>Leader: <strong>${esc(leaderName || squad.leaderId || "-")}</strong></div>
          <div>Status: ${isTrue(squad.active) ? '<span class="pill pill--green">Active</span>' : '<span class="pill pill--gray">Inactive</span>'}</div>
          <div>Category: <strong>${esc(squad.category || "-")}</strong></div>
          <div>Created: ${fmtDate(squad.created)}</div>
        </div>

        <div class="card"><h3 style="margin-bottom:8px;">Objective</h3><div>${esc(squad.objective || "-")}</div></div>
        <div class="card"><h3 style="margin-bottom:8px;">Notes</h3><div>${esc(squad.notes || "-")}</div></div>
      </div>

      <div class="card" style="margin: 0 12px 12px 12px;">
        <h3 style="margin-bottom:8px;">Members</h3>
        <div class="table-scroll">
          <table class="dashboard-table" id="squad-members-table">
            <thead><tr id="members-head-row"></tr></thead>
            <tbody data-hook="members.tbody"></tbody>
          </table>
        </div>
      </div>

      <div class="card" id="activities-card" style="margin: 0 12px 12px 12px;">
        <h3 style="margin-bottom:8px;">Activities</h3>
        <div id="activities-body">
          <div style="opacity:.8;">Activities not configured yet. Add <code>SQUAD_ACTIVITIES</code> to <code>api.js</code> and a Smartsheet sheet for activities to enable this section.</div>
        </div>
      </div>
    `;
    document.querySelector(".content").innerHTML = html;
    byId("btn-back").onclick = () => history.length > 1 ? history.back() : (location.href = "squads.html");

    // Build members header depending on admin
    const head = byId('members-head-row');
    head.innerHTML = IS_ADMIN
      ? `<th>Member</th><th>Employee ID</th><th>Role</th><th>Status</th><th>Start</th>`
      : `<th>Member</th><th>Role</th><th>Status</th><th>Start</th>`;
  }

  function renderMembers(tbody, rows, employeesById) {
    const html = rows.map(r => {
      const p = employeesById.get(r.empId);
      const name = p?.name || r.empId || "-";
      if (IS_ADMIN) {
        return `<tr>
          <td>${esc(name)}</td>
          <td class="mono">${esc(r.empId || "-")}</td>
          <td>${String(r.role||"").toLowerCase()==="leader" ? '<span class="pill pill--blue">Leader</span>' : '<span class="pill pill--green">Member</span>'}</td>
          <td>${isTrue(r.active) ? '<span class="pill pill--green">Active</span>' : '<span class="pill pill--gray">Inactive</span>'}</td>
          <td>${fmtDate(r.start)}</td>
        </tr>`;
      } else {
        return `<tr>
          <td>${esc(name)}</td>
          <td>${String(r.role||"").toLowerCase()==="leader" ? '<span class="pill pill--blue">Leader</span>' : '<span class="pill pill--green">Member</span>'}</td>
          <td>${isTrue(r.active) ? '<span class="pill pill--green">Active</span>' : '<span class="pill pill--gray">Inactive</span>'}</td>
          <td>${fmtDate(r.start)}</td>
        </tr>`;
      }
    }).join("");
    tbody.innerHTML = html || `<tr><td colspan="${IS_ADMIN ? 5 : 4}" style="text-align:center;opacity:.7;">No members yet.</td></tr>`;
  }

  function injectPickerStylesOnce() {
    if (document.getElementById("pu-member-picker-css")) return;
    const css = `
      #pu-member-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:9999}
      .pu-mp__sheet{width:min(720px,92vw);background:var(--card-bg,#1b2d2e);border:1px solid rgba(255,255,255,.08);border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.4);padding:16px}
      .pu-mp__head{display:flex;gap:12px;align-items:center;margin-bottom:10px}
      .pu-mp__head h3{flex:0 0 auto;font-size:16px;margin:0}
      .pu-mp__head h3 span{color:var(--accent,#00ffc6)}
      .pu-mp__search{flex:1;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:#213331;color:#fff}
      .pu-mp__list{max-height:52vh;overflow:auto;border:1px solid rgba(255,255,255,.06);border-radius:8px}
      .pu-mp__row{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06)}
      .pu-mp__row:last-child{border-bottom:none}
      .pu-mp__title{font-weight:600}
      .pu-mp__meta{opacity:.75;font-size:12px}
      .pu-mp__row:hover{background:rgba(255,255,255,.04)}
      .pu-mp__actions{display:flex;justify-content:flex-end;margin-top:10px}
    `;
    const style = document.createElement("style");
    style.id = "pu-member-picker-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function openMemberPicker({ squad, employeesById, activeEmpIds, allowLeader = false }) {
    injectPickerStylesOnce();

    const people = Array.from(employeesById.values())
      .filter(p => p.name && p.id)
      .sort((a,b) => a.name.localeCompare(b.name));

    const overlay = document.createElement("div");
    overlay.id = "pu-member-overlay";
    overlay.innerHTML = `
      <div class="pu-mp__sheet">
        <div class="pu-mp__head">
          <h3>Add member to <span>${esc(squad.name || squad.id)}</span></h3>
          <input class="pu-mp__search" id="pu-mp-q" type="text" placeholder="Search name / department / ID…" />
        </div>
        <div id="pu-mp-list" class="pu-mp__list"></div>
        <div class="pu-mp__actions">
          ${allowLeader ? `<label style="margin-right:auto;display:flex;gap:6px;align-items:center;">
            <input type="checkbox" id="pu-mp-leader"> Add as Leader
          </label>` : ``}
          <button id="pu-mp-cancel" class="btn small">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const $q = document.getElementById("pu-mp-q");
    const $list = document.getElementById("pu-mp-list");

    const render = (term = "") => {
      const t = term.trim().toLowerCase();
      const list = (t
        ? people.filter(p =>
            p.name.toLowerCase().includes(t) ||
            (p.dept||"").toLowerCase().includes(t) ||
            p.id.toLowerCase().includes(t)
          )
        : people
      ).slice(0, 200);

      $list.innerHTML = list.map(p => {
        const already = activeEmpIds.has(p.id);
        return `<div class="pu-mp__row" data-id="${esc(p.id)}" data-disabled="${already ? '1' : ''}">
          <div>
            <div class="pu-mp__title">${esc(p.name)}</div>
            <div class="pu-mp__meta">${esc(p.dept || "—")} • ${esc(p.id)}</div>
          </div>
          ${already ? `<span class="pill pill--gray">Already a member</span>` : `<button class="btn small">Select</button>`}
        </div>`;
      }).join("") || `<div class="pu-mp__row"><div class="pu-mp__meta" style="padding:10px;">No matches</div></div>`;
    };

    const close = () => overlay.remove();
    $q.addEventListener("input", e => render(e.target.value));
    overlay.addEventListener("click", e => {
      if (e.target.id === "pu-mp-cancel" || e.target === overlay) { close(); return; }
      const row = e.target.closest(".pu-mp__row");
      if (!row || row.getAttribute("data-disabled")==="1") return;
      const empId = row.getAttribute("data-id");
      const asLeader = allowLeader && document.getElementById("pu-mp-leader")?.checked;
      openPrefilledMemberForm({ squad, empId, role: asLeader ? "Leader" : "Member" });
      close();
    });
    window.addEventListener("keydown", function escClose(ev){ if (ev.key==="Escape"){ close(); window.removeEventListener("keydown", escClose);} });

    render();
    $q.focus();
  }

  function openPrefilledMemberForm({ squad, empId, role = "Member" }) {
    if (!SQUAD_MEMBER_FORM_URL) { alert("Add Member form URL missing."); return; }
    const qp = new URLSearchParams();
    qp.set("Squad ID", squad.id || "");
    qp.set("Employee ID", empId || "");
    qp.set("Role", role);
    qp.set("Active", "true");
    const d=new Date(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0');
    qp.set("Start Date", `${mm}/${dd}/${d.getFullYear()}`);
    // Open in new tab; we’ll auto-refresh when it redirects back to our bridge page (see #3)
    window.open(`${SQUAD_MEMBER_FORM_URL}?${qp.toString()}`, "_blank", "noopener");
  }

  // ----- Activities UI -----
  function renderActivitiesPlaceholder(){
    const body = byId('activities-body');
    if (!body) return;
    body.innerHTML = `<div style="opacity:.8;">
      Activities not configured yet. Add <code>SQUAD_ACTIVITIES</code> to <code>api.js</code> and point it at a Smartsheet sheet with columns:
      <em>Squad ID, Title, Status, Owner Employee ID, Start Date, Due Date, Priority, Progress %, Active, Notes</em>.
    </div>`;
  }
  function renderActivitiesTable(rows, employeesById){
    const body = byId('activities-body'); if (!body) return;
    const table = `
      <div class="table-scroll">
        <table class="dashboard-table">
          <thead><tr>
            <th>Title</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Start</th>
            <th>Due</th>
            <th>Priority</th>
            <th>Progress</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${esc(r.title || "-")}</td>
                <td>${esc(employeesById.get(r.ownerId)?.name || r.ownerId || "-")}</td>
                <td>${statusPill(r.status)}</td>
                <td>${fmtDate(r.start)}</td>
                <td>${fmtDate(r.due)}</td>
                <td>${esc(r.priority || "-")}</td>
                <td class="mono">${esc(r.progress || "-")}</td>
              </tr>
            `).join("") || `<tr><td colspan="7" style="text-align:center;opacity:.7;">No activities yet.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    body.innerHTML = table;
  }

  // Refresh members after form submission (bridge) or tab focus
  async function refreshMembers({force=false, squadId, employeesById}){
    const membersRows = await getRowsByTitle(SHEETS.SQUAD_MEMBERS, { force });
    const activeMembers = membersRows
      .map(normMember)
      .filter(m => m.squadId === squadId && String(m.active).toLowerCase() !== "false")
      .sort((a,b) => {
        const ra = (a.role||"").toLowerCase()==="leader" ? 0 : 1;
        const rb = (b.role||"").toLowerCase()==="leader" ? 0 : 1;
        if (ra!==rb) return ra-rb;
        const na = employeesById.get(a.empId)?.name || a.empId;
        const nb = employeesById.get(b.empId)?.name || b.empId;
        return na.localeCompare(nb);
      });
    renderMembers(document.querySelector('[data-hook="members.tbody"]'), activeMembers, employeesById);
    return activeMembers;
  }

  // boot
  document.addEventListener("DOMContentLoaded", async () => {
    P.session.requireLogin();
    P.layout.injectLayout();
    await P.session.initHeader();

    const id = qparam("id");
    if (!id) { document.querySelector(".content").innerHTML = `<div class="card" style="margin:12px;">Missing squad id.</div>`; return; }

    const [squadsRows, membersRows, employeeRows] = await Promise.all([
      getRowsByTitle(SHEETS.SQUADS),
      getRowsByTitle(SHEETS.SQUAD_MEMBERS),
      getRowsByTitle(SHEETS.EMPLOYEE_MASTER),
    ]);

    const employeesById = normalizeEmployees(employeeRows);
    const squadRow = squadsRows.find(r => String(r["Squad ID"] || r["ID"] || "").trim() === id);
    if (!squadRow) { document.querySelector(".content").innerHTML = `<div class="card" style="margin:12px;">Squad not found.</div>`; return; }

    const squad = normSquad(squadRow);
    const leaderName = employeesById.get(squad.leaderId)?.name;
    renderSkeleton(squad, leaderName);

    // Members
    let activeMembers = membersRows
      .map(normMember)
      .filter(m => m.squadId === squad.id && String(m.active).toLowerCase() !== "false")
      .sort((a,b) => {
        const ra = (a.role||"").toLowerCase()==="leader" ? 0 : 1;
        const rb = (b.role||"").toLowerCase()==="leader" ? 0 : 1;
        if (ra!==rb) return ra-rb;
        const na = employeesById.get(a.empId)?.name || a.empId;
        const nb = employeesById.get(b.empId)?.name || b.empId;
        return na.localeCompare(nb);
      });

    renderMembers(document.querySelector('[data-hook="members.tbody"]'), activeMembers, employeesById);

    // Permissions
    const me = P.session.get();
    const amLeader = String(squad.leaderId || "").trim() === String(me.employeeId || "").trim();

    const addMemberBtn = byId("btn-addmember");
    const addLeaderBtn = byId("btn-addleader");
    const addActivityBtn = byId("btn-addactivity");

    if (amLeader || IS_ADMIN) {
      addMemberBtn.style.display = "";
      addMemberBtn.onclick = () => {
        const activeIds = new Set(activeMembers.map(m => m.empId));
        openMemberPicker({ squad, employeesById, activeEmpIds: activeIds, allowLeader: false });
      };
    }
    if (IS_ADMIN) {
      addLeaderBtn.style.display = "";
      addLeaderBtn.onclick = () => {
        const activeIds = new Set(activeMembers.map(m => m.empId));
        openMemberPicker({ squad, employeesById, activeEmpIds: activeIds, allowLeader: true });
      };
    }

    // Activities (if configured)
    if (SHEETS.SQUAD_ACTIVITIES) {
      const actRows = (await getRowsByTitle(SHEETS.SQUAD_ACTIVITIES))
        .map(normActivity)
        .filter(a => a.squadId === squad.id && String(a.active).toLowerCase() !== "false");
      renderActivitiesTable(actRows, employeesById);

      if (amLeader || IS_ADMIN) {
        addActivityBtn.style.display = "";
        addActivityBtn.onclick = () => {
          if (!SQUAD_ACTIVITY_FORM_URL) { alert('Add Activity form not configured yet.'); return; }
          const qp = new URLSearchParams();
          qp.set("Squad ID", squad.id);
          qp.set("Start Date", fmtDate(new Date()));
          const meId = String(me.employeeId || "").trim();
          if (meId) qp.set("Owner Employee ID", meId);
          window.open(`${SQUAD_ACTIVITY_FORM_URL}?${qp.toString()}`,'_blank','noopener');
        };
      }
    } else {
      renderActivitiesPlaceholder();
    }

    // ----- (5) Improve form UX: auto-refresh on return or redirect bridge -----
    // Option A: If the Smartsheet form is set to redirect to /form-bridge.html after submit,
    // the bridge will postMessage back. Listen for that and force-refresh.
    window.addEventListener('message', async (ev) => {
      try {
        const d = ev.data || {};
        if (d && d.type === 'smartsheet:submitted' && d.sheet === 'SQUAD_MEMBERS') {
          activeMembers = await refreshMembers({ force: true, squadId: squad.id, employeesById });
        }
      } catch {}
    });

    // Option B: User returns focus to this tab — optimistically refresh members (cheap)
    window.addEventListener('focus', async () => {
      activeMembers = await refreshMembers({ force: true, squadId: squad.id, employeesById });
    });
  });
})(window.PowerUp || {});
