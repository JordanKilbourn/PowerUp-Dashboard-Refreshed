// ======================================================
//  PowerUp Squads Cards + Manage View
//  Updated: 2025-10-16  (restored startup + UI polish)
// ======================================================

(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;
  if (!P.ui) P.ui = {}; // ensure toast-safe namespace

  // ---------------- Helpers ----------------
  const EMP_COL = {
    id: ['Position ID','Employee ID'],
    name: ['Display Name','Employee Name','Name']
  };
  const SQUAD_COL = {
    id: ['Squad ID','ID'],
    name: ['Squad Name','Squad'],
    category: ['Category','Squad Category'],
    leaderId: ['Squad Leader','Leader ID'],
    leaderName: ['Leader Name','Leader'],
    active: ['Active'],
    objective: ['Objective'],
    createdBy: ['Created By']
  };
  function dash(v){return v==null||v===''?'-':v;}
  function isTrue(v){return v===true||String(v).toLowerCase()==='true';}
  function safeToast(msg,type='info'){
    if(P.ui?.toast) P.ui.toast(msg,type);
    else console.log(`[${type}]`,msg);
  }

  // ---------------- Load Cards ----------------
  async function load(){
    const container=document.getElementById('cards');
    if(!container) return;
    container.innerHTML='<div class="loading">Loading squads…</div>';
    try{
      const [squads,members,employees]=await Promise.all([
        getRowsByTitle('SQUADS'),
        getRowsByTitle('SQUAD_MEMBERS'),
        P.getEmployees()
      ]);
      renderSquadCards(container,squads,members,employees);
    }catch(e){
      console.error(e);
      safeToast('Error loading squads','error');
    }
  }

  async function applyFilters(){ /* placeholder for search/filter UI */ }

  function renderSquadCards(container,squads,members,employees){
    container.innerHTML='';
    for(const s of squads){
      const div=document.createElement('div');
      div.className='squad-card';
      div.innerHTML=`
        <h3>${dash(s['Squad Name'])}</h3>
        <p>${dash(s['Objective'])}</p>`;
      container.appendChild(div);
    }
  }

  // ---------------- DOMContentLoaded ----------------
  document.addEventListener('DOMContentLoaded', async () => {
    // require login + inject standard PowerUp layout
    await P.session.requireLogin();
    await P.layout.injectLayout();

    // determine admin page title
    const IS_ADMIN = !!(P.auth && P.auth.isAdmin);
    P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');

    // initialize header + filters + cards
    await P.session.initHeader();
    wireUI();
    document.getElementById('activeOnly')?.checked = false;
    await load();
    await applyFilters();
  });

  // simple placeholder for extra UI filter wiring
  function wireUI(){}

  // =====================================================
  // Manage Squads Feature (toggle + overlay)
  // =====================================================
  const waitForManageBtn=setInterval(()=>{
    const manageBtn=document.getElementById('btn-manage');
    if(manageBtn){
      clearInterval(waitForManageBtn);
      initManageSquadsFeature(manageBtn);
    }
  },300);

  // Overlay spinner
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
    if(overlay) overlay.style.display='none';
  }

  // Toggle Manage/Table view
  async function initManageSquadsFeature(btn){
    let tableView=false;
    const cardsContainer=document.getElementById('cards');

    btn.addEventListener('click',async()=>{
      tableView=!tableView;
      btn.textContent=tableView?'Card View':'Manage Squads';

      if(tableView){
        showOverlay('Loading Squads…');
        try{
          const [squads,members,employees]=await Promise.all([
            P.api.getRowsByTitle('SQUADS',{force:true}),
            P.api.getRowsByTitle('SQUAD_MEMBERS',{force:true}),
            P.getEmployees()
          ]);
          buildManageTable(squads,members,employees,cardsContainer);
        }catch(err){
          console.error(err);
          safeToast('Error loading manage view','error');
        }finally{ hideOverlay(); }
      }else{
        showOverlay('Refreshing cards…');
        await load(); await applyFilters(); hideOverlay();
      }
    });
  }

  // ---- Part 2 begins below with buildManageTable() and styles ----
