// scripts/squad-details.js
(function (P) {
  const { api, session, layout } = P;

  // ---------- utils ----------
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
      const status= (r["Status"] || "").toString().trim() || "Not Started";
      const start = pick(r, ["Start Date","Start"], "");
      const end   = pick(r, ["End/Due Date","End Date","Due Date","End"], "");
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

    // Follow your exact statuses
    set("kpi-active",  acts.filter(a => lc(a.status) === "in progress").length);
    set("kpi-planned", acts.filter(a => lc(a.status) === "not started").length);
    set("kpi-done",    acts.filter(a => lc(a.status) === "completed").length);
    set("kpi-hours",   acts.reduce((sum,a)=> sum+(hoursByAct.get(a.id)||0), 0));
  }

  function badge(text){ return `<span class="badge">${esc(text||"-")}</span>`; }

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
      const range = `${fmtMDYY(a.start)} — ${fmtMDYY(a.end)}`;
      const hrs   = hoursByAct.get(a.id) || 0;
      const actionLabel = /completed/i.test(a.status) ? "View" : "Log Hour";
      return `
        <tr>
          <td>${esc(a.title)}</td>
          <td>${badge(a.status)}</td>
          <td>${badge(a.type)}</td>
          <td>${esc(range)}</td>
          <td>${esc(a.owner || "-")}</td>
          <td style="text-align:right">${hrs}</td>
          <td class="cell-actions">
            <button class="btn btn-log small" data-act="${esc(a.id)}" data-action="${/completed/i.test(a.status)?'view':'log-ph'}">${actionLabel}</button>
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
          // Navigate to details if/when you have a page for it
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

  // ---------- dependent filters ----------
  function buildDependentFilters(allActs) {
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    if (!colSel || !valSel) return;

    // columns -> accessors
    const cols = [
      {key:"title",  label:"Title",      get:a=>a.title},
      {key:"status", label:"Status",     get:a=>a.status},
      {key:"type",   label:"Type",       get:a=>a.type},
      {key:"start",  label:"Start Date", get:a=>fmtMDYY(a.start)},
      {key:"end",    label:"End/Due",    get:a=>fmtMDYY(a.end)},
      {key:"owner",  label:"Owner",      get:a=>a.owner||"-"},
      {key:"hours",  label:"Completed PH", get:a=>String(a.hours||0)}
    ];

    // augment acts with hours for filter convenience
    const withHours = allActs.map(a => ({...a}));

    function setValuesFor(colKey){
      const col = cols.find(c=>c.key===colKey) || cols[0];
      const vals = Array.from(new Set(withHours.map(a => col.get(a)))).filter(v=>v!==undefined && v!==null);
      valSel.innerHTML = `<option value="__ALL__">All values</option>` +
        vals.map(v=>`<option>${esc(v)}</option>`).join("");
    }

    colSel.innerHTML = cols.map((c,i)=>`<option value="${c.key}" ${i===1?'selected':''}>${c.label}</option>`).join("");
    setValuesFor(colSel.value);

    colSel.addEventListener('change', () => setValuesFor(colSel.value));
  }

  function applyDependentFilter(allActs, hoursByAct) {
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    const configured = true;

    const colKey = (colSel?.value)||"status";
    const val    = (valSel?.value)||"__ALL__";

    const get = {
      title:a=>a.title, status:a=>a.status, type:a=>a.type,
      start:a=>fmtMDYY(a.start), end:a=>fmtMDYY(a.end),
      owner:a=>a.owner||"-", hours:a=>String(hoursByAct.get(a.id)||0)
    }[colKey] || ((a)=>"");

    const filtered = (val==="__ALL__") ? allActs : allActs.filter(a => String(get(a))===val);

    renderKpis(filtered, hoursByAct);
    renderActivities(filtered, hoursByAct, configured);
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

  // ---------- viewport sizing ----------
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

  // ---------- main ----------
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
    const { items: acts, configured, hoursByAct } = await loadActivitiesForSquad(squadId, squadName);
    renderKpis(acts, hoursByAct);
    renderActivities(acts, hoursByAct, configured);

    // dependent filters
    buildDependentFilters(acts);
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    const rerender = () => applyDependentFilter(acts, hoursByAct);
    colSel?.addEventListener("change", rerender);
    valSel?.addEventListener("change", rerender);

    // Add Activity button (keep permissions consistent with "canAdd")
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
