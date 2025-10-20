// ======================================================
//  PowerUp Squads — Cards + Manage View (Unified Reset)
//  Version: 2025-10-17r2  ✅ leaders preselect + save/cancel fixed
// ======================================================

(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;
  if (!P.ui) P.ui = {};

  // ---------------- helpers ----------------
  const EMP_COL = {
    id: ['Position ID','Employee ID'],
    name: ['Display Name','Employee Name','Name']
  };
  const SQUAD_COL = {
    id: ['Squad ID','ID'],
    name: ['Squad Name','Squad','Name','Team'],
    category: ['Category','Squad Category'],
    leaderId: ['Squad Leader','Leader ID'],
    objective: ['Objective','Focus'],
    active: ['Active'],
    createdBy: ['Created By'],
    notes: ['Notes','Description']
  };
  const SM_COL = {
    squadId: ['Squad ID','SquadId','Squad'],
    empId: ['Employee ID','EmployeeID','Position ID'],
    empName: ['Employee Name','Name','Display Name'],
    role: ['Role'],
    active: ['Active','Is Active?']
  };

  const dash = v => (v == null || String(v).trim()==='' ? '-' : String(v));
  const isTrue = v => v === true || /^(true|yes|1|checked)$/i.test(String(v||'').trim());
  const pick = (row, list, d='') => {
    if (!row) return d;
    const keys = Array.isArray(list) ? list : [list];
    for (const k of keys) if (row[k] != null && row[k] !== '') return row[k];
    return d;
  };
  function safeToast(msg, type='info'){ if(P.ui?.toast) P.ui.toast(msg,type); else console.log(`[${type}]`,msg); }

  // ---------------- state ----------------
  let ALL = [];
  let MEMBERS_BY_SQUAD = new Map(); // sid -> { ids:Set, names:Set }
  let LEADERS_BY_SQUAD = new Map(); // sid -> [{id,name}]
  let idToName = new Map();
  let IS_ADMIN = false;

  // ---------------- category pills ----------------
  const CAT_CLASS = { CI:'cat-ci', Quality:'cat-quality', Safety:'cat-safety', Training:'cat-training', Other:'cat-other' };
  function renderCategoryPills(activeCat='All'){
    const cats=['All','CI','Quality','Safety','Training','Other'];
    const wrap=document.getElementById('cat-pills');
    if(!wrap) return;
    wrap.innerHTML=cats.map(cat=>`
      <button class="pill-cat${cat===activeCat?' active':''}" data-cat="${cat}"
              style="--cat-color:var(--sq-${(cat||'other').toLowerCase()})">
        <span class="dot"></span>${cat}
      </button>`).join('');
  }

  // ---------------- cards ----------------
  function renderCards(list){
    const cards=document.getElementById('cards');
    const msg=document.getElementById('s-msg');
    if(!cards) return;

    if(!list.length){
      cards.innerHTML='';
      if(msg){ msg.style.display='block'; msg.innerHTML='No squads match your filters.'; }
      return;
    }
    if(msg) msg.style.display='none';

    cards.innerHTML=list.map(sq=>{
      const sid=String(sq.id||'').trim();
      const leaders=LEADERS_BY_SQUAD.get(sid)||[];
      let leaderLine='-';
      if(leaders.length){
        const names=leaders.map(x=>x.name || idToName.get(x.id) || x.id).filter(Boolean).sort((a,b)=>a.localeCompare(b));
        leaderLine = names.join(', ');
      }else if(sq.leaderId){ leaderLine = idToName.get(sq.leaderId) || sq.leaderId; }

      const catCls = CAT_CLASS[sq.category] || CAT_CLASS.Other;
      const detailsHref = sid ? `squad-details.html?id=${encodeURIComponent(sid)}`
                              : `squad-details.html?name=${encodeURIComponent(sq.name)}`;

      return `
        <div class="squad-card card ${catCls}">
          <h4>${dash(sq.name)}</h4>
          <div class="squad-meta"><b>Leader(s):</b> ${dash(leaderLine)}</div>
          <div class="squad-meta"><b>Status:</b> ${isTrue(sq.active)
            ? '<span class="status-pill status-on">Active</span>'
            : '<span class="status-pill status-off">Inactive</span>'}</div>
          <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
          <div class="squad-foot"><a class="squad-link" href="${detailsHref}">View Details →</a></div>
        </div>`;
    }).join('');
  }

  async function loadAllData(){
    // employees -> idToName
    const em = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    idToName.clear();
    em.forEach(r=>{
      const id = String(pick(r,EMP_COL.id,'')).trim();
      const nm = String(pick(r,EMP_COL.name,'')).trim();
      if(id) idToName.set(id,nm);
    });

    // members/leaders maps
    MEMBERS_BY_SQUAD = new Map();
    LEADERS_BY_SQUAD = new Map();
    try{
      const sm = await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
      sm.forEach(r=>{
        if(!isTrue(pick(r,SM_COL.active,'true'))) return;
        const sid = String(pick(r,SM_COL.squadId,'')).trim(); if(!sid) return;
        const eid = String(pick(r,SM_COL.empId,'')).trim();
        const enm = String(pick(r,SM_COL.empName,'') || idToName.get(eid) || '').trim();
        const role = String(pick(r,SM_COL.role,'')).toLowerCase();

        let entry = MEMBERS_BY_SQUAD.get(sid);
        if(!entry){ entry={ids:new Set(),names:new Set()}; MEMBERS_BY_SQUAD.set(sid,entry); }
        if(eid) entry.ids.add(eid.toLowerCase());
        if(enm) entry.names.add(enm.toLowerCase());

        if(role==='leader'){
          const arr = LEADERS_BY_SQUAD.get(sid) || [];
          arr.push({id:eid,name:enm});
          LEADERS_BY_SQUAD.set(sid,arr);
        }
      });
    }catch(err){ console.warn('SQUAD_MEMBERS load warn:',err); }

    // squads -> ALL
    const rows = await getRowsByTitle(SHEETS.SQUADS);
    ALL = rows.map(r=>{
      const name = String(pick(r,SQUAD_COL.name,'')).trim();
      if(!name) return null;
      const leaderId = String(pick(r,SQUAD_COL.leaderId,'')).trim();
      const catRaw = String(pick(r,SQUAD_COL.category,'Other')).toLowerCase();
      const category = /^ci/.test(catRaw) ? 'CI'
                      : /^quality/.test(catRaw) ? 'Quality'
                      : /^safety/.test(catRaw) ? 'Safety'
                      : /^training/.test(catRaw) ? 'Training' : 'Other';
      return {
        id: pick(r,SQUAD_COL.id,''),
        name,
        category,
        leaderId,
        objective: pick(r,SQUAD_COL.objective,''),
        active: pick(r,SQUAD_COL.active,''),
        createdBy: pick(r,SQUAD_COL.createdBy,''),
        notes: pick(r,SQUAD_COL.notes,'')
      };
    }).filter(Boolean);
  }

  // ---------------- filters ----------------
  function userIsMemberOrLeader(squad, session){
    const myId = String(session.employeeId||'').trim().toLowerCase();
    const myName = String(session.displayName||'').trim().toLowerCase();
    if(myId && String(squad.leaderId||'').trim().toLowerCase()===myId) return true;
    const m = MEMBERS_BY_SQUAD.get(String(squad.id||'').trim());
    if(m) return (myId && m.ids.has(myId)) || (myName && m.names.has(myName));
    return false;
  }

  async function applyFilters(){
    const session = P.session.get?.() || {};
    const cat = document.querySelector('.pill-cat.active')?.dataset.cat || 'All';
    const myOnly = document.getElementById('myOnly')?.checked;
    const activeOnly = document.getElementById('activeOnly')?.checked;
    const q = (document.getElementById('search')?.value || '').trim().toLowerCase();

    let list = ALL.slice();

    if(myOnly){
      if(IS_ADMIN){
        // admin filter (optional employee selection stored by your header)
        let targetName = (sessionStorage.getItem('pu.adminEmployeeFilter')||'').trim();
        if(!targetName) targetName = String(session.displayName||'').trim();
        const norm = s=>String(s||'').trim().toLowerCase();
        const tgtName = norm(targetName);

        list = list.filter(s=>{
          const leaders = LEADERS_BY_SQUAD.get(String(s.id||'').trim())||[];
          const leaderHit = leaders.some(x=> norm(x.name)===tgtName );
          const m = MEMBERS_BY_SQUAD.get(String(s.id||'').trim());
          const memberHit = m ? m.names.has(tgtName) : false;
          return leaderHit || memberHit;
        });
      }else{
        list = list.filter(s=>userIsMemberOrLeader(s, session));
      }
    }

    if(activeOnly) list = list.filter(s=>isTrue(s.active));
    if(cat!=='All') list = list.filter(s=>s.category===cat);
    if(q){
      list = list.filter(s=>{
        const hay=[s.name,s.leaderId,s.objective,s.notes].join(' ').toLowerCase();
        return hay.includes(q);
      });
    }

    renderCards(list);
  }

  function wireUI(){
    renderCategoryPills('All');
    const pills=document.getElementById('cat-pills');
    if(pills){
      pills.addEventListener('click',e=>{
        const btn=e.target.closest('[data-cat]'); if(!btn) return;
        pills.querySelectorAll('.pill-cat').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active'); applyFilters();
      });
    }
    document.getElementById('myOnly')?.addEventListener('change',applyFilters);
    document.getElementById('activeOnly')?.addEventListener('change',applyFilters);
    document.getElementById('search')?.addEventListener('input',applyFilters);
    document.addEventListener('powerup-admin-filter-change',applyFilters);
  }

  // ---------------- startup ----------------
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await P.session.requireLogin();
      await P.layout.injectLayout();

      IS_ADMIN = !!(P.auth && P.auth.isAdmin && P.auth.isAdmin());
      P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');

      await P.session.initHeader();
      wireUI();

      const chk=document.getElementById('activeOnly'); if(chk) chk.checked=false;

      await loadAllData();
      await applyFilters();
    }catch(err){
      console.error('Startup error:',err);
      safeToast('Startup failed — check console.','error');
    }
  });

  // =====================================================
  // Manage Squads (toggle + overlay)
  // =====================================================
  const waitForManageBtn=setInterval(()=>{
    const manageBtn=document.getElementById('btn-manage');
    if(manageBtn){ clearInterval(waitForManageBtn); initManageSquadsFeature(manageBtn); }
  },300);

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
  function hideOverlay(){ const o=document.getElementById('manageOverlay'); if(o) o.style.display='none'; }

  async function initManageSquadsFeature(btn){
    let tableView=false;
    const cardsContainer=document.getElementById('cards');
    let manageView = null;

    btn.addEventListener('click', async ()=>{
      tableView=!tableView;
      btn.textContent = tableView ? 'Card View' : 'Manage Squads';

      if(tableView){
        showOverlay('Loading Squads…');
        try{
          const [squadsRes,membersRes,employeesRes] = await Promise.all([
            P.api.getRowsByTitle('SQUADS',{force:true}),
            P.api.getRowsByTitle('SQUAD_MEMBERS',{force:true}),
            P.getEmployees()
          ]);
          manageView = await buildManageTable(squadsRes,membersRes,employeesRes,cardsContainer);
          cardsContainer.style.display='none';
          manageView.style.display='block';
        }catch(err){
          console.error(err); safeToast('Error loading manage view','error');
        }finally{ hideOverlay(); }
      }else{
        // back to cards
        if(manageView) manageView.style.display='none';
        cardsContainer.style.display='block';
        showOverlay('Refreshing cards…');
        try{
          await loadAllData();
          await applyFilters();
        }finally{ hideOverlay(); }
      }
    });
  }

  // =====================================================
  // Build Manage Table (+ fixed leaders + fixed save/cancel)
  // =====================================================
  async function buildManageTable(squads, members, employees, cardsContainer){
    let manageView=document.getElementById('squad-management-view');
    if(!manageView){
      manageView=document.createElement('div');
      manageView.id='squad-management-view';
      cardsContainer.parentNode.insertBefore(manageView,cardsContainer.nextSibling);
    }
    manageView.innerHTML='';

    if(!Array.isArray(squads)||!squads.length){
      manageView.innerHTML='<div class="no-data">No squads available.</div>';
      return manageView;
    }

    // employees -> [{id,name}]
    const empMap = employees.map(e=>{
      const id=e['Position ID']||e['Employee ID'];
      const name=e['Display Name']||e['Employee Name'];
      return {id,name};
    }).filter(e=>e.id&&e.name);

    // leaders by ID for preselect
    const leadersById = new Map(); // sid -> Set(ids)
    members.forEach(m=>{
      if(!isTrue(pick(m,SM_COL.active,'true'))) return;
      if(String(pick(m,SM_COL.role,'')).toLowerCase()!=='leader') return;
      const sid=String(pick(m,SM_COL.squadId,'')).trim();
      const eid=String(pick(m,SM_COL.empId,'')).trim();
      if(!sid||!eid) return;
      let set = leadersById.get(sid);
      if(!set){ set=new Set(); leadersById.set(sid,set); }
      set.add(eid);
    });

    const table=document.createElement('table');
    table.className='manage-table';
    table.innerHTML=`
      <thead>
        <tr>
          <th>ID</th><th>Squad Name</th><th>Category</th><th>Active</th>
          <th>Objective</th><th>Leaders</th><th>Created By</th><th class="actions">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${squads.map(r=>{
          const sid=r['Squad ID'];
          const selectedIds = leadersById.get(sid) || new Set();
          return `
          <tr data-id="${sid}">
            <td class="id">${sid}</td>
            <td class="name" contenteditable="true">${dash(r['Squad Name'])}</td>
            <td class="category" contenteditable="true">${dash(r['Category'])}</td>
            <td class="active"><input type="checkbox" ${isTrue(r['Active'])?'checked':''}></td>
            <td class="objective" contenteditable="true">${dash(r['Objective'])}</td>
            <td class="leaders">
              <select multiple size="4" class="leader-select">
                ${empMap.map(emp=>`<option value="${emp.id}" data-name="${emp.name}" ${selectedIds.has(emp.id)?'selected':''}>${emp.name}</option>`).join('')}
              </select>
            </td>
            <td class="createdBy" contenteditable="true">${dash(r['Created By'])}</td>
            <td class="actions">
              <button class="btn save-btn">Save</button>
              <button class="btn cancel-btn">Cancel</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>`;
    manageView.appendChild(table);

    // snapshot originals for Cancel
    table.querySelectorAll('tr[data-id]').forEach(tr=>{
      const sid=tr.dataset.id;
      const orig={
        name: tr.querySelector('.name').textContent.trim(),
        category: tr.querySelector('.category').textContent.trim(),
        active: tr.querySelector('.active input').checked,
        objective: tr.querySelector('.objective').textContent.trim(),
        createdBy: tr.querySelector('.createdBy').textContent.trim(),
        leaders: [...tr.querySelectorAll('.leader-select option:checked')].map(o=>o.value) // IDs
      };
      tr.dataset.original = JSON.stringify(orig);
    });

    // click handling (robust)
    table.addEventListener('click', async (e)=>{
      const tr = e.target.closest('tr[data-id]');
      if(!tr) return;
      const sid = tr.dataset.id;

      if(e.target.closest('.save-btn')){
        const name = tr.querySelector('.name').textContent.trim();
        const category = tr.querySelector('.category').textContent.trim();
        const active = tr.querySelector('.active input').checked;
        const objective = tr.querySelector('.objective').textContent.trim();
        const createdBy = tr.querySelector('.createdBy').textContent.trim();
        const selected = [...tr.querySelectorAll('.leader-select option:checked')]
          .map(o=>({ id:o.value, name:o.dataset.name }));

        if(!selected.length){ safeToast('Each squad must have at least one leader.','warn'); return; }

        try{
          await PowerUp.api.updateRowById('SQUADS',sid,{
            'Squad Name':name,'Category':category,'Active':active,
            'Objective':objective,'Created By':createdBy
          });

          // reconcile leaders by ID
          const existing = members.filter(m=>m['Squad ID']===sid && m['Role']==='Leader');
          const existingIDs = existing.map(m=>String(m['Employee ID']));
          const selIDs = selected.map(s=>s.id);

          const toRemove = existing.filter(m=>!selIDs.includes(String(m['Employee ID'])));
          const toAdd    = selected.filter(s=>!existingIDs.includes(String(s.id)));

          for(const r of toRemove) await PowerUp.api.deleteRowById('SQUAD_MEMBERS', r.id);
          for(const l of toAdd) await PowerUp.api.addRow('SQUAD_MEMBERS',{
            'Squad ID':sid,'Employee ID':l.id,'Employee Name':l.name,'Role':'Leader','Active':true
          });

          // update snapshot
          tr.dataset.original = JSON.stringify({
            name,category,active,objective,createdBy,leaders: selIDs
          });

          safeToast(`✅ Squad "${name}" updated.`,'success');
        }catch(err){
          console.error(err); safeToast('Error saving squad changes','error');
        }
      }

      if(e.target.closest('.cancel-btn')){
        const orig = JSON.parse(tr.dataset.original||'{}');
        tr.querySelector('.name').textContent = orig.name || '';
        tr.querySelector('.category').textContent = orig.category || '';
        tr.querySelector('.active input').checked = !!orig.active;
        tr.querySelector('.objective').textContent = orig.objective || '';
        tr.querySelector('.createdBy').textContent = orig.createdBy || '';
        const sel = tr.querySelector('.leader-select');
        if(sel){
          [...sel.options].forEach(o=>{ o.selected = (orig.leaders||[]).includes(o.value); });
        }
        tr.style.backgroundColor='rgba(255,255,0,.08)';
        setTimeout(()=>{ tr.style.backgroundColor=''; },500);
      }
    });

    return manageView;
  }

  // =====================================================
  // Styles (cards + pills + manage table + overlay)
  // =====================================================
  const style=document.createElement('style');
  style.textContent=`
  .squad-card{ border:2px solid rgba(255,255,255,.08); padding:12px 14px; border-radius:8px; }
  .squad-card h4{ font-size:16px; color:#9ffbe6; margin-bottom:6px; }
  .squad-meta{ font-size:13px; color:#e5e7eb; }
  .squad-foot{ display:flex; justify-content:flex-end; margin-top:6px; }
  .squad-link{ font-size:13px; color:var(--accent); text-decoration:none; }
  .squad-link:hover{ text-decoration:underline; }
  .status-pill{ display:inline-block; padding:3px 8px; border-radius:999px; font-size:12px; font-weight:700; }
  .status-on{ background: var(--success); color:#000; } .status-off{ background:#3a4e4e; color:#fff; }

  .pill-cat{ display:inline-flex; align-items:center; gap:8px; padding:6px 12px; border:1.5px solid var(--cat-color,#2b3b3b);
    border-radius:999px; background: var(--card-bg); color: var(--text); cursor:pointer; }
  .pill-cat .dot{ width:8px; height:8px; border-radius:50%; background: var(--cat-color); }
  .pill-cat.active{ background: rgba(0,0,0,.12); border-color: var(--cat-color); }

  .manage-table{ width:100%; border-collapse:collapse; font-size:13px; position:relative; }
  .manage-table th,.manage-table td{ border:1px solid #2d3f3f; padding:8px 10px; white-space:nowrap; background:#0f1a1a; color:#d9e6e6; }
  .manage-table th{ text-transform:uppercase; font-size:12px; font-weight:600; position:sticky; top:0; z-index:10; }
  /* small fade just behind the header row only (won't block clicks) */
  .manage-table thead::after{
    content:""; position:absolute; top:0; left:0; right:0; height:38px;
    background:linear-gradient(to bottom, rgba(15,26,26,1) 70%, transparent); pointer-events:none;
  }
  .leader-select{ width:200px; background:#101f1f; color:#e5e7eb; border:1px solid #2d3f3f; border-radius:6px; }
  .actions .btn{ min-width:70px; border-radius:6px; border:1px solid var(--accent,#00f08e); background:#0f1a1a; color:#d9e6e6; margin:2px; cursor:pointer; }
  .actions .btn:hover{ background:#152525; }

  #manageOverlay{ position:fixed; inset:0; background:rgba(0,0,0,.6); display:none; align-items:center; justify-content:center; z-index:3000; }
  .manage-overlay-spinner{ display:flex; flex-direction:column; align-items:center; gap:12px; background:#0f1b1b; border:1px solid var(--accent,#00f08e);
    padding:22px 26px; border-radius:12px; color:#d9e6e6; font-weight:600; }
  .spinner{ width:28px; height:28px; border:3px solid #00f08e; border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite; }
  @keyframes spin{ to{ transform:rotate(360deg); } }
  `;
  document.head.appendChild(style);

})(window.PowerUp||{});
