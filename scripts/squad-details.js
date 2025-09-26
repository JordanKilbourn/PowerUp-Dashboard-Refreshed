// scripts/squad-details.js
(function (P) {
  const { api, session, layout } = P;

  // ---------------- utils ----------------
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

  // ---------------- constants ----------------
  const ACTIVITY_TYPES = ["5S","Kaizen","Training","CI Suggestion","Side Quest Project","Safety Concern","Quality Catch","Other"];
  const STATUS_ALLOWED = ["Not Started","In Progress","Completed","Canceled"];

  // ---------------- data helpers ----------------
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

  // ---------------- renderers ----------------
  function renderMeta(squadRow, leaderNames) {
    const squadName = squadRow["Squad Name"] || squadRow["Name"] || squadRow.id || "-";
    const active = isTrue(squadRow["Active"]);
    const statusPill = active ? '<span class="pill pill--on">Active</span>' : '<span class="pill pill--off">Inactive</span>';
    const n = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val ?? "—"; };
    n("sqd-name", squadName);
    n("sqd-leader", leaderNames.join(", ") || "—");
    const st = document.getElementById("sqd-status"); if (st) st.outerHTML = statusPill;
    n("sqd-cat", squadRow["Category"] || "—");
    n("sqd-created", fmtMDYY(squadRow["Created Date"] || squadRow["Created"] || ""));
    const obj = document.querySelector("#card-objective .kv"); if (obj) obj.textContent = squadRow["Objective"] || "—";
  }

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

  function renderActivities(acts, hoursDone, configured) {
    const tb = document.getElementById("activities-tbody");
    if (!tb) return;
    if (!configured) { tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;">Activities sheet isn’t configured.</td></tr>`; return; }
    if (!acts.length) { tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;text-align:center">No activities found for this squad.</td></tr>`; return; }

    tb.innerHTML = acts.map(a => {
      const range = `${fmtMDYY(a.start)} — ${fmtMDYY(a.end)}`;
      const hrs   = hoursDone.get(a.id) || 0;
      const statusChip = `<span class="pill" style="background:#2a3440;color:#c3d5ff">${esc(a.status)}</span>`;
      const typeChip   = `<span class="pill" style="background:#2a3a3a;color:#aee">${esc(a.type)}</span>`;
      return `
        <tr data-act="${esc(a.id)}" data-title="${esc(a.title)}">
          <td>${esc(a.title)}</td>
          <td>${statusChip}</td>
          <td>${typeChip}</td>
          <td>${esc(range)}</td>
          <td class="owner">${esc(a.owner || "-")}</td>
          <td style="text-align:right">${hrs}</td>
          <td class="row-actions">
            <button class="btn small" data-action="log-ph">Log&nbsp;Hours</button>
          </td>
        </tr>
      `;
    }).join("");

    tb.querySelectorAll('button[data-action="log-ph"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const tr = btn.closest('tr');
        const actId = tr?.getAttribute('data-act') || '';
        openLogHourModal(actId);
      });
    });
  }

  // ---------------- filters ----------------
  function injectFilterStyles() {
    const css = `
      :root{ --filter-blue:#3B82F6; }
      .acts-tools{display:flex;align-items:center;gap:10px;margin:6px 0 8px;}
      .acts-filter-group{display:flex;align-items:center;gap:10px;padding:6px 8px;border:1px solid #2d3f3f;border-radius:999px;background:#0f1a1a;}
      .acts-filter-group select{background:#0f1a1a;border:1px solid #2d3f3f;border-radius:999px;padding:6px 10px;color:#e5e7eb;}
      .btn-clear{padding:6px 12px;border-radius:999px;border:1px solid #2d3f3f;background:transparent;color:#cbd5e1;opacity:.65;transition:all .15s;}
      .btn-clear[disabled]{opacity:.35;cursor:not-allowed}
      .acts-filter-group.active{border-color:var(--filter-blue);}
      .acts-filter-group.active .btn-clear{opacity:1;border-color:var(--filter-blue);color:var(--filter-blue);}
      .acts-filter-group.active .btn-clear:hover{box-shadow:0 0 0 2px rgba(59,130,246,.2) inset;}
    `;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  }
  function setupFilterGroup() {
    const tools = document.querySelector('.acts-tools'); if (!tools) return;
    const colSel = document.getElementById('act-col');
    const valSel = document.getElementById('act-val');
    const clearBtn = document.getElementById('btn-clear-filters');
    const addBtn = document.getElementById('btn-add-activity');

    const group = document.createElement('div');
    group.className = 'acts-filter-group';
    if (colSel) group.appendChild(colSel);
    if (valSel) group.appendChild(valSel);
    if (clearBtn) { clearBtn.classList.add('btn-clear'); group.appendChild(clearBtn); }

    tools.innerHTML = '';
    tools.appendChild(group);
    if (addBtn) tools.appendChild(addBtn);

    updateClearBtnState();
  }
  function updateClearBtnState() {
    const colSel = document.getElementById('act-col');
    const valSel = document.getElementById('act-val');
    const grp = document.querySelector('.acts-filter-group');
    const clearBtn = document.getElementById('btn-clear-filters');
    if (!colSel || !valSel || !grp || !clearBtn) return;
    const isDefault = (colSel.value === 'status' && (valSel.value || '__ALL__') === '__ALL__');
    clearBtn.disabled = isDefault; grp.classList.toggle('active', !isDefault);
  }
  function buildDependentFilters(allActs, hoursDone) {
    const colSel = document.getElementById("act-col");
    const valSel = document.getElementById("act-val");
    if (!colSel || !valSel) return;
    const cols = [
      {key:"status", label:"Status", get:a=>a.status},
      {key:"type",   label:"Type",   get:a=>a.type},
      {key:"owner",  label:"Owner",  get:a=>a.owner||"-"},
      {key:"hours",  label:"Completed PH", get:a=>String(hoursDone.get(a.id)||0)},
      {key:"title",  label:"Title",  get:a=>a.title},
      {key:"start",  label:"Start",  get:a=>fmtMDYY(a.start)},
      {key:"end",    label:"End",    get:a=>fmtMDYY(a.end)},
    ];
    function setValuesFor(colKey){
      const col = cols.find(c=>c.key===colKey) || cols[0];
      const vals = Array.from(new Set(allActs.map(a => col.get(a)))).filter(v=>v!==undefined && v!==null);
      valSel.innerHTML = `<option value="__ALL__">All values</option>` + vals.map(v=>`<option>${esc(v)}</option>`).join("");
      valSel.disabled = false; updateClearBtnState();
    }
    colSel.innerHTML = cols.map(c=>`<option value="${c.key}" ${c.key==='status'?'selected':''}>${c.label}</option>`).join("");
    setValuesFor(colSel.value);
    colSel.addEventListener('change', () => setValuesFor(colSel.value));
    valSel.addEventListener('change', updateClearBtnState);
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
    renderGantt(filtered);
  }

  // ---------------- gantt (compact) ----------------
  function injectGanttStyles() {
    const css = `
      .gantt2{width:100%;padding:8px 4px 10px;}
      .g2-header{display:grid;gap:2px;margin:6px 0 8px;}
      .g2-header .cell{font-size:11px;color:#a8b3be;text-align:center;padding:4px 0;background:#0f1a1a;border:1px solid #1e2b2b;border-radius:6px;}
      .g2-row{display:grid;grid-template-columns:240px 1fr;align-items:center;gap:10px;margin:6px 0;}
      .g2-label{color:#e5e7eb;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:6px;}
      .g2-lane{display:grid;gap:2px;}
      .g2-lane .cell{height:22px;background:#0c1416;border:1px solid #172628;border-radius:6px;}
      .g2-bar{height:18px;margin:2px 0;border-radius:999px;background:linear-gradient(180deg,#79d0bd,#58b9a7);box-shadow:0 1px 0 rgba(0,0,0,.4) inset,0 2px 6px rgba(0,0,0,.25);}
      .g2-footerpad{height:4px;}
    `;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  }
  function renderGantt(acts) {
    const el = document.getElementById('gantt-container'); if (!el) return;
    if (!acts?.length) { el.innerHTML = `<div style="padding:16px;opacity:.75">No activities for Gantt.</div>`; return; }
    const DAY = 24*60*60*1000;
    const today = new Date();
    const sDates = acts.map(a => a.start ? new Date(a.start) : today);
    const eDates = acts.map(a => a.end   ? new Date(a.end)   : (a.start ? new Date(a.start) : today));
    const min = new Date(Math.min(...sDates.map(d=>+d)));
    const max = new Date(Math.max(...eDates.map(d=>+d)));
    const days = Math.max(1, Math.round((max - min) / DAY) + 1);
    const headerCols = `repeat(${days},1fr)`;
    const every = days > 28 ? 3 : days > 18 ? 2 : 1;
    const headerCells = [];
    for (let i=0;i<days;i++){
      const d = new Date(min.getTime()+i*DAY);
      headerCells.push(`<div class="cell">${(i%every===0)?`${d.getMonth()+1}/${d.getDate()}`:""}</div>`);
    }
    const rowsHtml = acts.map(a=>{
      const ds = a.start ? new Date(a.start) : min;
      const de = a.end   ? new Date(a.end)   : ds;
      const startIdx = Math.max(0, Math.round((ds - min) / DAY));
      const span = Math.max(1, Math.round((de - ds) / DAY) + 1);
      return `
        <div class="g2-row">
          <div class="g2-label">${esc(a.title)}</div>
          <div class="g2-lane" style="grid-template-columns:${headerCols}">
            ${Array.from({length:days}).map(()=>`<div class="cell"></div>`).join("")}
            <div class="g2-bar" style="grid-column:${startIdx+1} / span ${span}"></div>
          </div>
        </div>
      `;
    }).join("");
    el.innerHTML = `
      <div class="gantt2">
        <div class="g2-header" style="grid-template-columns:${headerCols}">${headerCells.join("")}</div>
        ${rowsHtml}
        <div class="g2-footerpad"></div>
      </div>`;
    requestAnimationFrame(sizeSquadScrollers); // ensure height after render
  }

  // ---------------- table header/alignments (rolled back tweak) ----------------
  function injectTableStyles() {
    const css = `
      /* scope styles to this table only */
      .acts-table{ width:100%; border-collapse:separate; border-spacing:0; }

      /* clearly different header row */
      .acts-table thead th{
        text-align:left;
        background:#0f1a1a;
        border-bottom:1px solid #1e2b2b;
        position:sticky; top:0; z-index:1;
        font-weight:700;
        padding:10px 12px;
      }
      .acts-table tbody td{ padding:10px 12px; vertical-align:middle; }

      /* column alignment (1=Title, 2=Status, 3=Type, 4=Start–End, 5=Owner, 6=Completed PH, 7=Actions) */
      .acts-table th:nth-child(1), .acts-table td:nth-child(1),
      .acts-table th:nth-child(5), .acts-table td:nth-child(5){ text-align:left; }

      .acts-table th:nth-child(2), .acts-table td:nth-child(2),
      .acts-table th:nth-child(3), .acts-table td:nth-child(3),
      .acts-table th:nth-child(4), .acts-table td:nth-child(4){ text-align:center; }

      .acts-table th:nth-child(6), .acts-table td:nth-child(6){ text-align:right; }   /* Completed PH */
      .acts-table th:nth-child(7), .acts-table td:nth-child(7){ text-align:right; }   /* Log Hours */
    `;
    const style = document.createElement('style');
    style.id = 'pu-acts-table-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------------- back + member button ----------------
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
    const btn = document.getElementById("btn-addmember"); if (!btn) return;
    btn.hidden = !canAdd; btn.disabled = !canAdd;
    const handler = (e) => {
      e.preventDefault();
      if (P.squadForm && typeof P.squadForm.open === "function") P.squadForm.open({ squadId, squadName });
      else alert("Member form not found. Please include scripts/squad-member-form.js earlier on the page.");
    };
    if (btn._amHandler) btn.removeEventListener("click", btn._amHandler);
    btn._amHandler = handler; btn.addEventListener("click", handler);
  }

  // ---------------- owner options & forms ----------------
  function populateOwnerOptions({ members, empMap, squadId/*, meId*/ }) {
    const sel = document.getElementById('act-owner'); if (!sel) return;
    const rows = members.filter(r => norm(r["Squad ID"]) === norm(squadId) && isTrue(r["Active"]));
    const seen = new Set();
    const opts = rows.map(r => {
      const id = String(r["Employee ID"]||"").trim();
      return { id, name: (empMap.get(id) || id) };
    }).filter(p => p.id && !seen.has(p.id) && seen.add(p.id));
    sel.innerHTML = opts.map(p => `<option value="${esc(p.name)}" data-id="${esc(p.id)}">${esc(p.name)}</option>`).join("") || `<option value="">—</option>`;
  }

  // >>> helper to enforce placeholder for selects
  function setPlaceholderSelect(sel, text){
    if (!sel) return;
    let ph = sel.querySelector('option[data-ph="1"]');
    if (!ph) {
      ph = document.createElement('option');
      ph.value = "";
      ph.disabled = true;
      ph.hidden = true;
      ph.setAttribute('data-ph','1');
      ph.textContent = text;
      sel.insertBefore(ph, sel.firstChild);
    }
    sel.value = "";               // select the placeholder
    sel.selectedIndex = 0;
  }

  function resetAddActivityForm() {
    const t = document.getElementById('act-title'); if (t) t.value = '';
    const ty = document.getElementById('act-type'); if (ty) setPlaceholderSelect(ty, 'Select type…');
    const st = document.getElementById('act-status-modal'); if (st) setPlaceholderSelect(st, 'Select status…');
    const s = document.getElementById('act-start'); if (s) s.value = '';
    const e = document.getElementById('act-end');   if (e) e.value = '';
    const d = document.getElementById('act-desc');  if (d) d.value = '';
    const ow = document.getElementById('act-owner'); if (ow) setPlaceholderSelect(ow, 'Select owner…');
  }

  function ensureModalUX(modalId){
    const modal = document.getElementById(modalId); if (!modal) return;
    if (modal.querySelector('.modal-ux')) return;
    const ux = document.createElement('div');
    ux.className = 'modal-ux';
    ux.style.cssText = "position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45);z-index:2;border-radius:10px;";
    ux.innerHTML = `<div class="box" style="background:#0f1a1a;border:1px solid #2d3f3f;padding:14px 16px;border-radius:10px;min-width:220px;text-align:center"><div class="msg" style="color:#e5e7eb;font-weight:700">Saving…</div></div>`;
    modal.querySelector('.panel')?.appendChild(ux);
  }
  function showBusy(modalId,text){ ensureModalUX(modalId); const el=document.querySelector(`#${modalId} .modal-ux`); if(el){ el.style.display='flex'; const m=el.querySelector('.msg'); if(m) m.textContent=text||'Saving…'; } }
  async function flashSuccess(modalId){ const el=document.querySelector(`#${modalId} .modal-ux .msg`); if(!el) return; el.textContent='Saved!'; el.style.color='#20d3a8'; await new Promise(r=>setTimeout(r,650)); }
  function hideBusy(modalId){ const el=document.querySelector(`#${modalId} .modal-ux`); if(el) el.style.display='none'; }

  // ---- Power Hours (UPDATED) ----
  let gSquadId = "";      // set in MAIN
  let gSquadName = "";    // set in MAIN
  let gActsById = new Map(); // id -> {title,...}

  function calcHours(startStr, endStr) {
    if (!startStr || !endStr) return 0;
    const [sh, sm] = startStr.split(':').map(n=>parseInt(n,10));
    const [eh, em] = endStr.split(':').map(n=>parseInt(n,10));
    if ([sh,sm,eh,em].some(n => Number.isNaN(n))) return 0;
    let mins = (eh*60+em) - (sh*60+sm); if (mins < 0) mins += 24*60;
    return Math.round((mins/60)*100)/100;
  }

  function updateDurField(){
    const s = document.getElementById('lh-start')?.value || '';
    const e = document.getElementById('lh-end')?.value || '';
    const dur = calcHours(s, e);
    const dh = document.getElementById('lh-dur');
    if (dh) dh.value = dur ? String(dur) : '';
  }

  function resetLogHourForm() {
    const nowISO = new Date().toISOString().slice(0,10);
    const d = document.getElementById('lh-date'); if (d) { d.setAttribute('value', nowISO); d.value = nowISO; }
    const s = document.getElementById('lh-start'); if (s) s.value='';
    const e = document.getElementById('lh-end');   if (e) e.value='';
    const dh= document.getElementById('lh-dur');   if (dh) { dh.value=''; dh.readOnly = true; }
    const sch=document.getElementById('lh-scheduled'); if (sch) sch.checked=false;
    const comp=document.getElementById('lh-completed'); if (comp) comp.checked=true;
    const sq = document.getElementById('lh-squad'); if (sq) sq.value = '';
    const at = document.getElementById('lh-activity-title'); if (at) at.value = '';
    const hidAid = document.getElementById('lh-activity-id'); if (hidAid) hidAid.value = '';
    const hidSid = document.getElementById('lh-squad-id'); if (hidSid) hidSid.value = '';
  }

  function openLogHourModal(activityId) {
    resetLogHourForm();
    const act = gActsById.get(activityId);
    const title = act?.title || '';
    document.getElementById('lh-activity-id')?.setAttribute('value', activityId || '');
    const sidEl = document.getElementById('lh-squad-id');
    if (sidEl) sidEl.setAttribute('value', gSquadId || '');
    const squadEl = document.getElementById('lh-squad'); if (squadEl) squadEl.value = gSquadName || '';
    const at = document.getElementById('lh-activity-title'); if (at) at.value = title || '';
    showModal('logHourModal');
  }

  async function saveLogHours() {
    const actId = document.getElementById('lh-activity-id')?.value || '';
    const actTitle = document.getElementById('lh-activity-title')?.value || '';
    const squadId = document.getElementById('lh-squad-id')?.value || '';
    const squadName = document.getElementById('lh-squad')?.value || '';

    const date = toISO(document.getElementById('lh-date')?.value || '');
    const start = document.getElementById('lh-start')?.value || '';
    const end   = document.getElementById('lh-end')?.value || '';
    const sch   = !!document.getElementById('lh-scheduled')?.checked;
    const comp  = !!document.getElementById('lh-completed')?.checked;

    // Recompute duration (auto) but allow typed value if times missing
    let dur = document.getElementById('lh-dur')?.value || '';
    const calc = calcHours(start, end);
    if (calc) dur = String(calc);

    // ---- Validation (prevent blank rows)
    if (!date) { alert("Date is required."); return; }
    if (!sch && !comp) { alert("Choose Scheduled and/or Completed."); return; }
    if (!dur || Number(dur) <= 0) {
      alert("Provide Start & End (to auto-calc) or a positive Duration.");
      return;
    }

    // Session -> employee
    const me = (session.get?.() || {});
    const empId = (me.employeeId || me.id || "").toString().trim();
    const empName = (me.displayName || me.name || me.fullName || "").toString().trim();

    const row = {
      "Date": date,
      "Start": start,
      "End": end,
      "Completed Hours": Number(dur) || 0,
      "Scheduled": sch,
      "Completed": comp,

      // Associations (for reporting + joins)
      "Squad ID": squadId,
      "Squad": squadName,
      "Activity ID": actId,
      "Activity": actTitle,              // keep this for lookups already in code
      "Activity Title": actTitle,        // also store explicit title

      // Who did it
      "Employee ID": empId,
      "Employee Name": empName
    };

    await api.addRows("POWER_HOURS", [row], { toTop: true });
    api.clearCache(api.SHEETS.POWER_HOURS);
  }

  // ---- modal helpers ----
  function showModal(id){ const m = document.getElementById(id); if (m) m.classList.add('show'); }
  function hideModal(id){ const m = document.getElementById(id); if (m) m.classList.remove('show'); }

  // ---------------- viewport sizing (UPDATED for hidden panels) ----------------
  function sizeSquadScrollers() {
    const gap = 24;

    // Always fit members list
    fitEl(document.querySelector('.members-scroll'));

    // Fit only the currently-visible acts scroller
    const visiblePanel = document.querySelector('#activities-views > [role="tabpanel"]:not([hidden]) .acts-scroll');
    fitEl(visiblePanel);

    // Also ensure gantt min height feels right when visible
    fitEl(document.getElementById('gantt-container'));

    function fitEl(el){
      if (!el) return;
      // If hidden, skip (we size it after tab switch)
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || el.closest('[hidden]')) return;

      const rect = el.getBoundingClientRect();
      const top = rect.top || el.offsetTop || 0;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const h = Math.max(140, vh - top - gap);
      el.style.maxHeight = h + 'px';
      el.style.height = h + 'px';
    }
  }

  // >>> view wiring (Table / Gantt / Calendar) — ensure sizing after switch
  function wireViews(getActsRef){
    const findBtn = (ids)=> ids.map(id=>document.getElementById(id)).find(Boolean);
    const tableBtn = findBtn(['view-tab-table','btn-view-table']);
    const ganttBtn = findBtn(['view-tab-gantt','btn-view-gantt']);
    const calBtn   = findBtn(['view-tab-cal','btn-view-calendar']);

    const tablePanel = document.getElementById('view-table');
    const ganttPanel = document.getElementById('view-gantt');
    const calPanel   = document.getElementById('view-calendar');

    if (!tablePanel || !ganttPanel || !calPanel) return;

    let current = !ganttPanel.hidden ? 'gantt' : (!calPanel.hidden ? 'cal' : 'table');

    function setActive(btn, on){
      if (!btn) return;
      btn.classList.toggle('is-active', !!on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    function show(view){
      current = view;
      tablePanel.hidden = view !== 'table';
      ganttPanel.hidden = view !== 'gantt';
      calPanel.hidden   = view !== 'cal';
      setActive(tableBtn, view==='table');
      setActive(ganttBtn, view==='gantt');
      setActive(calBtn,   view==='cal');

      if (view === 'gantt') {
        const acts = getActsRef();
        renderGantt(acts);
      }
      // Size AFTER the panel becomes visible
      requestAnimationFrame(sizeSquadScrollers);
    }

    tableBtn && tableBtn.addEventListener('click', (e)=>{ e.preventDefault(); show('table'); });
    ganttBtn && ganttBtn.addEventListener('click', (e)=>{ e.preventDefault(); show('gantt'); });
    calBtn   && calBtn.addEventListener('click', (e)=>{ e.preventDefault(); show('cal'); });

    // ensure the currently-visible one is synced
    show(current);
  }

  // ---------------- MAIN (single guarded block) ----------------
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      layout.injectLayout?.();
      await session.initHeader?.();

      injectFilterStyles();
      injectGanttStyles();
      injectTableStyles();

      // tag the Activities table once so CSS can target it safely
      document.getElementById('activities-tbody')?.closest('table')?.classList.add('acts-table');

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
      gSquadId = squadId; gSquadName = squadName;

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

      const { items: acts, hoursByActDone, hoursByActPlan } = await loadActivitiesForSquad(squadId, squadName);
      // index activities for modal prefill
      gActsById = new Map(acts.map(a => [a.id, a]));

      renderKpis(acts, hoursByActDone, hoursByActPlan);
      renderActivities(acts, hoursByActDone, true);
      buildDependentFilters(acts, hoursByActDone);
      renderGantt(acts);

      // filter group & events
      setupFilterGroup();
      let currentActs = acts; // >>> keep a ref for Gantt/Calendar view switching
      const colSel = document.getElementById("act-col");
      const valSel = document.getElementById("act-val");
      const rerender = () => {
        applyDependentFilter(currentActs, hoursByActDone, hoursByActPlan);
      };
      colSel?.addEventListener("change", rerender);
      valSel?.addEventListener("change", rerender);
      const clearBtn = document.getElementById('btn-clear-filters');
      if (clearBtn) clearBtn.addEventListener('click', (e)=>{
        e.preventDefault(); colSel.value='status'; colSel.dispatchEvent(new Event('change')); valSel.value='__ALL__'; updateClearBtnState(); rerender();
      });

      // add activity modal
      populateOwnerOptions({ members, empMap, squadId, meId: userId });
      const typeSel = document.getElementById('act-type'); if (typeSel) typeSel.innerHTML = ACTIVITY_TYPES.map(t=>`<option>${esc(t)}</option>`).join("");
      const addActBtn = document.getElementById("btn-add-activity");
      const modalAddId = 'addActivityModal';
      document.getElementById('aa-cancel')?.addEventListener('click', ()=>{ resetAddActivityForm(); hideModal(modalAddId); });
      addActBtn?.addEventListener('click', (e)=>{ e.preventDefault(); resetAddActivityForm(); showModal(modalAddId); });
      document.getElementById('aa-save')?.addEventListener('click', async ()=>{
        try {
          showBusy(modalAddId,'Saving…');
          await createActivity({ squadId, squadName });
          await flashSuccess(modalAddId);
          resetAddActivityForm();
          hideBusy(modalAddId); hideModal(modalAddId);
          const fresh = await loadActivitiesForSquad(squadId, squadName);
          currentActs = fresh.items; // >>> refresh acts reference
          gActsById = new Map(fresh.items.map(a => [a.id, a]));
          renderKpis(fresh.items, fresh.hoursByActDone, fresh.hoursByActPlan);
          renderActivities(fresh.items, fresh.hoursByActDone, true);
          buildDependentFilters(fresh.items, fresh.hoursByActDone);
          renderGantt(fresh.items); setupFilterGroup();
        } catch(err){ console.error(err); hideBusy(modalAddId); alert("Failed to create activity. See console for details."); }
      });

      // log hours modal
      const modalPHId = 'logHourModal';
      document.getElementById('lh-cancel')?.addEventListener('click', ()=>{ resetLogHourForm(); hideModal(modalPHId); });

      // auto-calc duration as user types times
      document.getElementById('lh-start')?.addEventListener('input', updateDurField);
      document.getElementById('lh-end')?.addEventListener('input', updateDurField);

      document.getElementById('lh-save')?.addEventListener('click', async ()=>{
        try {
          showBusy(modalPHId,'Saving…');
          await saveLogHours();
          await flashSuccess(modalPHId);
          resetLogHourForm();
          hideBusy(modalPHId); hideModal(modalPHId);
          const fresh = await loadActivitiesForSquad(squadId, squadName);
          currentActs = fresh.items; // >>> refresh acts reference
          gActsById = new Map(fresh.items.map(a => [a.id, a]));
          renderKpis(fresh.items, fresh.hoursByActDone, fresh.hoursByActPlan);
          renderActivities(fresh.items, fresh.hoursByActDone, true);
          buildDependentFilters(fresh.items, fresh.hoursByActDone);
          renderGantt(fresh.items); setupFilterGroup();
        } catch(err){ console.error(err); hideBusy(modalPHId); alert("Failed to log power hours. See console for details."); }
      });

      // >>> wire Table / Gantt / Calendar buttons (uses currentActs ref)
      wireViews(()=>currentActs);

      // viewport sizing (first paint + on resize)
      sizeSquadScrollers();
      window.addEventListener('resize', sizeSquadScrollers);
    } catch (err) {
      console.error("squad-details init failed:", err);
    }
  });
})(window.PowerUp || (window.PowerUp = {}));
