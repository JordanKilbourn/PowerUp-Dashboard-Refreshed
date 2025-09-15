// scripts/squad-details.js
(function (P) {
  const { api, session, layout } = P;

  // ---------- utils ----------
  const qs = (k) => new URLSearchParams(location.search).get(k) || "";
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const norm = (s) => String(s || "").trim().toLowerCase();
  const isTrue = (v) => v === true || /^(true|yes|y|1|active)$/i.test(String(v ?? "").trim());
  const fmtMDYY = (v) => {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(+d)) return esc(v);
    const m = d.getMonth()+1, day = d.getDate(), y = (d.getFullYear()%100);
    return `${m}/${day}/${String(y).padStart(2,"0")}`;
  };
  const pick = (row, keys, d="") => {
    for (const k of keys) if (row && row[k] != null && String(row[k]).trim() !== "") return row[k];
    return d;
  };

  // ---------- data helpers ----------
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

  async function loadActivitiesForSquad(squadId, squadName) {
    if (!api.SHEETS || !api.SHEETS.SQUAD_ACTIVITIES) {
      return { items: [], configured: false, hoursByAct: new Map() };
    }
    const rows = await api.getRowsByTitle(api.SHEETS.SQUAD_ACTIVITIES);
    const items = rows.map(r => {
      const actId = pick(r, ["Activity ID","ID"], "").toString().trim();
      const squad = (r["Squad"] || r["Squad ID"] || r["Squad Name"] || "").toString().trim();
      const title = (r["Activity Title"] || r["Title"] || "").toString().trim();
      const type  = (r["Type"] || "").toString().trim() || "Other";
      const status= (r["Status"] || "").toString().trim() || "Planned";
      const start = r["Start Date"] || r["Start"] || "";
      const end   = r["End Date"] || r["Due Date"] || r["End"] || "";
      const owner = (r["Owner (Display Name)"] || r["Owner"] || "").toString().trim();
      if (!title) return null;
      const match = (norm(squad) === norm(squadId)) || (squadName && norm(squad) === norm(squadName));
      if (!match) return null;
      return { id: actId, title, type, status, start, end, owner };
    }).filter(Boolean);

    // Completed PH hours rollup
    const hoursByAct = new Map();
    try {
      const ph = await api.getRowsByTitle(api.SHEETS.POWER_HOURS);
      ph.forEach(r => {
        const actId = (r["Activity ID"] || r["Activity"] || "").toString().trim();
        if (!actId) return;
        const completed = isTrue(r["Completed"]);
        if (!completed) return;
        const hrs = Number(String(r["Completed Hours"] ?? r["Hours"] ?? "0").replace(/[^0-9.\-]/g,"") || 0);
        if (!Number.isFinite(hrs)) return;
        hoursByAct.set(actId, (hoursByAct.get(actId) || 0) + hrs);
      });
    } catch {}

    return { items, configured: true, hoursByAct };
  }

  // ---------- render: meta ----------
  function renderMeta(squadRow, leaderNames) {
    const squadName = squadRow["Squad Name"] || squadRow["Name"] || squadRow.id || "-";
    const statusPill = isTrue(squadRow["Active"])
      ? '<span class="pill pill--on">Active</span>'
      : '<span class="pill pill--off">Inactive</span>';

    const core = document.querySelector("#card-core .kv");
    if (core) {
      core.innerHTML = `
        <div><b>Name:</b> ${esc(squadName)}</div>
        <div><b>${leaderNames.length > 1 ? "Leaders" : "Leader"}:</b> ${esc(leaderNames.join(", ") || "-")}</div>
        <div><b>Status:</b> ${statusPill}</div>
        <div><b>Category:</b> ${esc(squadRow["Category"] || "-")}</div>
        <div><b>Created:</b> ${fmtMDYY(squadRow["Created Date"] || squadRow["Created"] || "")}</div>
      `;
    }
    const obj = document.querySelector("#card-objective .kv");
    if (obj) obj.textContent = squadRow["Objective"] || "-";
    const notes = document.querySelector("#card-notes .kv");
    if (notes) notes.textContent = squadRow["Notes"] || "-";
  }

  // ---------- render: members ----------
  function renderMembers(allRows, empMap, squadId, isAdmin) {
    const rows = allRows.filter(r => norm(r["Squad ID"]) === norm(squadId));
    const tb = document.getElementById("members-tbody");
    const cnt = document.getElementById("members-count");
    if (!tb) return;

    tb.innerHTML = rows.map(r => {
      const eid   = String(r["Employee ID"] || "").trim();
      const name  = empMap.get(eid) || eid || "-";
      const role  = r["Role"] || "-";
      const active= isTrue(r["Active"]);
      const start = r["Start Date"] || r["Start"];
      return `
        <tr>
          <td>${esc(isAdmin ? `${name} — ${eid}` : name)}</td>
          <td>${esc(role)}</td>
          <td>${active ? '<span class="pill pill--on">Active</span>' : '<span class="pill pill--off">Inactive</span>'}</td>
          <td>${fmtMDYY(start)}</td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="4" style="opacity:.7;text-align:center;">No members yet</td></tr>`;

    if (cnt) cnt.textContent = String(rows.length);
  }

  // ---------- render: activities ----------
  function renderKpis(acts, hoursByAct) {
    const set = (id,val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
    const lc = (s) => String(s||"").toLowerCase();
    set("kpi-active",  acts.filter(a => /progress|active|ongoing/.test(lc(a.status))).length);
    set("kpi-planned", acts.filter(a => /plan/.test(lc(a.status))).length);
    set("kpi-done",    acts.filter(a => /done|complete/.test(lc(a.status))).length);
    set("kpi-hours",   acts.reduce((sum,a)=> sum+(hoursByAct.get(a.id)||0), 0));
  }

  function renderActivities(acts, hoursByAct, configured) {
    const tb = document.getElementById("activities-tbody");
    if (!tb) return;

    if (!configured) {
      tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;">
        Activities sheet isn’t configured (SHEETS.SQUAD_ACTIVITIES). This panel is read-only until you add it.
      </td></tr>`;
      return;
    }
    if (!acts.length) {
      tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;text-align:center">
        No activities found for this squad.
      </td></tr>`;
      return;
    }

    tb.innerHTML = acts.map(a => {
      const range = `${fmtMDYY(a.start)} – ${fmtMDYY(a.end)}`;
      const hrs   = hoursByAct.get(a.id) || 0;
      return `
        <tr>
          <td>${esc(a.title)}</td>
          <td>${esc(a.status || "-")}</td>
          <td>${esc(a.type || "-")}</td>
          <td>${range}</td>
          <td>${esc(a.owner || "-")}</td>
          <td>${hrs}</td>
          <td class="row-actions"><a href="#" data-act="${esc(a.id)}" data-action="log-ph">Log Hour</a></td>
        </tr>
      `;
    }).join("");

    // wire "Log Hour"
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

  // ---------- controls ----------
  function wireBackButton() {
    const btn = document.getElementById("btn-back");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (history.length > 1) history.back();
      else location.href = "squads.html";
    });
  }

  // robust, idempotent binder for Add Member
  function wireAddMemberButton({ canAdd, squadId, squadName }) {
    const btn = document.getElementById("btn-addmember");
    if (!btn) return;

    btn.hidden = !canAdd;
    btn.disabled = !canAdd;

    const handler = (e) => {
      e.preventDefault();
      if (P.squadForm && typeof P.squadForm.open === "function") {
        P.squadForm.open({ squadId, squadName });
      } else {
        console.warn("P.squadForm.open not found. Ensure scripts/squad-member-form.js loads before this file.");
        alert("Member form not found. Please include scripts/squad-member-form.js earlier on the page.");
      }
    };

    if (btn._amHandler) btn.removeEventListener("click", btn._amHandler);
    btn._amHandler = handler;
    btn.addEventListener("click", handler);

    if (!document._amDelegated) {
      document._amDelegated = true;
      document.addEventListener("click", (evt) => {
        const t = evt.target.closest("#btn-addmember");
        if (t && !t.disabled && !t.hidden) handler(evt);
      });
    }
  }

  // ---------- main ----------
  document.addEventListener("DOMContentLoaded", async () => {
    layout.injectLayout?.();
    await session.initHeader?.();

    const urlId = qs("id") || qs("squadId") || qs("squad");
    if (!urlId) {
      layout.setPageTitle?.("Squad: (unknown)");
      return;
    }

    // Admin check
    const isAdmin = !!(P.auth && typeof P.auth.isAdmin === "function" && P.auth.isAdmin());

    // Load base data
    const [squads, members, empMap] = await Promise.all([
      api.getRowsByTitle("SQUADS", { force: true }),
      api.getRowsByTitle("SQUAD_MEMBERS", { force: true }),
      loadEmployeeMap()
    ]);

    // find squad (by id or name)
    const sidLC = norm(urlId);
    const squadRow =
      squads.find(r => norm(r["Squad ID"]) === sidLC) ||
      squads.find(r => norm(r["Squad Name"]) === sidLC) ||
      null;
    if (!squadRow) {
      layout.setPageTitle?.("Squad: Not Found");
      return;
    }

    const squadId   = (squadRow["Squad ID"] || urlId).toString().trim();
    const squadName = (squadRow["Squad Name"] || squadRow["Name"] || "").toString().trim();
    layout.setPageTitle?.(`Squad: ${squadName || squadId}`);

    // leaders (from SQUAD_MEMBERS)
    const leaderIds = members
      .filter(r => norm(r["Squad ID"]) === norm(squadId) && norm(r["Role"]) === "leader" && isTrue(r["Active"]))
      .map(r => (r["Employee ID"] || "").toString().trim())
      .filter(Boolean);
    const leaderNames = leaderIds.map(id => empMap.get(id) || id);

    // meta cards
    renderMeta({ ...squadRow, id: squadId }, leaderNames);

    // members
    renderMembers(members, empMap, squadId, isAdmin);
    document.addEventListener("squad-member-added", async () => {
      const latest = await api.getRowsByTitle("SQUAD_MEMBERS", { force: true });
      renderMembers(latest, empMap, squadId, isAdmin);
    });

    // permissions for add member
    const me = session.get?.() || {};
    const userId = (me.employeeId || "").trim().toLowerCase();
    const canAdd = isAdmin || leaderIds.some(id => id.toLowerCase() === userId);
    wireAddMemberButton({ canAdd, squadId, squadName });
    wireBackButton();

    // activities
    const { items: acts, configured, hoursByAct } =
      await loadActivitiesForSquad(squadId, squadName);
    renderKpis(acts, hoursByAct);
    renderActivities(acts, hoursByAct, configured);

    // filters
    const statusSel = document.getElementById("act-status");
    const typeSel   = document.getElementById("act-type");
    function applyActFilters() {
      const sVal = (statusSel?.value || "__ALL__").toLowerCase();
      const tVal = (typeSel?.value || "__ALL__").toLowerCase();
      const filtered = acts.filter(a => {
        const sOK = sVal === "__ALL__" || (a.status || "").toLowerCase() === sVal;
        const tOK = tVal === "__ALL__" || (a.type   || "").toLowerCase() === tVal;
        return sOK && tOK;
      });
      renderKpis(filtered, hoursByAct);
      renderActivities(filtered, hoursByAct, configured);
    }
    statusSel?.addEventListener("change", applyActFilters);
    typeSel?.addEventListener("change", applyActFilters);

    // Add Activity (wire later when your form exists)
    const addActBtn = document.getElementById("btn-add-activity");
    if (addActBtn) {
      if (isAdmin || canAdd) {
        addActBtn.disabled = false;
        addActBtn.addEventListener("click", (e) => {
          e.preventDefault();
          if (P.activities && typeof P.activities.openCreate === "function") {
            P.activities.openCreate({ squadId, squadName });
          } else {
            alert("Activity form not wired yet. Expose P.activities.openCreate({ squadId, squadName }) when ready.");
          }
        });
      } else {
        addActBtn.disabled = true;
      }
    }
  });
})(window.PowerUp || (window.PowerUp = {}));
