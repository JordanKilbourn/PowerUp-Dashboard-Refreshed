// ==========================================================
// PowerUp — Squads Cards + Manage View
// Stabilized Initialization (waits for PowerUp.api before loading)
// ==========================================================

(async function (PowerUp) {

  // 🧭 Wait for PowerUp.api to be initialized
  async function waitForAPI() {
    const start = performance.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        if (window.PowerUp?.api?.SHEETS) return resolve(window.PowerUp.api);
        if (performance.now() - start > 5000)
          return reject("Timeout waiting for PowerUp.api");
        requestAnimationFrame(check);
      };
      check();
    });
  }

  try {
    const api = await waitForAPI();
    console.log("[Squads] API ready with sheets:", api.SHEETS);

    // Inject layout (ensures sidebar + header render)
if (api.layout && typeof api.layout.injectLayout === 'function') {
  console.log('[Squads] Injecting layout...');
  try {
    await api.layout.injectLayout();
  } catch (e) {
    console.warn('[Squads] Layout injection failed:', e);
  }
} else {
  console.warn('[Squads] Layout API missing — sidebar/header may not render.');
}

    // Bind PowerUp reference AFTER the API is confirmed ready
    const P = window.PowerUp;
    const { SHEETS, getRowsByTitle, updateRowsByTitle } = P.api;

    //────────────────────────────────────────────
    // Column Maps and Constants
    //────────────────────────────────────────────
    const EMP_COL = {
      id: ['Position ID', 'Employee ID'],
      name: ['Display Name', 'Employee Name', 'Name']
    };

    const SQUAD_COL = {
      id: ['Squad ID', 'ID'],
      name: ['Squad Name', 'Squad', 'Name', 'Team'],
      category: ['Category', 'Squad Category'],
      leaderId: ['Squad Leader', 'Leader Employee ID', 'Leader Position ID'],
      members: ['Members', 'Member List'],
      objective: ['Objective', 'Focus', 'Purpose'],
      active: ['Active', 'Is Active?'],
      created: ['Created Date', 'Start Date', 'Started'],
      notes: ['Notes', 'Description']
    };

    const SM_COL = {
      squadId: ['Squad ID', 'SquadID', 'Squad'],
      empId: ['Employee ID', 'EmployeeID', 'Position ID'],
      empName: ['Employee Name', 'Name', 'Display Name'],
      active: ['Active', 'Is Active?']
    };

    const CATS = ['All', 'CI', 'Quality', 'Safety', 'Training', 'Other'];
    const CAT_CLASS = {
      CI: 'cat-ci',
      Quality: 'cat-quality',
      Safety: 'cat-safety',
      Training: 'cat-training',
      Other: 'cat-other'
    };


  //────────────────────────────────────────────
  // Helper functions
  //────────────────────────────────────────────
  const pick = (row, list, d='') => { for (const k of list) if (row[k]!=null && row[k]!=='') return row[k]; return d; };
  const dash = (v) => (v==null || String(v).trim()==='') ? '-' : String(v);
  const isTrue = (v) => v===true || /^(true|yes|y|checked|1)$/i.test(String(v??'').trim());
  const normCategory = (v) => {
    const t = String(v||'').toLowerCase();
    if (/^ci|improve/.test(t)) return 'CI';
    if (/^quality/.test(t)) return 'Quality';
    if (/^safety/.test(t)) return 'Safety';
    if (/^training/.test(t)) return 'Training';
    return 'Other';
  };
  const catVar = (cat) => {
    switch(cat){
      case 'CI': return 'var(--sq-ci)';
      case 'Quality': return 'var(--sq-quality)';
      case 'Safety': return 'var(--sq-safety)';
      case 'Training': return 'var(--sq-training)';
      default: return 'var(--sq-other)';
    }
  };

  //────────────────────────────────────────────
  // Toast & Overlay
  //────────────────────────────────────────────
  function PowerUpUIToast(msg,type='info',dur=3500){
    const ex=document.querySelector('.pu-toast'); if(ex) ex.remove();
    const t=document.createElement('div');
    t.className=`pu-toast toast-${type}`; t.textContent=msg;
    document.body.appendChild(t);
    setTimeout(()=>t.classList.add('visible'),50);
    setTimeout(()=>{t.classList.remove('visible'); setTimeout(()=>t.remove(),400);},dur);
  }

  function showOverlay(show=true){
    let ov=document.querySelector('.pu-overlay');
    if(!ov){
      ov=document.createElement('div');
      ov.className='pu-overlay';
      ov.innerHTML='<div class="pu-spinner"></div>';
      document.body.appendChild(ov);
    }
    ov.classList.toggle('visible',show);
  }

  //────────────────────────────────────────────
  // Inline CSS (kept internal until stable)
  //────────────────────────────────────────────
  const style=document.createElement('style');
  style.textContent=`
  .pu-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) scale(.95);
    background:#333;color:#fff;padding:12px 20px;border-radius:6px;opacity:0;z-index:9999;
    transition:opacity .4s,transform .4s;font-size:15px;pointer-events:none;}
  .pu-toast.visible{opacity:1;transform:translateX(-50%) scale(1);}
  .toast-success{background:#2e7d32}.toast-error{background:#c62828}
  .toast-warning{background:#f9a825;color:#111}

  .pu-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);
    display:flex;align-items:center;justify-content:center;z-index:9000;
    visibility:hidden;opacity:0;transition:opacity .3s;}
  .pu-overlay.visible{visibility:visible;opacity:1;}
  .pu-spinner{width:55px;height:55px;border:6px solid rgba(255,255,255,.3);
    border-top-color:var(--accent,#4caf50);border-radius:50%;
    animation:spin 1s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg)}}

  table.manage-table{width:100%;border-collapse:collapse;margin-top:10px;
    background:#fff;font-size:15px;border-radius:10px;overflow:hidden;}
  table.manage-table th,table.manage-table td{padding:10px 14px;text-align:left;
    border-bottom:1px solid #ddd;}
  table.manage-table th{position:sticky;top:0;background:#f5f6f8;z-index:10;font-weight:600;}
  table.manage-table tbody tr:nth-child(even){background:#fafafa;}
  .actions-cell button{padding:6px 12px;border:none;border-radius:5px;cursor:pointer;
    font-weight:500;font-size:14px;}
  .btn-save{background:#4caf50;color:#fff;}
  .btn-cancel{background:#e53935;color:#fff;margin-left:6px;}
  .header-fade{position:absolute;top:0;left:0;right:0;height:40px;
    background:linear-gradient(to bottom,rgba(245,246,248,1),rgba(245,246,248,0));z-index:9;}
  .squad-card{background:#fff;border-radius:10px;box-shadow:0 2px 6px rgba(0,0,0,.08);
    padding:16px;width:280px;display:inline-block;vertical-align:top;margin:10px;}
  .squad-card h4{margin:0 0 6px;color:#222;}
  .squad-meta{margin:4px 0;font-size:14px;color:#555;}
  .squad-foot{margin-top:8px;text-align:right;}
  .squad-foot a{color:var(--accent,#4caf50);text-decoration:none;font-weight:500;}
  `;
  document.head.appendChild(style);

  //────────────────────────────────────────────
  // Globals
  //────────────────────────────────────────────
  let ALL=[]; let EMPLOYEES=[]; let idToName=new Map();
  let IS_ADMIN=false; let IS_MANAGE=false;
  const MEMBERS_BY_SQUAD=new Map(); const LEADERS_BY_SQUAD=new Map();

  //────────────────────────────────────────────
  // Category Pills
  //────────────────────────────────────────────
  function renderCategoryPills(active='All'){
    const wrap=document.getElementById('cat-pills'); if(!wrap)return;
    wrap.innerHTML=CATS.map(cat=>{
      const st=`--cat:${catVar(cat)};`;
      return `<button class="pill-cat${cat===active?' active':''}" data-cat="${cat}" style="${st}">
      <span class="dot"></span>${cat}</button>`;}).join('');
  }

  //────────────────────────────────────────────
  // Render Cards
  //────────────────────────────────────────────
  function renderCards(list){
    const cards=document.getElementById('cards');
    const msg=document.getElementById('s-msg');
    if(!cards)return;

    if(!list.length){
      cards.innerHTML='';
      if(msg){msg.style.display='block';msg.innerHTML='No squads match your filters.<br/>Try clearing search or showing inactive.';}
      return;
    }
    if(msg) msg.style.display='none';

    cards.innerHTML=list.map(sq=>{
      const status=isTrue(sq.active)?'<span class="status-pill status-on">Active</span>':'<span class="status-pill status-off">Inactive</span>';
      let leaderLine=dash(sq.leaderName||sq.leaderId);
      const leaders=LEADERS_BY_SQUAD.get(String(sq.id||'').trim());
      if(leaders&&leaders.length){
        const names=leaders.map(x=>(x.name||idToName.get(x.id)||x.id||'').trim())
          .filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
        if(names.length===1) leaderLine=names[0];
        else if(names.length===2) leaderLine=`${names[0]}, ${names[1]}`;
        else if(names.length>2) leaderLine=`${names[0]}, ${names[1]} +${names.length-2} more`;
      }
      const detailsHref=sq.id?`squad-details.html?id=${encodeURIComponent(sq.id)}`:`squad-details.html?name=${encodeURIComponent(sq.name)}`;
      const catCls=CAT_CLASS[sq.category]||CAT_CLASS.Other;
      return `<div class="squad-card card ${catCls}">
        <h4>${dash(sq.name)}</h4>
        <div class="squad-meta"><b>${(leaders&&leaders.length>1)?'Leaders':'Leader'}:</b> ${leaderLine}</div>
        <div class="squad-meta"><b>Status:</b> ${status}</div>
        <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
        <div class="squad-foot"><a class="squad-link" href="${detailsHref}">View Details →</a></div>
      </div>`;
    }).join('');
  }

     } catch (err) {
    console.error("[Squads] Failed to initialize:", err);
  }

})();

  //────────────────────────────────────────────
  // Load Data (Employees + Members + Squads)
  //────────────────────────────────────────────
  async function loadData(){
    showOverlay(true);
    const emRows=await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    EMPLOYEES=emRows.map(r=>({id:pick(r,EMP_COL.id,'').trim(),name:pick(r,EMP_COL.name,'').trim()}));
    idToName=new Map(EMPLOYEES.map(e=>[e.id,e.name]));

    MEMBERS_BY_SQUAD.clear(); LEADERS_BY_SQUAD.clear();
    try{
      if(SHEETS.SQUAD_MEMBERS){
        const smRows=await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
        smRows.forEach(r=>{
          const active=isTrue(pick(r,SM_COL.active,'true')); if(!active)return;
          const sid=pick(r,SM_COL.squadId,'').trim(); if(!sid)return;
          const eid=pick(r,SM_COL.empId,'').trim();
          const enm=(pick(r,SM_COL.empName,'')||idToName.get(eid)||'').trim();
          const role=String(r['Role']||'').trim().toLowerCase();
          let entry=MEMBERS_BY_SQUAD.get(sid);
          if(!entry){entry={ids:new Set(),names:new Set()};MEMBERS_BY_SQUAD.set(sid,entry);}
          if(eid) entry.ids.add(eid.toLowerCase());
          if(enm) entry.names.add(enm.toLowerCase());
          if(role==='leader'){
            const arr=LEADERS_BY_SQUAD.get(sid)||[];
            arr.push({id:eid,name:enm});
            LEADERS_BY_SQUAD.set(sid,arr);
          }
        });
      }
    }catch(_){}

    const sqRows=await getRowsByTitle(SHEETS.SQUADS);
    ALL=sqRows.map(r=>{
      const name=pick(r,SQUAD_COL.name,'').trim(); if(!name)return null;
      const leaderId=pick(r,SQUAD_COL.leaderId,'').trim();
      return {
        id:pick(r,SQUAD_COL.id,''), name,
        category:normCategory(pick(r,SQUAD_COL.category,'Other')),
        leaderId, leaderName:idToName.get(leaderId)||'',
        members:pick(r,SQUAD_COL.members,''), objective:pick(r,SQUAD_COL.objective,''),
        active:pick(r,SQUAD_COL.active,''), created:pick(r,SQUAD_COL.created,''), notes:pick(r,SQUAD_COL.notes,'')
      };
    }).filter(Boolean);
    showOverlay(false);
  }

  //────────────────────────────────────────────
  // Admin Target Helper
  //────────────────────────────────────────────
  async function getAdminTargetFromFilter(){
    try{
      const sel=(sessionStorage.getItem('pu.adminEmployeeFilter')||'').trim();
      if(!sel||sel==='__ALL__') return null;
      if(!idToName.size){
        const em=await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
        em.forEach(r=>{
          const id=String(r['Position ID']||r['Employee ID']||'').trim();
          const nm=String(r['Display Name']||r['Employee Name']||r['Name']||'').trim();
          if(id) idToName.set(id,nm);
        });
      }
      const norm=s=>String(s||'').trim().toLowerCase();
      let targetId='';
      for(const [id,nm] of idToName.entries()){ if(norm(nm)===norm(sel)){targetId=id;break;} }
      return {id:targetId,name:sel};
    }catch{return null;}
  }
  //────────────────────────────────────────────
  // Apply Filters
  //────────────────────────────────────────────
  async function applyFilters(){
    const session=P.session.get();
    const cat=document.querySelector('.pill-cat.active')?.dataset.cat||'All';
    const myOnly=document.getElementById('myOnly')?.checked;
    const activeOnly=document.getElementById('activeOnly')?.checked;
    const q=(document.getElementById('search')?.value||'').trim().toLowerCase();

    let list=ALL.slice();

    if(myOnly){
      if(IS_ADMIN){
        let target=await getAdminTargetFromFilter();
        if(!target) target={id:String(session.employeeId||'').trim(),name:String(session.displayName||'').trim()};
        const norm=s=>String(s||'').trim().toLowerCase();
        const tgtId=norm(target.id),tgtName=norm(target.name);
        list=list.filter(s=>{
          const leaders=LEADERS_BY_SQUAD.get(String(s.id||'').trim())||[];
          const leaderHit=leaders.some(x=>norm(x.id)===tgtId||norm(x.name)===tgtName);
          const m=MEMBERS_BY_SQUAD.get(String(s.id||'').trim());
          const memberHit=m?(m.ids.has(tgtId)||m.names.has(tgtName)):false;
          let fallback=false;
          if(!m&&s.members){
            const toks=String(s.members).split(/[;,\n]+/).map(t=>norm(t));
            fallback=(!!tgtId&&toks.includes(tgtId))||(!!tgtName&&toks.includes(tgtName));
          }
          return leaderHit||memberHit||fallback;
        });
      }else list=list.filter(s=>userIsMemberOrLeader(s,session));
    }

    if(activeOnly) list=list.filter(s=>isTrue(s.active));
    if(cat!=='All') list=list.filter(s=>s.category===cat);

    if(q){
      list=list.filter(s=>{
        const hay=[s.name,s.leaderName,s.leaderId,s.objective,s.notes].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    renderCards(list);
  }

  //────────────────────────────────────────────
  // Manage Squads Table Rendering
  //────────────────────────────────────────────
  async function openManageView(){
    IS_MANAGE=true;
    const btn=document.getElementById('btn-manage');
    if(btn) btn.textContent='View Cards';

    showOverlay(true);
    const [squads,members,employees]=await Promise.all([
      getRowsByTitle(SHEETS.SQUADS),
      getRowsByTitle(SHEETS.SQUAD_MEMBERS),
      getRowsByTitle(SHEETS.EMPLOYEE_MASTER)
    ]);
    showOverlay(false);

    const cardsContainer=document.getElementById('cards');
    cardsContainer.innerHTML=`<div class="header-fade"></div>`;

    const table=document.createElement('table');
    table.className='manage-table';
    table.innerHTML=`
      <thead>
        <tr>
          <th style="width:8%">ID</th>
          <th style="width:18%">Squad Name</th>
          <th style="width:12%">Category</th>
          <th style="width:8%">Active</th>
          <th style="width:22%">Objective</th>
          <th style="width:18%">Leader</th>
          <th style="width:14%">Created By</th>
          <th style="width:14%">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${squads.map(r=>{
          const sid=r['Squad ID']||r['ID'];
          const leaders=members.filter(m=>m['Squad ID']===sid&&m['Role']==='Leader'&&isTrue(m['Active']));
          const leaderName=(leaders[0]&&leaders[0]['Employee Name'])||'';
          return `
            <tr data-rowid="${sid}">
              <td>${dash(sid)}</td>
              <td contenteditable class="editable name">${dash(r['Squad Name'])}</td>
              <td contenteditable class="editable category">${dash(r['Category'])}</td>
              <td><input type="checkbox" class="active" ${isTrue(r['Active'])?'checked':''}></td>
              <td contenteditable class="editable objective">${dash(r['Objective'])}</td>
              <td>
                <select class="leader-select">
                  ${employees.map(e=>{
                    const nm=e['Display Name']||e['Employee Name']||e['Name'];
                    return `<option value="${nm}" ${nm===leaderName?'selected':''}>${nm}</option>`;
                  }).join('')}
                </select>
              </td>
              <td contenteditable class="editable created-by">${dash(r['Created By'])}</td>
              <td class="actions-cell">
                <button class="btn-save">Save</button>
                <button class="btn-cancel">Cancel</button>
              </td>
            </tr>`;
        }).join('')}
      </tbody>`;
    cardsContainer.appendChild(table);

    //────────────────────────────────────────────
    // Save & Cancel Button Logic
    //────────────────────────────────────────────
    table.addEventListener('click',async e=>{
      const tr=e.target.closest('tr[data-rowid]'); if(!tr) return;
      const rowId=tr.dataset.rowid;
      if(e.target.classList.contains('btn-save')){
        const name=tr.querySelector('.name').textContent.trim();
        const category=tr.querySelector('.category').textContent.trim();
        const active=tr.querySelector('.active').checked;
        const objective=tr.querySelector('.objective').textContent.trim();
        const createdBy=tr.querySelector('.created-by').textContent.trim();
        const leader=tr.querySelector('.leader-select').value;
        if(!leader){PowerUpUIToast('Each squad must have a leader.','warning');return;}

        await P.api.updateRowById('SQUADS',rowId,{
          'Squad Name':name,'Category':category,'Active':active,
          'Objective':objective,'Created By':createdBy
        });

        PowerUpUIToast(`Saved updates for ${name}`,'success');
      }

      if(e.target.classList.contains('btn-cancel')){
        tr.style.backgroundColor='rgba(255,255,0,0.15)';
        setTimeout(()=>tr.style.backgroundColor='',600);
      }
    });
  }

  //────────────────────────────────────────────
  // Toggle Manage / Card View
  //────────────────────────────────────────────
  async function toggleManageView(){
    const btn=document.getElementById('btn-manage');
    if(!btn) return;
    if(IS_MANAGE){ IS_MANAGE=false; btn.textContent='Manage Squads'; await loadData(); applyFilters(); }
    else await openManageView();
  }

  //────────────────────────────────────────────
  // Wire UI
  //────────────────────────────────────────────
  function wireUI(){
    renderCategoryPills('All');
    document.getElementById('cat-pills')?.addEventListener('click',e=>{
      const btn=e.target.closest('[data-cat]'); if(!btn)return;
      document.querySelectorAll('.pill-cat').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active'); applyFilters();
    });
    document.getElementById('myOnly')?.addEventListener('change',applyFilters);
    document.getElementById('activeOnly')?.addEventListener('change',applyFilters);
    document.getElementById('search')?.addEventListener('input',applyFilters);
    document.addEventListener('powerup-admin-filter-change',applyFilters);

    const mBtn=document.getElementById('btn-manage');
    if(mBtn) mBtn.addEventListener('click',toggleManageView);

    document.getElementById('btn-add-squad')?.addEventListener('click',()=>{
      if(PowerUp.squadAddForm&&typeof PowerUp.squadAddForm.open==='function') PowerUp.squadAddForm.open();
      else console.warn('⚠️ PowerUp.squadAddForm not ready');
    });

    document.addEventListener('squad-added',async()=>{
      if(typeof PowerUp.squads?.refresh==='function') await PowerUp.squads.refresh();
      else location.reload();
    });
  }

//────────────────────────────────────────────
// Initialization
//────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  P.session.requireLogin();
  P.layout.injectLayout();
  IS_ADMIN = !!(P.auth && P.auth.isAdmin && P.auth.isAdmin());
  P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');
  await P.session.initHeader();
  wireUI();
  await loadData();
  applyFilters();
});

})();  // ✅ END OF FILE — no more braces after this line

