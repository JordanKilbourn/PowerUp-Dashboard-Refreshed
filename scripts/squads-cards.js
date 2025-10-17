// ======================================================
//  PowerUp Squads Cards + Manage View  (Full Fixed Build)
//  Version: 2025-10-17  — Stable Inline-Replace View
// ======================================================

(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;
  if (!P.ui) P.ui = {}; // ensure toast-safe namespace

  // ---------------- Helpers ----------------
  const EMP_COL = {
    id: ['Position ID', 'Employee ID'],
    name: ['Display Name', 'Employee Name', 'Name']
  };
  const SQUAD_COL = {
    id: ['Squad ID', 'ID'],
    name: ['Squad Name', 'Squad'],
    category: ['Category', 'Squad Category'],
    leaderId: ['Squad Leader', 'Leader ID'],
    leaderName: ['Leader Name', 'Leader'],
    active: ['Active'],
    objective: ['Objective'],
    createdBy: ['Created By']
  };

  const dash = v => (v == null || v === '' ? '-' : v);
  const isTrue = v => v === true || String(v).toLowerCase() === 'true';
  function safeToast(msg, type = 'info') {
    if (P.ui?.toast) P.ui.toast(msg, type);
    else console.log(`[${type}]`, msg);
  }

  // ---------------- Core Card Loader ----------------
  async function loadSquadCards() {
    const container = document.getElementById('cards');
    if (!container) return;
    container.innerHTML = '<div class="loading">Loading squads…</div>';

    try {
      // Fail-safe parallel fetch
      const results = await Promise.allSettled([
        getRowsByTitle('SQUADS'),
        getRowsByTitle('SQUAD_MEMBERS'),
        P.getEmployees()
      ]);

      const squads =
        results[0].status === 'fulfilled' ? results[0].value : [];
      const members =
        results[1].status === 'fulfilled' ? results[1].value : [];
      const employees =
        results[2].status === 'fulfilled' ? results[2].value : [];

      renderSquadCards(container, squads, members, employees);
    } catch (e) {
      console.error(e);
      safeToast('Error loading squads', 'error');
    }
  }

  // ---------------- Card Rendering ----------------
  function renderSquadCards(container, squads, members, employees) {
    container.innerHTML = '';
    if (!Array.isArray(squads) || !squads.length) {
      container.innerHTML = `<div class="no-data">No squads available.</div>`;
      return;
    }

    for (const s of squads) {
      const id = s['Squad ID'];
      const squadMembers = members.filter(m => m['Squad ID'] === id);
      const leaders = squadMembers
        .filter(m => m['Role'] === 'Leader')
        .map(m => m['Employee Name'])
        .join(', ');
      const category = s['Category'] || 'Other';
      const catColor = `var(--sq-${category.toLowerCase() || 'other'})`;

      const div = document.createElement('div');
      div.className = 'squad-card';
      div.style.setProperty('--cat-color', catColor);
      div.innerHTML = `
        <div class="squad-card-header">
          <span class="dot" style="background:${catColor}"></span>
          <h3>${dash(s['Squad Name'])}</h3>
        </div>
        <p class="objective">${dash(s['Objective'])}</p>
        <p class="leaders"><strong>Leader(s):</strong> ${dash(leaders)}</p>
      `;
      container.appendChild(div);
    }
  }

  // ---------------- Filter & Pills ----------------
  function renderCategoryPills(activeCat = 'All') {
    const cats = ['All', 'CI', 'Quality', 'Safety', 'Training', 'Other'];
    const wrap = document.getElementById('cat-pills');
    if (!wrap) return;
    wrap.innerHTML = cats
      .map(cat => {
        return `
        <button class="pill-cat${cat === activeCat ? ' active' : ''}"
          data-cat="${cat}"
          style="--cat-color:var(--sq-${cat.toLowerCase() || 'other'})">
          <span class="dot"></span>${cat}
        </button>`;
      })
      .join('');
  }

  function wireUI() {
    renderCategoryPills('All');
    const pills = document.getElementById('cat-pills');
    if (pills) {
      pills.addEventListener('click', e => {
        const btn = e.target.closest('[data-cat]');
        if (!btn) return;
        pills.querySelectorAll('.pill-cat').forEach(b =>
          b.classList.remove('active')
        );
        btn.classList.add('active');
        applyFilters();
      });
    }
    document.getElementById('myOnly')?.addEventListener('change', applyFilters);
    document
      .getElementById('activeOnly')
      ?.addEventListener('change', applyFilters);
    document.getElementById('search')?.addEventListener('input', applyFilters);
    document.addEventListener('powerup-admin-filter-change', applyFilters);
  }

  async function applyFilters() {
    // placeholder: filters will be applied to squad cards when implemented
  }

  // ---------------- DOM Ready ----------------
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await P.session.requireLogin();
      await P.layout.injectLayout();

      const isAdminFn = P.auth && P.auth.isAdmin;
      const IS_ADMIN = !!(isAdminFn && isAdminFn());
      P.layout.setPageTitle(IS_ADMIN ? 'Squads (Admin)' : 'Squads');

      await P.session.initHeader();
      wireUI();

      const activeOnlyEl = document.getElementById('activeOnly');
      if (activeOnlyEl) activeOnlyEl.checked = false;

      await loadSquadCards();
      await applyFilters();
    } catch (err) {
      console.error('Startup error:', err);
      safeToast('Startup failed — check console.', 'error');
    }
  });

  // =====================================================
  // Manage Squads Feature (toggle + overlay)
  // =====================================================
  const waitForManageBtn = setInterval(() => {
    const manageBtn = document.getElementById('btn-manage');
    if (manageBtn) {
      clearInterval(waitForManageBtn);
      initManageSquadsFeature(manageBtn);
    }
  }, 300);

  // Overlay spinner
  function showOverlay(text = 'Loading…') {
    let overlay = document.getElementById('manageOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'manageOverlay';
      overlay.innerHTML = `
        <div class="manage-overlay-spinner">
          <div class="spinner"></div>
          <div class="label">${text}</div>
        </div>`;
      document.body.appendChild(overlay);
    }
    overlay.querySelector('.label').textContent = text;
    overlay.style.display = 'flex';
    return overlay;
  }

  function hideOverlay() {
    const overlay = document.getElementById('manageOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function initManageSquadsFeature(btn) {
    let tableView = false;
    const cardsContainer = document.getElementById('cards');

    btn.addEventListener('click', async () => {
      tableView = !tableView;
      btn.textContent = tableView ? 'Card View' : 'Manage Squads';

      if (tableView) {
        showOverlay('Loading Squads…');
        try {
          const results = await Promise.allSettled([
            P.api.getRowsByTitle('SQUADS', { force: true }),
            P.api.getRowsByTitle('SQUAD_MEMBERS', { force: true }),
            P.getEmployees()
          ]);

          const squads =
            results[0].status === 'fulfilled' ? results[0].value : [];
          const members =
            results[1].status === 'fulfilled' ? results[1].value : [];
          const employees =
            results[2].status === 'fulfilled' ? results[2].value : [];

          buildManageTable(squads, members, employees, cardsContainer);
        } catch (err) {
          console.error(err);
          safeToast('Error loading manage view', 'error');
        } finally {
          hideOverlay();
        }
      } else {
        // Return to card grid
        showOverlay('Refreshing cards…');
        await loadSquadCards();
        await applyFilters();
        hideOverlay();
      }
    });
  }

  // ---- Part 2 (Manage Table + Styles) continues below ----
    // =====================================================
  //  Manage Table Build + Leader Multi-Select + Save Logic
  // =====================================================
  async function buildManageTable(squads, members, employees, cardsContainer) {
    // Hide cards, show table
    const manageView =
      document.getElementById('squad-management-view') ||
      document.createElement('div');
    manageView.id = 'squad-management-view';
    manageView.innerHTML = '';
    manageView.style.display = 'block';
    cardsContainer.style.display = 'none';
    cardsContainer.parentNode.insertBefore(manageView, cardsContainer.nextSibling);

    if (!Array.isArray(squads) || !squads.length) {
      manageView.innerHTML = `<div class="no-data">No squads available.</div>`;
      return;
    }

    // build employee dropdown data
    const empMap = employees
      .map(e => {
        const id = e['Position ID'] || e['Employee ID'];
        const name = e['Display Name'] || e['Employee Name'];
        return { id, name };
      })
      .filter(e => e.id && e.name);

    // ---------- Build table ----------
    const table = document.createElement('table');
    table.className = 'manage-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>ID</th><th>Squad Name</th><th>Category</th><th>Active</th>
          <th>Objective</th><th>Leaders</th><th>Created By</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${squads
          .map(r => {
            const sid = r['Squad ID'];
            const leaders = members
              .filter(m => m['Squad ID'] === sid && m['Role'] === 'Leader')
              .map(m => m['Employee Name']);
            return `
            <tr data-id="${sid}">
              <td class="id">${sid}</td>
              <td class="name" contenteditable="true">${dash(r['Squad Name'])}</td>
              <td class="category" contenteditable="true">${dash(r['Category'])}</td>
              <td class="active"><input type="checkbox" ${
                isTrue(r['Active']) ? 'checked' : ''
              }></td>
              <td class="objective" contenteditable="true">${dash(r['Objective'])}</td>
              <td class="leaders">
                <select multiple class="leader-select">
                  ${empMap
                    .map(emp => {
                      const sel = leaders.includes(emp.name) ? 'selected' : '';
                      return `<option value="${emp.id}" data-name="${emp.name}" ${sel}>${emp.name}</option>`;
                    })
                    .join('')}
                </select>
              </td>
              <td class="createdBy" contenteditable="true">${dash(
                r['Created By']
              )}</td>
              <td class="actions">
                <button class="btn save-btn">Save</button>
                <button class="btn cancel-btn">Cancel</button>
              </td>
            </tr>`;
          })
          .join('')}
      </tbody>`;
    manageView.appendChild(table);

    // ---------- Save / Cancel ----------
    table.addEventListener('click', async e => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      const sid = tr.dataset.id;

      // Save changes
      if (e.target.classList.contains('save-btn')) {
        const name = tr.querySelector('.name').textContent.trim();
        const category = tr.querySelector('.category').textContent.trim();
        const active = tr.querySelector('.active input').checked;
        const objective = tr.querySelector('.objective').textContent.trim();
        const createdBy = tr.querySelector('.createdBy').textContent.trim();
        const selected = [...tr.querySelectorAll('.leader-select option:checked')].map(
          o => ({ id: o.value, name: o.dataset.name })
        );

        if (!selected.length) {
          safeToast('Each squad must have at least one leader.', 'warn');
          return;
        }

        try {
          await PowerUp.api.updateRowById('SQUADS', sid, {
            'Squad Name': name,
            'Category': category,
            Active: active,
            Objective: objective,
            'Created By': createdBy
          });

          // Leader reconciliation
          const existing = members.filter(
            m => m['Squad ID'] === sid && m['Role'] === 'Leader'
          );
          const existingIDs = existing.map(m => m['Employee ID']);
          const toAdd = selected.filter(l => !existingIDs.includes(l.id));
          const toRemove = existing.filter(
            m => !selected.some(l => l.id === m['Employee ID'])
          );

          for (const r of toRemove)
            await PowerUp.api.deleteRowById('SQUAD_MEMBERS', r.id);
          for (const l of toAdd)
            await PowerUp.api.addRow('SQUAD_MEMBERS', {
              'Squad ID': sid,
              'Employee ID': l.id,
              'Employee Name': l.name,
              Role: 'Leader'
            });

          safeToast(`✅ Squad "${name}" updated.`, 'success');
        } catch (err) {
          console.error(err);
          safeToast('Error saving squad changes', 'error');
        }
      }

      // Cancel edits
      if (e.target.classList.contains('cancel-btn')) {
        safeToast('Edits canceled', 'info');
        await loadSquadCards();
        await applyFilters();
      }
    });
  }

  // =====================================================
  //  Global Style Injection (cards + pills + manage table)
  // =====================================================
  const style = document.createElement('style');
  style.textContent = `
  /* ---- Card Grid ---- */
  .squad-card{
    background:#0f1a1a;
    border:1px solid var(--cat-color,#2d3f3f);
    border-radius:10px;
    padding:12px 14px;
    margin:10px;
    width:240px;
    color:#e5e7eb;
    box-shadow:0 0 8px rgba(0,0,0,.4);
    transition:transform .15s ease, box-shadow .15s ease;
  }
  .squad-card:hover{
    transform:translateY(-2px);
    box-shadow:0 0 10px var(--cat-color,#00f08e);
  }
  .squad-card-header{
    display:flex;align-items:center;gap:6px;margin-bottom:4px;
  }
  .squad-card-header .dot{
    width:10px;height:10px;border-radius:50%;
  }
  .squad-card .objective{font-size:13px;margin:4px 0 2px;}
  .squad-card .leaders{font-size:12px;opacity:.8;}

  /* ---- Pill Filters ---- */
  .pill-cat{
    background:#142222;
    border:1px solid var(--cat-color,#00f08e);
    color:#d9e6e6;
    border-radius:18px;
    padding:4px 10px;
    font-size:13px;
    margin:2px;
    cursor:pointer;
    display:inline-flex;align-items:center;gap:6px;
    transition:background .2s;
  }
  .pill-cat .dot{width:8px;height:8px;border-radius:50%;background:var(--cat-color);}
  .pill-cat.active{background:var(--cat-color,#00f08e);color:#0b1212;}

  /* ---- Manage Table ---- */
  .manage-table{
    width:100%;
    border-collapse:collapse;
    font-size:13px;
    position:relative;
  }
  .manage-table th,
  .manage-table td{
    border:1px solid #2d3f3f;
    padding:8px 10px;
    white-space:nowrap;
    background:#0f1a1a;
    color:#d9e6e6;
  }
  .manage-table th{
    text-transform:uppercase;
    font-size:12px;
    font-weight:600;
    position:sticky;
    top:0;
    z-index:10;
  }
  .manage-table thead::after{
    content:"";
    position:absolute;
    top:0;left:0;right:0;height:34px;
    background:linear-gradient(to bottom, rgba(15,26,26,1) 70%, transparent);
    pointer-events:none;
  }
  .leader-select{
    width:180px;
    background:#101f1f;
    color:#e5e7eb;
    border:1px solid #2d3f3f;
    border-radius:6px;
  }
  .actions{text-align:center;}
  .actions .btn{
    min-width:70px;
    border-radius:6px;
    border:1px solid var(--accent,#00f08e);
    background:#0f1a1a;
    color:#d9e6e6;
    margin:2px;
    cursor:pointer;
    transition:background .2s;
  }
  .actions .btn:hover{background:#152525;}
  .no-data{padding:16px;opacity:.7;}

  /* ---- Overlay Spinner ---- */
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
    background:#0f1b1b;
    border:1px solid var(--accent,#00f08e);
    padding:22px 26px;
    border-radius:12px;
    color:#d9e6e6;
    font-weight:600;
  }
  .spinner{
    width:28px;height:28px;
    border:3px solid #00f08e;
    border-top-color:transparent;
    border-radius:50%;
    animation:spin 1s linear infinite;
  }
  @keyframes spin{to{transform:rotate(360deg);}}
  `;
  document.head.appendChild(style);
})(window.PowerUp || {});

