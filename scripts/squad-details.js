// scripts/squad-details.js
// Combined: restores legacy Back/Add Member behavior + new layout (members left + activities)
// Compact members list, styled scrollbar, short dates, and safe fallbacks for legacy selectors.

(function (P) {
  const { api, session, layout } = P;

  // ---------- small utils ----------
  const qs = (k) => new URLSearchParams(location.search).get(k) || "";
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const norm = (s) => String(s || "").trim().toLowerCase();

  // Short date like "8/29/25"
  function fmtDateShort(v) {
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
      const id = String(r["Position ID"] || r["Employee ID"] || r["EmployeeID"] || r["ID"] || "").trim();
      const nm = String(r["Display Name"] || r["Employee Name"] || r["Name"] || id || "").trim();
      if (id) map.set(id, nm || id);
    });
    return map;
  }

  // ---------- UI helpers ----------
  // We inject a few tiny CSS rules so you don't need to touch your HTML/CSS files.
  function injectOnceStyles() {
    if (document.getElementById('sq-details-inline-css')) return;
    const css = document.createElement('style');
    css.id = 'sq-details-inline-css';
    css.textContent = `
      /* compact members table */
      #members-panel { display:flex; flex-direction:column; }
      #members-panel .table-wrap {
        overflow:auto; border:1px solid #2d3f3f; border-radius:8px; background:#0f1b1b;
      }
      #members-table { font-size: 12px; }
      #members-table th { font-size: 12px; }
      #members-table td { padding: 6px 8px; }

      /* smaller status pills */
      .status-pill { padding:2px 7px; border-radius:999px; font-size:11px; font-weight:700; }
      .status-on  { background: var(--success,#6ee7b7); color:#062; }
      .status-off { background: #3a4e4e; color:#fff; }

      /* themed scrollbar inside members list */
      #members-panel .table-wrap::-webkit-scrollbar { width: 8px; }
      #members-panel .table-wrap::-webkit-scrollbar-thumb {
        background: #263737; border-radius: 8px; border: 2px solid #0f1b1b;
      }
      #members-panel .table-wrap::-webkit-scrollbar-track { background: transparent; }

      /* keep the activities table consistent height with members panel */
      #activities-panel .table-wrap {
        overflow: hidden; border:1px solid #2d3f3f; border-radius:8px; background:#0f1b1b;
      }
    `;
    document.head.appendChild(css);
  }

  // Fit the members panel to viewport so it never runs below the page
  function sizeMembersPanel() {
    const header = document.getElementById('pu-header');
    const panel  = document.querySelector('#members-panel .table-wrap');
    if (!panel) return;
    const headerH = header ? header.offsetHeight : 64;
    const top = panel.getBoundingClientRect().top + window.scrollY;
    const vh = window.innerHeight;
    const gutter = 28; // a bit of breathing room above the footer/edge
    const maxH = Math.max(220, vh - (top - window.scrollY) - gutter);
    panel.style.maxHeight = `${maxH}px`;

    // mirror the same height on the activities panel wrap to keep rows aligned visually
    const actWrap = document.querySelector('#activities-panel .table-wrap');
    if (actWrap) actWrap.style.minHeight = `${Math.min(520, maxH)}px`;
  }

  // ---------- Rendering ----------
  function renderMembers(allRows, empMap, squadId, showEmpId) {
    const rows = allRows.filter(r => norm(r["Squad ID"]) === norm(squadId));

    const thead = document.querySelector("#members-table thead tr");
    const tbody = document.querySelector("#members-table tbody");
    if (!thead || !tbody) return;

    thead.innerHTML = showEmpId
      ? "<th>Name</th><th>Emp ID</th><th>Role</th><th>Status</th><th>Start</th>"
      : "<th>Name</th><th>Role</th><th>Status</th><th>Start</th>";

    const html = rows.map(r => {
      const eid   = String(r["Employee ID"] || "").trim();
      const name  = empMap.get(eid) || eid || "-";
      const role  = r["Role"] || "-";
      const active= /^true$/i.test(String(r["Active"]||"").trim());
      const start = r["Start Date"] || r["Start"];
      const cells = [
        `<td>${esc(name)}</td>`,
        ...(showEmpId ? [`<td class="mono">${esc(eid || "-")}</td>`] : []),
        `<td>${esc(role)}</td>`,
        `<td>${active ? '<span class="status-pill status-on">Active</span>' : '<span class="status-pill status-off">Inactive</span>'}</td>`,
        `<td>${fmtDateShort(start)}</td>`
      ];
      return `<tr>${cells.join("")}</tr>`;
    }).join("");

    tbody.innerHTML = html || `<tr><td colspan="${showEmpId ? 5 : 4}" style="opacity:.7;text-align:center;">No members yet</td></tr>`;
    sizeMembersPanel();
  }

  // Minimal placeholder for activities (read-only until sheets are wired)
  function renderActivitiesPlaceholder() {
    const thead = document.querySelector("#activities-table thead tr");
    const tbody = document.querySelector("#activities-table tbody");
    if (!thead || !tbody) return;
    thead.innerHTML = `
      <th>Title</th><th>Type</th><th>Status</th><th>Dates</th><th>Owner</th><th>Participants</th><th>Completed PH</th>
    `;
    tbody.innerHTML = `<tr><td colspan="7" style="opacity:.7;text-align:center;">No activities yet</td></tr>`;
  }

  // ---------- Buttons: Back + Add Member (legacy-compatible) ----------
  function wireBackButton() {
    // support both ids: #btn-back (old) and #btnBack (new)
    const btn = document.getElementById('btn-back') || document.getElementById('btnBack');
    if (!btn) return;
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (history.length > 1) history.back();
      else location.href = 'squads.html';
    });
    btn.style.display = 'inline-flex';
  }

  function wireAddMemberButton({ squadId, squadName, canAdd }) {
    // support both ids: #btn-addmember (old) and #btnAddMember (new)
    const btn = document.getElementById('btn-addmember') || document.getElementById('btnAddMember');
    if (!btn) return;

    if (canAdd) {
      btn.style.display = 'inline-flex';
      btn.disabled = false;
      if (!btn.dataset.bound) {
        btn.dataset.bound = "1";
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          // Your original modal API:
          if (P.squadForm && typeof P.squadForm.open === 'function') {
            P.squadForm.open({ squadId, squadName });
            return;
          }
          // Back-compat fallbacks if the modal lived elsewhere (won't run if above works)
          const legacyBtn = document.querySelector(
            '[data-action="addMember"], [data-action="add-member"], #addMemberBtn, .js-add-member'
          );
          if (legacyBtn) { legacyBtn.click(); return; }
          document.dispatchEvent(new CustomEvent('pu:add-member', { detail: { squadId, squadName } }));
        });
      }
    } else {
      btn.style.display = 'none';
      btn.disabled = true;
    }
  }

  // ---------- Main ----------
  async function main() {
    layout.injectLayout?.();
    await session.initHeader?.();
    injectOnceStyles();

    // Route params
    const urlId = qs("id") || qs("squadId") || qs("squad");
    if (!urlId) {
      layout.setPageTitle?.("Squad Details");
      renderActivitiesPlaceholder();
      return;
    }

    // Admin detection via roles.js (P.auth.isAdmin)
    const isAdmin = !!(P.auth && typeof P.auth.isAdmin === 'function' && P.auth.isAdmin());

    // Load data
    const [squads, members, empMap] = await Promise.all([
      api.getRowsByTitle('SQUADS',        { force: true }),
      api.getRowsByTitle('SQUAD_MEMBERS', { force: true }),
      loadEmployeeMap()
    ]);

    const sidLC = norm(urlId);
    const squad = squads.find(r => norm(r["Squad ID"]) === sidLC) ||
                  squads.find(r => norm(r["Squad Name"]) === sidLC);
    if (!squad) {
      layout.setPageTitle?.("Squad: Not Found");
      renderActivitiesPlaceholder();
      return;
    }

    const squadId   = String(squad["Squad ID"]   || urlId).trim();
    const squadName = String(squad["Squad Name"] || squadId).trim();
    layout.setPageTitle?.(`Squad Details`);

    // Leaders list (active leaders in SQUAD_MEMBERS)
    const leaderRows = members.filter(r =>
      norm(r["Squad ID"]) === norm(squadId) &&
      norm(r["Role"]) === "leader" &&
      /^true$/i.test(String(r["Active"]||"").trim())
    );
    const leaderIds = leaderRows.map(r => String(r["Employee ID"] || "").trim()).filter(Boolean);
    const leaderNames = leaderIds
      .map(id => empMap.get(id) || id)
      .filter(Boolean);

    // Top summary cards
    const core = document.querySelector("#card-core .kv");
    if (core) {
      const leaderText =
        leaderNames.length === 0 ? "-"
        : leaderNames.length === 1 ? leaderNames[0]
        : leaderNames.length === 2 ? `${leaderNames[0]}, ${leaderNames[1]}`
        : `${leaderNames[0]}, ${leaderNames[1]} +${leaderNames.length - 2} more`;

      const active = /^true$/i.test(String(squad["Active"]||"").trim());
      const category = squad["Category"] || "-";
      const created  = squad["Created Date"] || squad["Created"] || "";

      core.innerHTML = `
        <div><b>Name:</b> ${esc(squadName)}</div>
        <div><b>${leaderNames.length > 1 ? 'Leaders' : 'Leader'}:</b> ${esc(leaderText)}</div>
        <div><b>Status:</b> ${active ? '<span class="status-pill status-on">Active</span>' : '<span class="status-pill status-off">Inactive</span>'}</div>
        <div><b>Category:</b> ${esc(category)}</div>
        <div><b>Created:</b> ${created ? esc(created) : '-'}</div>
      `;
    }
    const obj = document.querySelector("#card-objective .kv");
    if (obj) obj.textContent = squad["Objective"] || "-";
    const notes = document.querySelector("#card-notes .kv");
    if (notes) notes.textContent = squad["Notes"] || "-";

    // Buttons (Back + Add Member) using your original logic/permissions
    wireBackButton();

    const me = session.get?.() || {};
    const myId = String(me.employeeId || "").trim();
    let canAdd = isAdmin;
    if (!canAdd) {
      canAdd = leaderRows.some(r => norm(r["Employee ID"]) === norm(myId));
    }
    wireAddMemberButton({ squadId, squadName, canAdd });

    // Members (compact)
    const showEmpId = isAdmin; // only admins see Emp ID col
    renderMembers(members, empMap, squadId, showEmpId);

    // Re-render after a member is added (your original event name)
    document.addEventListener("squad-member-added", async () => {
      const latest = await api.getRowsByTitle('SQUAD_MEMBERS', { force: true });
      renderMembers(latest, empMap, squadId, showEmpId);
    });
    // optional extra alias
    document.addEventListener("pu:squad-member-added", async () => {
      const latest = await api.getRowsByTitle('SQUAD_MEMBERS', { force: true });
      renderMembers(latest, empMap, squadId, showEmpId);
    });

    // Activities placeholder (non-breaking until sheet is wired)
    renderActivitiesPlaceholder();

    // Resize on load + window resize
    sizeMembersPanel();
    window.addEventListener('resize', sizeMembersPanel);
    // If fonts render after a tick, size again
    setTimeout(sizeMembersPanel, 150);
  }

  document.addEventListener("DOMContentLoaded", main);
})(window.PowerUp || (window.PowerUp = {}));
