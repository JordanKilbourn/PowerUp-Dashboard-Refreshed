// squad-details.js — builds compact Members + Activities section, removes legacy members table,
// preserves Back/Add Member behavior, and hydrates the three info cards.

(function (P) {
  const { api, session, layout } = P;

  // ---------- helpers ----------
  const qs   = (k) => new URLSearchParams(location.search).get(k) || "";
  const esc  = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const norm = (s) => String(s || "").trim().toLowerCase();
  const isTrue = (v) => v === true || /^(true|yes|y|checked|1)$/i.test(String(v ?? "").trim());

  // 8/29/25 style
  function fmtShortDate(v) {
    if (!v) return "-";
    const d = new Date(v);
    if (isNaN(d)) return esc(v);
    return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  }

  async function loadEmployeeMap() {
    const rows = await api.getRowsByTitle('EMPLOYEE_MASTER');
    const map = new Map();
    rows.forEach(r => {
      const id   = String(r["Position ID"] || r["Employee ID"] || r["EmployeeID"] || r["ID"] || "").trim();
      const name = String(r["Display Name"] || r["Employee Name"] || r["Name"] || "").trim();
      if (id) map.set(id, name || id);
    });
    return map;
  }

  // ---------- DOM utilities ----------
  function findEl(...selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Remove the old, full-width members section (table + its wrapper + stray "Members" header)
  function removeLegacyMembersBlock() {
    // Common case: #members-table
    const legacy = document.getElementById('members-table');
    if (legacy) {
      const wrap = legacy.closest('.card, section, .table-wrapper, div') || legacy;
      wrap.remove();
    }
    // Remove a bare "Members" header left behind
    const orphanHeadings = Array
      .from(document.querySelectorAll('h2,h3,h4,.section-title'))
      .filter(h => (h.textContent || '').trim().toLowerCase() === 'members');
    orphanHeadings.forEach(h => {
      // If there is no table within the same container, drop it
      const container = h.closest('.card, section, div') || h.parentElement;
      if (container && !container.querySelector('table')) container.remove();
    });
  }

  // Create the new section if missing (metrics + members compact + activities)
  function ensureNewSection() {
    if (document.querySelector('[data-hook="squad.composite"]')) return;

    // Minimal CSS to tighten the left list & match your theme without touching global styles
    const styleId = 'sq-compact-css';
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style');
      s.id = styleId;
      s.textContent = `
        .sq-grid { display:grid; grid-template-columns: 1fr 2.2fr; gap:12px; margin-top:12px; }
        @media (max-width: 1100px) { .sq-grid { grid-template-columns: 1fr; } }
        .sq-card { background: var(--card-bg, #0f1a1a); border:1px solid #2d3f3f; border-radius:8px; padding:10px; }
        .sq-card h3 { margin:0 0 8px 0; font-size:14px; color:#92f0d8; }
        .sq-metrics { display:grid; grid-template-columns: repeat(4, minmax(120px,1fr)); gap:10px; margin-top:10px; }
        .sq-metric { background: var(--card-bg, #0f1a1a); border:1px solid #2d3f3f; border-radius:8px; padding:10px; }
        .sq-metric .k { font-size:18px; font-weight:700; color:#e5e7eb; }
        .sq-metric .l { font-size:12px; color:#9ca3af; }
        .sq-table { width:100%; border-collapse:separate; border-spacing:0; }
        .sq-table thead th { text-align:left; font-size:12px; color:#9ca3af; padding:8px; border-bottom:1px solid #2d3f3f; position:sticky; top:0; background:var(--card-bg, #0f1a1a); z-index:1; }
        .sq-table tbody td { font-size:13px; padding:8px; border-bottom:1px solid #1b2a2a; }
        .sq-scroll { max-height: calc(62vh); overflow: auto; overscroll-behavior: contain; }
        .sq-pill { padding:2px 8px; font-size:11px; line-height:1.1; border-radius:999px; display:inline-block; }
        .sq-pill--on { background:#6ee7b7; color:#083344; }
        .sq-pill--off { background:#3a4a4a; color:#e5e7eb; }
      `;
      document.head.appendChild(s);
    }

    // Insert after the 3 cards row (prefer to append into content if unsure)
    const content = document.getElementById('pu-content') || document.body;
    const anchor = document.getElementById('card-notes')?.parentElement || content;

    const wrap = document.createElement('section');
    wrap.setAttribute('data-hook', 'squad.composite');

    wrap.innerHTML = `
      <div class="sq-metrics" data-hook="metrics">
        <div class="sq-metric"><div class="k" data-hook="m.active">0</div><div class="l">Active activities</div></div>
        <div class="sq-metric"><div class="k" data-hook="m.planned">0</div><div class="l">Planned</div></div>
        <div class="sq-metric"><div class="k" data-hook="m.completed">0</div><div class="l">Completed</div></div>
        <div class="sq-metric"><div class="k" data-hook="m.hours">0</div><div class="l">Completed PH hours</div></div>
      </div>

      <div class="sq-grid">
        <div class="sq-card" data-role="members-compact">
          <h3>Members</h3>
          <div class="sq-scroll">
            <table class="sq-table" id="members-compact">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Start</th></tr></thead>
              <tbody data-hook="members.compact.tbody"></tbody>
            </table>
          </div>
        </div>

        <div class="sq-card" id="activities-card">
          <h3 style="display:flex;align-items:center;justify-content:space-between;">
            <span>Squad Activities</span>
            <button id="btn-add-activity" class="btn btn-xs" style="display:none;border:1px solid #2a354b;background:#0b1328;color:#e5e7eb;border-radius:8px;padding:6px 10px;cursor:pointer">+ Add Activity</button>
          </h3>
          <div class="sq-scroll">
            <table class="sq-table" id="activities-table">
              <thead><tr>
                <th>Title</th><th>Type</th><th>Status</th><th>Dates</th><th>Owner</th><th>Participants</th><th>Completed PH</th>
              </tr></thead>
              <tbody data-hook="activities.tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    anchor.insertAdjacentElement('afterend', wrap);
  }

  // ---------- rendering ----------
  function renderMetrics({ active = 0, planned = 0, completed = 0, hours = 0 }) {
    const set = (hook, v) => { const el = document.querySelector(`[data-hook="${hook}"]`); if (el) el.textContent = v; };
    set('m.active', active);
    set('m.planned', planned);
    set('m.completed', completed);
    set('m.hours', hours);
  }

  function renderCompactMembers({ allMemberRows, empNameById, squadId }) {
    const tBody = findEl('[data-hook="members.compact.tbody"]');
    if (!tBody) return;

    const rows = allMemberRows
      .filter(r => norm(r['Squad ID']) === norm(squadId))
      .map(r => {
        const eid   = String(r['Employee ID'] || r['Position ID'] || '').trim();
        const name  = empNameById.get(eid) || eid || '-';
        const role  = String(r['Role'] || '').trim() || 'Member';
        const active= isTrue(r['Active']);
        const start = r['Start Date'] || r['Start'] || '';
        return { name, role, active, start: fmtShortDate(start) };
      });

    if (!rows.length) {
      tBody.innerHTML = '<tr><td colspan="4" style="opacity:.7;text-align:center;">No members yet</td></tr>';
      return;
    }

    tBody.innerHTML = rows.map(r => `
      <tr style="font-size:13px;">
        <td>${esc(r.name)}</td>
        <td>${esc(r.role)}</td>
        <td><span class="sq-pill ${r.active ? 'sq-pill--on':'sq-pill--off'}">${r.active ? 'Active':'Inactive'}</span></td>
        <td>${esc(r.start)}</td>
      </tr>
    `).join('');
  }

  function renderActivitiesPlaceholder() {
    const tbody = findEl('[data-hook="activities.tbody"]');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="opacity:.7;text-align:center;">No activities yet</td></tr>`;
    }
  }

  function wireHeaderButtons({ squadId, squadName, membersRows, isAdmin, myId }) {
    // Back
    const back = document.getElementById('btn-back');
    if (back && !back._wired) {
      back._wired = true;
      back.addEventListener('click', (e) => {
        e.preventDefault();
        if (history.length > 1) history.back();
        else location.href = 'squads.html';
      });
    }

    // Add Member (admins, or leaders on this squad)
    const addBtn = document.getElementById('btn-addmember');
    if (addBtn) {
      let canAdd = !!isAdmin;
      if (!canAdd) {
        const iAmLeader = membersRows.some(r =>
          norm(r['Squad ID']) === norm(squadId) &&
          norm(r['Role']) === 'leader' &&
          isTrue(r['Active']) &&
          norm(r['Employee ID']) === norm(myId)
        );
        canAdd = iAmLeader;
      }

      if (canAdd) {
        addBtn.style.display = 'inline-flex';
        addBtn.disabled = false;
        if (!addBtn._wired) {
          addBtn._wired = true;
          addBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!P.squadForm?.open) {
              alert('Member form not found. Is scripts/squad-member-form.js included?');
              return;
            }
            P.squadForm.open({ squadId, squadName });
          });
        }
      } else {
        addBtn.style.display = 'none';
        addBtn.disabled = true;
      }
    }

    // (Optional) Add Activity button visibility now; wiring comes in the create/edit phase
    const addAct = document.getElementById('btn-add-activity');
    if (addAct) {
      const can = !!isAdmin || membersRows.some(r =>
        norm(r['Squad ID']) === norm(squadId) && norm(r['Role']) === 'leader' && isTrue(r['Active']) &&
        norm(r['Employee ID']) === norm(myId)
      );
      addAct.style.display = can ? 'inline-flex' : 'none';
    }
  }

  // ---------- main ----------
  async function main() {
    layout.injectLayout?.();
    await session.initHeader?.();

    const urlId = qs('id') || qs('squadId') || qs('squad');
    if (!urlId) { layout.setPageTitle?.('Squad Details'); return; }

    const isAdmin = !!(P.auth?.isAdmin && P.auth.isAdmin());
    const me = session.get?.() || {};
    const myId = (me.employeeId || '').trim();

    // Data
    const [squadsRows, membersRows, empMap] = await Promise.all([
      api.getRowsByTitle('SQUADS'),
      api.getRowsByTitle('SQUAD_MEMBERS'),
      loadEmployeeMap()
    ]);

    // Resolve squad
    const sidLC = norm(urlId);
    const squad =
      squadsRows.find(r => norm(r['Squad ID']) === sidLC) ||
      squadsRows.find(r => norm(r['Squad Name']) === sidLC);
    if (!squad) { layout.setPageTitle?.('Squad: Not Found'); return; }

    const squadId   = String(squad['Squad ID'] || urlId).trim();
    const squadName = String(squad['Squad Name'] || squadId).trim();
    layout.setPageTitle?.('Squad Details');

    // Hydrate the three cards
    const coreKV = findEl('#card-core .kv', '[data-hook="squad.core.kv"]');
    if (coreKV) {
      const active = isTrue(squad['Active']);
      const category = squad['Category'] || '-';
      const created  = squad['Created Date'] || squad['Created'] || '';

      const leaderIds = membersRows
        .filter(r => norm(r['Squad ID']) === norm(squadId) && norm(r['Role']) === 'leader' && isTrue(r['Active']))
        .map(r => String(r['Employee ID'] || '').trim())
        .filter(Boolean);

      const leaderNames = leaderIds.map(id => empMap.get(id) || id).filter(Boolean);
      let leaderText = '-';
      if (leaderNames.length === 1) leaderText = leaderNames[0];
      else if (leaderNames.length === 2) leaderText = `${leaderNames[0]}, ${leaderNames[1]}`;
      else if (leaderNames.length > 2) leaderText = `${leaderNames[0]}, ${leaderNames[1]} +${leaderNames.length - 2} more`;

      coreKV.innerHTML = `
        <div><b>Name:</b> ${esc(squadName)}</div>
        <div><b>${leaderNames.length > 1 ? 'Leaders' : 'Leader'}:</b> ${esc(leaderText)}</div>
        <div><b>Status:</b> ${active ? '<span class="sq-pill sq-pill--on">Active</span>' : '<span class="sq-pill sq-pill--off">Inactive</span>'}</div>
        <div><b>Category:</b> ${esc(category)}</div>
        <div><b>Created:</b> ${esc(created || '-')}</div>
      `;
    }
    const objKV   = findEl('#card-objective .kv', '[data-hook="squad.objective.kv"]');
    const notesKV = findEl('#card-notes .kv',     '[data-hook="squad.notes.kv"]');
    if (objKV)   objKV.textContent   = (squad['Objective'] || '-');
    if (notesKV) notesKV.textContent = (squad['Notes']     || '-');

    // Kill the old members block, then ensure the new one exists
    removeLegacyMembersBlock();
    ensureNewSection();

    // Render new content
    renderCompactMembers({ allMemberRows: membersRows, empNameById: empMap, squadId });
    renderActivitiesPlaceholder();
    renderMetrics({ active: 0, planned: 0, completed: 0, hours: 0 }); // real metrics will come with Activities wiring

    // Buttons
    wireHeaderButtons({ squadId, squadName, membersRows, isAdmin, myId });

    // Refresh members list after modal save
    document.addEventListener('squad-member-added', async () => {
      const latest = await api.getRowsByTitle('SQUAD_MEMBERS', { force: true });
      renderCompactMembers({ allMemberRows: latest, empNameById: empMap, squadId });
    });
  }

  document.addEventListener('DOMContentLoaded', main);
})(window.PowerUp || (window.PowerUp = {}));
