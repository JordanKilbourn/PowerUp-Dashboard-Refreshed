// scripts/squads-cards.js
// =====================================================
// Combined, upgraded + classic UI merged version
// =====================================================

(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

  // ------------------------------
  // Column maps
  // ------------------------------
  const EMP_COL = {
    id: ['Position ID','Employee ID'],
    name: ['Display Name','Employee Name','Name']
  };
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
    squadId: ['Squad ID','SquadId','Squad'],
    empId: ['Employee ID','EmployeeID','Position ID'],
    empName: ['Employee Name','Name','Display Name'],
    active: ['Active','Is Active?'],
    role: ['Role']
  };

  const CATS = ['All','CI','Quality','Safety','Training','Other'];
  const CAT_CLASS = {
    CI:'cat-ci',
    Quality:'cat-quality',
    Safety:'cat-safety',
    Training:'cat-training',
    Other:'cat-other'
  };

  // ------------------------------
  // Utilities
  // ------------------------------
  const pick = (row, list, d='')=>{
    if(!row) return d;
    const keys = Array.isArray(list)?list:[list];
    for(const k of keys){ if(row[k]!=null && row[k]!=='') return row[k]; }
    return d;
  };

  const dash = v=>(v==null||String(v).trim()==='')?'-':String(v);
  const isTrue = v=>v===true||/^(true|yes|y|checked|1)$/i.test(String(v||'').trim());

  function normCategory(v){
    const t=String(v||'').toLowerCase();
    if(/^ci|improve/.test(t))return'CI';
    if(/^quality/.test(t))return'Quality';
    if(/^safety/.test(t))return'Safety';
    if(/^training/.test(t))return'Training';
    return'Other';
  }

  function parseMemberTokens(text){
    return String(text||'').split(/[;,\n]+/).map(s=>s.trim()).filter(Boolean);
  }

  function catVar(cat){
    switch(cat){
      case'CI':return'var(--sq-ci)';
      case'Quality':return'var(--sq-quality)';
      case'Safety':return'var(--sq-safety)';
      case'Training':return'var(--sq-training)';
      case'Other':return'var(--sq-other)';
      default:return'var(--accent)';
    }
  }

  // ------------------------------
  // Caches and state
  // ------------------------------
  const MEMBERS_BY_SQUAD=new Map();
  const LEADERS_BY_SQUAD=new Map();
  let ALL=[];
  let idToName=new Map();
  let IS_ADMIN=false;

  // ------------------------------
  // Membership helper
  // ------------------------------
  function userIsMemberOrLeader(squad,session){
    const myId=String(session.employeeId||'').trim().toLowerCase();
    const myName=String(session.displayName||'').trim().toLowerCase();
    if(myId && String(squad.leaderId||'').trim().toLowerCase()===myId)return true;

    const sid=String(squad.id||'').trim();
    const entry=MEMBERS_BY_SQUAD.get(sid);
    if(entry){
      if(myId && entry.ids.has(myId))return true;
      if(myName && entry.names.has(myName))return true;
    }else{
      const tokensLC=parseMemberTokens(squad.members).map(t=>t.toLowerCase());
      if(myId && tokensLC.includes(myId))return true;
      if(myName && tokensLC.includes(myName))return true;
    }
    return false;
  }

  // ------------------------------
  // Render category pills
  // ------------------------------
  function renderCategoryPills(activeCat){
    const wrap=document.getElementById('cat-pills');
    if(!wrap)return;
    wrap.innerHTML=CATS.map(cat=>{
      const style=`--cat:${catVar(cat)};`;
      return `
        <button class="pill-cat${cat===activeCat?' active':''}" data-cat="${cat}" style="${style}">
          <span class="dot"></span>${cat}
        </button>`;
    }).join('');
  }

  // ------------------------------
  // Render squad cards
  // ------------------------------
  function renderCards(list){
    const cards=document.getElementById('cards');
    const msg=document.getElementById('s-msg');
    if(!cards)return;

    if(!list.length){
      cards.innerHTML='';
      if(msg){
        msg.style.display='block';
        msg.innerHTML=`No squads match your filters.<br/>Try clearing search or showing inactive.`;
      }
      return;
    }
    if(msg)msg.style.display='none';

    cards.innerHTML=list.map(sq=>{
      const status=isTrue(sq.active)
        ?`<span class="status-pill status-on">Active</span>`
        :`<span class="status-pill status-off">Inactive</span>`;

      let leaderLine=dash(sq.leaderName||sq.leaderId);
      const leaders=LEADERS_BY_SQUAD.get(String(sq.id||'').trim());
      if(leaders&&leaders.length){
        const names=leaders.map(x=>(x.name||idToName.get(x.id)||x.id||'').toString().trim())
          .filter(Boolean).sort((a,b)=>a.localeCompare(b));
        leaderLine=names.length===1?names[0]:
          names.length===2?`${names[0]}, ${names[1]}`:
          `${names[0]}, ${names[1]} +${names.length-2} more`;
      }

      const detailsHref=sq.id
        ?`squad-details.html?id=${encodeURIComponent(sq.id)}`
        :`squad-details.html?name=${encodeURIComponent(sq.name)}`;
      const catCls=CAT_CLASS[sq.category]||CAT_CLASS.Other;

      return `
        <div class="squad-card card ${catCls}">
          <h4>${dash(sq.name)}</h4>
          <div class="squad-meta"><b>${(leaders&&leaders.length>1)?'Leaders':'Leader'}:</b> ${leaderLine}</div>
          <div class="squad-meta"><b>Status:</b> ${status}</div>
          <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
          <div class="squad-foot"><a class="squad-link" href="${detailsHref}">View Details →</a></div>
        </div>`;
    }).join('');
  }

  // ------------------------------
  // Admin employee filter
  // ------------------------------
  async function getAdminTargetFromFilter(){
    try{
      const sel=(sessionStorage.getItem('pu.adminEmployeeFilter')||'').trim();
      if(!sel||sel==='__ALL__')return null;

      if(!idToName.size){
        const em=await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
        em.forEach(r=>{
          const id=String(r['Position ID']||r['Employee ID']||'').trim();
          const nm=String(r['Display Name']||r['Employee Name']||r['Name']||'').trim();
          if(id)idToName.set(id,nm);
        });
      }
      const norm=s=>String(s||'').trim().toLowerCase();
      let targetId='';
      for(const [id,nm] of idToName.entries()){
        if(norm(nm)===norm(sel)){targetId=id;break;}
      }
      return {id:targetId,name:sel};
    }catch{return null;}
  }

  // ------------------------------
  // Apply card filters
  // ------------------------------
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
        if(!target)target={id:String(session.employeeId||'').trim(),name:String(session.displayName||'').trim()};
        const norm=s=>String(s||'').trim().toLowerCase();
        const tgtId=norm(target.id);
        const tgtName=norm(target.name);

        list=list.filter(s=>{
          const leaders=LEADERS_BY_SQUAD.get(String(s.id||'').trim())||[];
          const leaderHit=leaders.some(x=>norm(x.id)===tgtId||norm(x.name)===tgtName);
          const m=MEMBERS_BY_SQUAD.get(String(s.id||'').trim());
          const memberHit=m?(m.ids.has(tgtId)||m.names.has(tgtName)):false;
          let fallbackHit=false;
          if(!m&&s.members){
            const toks=String(s.members).split(/[;,\n]+/).map(t=>norm(t));
            fallbackHit=(!!tgtId&&toks.includes(tgtId))||(!!tgtName&&toks.includes(tgtName));
          }
          return leaderHit||memberHit||fallbackHit;
        });
      }else list=list.filter(s=>userIsMemberOrLeader(s,session));
    }

    if(activeOnly)list=list.filter(s=>isTrue(s.active));
    if(cat!=='All')list=list.filter(s=>s.category===cat);
    if(q){
      list=list.filter(s=>{
        const hay=[s.name,s.leaderName,s.leaderId,s.objective,s.notes].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    renderCards(list);
  }

  // ------------------------------
  // Load all data
  // ------------------------------
  async function load(){
    const emRows=await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    idToName=new Map();
    emRows.forEach(r=>{
      const id=pick(r,EMP_COL.id,'').toString().trim();
      const name=pick(r,EMP_COL.name,'').toString().trim();
      if(id)idToName.set(id,name);
    });

    MEMBERS_BY_SQUAD.clear();
    LEADERS_BY_SQUAD.clear();

    try{
      if(SHEETS.SQUAD_MEMBERS){
        const smRows=await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
        smRows.forEach(r=>{
          const active=isTrue(pick(r,SM_COL.active,'true'));
          if(!active)return;
          const sid=pick(r,SM_COL.squadId,'').trim();
          if(!sid)return;

          const eid=pick(r,SM_COL.empId,'').trim();
          const enm=(pick(r,SM_COL.empName,'')||idToName.get(eid)||'').toString().trim();
          const role=String(r['Role']||'').toLowerCase();

          let entry=MEMBERS_BY_SQUAD.get(sid);
          if(!entry){entry={ids:new Set(),names:new Set()};MEMBERS_BY_SQUAD.set(sid,entry);}
          if(eid)entry.ids.add(eid.toLowerCase());
          if(enm)entry.names.add(enm.toLowerCase());

          if(role==='leader'){
            const arr=LEADERS_BY_SQUAD.get(sid)||[];
            arr.push({id:eid,name:enm});
            LEADERS_BY_SQUAD.set(sid,arr);
          }
        });
      }
    }catch(err){console.error('Error loading squad members:',err);}

    const rows=await getRowsByTitle(SHEETS.SQUADS);
    ALL=rows.map(r=>{
      const name=pick(r,SQUAD_COL.name,'').toString().trim();
      if(!name)return null;
      const leaderId=pick(r,SQUAD_COL.leaderId,'').toString().trim();
      return{
        id:pick(r,SQUAD_COL.id,''),
        name,
        category:normCategory(pick(r,SQUAD_COL.category,'Other')),
        leaderId,
        leaderName:idToName.get(leaderId)||'',
        members:pick(r,SQUAD_COL.members,''),
        objective:pick(r,SQUAD_COL.objective,''),
        active:pick(r,SQUAD_COL.active,''),
        created:pick(r,SQUAD_COL.created,''),
        notes:pick(r,SQUAD_COL.notes,'')
      };
    }).filter(Boolean);
  }

  // ------------------------------
  // Wire UI filters
  // ------------------------------
  function wireUI(){
    renderCategoryPills('All');
    const pills=document.getElementById('cat-pills');
    if(pills){
      pills.addEventListener('click',e=>{
        const btn=e.target.closest('[data-cat]');
        if(!btn)return;
        pills.querySelectorAll('.pill-cat').forEach(p=>p.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      });
    }
    document.getElementById('myOnly')?.addEventListener('change',applyFilters);
    document.getElementById('activeOnly')?.addEventListener('change',applyFilters);
    document.getElementById('search')?.addEventListener('input',applyFilters);
    document.addEventListener('powerup-admin-filter-change',applyFilters);
  }

  // ------------------------------
  // Init on DOM ready
  // ------------------------------
  document.addEventListener('DOMContentLoaded',async()=>{
    P.session.requireLogin();
    P.layout.injectLayout();
    IS_ADMIN=!!(P.auth && P.auth.isAdmin && P.auth.isAdmin());
    P.layout.setPageTitle(IS_ADMIN?'Squads (Admin)':'Squads');
    await P.session.initHeader();
    wireUI();

    const chk=document.getElementById('activeOnly');
    if(chk)chk.checked=false;

    await load();
    applyFilters();
  });

  // =====================================================
  // Manage Squads toggle and overlay begin in Part 2
  // =====================================================
  // =====================================================
  // Manage Squads Feature (UI + Logic + Dropdown)
  // =====================================================

  // Wait for the Manage button to exist then initialize
  const waitForManageBtn=setInterval(()=>{
    const manageBtn=document.getElementById('btn-manage');
    if(manageBtn){
      clearInterval(waitForManageBtn);
      initManageSquadsFeature(manageBtn);
    }
  },300);

  // ------------------------------
  // Overlay Spinner (show/hide)
  // ------------------------------
  function showOverlay(text='Loading…'){
    let overlay=document.getElementById('manageOverlay');
    if(!overlay){
      overlay=document.createElement('div');
      overlay.id='manageOverlay';
      overlay.innerHTML=`
        <div class="manage-overlay-spinner">
          <div class="spinner"></div>
          <div class="label">${text}</div>
        </div>`;
      document.body.appendChild(overlay);
    }
    overlay.querySelector('.label').textContent=text;
    overlay.style.display='flex';
    return overlay;
  }
  function hideOverlay(){
    const overlay=document.getElementById('manageOverlay');
    if(overlay)overlay.style.display='none';
  }

  // ------------------------------
  // Main Manage Squads Initializer
  // ------------------------------
  async function initManageSquadsFeature(btn){
    let tableView=false;
    const cardsContainer=document.getElementById('cards');

    btn.addEventListener('click',async()=>{
      tableView=!tableView;
      // Toggle button label
      btn.textContent=tableView?'Card View':'Manage Squads';

      if(tableView){
        // --- Switch to Manage Table View ---
        showOverlay('Loading Squads…');
        try{
          const [squads,members,employees]=await Promise.all([
            PowerUp.api.getRowsByTitle('SQUADS',{force:true}),
            PowerUp.api.getRowsByTitle('SQUAD_MEMBERS',{force:true}),
            PowerUp.getEmployees()
          ]);
          buildManageTable(squads,members,employees,cardsContainer);
        }catch(err){
          console.error('Manage view load failed:',err);
          PowerUp.ui.toast('Error loading manage view','error');
        }finally{hideOverlay();}
      }else{
        // --- Switch back to Cards and Refresh ---
        showOverlay('Refreshing cards…');
        await load();
        await applyFilters();
        hideOverlay();
      }
    });
  }

  // ------------------------------
  // Build the Manage Table UI
  // ------------------------------
  async function buildManageTable(squads,members,employees,container){
    container.innerHTML=''; // clear card grid

    // Map of leaders by squad
    const LEADERS_BY_SQUAD=new Map();
    members.forEach(r=>{
      if(!isTrue(pick(r,SM_COL.active,'true')))return;
      const sid=pick(r,SM_COL.squadId,'').trim();
      const role=(pick(r,SM_COL.role,'')||'').toLowerCase();
      if(role==='leader'){
        const arr=LEADERS_BY_SQUAD.get(sid)||[];
        arr.push({
          id:pick(r,SM_COL.empId,'').trim(),
          name:pick(r,SM_COL.empName,'').trim()
        });
        LEADERS_BY_SQUAD.set(sid,arr);
      }
    });

    // Employee list for dropdowns
    const ALL_EMPLOYEES=employees.map(e=>({
      id:e['Position ID']||e['Employee ID'],
      name:e['Display Name']||e['Employee Name']
    })).filter(e=>e.id&&e.name);

    // Table HTML
    const table=document.createElement('table');
    table.className='manage-table';
    table.innerHTML=`
      <thead>
        <tr>
          <th>ID</th><th>Squad Name</th><th>Category</th>
          <th>Active</th><th>Objective</th><th>Leaders</th>
          <th>Created By</th><th class="actions-cell">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${squads.map(row=>{
          const sid=row['Squad ID']||row['ID']||'';
          const leaders=(LEADERS_BY_SQUAD.get(sid)||[]).map(x=>x.name);
          return `
            <tr data-rowid="${sid}">
              <td>${sid||'-'}</td>
              <td contenteditable class="editable name">${dash(row['Squad Name'])}</td>
              <td contenteditable class="editable category">${dash(row['Category'])}</td>
              <td><input type="checkbox" class="active" ${isTrue(row['Active'])?'checked':''}></td>
              <td contenteditable class="editable objective">${dash(row['Objective'])}</td>
              <td class="leader-cell">
                <div class="multi-select" tabindex="0">
                  <div class="selected">${leaders.join(', ')||'-'}</div>
                  <div class="options hidden">
                    ${ALL_EMPLOYEES.map(emp=>{
                      const sel=leaders.includes(emp.name)?'selected':'';
                      return `<div class="opt ${sel}" data-id="${emp.id}" data-name="${emp.name}">${emp.name}</div>`;
                    }).join('')}
                  </div>
                </div>
              </td>
              <td contenteditable class="editable created-by">${dash(row['Created By'])}</td>
              <td class="actions-cell">
                <button class="btn save">Save</button>
                <button class="btn cancel">Cancel</button>
              </td>
            </tr>`;
        }).join('')}
      </tbody>`;
    container.appendChild(table);

    // --------------------------
    // Multi-Select Dropdown Logic
    // --------------------------
    table.querySelectorAll('.multi-select').forEach(ms=>{
      const selected=ms.querySelector('.selected');
      const opts=ms.querySelector('.options');
      ms.addEventListener('click',e=>{
        if(e.target.classList.contains('opt')){
          // toggle option
          e.target.classList.toggle('selected');
          const selNames=[...opts.querySelectorAll('.opt.selected')].map(o=>o.dataset.name);
          selected.textContent=selNames.join(', ')||'-';
        }
        opts.classList.toggle('hidden');
      });
      // close on blur
      ms.addEventListener('blur',()=>opts.classList.add('hidden'));
    });

    // --------------------------
    // Save / Cancel buttons
    // --------------------------
    table.addEventListener('click',async e=>{
      const tr=e.target.closest('tr[data-rowid]');
      if(!tr)return;
      const sid=tr.dataset.rowid;

      // --- Save logic ---
      if(e.target.classList.contains('save')){
        const name=tr.querySelector('.name')?.textContent.trim();
        const category=tr.querySelector('.category')?.textContent.trim();
        const active=tr.querySelector('.active')?.checked;
        const objective=tr.querySelector('.objective')?.textContent.trim();
        const createdBy=tr.querySelector('.created-by')?.textContent.trim();
        const selOpts=[...tr.querySelectorAll('.opt.selected')];
        const leaders=selOpts.map(o=>({id:o.dataset.id,name:o.dataset.name}));
        if(!leaders.length){
          return PowerUp.ui.toast('Each squad must have at least one leader.','warn');
        }

        try{
          // Update SQUADS row
          await PowerUp.api.updateRowById('SQUADS',sid,{
            'Squad Name':name,
            'Category':category,
            'Active':active,
            'Objective':objective,
            'Created By':createdBy
          });

          // Reconcile leader rows in SQUAD_MEMBERS
          const existing=members.filter(r=>r['Squad ID']===sid&&r['Role']==='Leader');
          const existingIDs=existing.map(r=>r['Employee ID']);
          const toRemove=existing.filter(r=>!leaders.some(l=>l.id===r['Employee ID']));
          const toAdd=leaders.filter(l=>!existingIDs.includes(l.id));

          for(const r of toRemove)
            await PowerUp.api.deleteRowById('SQUAD_MEMBERS',r.id);
          for(const l of toAdd)
            await PowerUp.addSquadMember({
              'Squad ID':sid,'Employee ID':l.id,'Employee Name':l.name,
              'Role':'Leader','Active':true,'Added By':createdBy
            });

          PowerUp.ui.toast(`Saved updates for ${name}`,'success');
        }catch(err){
          console.error('Save failed',err);
          PowerUp.ui.toast('Error saving changes','error');
        }
      }

      // --- Cancel logic ---
      if(e.target.classList.contains('cancel')){
        const opts=tr.querySelectorAll('.opt');
        opts.forEach(o=>o.classList.remove('selected'));
        tr.style.backgroundColor='rgba(255,255,0,0.1)';
        setTimeout(()=>tr.style.backgroundColor='',800);
      }
    });
  }

  // ------------------------------
  // Styles for Manage View
  // ------------------------------
  const style=document.createElement('style');
  style.textContent=`
    #manageOverlay{
      position:fixed;inset:0;background:rgba(0,0,0,.6);
      display:none;align-items:center;justify-content:center;z-index:3000;
    }
    .manage-overlay-spinner{
      display:flex;flex-direction:column;align-items:center;gap:12px;
      background:#0f1b1b;border:1px solid var(--accent,#00f08e);
      padding:22px 26px;border-radius:12px;color:#d9e6e6;font-weight:600;
    }
    .spinner{
      width:28px;height:28px;border:3px solid #00f08e;
      border-top-color:transparent;border-radius:50%;
      animation:spin 1s linear infinite;
    }
    @keyframes spin{to{transform:rotate(360deg)}}

    .manage-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;}
    .manage-table th,.manage-table td{
      border:1px solid #2d3f3f;padding:8px 10px;
    }
    .manage-table th{
      background:#0f1a1a;color:#9ffbe6;font-weight:600;
      text-transform:uppercase;font-size:12px;
      position:sticky;top:0;z-index:10;
      box-shadow:0 2px 6px rgba(0,0,0,.6);
    }
    .actions-cell{display:flex;gap:8px;justify-content:center;}
    .btn{
      border-radius:6px;cursor:pointer;
      border:1px solid var(--accent,#00f08e);
      background:#0f1a1a;color:#d9e6e6;padding:4px 10px;min-width:70px;
    }
    .btn:hover{background:#152525;}
    .multi-select{position:relative;min-width:140px;color:#e5e7eb;font-size:13px;}
    .multi-select .selected{
      background:#101f1f;border:1px solid #2d3f3f;border-radius:6px;
      padding:4px 6px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .multi-select .options{
      position:absolute;left:0;right:0;max-height:180px;overflow-y:auto;
      background:#0f1a1a;border:1px solid #2d3f3f;border-radius:6px;
      box-shadow:0 2px 6px rgba(0,0,0,.6);margin-top:2px;z-index:100;
    }
    .multi-select .options.hidden{display:none;}
    .multi-select .opt{
      padding:5px 8px;cursor:pointer;
    }
    .multi-select .opt:hover{background:#173030;}
    .multi-select .opt.selected{
      background:#0b2929;color:#9ffbe6;
    }`;
  document.head.appendChild(style);

})(window.PowerUp);
