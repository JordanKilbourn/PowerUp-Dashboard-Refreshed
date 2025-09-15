// squad-details.js — compact members + activities, keep original buttons,
// remove legacy members block, preserve existing add-member modal.
// No changes to dashboard submission counts or other pages.

(function (P) {
  const { api, session, layout } = P;

  // ---------- small helpers ----------
  const qs = (k) => new URLSearchParams(location.search).get(k) || "";
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const norm = (s) => String(s || "").trim().toLowerCase();
  const isTrue = (v) => v === true || /^(true|yes|y|checked|1)$/i.test(String(v ?? "").trim());

  // 8/29/25 style
  function fmtShortDate(v) {
    if (!v) return "-";
    const d = new Date(v);
    if (isNaN(d)) return esc(v);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const yy = String(d.getFullYear()).slice(-2);
    return `${m}/${day}/${yy}`;
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

  function findEl(...selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Remove legacy, full-width members block if present
  function removeLegacyMembersBlock() {
    // Most common: a section with a big table#members-table under a header "Members"
    const legacyTable = document.getElementById('members-table');
    if (legacyTable) {
      const wrap = legacyTable.closest('.card, section, div, .table-wrapper') || legacyTable;
      wrap.remove();
      return;
    }

    // Fallback: first large table immediately under an H? tag that says "Members"
    const headings = Array.from(document.querySelectorAll('h2,h3,h4,.section-title'))
      .filter(h => (h.textContent || '').trim().toLowerCase() === 'members');
    for (const h of headings) {
      const t = h.parentElement && h.parentElement.querySelector('table');
      if (t && !t.closest('[data-role="members-compact"]')) {
        (t.closest('.card, section, div') || t).remove();
        break;
      }
    }
  }

  // Remove a stray "Back" button that lives *inside* the compact members pane (not the header one)
  function removeInnerBackIfAny(compactPane) {
    if (!compactPane) return;
    const btns = Array.from(compactPane.querySelectorAll('button,a'));
    const innerBack = btns.find(b => /\bback\b/i.test(b.textContent || ''));
    if (innerBack) innerBack.remove();
  }

  // Compact status pill
  function statusPill(active) {
    return active
      ? '<span class="pill pill--green" style="padding:2px 8px;font-size:11px;line-height:1.1;border-radius:999px;">Active</span>'
      : '<span class="pill pill--slate" style="padding:2px 8px;font-size:11px;line-height:1.1;border-radius:999px;background:#3a4a4a;color:#e5e7eb;">Inactive</span>';
  }

  // Render the compact members table (left pane)
  function renderCompactMembers(options) {
    const {
      allMemberRows, empNameById, squadId
    } = options;

    // Container detection: prefer a tbody we can target
    const tBody =
      findEl('[data-hook="members.compact.tbody"]',
             '#members-compact tbody',
             '#members-pane tbody');

    if (!tBody) return; // nothing to render into (page’s markup missing this table)

    // Keep the container constrained & scrollable
    const card = tBody.closest('[data-role="members-compact"]') || tBody.closest('.card') || tBody.closest('div');
    if (card) {
      card.style.maxHeight = 'calc(62vh)';
      card.style.overflow = 'auto';
      card.style.overscrollBehavior = 'contain';
    }

    // Header (if we own it)
    const thead = tBody.closest('table')?.querySelector('thead tr');
    if (thead) {
      thead.innerHTML = '<th>Name</th><th>Role</th><th>Status</th><th>Start</th>';
    }

    const rows = allMemberRows
      .filter(r => norm(r['Squad ID']) === norm(squadId))
      .map(r => {
        const eid   = String(r['Employee ID'] || r['Position ID'] || '').trim();
        const name  = empNameById.get(eid) || eid || '-';
        const role  = String(r['Role'] || '').trim() || 'Member';
        const active= isTrue(r['Active']);
        const start = r['Start Date'] || r['Start'] || '';
        return {
          name,
          role,
          active,
          start: fmtShortDate(start)
        };
      });

    if (!rows.length) {
      tBody.innerHTML = '<tr><td colspan="4" style="opacity:.7;text-align:center;">No members yet</td></tr>';
    } else {
      tBody.innerHTML = rows.map(r => `
        <tr style="font-size:13px;">
          <td>${esc(r.name)}</td>
          <td>${esc(r.role)}</td>
          <td>${statusPill(r.active)}</td>
          <td>${esc(r.start)}</td>
        </tr>
      `).join('');
    }

    // Clean any stray inner back button
    removeInnerBackIfAny(card);
  }

  // Activities table — read-only placeholder for now (Phase 1)
  function renderActivitiesPlaceholder() {
    const tbody = findEl('[data-hook="activities.tbody"]', '#activities-table tbody', '#squad-activities tbody');
    const thead = tbody?.closest('table')?.querySelector('thead tr');
    if (thead) {
      thead.innerHTML = `
        <th>Title</th><th>Type</th><th>Status</th><th>Dates</th><th>Owner</th><th>Participants</th><th>Completed PH</th>
      `;
    }
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" style="opacity:.7;text-align:center;">No activities yet</td></tr>`;
    }
  }

  // Wire the top-right buttons (keep original behavior)
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

    // Add Member (admin always; leaders of this squad only; same modal hook as before)
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
  }

  async function main() {
    layout.injectLayout?.();
    await session.initHeader?.();

    const urlId = qs('id') || qs('squadId') || qs('squad');
    if (!urlId) {
      layout.setPageTitle?.('Squad Details');
      return;
    }

    // Admin check (support either P.auth or roles namespace)
    const isAdmin = !!(P.auth?.isAdmin && P.auth.isAdmin());
    const me = session.get?.() || {};
    const myId = (me.employeeId || '').trim();

    // Load data
    const [squadsRows, membersRows, empMap] = await Promise.all([
      api.getRowsByTitle('SQUADS'),
      api.getRowsByTitle('SQUAD_MEMBERS'),
      loadEmployeeMap()
    ]);

    // Resolve squad row by ID or Name
    const sidLC = norm(urlId);
    const squad =
      squadsRows.find(r => norm(r['Squad ID']) === sidLC) ||
      squadsRows.find(r => norm(r['Squad Name']) === sidLC);

    if (!squad) {
      layout.setPageTitle?.('Squad: Not Found');
      return;
    }

    const squadId   = String(squad['Squad ID'] || urlId).trim();
    const squadName = String(squad['Squad Name'] || squadId).trim();

    layout.setPageTitle?.(`Squad Details`);

    // Top three cards
    const coreKV = findEl('#card-core .kv', '[data-hook="squad.core.kv"]');
    if (coreKV) {
      // Active/Inactive
      const active = isTrue(squad['Active']);
      const category = squad['Category'] || '-';
      const created  = squad['Created Date'] || squad['Created'] || '';

      // Leaders: source of truth from SQUAD_MEMBERS (active leaders)
      const leaderIds = membersRows
        .filter(r => norm(r['Squad ID']) === norm(squadId) && norm(r['Role']) === 'leader' && isTrue(r['Active']))
        .map(r => String(r['Employee ID'] || '').trim())
        .filter(Boolean);

      const leaderNames = leaderIds
        .map(id => empMap.get(id) || id)
        .filter(Boolean);

      let leaderText = '-';
      if (leaderNames.length === 1) leaderText = leaderNames[0];
      else if (leaderNames.length === 2) leaderText = `${leaderNames[0]}, ${leaderNames[1]}`;
      else if (leaderNames.length > 2) leaderText = `${leaderNames[0]}, ${leaderNames[1]} +${leaderNames.length - 2} more`;

      coreKV.innerHTML = `
        <div><b>Name:</b> ${esc(squadName)}</div>
        <div><b>${leaderNames.length > 1 ? 'Leaders' : 'Leader'}:</b> ${esc(leaderText)}</div>
        <div><b>Status:</b> ${active
          ? '<span class="pill pill--green" style="padding:2px 8px;font-size:11px;line-height:1.1;border-radius:999px;">Active</span>'
          : '<span class="pill pill--slate" style="padding:2px 8px;font-size:11px;line-height:1.1;border-radius:999px;background:#3a4a4a;color:#e5e7eb;">Inactive</span>'}</div>
        <div><b>Category:</b> ${esc(category)}</div>
        <div><b>Created:</b> ${esc(created || '-')}</div>
      `;
    }
    const objKV   = findEl('#card-objective .kv', '[data-hook="squad.objective.kv"]');
    const notesKV = findEl('#card-notes .kv',     '[data-hook="squad.notes.kv"]');
    if (objKV)   objKV.textContent   = (squad['Objective'] || '-');
    if (notesKV) notesKV.textContent = (squad['Notes']     || '-');

    // Hide/remove the old members section so the new layout sits right under the cards
    removeLegacyMembersBlock();

    // Render compact members on the left
    renderCompactMembers({
      allMemberRows: membersRows,
      empNameById: empMap,
      squadId
    });

    // Render activities placeholder (read-only Phase 1)
    renderActivitiesPlaceholder();

    // Wire header buttons (Back + Add Member)
    wireHeaderButtons({ squadId, squadName, membersRows, isAdmin, myId });

    // If someone adds a member via the modal, refresh left list
    document.addEventListener('squad-member-added', async () => {
      const latest = await api.getRowsByTitle('SQUAD_MEMBERS', { force: true });
      renderCompactMembers({
        allMemberRows: latest,
        empNameById: empMap,
        squadId
      });
    });
  }

  document.addEventListener('DOMContentLoaded', main);
})(window.PowerUp || (window.PowerUp = {}));
