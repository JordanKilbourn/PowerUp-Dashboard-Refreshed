// ======================================================
//  PowerUp Squads Cards + Manage View
//  Updated: 2025-10-16
//  Improvements:
//    • Fixed PowerUp.ui.toast crash
//    • Fixed dropdown z-index / visibility
//    • Wider columns, no text wrapping
//    • Opaque sticky headers + drop shadow
//    • Aligned Action buttons and header height
// ======================================================

(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;
  if (!P.ui) P.ui = {}; // ensure toast-safe namespace

  // Column map helpers
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
  const SM_COL = {
    id: ['Row ID','ID'],
    squadId: ['Squad ID','Squad'],
    empId: ['Employee ID'],
    empName: ['Employee Name'],
    role: ['Role'],
    active: ['Active']
  };

  // ------------- helpers -------------
  function dash(v){return v==null||v===''?'-':v;}
  function pick(obj,keys,def){
    for(const k of keys){if(obj[k]!=null)return obj[k];}
    return def;
  }
  function isTrue(v){return v===true||String(v).toLowerCase()==='true';}

  // Safe toast wrapper
  function safeToast(msg,type='info'){
    if(P.ui?.toast) P.ui.toast(msg,type);
    else console.log(`[${type}]`,msg);
  }

  // ------------- load + render cards -------------
  async function load(){
    const container=document.getElementById('cards');
    if(!container)return;
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

  async function applyFilters(){ /* stub preserved */ }

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

  // =====================================================
  // Manage Squads Feature (UI + Logic + Dropdown)
  // =====================================================
  const waitForManageBtn=setInterval(()=>{
    const manageBtn=document.getElementById('btn-manage');
    if(manageBtn){
      clearInterval(waitForManageBtn);
      initManageSquadsFeature(manageBtn);
    }
  },300);

  // Overlay Spinner
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

  // Manage toggle
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
        }finally{hideOverlay();}
      }else{
        showOverlay('Refreshing cards…');
        await load();await applyFilters();hideOverlay();
      }
    });
  }

  // === Part 2 will continue here with buildManageTable() and CSS ===
  // =====================================================
  //  Build Manage Table + Dropdown Logic + Save Handlers
  // =====================================================
  async function buildManageTable(squads,members,employees,container){
    container.innerHTML = `
      <table class="manage-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Squad Name</th>
            <th>Category</th>
            <th>Active</th>
            <th>Objective</th>
            <th>Leaders</th>
            <th>Created By</th>
            <th class="actions-cell">Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>`;
    const tbody = container.querySelector('tbody');

    // Prebuild a map of employee Position ID → Display Name
    const empMap = {};
    for(const e of employees){
      empMap[e['Position ID']] = e['Display Name'] || e['Employee Name'] || e['Name'];
    }

    // Construct each row
    for(const s of squads){
      const sid = s['Squad ID'];
      const row = document.createElement('tr');
      row.dataset.sid = sid;

      // Active check
      const activeChecked = isTrue(s['Active']) ? 'checked' : '';
      // Current leaders
      const leaderRows = members.filter(m => m['Squad ID']===sid && m['Role']==='Leader');
      const leaderIDs   = leaderRows.map(r=>r['Employee ID']).filter(Boolean);
      const leaderNames = leaderIDs.map(id=>empMap[id]||'-');

      row.innerHTML = `
        <td class="id">${dash(sid)}</td>
        <td class="name editable" contenteditable="true">${dash(s['Squad Name'])}</td>
        <td class="category editable" contenteditable="true">${dash(s['Category'])}</td>
        <td class="active"><input type="checkbox" ${activeChecked}></td>
        <td class="objective editable" contenteditable="true">${dash(s['Objective'])}</td>
        <td class="leader-cell"></td>
        <td class="created editable" contenteditable="true">${dash(s['Created By'])}</td>
        <td class="actions-cell">
          <button class="save">Save</button>
          <button class="cancel">Cancel</button>
        </td>`;
      tbody.appendChild(row);

      // --- Multi-select dropdown for Leaders ---
      const leaderCell = row.querySelector('.leader-cell');
      const ms = document.createElement('div');
      ms.className = 'multi-select';
      const selected = document.createElement('div');
      selected.className = 'selected';
      selected.textContent = leaderNames.join(', ') || '-';
      const opts = document.createElement('div');
      opts.className = 'options';

      for(const e of employees){
        const opt = document.createElement('div');
        opt.className = 'opt';
        opt.dataset.id   = e['Position ID'];
        opt.dataset.name = empMap[e['Position ID']];
        opt.textContent  = empMap[e['Position ID']];
        if(leaderIDs.includes(e['Position ID'])) opt.classList.add('selected');
        opts.appendChild(opt);
      }

      ms.appendChild(selected);
      ms.appendChild(opts);
      leaderCell.appendChild(ms);

      // Dropdown toggle logic
      ms.addEventListener('click', e=>{
        if(e.target.classList.contains('opt')){
          e.target.classList.toggle('selected');
          const sel = [...opts.querySelectorAll('.opt.selected')]
                        .map(o=>o.dataset.name);
          selected.textContent = sel.join(', ') || '-';
        }
        ms.classList.toggle('open');
      });
      ms.addEventListener('blur', ()=>ms.classList.remove('open'));
    }

    // =====================================================
    //  Save + Cancel buttons
    // =====================================================
    tbody.addEventListener('click', async e=>{
      const tr = e.target.closest('tr');
      if(!tr) return;
      const sid = tr.dataset.sid;

      // Cancel -> reload current data into that row
      if(e.target.classList.contains('cancel')){
        safeToast('Reverted changes for '+sid,'info');
        const squad = squads.find(s=>s['Squad ID']===sid);
        if(!squad) return;
        tr.querySelector('.name').textContent = squad['Squad Name'];
        tr.querySelector('.category').textContent = squad['Category'];
        tr.querySelector('.objective').textContent = squad['Objective'];
        tr.querySelector('.created').textContent = squad['Created By'];
        tr.querySelector('.active input').checked = isTrue(squad['Active']);
        return;
      }

      // Save
      if(e.target.classList.contains('save')){
        const name = tr.querySelector('.name').textContent.trim();
        const category = tr.querySelector('.category').textContent.trim();
        const active = tr.querySelector('.active input').checked;
        const objective = tr.querySelector('.objective').textContent.trim();
        const createdBy = tr.querySelector('.created').textContent.trim();

        // Collect leaders
        const optSel = [...tr.querySelectorAll('.leader-cell .opt.selected')];
        const leaders = optSel.map(o=>({id:o.dataset.id,name:o.dataset.name}));

        if(!leaders.length){
          safeToast('Each squad must have at least one leader','warn');
          return;
        }

        try{
          // Update SQUADS row
          if(!P.api?.updateRowById){
            console.error('updateRowById missing');
            return;
          }
          await P.api.updateRowById('SQUADS', sid, {
            'Squad Name': name,
            'Category': category,
            'Active': active,
            'Objective': objective,
            'Created By': createdBy
          });

          // --- reconcile leaders in SQUAD_MEMBERS ---
          const existing = members.filter(
            r => r['Squad ID']===sid && r['Role']==='Leader'
          );
          const existingIDs = existing.map(r=>r['Employee ID']);
          const toRemove = existing.filter(r=>!leaders.some(l=>l.id===r['Employee ID']));
          const toAdd    = leaders.filter(l=>!existingIDs.includes(l.id));

          for(const r of toRemove)
            await P.api.deleteRowById?.('SQUAD_MEMBERS', r['Row ID']);
          for(const l of toAdd)
            await P.api.addSquadMember?.({
              'Squad ID': sid,
              'Employee ID': l.id,
              'Employee Name': l.name,
              'Role': 'Leader'
            });

          safeToast(`Saved changes to ${name}`,'success');
        }catch(err){
          console.error(err);
          safeToast('Error saving '+sid,'error');
        }
      }
    });
  }

  // =====================================================
  //  Inject extra styles for manage view + dropdown
  // =====================================================
  const style = document.createElement('style');
  style.textContent = `
  /* === Manage Table Styling === */
  .manage-table {
    width: 100%;
    border-collapse: collapse;
    color: #d2d6d6;
    font-size: 14px;
  }
  .manage-table th, .manage-table td {
    border-bottom: 1px solid #1f2a2a;
    padding: 6px 10px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  .manage-table th {
    background: #0f1a1a;
    position: sticky;
    top: 0;
    z-index: 10;
    box-shadow: 0 4px 8px rgba(0,0,0,.6);
    height: 36px;
  }
  .manage-table th.actions-cell,
  .manage-table td.actions-cell {
    text-align: center;
    vertical-align: middle;
    height: 36px;
  }
  .manage-table button {
    background: transparent;
    border: 1px solid #3a6f64;
    color: #3aefb7;
    border-radius: 6px;
    padding: 3px 10px;
    margin: 0 2px;
    cursor: pointer;
  }
  .manage-table button:hover {
    background: #193530;
  }
  .manage-table td.editable {
    background: #162222;
  }
  .manage-table .leader-cell {
    position: relative;
    overflow: visible;
  }
  /* === Dropdown === */
  .multi-select {
    background: #162222;
    border: 1px solid #2f4444;
    border-radius: 6px;
    padding: 4px 6px;
    min-width: 180px;
    cursor: pointer;
  }
  .multi-select .selected {
    color: #cfe6e0;
  }
  .multi-select .options {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 240px;
    overflow-y: auto;
    background: #1a2424;
    border: 1px solid #2f4444;
    border-radius: 6px;
    z-index: 9999;
  }
  .multi-select.open .options { display: block; }
  .multi-select .opt {
    padding: 4px 8px;
  }
  .multi-select .opt:hover {
    background: #2a3939;
  }
  .multi-select .opt.selected::before {
    content: "✔ ";
    color: #3aefb7;
  }
  /* === Column Widths === */
  .manage-table th:nth-child(1){width:90px;}
  .manage-table th:nth-child(2){width:220px;}
  .manage-table th:nth-child(3){width:120px;}
  .manage-table th:nth-child(4){width:70px;}
  .manage-table th:nth-child(5){width:220px;}
  .manage-table th:nth-child(6){width:200px;}
  .manage-table th:nth-child(7){width:160px;}
  .manage-table th:nth-child(8){width:140px;}
  /* === Overlay Spinner === */
  #manageOverlay{
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.6);
    display:none;align-items:center;justify-content:center;
    z-index:99999;
  }
  .manage-overlay-spinner{
    text-align:center;color:#fff;
  }
  .manage-overlay-spinner .spinner{
    width:36px;height:36px;
    border:3px solid #3aefb7;
    border-top-color:transparent;
    border-radius:50%;
    margin:0 auto 10px;
    animation:spin 1s linear infinite;
  }
  @keyframes spin{to{transform:rotate(360deg);}}
  `;
  document.head.appendChild(style);

})(window.PowerUp || (window.PowerUp = {}));
