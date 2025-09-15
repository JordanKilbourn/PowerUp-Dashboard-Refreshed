// Squad Details — compact members + activities + metrics + original buttons/modal
(function (P) {
  const { api, session, layout } = P;

  // ---- utils ----
  const qs = (k) => new URLSearchParams(location.search).get(k) || "";
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const lc  = (s) => String(s||"").trim().toLowerCase();
  const isTrue = (v) => v === true || /^(true|yes|y|1|active)$/i.test(String(v ?? "").trim());
  const mdyy = (v) => {
    if (!v) return "-";
    const d = new Date(v); if (Number.isNaN(+d)) return esc(v);
    const m = d.getMonth()+1, day = d.getDate(), y = (d.getFullYear()%100);
    return `${m}/${day}/${String(y).padStart(2,"0")}`;
  };

  // Viewport-aware panel height
  function setScrollHeights() {
    const grid = document.querySelector('.sqd-grid');
    if (!grid) return;
    const top = grid.getBoundingClientRect().top;
    const avail = Math.max(240, Math.floor(window.innerHeight - top - 24)); // 24px pad
    document.documentElement.style.setProperty('--sqd-avail', `${avail}px`);
  }
  window.addEventListener('resize', setScrollHeights);

  async function loadEmployeeMap() {
    const rows = await api.getRowsByTitle("EMPLOYEE_MASTER");
    const map = new Map();
    rows.forEach(r => {
      const id = (r["Position ID"] || r["Employee ID"] || "").toString().trim();
      const nm = (r["Display Name"] || r["Employee Name"] || r["Name"] || "").toString().trim();
      if (id) map.set(id, nm || id);
    });
    return map;
  }

  // ---- members (left) ----
  function renderMembers(allRows, empMap, squadId, showEmpId) {
    const rows = allRows.filter(r => lc(r["Squad ID"]) === lc(squadId));
    const thead = document.querySelector("#members-table thead tr");
    const tbody = document.querySelector("#members-table tbody");
    if (!thead || !tbody) return;

    thead.innerHTML = showEmpId
      ? "<th>Member</th><th>Employee ID</th><th>Role</th><th>Status</th><th>Start</th>"
      : "<th>Member</th><th>Role</th><th>Status</th><th>Start</th>";

    tbody.innerHTML = rows.map(r => {
      const eid = String(r["Employee ID"] || "").trim();
      const name = empMap.get(eid) || eid || "-";
      const role = r["Role"] || "-";
      const active = isTrue(r["Active"]);
      const start = r["Start Date"] || r["Start"];
      const cells = [
        `<td>${esc(name)}</td>`,
        ...(showEmpId ? [`<td class="mono">${esc(eid || "-")}</td>`] : []),
        `<td>${esc(role)}</td>`,
        `<td>${active ? '<span class="pill pill--on">Active</span>' : '<span class="pill pill--off">Inactive</span>'}</td>`,
        `<td>${mdyy(start)}</td>`
      ];
      return `<tr>${cells.join("")}</tr>`;
    }).join("") || `<tr><td colspan="${showEmpId ? 5 : 4}" style="opacity:.75;text-align:center;">No members yet</td></tr>`;
  }

  // ---- top summary (core card) ----
  function renderCoreSummary(squad, leaderNames) {
    const kv = document.querySelector("#card-core .kv");
    if (!kv) return;
    const statusPill = isTrue(squad.Active)
      ? '<span class="status-pill status-on">Active</span>'
      : '<span class="status-pill status-off">Inactive</span>';

    const leaderText = leaderNames.length
      ? (leaderNames.length === 1 ? leaderNames[0]
        : leaderNames.length === 2 ? `${leaderNames[0]}, ${leaderNames[1]}`
        : `${leaderNames[0]}, ${leaderNames[1]} +${leaderNames.length-2} more`)
      : "-";

    kv.innerHTML = `
      <div><b>Name:</b> ${esc(squad["Squad Name"] || squad["Name"] || squad.id || "-")}</div>
      <div><b>${leaderNames.length>1?'Leaders':'Leader'}:</b> ${esc(leaderText)}</div>
      <div><b>Status:</b> ${statusPill}</div>
      <div><b>Category:</b> ${esc(squad["Category"] || "-")}</div>
      <div><b>Created:</b> ${mdyy(squad["Created Date"] || squad["Created"] || "")}</div>
    `;
    const obj = document.querySelector("#card-objective .kv");
    if (obj) obj.textContent = squad["Objective"] || "-";
    const notes = document.querySelector("#card-notes .kv");
    if (notes) notes.textContent = squad["Notes"] || "-";
  }

  // ---- activities (right) ----
  async function loadActivitiesForSquad(squadId, squadName) {
    const ok = !!(api.SHEETS && api.SHEETS.SQUAD_ACTIVITIES);
    if (!ok) return { items: [], configured: false, hoursByAct: new Map() };

    const rows = await api.getRowsByTitle(api.SHEETS.SQUAD_ACTIVITIES);
    const items = rows.map(r => {
      const actId = (r["Activity ID"] || r["ID"] || "").toString().trim();
      const squad = (r["Squad"] || r["Squad ID"] || r["Squad Name"] || "").toString().trim();
      const title = (r["Activity Title"] || r["Title"] || "").toString().trim();
      if (!title) return null;
      const match = lc(squad) === lc(squadId) || (squadName && lc(squad) === lc(squadName));
      if (!match) return null;
      return {
        id: actId,
        title,
        status: (r["Status"] || "Planned").toString().trim(),
        type:   (r["Type"] || "Other").toString().trim(),
        start:  r["Start Date"] || r["Start"] || "",
        end:    r["End Date"]   || r["Due Date"] || r["End"] || "",
        owner:  (r["Owner (Display Name)"] || r["Owner"] || "").toString().trim()
      };
    }).filter(Boolean);

    const hoursByAct = new Map();
    try {
      const ph = await api.getRowsByTitle(api.SHEETS.POWER_HOURS);
      ph.forEach(r => {
        const actId = (r["Activity ID"] || r["Activity"] || "").toString().trim();
        if (!actId) return;
        if (!isTrue(r["Completed"])) return;
        const hrs = Number(String(r["Completed Hours"] ?? r["Hours"] ?? "0").replace(/[^0-9.\-]/g,"") || 0);
        if (!Number.isFinite(hrs)) return;
        hoursByAct.set(actId, (hoursByAct.get(actId) || 0) + hrs);
      });
    } catch {}
    return { items, configured: true, hoursByAct };
  }

  function renderMetrics(acts, hoursByAct) {
    const elA = document.getElementById("m-active");
    const elP = document.getElementById("m-planned");
    const elD = document.getElementById("m-done");
    const elH = document.getElementById("m-hours");
    if (!elA || !elP || !elD || !elH) return;

    const active  = acts.filter(a => /progress|active|ongoing/.test(lc(a.status))).length;
    const planned = acts.filter(a => /plan/.test(lc(a.status))).length;
    const done    = acts.filter(a => /done|complete/.test(lc(a.status))).length;
    const hours   = acts.reduce((sum,a) => sum + (hoursByAct.get(a.id) || 0), 0);

    elA.textContent = String(active);
    elP.textContent = String(planned);
    elD.textContent = String(done);
    elH.textContent = String(hours);
  }

  function renderActivities(acts, hoursByAct, configured) {
    const tb = document.getElementById("act-tbody");
    if (!tb) return;

    if (!configured) {
      tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;">
        Activities sheet isn’t configured yet (SHEETS.SQUAD_ACTIVITIES).
      </td></tr>`;
      return;
    }
    if (!acts.length) {
      tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;">No activities found for this squad.</td></tr>`;
      return;
    }
    tb.innerHTML = acts.map(a => {
      const range = `${mdyy(a.start)} – ${mdyy(a.end)}`;
      const hrs = hoursByAct.get(a.id) || 0;
      return `<tr>
        <td>${esc(a.title)}</td>
        <td>${esc(a.status || "-")}</td>
        <td>${esc(a.type || "-")}</td>
        <td>${range}</td>
        <td>${esc(a.owner || "-")}</td>
        <td>${hrs}</td>
        <td><a href="#" class="link" data-act="${esc(a.id)}" data-action="log-ph">Log Hour</a></td>
      </tr>`;
    }).join("");

    tb.querySelectorAll('[data-action="log-ph"]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const actId = a.getAttribute('data-act') || '';
        if (P.PowerHours && typeof P.PowerHours.open === 'function') {
          P.PowerHours.open({ activityId: actId });
        } else {
          location.href = `power-hours.html?activityId=${encodeURIComponent(actId)}`;
        }
      });
    });
  }

  // ---- main ----
  document.addEventListener("DOMContentLoaded", async () => {
    layout.injectLayout?.();
    await session.initHeader?.();

    // set initial dynamic heights now that header is placed
    setScrollHeights();

    const urlId = qs("id") || qs("squadId") || qs("squad");
    if (!urlId) { layout.setPageTitle?.("Squad: (unknown)"); return; }

    const [squads, members, empMap] = await Promise.all([
      api.getRowsByTitle("SQUADS", { force: true }),
      api.getRowsByTitle("SQUAD_MEMBERS", { force: true }),
      loadEmployeeMap()
    ]);

    const sidLC = lc(urlId);
    const squadRow =
      squads.find(r => lc(r["Squad ID"]) === sidLC) ||
      squads.find(r => lc(r["Squad Name"]) === sidLC) || null;

    if (!squadRow) { layout.setPageTitle?.("Squad: Not Found"); return; }

    const squadId   = (squadRow["Squad ID"] || urlId).toString().trim();
    const squadName = (squadRow["Squad Name"] || squadRow["Name"] || "").toString().trim();
    layout.setPageTitle?.(`Squad: ${squadName || squadId}`);

    // leaders (truth = SQUAD_MEMBERS)
    const leaderIds = members
      .filter(r => lc(r["Squad ID"]) === lc(squadId) && lc(r["Role"]) === "leader" && isTrue(r["Active"]))
      .map(r => (r["Employee ID"] || "").toString().trim()).filter(Boolean);
    const leaderNames = leaderIds.map(id => empMap.get(id) || id).filter(Boolean);

    // left: members
    const isAdmin = !!(P.auth && typeof P.auth.isAdmin === "function" && P.auth.isAdmin());
    renderMembers(members, empMap, squadId, isAdmin);

    // refresh members after modal save (two common event names)
    const refreshMembers = async () => {
      const latest = await api.getRowsByTitle("SQUAD_MEMBERS", { force: true });
      renderMembers(latest, empMap, squadId, isAdmin);
    };
    document.addEventListener("squad-member-added", refreshMembers);
    document.addEventListener("squad:member:added", refreshMembers);

    // back button
    document.getElementById("btn-back")?.addEventListener("click", (e) => {
      e.preventDefault();
      if (history.length > 1) history.back(); else location.href = "squads.html";
    });

    // who can add?
    const me = session.get?.() || {};
    const userId = String(me.employeeId || "").toLowerCase();
    const canAdd = isAdmin || leaderIds.some(id => id.toLowerCase() === userId);

    // visible Add Member button wiring (with legacy bridge)
    const addBtn = document.getElementById("btn-addmember");
    const legacyBtn = document.getElementById("btnAddMember"); // hidden bridge
    if (addBtn) {
      if (canAdd) {
        addBtn.style.display = "inline-flex";
        addBtn.disabled = false;
        addBtn.addEventListener("click", (e) => {
          e.preventDefault();
          // Try modern API first
          if (P.squadForm && typeof P.squadForm.open === "function") {
            P.squadForm.open({ squadId, squadName });
            return;
          }
          // Fall back to legacy listener which may be bound to #btnAddMember
          if (legacyBtn) {
            legacyBtn.click();
            return;
          }
          alert("Member form not found. Include scripts/squad-member-form.js");
        });
      } else {
        addBtn.style.display = "none";
        addBtn.disabled = true;
      }
    }

    // right: summary + activities/metrics
    renderCoreSummary({ ...squadRow, id: squadId }, leaderNames);

    const { items: acts, configured, hoursByAct } = await loadActivitiesForSquad(squadId, squadName);
    renderMetrics(acts, hoursByAct);
    renderActivities(acts, hoursByAct, configured);

    // filters
    const statusSel = document.getElementById("act-status");
    const typeSel   = document.getElementById("act-type");
    const applyActFilters = () => {
      const sVal = (statusSel?.value || "__ALL__").toLowerCase();
      const tVal = (typeSel?.value || "__ALL__").toLowerCase();
      const filtered = acts.filter(a => {
        const sOK = sVal === "__ALL__" || lc(a.status) === sVal;
        const tOK = tVal === "__ALL__" || lc(a.type) === tVal;
        return sOK && tOK;
      });
      renderMetrics(filtered, hoursByAct);
      renderActivities(filtered, hoursByAct, configured);
    };
    statusSel?.addEventListener("change", applyActFilters);
    typeSel?.addEventListener("change", applyActFilters);
  });
})(window.PowerUp || (window.PowerUp = {}));
