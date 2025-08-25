// scripts/tables.js (DIAGNOSTIC VERSION)
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const COLS = {
    CI: ["Submission Date","Submission ID","Problem Statements","Proposed Improvement","CI Approval","Assigned To (Primary)","Status","Action Item Entry Date","Last Meeting Action Item's","Resourced","Resourced Date","Token Payout","Paid"],
    SAFETY: ["Submission Date","Department","Description","Recommendations","Status","Assigned To (Primary)","Action Item Entry Date","Follow-up Date","Severity"],
    QUALITY: ["Submission Date","Part Number","Part Description","Issue","Status","Assigned To (Primary)","Containment","Root Cause","Corrective Action"]
  };

  const $q=(s,r=document)=>r.querySelector(s);
  const num = (v)=>PowerUp.api.toNumber(v);
  const isTrue = (v)=>String(v).toLowerCase()==='true'||String(v).toLowerCase()==='yes';

  function findTable(kind){ return $q(`table[data-table="${kind}"]`)||$q(`#${kind}-table`)||$q(`.${kind}-table`); }
  function findBody(kind,table){ return (table&&table.querySelector('tbody'))||$q(`#${kind}-rows`)||$q(`[data-body="${kind}"]`); }
  function findStatusSelect(kind){ return $q(`select[data-filter="${kind}-status"]`)||$q(`#${kind}-status`)||null; }
  function findCountBadge(kind){ return $q(`[data-count="${kind}"]`)||$q(`#${kind}-count`)||null; }

  function pill(text,color){
    const cls = color==='green'?'pill pill--green':color==='red'?'pill pill--red':'pill pill--blue';
    return `<span class="${cls}">${text}</span>`;
  }
  function formatCell(title,value){
    const t=title.toLowerCase(); const v=String(value??"");
    if (t==="status"){
      const l=v.toLowerCase();
      if (/(approved|closed|complete|done)/.test(l)) return pill(v,"green");
      if (/(denied|rejected|cancel)/.test(l)) return pill(v,"red");
      return pill(v,"blue");
    }
    if (/^paid$/.test(t)) return isTrue(v)?pill("Paid","green"):"";
    if (/^resourced$/.test(t)) return isTrue(v)?pill("Resourced","green"):"";
    if (/token payout/i.test(t)) return num(v)?`${num(v)}`:"";
    return v;
  }

  function ensureHeader(table, cols){
    const thead = table.querySelector('thead')||table.createTHead();
    if (!thead.innerHTML.trim()){
      const tr=document.createElement('tr');
      cols.forEach(c=>{ const th=document.createElement('th'); th.textContent=c; th.dataset.k=c; tr.appendChild(th); });
      thead.appendChild(tr);
    }
  }
  function renderRows(tbody, cols, rows){
    if (!rows.length){ tbody.innerHTML=`<tr><td colspan="${cols.length}" class="muted" style="text-align:center;padding:16px;">No rows</td></tr>`; return; }
    tbody.innerHTML = rows.map(r=>`<tr>${cols.map(c=>`<td>${formatCell(c, r[c])}</td>`).join('')}</tr>`).join('');
  }
  function attachSort(table, cols){
    const ths=table.querySelectorAll('thead th[data-k]');
    ths.forEach((th,idx)=>{
      th.addEventListener('click',()=>{
        const asc = th.dataset.sort!=='asc';
        ths.forEach(h=>h.dataset.sort=''); th.dataset.sort=asc?'asc':'desc';
        const tb=table.querySelector('tbody');
        const rows=Array.from(tb.querySelectorAll('tr'));
        rows.sort((a,b)=>{
          const av=(a.children[idx]?.textContent||'').trim();
          const bv=(b.children[idx]?.textContent||'').trim();
          const an=parseFloat(av.replace(/[^0-9.\-]/g,'')); const bn=parseFloat(bv.replace(/[^0-9.\-]/g,''));
          const numMode=!Number.isNaN(an)&&!Number.isNaN(bn)&&(/\d/.test(av)||/\d/.test(bv));
          return asc ? (numMode?an-bn:av.localeCompare(bv)) : (numMode?bn-an:bv.localeCompare(av));
        });
        const frag=document.createDocumentFragment(); rows.forEach(tr=>frag.appendChild(tr));
        tb.innerHTML=''; tb.appendChild(frag);
      });
    });
  }
  function attachStatusFilter(kind, table, select){
    if (!select) return;
    select.addEventListener('change',()=>{
      const val=(select.value||'').toLowerCase();
      const tb=table.querySelector('tbody'); const rows=Array.from(tb.querySelectorAll('tr'));
      const headers=Array.from(table.querySelectorAll('thead th'));
      const sIdx=headers.findIndex(h=>/status/i.test(h.textContent.trim()));
      rows.forEach(tr=>{
        if (tr.children.length===1){ tr.style.display=''; return; }
        if (!val || val==='all'){ tr.style.display=''; return; }
        const cellText=(tr.children[sIdx]?.textContent||tr.textContent||'').toLowerCase();
        tr.style.display = cellText.includes(val) ? '' : 'none';
      });
      const visible=rows.filter(tr=>tr.style.display!=='none' && tr.children.length>1).length;
      const badge=findCountBadge(kind); if (badge) badge.textContent=visible;
    });
  }

  async function hydrateOne(kind, sheetId, cols){
    const table=findTable(kind); if (!table) return;
    ensureHeader(table, cols);
    const tbody=findBody(kind, table);
    try{
      const all = await PowerUp.api.getRowsByTitle(sheetId);
      // DIAGNOSTIC: log first row keys so we can map columns precisely
      if (all[0]) { console.log(`[${kind}] columns seen:`, Object.keys(all[0])); }
      renderRows(tbody, cols, all); // ← no user filter (diagnostic)
      const badge=findCountBadge(kind); if (badge) badge.textContent=all.length;
    }catch(e){
      console.error(`Failed to load ${kind}:`, e);
      tbody.innerHTML = `<tr><td colspan="${cols.length}" class="muted" style="padding:16px;">Could not load ${kind} — ${e.message}</td></tr>`;
    }
    attachSort(table, cols);
    attachStatusFilter(kind, table, findStatusSelect(kind));
  }

  async function hydrateDashboardTables(){
    PowerUp.session.requireLogin();
    await PowerUp.session.initHeader();
    await Promise.all([
      hydrateOne("ci", PowerUp.api.SHEETS.CI, COLS.CI),
      hydrateOne("safety", PowerUp.api.SHEETS.SAFETY, COLS.SAFETY),
      hydrateOne("quality", PowerUp.api.SHEETS.QUALITY, COLS.QUALITY),
    ]);
  }
  PowerUp.tables = { hydrateDashboardTables };
  window.PowerUp = P;
}(window.PowerUp || {}));
