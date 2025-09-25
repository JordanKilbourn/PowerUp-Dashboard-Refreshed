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

    // Hours rollups
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
      const statusChip = `<span class="pill" style="background:#2a3440;color:#c3d5ff">${esc(a.status)}</span>`;
      const typeChip   = `<span class="pill" style="background:#2a3a3a;color:#aee">${esc(a.type)}</span>`;
      return `
        <tr>
          <td>${esc(a.title)}</td>
          <td>${statusChip}</td>
          <td>${typeChip}</td>
          <td>${esc(range)}</td>
          <td class="owner">${esc(a.owner || "-")}</td>
          <td class="ph" style="text-align:right">${hrs}</td>
          <td class="row-actions">
            <button class="btn small ghost btn-log" data-act="${esc(a.id)}">Log&nbsp;Hours</button>
          </td>
        </tr>
      `;
    }).join("");

    // row actions
    tb.querySelectorAll('.btn-log').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const actId = btn.getAttribute('data-act') || '';
        openLogHoursModal(actId);
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
    // toggle active styling for the filter cluster
    const wrap = document.querySelector('.acts-tools');
    if (wrap) wrap.classList.toggle('is-active', !(val==="__ALL__" && colKey==="status"));
  }

  // ---------- Gantt (unchanged layout logic; view switch handles rendering) ----------
  function renderGantt(acts) {
    const el = document.getElementById('gantt-container');
    if (!el) return;

    if (!acts.length) {
      el.innerHTML = `<div style="padding:16px; opacity:.75">No activities for Gantt.</div>`;
      return;
    }

    const today = new Date();
    const sDates = acts.map(a => a.start ? new Date(a.start) : today);
    const eDates = acts.map(a => a.end   ? new Date(a.end)   : today);
    const min = new Date(Math.min(...sDates.map(d=>+d)));
    const max = new Date(Math.max(...eDates.map(d=>+d)));
    const DAY = 24*60*60*1000;
    const days = Math.max(1, Math.round((max - min) / DAY) + 1);

    const ticks = [];
    for (let i=0;i<days;i++){
      const d = new Date(min.getTime() + i*DAY);
      if (i===0 || d.getDay()===1) {
        const lab = `${d.getMonth()+1}/${d.getDate()}`;
        ticks.push({ i, label: lab });
      }
    }

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
        <div class="header"><div class="ticks">${ticksHtml}</div></div>
        <div class="grid"><div></div><div style="position:relative;height:0;border-top:1px solid rgba(255,255,255,.08)"></div></div>
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

  // ---------- modal helpers ----------
  function showModal(id){ const m = document.getElementById(id); if (m) m.classList.add('show'); }
  function hideModal(id){ const m = document.getElementById(id); if (m) m.classList.remove('show'); }

  // ---- Add Activity: dropdown hydration + reset to placeholders
  const TYPE_OPTIONS = ['5S','Kaizen','Training','CI Suggestion','Side Quest Project','Safety Concern','Quality Catch','Other'];
  const STATUS_OPTIONS = ['Not Started','In Progress','Completed','Canceled'];

  function ensurePlaceholder(selectEl, text){
    if (!selectEl) return;
    const first = selectEl.options[0];
    if (!first || first.value !== "") {
      selectEl.insertAdjacentHTML('afterbegin', `<option value="" disabled selected hidden>${esc(text)}</option>`);
    } else {
      first.textContent = text;
      first.selected = true;
    }
  }

  function hydrateAddActivityLists() {
    const typeSel = document.getElementById('act-type');
    const statusSel = document.getElementById('act-status-modal');

    if (typeSel && !typeSel.dataset.hydrated) {
      typeSel.innerHTML = TYPE_OPTIONS.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("");
      typeSel.dataset.hydrated = "1";
    }
    if (statusSel && !statusSel.dataset.hydrated) {
      statusSel.innerHTML = STATUS_OPTIONS.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("");
      statusSel.dataset.hydrated = "1";
    }

    ensurePlaceholder(typeSel, "Select type…");
    ensurePlaceholder(statusSel, "Select status…");

    const ownerSel = document.getElementById('act-owner');
    ensurePlaceholder(ownerSel, "Select owner…");
  }

  function resetAddActivityForm() {
    hydrateAddActivityLists();
    const f = {
      title: document.getElementById('act-title'),
      type:  document.getElementById('act-type'),
      status:document.getElementById('act-status-modal'),
      start: document.getElementById('act-start'),
      end:   document.getElementById('act-end'),
      owner: document.getElementById('act-owner'),
      desc:  document.getElementById('act-desc'),
    };
    if (f.title)  f.title.value = "";
    if (f.type)   f.type.selectedIndex = 0;           // placeholder
    if (f.status) f.status.selectedIndex = 0;         // placeholder
    if (f.owner)  f.owner.selectedIndex = 0;          // placeholder
    if (f.start)  f.start.value = "";
    if (f.end)    f.end.value = "";
    if (f.desc)   f.desc.value = "";
  }

  // Owner list = active squad members (display names)
  function populateOwnerOptions({ members, empMap, squadId }) {
    const sel = document.getElementById('act-owner'); if (!sel) return;
    const rows = members.filter(r => norm(r["Squad ID"]) === norm(squadId) && isTrue(r["Active"]));

    const seen = new Set();
    const opts = rows.map(r => {
      const id = String(r["Employee ID"]||"").trim();
      return { id, name: (empMap.get(id) || id) };
    }).filter(p => p.id && !seen.has(p.id) && seen.add(p.id));

    const keepPlaceholder = sel.options[0] && sel.options[0].value === "" ? sel.options[0].outerHTML : `<option value="" disabled selected hidden>Select owner…</option>`;
    sel.innerHTML = keepPlaceholder + opts.map(p =>
      `<option value="${esc(p.name)}" data-id="${esc(p.id)}">${esc(p.name)}</option>`
    ).join("");
    sel.selectedIndex = 0; // keep placeholder selected
  }

  // Add Activity -> write to Smartsheet
  async function createActivity({ squadId, squadName }) {
    const title = document.getElementById('act-title').value.trim();
    const typeEl  = document.getElementById('act-type');
    const statusEl= document.getElementById('act-status-modal');
    const ownerEl = document.getElementById('act-owner');

    const type  = typeEl?.value || "";
    const status= statusEl?.value || "";
    const ownerName = ownerEl?.selectedOptions[0]?.text || "";
    const ownerId   = ownerEl?.selectedOptions[0]?.dataset?.id || "";

    const start = toISO(document.getElementById('act-start').value);
    const end   = toISO(document.getElementById('act-end').value) || start;
    const desc  = document.getElementById('act-desc').value.trim();

    if (!title) { alert("Title is required."); return; }
    if (!type) { alert("Please choose a Type."); return; }
    if (!status) { alert("Please choose a Status."); return; }
    if (!ownerId) { alert("Please choose an Owner."); return; }

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

  // ---- Log Hours modal (open + reset only; your logging handler stays as-is)
  function resetLogHoursForm(actId="") {
    const d = new Date();
    const iso = d.toISOString().slice(0,10);
    const f = {
      date: document.getElementById('lh-date'),
      start:document.getElementById('lh-start'),
      end:  document.getElementById('lh-end'),
      dur:  document.getElementById('lh-dur'),
      sch:  document.getElementById('lh-scheduled'),
      cmp:  document.getElementById('lh-completed'),
      notes:document.getElementById('lh-notes'),
      aid:  document.getElementById('lh-activity-id'),
    };
    if (f.date)  f.date.value = iso;
    if (f.start) f.start.value = "";
    if (f.end)   f.end.value = "";
    if (f.dur)   f.dur.value = "";
    if (f.sch)   f.sch.checked = false;
    if (f.cmp)   f.cmp.checked = true;
    if (f.notes) f.notes.value = "";
    if (f.aid)   f.aid.value = actId || "";
  }
  function openLogHoursModal(actId) {
    resetLogHoursForm(actId);
    showModal('logHourModal');
  }

  // ---------- main ----------
  document.addEventListener("DOMContentLoaded", async () => {
    // keep header/shell working
    layout.injectLayout?.();
    await session.initHeader?.();

    // enforce uniform row height for last column (PH + Log Hours)
    (function injectRowHeightFix(){
      const css = `
        #activities-table th, #activities-table td { vertical-align: middle; }
        #activities-table td.row-actions { text-align: right; white-space: nowrap; }
      `;
      const tag = document.createElement('style'); tag.textContent = css; document.head.appendChild(tag);
    })();

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
      populateOwnerOptions({ members: latest, empMap, squadId });
    });

    const me = session.get?.() || {};
    const userId = (me.employeeId || "").trim();
    const canAdd = isAdmin || leaderIds.some(id => id.toLowerCase() === userId.toLowerCase());
    (function wireAddMemberButton(){
      const btn = document.getElementById("btn-addmember");
      if (!btn) return;
      btn.hidden = !canAdd; btn.disabled = !canAdd;
      const handler = (e) => {
        e.preventDefault();
        if (P.squadForm && typeof P.squadForm.open === "function") {
          P.squadForm.open({ squadId, squadName });
        } else {
          alert("Member form not found. Please include scripts/squad-member-form.js earlier on the page.");
        }
      };
      btn.addEventListener("click", handler);
    })();

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
        if (colSel) colSel.value = 'status';
        colSel?.dispatchEvent(new Event('change'));
        if (valSel) valSel.value = '__ALL__';
        rerender();
      });
    }

    // Owner dropdown for Add Activity
    populateOwnerOptions({ members, empMap, squadId });

    // Add Activity modal wiring (reset on open, cancel, save)
    const modalId = 'addActivityModal';
    const addActBtn = document.getElementById("btn-add-activity");
    addActBtn?.addEventListener('click', (e)=>{ e.preventDefault(); resetAddActivityForm(); showModal(modalId); });
    document.getElementById('aa-cancel')?.addEventListener('click', ()=>{ hideModal(modalId); resetAddActivityForm(); });

    document.getElementById('aa-save')?.addEventListener('click', async ()=>{
      try{
        const saveBtn = document.getElementById('aa-save');
        if (saveBtn){ saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }
        await createActivity({ squadId, squadName });
        hideModal(modalId);
        resetAddActivityForm();

        const fresh = await loadActivitiesForSquad(squadId, squadName);
        renderKpis(fresh.items, fresh.hoursByActDone, fresh.hoursByActPlan);
        renderActivities(fresh.items, fresh.hoursByActDone, true);
        buildDependentFilters(fresh.items, fresh.hoursByActDone);
        renderGantt(fresh.items);
      } catch (err){
        console.error(err);
        alert("Failed to create activity. See console for details.");
      } finally {
        const saveBtn = document.getElementById('aa-save');
        if (saveBtn){ saveBtn.disabled = false; saveBtn.textContent = "Create Activity"; }
      }
    });

    // Log Hours modal: reset on cancel as well
    document.getElementById('lh-cancel')?.addEventListener('click', ()=>{ hideModal('logHourModal'); resetLogHoursForm(); });

    // View switch (Table / Gantt / Calendar)
    (function wireViewTabs(){
      const defs = [
        {btn:'view-tab-table', panel:'view-table'},
        {btn:'view-tab-gantt', panel:'view-gantt'},
        {btn:'view-tab-cal',   panel:'view-calendar'},
      ];
      function activate(key){
        defs.forEach(d=>{
          const b = document.getElementById(d.btn), p = document.getElementById(d.panel);
          const on = (d.btn === key);
          if (b){ b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on?'true':'false'); }
          if (p) p.hidden = !on;
        });
        if (key==='view-tab-gantt') renderGantt(acts);
      }
      defs.forEach(d=>{
        const b = document.getElementById(d.btn);
        if (b) b.addEventListener('click', (e)=>{ e.preventDefault(); activate(d.btn); });
      });
      // default to Table panel visible
      activate('view-tab-table');
    })();

    // Back button
    (function wireBack(){
      const btn = document.getElementById("btn-back");
      if (!btn) return;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (history.length > 1) history.back();
        else location.href = "squads.html";
      });
    })();
  });
})(window.PowerUp || (window.PowerUp = {}));
