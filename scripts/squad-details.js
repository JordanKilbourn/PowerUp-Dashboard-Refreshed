// scripts/squad-details.js
(function (P) {
  const { api, session, layout } = P;

  // ---------- utils ----------
  const qs = (k) => new URLSearchParams(location.search).get(k) || "";
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const norm = (s) => String(s || "").trim().toLowerCase();
  const isTrue = (v) => v === true || /^(true|yes|y|1|active)$/i.test(String(v ?? "").trim());
  const fmtMDYY = (v) => {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(+d)) return esc(v);
    const m = d.getMonth()+1, day = d.getDate(), y = (d.getFullYear()%100);
    return `${m}/${day}/${String(y).padStart(2,"0")}`;
  };
  const pick = (row, keys, d="") => {
    for (const k of keys) if (row && row[k] != null && String(row[k]).trim() !== "") return row[k];
    return d;
  };

  // ---------- data helpers ----------
  async function loadEmployeeMap() {
    const rows = await api.getRowsByTitle("EMPLOYEE_MASTER");
    const map = new Map();
    rows.forEach(r => {
      const id = (r["Position ID"] || r["Employee ID"] || "").toString().trim();
      const nm = (r["Display Name"] || r["Employee Name"] || r["Name"] || "").toString().trim();
      if (id) map.set(id, nm || id);
    });
    return map;
  }

  async function loadActivitiesForSquad(squadId, squadName) {
    if (!api.SHEETS || !api.SHEETS.SQUAD_ACTIVITIES) {
      return { items: [], configured: false, hoursByAct: new Map() };
    }
    const rows = await api.getRowsByTitle(api.SHEETS.SQUAD_ACTIVITIES);
    const items = rows.map(r => {
      const actId = pick(r, ["Activity ID","ID"], "").toString().trim();
      const squad = (r["Squad"] || r["Squad ID"] || r["Squad Name"] || "").toString().trim();
      const title = (r["Activity Title"] || r["Title"] || "").toString().trim();
      const type  = (r["Type"] || "").toString().trim() || "Other";
      const status= (r["Status"] || "").toString().trim() || "Planned";
      const start = r["Start Date"] || r["Start"] || "";
      const end   = r["End Date"] || r["Due Date"] || r["End"] || "";
      const owner = (r["Owner (Display Name)"] || r["Owner"] || "").toString().trim();
      if (!title) return null;
      const match = (norm(squad) === norm(squadId)) || (squadName && norm(squad) === norm(squadName));
      if (!match) return null;
      return { id: actId, title, type, status, start, end, owner };
    }).filter(Boolean);

    // Completed PH hours rollup
    const hoursByAct = new Map();
    try {
      const ph = await api.getRowsByTitle(api.SHEETS.POWER_HOURS);
      ph.forEach(r => {
        const actId = (r["Activity ID"] || r["Activity"] || "").toString().trim();
        if (!actId) return;
        const completed = isTrue(r["Completed"]);
        if (!completed) return;
        const hrs = Number(String(r["Completed Hours"] ?? r["Hours"] ?? "0").replace(/[^0-9.\-]/g,"") || 0);
        if (!Number.isFinite(hrs)) return;
        hoursByAct.set(actId, (hoursByAct.get(actId) || 0) + hrs);
      });
    } catch {}

    return { items, configured: true, hoursByAct };
  }

  // ---------- render: meta ----------
  function renderMeta(squadRow, leaderNames) {
    const squadName = squadRow["Squad Name"] || squadRow["Name"] || squadRow.id || "-";
    const statusPill = isTrue(squadRow["Active"])
      ? '<span class="pill pill--on">Active</span>'
      : '<span class="pill pill--off">Inactive</span>';

    const core = document.querySelector("#card-core .info-row");
    if (core) {
      // existing spans in the summary ribbon already have element IDs; just fill them
      document.getElementById("sqd-name").textContent    = squadName || "—";
      document.getElementById("sqd-leader").textContent  = (leaderNames.join(", ") || "—");
      document.getElementById("sqd-cat").textContent     = (squadRow["Category"] || "—");
      document.getElementById("sqd-created").textContent = fmtMDYY(squadRow["Created Date"] || squadRow["Created"] || "");
      const statusEl = document.getElementById("sqd-status");
      if (statusEl) statusEl.outerHTML = isTrue(squadRow["Active"])
        ? '<span id="sqd-status" class="pill pill--on">Active</span>'
        : '<span id="sqd-status" class="pill pill--off">Inactive</span>';
    }
    const obj = document.querySelector("#card-objective .kv");
    if (obj) obj.textContent = squadRow["Objective"] || "-";
    const notes = document.querySelector("#card-notes .kv");
    if (notes) notes.textContent = squadRow["Notes"] || "-";
  }

  // ---------- render: members ----------
  function renderMembers(allRows, empMap, squadId, isAdmin) {
    const rows = allRows.filter(r => norm(r["Squad ID"]) === norm(squadId));
    const tb = document.getElementById("members-tbody");
    const cnt = document.getElementById("members-count");
    if (!tb) return;

    tb.innerHTML = rows.map(r => {
      const eid   = String(r["Employee ID"] || "").trim();
      const name  = empMap.get(eid) || eid || "-";
      const role  = r["Role"] || "-";
      const active= isTrue(r["Active"]);
      const start = r["Start Date"] || r["Start"];
      return `
        <tr>
          <td>${esc(isAdmin ? `${name} — ${eid}` : name)}</td>
          <td>${esc(role)}</td>
          <td>${active ? '<span class="pill pill--on">Active</span>' : '<span class="pill pill--off">Inactive</span>'}</td>
          <td>${fmtMDYY(start)}</td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="4" style="opacity:.7;text-align:center;">No members yet</td></tr>`;

    if (cnt) cnt.textContent = String(rows.length);
  }

  // ---------- render: activities ----------
  function renderKpis(acts, hoursByAct) {
    const set = (id,val) => { const el = document.getElementById(id); if (el) el.textContent = String(val); };
    const lc = (s) => String(s||"").toLowerCase();

    // Active = anything NOT completed/done (counts Not Started, Planned, In Progress, Blocked, etc.)
    const isCompleted = (s) => /done|complete/i.test(s || "");
    set("kpi-active",  acts.filter(a => !isCompleted(a.status)).length);
    set("kpi-planned", acts.filter(a => /plan/i.test(lc(a.status))).length);
    set("kpi-done",    acts.filter(a => isCompleted(a.status)).length);
    set("kpi-hours",   acts.reduce((sum,a)=> sum+(hoursByAct.get(a.id)||0), 0));
  }

  function renderActivities(acts, hoursByAct, configured) {
    const tb = document.getElementById("activities-tbody");
    if (!tb) return;

    if (!configured) {
      tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;">
        Activities sheet isn’t configured (SHEETS.SQUAD_ACTIVITIES). This panel is read-only until you add it.
      </td></tr>`;
      return;
    }
    if (!acts.length) {
      tb.innerHTML = `<tr><td colspan="7" style="opacity:.75;padding:12px;text-align:center">
        No activities found for this squad.
      </td></tr>`;
      return;
    }

    tb.innerHTML = acts.map(a => {
      const range = `${fmtMDYY(a.start)} — ${fmtMDYY(a.end)}`;
      const hrs   = hoursByAct.get(a.id) || 0;
      const lastCell = /complete|done/i.test(a.status)
        ? `<button class="btn small ghost" data-act="${esc(a.id)}" data-action="view">View</button>`
        : `<button class="btn small ghost" data-act="${esc(a.id)}" data-action="log-ph">Log Hour</button>`;

      return `
        <tr>
          <td>${esc(a.title)}</td>
          <td><span class="pill">${esc(a.status || "-")}</span></td>
          <td><span class="pill">${esc(a.type || "-")}</span></td>
          <td>${range}</td>
          <td>${esc(a.owner || "-")}</td>
          <td style="text-align:right">${hrs}</td>
          <td style="text-align:right">${lastCell}</td>
        </tr>
      `;
    }).join("");

    // wire buttons (Log Hour / View)
    tb.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const actId = btn.getAttribute('data-act') || '';
        const action = btn.getAttribute('data-action');
        if (action === 'log-ph') {
          if (P.PowerHours && typeof P.PowerHours.open === 'function') {
            P.PowerHours.open({ activityId: actId });
          } else {
            location.href = `power-hours.html?activityId=${encodeURIComponent(actId)}`;
          }
        } else {
          // a placeholder for a future view details screen
          alert('Activity details not implemented yet.');
        }
      });
    });
  }

  // ---------- dependent filters ----------
  function buildActFilterValues(acts, col, selEl) {
    if (!selEl) return;
    selEl.innerHTML = '<option value="">All values</option>';
    if (!col) { selEl.disabled = true; return; }
    const vals = new Set();
    acts.forEach(a => {
      const v = (a[col] || "").toString().trim();
      if (v) vals.add(v);
    });
    [...vals].sort((a,b)=>a.localeCompare(b)).forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      selEl.appendChild(opt);
    });
    selEl.disabled = false;
  }

  function applyDependentFilters(allActs, hoursByAct, configured) {
    const col = document.getElementById('act-col')?.value || "";
    const val = document.getElementById('act-val')?.value || "";

    const filtered = allActs.filter(a => {
      if (!col || !val) return true;
      return (a[col] || "").toString().trim().toLowerCase() === val.toLowerCase();
    });

    renderKpis(filtered, hoursByAct);
    renderActivities(filtered, hoursByAct, configured);
  }

  // ---------- controls ----------
  function wireBackButton() {
    const btn = document.getElementById("btn-back");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (history.length > 1) history.back();
      else location.href = "squads.html";
    });
  }

  function wireAddMemberButton({ canAdd, squadId, squadName }) {
    const btn = document.getElementById("btn-addmember");
    if (!btn) return;

    btn.hidden = !canAdd;
    btn.disabled = !canAdd;

    const handler = (e) => {
      e.preventDefault();
      if (P.squadForm && typeof P.squadForm.open === "function") {
        P.squadForm.open({ squadId, squadName });
      } else {
        alert("Member form not found. Please include scripts/squad-member-form.js earlier on the page.");
      }
    };

    if (btn._amHandler) btn.removeEventListener("click", btn._amHandler);
    btn._amHandler = handler;
    btn.addEventListener("click", handler);
  }

  // ---------- main ----------
  document.addEventListener("DOMContentLoaded", async () => {
    layout.injectLayout?.();
    await session.initHeader?.();

    const urlId = qs("id") || qs("squadId") || qs("squad");
    if (!urlId) {
      layout.setPageTitle?.("Squad: (unknown)");
      return;
    }

    // Admin check
    const isAdmin = !!(P.auth && typeof P.auth.isAdmin === "function" && P.auth.isAdmin());

    // Load base data
    const [squads, members, empMap] = await Promise.all([
      api.getRowsByTitle("SQUADS", { force: true }),
      api.getRowsByTitle("SQUAD_MEMBERS", { force: true }),
      loadEmployeeMap()
    ]);

    // find squad (by id or name)
    const sidLC = norm(urlId);
    const squadRow =
      squads.find(r => norm(r["Squad ID"]) === sidLC) ||
      squads.find(r => norm(r["Squad Name"]) === sidLC) ||
      null;
    if (!squadRow) {
      layout.setPageTitle?.("Squad: Not Found");
      return;
    }

    const squadId   = (squadRow["Squad ID"] || urlId).toString().trim();
    const squadName = (squadRow["Squad Name"] || squadRow["Name"] || "").toString().trim();
    layout.setPageTitle?.(`Squad: ${squadName || squadId}`);

    // leaders (from SQUAD_MEMBERS)
    const leaderIds = members
      .filter(r => norm(r["Squad ID"]) === norm(squadId) && norm(r["Role"]) === "leader" && isTrue(r["Active"]))
      .map(r => (r["Employee ID"] || "").toString().trim())
      .filter(Boolean);
    const leaderNames = leaderIds.map(id => empMap.get(id) || id);

    // meta cards
    renderMeta({ ...squadRow, id: squadId }, leaderNames);

    // members
    renderMembers(members, empMap, squadId, isAdmin);
    document.addEventListener("squad-member-added", async () => {
      const latest = await api.getRowsByTitle("SQUAD_MEMBERS", { force: true });
      renderMembers(latest, empMap, squadId, isAdmin);
    });

    // permissions for add member
    const me = session.get?.() || {};
    const userId = (me.employeeId || "").trim().toLowerCase();
    const canAdd = isAdmin || leaderIds.some(id => id.toLowerCase() === userId);
    wireAddMemberButton({ canAdd, squadId, squadName });
    wireBackButton();

    // activities (load once; filters render from this)
    const { items: acts, configured, hoursByAct } =
      await loadActivitiesForSquad(squadId, squadName);
    renderKpis(acts, hoursByAct);
    renderActivities(acts, hoursByAct, configured);

    // dependent filters
    const colSel = document.getElementById('act-col');
    const valSel = document.getElementById('act-val');

    colSel?.addEventListener('change', () => {
      buildActFilterValues(acts, colSel.value, valSel);
      applyDependentFilters(acts, hoursByAct, configured);
    });
    valSel?.addEventListener('change', () => {
      applyDependentFilters(acts, hoursByAct, configured);
    });

    // Add Activity (kept as before)
    const addActBtn = document.getElementById("btn-add-activity");
    if (addActBtn) {
      if (isAdmin || canAdd) {
        addActBtn.disabled = false;
        addActBtn.addEventListener("click", (e) => {
          e.preventDefault();
          if (P.activities && typeof P.activities.openCreate === "function") {
            P.activities.openCreate({ squadId, squadName });
          } else {
            alert("Activity form not wired yet. Expose P.activities.openCreate({ squadId, squadName }) when ready.");
          }
        });
      } else {
        addActBtn.disabled = true;
      }
    }
  });
})(window.PowerUp || (window.PowerUp = {}));
