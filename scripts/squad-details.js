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
      const actionLabel = /completed/i.test(a.status) ? "View" : "Log Hour";
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
            <button class="btn small ghost" data-act="${esc(a.id)}" data-action="${/completed/i.test(a.status)?'view':'log-ph'}">${actionLabel}</button>
          </td>
        </tr>
      `;
    }).join("");

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
      // show label each Monday or first day
      if (i===0 || d.getDay()===1) {
        const lab = `${d.getMonth()+1}/${d.getDate()}`;
        ticks.push({ i, label: lab });
      }
    }

    // construct DOM
    const rowsHtml = acts.map(a=>{
      // normalize invalid/missing dates to min/max so we don’t overflow
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

    // stretch Gantt vertically to near bottom without touching the page edge
    requestAnimationFrame(()=>{
      const gap = 56; // match bottom page gap
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

  // Build [{id: employeeId, name: displayName}] and de-dupe by id
  const seen = new Set();
  const opts = rows.map(r => {
      const id = String(r["Employee ID"]||"").trim();
      return { id, name: (empMap.get(id) || id) };
    })
    .filter(p => p.id && !seen.has(p.id) && seen.add(p.id));

  // value = display name (what the user sees/keeps), data-id = hidden Employee ID
  sel.innerHTML = opts.map(p =>
    `<option value="${esc(p.name)}" data-id="${esc(p.id)}">${esc(p.name)}</option>`
  ).join("") || `<option value="">—</option>`;

  // Preselect me (by ID) if present
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
  const ownerId   = ownerSel?.selectedOptions[0]?.dataset?.id || ""; // hidden Employee ID

  const desc  = document.getElementById('act-desc').value.trim();

  if (!title) { alert("Title is required."); return; }
  if (!status || !/^(Not Started|In Progress|Completed|Canceled)$/i.test(status)) {
    alert("Status must be one of: Not Started, In Progress, Completed, Canceled."); return;
  }

  const row = {
    // Do NOT write Activity ID; let Smartsheet auto-number if configured
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
    "Owner ID": ownerId,            // <- hidden employee ID written here
    "Description": desc,
    "Notes": desc
  };

  await api.addRows("SQUAD_ACTIVITIES", [row], { toTop: true });
  api.clearCache(api.SHEETS.SQUAD_ACTIVITIES);
  return true;
}

  // modal helpers
  function showModal(id){ const m = document.getElementById(id); if (m) m.classList.add('show'); }
  function hideModal(id){ const m = document.getElementById(id); if (m) m.classList.remove('show'); }

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
      populateOwnerOptions({ members: latest, empMap, squadId, meId: norm((session.get?.() || {}).employeeId || "") });
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
        // rebuild values for default column
        const event = new Event('change');
        colSel.dispatchEvent(event);
        valSel.value = '__ALL__';
        rerender();
      });
    }

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
      });
    });
  });
})(window.PowerUp || (window.PowerUp = {}));
