// scripts/squad-details.js — optimized: render into #sq-panels, no legacy DOM removal
(function (P) {
  const { api, session, layout } = P;
  const qs = (k) => new URLSearchParams(location.search).get(k) || "";
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const norm = (s) => String(s||"").trim().toLowerCase();
  const isTrue = (v) => v === true || /^(true|yes|y|1|active)$/i.test(String(v ?? "").trim());
  const fmtMDYY = (v) => { if (!v) return "-"; const d = new Date(v); if (isNaN(+d)) return esc(v);
    const m=d.getMonth()+1,dn=d.getDate(),y=d.getFullYear()%100; return `${m}/${dn}/${String(y).padStart(2,"0")}`; };

  function injectOnceStyles(){
    if (document.getElementById("sq-details-styles")) return;
    const s=document.createElement("style"); s.id="sq-details-styles"; s.textContent=`
      .sq-grid{display:grid;grid-template-columns:minmax(280px,420px) 1fr;gap:14px;margin-top:12px}
      @media(max-width:980px){.sq-grid{grid-template-columns:1fr}}
      .sq-card{background:var(--card-bg,#0b1328);border:1px solid #2d3f3f;border-radius:10px;padding:12px}
      .sq-h{font-size:14px;color:#9ffbe6;margin:0 0 8px 0;display:flex;align-items:center;gap:8px}
      .sq-kv{font-size:13px;line-height:1.5}
      .sq-members-scroller,.sq-acts-scroller{max-height:calc(100vh - var(--header-h,72px) - 260px);
        overflow:auto;border:1px solid #2d3f3f;border-radius:8px}
      .sq-members-table,.sq-acts-table{width:100%;border-collapse:collapse;font-size:13px}
      .sq-members-table th,.sq-members-table td,.sq-acts-table th,.sq-acts-table td{padding:8px 10px;border-bottom:1px solid #1f2b2b;vertical-align:top}
      .sq-members-table th,.sq-acts-table th{font-weight:700;color:#9ca3af;background:#0f1a1a;position:sticky;top:0;z-index:1}
      .sq-pill{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700}
      .sq-on{background:var(--success,#34d399);color:#072}.sq-off{background:#3a4e4e;color:#fff}
      .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
      .sq-metrics{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:10px 0}
      @media(max-width:1100px){.sq-metrics{grid-template-columns:repeat(2,1fr)}}
      .sq-metric{background:#0e1a1a;border:1px solid #243434;border-radius:10px;padding:10px}
      .sq-metric .k{font-size:12px;color:#93a4a4}.sq-metric .v{font-size:20px;font-weight:800}
      .sq-acts-tools{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
      .sq-acts-tools .btn{padding:6px 10px;border-radius:8px;border:1px solid #2a354b;background:#0b1328;color:#e5e7eb;cursor:pointer}
      .sq-acts-tools select{padding:6px 10px;border-radius:8px;background:#122;color:#e5e7eb;border:1px solid #2d3f3f}
      .sq-members-scroller::-webkit-scrollbar,.sq-acts-scroller::-webkit-scrollbar{width:10px;height:10px}
      .sq-members-scroller::-webkit-scrollbar-thumb,.sq-acts-scroller::-webkit-scrollbar-thumb{background:#223035;border-radius:8px;border:2px solid #0b1328}
      .sq-members-scroller::-webkit-scrollbar-track,.sq-acts-scroller::-webkit-scrollbar-track{background:#0b1328}
    `; document.head.appendChild(s);
  }

  function mountPanels(host){
    const grid=document.createElement("div"); grid.className="sq-grid";
    grid.innerHTML=`
      <section class="sq-card" id="card-left">
        <h3 class="sq-h"><i class="fa fa-users"></i> Members</h3>
        <div class="sq-members-scroller">
          <table class="sq-members-table" id="members-table">
            <thead><tr><th>Member</th><th>Role</th><th>Status</th><th>Start</th></tr></thead><tbody></tbody>
          </table>
        </div>
      </section>
      <section class="sq-card" id="card-right">
        <h3 class="sq-h"><i class="fa fa-table-cells"></i> Squad Overview</h3>
        <div id="card-core" class="sq-kv" style="display:grid;grid-template-columns:repeat(2,minmax(160px,1fr));gap:8px;margin-bottom:10px"></div>
        <div class="sq-metrics">
          <div class="sq-metric"><div class="k">Active activities</div><div class="v" id="m-active">0</div></div>
          <div class="sq-metric"><div class="k">Planned</div><div class="v" id="m-planned">0</div></div>
          <div class="sq-metric"><div class="k">Completed</div><div class="v" id="m-done">0</div></div>
          <div class="sq-metric"><div class="k">Completed hours</div><div class="v" id="m-hours">0</div></div>
        </div>
        <h3 class="sq-h" style="margin-top:6px"><i class="fa fa-list-check"></i> Activities</h3>
        <div class="sq-acts-tools">
          <select id="act-status"><option value="__ALL__">All statuses</option><option>Planned</option><option>In Progress</option><option>Blocked</option><option>Completed</option></select>
          <select id="act-type"><option value="__ALL__">All types</option><option>Training</option><option>Kaizen</option><option>Process</option><option>Audit</option><option>Other</option></select>
          <span style="margin-left:auto"></span>
          <button id="btn-add-activity" class="btn">+ Add Activity</button>
        </div>
        <div class="sq-acts-scroller">
          <table class="sq-acts-table"><thead>
            <tr><th>Title</th><th>Status</th><th>Type</th><th>Start–End</th><th>Owner</th><th>Completed PH</th><th></th></tr>
          </thead><tbody id="act-tbody"></tbody></table>
        </div>
      </section>`;
    host.replaceChildren(grid);
  }

  async function loadEmployeeMap(){
    const rows=await api.getRowsByTitle("EMPLOYEE_MASTER"); const m=new Map();
    rows.forEach(r=>{const id=(r["Position ID"]||r["Employee ID"]||"").toString().trim();
      const nm=(r["Display Name"]||r["Employee Name"]||r["Name"]||"").toString().trim(); if(id) m.set(id,nm||id);});
    return m;
  }
  const pick=(row,keys,d="")=>{for(const k of keys) if(row&&row[k]!=null&&String(row[k]).trim()!=="") return row[k]; return d;};

  function renderMembers(allRows, empMap, squadId, showEmpId){
    const rows=allRows.filter(r=>norm(r["Squad ID"])===norm(squadId));
    const thead=document.querySelector("#members-table thead tr");
    const tbody=document.querySelector("#members-table tbody");
    if(!thead||!tbody) return;
    thead.innerHTML=showEmpId
      ? "<th>Member</th><th>Employee ID</th><th>Role</th><th>Status</th><th>Start</th>"
      : "<th>Member</th><th>Role</th><th>Status</th><th>Start</th>";
    tbody.innerHTML=rows.map(r=>{
      const eid=String(r["Employee ID"]||"").trim();
      const name=empMap.get(eid)||eid||"-";
      const role=r["Role"]||"-";
      const active=isTrue(r["Active"]);
      const start=r["Start Date"]||r["Start"];
      const cells=[
        `<td>${esc(name)}</td>`,
        ...(showEmpId ? [`<td class="mono">${esc(eid||"-")}</td>`] : []),
        `<td>${esc(role)}</td>`,
        `<td>${active?'<span class="sq-pill sq-on">Active</span>':'<span class="sq-pill sq-off">Inactive</span>'}</td>`,
        `<td>${fmtMDYY(start)}</td>`];
      return `<tr>${cells.join("")}</tr>`;
    }).join("") || `<tr><td colspan="${showEmpId?5:4}" style="opacity:.7;text-align:center;">No members yet</td></tr>`;
  }

  async function loadActivitiesForSquad(squadId, squadName){
    const hasKey=!!(api.SHEETS&&api.SHEETS.SQUAD_ACTIVITIES);
    if(!hasKey) return {items:[], configured:false, hoursByAct:new Map()};
    const rows=await api.getRowsByTitle(api.SHEETS.SQUAD_ACTIVITIES);
    const items=rows.map(r=>{
      const actId=pick(r,["Activity ID","ID"],"").toString().trim();
      const squad=(r["Squad"]||r["Squad ID"]||r["Squad Name"]||"").toString().trim();
      const title=(r["Activity Title"]||r["Title"]||"").toString().trim();
      const type=(r["Type"]||"").toString().trim()||"Other";
      const status=(r["Status"]||"").toString().trim()||"Planned";
      const start=r["Start Date"]||r["Start"]||"";
      const end=r["End Date"]||r["Due Date"]||r["End"]||"";
      const owner=(r["Owner (Display Name)"]||r["Owner"]||"").toString().trim();
      if(!title) return null;
      const match=(norm(squad)===norm(squadId))||(squadName&&norm(squad)===norm(squadName));
      if(!match) return null;
      return {id:actId, title, type, status, start, end, owner};
    }).filter(Boolean);

    const hoursByAct=new Map();
    try{
      const ph=await api.getRowsByTitle(api.SHEETS.POWER_HOURS);
      ph.forEach(r=>{
        const actId=(r["Activity ID"]||r["Activity"]||"").toString().trim(); if(!actId) return;
        if(!isTrue(r["Completed"])) return;
        const hrs=Number(String(r["Completed Hours"]??r["Hours"]??"0").replace(/[^0-9.\-]/g,"")||0);
        if(Number.isFinite(hrs)) hoursByAct.set(actId,(hoursByAct.get(actId)||0)+hrs);
      });
    }catch{}
    return {items, configured:true, hoursByAct};
  }

  function renderMetrics(acts, hoursByAct){
    const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=String(v);};
    const lc=(s)=>String(s||"").toLowerCase();
    set("m-active", acts.filter(a=>/progress|active|ongoing/.test(lc(a.status))).length);
    set("m-planned",acts.filter(a=>/plan/.test(lc(a.status))).length);
    set("m-done",   acts.filter(a=>/done|complete/.test(lc(a.status))).length);
    set("m-hours",  acts.reduce((t,a)=>t+(hoursByAct.get(a.id)||0),0));
  }

  function renderActivities(acts, hoursByAct, configured){
    const tb=document.getElementById("act-tbody"); if(!tb) return;
    if(!configured){ tb.innerHTML=`<tr><td colspan="7" style="opacity:.75;padding:12px;">
      Activities sheet isn’t configured yet (SHEETS.SQUAD_ACTIVITIES).
    </td></tr>`; return; }
    if(!acts.length){ tb.innerHTML=`<tr><td colspan="7" style="opacity:.75;padding:12px;">No activities found for this squad.</td></tr>`; return; }
    tb.innerHTML=acts.map(a=>{
      const range=`${fmtMDYY(a.start)} – ${fmtMDYY(a.end)}`;
      const hrs=hoursByAct.get(a.id)||0;
      return `<tr>
        <td>${esc(a.title)}</td><td>${esc(a.status||"-")}</td><td>${esc(a.type||"-")}</td>
        <td>${range}</td><td>${esc(a.owner||"-")}</td><td>${hrs}</td>
        <td><a href="#" class="link" data-act="${esc(a.id)}" data-action="log-ph">Log Hour</a></td>
      </tr>`;
    }).join("");
    tb.querySelectorAll('[data-action="log-ph"]').forEach(link=>{
      link.addEventListener("click",(e)=>{
        e.preventDefault(); const id=link.getAttribute("data-act")||"";
        if(P.PowerHours && typeof P.PowerHours.open==="function") P.PowerHours.open({activityId:id});
        else location.href=`power-hours.html?activityId=${encodeURIComponent(id)}`;
      });
    });
  }

  function populateTopCards(squad){
    const objEl=document.querySelector("#card-objective .kv"); if(objEl) objEl.textContent=squad["Objective"]||"-";
    const notesEl=document.querySelector("#card-notes .kv");   if(notesEl) notesEl.textContent=squad["Notes"]||"-";
    const core=document.getElementById("card-squad")?.querySelector(".kv");
    if(core){
      core.innerHTML = `
        <div><b>Name:</b> ${esc(squad["Squad Name"]||squad["Name"]||"-")}</div>
        <div><b>Leader:</b> ${esc(squad["Leader"]||"-")}</div>
        <div><b>Status:</b> ${isTrue(squad["Active"]) ? '<span class="sq-pill sq-on">Active</span>' : '<span class="sq-pill sq-off">Inactive</span>'}</div>
        <div><b>Category:</b> ${esc(squad["Category"]||"-")}</div>
        <div><b>Created:</b> ${fmtMDYY(squad["Created Date"]||squad["Created"]||"")}</div>
      `;
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    layout.injectLayout?.(); injectOnceStyles(); await session.initHeader?.();

    const anchor=document.getElementById("sq-panels");
    if(!anchor){ console.warn("Missing #sq-panels in HTML. Add it under the three cards."); return; }
    mountPanels(anchor);

    const urlId=qs("id")||qs("squadId")||qs("squad"); if(!urlId){ layout.setPageTitle?.("Squad: (unknown)"); return; }

    const [squads, members, empMap]=await Promise.all([
      api.getRowsByTitle("SQUADS",{force:true}),
      api.getRowsByTitle("SQUAD_MEMBERS",{force:true}),
      loadEmployeeMap()
    ]);

    const sidLC=norm(urlId);
    const squadRow = squads.find(r=>norm(r["Squad ID"])===sidLC) ||
                     squads.find(r=>norm(r["Squad Name"])===sidLC) || null;
    if(!squadRow){ layout.setPageTitle?.("Squad: Not Found"); return; }

    const squadId=(squadRow["Squad ID"]||urlId).toString().trim();
    const squadName=(squadRow["Squad Name"]||squadRow["Name"]||"").toString().trim();
    layout.setPageTitle?.(`Squad: ${squadName||squadId}`);

    populateTopCards(squadRow);

    const isAdmin=!!(P.auth && typeof P.auth.isAdmin==="function" && P.auth.isAdmin());
    renderMembers(members, empMap, squadId, isAdmin);

    const leaderIds = members
      .filter(r=>norm(r["Squad ID"])===norm(squadId) && norm(r["Role"])==="leader" && isTrue(r["Active"]))
      .map(r=>(r["Employee ID"]||"").toString().trim());
    const me=session.get?.() || {}; const userId=(me.employeeId||"").trim().toLowerCase();
    const canAdd = isAdmin || leaderIds.some(id=>id.toLowerCase()===userId);

    // keep your existing top-right buttons/modal
    const back = document.getElementById("btnBack") || document.getElementById("btn-back");
    back?.addEventListener("click",(e)=>{ e.preventDefault(); if(history.length>1) history.back(); else location.href="squads.html"; });
    const add = document.getElementById("btnAddMember") || document.getElementById("btn-addmember");
    if(add){
      if(canAdd){ add.style.display="inline-flex"; add.disabled=false;
        add.addEventListener("click",(e)=>{ e.preventDefault();
          if(P.squadForm?.open) P.squadForm.open({squadId, squadName});
          else alert("Member form missing: include scripts/squad-member-form.js"); });
      } else { add.style.display="none"; add.disabled=true; }
    }
    const refreshMembers = async () => {
      const latest=await api.getRowsByTitle("SQUAD_MEMBERS",{force:true});
      renderMembers(latest, empMap, squadId, isAdmin);
    };
    document.addEventListener("squad-member-added", refreshMembers);
    document.addEventListener("squad:member:added", refreshMembers);

    const { items:acts, configured, hoursByAct }=await loadActivitiesForSquad(squadId, squadName);
    renderMetrics(acts, hoursByAct); renderActivities(acts, hoursByAct, configured);

    const statusSel=document.getElementById("act-status");
    const typeSel=document.getElementById("act-type");
    function applyActFilters(){
      const sVal=(statusSel?.value||"__ALL__").toLowerCase();
      const tVal=(typeSel?.value||"__ALL__").toLowerCase();
      const filtered=acts.filter(a=>{
        const sOK=sVal==="__ALL__" || (a.status||"").toLowerCase()===sVal;
        const tOK=tVal==="__ALL__" || (a.type  ||"").toLowerCase()===tVal;
        return sOK && tOK;
      });
      renderMetrics(filtered, hoursByAct); renderActivities(filtered, hoursByAct, configured);
    }
    statusSel?.addEventListener("change", applyActFilters);
    typeSel?.addEventListener("change", applyActFilters);

    const addActBtn=document.getElementById("btn-add-activity");
    if(addActBtn){
      if(canAdd){ addActBtn.disabled=false; addActBtn.addEventListener("click",(e)=>{
          e.preventDefault();
          if(P.activities?.openCreate) P.activities.openCreate({squadId, squadName});
          else alert("Wire P.activities.openCreate({ squadId, squadName }) to enable this.");
        });
      } else { addActBtn.disabled=true; }
    }
  });
})(window.PowerUp || (window.PowerUp = {}));

