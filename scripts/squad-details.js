(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle, activities } = P.api;

  const pick = (row, names, d='') => {
    for (const k of names) if (row && row[k] != null && String(row[k]).trim() !== '') return row[k];
    return d;
  };
  const fmt = (v) => {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  };
  const norm = s => String(s||'').trim().toLowerCase();
  const yes = v => v===true || /^(true|yes|y|1|active)$/i.test(String(v||'').trim());

  // ---- page boot ----
  document.addEventListener('DOMContentLoaded', async () => {
    P.session.requireLogin();
    P.layout.injectLayout();
    await P.session.initHeader();

    const qp = new URLSearchParams(location.search);
    const sqId = qp.get('id') || '';
    const sqName = qp.get('name') || '';

    // Load core data
    const [squads, members, emRows] = await Promise.all([
      getRowsByTitle(SHEETS.SQUADS),
      getRowsByTitle(SHEETS.SQUAD_MEMBERS),
      getRowsByTitle(SHEETS.EMPLOYEE_MASTER)
    ]);

    // Build name lookup
    const idToName = new Map();
    emRows.forEach(r => {
      const id = String(r['Position ID'] || r['Employee ID'] || '').trim();
      const nm = String(r['Display Name'] || r['Employee Name'] || r['Name'] || '').trim();
      if (id) idToName.set(id, nm || id);
    });

    // Find our squad
    const squad = (() => {
      if (sqId) return squads.find(r => norm(r['Squad ID'] || r['ID']) === norm(sqId));
      if (sqName) return squads.find(r => norm(r['Squad Name'] || r['Squad'] || r['Name']) === norm(sqName));
      return null;
    })();
    if (!squad) {
      renderFatal(`Squad not found.`);
      return;
    }

    const squadId   = String(squad['Squad ID'] || squad['ID'] || '').trim();
    const squadName = String(squad['Squad Name'] || squad['Squad'] || squad['Name'] || '').trim();
    const leaderId  = String(squad['Squad Leader'] || squad['Leader Employee ID'] || squad['Leader Position ID'] || '').trim();

    // Members for this squad
    const SMCOL = {
      squad:  ['Squad ID','Squad','SquadID'],
      empId:  ['Employee ID','Position ID'],
      empNm:  ['Employee Name','Name','Display Name'],
      role:   ['Role','Member Role'],
      start:  ['Start Date','Start','Joined'],
      active: ['Active','Is Active?']
    };
    const memberRows = members
      .filter(r => {
        const sid = pick(r, SMCOL.squad, '');
        return norm(sid) === norm(squadId) || (!squadId && norm(sid) === norm(squadName));
      })
      .map(r => {
        const id = pick(r, SMCOL.empId, '');
        return {
          id,
          name: pick(r, SMCOL.empNm, idToName.get(id) || id),
          role: pick(r, SMCOL.role, 'Member'),
          start: fmt(pick(r, SMCOL.start, '')),
          active: yes(pick(r, SMCOL.active, 'true'))
        };
      });

    // Activities + joins
    const acts = await activities.listBySquad({ squadId, squadName });
    const [partsMap, hoursMap] = await Promise.all([
      activities.participantsByActivity().catch(()=>new Map()),
      activities.hoursByActivity().catch(()=>new Map())
    ]);

    // Metrics
    const byStatus = new Map();
    acts.forEach(a => {
      const k = (a.status || 'Unknown').trim();
      byStatus.set(k, (byStatus.get(k) || 0) + 1);
    });
    let totalHrs = 0;
    acts.forEach(a => totalHrs += (hoursMap.get(String(a.id)) || 0));

    // Render page
    renderPage({
      squad: { id: squadId, name: squadName, leaderId, leaderName: idToName.get(leaderId) || leaderId,
               category: squad['Category'] || squad['Squad Category'] || 'Other',
               objective: squad['Objective'] || squad['Focus'] || '',
               notes: squad['Notes'] || '' ,
               created: fmt(squad['Created Date'] || squad['Start Date'])
      },
      members: memberRows,
      activities: acts.map(a => ({
        ...a,
        participants: Array.from(partsMap.get(String(a.id)) || []),
        hours: hoursMap.get(String(a.id)) || 0
      })),
      idToName,
      metrics: { byStatus, totalHrs }
    });
  });

  // ---- rendering ----
  function renderFatal(msg){
    const c = ensureContent();
    c.innerHTML = `<div class="card" style="padding:14px;border:1px solid #3b4a4a;color:#ffb4b4;">${msg}</div>`;
  }

  function ensureContent(){
    let wrap = document.getElementById('pu-content');
    if (!wrap) { wrap = document.createElement('div'); document.body.appendChild(wrap); }
    return wrap;
  }

  function renderPage({ squad, members, activities, idToName, metrics }){
    const root = ensureContent();
    root.innerHTML = `
      <div class="top-cards" style="display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:12px;margin:8px 14px;">
        ${cardSquadInfo(squad)}
        ${cardObjective(squad.objective)}
        ${cardNotes(squad.notes)}
      </div>

      <div class="sq-metrics" style="margin:6px 14px 10px;">
        ${metricsChips(metrics)}
      </div>

      <div class="sq-grid">
        <section class="sq-col-left">
          <h3 class="sq-h">Members</h3>
          ${membersTable(members)}
        </section>
        <section class="sq-col-right">
          <div class="sq-right-head">
            <h3 class="sq-h">Squad Activities</h3>
          </div>
          ${activitiesTable(activities, idToName)}
        </section>
      </div>
    `;
  }

  function cardSquadInfo(sq){
    const activePill = `<span class="pill pill--${'green'}">Active</span>`;
    return `
      <div class="card" style="padding:12px;">
        <div style="font-weight:700;color:#9ffbe6;margin-bottom:6px;">Squad</div>
        <div><b>Name:</b> ${esc(sq.name)}</div>
        <div><b>Leader:</b> ${esc(sq.leaderName || sq.leaderId || '-')}</div>
        <div><b>Status:</b> ${activePill}</div>
        <div><b>Category:</b> ${esc(sq.category || '-')}</div>
        <div><b>Created:</b> ${esc(sq.created || '-')}</div>
      </div>`;
  }
  function cardObjective(text){
    return `
      <div class="card" style="padding:12px;">
        <div style="font-weight:700;color:#9ffbe6;margin-bottom:6px;">Objective</div>
        <div>${esc(text || '-')}</div>
      </div>`;
  }
  function cardNotes(text){
    return `
      <div class="card" style="padding:12px;">
        <div style="font-weight:700;color:#9ffbe6;margin-bottom:6px;">Notes</div>
        <div>${esc(text || '-')}</div>
      </div>`;
  }

  function metricsChips({ byStatus, totalHrs }){
    const items = Array.from(byStatus.entries())
      .sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([k,v]) => chip(`${k}`, `${v}`))
      .join('');
    return `
      <div class="chip-row">
        ${items}
        ${chip('Completed PH Hours', String(totalHrs))}
      </div>`;
  }
  function chip(label, value){
    return `<span class="chip"><span class="chip__label">${esc(label)}</span><span class="chip__value">${esc(value)}</span></span>`;
  }

  function membersTable(rows){
    const body = rows.map(r => `
      <tr>
        <td>${esc(r.name)}</td>
        <td>${esc(r.role)}</td>
        <td>${r.active ? '<span class="pill pill--green">Active</span>' : '<span class="pill pill--red">Inactive</span>'}</td>
        <td>${esc(r.start)}</td>
      </tr>
    `).join('');
    return `
      <div class="table-wrap">
        <table class="pu-table">
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Start</th></tr></thead>
          <tbody>${body || `<tr><td colspan="4" style="opacity:.7;text-align:center;">No members</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function activitiesTable(rows, idToName){
    const body = rows.map(a => {
      const count = a.participants.length;
      const owners = esc(a.ownerName || '-');
      return `
        <tr>
          <td>${esc(a.title || '-')}</td>
          <td>${esc(a.type || '-')}</td>
          <td>${statusPill(a.status)}</td>
          <td>${esc(a.startDate || '-')} – ${esc(a.endDate || '-')}</td>
          <td>${owners}</td>
          <td>${count ? String(count) : '-'}</td>
          <td>${a.hours ? String(a.hours) : '-'}</td>
        </tr>
      `;
    }).join('');
    return `
      <div class="table-wrap">
        <table class="pu-table">
          <thead>
            <tr>
              <th>Title</th><th>Type</th><th>Status</th><th>Dates</th><th>Owner</th><th>Participants</th><th>Completed PH</th>
            </tr>
          </thead>
          <tbody>${body || `<tr><td colspan="7" style="opacity:.7;text-align:center;">No activities yet</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function esc(s){ return String(s ?? '').replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }
  function statusPill(v){
    const t = String(v||'').toLowerCase();
    if (/complete|closed|done/.test(t)) return `<span class="pill pill--green">${esc(v)}</span>`;
    if (/open|new|not\s*started|todo/.test(t)) return `<span class="pill pill--blue">${esc(v)}</span>`;
    if (/progress|doing|wip/.test(t)) return `<span class="pill pill--amber">${esc(v)}</span>`;
    return esc(v||'-');
  }

})(window.PowerUp || {});
