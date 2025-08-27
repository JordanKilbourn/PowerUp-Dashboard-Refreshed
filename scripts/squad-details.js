// scripts/squad-details.js
(function (PowerUp) {
  const P = (window.PowerUp = PowerUp || {});
  const { SHEETS, getRowsByTitle } = P.api;

  // Your Smartsheet form for "PowerUp Squad Members"
  const SQUAD_MEMBER_FORM_URL = "https://app.smartsheet.com/b/form/fc4952f03a3c4e85a548d492c848b536";

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
  const rolePill = (r) => (String(r||"").toLowerCase()==="leader" ? `<span class="pill pill--blue">Leader</span>` : `<span class="pill pill--green">Member</span>`);
  const byId = (x) => document.getElementById(x);
  const qparam = (k) => new URL(location.href).searchParams.get(k) || "";

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

  function renderSkeleton(squad, leaderName) {
    P.layout.setPageTitle(`Squad: ${esc(squad.name || squad.id)}`);
    const html = `
      <div class="card" style="margin:12px 12px 0 12px; padding:12px;">
        <div style="display:flex; gap:12px; align-items:center; justify-content:flex-end;">
          <button id="btn-back" class="btn small">← Back</button>
          <button id="btn-addmember" class="btn small" style="display:none;">＋ Add Member</button>
          <button id="btn-addleader" class="btn small" style="display:none;">★ Add Leader</button>
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
            <thead><tr><th>Member</th><th>Employee ID</th><th>Role</th><th>Status</th><th>Start</th></tr></thead>
            <tbody data-hook="members.tbody"></tbody>
          </table>
        </div>
      </div>
    `;
    document.querySelector(".content").innerHTML = html;
    byId("btn-back").onclick = () => history.length > 1 ? history.back() : (location.href = "squads.html");
  }

  function renderMembers(tbody, rows, employeesById) {
    const html = rows.map(r => {
      const p = employeesById.get(r.empId);
      const name = p?.name || r.empId || "-";
      return `<tr>
        <td>${esc(name)}</td>
        <td class="mono">${esc(r.empId || "-")}</td>
        <td>${rolePill(r.role)}</td>
        <td>${isTrue(r.active) ? '<span class="pill pill--green">Active</span>' : '<span class="pill pill--gray">Inactive</span>'}</td>
        <td>${fmtDate(r.start)}</td>
      </tr>`;
    }).join("");
    tbody.innerHTML = html || `<tr><td colspan="5" style="text-align:center;opacity:.7;">No members yet.</td></tr>`;
  }

  // -------- Member picker (search Employee Master) --------
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

  // Open Smartsheet form with prefilled hidden fields
  function openPrefilledMemberForm({ squad, empId, role = "Member" }) {
    if (!SQUAD_MEMBER_FORM_URL) { alert("Add Member form URL missing."); return; }
    const qp = new URLSearchParams();
    // MUST match your form field titles exactly:
    qp.set("Squad ID", squad.id || "");
    qp.set("Employee ID", empId || "");
    qp.set("Role", role);
    qp.set("Active", "true");
    qp.set("Start Date", (() => {
      const d=new Date(); const mm=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${mm}/${dd}/${d.getFullYear()}`;
    })());
    window.open(`${SQUAD_MEMBER_FORM_URL}?${qp.toString()}`, "_blank", "noopener");
  }

  // boot
  document.addEventListener("DOMContentLoaded", async () => {
    P.session.requireLogin();
    P.layout.injectLayout();

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

    // Members (active first; leader first)
    const activeMembers = membersRows
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
    const amAdmin  = !!(P.auth && P.auth.isAdmin && P.auth.isAdmin());

    const addMemberBtn = byId("btn-addmember");
    const addLeaderBtn = byId("btn-addleader");

    if (amLeader || amAdmin) {
      addMemberBtn.style.display = "";
      addMemberBtn.onclick = () => {
        const activeIds = new Set(activeMembers.map(m => m.empId));
        openMemberPicker({ squad, employeesById, activeEmpIds: activeIds, allowLeader: false });
      };
    }
    if (amAdmin) {
      addLeaderBtn.style.display = "";
      addLeaderBtn.onclick = () => {
        const activeIds = new Set(activeMembers.map(m => m.empId));
        openMemberPicker({ squad, employeesById, activeEmpIds: activeIds, allowLeader: true });
      };
      // Make header show admin mode
      P.layout.setPageTitle(`Squad: ${esc(squad.name)} (Admin)`);
    }
  });
})(window.PowerUp || {});
