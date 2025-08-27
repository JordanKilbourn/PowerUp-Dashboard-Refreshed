// scripts/squad-details.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

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
  const JOIN_COL = {
    squadId: ['Squad ID','SquadId','Team ID'],
    empId:   ['Employee ID','Position ID','EmpId'],
    role:    ['Role','Member Role'],
    active:  ['Active','Is Active?'],
    start:   ['Start Date','Joined','Date Added']
  };

  const pick = (row, list, d='') => { for (const k of list) if (row[k]!=null && row[k]!=='' ) return row[k]; return d; };
  const dash = (v) => (v==null || String(v).trim()==='') ? '-' : String(v);
  const isTrue = (v) => v === true || /^(true|yes|y|checked)$/i.test(String(v ?? "").trim());
  const esc = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  function getParam(name) {
    const u = new URL(location.href);
    return u.searchParams.get(name);
  }

  async function loadEmployeeMap() {
    const rows = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    const map = new Map();
    rows.forEach(r => {
      const id = pick(r, EMP_COL.id, '').toString().trim();
      const nm = pick(r, EMP_COL.name, '').toString().trim();
      if (id) map.set(id, nm);
    });
    return map;
  }

  function parseMemberTokens(text) {
    return String(text || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  }

  async function loadSquad() {
    const byId = getParam('id');
    const byName = getParam('name');

    const rows = await getRowsByTitle(SHEETS.SQUADS);
    let row = null;

    if (byId) {
      row = rows.find(r => String(pick(r,SQUAD_COL.id,'')).trim() === String(byId).trim());
    }
    if (!row && byName) {
      const nameLC = String(byName).trim().toLowerCase();
      row = rows.find(r => String(pick(r,SQUAD_COL.name,'')).trim().toLowerCase() === nameLC);
    }
    if (!row) {
      throw new Error('Squad not found.');
    }

    return {
      id:        pick(row, SQUAD_COL.id, ''),
      name:      pick(row, SQUAD_COL.name, ''),
      category:  pick(row, SQUAD_COL.category, 'Other'),
      leaderId:  pick(row, SQUAD_COL.leaderId, ''),
      objective: pick(row, SQUAD_COL.objective, ''),
      active:    pick(row, SQUAD_COL.active, ''),
      created:   pick(row, SQUAD_COL.created, ''),
      notes:     pick(row, SQUAD_COL.notes, ''),
      membersRaw:pick(row, SQUAD_COL.members, '')
    };
  }

  async function tryLoadJoinMembers(squadId) {
    try {
      // Only attempt if a sheet mapping exists
      if (!SHEETS.SQUAD_MEMBERS) return null;
      const rows = await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
      const mine = rows.filter(r => String(pick(r, JOIN_COL.squadId,'')).trim() === String(squadId).trim());
      if (!mine.length) return []; // valid, just empty
      return mine.map(r => ({
        empId:  pick(r, JOIN_COL.empId, ''),
        role:   pick(r, JOIN_COL.role, 'Member') || 'Member',
        active: pick(r, JOIN_COL.active, ''),
        start:  pick(r, JOIN_COL.start, '')
      }));
    } catch {
      return null; // if fetch fails, fall back
    }
  }

  function renderCore(squad, idToName) {
    const core = document.getElementById('card-core');
    const status = isTrue(squad.active)
      ? `<span class="status-pill status-on">Active</span>`
      : `<span class="status-pill status-off">Inactive</span>`;

    core.innerHTML = `
      <h3>Squad</h3>
      <div class="kv"><b>Name:</b> ${esc(squad.name)}</div>
      <div class="kv"><b>Leader:</b> ${esc(idToName.get(squad.leaderId) || squad.leaderId || '-')}</div>
      <div class="kv"><b>Status:</b> ${status}</div>
      <div class="kv"><b>Category:</b> ${esc(squad.category)}</div>
      <div class="kv"><b>Created:</b> ${esc(squad.created || '-')}</div>
    `;
  }

  function renderTextCard(id, text) {
    document.getElementById(id).innerHTML =
      document.getElementById(id).innerHTML.replace('Loading…','') +
      `<div class="kv">${esc(text || '-')}</div>`;
  }

  function renderMembersTable(members, idToName) {
    const tb = document.querySelector('#members-table tbody');
    if (!members || !members.length) {
      tb.innerHTML = `<tr><td colspan="5" style="text-align:center;opacity:.7;">No members yet</td></tr>`;
      return;
    }
    tb.innerHTML = members.map(m => {
      const name = idToName.get(m.empId) || m.name || m.empId || '-';
      const role = m.role || 'Member';
      const active = isTrue(m.active)
        ? `<span class="status-pill status-on">Active</span>`
        : `<span class="status-pill status-off">Inactive</span>`;
      return `<tr>
        <td>${esc(name)}</td>
        <td class="mono">${esc(m.empId || '-')}</td>
        <td>${esc(role)}</td>
        <td>${active}</td>
        <td>${esc(m.start || '-')}</td>
      </tr>`;
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    P.session.requireLogin();
    P.layout.injectLayout();

    const idToName = await loadEmployeeMap();
    let squad;
    try {
      squad = await loadSquad();
    } catch (e) {
      alert(e.message || 'Unable to load squad.');
      location.href = 'squads.html';
      return;
    }

    P.layout.setPageTitle(`Squad: ${squad.name}`);
    await P.session.initHeader();

    // Top cards
    renderCore(squad, idToName);
    renderTextCard('card-objective', squad.objective);
    renderTextCard('card-notes', squad.notes);

    // Members: prefer join sheet; fall back to parsing the Members text field.
    let members = await tryLoadJoinMembers(squad.id);
    if (members === null) { // null means "join not configured or failed" → fallback
      const tokens = parseMemberTokens(squad.membersRaw);
      members = tokens.map(t => {
        const id = t; // may actually be name; we’ll try both
        const name = idToName.get(id) || t;
        return { empId: idToName.has(id) ? id : '', name, role: 'Member', active: true, start: '' };
      });
      // Always include the leader at the top
      if (squad.leaderId && !members.some(m => String(m.empId) === String(squad.leaderId))) {
        members.unshift({ empId: squad.leaderId, name: idToName.get(squad.leaderId) || squad.leaderId, role: 'Leader', active: true, start: '' });
      } else if (members.length) {
        members[0].role = (members[0].role === 'Member') ? 'Leader' : members[0].role;
      }
    } else {
      // Ensure leader shows as Leader if present
      members = members.map(m => ({
        ...m,
        role: (squad.leaderId && String(m.empId) === String(squad.leaderId)) ? 'Leader' : (m.role || 'Member')
      }));
      // If join sheet exists but doesn't include the leader, prepend
      if (squad.leaderId && !members.some(m => String(m.empId) === String(squad.leaderId))) {
        members.unshift({ empId: squad.leaderId, role: 'Leader', active: true, start: '' });
      }
    }

    renderMembersTable(members, idToName);

    // Wire buttons
    document.getElementById('btn-back').addEventListener('click', () => {
      if (document.referrer && /squads\.html/i.test(document.referrer)) history.back();
      else location.href = 'squads.html';
    });
    document.getElementById('btn-addmember').addEventListener('click', () => {
      alert('Add Member: wire to a form or in-page editor next. If you add SQUAD_MEMBERS to api.js, we can post directly.');
    });
  });

  window.PowerUp = P;
})(window.PowerUp || {});
