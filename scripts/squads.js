// scripts/squads.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const { SHEETS, getRowsByTitle, toNumber } = P.api;

  // Optional: set a Smartsheet Form URL to enable "+ Add Squad"
  const ADD_FORM_URL = ""; // e.g., "https://app.smartsheet.com/b/form/XXXXXXXX"

  // Column aliases to be resilient to sheet naming
  const COLS = {
    id:            ['Squad ID', 'ID'],
    name:          ['Squad', 'Squad Name', 'Name', 'Team'],
    lead:          ['Lead', 'Squad Lead', 'Owner'],
    members:       ['Members', 'Team Members', 'Member List'],
    status:        ['Status', 'State'],
    start:         ['Start Date', 'Started', 'Created'],
    nextMeeting:   ['Next Meeting', 'Next Meeting Date', 'Next Mtg'],
    progress:      ['Progress %', 'Progress', '% Complete'],
    openTasks:     ['Open Tasks', 'Open Items', 'Open Count'],
    empIdLead:     ['Lead Employee ID', 'Lead Position ID'], // optional for "My Squads"
  };

  // ----- small helpers -----
  const pick = (row, list, d='') => { for (const k of list) if (row[k]!=null && row[k]!=='' ) return row[k]; return d; };
  const fmt  = (v) => (v==null || String(v).trim()==='') ? '-' : String(v);
  const isTrue = (v) => v === true || /^(true|yes|y|checked)$/i.test(String(v ?? "").trim());

  function parseDateLocal(s){
    if (s==null || s==='') return null;
    const t = String(s).trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2]-1, +m[3]);
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m){ let y=+m[3]; if (y<100) y+=2000; return new Date(y, +m[1]-1, +m[2]); }
    const d = new Date(t);
    return isNaN(d) ? null : d;
  }

  // ----- state -----
  const state = {
    all: [],
    view: [],
    q: '',
    status: 'All',
    viewKind: 'all' // 'all' | 'mine'
  };

  // ----- rendering -----
  function statusPill(v) {
    if (!v) return '-';
    const t = String(v).toLowerCase();
    if (/complete/.test(t)) return `<span class="pill pill--green">Completed</span>`;
    if (/active|in[- ]?progress/.test(t)) return `<span class="pill pill--blue">Active</span>`;
    if (/pause/.test(t))   return `<span class="pill pill--gray">Paused</span>`;
    if (/block|hold/.test(t))  return `<span class="pill pill--red">Blocked</span>`;
    return fmt(v);
  }

  function renderTable() {
    const tb = document.getElementById('squads-rows');
    if (!state.view.length) {
      tb.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center;padding:20px;">No rows</td></tr>`;
      document.getElementById('m-total').textContent = '0';
      document.getElementById('m-active').textContent = '0';
      document.getElementById('m-next').textContent = '0';
      return;
    }

    tb.innerHTML = state.view.map(r => {
      const name  = fmt(r['Squad']);
      const lead  = fmt(r['Lead']);
      const mems  = fmt(r['Members']);
      const stat  = statusPill(r['Status']);
      const start = fmt(r['Start']);
      const next  = fmt(r['Next Meeting']);
      const progN = Math.max(0, Math.min(100, toNumber(r['Progress'])));
      const prog  = isNaN(progN) ? '-' : `${progN}%`;
      const open  = fmt(r['Open Tasks']);

      return `<tr>
        <td class="wrap">${name}</td>
        <td>${lead}</td>
        <td class="wrap">${mems}</td>
        <td class="t-center">${stat}</td>
        <td>${start}</td>
        <td>${next}</td>
        <td class="t-right mono">${prog}</td>
        <td class="t-right mono">${open}</td>
      </tr>`;
    }).join('');

    // metrics
    document.getElementById('m-total').textContent  = String(state.view.length);
    const active = state.view.filter(r => /active|in[- ]?progress/i.test(String(r['Status']||''))).length;
    document.getElementById('m-active').textContent = String(active);

    // meetings in next 30 days
    const now = new Date();
    const soon = new Date(now); soon.setDate(soon.getDate()+30);
    const upcoming = state.view.filter(r => {
      const d = parseDateLocal(r['Next Meeting']);
      return d && d >= now && d <= soon;
    }).length;
    document.getElementById('m-next').textContent = String(upcoming);
  }

  function applyFilters() {
    const q = state.q.toLowerCase().trim();
    const status = state.status.toLowerCase();
    const { employeeId } = P.session.get();
    const displayName = P.session.get()?.displayName || "";

    state.view = state.all.filter(r => {
      // status
      if (status !== 'all') {
        const s = String(r['Status']||'').toLowerCase();
        if (!s.includes(status)) return false;
      }
      // "mine": lead or member list contains my id or my display name
      if (state.viewKind === 'mine') {
        const leadId = String(r['Lead Employee ID'] || r['Lead Position ID'] || '').trim();
        const members = String(r['Members'] || '').toLowerCase();
        const leadName = String(r['Lead'] || '').toLowerCase();
        const iMatch = leadId === String(employeeId).trim()
                    || members.includes(String(employeeId).toLowerCase())
                    || members.includes(displayName.toLowerCase())
                    || leadName.includes(displayName.toLowerCase());
        if (!iMatch) return false;
      }
      // search
      if (q) {
        const hay = [
          r['Squad'], r['Lead'], r['Members'], r['Status']
        ].map(x => String(x || '').toLowerCase()).join(' | ');
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    renderTable();
  }

  function wireControls() {
    const s = id => document.getElementById(id);
    s('s-status').addEventListener('change', e => { state.status = e.target.value; applyFilters(); });
    s('s-view').addEventListener('change', e => { state.viewKind = e.target.value; applyFilters(); });
    s('s-q').addEventListener('input', e => { state.q = e.target.value; applyFilters(); });

    const addBtn = s('s-add');
    if (ADD_FORM_URL) {
      addBtn.addEventListener('click', () => window.open(ADD_FORM_URL, '_blank', 'noopener'));
    } else {
      addBtn.addEventListener('click', () => {
        alert('Add form is not wired yet. Set ADD_FORM_URL in scripts/squads.js when your Smartsheet form is ready.');
      });
    }
  }

  function bindSort() {
    const ths = document.querySelectorAll('#squads-table thead th[data-k]');
    ths.forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const key = th.dataset.k;
        const asc = th.getAttribute('data-sort') !== 'asc';
        ths.forEach(h => h.setAttribute('data-sort','none'));
        th.setAttribute('data-sort', asc ? 'asc' : 'desc');

        state.view.sort((a,b) => {
          const av = a[key] ?? '';
          const bv = b[key] ?? '';
          // numeric columns
          if (key === 'Progress' || key === 'Open Tasks') {
            const na = toNumber(av), nb = toNumber(bv);
            return asc ? (na - nb) : (nb - na);
          }
          // dates
          if (key === 'Start' || key === 'Next Meeting') {
            const ad = parseDateLocal(av) || new Date(0);
            const bd = parseDateLocal(bv) || new Date(0);
            return asc ? (ad - bd) : (bd - ad);
          }
          // text
          return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });

        renderTable();
      });
    });
  }

  function mapRow(row) {
    // Normalize one record with the friendly keys our table uses
    return {
      'Squad':        pick(row, COLS.name, ''),
      'Lead':         pick(row, COLS.lead, ''),
      'Members':      pick(row, COLS.members, ''),
      'Status':       pick(row, COLS.status, ''),
      'Start':        pick(row, COLS.start, ''),
      'Next Meeting': pick(row, COLS.nextMeeting, ''),
      'Progress':     pick(row, COLS.progress, ''),
      'Open Tasks':   pick(row, COLS.openTasks, ''),
      'Lead Employee ID': pick(row, COLS.empIdLead, '')
    };
  }

  async function load() {
    const msg = document.getElementById('s-msg');
    try {
      const raw = await getRowsByTitle(SHEETS.SQUADS); // <-- requires SHEETS.SQUADS in api.js
      state.all = raw.map(mapRow);
      // default view
      state.status = 'All';
      state.viewKind = 'all';
      state.q = '';
      applyFilters();
      bindSort();
    } catch (err) {
      console.error(err);
      msg.style.display = 'block';
      msg.innerHTML = `Could not load squads. Make sure <code>SHEETS.SQUADS</code> is set in <code>scripts/api.js</code>.`;
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    P.session.requireLogin();
    P.layout.injectLayout();
    P.layout.setPageTitle('Squads');
    await P.session.initHeader();
    wireControls();
    await load();
  });

  window.PowerUp = P;
})(window.PowerUp || {});
