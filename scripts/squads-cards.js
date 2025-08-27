// scripts/squads-cards.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

  // ---- OPTIONAL links for the top-right buttons (set if/when you have them) ----
  const LINKS = {
    add: "",          // e.g. Smartsheet form for new squad
    manage: "",       // e.g. squads-admin.html
    activities: ""    // e.g. squads-activities.html
  };

  // Robust column aliasing for Employee Master lookup
  const EMP_COL = {
    id:   ['Position ID','Employee ID'],
    name: ['Display Name','Employee Name','Name']
  };

  // Robust column aliasing for PowerUp Squads
  const SQUAD_COL = {
    id:        ['Squad ID','ID'],
    name:      ['Squad Name','Squad','Name','Team'],
    category:  ['Category','Squad Category'],
    leaderId:  ['Squad Leader','Leader Employee ID','Leader Position ID'],
    members:   ['Members','Member List'],
    objective: ['Objective','Focus','Purpose'],
    active:    ['Active','Is Active?'],
    created:   ['Created Date','Start Date','Started'],
    notes:     ['Notes','Description']
  };

  // --- helpers ---
  const pick = (row, list, d='') => { for (const k of list) if (row[k]!=null && row[k]!=='' ) return row[k]; return d; };
  const dash = (v) => (v==null || String(v).trim()==='') ? '-' : String(v);
  const isTrue = (v) => v === true || /^(true|yes|y|checked)$/i.test(String(v ?? "").trim());

  function normCategory(v) {
    const t = String(v || '').toLowerCase();
    if (/^ci|improve/.test(t))     return 'CI';
    if (/^safety/.test(t))         return 'Safety';
    if (/^quality/.test(t))        return 'Quality';
    return 'Other';
  }

  function parseMemberTokens(text) {
    // split by comma / semicolon / newline; trim; drop empties
    return String(text || '')
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function userIsMemberOrLeader(squad, session) {
    const myId   = String(session.employeeId || '').trim();
    const myName = String(session.displayName || '').trim();

    // leader match (exact ID)
    if (myId && String(squad.leaderId || '').trim() === myId) return true;

    // members match (ID or display name appears in tokenized text)
    const tokensLC = parseMemberTokens(squad.members).map(t => t.toLowerCase());
    if (myId && tokensLC.includes(myId.toLowerCase())) return true;
    if (myName && tokensLC.includes(myName.toLowerCase())) return true;

    return false;
  }

  function panelTitle(key) {
    switch (key) {
      case 'CI':      return 'Continuous Improvement (CI) Squads';
      case 'Quality': return 'Quality Squads';
      case 'Safety':  return 'Safety Squads';
      default:        return 'Other Squads';
    }
  }

  function renderPanels(container, grouped) {
    const keys = ['CI','Quality','Safety','Other'].filter(k => (grouped[k]||[]).length);
    if (!keys.length) {
      container.innerHTML = `<div class="card" style="padding:14px;">No squads to display.</div>`;
      return;
    }

    container.innerHTML = keys.map(k => {
      const cards = (grouped[k]||[]).map(sq => {
        const status = isTrue(sq.active)
          ? `<span class="status-pill status-on">Active</span>`
          : `<span class="status-pill status-off">Inactive</span>`;

        const leader = dash(sq.leaderName || sq.leaderId);
        const objective = dash(sq.objective);
        const detailsHref = `#`; // wire this when you have a details page

        return `
          <div class="squad-card card">
            <h4>${dash(sq.name)}</h4>
            <div class="squad-meta"><b>Leader:</b> ${leader}</div>
            <div class="squad-meta"><b>Status:</b> ${status}</div>
            <div class="squad-meta"><b>Focus:</b> ${objective}</div>
            <div class="squad-foot">
              <a class="squad-link" href="${detailsHref}" title="View details">View Details →</a>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="panel card">
          <h3>${panelTitle(k)}</h3>
          <div class="panel-body">${cards}</div>
        </div>
      `;
    }).join('');
  }

  async function load() {
    const msg = document.getElementById('s-msg');
    const panels = document.getElementById('panels');

    try {
      const session = P.session.get();

      // 1) Build Employee ID -> Display Name map
      const emRows = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
      const idToName = new Map();
      emRows.forEach(r => {
        const id   = pick(r, ['Position ID','Employee ID'], '').toString().trim();
        const name = pick(r, ['Display Name','Employee Name','Name'], '').toString().trim();
        if (id) idToName.set(id, name);
      });

      // 2) Read PowerUp Squads sheet
      const rawSquads = await getRowsByTitle(SHEETS.SQUADS);

      // 3) Normalize, guard against blank rows, filter "my squads", then group
      const grouped = { CI:[], Quality:[], Safety:[], Other:[] };

      rawSquads.forEach(r => {
        const name = pick(r, SQUAD_COL.name, '').toString().trim();
        if (!name) return; // <-- guard: skip empty/placeholder rows (prevents blank "Other" cards)

        const leaderId = pick(r, SQUAD_COL.leaderId, '').toString().trim();
        const squad = {
          id:        pick(r, SQUAD_COL.id, ''),
          name,
          category:  normCategory(pick(r, SQUAD_COL.category, 'Other')),
          leaderId,
          leaderName: idToName.get(leaderId) || '',
          members:   pick(r, SQUAD_COL.members, ''), // free text for now
          objective: pick(r, SQUAD_COL.objective, ''),
          active:    pick(r, SQUAD_COL.active, ''),
          created:   pick(r, SQUAD_COL.created, ''),
          notes:     pick(r, SQUAD_COL.notes, '')
        };

        // Only include squads the user leads or is listed as a member
        if (!userIsMemberOrLeader(squad, session)) return;

        grouped[squad.category].push(squad);
      });

      // 4) Render panels
      renderPanels(panels, grouped);

    } catch (err) {
      console.error(err);
      msg.style.display = 'block';
      msg.innerHTML = `Could not load squads. Confirm <code>SHEETS.SQUADS</code> in <code>api.js</code> and access to Employee Master.`;
    }
  }

  function wireButtons() {
    const clickOrAlert = (id, url, text) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (url) el.addEventListener('click', () => window.open(url, '_blank', 'noopener'));
      else el.addEventListener('click', () => alert(`${text} link not set. Update LINKS in scripts/squads-cards.js.`));
    };
    clickOrAlert('btn-add',        LINKS.add,        'Add New Squad');
    clickOrAlert('btn-manage',     LINKS.manage,     'Manage Squads');
    clickOrAlert('btn-activities', LINKS.activities, 'View All Activities');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    P.session.requireLogin();
    P.layout.injectLayout();
    P.layout.setPageTitle('Squads');
    await P.session.initHeader();
    wireButtons();
    await load();
  });

  window.PowerUp = P;
})(window.PowerUp || {});
