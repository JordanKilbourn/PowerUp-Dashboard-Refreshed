squad-details.js
// scripts/squad-details.js
(function (P) {
  const { api, session, layout } = P;

  // ---------- utils (unchanged patterns) ----------
  const qs = (k) => new URLSearchParams(location.search).get(k) || "";
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const norm = (s) => String(s || "").trim().toLowerCase();
  const isTrue = (v) => v === true || /^(true|yes|y|1|active)$/i.test(String(v ?? "").trim());
  const fmtMDYY = (v) => {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(+d)) return esc(v);
    const m = d.getMonth()+1, day = d.getDate(), y = (d.getFullYear()%100);
    return `${m}/${day}/${String(y).padStart(2,"0")}`;
  };
  const pick = (row, keys, d="") => {
    for (const k of keys) if (row && row[k] != null && String(row[k]).trim() !== "") return row[k];
    return d;
  };
  const toNum = (v) => {
    const n = Number(String(v ?? "").replace(/[^0-9.\-]/g,""));
    return Number.isFinite(n) ? n : 0;
  };

  // ---------- data helpers (minimal additions only) ----------
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

  // NOTE: same shape you already used, just adds planned hours map
  async function loadActivitiesForSquad(squadId, squadName) {
    if (!api.SHEETS || !api.SHEETS.SQUAD_ACTIVITIES) {
      return { items: [], configured: false, hoursByAct: new Map(), plannedByAct: new Map() };
    }
    const rows = await api.getRowsByTitle(api.SHEETS.SQUAD_ACTIVITIES);

    const items = rows.map(r => {
      const actId = pick(r, ["Activity ID","ID"], "").toString().trim();
      const squad = (r["Squad"] || r["Squad ID"] || r["Squad Name"] || "").toString().trim();
      const title = (r["Activity Title"] || r["Title"] || "").toString().trim();
      const type  = (r["Type"] || "").toString().trim() || "Other";
      const status= (r["Status"] || "").toString().trim() || "Not Started";
      const start = pick(r, ["Start Date","Start"], "");
      const end   = pick(r, ["End/Due Date","End Date","Due Date","End"], "");
      const owner = (r["Owner (Display Name)"] || r["Owner"] || "").toString().trim();
      if (!title) return null;
      const match = (norm(squad) === norm(squadId)) || (squadName && norm(squad) === norm(squadName));
      if (!match) return null;
      return { id: actId, title, type, status, start, end, owner };
    }).filter(Boolean);

    // Hours rollups (completed + planned)
    const hoursByAct   = new Map();
    const plannedByAct = new Map();
    try {
      const ph = await api.getRowsByTitle(api.SHEETS.POWER_HOURS);
      ph.forEach(r => {
        const actId = (r["Activity ID"] || r["Activity"] || "").toString().trim();
        if (!actId) return;
        const hrs = toNum(r["Completed Hours"] ?? r["Hours"] ?? r["Duration (hrs)"] ?? r["Duration"]);
        if (!hrs) return;
        if (isTrue(r["Completed"])) {
          hoursByAct.set(actId, (hoursByAct.get(actId) || 0) + hrs);
        } else if (isTrue(r["Scheduled"])) {
          plannedByAct.set(actId, (plannedByAct.get(actId) || 0) + hrs);
        }
      });
    } catch {}

    return { items, configured: true, hoursByAct, plannedByAct };
  }

  // ---------- render: meta (unchanged) ----------
  function renderMeta(squadRow, leaderNames) {
    const squadName = squadRow["Squad Name"] || squadRow["Name"] || squadRow.id || "-";
    const active = isTrue(squadRow["Active"]);
    const statusPill = active
      ? '<span class="pill pill--on">Active</span>'
      : '<span class="pill pill--off">Inactive</span>';

    const n = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? "—"; };

    n("sqd-name", squadName);
    n("sqd-leader", leaderNames.join(", ") || "—");
    const st = document.getElementById("sqd-status"); if (st) st.outerHTML = statusPill;
    n("sqd-cat", squadRow["Category"] || "—");
    n("sqd-created", fmtMDYY(squadRow["Created Date"] || squadRow["Created"] || ""));

    const obj = document.querySelector("#card-objective .kv");
    if (obj) obj.textContent = squadRow["Objective"] || "—";
    const notes = document.querySelector("#card-notes .kv");
    if (notes) notes.textContent = squadRow["Notes"] || "—";
  }

  // ---------- render: members (unchanged) ----------
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

  // ---------- KPIs (NEW IDs, same flow) ----------
  function renderKpis(acts, hoursByAct, plannedByAct) {
    const set = (id,val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };

    const total = acts.length;
    const completedActs = acts.filter(a => norm(a.status) === "completed").length;
    const completedHrs = acts.reduce((sum,a)=> sum + (hoursByAct.get(a.id)||0), 0);
    const plannedHrs   = acts.reduce((sum,a)=> sum + (plannedByAct.get(a.id)||0), 0);
    const pct = total ? Math.round((completedActs/total)*100) : 0;

    set("kpi-total", total);
    set("kpi-planned-hrs", plannedHrs);
    set("kpi-completed-hrs", completedHrs);
    set("kpi-complete-pct", `${pct}%`);
  }

  // ---------- activities table (pills + actions only) ----------
  const statusPillClass = (s) => {
    const k = norm(s);
    if (k === "in progress" || k === "progress") return "pill--status-progress";
    if (k === "completed") return "pill--status-completed";
    if (k === "not started" || k === "planned") return "pill--status-notstarted";
    if (k === "canceled" || k === "denied/cancelled") return "pill--status-canceled";
    return "pill--type";
  };

  function renderActivities(acts, hoursByAct, configured) {
    const tb = document.getElementById("activities-tbody");
    if (!tb) return;

    if (!configured) {
      tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;">
        Activities sheet isn’t configured (SHEETS.SQUAD_ACTIVITIES).
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
      const hrs   = hoursByAct.get(a.id) || 0;
      const actionLabel = /completed/i.test(a.status) ? "View" : "Log Hour";
      const statusCls = statusPillClass(a.status);
      return `
        <tr>
          <td class="title">${esc(a.title)}</td>
          <td class="status"><span class="pill ${statusCls}">${esc(a.status)}</span></td>
          <td class="type"><span class="pill pill--type">${esc(a.type)}</span></td>
          <td class="dates">${esc(range)}</td>
          <td class="owner">${esc(a.owner || "-")}</td>
          <td class="ph" style="text-align:right">${hrs}</td>
          <td class="row-actions">
            <button class="btn small ${/completed/i.test(a.status)?'ghost':''}" data-act="${esc(a.id)}" data-action="${/completed/i.test(a.status)?'view':'log-ph'}">${actionLabel}</button>
          </td>
        </tr>
      `;
    }).join("");

    // keep your existing PH navigation behavior
    tb.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const actId = btn.getAttribute('data-act') || '';
        const action = btn.getAttribute('data-action') || 'log-ph';
        if (action === 'view') {
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

  // ---------- dependent filters (hours option added) ----------
  function buildDependentFilters(allActs, hoursByAct) {
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    if (!colSel || !valSel) return;

    const cols = [
      {key:"status", label:"Status",  get:a=>a.status},
      {key:"type",   label:"Type",    get:a=>a.type},
      {key:"owner",  label:"Owner",   get:a=>a.owner||"-"},
      {key:"hours",  label:"Completed PH", get:a=>String(hoursByAct.get(a.id)||0)},
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

  function applyDependentFilter(allActs, hoursByAct, plannedByAct) {
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    const configured = true;

    const colKey = (colSel?.value)||"status";
    const val    = (valSel?.value)||"__ALL__";

    const getters = {
      title:a=>a.title, status:a=>a.status, type:a=>a.type,
      start:a=>fmtMDYY(a.start), end:a=>fmtMDYY(a.end),
      owner:a=>a.owner||"-", hours:a=>String(hoursByAct.get(a.id)||0)
    };
    const get = getters[colKey] || ((a)=>"");

    const filtered = (val==="__ALL__") ? allActs : allActs.filter(a => String(get(a))===val);

    // new KPI targets (IDs) with same flow
    renderKpis(filtered, hoursByAct, plannedByAct);
    renderActivities(filtered, hoursByAct, configured);
  }

  // ---------- controls (unchanged logic) ----------
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

  // ---------- viewport sizing (unchanged) ----------
  function sizeSquadScrollers() {
    const gap = 24; // extra bottom space
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

  // ---------- main (unchanged boot order) ----------
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

    // activities
    const { items: acts, configured, hoursByAct, plannedByAct } = await loadActivitiesForSquad(squadId, squadName);

    // KPIs now target the new IDs; everything else is the same
    renderKpis(acts, hoursByAct, plannedByAct);
    renderActivities(acts, hoursByAct, configured);

    // dependent filters
    buildDependentFilters(acts, hoursByAct);
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    const rerender = () => applyDependentFilter(acts, hoursByAct, plannedByAct);
    colSel?.addEventListener("change", rerender);
    valSel?.addEventListener("change", rerender);

    // + Add Activity button permissions unchanged
    const addActBtn = document.getElementById("btn-add-activity");
    if (addActBtn) {
      if (canAdd) {
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

    // viewport sizing
    sizeSquadScrollers();
    window.addEventListener('resize', sizeSquadScrollers);
  });
})(window.PowerUp || (window.PowerUp = {}));
