// ======================================================
//  PowerUp Squads — Cards + Manage View (Restored Feature-Complete)
//  Version: 2025-10-18  — filters (myOnly/active/search/admin) + leaders preselect + save/cancel
// ======================================================

(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;
  if (!P.ui) P.ui = {}; // toast-safe namespace

  // ---------------- column helpers ----------------
  const EMP_COL = {
    id:   ['Position ID','Employee ID'],
    name: ['Display Name','Employee Name','Name']
  };
  const SQUAD_COL = {
    id:        ['Squad ID','ID'],
    name:      ['Squad Name','Squad','Name','Team'],
    category:  ['Category','Squad Category'],
    leaderId:  ['Squad Leader','Leader ID'],
    objective: ['Objective','Focus'],
    active:    ['Active'],
    createdBy: ['Created By'],
    notes:     ['Notes','Description']
  };
  const SM_COL = {
    squadId: ['Squad ID','SquadId','Squad'],
    empId:   ['Employee ID','EmployeeID','Position ID'],
    empName: ['Employee Name','Name','Display Name'],
    role:    ['Role'],
    active:  ['Active','Is Active?']
  };

  const dash = v => (v == null || String(v).trim()==='' ? '-' : String(v));
  const isTrue = v => v === true || /^(true|yes|1|checked)$/i.test(String(v||'').trim());
  const pick = (row, list, d='') => {
    if (!row) return d;
    const keys = Array.isArray(list) ? list : [list];
    for (const k of keys) if (row[k] != null && row[k] !== '') return row[k];
    return d;
  };
  const safeToast = (msg, type='info') => P.ui?.toast ? P.ui.toast(msg,type) : console.log(`[${type}]`, msg);

  // ---------------- state ----------------
  let ALL = [];                         // normalized squads (for card view + filters)
  let MEMBERS_BY_SQUAD = new Map();     // sid -> { ids:Set, names:Set }  (for myOnly)
  let LEADERS_BY_SQUAD = new Map();     // sid -> [{id,name}]            (for card display)
  let idToName = new Map();             // employee ID -> display name
  let IS_ADMIN = false;

  // ---------------- category pills ----------------
  const CAT_CLASS = { CI:'cat-ci', Quality:'cat-quality', Safety:'cat-safety', Training:'cat-training', Other:'cat-other' };
  function renderCategoryPills(activeCat='All'){
    const wrap=document.getElementById('cat-pills');
    if(!wrap) return;
    const cats=['All','CI','Quality','Safety','Training','Other'];
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

      // Uses your existing card/pill styles from style.css
      return `
        <div class="squad-card card ${catCls}">
          <h4>${dash(sq.name)}</h4>
          <div class="squad-meta"><b>Leader(s):</b> ${dash(leaderLine)}</div>
          <div class="squad-meta">
            <b>Status:</b> ${isTrue(sq.active)
              ? '<span class="status-pill status-on">Active</span>'
              : '<span class="status-pill status-off">Inactive</span>'}
          </div>
          <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
          <div class="squad-foot"><a class="squad-link" href="${detailsHref}">View Details →</a></div>
        </div>`;
    }).join('');
  }

  // ---------------- data load (cards) ----------------
  async function loadAllData(){
    // 1) Employees: build ID -> Name map
    const em = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    idToName = new Map();
    em.forEach(r=>{
      const id = String(pick(r,EMP_COL.id,'')).trim();
      const nm = String(pick(r,EMP_COL.name,'')).trim();
      if(id) idToName.set(id,nm);
    });

    // 2) Members: build membership + leaders maps
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
    }catch(err){ console.warn('SQUAD_MEMBERS load warn (offline OK):',err); }

    // 3) Squads: normalize everything we need for cards/filters
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

  async function getAdminTargetFromFilter(session){
    // Admin can filter by another employee name the header stored in sessionStorage
    const sel = (sessionStorage.getItem('pu.adminEmployeeFilter')||'').trim();
    if(!sel || sel==='__ALL__') return null;
    // Best-effort reverse-lookup name→id using idToName
    const norm = s => String(s||'').trim().toLowerCase();
    const wanted = norm(sel);
    let matchId = '';
    for(const [id,name] of idToName.entries()){
      if(norm(name)===wanted){ matchId=id; break; }
    }
    return { id: matchId, name: sel };
  }

  async function applyFilters(){
    const session = (P.session.get && P.session.get()) || {};
    const cat = document.querySelector('.pill-cat.active')?.dataset.cat || 'All';
    const myOnly = document.getElementById('myOnly')?.checked;
    const activeOnly = document.getElementById('activeOnly')?.checked;
    const q = (document.getElementById('search')?.value || '').trim().toLowerCase();

    let list = ALL.slice();

    // My Only (with admin override)
    if(myOnly){
      if(IS_ADMIN){
        let target = await getAdminTargetFromFilter(session);
        if(!target) target = { id:String(session.employeeId||''), name:String(session.displayName||'') };
        const norm = s=>String(s||'').trim().toLowerCase();
        const tgtId = norm(target.id);
        const tgtName = norm(target.name);

        list = list.filter(s=>{
          const leaders = LEADERS_BY_SQUAD.get(String(s.id||'').trim()) || [];
          const leaderHit = leaders.some(x => norm(x.id)===tgtId || norm(x.name)===tgtName);
          const m = MEMBERS_BY_SQUAD.get(String(s.id||'').trim());
          const memberHit = m ? (m.ids.has(tgtId) || m.names.has(tgtName)) : false;
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
        const hay=[s.name, s.leaderId, s.objective, s.notes].join(' ').toLowerCase();
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
    let manageView=null;

    btn.addEventListener('click', async ()=>{
      tableView=!tableView;
      btn.textContent = tableView ? 'Card View' : 'Manage Squads';

      if(tableView){
        showOverlay('Loading Squads…');
        try{
          const [squads,members,employees] = await Promise.all([
            P.api.getRowsByTitle('SQUADS',{force:true}),
            P.api.getRowsByTitle('SQUAD_MEMBERS',{force:true}),
            P.getEmployees()
          ]);
          manageView = await buildManageTable(squads,members,employees,cardsContainer);
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
  // Build Manage Table (leaders preselect + save/cancel)
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
              <!-- native multi-select for reliability; styled via theme -->
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

    // snapshot originals for Cancel (stores IDs for leaders)
    table.querySelectorAll('tr[data-id]').forEach(tr=>{
      const orig={
        name: tr.querySelector('.name').textContent.trim(),
        category: tr.querySelector('.category').textContent.trim(),
        active: tr.querySelector('.active input').checked,
        objective: tr.querySelector('.objective').textContent.trim(),
        createdBy: tr.querySelector('.createdBy').textContent.trim(),
        leaders: [...tr.querySelectorAll('.leader-select option:checked')].map(o=>o.value)
      };
      tr.dataset.original = JSON.stringify(orig);
    });

    // Handle Save/Cancel
    table.addEventListener('click', async (e)=>{
      const tr = e.target.closest('tr[data-id]');
      if(!tr) return;
      const sid = tr.dataset.id;

      // Save
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
          // Update SQUADS row
          await PowerUp.api.updateRowById('SQUADS',sid,{
            'Squad Name':name,'Category':category,'Active':active,
            'Objective':objective,'Created By':createdBy
          });

          // Reconcile leaders in SQUAD_MEMBERS by ID
          const existing = members.filter(m=>m['Squad ID']===sid && m['Role']==='Leader');
          const existingIDs = existing.map(m=>String(m['Employee ID']));
          const selIDs = selected.map(s=>String(s.id));

          const toRemove = existing.filter(m=>!selIDs.includes(String(m['Employee ID'])));
          const toAdd    = selected.filter(s=>!existingIDs.includes(String(s.id)));

          for(const r of toRemove) await PowerUp.api.deleteRowById('SQUAD_MEMBERS', r.id);
          for(const l of toAdd) await PowerUp.api.addRow('SQUAD_MEMBERS',{
            'Squad ID':sid,'Employee ID':l.id,'Employee Name':l.name,'Role':'Leader','Active':true
          });

          // Refresh snapshot
          tr.dataset.original = JSON.stringify({ name,category,active,objective,createdBy,leaders: selIDs });

          safeToast(`✅ Squad "${name}" updated.`,'success');
        }catch(err){
          console.error(err); safeToast('Error saving squad changes','error');
        }
      }

      // Cancel
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
        safeToast('Edits canceled','info');
      }
    });

    return manageView;
  }

  // =====================================================
  // Minimal, scoped styles (don’t fight your theme.css)
  // =====================================================
  const style=document.createElement('style');
  style.textContent=`
    /* Keep header fade only as tall as the header, not half the page */
    .manage-table{ position:relative; }
    .manage-table thead::after{
      content:""; position:absolute; top:0; left:0; right:0; height:38px;
      background:linear-gradient(to bottom, rgba(15,26,26,1) 70%, transparent);
      pointer-events:none;
    }
    .manage-table th{ position:sticky; top:0; z-index:4; }
    .manage-table td, .manage-table th{
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .leader-select{ width:210px; max-width:38vw; }
    .actions .btn{ min-width:78px; }
  `;
  document.head.appendChild(style);

})(window.PowerUp||{});
