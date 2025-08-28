// scripts/squad-details.js
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

  function hydrateHeader() {
    try {
      const { displayName, levelText } = session.get?.() || {};
      const nameEl  = document.querySelector('[data-hook="userName"]');
      const levelEl = document.querySelector('[data-hook="userLevel"]');
      if (nameEl && displayName) nameEl.textContent = displayName;
      if (levelEl && levelText)  levelEl.textContent  = levelText;
    } catch {}
  }

  function renderMembers(allRows, empMap, squadId, showEmpId) {
    const rows = allRows.filter(r => String(r["Squad ID"]).trim() === String(squadId).trim());

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

  async function main() {
    // Layout + header
    layout.injectLayout();
    hydrateHeader();

    const urlId = qs("id") || qs("squadId") || qs("squad");
    if (!urlId) {
      layout.setPageTitle("Squad: (unknown)");
      document.querySelector("#card-core .kv").textContent = "Not found (missing ?id param).";
      return;
    }

    const { employeeId } = session.get?.() || {};
    const isAdmin = !!(roles && roles.isAdmin && roles.isAdmin());

    const [squads, members, empMap] = await Promise.all([
      api.getRowsByTitle('SQUADS', { force: true }),
      api.getRowsByTitle('SQUAD_MEMBERS', { force: true }),
      loadEmployeeMap()
    ]);

    // Find squad by ID (prefer) or name fallback
    let squad = squads.find(r => String(r["Squad ID"]).trim() === String(urlId).trim());
    if (!squad) {
      squad = squads.find(r => String(r["Squad Name"]).trim().toLowerCase() === String(urlId).trim().toLowerCase());
    }
    if (!squad) {
      layout.setPageTitle("Squad: Not Found");
      document.querySelector("#card-core .kv").textContent = "Not found.";
      return;
    }

    // Reliable squadId for downstream usage
    const squadId   = squad["Squad ID"] || urlId;
    const squadName = squad["Squad Name"] || squadId;
    const leaderId  = String(squad["Squad Leader"] || "").trim();
    const leaderName = empMap[leaderId] || leaderId || "-";
    const active = (String(squad["Active"]||"").toLowerCase() === "true") ? "Active" : "Inactive";
    const category = squad["Category"] || "-";
    const created  = squad["Created Date"] || squad["Created"] || "";

    layout.setPageTitle(`Squad: ${squadName}`);

    // Core cards
    document.querySelector("#card-core .kv").innerHTML = `
      <div><b>Name:</b> ${esc(squadName)}</div>
      <div><b>Leader:</b> ${esc(leaderName)}</div>
      <div><b>Status:</b> ${active === "Active"
        ? '<span class="status-pill status-on">Active</span>'
        : '<span class="status-pill status-off">Inactive</span>'}</div>
      <div><b>Category:</b> ${esc(category)}</div>
      <div><b>Created:</b> ${esc(created || "-")}</div>
    `;
    document.querySelector("#card-objective .kv").textContent = squad["Objective"] || "-";
    document.querySelector("#card-notes .kv").textContent     = squad["Notes"] || "-";

    // Back button
    const backBtn = document.getElementById("btn-back");
    if (backBtn) backBtn.onclick = (e) => {
      e.preventDefault();
      if (history.length > 1) history.back();
      else location.href = "squads.html";
    };

    // Add member permissions + open modal with a guaranteed squadId
    const canAdd = isAdmin || (leaderId && leaderId === employeeId);
    const addBtn = document.getElementById("btn-addmember");
    if (canAdd) {
      addBtn.style.display = "";
      addBtn.onclick = (e) => {
        e.preventDefault();
        if (!P.squadForm?.open) {
          alert("Member form not found. Is scripts/squad-member-form.js included?");
          return;
        }
        P.squadForm.open({ squadId, squadName }); // << always passes a valid squadId now
      };
    } else {
      addBtn.style.display = "none";
    }

    // Initial member render (hide Employee ID for non-admins)
    const showEmpId = isAdmin;
    renderMembers(members, empMap, squadId, showEmpId);

    // After a member is added, refresh
    document.addEventListener("squad-member-added", async () => {
      const latest = await api.getRowsByTitle('SQUAD_MEMBERS', { force: true });
      renderMembers(latest, empMap, squadId, showEmpId);
    });
  }

  document.addEventListener("DOMContentLoaded", main);
})(window.PowerUp || (window.PowerUp = {}));
