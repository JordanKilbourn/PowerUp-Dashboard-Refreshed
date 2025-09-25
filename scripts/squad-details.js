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
  const toISO = (v) => {
    if (!v) return "";
    if (v instanceof Date) return v.toISOString().slice(0,10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return v;
    const d = new Date(v); return isNaN(d) ? "" : d.toISOString().slice(0,10);
  };
  const pick = (row, keys, d="") => { for (const k of keys) if (row && row[k] != null && String(row[k]).trim() !== "") return row[k]; return d; };

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
    const rows = await api.getRowsByTitle(api.SHEETS.SQUAD_ACTIVITIES).catch(()=>[]);
    const items = rows.map(r => {
      const actId = (r["Activity ID"] || r["ID"] || "").toString().trim();
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
      return { id: actId || title, title, type, status, start, end, owner };
    }).filter(Boolean);

    // Hours rollups (completed + planned)
    const hoursByActDone = new Map();
    const hoursByActPlan = new Map();
    try {
      const ph = await api.getRowsByTitle(api.SHEETS.POWER_HOURS);
      ph.forEach(r => {
        const aid = (r["Activity ID"] || r["Activity"] || "").toString().trim();
        if (!aid) return;
        const completed = isTrue(r["Completed"]);
        const scheduled = isTrue(r["Scheduled"]);
        const hrs = Number(String(r["Completed Hours"] ?? r["Hours"] ?? "0").replace(/[^0-9.\-]/g,"") || 0);
        if (!Number.isFinite(hrs)) return;
        if (completed) hoursByActDone.set(aid, (hoursByActDone.get(aid) || 0) + hrs);
        else if (scheduled) hoursByActPlan.set(aid, (hoursByActPlan.get(aid) || 0) + hrs);
      });
    } catch {}

    return { items, hoursByActDone, hoursByActPlan };
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
  }

  // ---------- render: members ----------
  function renderMembers(allRows, empMap, squadId, isAdmin) {
    const rows = allRows.filter(r => norm(r["Squad ID"]) === norm(squadId));
    const tb = document.getElementById("members-tbody");
    if (!tb) return;
    const cnt = document.getElementById("members-count");

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

  // ---------- render: KPIs ----------
  function renderKpis(acts, hoursDone, hoursPlan) {
    const set = (id,val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
    const total = acts.length;
    const completed = acts.filter(a => /completed/i.test(a.status)).length;
    const pct = total ? Math.round((completed/total)*100) : 0;
    const sum = (map) => Array.from(map.values()).reduce((a,b)=>a+b,0);

    set("kpi-total", total);
    set("kpi-planned-hrs", sum(hoursPlan));
    set("kpi-completed-hrs", sum(hoursDone));
    set("kpi-complete-pct", pct + "%");
  }

  // ---------- render: activities table ----------
  function renderActivities(acts, hoursDone, configured) {
    const tb = document.getElementById("activities-tbody");
    if (!tb) return;

    if (!configured) {
      tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;">Activities sheet isn’t configured.</td></tr>`;
      return;
    }
    if (!acts.length) {
      tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;text-align:center">No activities found for this squad.</td></tr>`;
      return;
    }

    tb.innerHTML = acts.map(a => {
      const range = `${fmtMDYY(a.start)} — ${fmtMDYY(a.end)}`;
      const hrs   = hoursDone.get(a.id) || 0;
      const statusChip = `<span class="pill" style="background:#2a3440;color:#c3d5ff">${esc(a.status)}</span>`;
      const typeChip   = `<span class="pill" style="background:#2a3a3a;color:#aee">${esc(a.type)}</span>`;
      return `
        <tr>
          <td>${esc(a.title)}</td>
          <td>${statusChip}</td>
          <td>${typeChip}</td>
          <td>${esc(range)}</td>
          <td class="owner">${esc(a.owner || "-")}</td>
          <td style="text-align:right">${hrs}</td>
          <td class="row-actions">
            <button class="btn small pill accent" data-act="${esc(a.id)}" data-action="log-ph">Log Hour</button>
          </td>
        </tr>
      `;
    }).join("");

    // actions
    tb.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const actId = btn.getAttribute('data-act') || '';
        const action = btn.getAttribute('data-action') || '';
        if (action === 'log-ph') {
          openLogHourModal(actId);
        }
      });
    });
  }

  // ---------- dependent filters ----------
  function buildDependentFilters(allActs, hoursDone) {
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    if (!colSel || !valSel) return;

    const cols = [
      {key:"status", label:"Status",     get:a=>a.status},
      {key:"type",   label:"Type",       get:a=>a.type},
      {key:"owner",  label:"Owner",      get:a=>a.owner||"-"},
      {key:"hours",  label:"Completed PH", get:a=>String(hoursDone.get(a.id)||0)},
      {key:"title",  label:"Title",      get:a=>a.title},
      {key:"start",  label:"Start",      get:a=>fmtMDYY(a.start)},
      {key:"end",    label:"End",        get:a=>fmtMDYY(a.end)},
    ];

    function setValuesFor(colKey){
      const col = cols.find(c=>c.key===colKey) || cols[0];
      const vals = Array.from(new Set(allActs.map(a => col.get(a)))).filter(v=>v!==undefined && v!==null);
      valSel.innerHTML = `<option value="__ALL__">All values</option>` + vals.map(v=>`<option>${esc(v)}</option>`).join("");
      valSel.disabled = false;
    }

    colSel.innerHTML = cols.map(c=>`<option value="${c.key}" ${c.key==='status'?'selected':''}>${c.label}</option>`).join("");
    setValuesFor(colSel.value);

    colSel.addEventListener('change', () => setValuesFor(colSel.value));
  }

  function applyDependentFilter(allActs, hoursDone, hoursPlan) {
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    const colKey = (colSel?.value)||"status";
    const val    = (valSel?.value)||"__ALL__";

    const get = {
      title:a=>a.title, status:a=>a.status, type:a=>a.type,
      start:a=>fmtMDYY(a.start), end:a=>fmtMDYY(a.end),
      owner:a=>a.owner||"-", hours:a=>String(hoursDone.get(a.id)||0)
    }[colKey] || ((a)=>"");

    const filtered = (val==="__ALL__") ? allActs : allActs.filter(a => String(get(a))===val);

    renderKpis(filtered, hoursDone, hoursPlan);
    renderActivities(filtered, hoursDone, true);
    renderGantt(filtered);       // keep Gantt in sync with filters
    sizePanels();                // keep scroll areas fitted after filter
    updateClearAffordance();     // update "Clear" enable + styling
  }

  // ---------- Gantt ----------
  function renderGantt(acts) {
    const el = document.getElementById('gantt-container');
    if (!el) return;

    if (!acts.length) {
      el.innerHTML = `<div style="padding:16px; opacity:.75">No activities for Gantt.</div>`;
      return;
    }

    // collect date range (coerce missing dates to today so bars don't blow out)
    const today = new Date();
    const sDates = acts.map(a => a.start ? new Date(a.start) : today);
    const eDates = acts.map(a => a.end   ? new Date(a.end)   : today);
    const min = new Date(Math.min(...sDates.map(d=>+d)));
    const max = new Date(Math.max(...eDates.map(d=>+d)));
    // inclusive days
    const DAY = 24*60*60*1000;
    const days = Math.max(1, Math.round((max - min) / DAY) + 1);

    // build header ticks (weekly)
    const ticks = [];
    for (let i=0;i<days;i++){
      const d = new Date(min.getTime() + i*DAY);
      if (i===0 || d.getDay()===1) {
        const lab = `${d.getMonth()+1}/${d.getDate()}`;
        ticks.push({ i, label: lab });
      }
    }

    // construct DOM
    const rowsHtml = acts.map(a=>{
      const ds = a.start ? new Date(a.start) : min;
      const de = a.end   ? new Date(a.end)   : (a.start ? new Date(a.start) : min);
      const left = Math.max(0, Math.min(days, Math.round((ds - min)/DAY)));
      const len  = Math.max(1, Math.round((de - ds)/DAY)+1);
      const leftPct = (left/days)*100;
      const widthPct= (len/days)*100;

      return `
        <div class="row">
          <div class="label">${esc(a.title)}</div>
          <div class="lane">
            <div class="bar" style="left:${leftPct}%; width:${widthPct}%"></div>
          </div>
        </div>`;
    }).join("");

    const ticksHtml = ticks.map(t=>{
      const leftPct = (t.i/days)*100;
      return `<div class="tick" style="left:${leftPct}%"><span>${esc(t.label)}</span></div>`;
    }).join("");

    el.innerHTML = `
      <div class="gantt">
        <div class="header">
          <div class="ticks">${ticksHtml}</div>
        </div>
        <div class="grid">
          <div></div>
          <div style="position:relative; height:0; border-top:1px solid rgba(255,255,255,.08)"></div>
        </div>
        ${rowsHtml}
      </div>
    `;

    requestAnimationFrame(()=>{
      const gap = 56;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const h = Math.max(220, vh - rect.top - gap);
      el.style.minHeight = h + 'px';
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

  // Owner list for Add Activity = active squad members (display names)
  function populateOwnerOptions({ members, empMap, squadId, meId }) {
    const sel = document.getElementById('act-owner'); if (!sel) return;
    const rows = members.filter(r => norm(r["Squad ID"]) === norm(squadId) && isTrue(r["Active"]));

    const seen = new Set();
    const opts = rows.map(r => {
        const id = String(r["Employee ID"]||"").trim();
        return { id, name: (empMap.get(id) || id) };
      })
      .filter(p => p.id && !seen.has(p.id) && seen.add(p.id));

    sel.innerHTML = opts.map(p =>
      `<option value="${esc(p.name)}" data-id="${esc(p.id)}">${esc(p.name)}</option>`
    ).join("") || `<option value="">—</option>`;

    if (meId) {
      const idx = opts.findIndex(p => p.id.toLowerCase() === meId.toLowerCase());
      if (idx >= 0) sel.selectedIndex = idx;
    }
  }

  // Add Activity -> write to Smartsheet
  async function createActivity({ squadId, squadName }) {
    const title = document.getElementById('act-title').value.trim();
    const type  = document.getElementById('act-type').value.trim() || "Other";
    const status= document.getElementById('act-status-modal').value.trim();
    const start = toISO(document.getElementById('act-start').value);
    const end   = toISO(document.getElementById('act-end').value) || start;

    const ownerSel  = document.getElementById('act-owner');
    const ownerName = ownerSel?.selectedOptions[0]?.text || ownerSel?.value || "";
    const ownerId   = ownerSel?.selectedOptions[0]?.dataset?.id || "";

    const desc  = document.getElementById('act-desc').value.trim();

    if (!title) { alert("Title is required."); return; }
    if (!status || !/^(Not Started|In Progress|Completed|Canceled|Cancelled)$/i.test(status)) {
      alert("Status must be one of: Not Started, In Progress, Completed, Canceled/Cancelled."); return;
    }

    const row = {
      "Squad ID": squadId,
      "Squad": squadName,
      "Activity Title": title,
      "Title": title,
      "Type": type,
      "Status": status,
      "Start Date": start,
      "End/Due Date": end,
      "Owner (Display Name)": ownerName,
      "Owner": ownerName,
      "Owner ID": ownerId,
      "Description": desc,
      "Notes": desc
    };

    await api.addRows("SQUAD_ACTIVITIES", [row], { toTop: true });
    api.clearCache(api.SHEETS.SQUAD_ACTIVITIES);
    return true;
  }

  // ---------- Log Power Hour (modal) ----------
  function openLogHourModal(activityId) {
    const m = document.getElementById('logHourModal');
    if (!m) { alert("Log Power Hour modal not found on this page."); return; }
    (document.getElementById('lh-activity-id')||{}).value = activityId || "";
    const d = document.getElementById('lh-date');
    if (d && !d.value) d.value = new Date().toISOString().slice(0,10);
    showModal('logHourModal');
  }

  function parseHhMmToMinutes(str){
    if (!str) return null;
    const m = String(str).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = +m[1], mm = +m[2];
    return (Number.isFinite(hh) && Number.isFinite(mm)) ? (hh*60 + mm) : null;
  }

  async function savePowerHour() {
    const aid = (document.getElementById('lh-activity-id')||{}).value || "";
    const date = toISO(document.getElementById('lh-date')?.value);
    const start = document.getElementById('lh-start')?.value || "";
    const end   = document.getElementById('lh-end')?.value || "";
    const durIn = document.getElementById('lh-dur')?.value || "";
    const scheduled = !!document.getElementById('lh-scheduled')?.checked;
    const completed = !!document.getElementById('lh-completed')?.checked;
    const notes     = document.getElementById('lh-notes')?.value?.trim() || "";

    // derive hours if duration empty but time range provided
    let hours = parseFloat(durIn);
    if (!Number.isFinite(hours) || hours <= 0) {
      const sm = parseHhMmToMinutes(start), em = parseHhMmToMinutes(end);
      if (sm != null && em != null && em > sm) {
        hours = (em - sm) / 60;
      }
    }
    if (!Number.isFinite(hours) || hours <= 0) {
      alert("Enter a Duration or a valid Start/End time.");
      return;
    }

    const row = {
      "Activity ID": aid,
      "Date": date,
      "Start": start,            // tolerant: your addRows will skip unknown titles
      "Start Time": start,
      "End": end,
      "End Time": end,
      "Scheduled": scheduled,
      "Completed": completed,
      "Completed Hours": hours,
      "Hours": hours,
      "Notes": notes,
      "Description": notes
    };

    await api.addRows("POWER_HOURS", [row], { toTop: true });
    api.clearCache(api.SHEETS.POWER_HOURS);
  }

  // modal helpers
  function showModal(id){ const m = document.getElementById(id); if (m) m.classList.add('show'); }
  function hideModal(id){ const m = document.getElementById(id); if (m) m.classList.remove('show'); }

  function wireLogHourModal() {
    const cancel = document.getElementById('lh-cancel');
    const save   = document.getElementById('lh-save');
    cancel?.addEventListener('click', ()=>hideModal('logHourModal'));
    save?.addEventListener('click', async ()=>{
      try{
        await savePowerHour();
        hideModal('logHourModal');
        // refresh rollups / activities
        const urlId = qs("id") || qs("squadId") || qs("squad");
        const sid = urlId ? String(urlId).trim() : "";
        // pull current squad id/name from header
        const squadName = document.getElementById('sqd-name')?.textContent || "";
        const fresh = await loadActivitiesForSquad(sid, squadName);
        renderKpis(fresh.items, fresh.hoursByActDone, fresh.hoursByActPlan);
        renderActivities(fresh.items, fresh.hoursByActDone, true);
        buildDependentFilters(fresh.items, fresh.hoursByActDone);
        renderGantt(fresh.items);
        sizePanels();
      } catch(e){
        console.error(e);
        alert("Failed to log power hours.");
      }
    });
  }

  // ---------- Filter “chip group” affordance ----------
  function injectFilterStyles() {
    // only styles related to the filter group and the pill button
    const css = `
      .acts-tools {
        display:flex; align-items:center; gap:8px; padding:6px;
        border:1px solid #2d3f3f; border-radius:999px; background:#0f1a1a;
      }
      .acts-tools.filtered {
        border-color: var(--accent);
        box-shadow: 0 0 0 1px rgba(0,255,200,.15);
      }
      #btn-clear-filters {
        border-radius:999px; padding:6px 10px; font-weight:700;
        border:1px solid #2d3f3f; color:#9ca3af; background:transparent;
        opacity:.5; cursor:not-allowed;
      }
      #btn-clear-filters:not([disabled]) {
        opacity:1; cursor:pointer;
        border-color: var(--accent); color: var(--accent);
      }
      .btn.pill { border-radius:999px; }
      .btn.accent { border:1px solid var(--accent); color: var(--accent); background: transparent; }
      .btn.accent:hover { background: rgba(34,197,154,.12); }
    `;
    const tag = document.createElement('style');
    tag.setAttribute('data-squad-details-filters', '1');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function updateClearAffordance(){
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    const clear  = document.getElementById("btn-clear-filters");
    const bar    = document.querySelector(".acts-tools");
    const isDefault = (colSel?.value === 'status') && (valSel?.value === '__ALL__');
    if (clear) {
      clear.disabled = !!isDefault;
    }
    if (bar) {
      bar.classList.toggle('filtered', !isDefault);
    }
  }

  // ---------- viewport sizing ----------
  function sizePanels() {
    const GAP = 56;
    const vh = window.innerHeight || document.documentElement.clientHeight;

    function fit(el) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const h = Math.max(180, vh - rect.top - GAP);
      el.style.maxHeight = h + 'px';
      el.style.height = h + 'px';
    }

    fit(document.querySelector('.members-scroll'));

    const tablePanel = document.getElementById('view-table');
    const ganttPanel = document.getElementById('view-gantt');
    const calPanel   = document.getElementById('view-calendar');

    if (tablePanel && !tablePanel.hidden) {
      fit(tablePanel.querySelector('.acts-scroll'));
    }
    if (ganttPanel && !ganttPanel.hidden) {
      const gc = document.getElementById('gantt-container');
      fit(gc);
    }
    if (calPanel && !calPanel.hidden) {
      fit(calPanel.querySelector('.acts-scroll'));
    }
  }

  // ---------- seed “Type” options from Smartsheet list you sent ----------
  function seedTypeOptions() {
    const sel = document.getElementById('act-type');
    if (!sel) return;
    const TYPES = [
      "5S","Kaizen","Training","CI Suggestion","Side Quest Project",
      "Safety Concern","Quality Catch","Other"
    ];
    sel.innerHTML = TYPES.map(t=>`<option>${esc(t)}</option>`).join("");
  }

  // ---------- main ----------
  document.addEventListener("DOMContentLoaded", async () => {
    layout.injectLayout?.();
    await session.initHeader?.();

    injectFilterStyles();
    wireLogHourModal();
    seedTypeOptions();

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
      populateOwnerOptions({ members: latest, empMap, squadId, meId: norm((session.get?.() || {}).employeeId || "") });
      sizePanels();
    });

    const me = session.get?.() || {};
    const userId = (me.employeeId || "").trim();
    const canAdd = isAdmin || leaderIds.some(id => id.toLowerCase() === userId.toLowerCase());
    wireAddMemberButton({ canAdd, squadId, squadName });
    wireBackButton();

    // activities initial load
    const { items: acts, hoursByActDone, hoursByActPlan } = await loadActivitiesForSquad(squadId, squadName);
    renderKpis(acts, hoursByActDone, hoursByActPlan);
    renderActivities(acts, hoursByActDone, true);
    buildDependentFilters(acts, hoursByActDone);
    renderGantt(acts);

    // initial fit + on resize
    sizePanels();
    window.addEventListener('resize', sizePanels);

    // dependent filters + Clear
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    const rerender = () => applyDependentFilter(acts, hoursByActDone, hoursByActPlan);
    colSel?.addEventListener("change", rerender);
    valSel?.addEventListener("change", rerender);

    const clearBtn = document.getElementById('btn-clear-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        colSel.value = 'status';
        const event = new Event('change');
        colSel.dispatchEvent(event);
        valSel.value = '__ALL__';
        rerender();
      });
    }
    updateClearAffordance();

    // Owner dropdown for Add Activity
    populateOwnerOptions({ members, empMap, squadId, meId: userId });

    // Add Activity modal wiring
    const addActBtn = document.getElementById("btn-add-activity");
    const modalId = 'addActivityModal';
    document.getElementById('aa-cancel')?.addEventListener('click', ()=>hideModal(modalId));
    addActBtn?.addEventListener('click', (e)=>{ e.preventDefault(); showModal(modalId); });

    document.getElementById('aa-save')?.addEventListener('click', async ()=>{
      try{
        await createActivity({ squadId, squadName });
        hideModal(modalId);
        const fresh = await loadActivitiesForSquad(squadId, squadName);
        renderKpis(fresh.items, fresh.hoursByActDone, fresh.hoursByActPlan);
        renderActivities(fresh.items, fresh.hoursByActDone, true);
        buildDependentFilters(fresh.items, fresh.hoursByActDone);
        renderGantt(fresh.items);
        sizePanels();
        updateClearAffordance();
      } catch (err){
        console.error(err);
        alert("Failed to create activity. See console for details.");
      }
    });

    // View switch
    const tabs = [
      {btn:'view-tab-table', panel:'view-table'},
      {btn:'view-tab-gantt', panel:'view-gantt'},
      {btn:'view-tab-cal',   panel:'view-calendar'},
    ];
    tabs.forEach(t=>{
      const b = document.getElementById(t.btn), p = document.getElementById(t.panel);
      if (!b||!p) return;
      b.addEventListener('click', (e)=>{
        e.preventDefault();
        tabs.forEach(x=>{
          const bx = document.getElementById(x.btn), px = document.getElementById(x.panel);
          if (!bx||!px) return;
          const on = (x.btn===t.btn);
          bx.classList.toggle('is-active', on);
          bx.setAttribute('aria-selected', on?'true':'false');
          px.hidden = !on;
        });
        if (t.panel === 'view-gantt') renderGantt(acts);
        sizePanels();
      });
    });
  });
})(window.PowerUp || (window.PowerUp = {}));
