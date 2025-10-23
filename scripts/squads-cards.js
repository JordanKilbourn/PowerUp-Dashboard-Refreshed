// ======================================================
//  PowerUp Squads — Full Recovery Build (Stable v2)
//  Combines full legacy logic + working Manage Squads UI
// ======================================================

(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

  // ---------------- Column Maps ----------------
  const EMP_COL = { id: ['Position ID','Employee ID'], name: ['Display Name','Employee Name','Name'] };
  const SQUAD_COL = {
    id: ['Squad ID','ID'],
    name: ['Squad Name','Squad','Name','Team'],
    category: ['Category','Squad Category'],
    leaderId: ['Squad Leader','Leader Employee ID','Leader Position ID'],
    members: ['Members','Member List'],
    objective: ['Objective','Focus','Purpose'],
    active: ['Active','Is Active?'],
    created: ['Created Date','Start Date','Started'],
    notes: ['Notes','Description']
  };
  const SM_COL = {
    squadId: ['Squad ID','SquadID','Squad'],
    empId: ['Employee ID','EmployeeID','Position ID'],
    empName: ['Employee Name','Name','Display Name'],
    role: ['Role'],
    active: ['Active','Is Active?']
  };

  // ---------------- Helpers ----------------
  const dash = v => (v == null || String(v).trim() === '' ? '-' : String(v));
  const pick = (r, keys, d='') => { for(const k of keys) if(r[k]!=null&&r[k]!=='') return r[k]; return d; };
  const isTrue = v => v === true || /^(true|yes|y|checked|1)$/i.test(String(v ?? '').trim());

  function normCategory(v){
    const t=String(v||'').toLowerCase();
    if(/^ci|improve/.test(t)) return 'CI';
    if(/^quality/.test(t)) return 'Quality';
    if(/^safety/.test(t)) return 'Safety';
    if(/^training/.test(t)) return 'Training';
    return 'Other';
  }

  const MEMBERS_BY_SQUAD=new Map();
  const LEADERS_BY_SQUAD=new Map();
  let ALL=[],idToName=new Map(),IS_ADMIN=false;

  // ---------------- Toast ----------------
  if(!P.ui) P.ui={};
  if(!P.ui.toast){
    P.ui.toast=function(msg,type='info'){
      let box=document.getElementById('toastBox');
      if(!box){
        box=document.createElement('div');
        box.id='toastBox';
        box.style.cssText='position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;align-items:center;gap:8px;';
        document.body.appendChild(box);
      }
      const note=document.createElement('div');
      note.textContent=msg;
      note.style.cssText=`background:${type==='error'?'#ff4f4f':type==='success'?'#00f08e':type==='warn'?'#ffaa33':'#0f1a1a'};
        color:#fff;padding:10px 16px;border-radius:6px;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.4);
        border:1px solid ${type==='error'?'#ff9090':type==='success'?'#00f08e':type==='warn'?'#ffaa33':'#999'}`;
      box.appendChild(note);
      setTimeout(()=>note.remove(),3000);
    };
  }

  // ---------------- Category + Card Rendering ----------------
  const CATS=['All','CI','Quality','Safety','Training','Other'];
  const CAT_CLASS={CI:'cat-ci',Quality:'cat-quality',Safety:'cat-safety',Training:'cat-training',Other:'cat-other'};

  function renderCategoryPills(activeCat='All'){
    const wrap=document.getElementById('cat-pills');
    if(!wrap) return;
    wrap.innerHTML=CATS.map(cat=>`
      <button class="pill-cat${cat===activeCat?' active':''}" data-cat="${cat}" style="--cat-color:var(--sq-${cat.toLowerCase()})">
        <span class="dot"></span>${cat}
      </button>`).join('');
  }

  function renderCards(list){
    const cards=document.getElementById('cards');
    const msg=document.getElementById('s-msg');
    if(!cards) return;
    if(!list.length){
      cards.innerHTML='';
      if(msg){msg.style.display='block';msg.innerHTML='No squads match your filters.';}
      return;
    }
    if(msg) msg.style.display='none';
    cards.innerHTML=list.map(sq=>{
      const status=isTrue(sq.active)
        ?'<span class="status-pill status-on">Active</span>'
        :'<span class="status-pill status-off">Inactive</span>';
      let leaderLine=dash(sq.leaderName||sq.leaderId);
      const leaders=LEADERS_BY_SQUAD.get(String(sq.id||'').trim());
      if(leaders&&leaders.length){
        const names=leaders.map(x=>x.name||idToName.get(x.id)||x.id).filter(Boolean).sort();
        leaderLine=names.length>2?`${names[0]}, ${names[1]} +${names.length-2} more`:names.join(', ');
      }
      const catCls=CAT_CLASS[sq.category]||CAT_CLASS.Other;
      const detailsHref=`squad-details.html?id=${encodeURIComponent(sq.id)}`;
      return `
        <div class="squad-card card ${catCls}">
          <h4>${dash(sq.name)}</h4>
          <div class="squad-meta"><b>Leader(s):</b> ${leaderLine}</div>
          <div class="squad-meta"><b>Status:</b> ${status}</div>
          <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
          <div class="squad-foot"><a class="squad-link" href="${detailsHref}">View Details →</a></div>
        </div>`;
    }).join('');
  }

  // ---------------- Filtering Logic ----------------
  async function getAdminTargetFromFilter(){
    try{
      const sel=(sessionStorage.getItem('pu.adminEmployeeFilter')||'').trim();
      if(!sel||sel==='__ALL__') return null;
      if(!idToName.size){
        const em=await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
        em.forEach(r=>{
          const id=pick(r,EMP_COL.id,'').trim();
          const nm=pick(r,EMP_COL.name,'').trim();
          if(id) idToName.set(id,nm);
        });
      }
      const norm=s=>String(s||'').trim().toLowerCase();
      let targetId='';
      for(const [id,nm] of idToName.entries()) if(norm(nm)===norm(sel)){targetId=id;break;}
      return {id:targetId,name:sel};
    }catch{return null;}
  }

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
        if(!target) target={id:String(session.employeeId||''),name:String(session.displayName||'')};
        const norm=s=>String(s||'').trim().toLowerCase();
        const tgtId=norm(target.id),tgtName=norm(target.name);
        list=list.filter(s=>{
          const leaders=LEADERS_BY_SQUAD.get(String(s.id||'').trim())||[];
          const leaderHit=leaders.some(x=>norm(x.id)===tgtId||norm(x.name)===tgtName);
          const m=MEMBERS_BY_SQUAD.get(String(s.id||'').trim());
          const memberHit=m?(m.ids.has(tgtId)||m.names.has(tgtName)):false;
          return leaderHit||memberHit;
        });
      }else{
        const normId=String(session.employeeId||'').toLowerCase();
        const normName=String(session.displayName||'').toLowerCase();
        list=list.filter(s=>{
          const m=MEMBERS_BY_SQUAD.get(String(s.id||'').trim());
          return (m&&(m.ids.has(normId)||m.names.has(normName)))||String(s.leaderId||'').toLowerCase()===normId;
        });
      }
    }
    if(activeOnly) list=list.filter(s=>isTrue(s.active));
    if(cat!=='All') list=list.filter(s=>s.category===cat);
    if(q) list=list.filter(s=>[s.name,s.leaderName,s.objective,s.notes].join(' ').toLowerCase().includes(q));
    renderCards(list);
  }

  // ---------------- Data Load ----------------
  async function loadAllData(){
    const em=await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    idToName.clear(); em.forEach(r=>{const id=pick(r,EMP_COL.id,'').trim();const nm=pick(r,EMP_COL.name,'').trim();if(id) idToName.set(id,nm);});
    MEMBERS_BY_SQUAD.clear(); LEADERS_BY_SQUAD.clear();
    try{
      const sm=await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
      sm.forEach(r=>{
        if(!isTrue(pick(r,SM_COL.active,'true'))) return;
        const sid=pick(r,SM_COL.squadId,'').trim(); if(!sid) return;
        const eid=pick(r,SM_COL.empId,'').trim(); const enm=pick(r,SM_COL.empName,'')||idToName.get(eid)||'';
        const role=String(pick(r,SM_COL.role,'')).toLowerCase();
        let entry=MEMBERS_BY_SQUAD.get(sid); if(!entry){entry={ids:new Set(),names:new Set()};MEMBERS_BY_SQUAD.set(sid,entry);}
        if(eid) entry.ids.add(eid.toLowerCase()); if(enm) entry.names.add(enm.toLowerCase());
        if(role==='leader'){const arr=LEADERS_BY_SQUAD.get(sid)||[];arr.push({id:eid,name:enm});LEADERS_BY_SQUAD.set(sid,arr);}
      });
    }catch(err){console.warn('Load squad members failed:',err);}
    const rows=await getRowsByTitle(SHEETS.SQUADS);
    ALL=rows.map(r=>{
      const name=pick(r,SQUAD_COL.name,'').trim(); if(!name) return null;
      const leaderId=pick(r,SQUAD_COL.leaderId,'').trim();
      return {
        id:pick(r,SQUAD_COL.id,''),name,category:normCategory(pick(r,SQUAD_COL.category,'Other')),
        leaderId,leaderName:idToName.get(leaderId)||'',objective:pick(r,SQUAD_COL.objective,''),
        active:pick(r,SQUAD_COL.active,''),created:pick(r,SQUAD_COL.created,''),notes:pick(r,SQUAD_COL.notes,'')
      };
    }).filter(Boolean);
  }

  // ---------------- UI Wiring ----------------
  function wireUI(){
    renderCategoryPills('All');
    const pills=document.getElementById('cat-pills');
    if(pills)pills.addEventListener('click',e=>{
      const btn=e.target.closest('[data-cat]');if(!btn)return;
      pills.querySelectorAll('.pill-cat').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');applyFilters();
    });
    document.getElementById('myOnly')?.addEventListener('change',applyFilters);
    document.getElementById('activeOnly')?.addEventListener('change',applyFilters);
    document.getElementById('search')?.addEventListener('input',applyFilters);
    document.addEventListener('powerup-admin-filter-change',applyFilters);
  }

  // ---------------- Startup ----------------
  document.addEventListener('DOMContentLoaded',async()=>{
    await P.session.requireLogin(); await P.layout.injectLayout();
    IS_ADMIN=!!(P.auth&&P.auth.isAdmin&&P.auth.isAdmin());
    P.layout.setPageTitle(IS_ADMIN?'Squads (Admin)':'Squads');
    await P.session.initHeader(); wireUI();
    const chk=document.getElementById('activeOnly'); if(chk) chk.checked=false;
    await loadAllData(); await applyFilters();
  });

  // ---------------- Manage Squads Toggle ----------------
  const waitForManageBtn=setInterval(()=>{
    const btn=document.getElementById('btn-manage');
    if(btn){clearInterval(waitForManageBtn);initManageSquadsFeature(btn);}
  },300);

  async function initManageSquadsFeature(btn){
    let tableView=false;
    const cardsContainer=document.getElementById('cards');
    let manageView=null;
    btn.addEventListener('click',async()=>{
      tableView=!tableView;
      btn.textContent=tableView?'View Cards':'Manage Squads';
      if(tableView){
        cardsContainer.innerHTML='<div class="spinner" style="text-align:center;margin-top:80px;">Loading…</div>';
        const [squads,members,employees]=await Promise.all([
          P.api.getRowsByTitle('SQUADS',{force:true}),
          P.api.getRowsByTitle('SQUAD_MEMBERS',{force:true}),
          P.getEmployees()
        ]);
        manageView=await buildManageTable(squads,members,employees,cardsContainer);
      }else{
        if(manageView)manageView.remove();
        showOverlay('Refreshing…');
        await loadAllData(); await applyFilters(); hideOverlay();
      }
    });
  }

  function showOverlay(text='Loading…'){
    let o=document.getElementById('manageOverlay');
    if(!o){
      o=document.createElement('div');
      o.id='manageOverlay';
      o.innerHTML=`<div class="manage-overlay-spinner"><div class="spinner"></div><div class="label">${text}</div></div>`;
      document.body.appendChild(o);
    }
    o.querySelector('.label').textContent=text;
    o.style.display='flex'; return o;
  }
  function hideOverlay(){const o=document.getElementById('manageOverlay');if(o)o.style.display='none';}

  // ---------------- Build Manage Table ----------------
  async function buildManageTable(squads,members,employees,container){
    const empList=employees.map(e=>({id:e['Employee ID']||e['Position ID'],name:e['Employee Name']||e['Display Name']})).filter(e=>e.id&&e.name);
    const leadersById=new Map();
    members.forEach(m=>{
      if(!isTrue(pick(m,SM_COL.active,'true')))return;
      if(String(pick(m,SM_COL.role,'')).toLowerCase()!=='leader')return;
      const sid=pick(m,SM_COL.squadId,'').trim();const eid=pick(m,SM_COL.empId,'').trim();
      if(!sid||!eid)return;
      let s=leadersById.get(sid);if(!s){s=new Set();leadersById.set(sid,s);}s.add(eid);
    });

    const table=document.createElement('table');
    table.className='manage-table';
    table.innerHTML=`<thead><tr><th>ID</th><th>Squad Name</th><th>Category</th><th>Active</th>
      <th>Objective</th><th>Leaders</th><th>Created By</th><th>Actions</th></tr></thead>
      <tbody>${squads.map(r=>{
        const sid=r['Squad ID']; const sel=leadersById.get(sid)||new Set();
        return `<tr data-id="${sid}">
          <td>${sid}</td><td class="name" contenteditable>${dash(r['Squad Name'])}</td>
          <td class="category" contenteditable>${dash(r['Category'])}</td>
          <td><input type="checkbox" ${isTrue(r['Active'])?'checked':''}></td>
          <td class="objective" contenteditable>${dash(r['Objective'])}</td>
          <td><select multiple size="4" class="leader-select">${empList.map(e=>`<option value="${e.id}" ${sel.has(e.id)?'selected':''}>${e.name}</option>`).join('')}</select></td>
          <td class="createdBy" contenteditable>${dash(r['Created By'])}</td>
          <td><button class="btn save">Save</button><button class="btn cancel">Cancel</button></td>
        </tr>`;
      }).join('')}</tbody>`;
    container.innerHTML='';container.appendChild(table);

    table.querySelectorAll('tr[data-id]').forEach(tr=>{
      const sid=tr.dataset.id;
      const orig={
        name:tr.querySelector('.name').textContent.trim(),
        category:tr.querySelector('.category').textContent.trim(),
        active:tr.querySelector('input').checked,
        objective:tr.querySelector('.objective').textContent.trim(),
        createdBy:tr.querySelector('.createdBy').textContent.trim(),
        leaders:[...tr.querySelectorAll('.leader-select option:checked')].map(o=>o.value)
      };
      tr.dataset.original=JSON.stringify(orig);
    });

    table.addEventListener('click',async e=>{
      const tr=e.target.closest('tr[data-id]');if(!tr)return;
      const sid=tr.dataset.id;
      if(e.target.classList.contains('save')){
        const name=tr.querySelector('.name').textContent.trim();
        const cat=tr.querySelector('.category').textContent.trim();
        const act=tr.querySelector('input').checked;
        const obj=tr.querySelector('.objective').textContent.trim();
        const cr=tr.querySelector('.createdBy').textContent.trim();
        const leaders=[...tr.querySelectorAll('.leader-select option:checked')].map(o=>({id:o.value,name:o.textContent}));
        if(!leaders.length){P.ui.toast('Each squad must have at least one leader.','warn');return;}
        try{
          await P.api.updateRowById('SQUADS',sid,{'Squad Name':name,'Category':cat,'Active':act,'Objective':obj,'Created By':cr});
          P.ui.toast(`✅ ${name} updated.`,'success');
        }catch(err){console.error(err);P.ui.toast('Save failed','error');}
      }
      if(e.target.classList.contains('cancel')){
        const orig=JSON.parse(tr.dataset.original||'{}');
        tr.querySelector('.name').textContent=orig.name;
        tr.querySelector('.category').textContent=orig.category;
        tr.querySelector('input').checked=orig.active;
        tr.querySelector('.objective').textContent=orig.objective;
        tr.querySelector('.createdBy').textContent=orig.createdBy;
        const sel=tr.querySelector('.leader-select');
        [...sel.options].forEach(o=>o.selected=(orig.leaders||[]).includes(o.value));
        tr.style.background='rgba(255,255,0,0.1)';setTimeout(()=>tr.style.background='',500);
      }
    });

    return table;
  }

  // ---------------- Inline Add Squad Modal ----------------
  document.getElementById("btn-add-squad")?.addEventListener("click",()=>{
    if(P.squadAddForm&&typeof P.squadAddForm.open==='function') P.squadAddForm.open();
    else console.warn("⚠️ squadAddForm not ready");
  });
  document.addEventListener("squad-added",async()=>{
    if(P.squads?.refresh) await P.squads.refresh(); else location.reload();
  });

  // ---------------- Styles ----------------
  const style=document.createElement('style');
  style.textContent=`
  .manage-table{width:100%;border-collapse:collapse;font-size:13px;}
  .manage-table th,.manage-table td{border:1px solid #2d3f3f;padding:8px;color:#e5e7eb;}
  .manage-table th{position:sticky;top:0;background:#0f1a1a;z-index:10;}
  .btn{background:#0f1a1a;border:1px solid var(--accent,#00f08e);color:#d9e6e6;padding:4px 10px;border-radius:6px;cursor:pointer;}
  .btn:hover{background:#152525;}
  #manageOverlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:3000;}
  .manage-overlay-spinner{display:flex;flex-direction:column;align-items:center;gap:12px;background:#0f1b1b;
    border:1px solid var(--accent,#00f08e);padding:22px;border-radius:12px;color:#d9e6e6;}
  .spinner{width:28px;height:28px;border:3px solid #00f08e;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}
  .status-pill{padding:3px 8px;border-radius:999px;font-weight:700;font-size:12px;}
  .status-on{background:#00f08e;color:#000;} .status-off{background:#444;color:#fff;}
  .pill-cat{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;cursor:pointer;}
  .pill-cat.active{background:rgba(0,0,0,.15);}
  `;
  document.head.appendChild(style);

})(window.PowerUp||{});
