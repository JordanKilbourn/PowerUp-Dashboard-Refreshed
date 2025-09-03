(function (P) {
  const { api, session, roles, layout } = P;

  const qs = (k) => new URLSearchParams(location.search).get(k) || "";
  const esc = (s) => String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  function fmtDate(v) {
    if (!v) return "-";
    const d = new Date(v);
    if (isNaN(d)) return esc(v);
    return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
  }

  async function loadEmployeeMap() {
    const rows = await api.getRowsByTitle('EMPLOYEE_MASTER');
    const map = {};
    rows.forEach(r => {
      const id = r["Position ID"] || r["Employee ID"] || r["EmployeeID"] || r["ID"];
      const name = r["Display Name"] || r["Employee Name"] || r["Name"];
      if (id) map[String(id).trim()] = name || id;
    });
    return map;
  }

  function renderMembers(allRows, empMap, squadId, showEmpId) {
    const rows = allRows.filter(r => String(r["Squad ID"]).trim().toLowerCase() === String(squadId).trim().toLowerCase());

    const thead = document.querySelector("#members-table thead tr");
    const tbody = document.querySelector("#members-table tbody");

    thead.innerHTML = showEmpId
      ? "<th>Member</th><th>Employee ID</th><th>Role</th><th>Status</th><th>Start</th>"
      : "<th>Member</th><th>Role</th><th>Status</th><th>Start</th>";

    tbody.innerHTML = rows.map(r => {
      const eid = String(r["Employee ID"] || "").trim();
      const name = empMap[eid] || eid || "-";
      const role = r["Role"] || "-";
      const active = (String(r["Active"]||"").toLowerCase() === "true");
      const start = r["Start Date"] || r["Start"];
      const cells = [
        `<td>${esc(name)}</td>`,
        ...(showEmpId ? [`<td class="mono">${esc(eid || "-")}</td>`] : []),
        `<td>${esc(role)}</td>`,
        `<td>${active ? '<span class="status-pill status-on">Active</span>'
                      : '<span class="status-pill status-off">Inactive</span>'}</td>`,
        `<td>${fmtDate(start)}</td>`
      ];
      return `<tr>${cells.join("")}</tr>`;
    }).join("") || `<tr><td colspan="${showEmpId ? 5 : 4}" style="opacity:.7;text-align:center;">No members yet</td></tr>`;
  }

  function norm(s) { return String(s || "").trim().toLowerCase(); }

  async function main() {
    layout.injectLayout?.();
    await session.initHeader?.();

    const urlId = qs("id") || qs("squadId") || qs("squad");
    if (!urlId) {
      layout.setPageTitle?.("Squad: (unknown)");
      const el = document.querySelector("#card-core .kv");
      if (el) el.textContent = "Not found (missing ?id param).";
      return;
    }

    const me = session.get?.() || {};
    const userId = (me.employeeId || "").trim();
    const isAdmin = !!(roles && roles.isAdmin && roles.isAdmin());

    const [squads, members, empMap] = await Promise.all([
      api.getRowsByTitle('SQUADS', { force: true }),
      api.getRowsByTitle('SQUAD_MEMBERS', { force: true }),
      loadEmployeeMap()
    ]);

    const urlIdLC = norm(urlId);
    let squad = squads.find(r => norm(r["Squad ID"]) === urlIdLC);
    if (!squad) {
      squad = squads.find(r => norm(r["Squad Name"]) === urlIdLC);
    }
    if (!squad) {
      layout.setPageTitle?.("Squad: Not Found");
      const el = document.querySelector("#card-core .kv");
      if (el) el.textContent = "Not found.";
      return;
    }

    const squadId   = squad["Squad ID"] || urlId;
    const squadName = squad["Squad Name"] || squadId;

    const active = (String(squad["Active"]||"").toLowerCase() === "true") ? "Active" : "Inactive";
    const category = squad["Category"] || "-";
    const created  = squad["Created Date"] || squad["Created"] || "";

    layout.setPageTitle?.(`Squad: ${squadName}`);

    const core = document.querySelector("#card-core .kv");
    if (core) core.innerHTML = `
      <div><b>Name:</b> ${esc(squadName)}</div>
      <div><b>Leader:</b> <!-- leaders are shown on the Squads page; details page focuses on roster --></div>
      <div><b>Status:</b> ${active === "Active"
        ? '<span class="status-pill status-on">Active</span>'
        : '<span class="status-pill status-off">Inactive</span>'}</div>
      <div><b>Category:</b> ${esc(category)}</div>
      <div><b>Created:</b> ${esc(created || "-")}</div>
    `;
    const obj = document.querySelector("#card-objective .kv");
    if (obj) obj.textContent = squad["Objective"] || "-";
    const notes = document.querySelector("#card-notes .kv");
    if (notes) notes.textContent = squad["Notes"] || "-";

    const backBtn = document.getElementById("btn-back");
    if (backBtn) backBtn.onclick = (e) => {
      e.preventDefault();
      if (history.length > 1) history.back();
      else location.href = "squads.html";
    };

    const addBtn = document.getElementById("btn-addmember");
    if (addBtn) {
      let canAdd = isAdmin;

      if (!canAdd) {
        const leaderRows = members.filter(r =>
          norm(r["Squad ID"]) === norm(squadId) &&
          norm(r["Role"]) === "leader" &&
          norm(r["Active"]) === "true"
        );
        canAdd = leaderRows.some(r => norm(r["Employee ID"]) === norm(userId));
      }

      if (canAdd) {
        addBtn.style.display = "inline-flex";
        addBtn.disabled = false;
        addBtn.onclick = (e) => {
          e.preventDefault();
          if (!P.squadForm?.open) {
            alert("Member form not found. Is scripts/squad-member-form.js included?");
            return;
          }
          P.squadForm.open({ squadId, squadName });
        };
      } else {
        addBtn.style.display = "none";
        addBtn.disabled = true;
      }
    }

    const showEmpId = isAdmin;
    renderMembers(members, empMap, squadId, showEmpId);

    document.addEventListener("squad-member-added", async () => {
      const latest = await api.getRowsByTitle('SQUAD_MEMBERS', { force: true });
      renderMembers(latest, empMap, squadId, showEmpId);
    });
  }

  document.addEventListener("DOMContentLoaded", main);
})(window.PowerUp || (window.PowerUp = {}));