// =====================================================
//  (continued)  -- Manage Table + UI/Filter Restore
// =====================================================

// ---- rebuild category pills + filters ----
function renderCategoryPills(activeCat='All'){
  const cats=['All','CI','Quality','Safety','Training','Other'];
  const wrap=document.getElementById('cat-pills');
  if(!wrap) return;
  wrap.innerHTML=cats.map(cat=>{
    return `<button class="pill-cat${cat===activeCat?' active':''}" 
      data-cat="${cat}" 
      style="--cat-color:var(--sq-${cat.toLowerCase()||'other'})">
      <span class="dot"></span>${cat}
    </button>`;
  }).join('');
}

function wireUI(){
  renderCategoryPills('All');
  const pills=document.getElementById('cat-pills');
  if(pills){
    pills.addEventListener('click',e=>{
      const btn=e.target.closest('[data-cat]');
      if(!btn) return;
      pills.querySelectorAll('.pill-cat').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  }
  document.getElementById('myOnly')?.addEventListener('change',applyFilters);
  document.getElementById('activeOnly')?.addEventListener('change',applyFilters);
  document.getElementById('search')?.addEventListener('input',applyFilters);
  document.addEventListener('powerup-admin-filter-change',applyFilters);
}

// ---- Add Squad Button wiring ----
document.getElementById("btn-add-squad")?.addEventListener("click",()=>{
  if(PowerUp.squadAddForm && typeof PowerUp.squadAddForm.open==="function"){
    PowerUp.squadAddForm.open();
  }else console.warn("⚠️ PowerUp.squadAddForm not ready");
});
document.addEventListener("squad-added",async()=>{
  if(typeof PowerUp.squads?.refresh==="function") await PowerUp.squads.refresh();
  else location.reload();
});

// =====================================================
//  Manage Table Build + Leader Dropdown
// =====================================================
async function buildManageTable(squads,members,employees,cardsContainer){
  const manageView=document.getElementById('squad-management-view')
    || document.createElement('div');
  manageView.id='squad-management-view';
  manageView.innerHTML='';
  manageView.style.display='block';
  cardsContainer.style.display='none';
  cardsContainer.parentNode.insertBefore(manageView,cardsContainer.nextSibling);

  if(!Array.isArray(squads)||!squads.length){
    manageView.innerHTML=`<div class="no-data">No squads available.</div>`;
    return;
  }

  // map employees for dropdown
  const empMap=employees.map(e=>{
    const id=e['Position ID']||e['Employee ID'];
    const name=e['Display Name']||e['Employee Name'];
    return {id,name};
  }).filter(e=>e.id&&e.name);

  const table=document.createElement('table');
  table.className='manage-table';
  table.innerHTML=`
    <thead>
      <tr>
        <th>ID</th><th>Squad Name</th><th>Category</th><th>Active</th>
        <th>Objective</th><th>Leaders</th><th>Created By</th><th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${squads.map(r=>{
        const id=r['Squad ID']||'-';
        const leaders=members
          .filter(m=>m['Squad ID']===id && m['Role']==='Leader')
          .map(m=>m['Employee Name']).join(', ');
        return `
        <tr data-id="${id}">
          <td class="id">${id}</td>
          <td class="name" contenteditable="true">${r['Squad Name']||''}</td>
          <td class="category" contenteditable="true">${r['Category']||''}</td>
          <td class="active"><input type="checkbox" ${r['Active']?'checked':''}></td>
          <td class="objective" contenteditable="true">${r['Objective']||''}</td>
          <td class="leaders">
            <select multiple class="leader-select">
              ${empMap.map(emp=>{
                const sel=leaders.includes(emp.name)?'selected':'';
                return `<option value="${emp.id}" data-name="${emp.name}" ${sel}>${emp.name}</option>`;
              }).join('')}
            </select>
          </td>
          <td class="createdBy" contenteditable="true">${r['Created By']||'-'}</td>
          <td class="actions">
            <button class="btn save-btn">Save</button>
            <button class="btn cancel-btn">Cancel</button>
          </td>
        </tr>`;
      }).join('')}
    </tbody>`;
  manageView.appendChild(table);

  // ---- Save/Cancel Logic ----
  table.addEventListener('click',async e=>{
    const tr=e.target.closest('tr');
    if(!tr) return;
    const sid=tr.dataset.id;

    if(e.target.classList.contains('save-btn')){
      const name=tr.querySelector('.name').textContent.trim();
      const category=tr.querySelector('.category').textContent.trim();
      const active=tr.querySelector('.active input').checked;
      const objective=tr.querySelector('.objective').textContent.trim();
      const createdBy=tr.querySelector('.createdBy').textContent.trim();
      const selected=[...tr.querySelectorAll('.leader-select option:checked')]
        .map(o=>({id:o.value,name:o.dataset.name}));

      if(!selected.length){
        safeToast('Each squad must have at least one leader.','warn');
        return;
      }

      try{
        await PowerUp.api.updateRowById('SQUADS',sid,{
          'Squad Name':name,'Category':category,'Active':active,
          'Objective':objective,'Created By':createdBy
        });

        // reconcile leaders in SQUAD_MEMBERS
        const existing=members.filter(m=>m['Squad ID']===sid && m['Role']==='Leader');
        const existingIDs=existing.map(m=>m['Employee ID']);
        const toAdd=selected.filter(l=>!existingIDs.includes(l.id));
        const toRemove=existing.filter(m=>!selected.some(l=>l.id===m['Employee ID']));

        for(const r of toRemove)
          await PowerUp.api.deleteRowById('SQUAD_MEMBERS',r.id);
        for(const l of toAdd)
          await PowerUp.api.addRow('SQUAD_MEMBERS',{
            'Squad ID':sid,'Employee ID':l.id,'Employee Name':l.name,'Role':'Leader'
          });

        safeToast(`✅ Squad "${name}" updated.`);
      }catch(err){
        console.error(err);
        safeToast('Error saving squad changes','error');
      }
    }

    if(e.target.classList.contains('cancel-btn')){
      safeToast('Edits canceled','info');
      await load(); await applyFilters();
    }
  });
}

// =====================================================
//  Manage Table Styling (width + mask + sticky fix)
// =====================================================
const style=document.createElement('style');
style.textContent=`
  .manage-table{
    width:100%;
    border-collapse:collapse;
    font-size:13px;
  }
  .manage-table th,
  .manage-table td{
    border:1px solid #2d3f3f;
    padding:8px 10px;
    white-space:nowrap;
  }
  .manage-table th{
    background:#0f1a1a;
    color:#9ffbe6;
    font-weight:600;
    text-transform:uppercase;
    font-size:12px;
    position:sticky;
    top:0;
    z-index:20;
  }
  .manage-table thead::after{
    content:"";
    position:absolute;
    top:0;
    left:0;
    right:0;
    height:100%;
    background:linear-gradient(to bottom, rgba(15,26,26,1) 80%, transparent);
    pointer-events:none;
  }
  .manage-table .actions{
    text-align:center;
  }
  .actions .btn{
    min-width:70px;
    border-radius:6px;
    border:1px solid var(--accent,#00f08e);
    background:#0f1a1a;
    color:#d9e6e6;
    margin:2px;
    cursor:pointer;
  }
  .actions .btn:hover{background:#152525;}
  .leader-select{
    width:160px;
    background:#101f1f;
    color:#e5e7eb;
    border:1px solid #2d3f3f;
    border-radius:6px;
  }
  .no-data{padding:16px;opacity:.7;}
  #manageOverlay{
    position:fixed;inset:0;
    background:rgba(0,0,0,.6);
    display:none;
    align-items:center;
    justify-content:center;
    z-index:3000;
  }
  .manage-overlay-spinner{
    display:flex;flex-direction:column;align-items:center;gap:12px;
    background:#0f1b1b;border:1px solid var(--accent,#00f08e);
    padding:22px 26px;border-radius:12px;color:#d9e6e6;font-weight:600;
  }
  .spinner{width:28px;height:28px;border:3px solid #00f08e;
    border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}
`;
document.head.appendChild(style);

})(window.PowerUp||{});
