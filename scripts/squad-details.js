squad-details.js
// scripts/squad-details.js
(function (P) {
  const { api, session, layout } = P;

  /* =========================
   * Utilities
   * ========================= */
  const qs = (k) => new URLSearchParams(location.search).get(k) || "";
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const norm = (s) => String(s || "").trim().toLowerCase();
  const isTrue = (v) => v === true || /^(true|yes|y|1|active|planned)$/i.test(String(v ?? "").trim());

  const parseDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(+d) ? null : d;
  };
  const fmtMDYY = (v) => {
    const d = parseDate(v);
    if (!d) return "—";
    const m = d.getMonth()+1, day = d.getDate(), y = (d.getFullYear()%100);
    return `${m}/${day}/${String(y).padStart(2,"0")}`;
  };
  const dayDiff = (a,b) => {
    const A = parseDate(a), B = parseDate(b);
    if (!A || !B) return 0;
    return Math.max(0, Math.round((B - A) / 86400000));
  };
  const num = (v, d = 0) => {
    const n = Number(String(v ?? "").toString().replace(/[^0-9.\-]/g,""));
    return Number.isFinite(n) ? n : d;
  };

  /* =========================
   * Data helpers
   * ========================= */
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

  // Load activities for this squad + roll up Power Hours (planned & completed)
  async function loadActivitiesForSquad(squadId, squadName) {
    if (!api.SHEETS || !api.SHEETS.SQUAD_ACTIVITIES) {
      return { items: [], configured: false, hours: { completedByAct:new Map(), plannedByAct:new Map() } };
    }
    const rows = await api.getRowsByTitle(api.SHEETS.SQUAD_ACTIVITIES);

    const items = rows.map(r => {
      const actId = (r["Activity ID"] || r["ID"] || "").toString().trim();
      const squad = (r["Squad"] || r["Squad ID"] || r["Squad Name"] || "").toString().trim();
      const title = (r["Activity Title"] || r["Title"] || "").toString().trim();
      const type  = (r["Type"] || "").toString().trim() || "Other";
      const status= (r["Status"] || "").toString().trim() || "Not Started";
      const start = r["Start Date"] || r["Start"] || "";
      const end   = r["End/Due Date"] || r["End Date"] || r["Due Date"] || r["End"] || "";
      const owner = (r["Owner (Display Name)"] || r["Owner"] || "").toString().trim();
      if (!title) return null;
      const match = (norm(squad) === norm(squadId)) || (squadName && norm(squad) === norm(squadName));
      if (!match) return null;
      return { id: actId, title, type, status, start, end, owner };
    }).filter(Boolean);

    // Roll up Power Hours by activity
    const completedByAct = new Map();
    const plannedByAct   = new Map();
    try {
      const ph = await api.getRowsByTitle(api.SHEETS.POWER_HOURS);
      ph.forEach(r => {
        const actId = (r["Activity ID"] || r["Activity"] || "").toString().trim();
        if (!actId) return;
        const planned   = isTrue(r["Scheduled"]);
        const completed = isTrue(r["Completed"]);
        const hrs = num(r["Completed Hours"] ?? r["Hours"] ?? r["Duration (hrs)"] ?? r["Duration"]);
        if (!hrs) return;

        if (completed) completedByAct.set(actId, (completedByAct.get(actId) || 0) + hrs);
        else if (planned) plannedByAct.set(actId, (plannedByAct.get(actId) || 0) + hrs);
      });
    } catch { /* ok if sheet doesn’t exist yet */ }

    return {
      items,
      configured: true,
      hours: { completedByAct, plannedByAct }
    };
  }

  /* =========================
   * Rendering — Meta & Members
   * ========================= */
  function renderMeta(squadRow, leaderNames) {
    const squadName = squadRow["Squad Name"] || squadRow["Name"] || squadRow.id || "-";
    const active = isTrue(squadRow["Active"]);
    const statusPill = active
      ? '<span class="pill pill--on">Active</span>'
      : '<span class="pill pill--off">Inactive</span>';

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? "—"; };

    set("sqd-name", squadName);
    set("sqd-leader", leaderNames.join(", ") || "—");
    const st = document.getElementById("sqd-status"); if (st) st.outerHTML = statusPill;
    set("sqd-cat", squadRow["Category"] || "—");
    set("sqd-created", fmtMDYY(squadRow["Created Date"] || squadRow["Created"] || ""));

    const obj = document.querySelector("#card-objective .kv");
    if (obj) obj.textContent = squadRow["Objective"] || "—";
    const notes = document.querySelector("#card-notes .kv");
    if (notes) notes.textContent = squadRow["Notes"] || "—";
  }

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

  /* =========================
   * Rendering — KPIs & Breakdown
   * ========================= */
  function computeKpis(acts, hours) {
    const total = acts.length;
    const completedActs = acts.filter(a => norm(a.status) === "completed").length;

    // Hour rollups
    let completedHrs = 0, plannedHrs = 0;
    acts.forEach(a => {
      completedHrs += hours.completedByAct.get(a.id) || 0;
      plannedHrs   += hours.plannedByAct.get(a.id)   || 0;
    });

    const pct = total ? Math.round((completedActs / total) * 100) : 0;
    return { total, plannedHrs, completedHrs, pct };
  }

  function renderKpis(acts, hours) {
    const { total, plannedHrs, completedHrs, pct } = computeKpis(acts, hours);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
    set("kpi-total", total);
    set("kpi-planned-hrs", plannedHrs);
    set("kpi-completed-hrs", completedHrs);
    set("kpi-complete-pct", `${pct}%`);
  }

  function renderStatusBreakdown(acts) {
    // Counts by normalized status
    const buckets = new Map(); // status -> count
    acts.forEach(a => buckets.set(norm(a.status), (buckets.get(norm(a.status)) || 0) + 1));
    const entries = Array.from(buckets.entries())
      .sort((a,b) => b[1]-a[1]); // biggest first

    // Host container (insert once above views)
    let host = document.getElementById("status-breakdown");
    if (!host) {
      host = document.createElement("div");
      host.id = "status-breakdown";
      host.style.margin = "4px 0 10px 0";
      host.style.padding = "8px 10px";
      host.style.border = "1px solid rgba(255,255,255,.08)";
      host.style.borderRadius = "10px";
      host.style.background = "var(--panel-2)";
      host.innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong style="color:#9ffbe6">Status mix:</strong>
        <div id="status-bar" style="flex:1;height:12px;border-radius:999px;overflow:hidden;border:1px solid rgba(255,255,255,.08);display:flex;"></div>
        <div id="status-legend" style="display:flex;gap:10px;flex-wrap:wrap;"></div>
      </div>`;
      const views = document.getElementById("activities-views");
      views?.insertAdjacentElement("beforebegin", host);
    }

    const sum = entries.reduce((s, [,c]) => s+c, 0) || 1;
    const colorFor = (k) => {
      if (k === "completed") return "#2a3a2f";
      if (k === "in progress") return "#264b3f";
      if (k === "not started" || k === "planned") return "#2a3440";
      if (k === "blocked" || k === "at risk") return "#40342a";
      if (k === "canceled" || k === "denied/cancelled") return "#3a2d2d";
      return "#2a3a3a";
    };

    const bar = host.querySelector("#status-bar");
    const legend = host.querySelector("#status-legend");
    if (bar) {
      bar.innerHTML = entries.map(([k,c]) => {
        const w = Math.max(3, Math.round((c/sum)*100)); // keep tiny segments visible
        return `<div title="${esc(k)}: ${c}" style="width:${w}%;background:${colorFor(k)};"></div>`;
      }).join("");
    }
    if (legend) {
      legend.innerHTML = entries.map(([k,c]) => `
        <span class="pill" style="background:${colorFor(k)}">${esc(k)}: ${c}</span>
      `).join("");
    }
  }

  /* =========================
   * Rendering — Activities Table
   * ========================= */
  const statusPillClass = (s) => {
    const k = norm(s);
    if (k === "in progress" || k === "progress") return "pill--status-progress";
    if (k === "completed" ) return "pill--status-completed";
    if (k === "not started" || k === "planned") return "pill--status-notstarted";
    if (k === "canceled" || k === "denied/cancelled") return "pill--status-canceled";
    return "pill--type"; // fallback subtle pill
  };

  function renderActivities(acts, hours, configured) {
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
      const range = `${fmtMDYY(a.start)} — ${fmtMDYY(a.end)}`;
      const doneHrs = hours.completedByAct.get(a.id) || 0;
      const statusCls = statusPillClass(a.status);
      const actionLabel = /completed/i.test(a.status) ? "View" : "Log Hour";
      return `
        <tr>
          <td class="title">${esc(a.title)}</td>
          <td class="status"><span class="pill ${statusCls}">${esc(a.status)}</span></td>
          <td class="type"><span class="pill pill--type">${esc(a.type)}</span></td>
          <td class="dates">${esc(range)}</td>
          <td class="owner">${esc(a.owner || "-")}</td>
          <td class="ph" style="text-align:right">${doneHrs}</td>
          <td class="row-actions">
            <button class="btn small ${/completed/i.test(a.status)?'ghost':''}" data-act="${esc(a.id)}" data-action="${/completed/i.test(a.status)?'view':'log-ph'}">${actionLabel}</button>
          </td>
        </tr>
      `;
    }).join("");

    // actions
    tb.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const actId = btn.getAttribute('data-act') || '';
        const action = btn.getAttribute('data-action') || 'log-ph';
        if (action === 'view') {
          // placeholder: navigate to a future activity details page if you add one
          alert('View not wired yet.');
          return;
        }
        if (P.PowerHours && typeof P.PowerHours.open === 'function') {
          P.PowerHours.open({ activityId: actId });
        } else {
          location.href = `power-hours.html?activityId=${encodeURIComponent(actId)}`;
        }
      });
    });
  }

  /* =========================
   * Filters (dependent)
   * ========================= */
  function buildDependentFilters(allActs, hours) {
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    if (!colSel || !valSel) return;

    const cols = [
      {key:"status", label:"Status",  get:a=>a.status},
      {key:"type",   label:"Type",    get:a=>a.type},
      {key:"owner",  label:"Owner",   get:a=>a.owner||"-"},
      {key:"hours",  label:"Completed PH", get:a=>String(hours.completedByAct.get(a.id)||0)},
      {key:"title",  label:"Title",   get:a=>a.title},
      {key:"start",  label:"Start",   get:a=>fmtMDYY(a.start)},
      {key:"end",    label:"End",     get:a=>fmtMDYY(a.end)}
    ];

    function setValuesFor(colKey){
      const col = cols.find(c=>c.key===colKey) || cols[0];
      const vals = Array.from(new Set(allActs.map(a => col.get(a)))).filter(v=>v!==undefined && v!==null);
      valSel.innerHTML = `<option value="__ALL__">All values</option>` +
        vals.map(v=>`<option>${esc(v)}</option>`).join("");
      valSel.disabled = false;
    }

    colSel.innerHTML = cols.map((c,i)=>`<option value="${c.key}" ${i===0?'selected':''}>${c.label}</option>`).join("");
    setValuesFor(colSel.value);

    colSel.addEventListener('change', () => setValuesFor(colSel.value));
  }

  function applyDependentFilter(allActs, hours) {
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    const configured = true;

    const colKey = (colSel?.value)||"status";
    const val    = (valSel?.value)||"__ALL__";

    const getters = {
      title:a=>a.title, status:a=>a.status, type:a=>a.type,
      start:a=>fmtMDYY(a.start), end:a=>fmtMDYY(a.end),
      owner:a=>a.owner||"-", hours:a=>String(hours.completedByAct.get(a.id)||0)
    };
    const get = getters[colKey] || ((a)=>"");

    const filtered = (val==="__ALL__") ? allActs : allActs.filter(a => String(get(a))===val);

    renderKpis(filtered, hours);
    renderStatusBreakdown(filtered);
    renderActivities(filtered, hours, configured);

    // Render gantt if active tab is selected
    if (!document.getElementById('view-gantt')?.hidden) {
      renderGantt(filtered);
    }
  }

  /* =========================
   * View modes (Table / Gantt / Calendar)
   * ========================= */
  function renderGantt(acts) {
    const host = document.getElementById('gantt-container');
    if (!host) return;

    if (!acts.length) {
      host.innerHTML = `<div style="opacity:.75">No activities to show.</div>`;
      return;
    }

    // Determine overall time window
    const dates = acts.flatMap(a => [parseDate(a.start), parseDate(a.end) || parseDate(a.start)])
                      .filter(Boolean).sort((a,b)=>a-b);
    if (!dates.length) {
      host.innerHTML = `<div style="opacity:.75">No dates available.</div>`;
      return;
    }
    const min = dates[0];
    const max = dates[dates.length-1];
    const totalDays = Math.max(1, dayDiff(min, max) || 1);

    // Build rows
    host.innerHTML = `
      <div style="width:100%;overflow:auto;">
        <div style="min-width:720px;">
          ${acts.map(a => {
            const s = parseDate(a.start) || min;
            const e = parseDate(a.end) || s;
            const startPct = Math.max(0, Math.min(100, Math.round((dayDiff(min, s) / totalDays) * 100)));
            const lenPct   = Math.max(2, Math.round((Math.max(1, dayDiff(s, e)||1) / totalDays) * 100));
            const cls = statusPillClass(a.status);
            return `
              <div style="display:grid;grid-template-columns:240px 1fr;align-items:center;gap:12px;margin:8px 0;">
                <div title="${esc(a.title)}" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  <span class="pill ${cls}">${esc(a.status)}</span>
                  &nbsp;${esc(a.title)}
                </div>
                <div style="position:relative;height:24px;border:1px solid rgba(255,255,255,.08);border-radius:6px;background:#0f1a1a;">
                  <div title="${fmtMDYY(a.start)} — ${fmtMDYY(a.end)}"
                       style="position:absolute;left:${startPct}%;width:${lenPct}%;height:100%;
                              background:linear-gradient(90deg,#1f6f5a,#2e8a73);border-radius:6px;">
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function wireViewTabs(acts, hours) {
    const tGantt = document.getElementById('view-tab-gantt');
    const tTable = document.getElementById('view-tab-table');
    const tCal   = document.getElementById('view-tab-cal');

    tGantt?.addEventListener('click', () => renderGantt(acts));
    tTable?.addEventListener('click', () => applyDependentFilter(acts, hours)); // redraw table view
    tCal?.addEventListener('click', () => {
      const host = document.getElementById('calendar-container');
      if (host) host.innerHTML = `<div style="opacity:.75">Calendar view coming soon.</div>`;
    });
  }

  /* =========================
   * Controls
   * ========================= */
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
        alert("Member form not found. Please include scripts/squad-member-form.js earlier on the page.");
      }
    };

    if (btn._amHandler) btn.removeEventListener("click", btn._amHandler);
    btn._amHandler = handler;
    btn.addEventListener("click", handler);
  }

  /* =========================
   * Viewport sizing
   * ========================= */
  function sizeSquadScrollers() {
    const gap = 24; // extra bottom space inside scroll panels
    const fit = (el) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const h = Math.max(140, (window.innerHeight || document.documentElement.clientHeight) - rect.top - gap);
      el.style.maxHeight = h + 'px';
      el.style.height = h + 'px';
    };
    fit(document.querySelector('.members-scroll'));
    fit(document.querySelector('.acts-scroll'));
  }

  /* =========================
   * Main
   * ========================= */
  document.addEventListener("DOMContentLoaded", async () => {
    layout.injectLayout?.();
    await session.initHeader?.();

    const urlId = qs("id") || qs("squadId") || qs("squad");
    if (!urlId) { layout.setPageTitle?.("Squad: (unknown)"); return; }

    const isAdmin = !!(P.auth && typeof P.auth.isAdmin === "function" && P.auth.isAdmin());

    const [squads, members, empMap] = await Promise.all([
      api.getRowsByTitle("SQUADS", { force: true }),
      api.getRowsByTitle("SQUAD_MEMBERS", { force: true }),
      loadEmployeeMap()
    ]);

    const sidLC = norm(urlId);
    const squadRow =
      squads.find(r => norm(r["Squad ID"]) === sidLC) ||
      squads.find(r => norm(r["Squad Name"]) === sidLC) || null;
    if (!squadRow) { layout.setPageTitle?.("Squad: Not Found"); return; }

    const squadId   = (squadRow["Squad ID"] || urlId).toString().trim();
    const squadName = (squadRow["Squad Name"] || squadRow["Name"] || "").toString().trim();
    layout.setPageTitle?.(`Squad: ${squadName || squadId}`);

    const leaderIds = members
      .filter(r => norm(r["Squad ID"]) === norm(squadId) && norm(r["Role"]) === "leader" && isTrue(r["Active"]))
      .map(r => (r["Employee ID"] || "").toString().trim()).filter(Boolean);
    const leaderNames = leaderIds.map(id => empMap.get(id) || id);

    renderMeta({ ...squadRow, id: squadId }, leaderNames);
    renderMembers(members, empMap, squadId, isAdmin);

    document.addEventListener("squad-member-added", async () => {
      const latest = await api.getRowsByTitle("SQUAD_MEMBERS", { force: true });
      renderMembers(latest, empMap, squadId, isAdmin);
    });

    const me = session.get?.() || {};
    const userId = (me.employeeId || "").trim().toLowerCase();
    const canAdd = isAdmin || leaderIds.some(id => id.toLowerCase() === userId);
    wireAddMemberButton({ canAdd, squadId, squadName });
    wireBackButton();

    // activities + hours
    const { items: acts, configured, hours } = await loadActivitiesForSquad(squadId, squadName);

    // initial render
    renderKpis(acts, hours);
    renderStatusBreakdown(acts);
    renderActivities(acts, hours, configured);
    buildDependentFilters(acts, hours);

    // dependent filters
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    const rerender = () => applyDependentFilter(acts, hours);
    colSel?.addEventListener("change", rerender);
    valSel?.addEventListener("change", rerender);

    // view tabs
    wireViewTabs(acts, hours);

    // viewport sizing
    sizeSquadScrollers();
    window.addEventListener('resize', sizeSquadScrollers);
  });
})(window.PowerUp || (window.PowerUp = {}));
