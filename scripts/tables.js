// DROP-IN REPLACEMENT
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  // === Column dictionaries ===
  const COL_MAP = {
    ci: {
      "Submission Date": "Submitted",
      "Submission ID": "ID",
      "Problem Statements": "Problem",
      "Proposed Improvement": "Improvement",
      "CI Approval": "Approval",
      "Assigned To (Primary)": "Assigned",
      "Status": "Status",
      "Action Item Entry Date": "Action Entered",
      "Last Meeting Action Item's": "Last Action",
      "Resourced": "Resourced",
      "Resourced Date": "Resourced On",
      "Token Payout": "Tokens",
      "Paid": "Paid"
    },
    safety: {
      "Date": "Date",
      "Department/Area": "Dept/Area",
      "Safety Concern": "Safety Concern",
      "Describe the safety concern": "Description",
      "Recommendations to correct/improve safety issue": "Recommendations",
      "Resolution": "Resolution",
      "Who was the safety concern escalated to": "Escalated To",
      "Leadership update": "Leadership Update",
      "Closed/Confirmed by- leadership only": "Closed/Confirmed",
      "Status": "Status"
    },
    quality: {
      "Catch ID": "Catch ID",
      "Entry Date": "Entry Date",
      "Submitted By": "Submitted By",
      "Area": "Area",
      "Quality Catch": "Quality Catch",
      "Part Number": "Part Number",
      "Description": "Description"
    }
  };

  // === Filter dropdowns (unchanged) ===
  const FILTER_CONFIG = {
    ci: {
      selectId: "ci-filter",
      countId: "ci-count",
      friendlyHeader: "Status",
      options: ["All","Not Started","Open","Needs Researched","Completed","Denied/Cancelled"],
      match(cellText, selected) {
        const t = (cellText || "").toLowerCase();
        const s = (selected || "").toLowerCase();
        if (s === "all") return true;
        if (s === "denied/cancelled") return /(denied|reject|cancel)/.test(t);
        if (s === "needs researched") return /needs\s*research/.test(t);
        return t.includes(s);
      }
    },
    safety: {
      selectId: "safety-filter",
      countId: "safety-count",
      friendlyHeader: "Safety Concern",
      options: ["All","Hand tool in disrepair","Machine in disrepair","Electrical hazard","Ergonomic","Guarding missing","Guarding in disrepair","PPE missing","PPE suggested improvement","Missing GHS label","Missing SDS"],
      match(cellText, selected) {
        if ((selected || "").toLowerCase() === "all") return true;
        return (cellText || "").toLowerCase().trim() === (selected || "").toLowerCase().trim();
      }
    },
    quality: {
      selectId: "quality-filter",
      countId: "quality-count",
      friendlyHeader: "Area",
      options: ["All","Assembly","Customs","Dip Line","Fab","Office","Powder Coat","Router","Roto Mold","SMF","Welding"],
      match(cellText, selected) {
        if ((selected || "").toLowerCase() === "all") return true;
        return (cellText || "").toLowerCase().trim() === (selected || "").toLowerCase().trim();
      }
    }
  };

  // === Helpers ===
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const fmtDate = (v) => {
    if (v == null || String(v).trim() === "") return "-";
    const d = new Date(v);
    return isNaN(d) ? "-" : `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
  };
  const boolMark = (v) => {
    const raw = String(v ?? "").trim().toLowerCase();
    if (raw === "") return "-";
    if (v === true || raw === "true" || raw === "yes" || raw === "paid") return `<span class="pill pill--green" title="Yes">✓</span>`;
    if (v === false || raw === "false" || raw === "no") return `<span class="pill pill--red" title="No">✗</span>`;
    return esc(v);
  };
  const statusPill = (v) => {
    if (v == null || String(v).trim() === "") return "-";
    const t = String(v).toLowerCase();
    if (/approved|accepted|closed|complete/.test(t)) return `<span class="pill pill--green">${esc(v)}</span>`;
    if (/pending|progress|open|new/.test(t))        return `<span class="pill pill--blue">${esc(v)}</span>`;
    if (/denied|rejected|cancel/.test(t))           return `<span class="pill pill--red">${esc(v)}</span>`;
    return esc(v);
  };
  function format(col, value) {
    const t = String(col || "").toLowerCase();
    if (t.includes("date")) return fmtDate(value);
    if (t.includes("token")) {
      const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? `$${n}` : "-";
    }
    if (t === "paid" || t === "resourced") return boolMark(value);
    if (t.includes("status") || t.includes("approval")) return statusPill(value);
    const blank = value == null || String(value).trim() === "";
    return blank ? "-" : esc(value);
  }

  // --- Admin target resolution ---
  async function getAdminTarget() {
    try {
      const sel = (sessionStorage.getItem('pu.adminEmployeeFilter') || '').trim();
      if (!sel || sel === '__ALL__') return null; // << All Employees = no target
      const em = await ns.api.getRowsByTitle(ns.api.SHEETS.EMPLOYEE_MASTER);
      const norm = (s) => String(s||'').trim().toLowerCase();
      const row = em.find(r => norm(r['Display Name']||r['Employee Name']||r['Name']) === norm(sel));
      if (!row) return { id: '', name: sel };
      const id = String(row['Position ID'] || row['Employee ID'] || '').trim();
      return { id, name: sel };
    } catch { return null; }
  }

  function matchesEmployee(row, target) {
    // If no target => ALL employees (no filtering)
    if (!target || (!target.id && !target.name)) return true;
    const norm = (s) => String(s||'').trim().toLowerCase();
    const rid  = norm(row['Employee ID']);
    const rpid = norm(row['Position ID']);
    const rname= norm(row['Submitted By'] || row['Employee Name'] || row['Name']);
    const idLC = norm(target.id);
    const nameLC = norm(target.name);
    return (idLC && (rid === idLC || rpid === idLC)) || (nameLC && rname === nameLC);
  }

  async function resolveTargetEmployee() {
    const me = ns.session.get() || {};
    const isAdmin = !!(ns.auth && ns.auth.isAdmin && ns.auth.isAdmin());
    if (!isAdmin) return { id: String(me.employeeId||'').trim(), name: String(me.displayName||'').trim() };
    const picked = await getAdminTarget(); // may be null (ALL)
    return picked || null; // null means ALL employees
  }

  // === Render + sort ===
  function renderTable(tbody, rows, colMap, tableId, empNameById) {
    if (!tbody) return;
    const cols = Object.keys(colMap);
    const friendly = Object.values(colMap);

    const html = rows.map(r => {
      const tds = cols.map(c => {
        if (c === "__EMP_NAME__") {
          const idRaw = String(r["Employee ID"] || r["Position ID"] || "").trim();
          const by = String(r["Submitted By"] || r["Employee Name"] || r["Name"] || "").trim();
          const name = (idRaw && empNameById && empNameById.get(idRaw.toLowerCase())) || by || (idRaw || "-");
          return `<td data-sort="${(name||'').toString().toLowerCase()}">${esc(name)}</td>`;
        }
        const raw = r[c];
        const val = format(c, raw);
        let sortVal = (raw ?? "").toString().toLowerCase();
        if (c.toLowerCase().includes("date")) {
          const d = new Date(raw);
          sortVal = isNaN(d) ? "" : d.getTime();
        } else if (c.toLowerCase().includes("token")) {
          const n = Number(String(raw).replace(/[^0-9.\-]/g, ""));
          sortVal = Number.isFinite(n) ? String(n) : "";
        }
        return `<td data-sort="${sortVal}">${val}</td>`;
      }).join("");
      return `<tr>${tds}</tr>`;
    }).join("");

    tbody.innerHTML = html || `<tr><td colspan="${cols.length}" style="text-align:center;opacity:.7;">No rows</td></tr>`;

    const thead = tbody.closest("table")?.querySelector("thead tr");
    if (thead) {
      thead.innerHTML = friendly.map(label => `<th>${label}</th>`).join("");
      bindHeaderSort(thead, tbody);
    }
  }

  function bindHeaderSort(thead, tbody) {
    let state = { col: 0, asc: true };
    const applyIndicators = () => {
      thead.querySelectorAll("th").forEach((h, i) => {
        h.setAttribute("data-sort", "none");
        h.removeAttribute("aria-sort");
        if (i === state.col) {
          h.setAttribute("data-sort", state.asc ? "asc" : "desc");
          h.setAttribute("aria-sort", state.asc ? "ascending" : "descending");
        }
      });
    };
    thead.querySelectorAll("th").forEach((th, idx) => {
      th.style.cursor = "pointer";
      th.onclick = () => {
        state.asc = state.col === idx ? !state.asc : true;
        state.col = idx;
        const rows = Array.from(tbody.querySelectorAll("tr"));
        rows.sort((ra, rb) => {
          const a = ra.children[idx]?.getAttribute("data-sort") ?? "";
          const b = rb.children[idx]?.getAttribute("data-sort") ?? "";
          const na = Number(a), nb = Number(b);
          const bothNum = !isNaN(na) && !isNaN(nb);
          const cmp = bothNum ? (na - nb) : a.localeCompare(b);
          return state.asc ? cmp : -cmp;
        });
        rows.forEach(r => tbody.appendChild(r));
        applyIndicators();
      };
    });
    applyIndicators();
  }

  // === Filters ===
  function findHeaderIndexByText(tableEl, friendlyHeader) {
    const ths = tableEl?.querySelectorAll('thead th');
    if (!ths) return -1;
    const needle = String(friendlyHeader || "").toLowerCase().trim();
    for (let i = 0; i < ths.length; i++) {
      const txt = (ths[i].textContent || "").toLowerCase().trim();
      if (txt === needle) return i;
    }
    return -1;
  }
  function updateCount(countId, tableEl) {
    const tbody = tableEl?.querySelector('tbody');
    if (!tbody) return;
    const visible = Array.from(tbody.rows)
      .filter(tr => tr.style.display !== 'none' && tr.children.length > 1).length;
    const el = document.getElementById(countId);
    if (el) el.textContent = `${visible} submission${visible === 1 ? "" : "s"}`;
  }
  function repopulateSelect(selectEl, options) {
    if (!selectEl) return;
    const current = selectEl.value;
    selectEl.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join("");
    selectEl.value = options.includes(current) ? current : options[0];
  }
  function applyFilterFor(kind) {
    const cfg = FILTER_CONFIG[kind];
    if (!cfg) return;
    const tableEl = document.getElementById(`${kind}-table`);
    const selectEl = document.getElementById(cfg.selectId);
    if (!tableEl || !selectEl) return;
    const colIdx = findHeaderIndexByText(tableEl, cfg.friendlyHeader);
    const tbody = tableEl.querySelector('tbody');
    if (colIdx < 0 || !tbody) return;
    const selected = selectEl.value || "";
    Array.from(tbody.rows).forEach(tr => {
      if (tr.children.length <= colIdx) { tr.style.display = ""; return; }
      const cellText = (tr.children[colIdx]?.textContent || "");
      tr.style.display = cfg.match(cellText, selected) ? "" : "none";
    });
    updateCount(cfg.countId, tableEl);
  }
  function wireFilters() {
    Object.entries(FILTER_CONFIG).forEach(([kind, cfg]) => {
      const selectEl = document.getElementById(cfg.selectId);
      if (selectEl) {
        repopulateSelect(selectEl, cfg.options);
        if (!selectEl.dataset.bound) {
          selectEl.dataset.bound = "1";
          selectEl.addEventListener("change", () => applyFilterFor(kind));
        }
      }
      applyFilterFor(kind);
    });
  }

  // === Main hydrate ===
  ns.tables = ns.tables || {};
  ns.tables.hydrateDashboardTables = async function () {
    const target = await resolveTargetEmployee(); // {id,name} or null for ALL
    const isAdmin = !!(ns.auth && ns.auth.isAdmin && ns.auth.isAdmin());

    const [ciSheet, safetySheet, qualitySheet] = await Promise.all([
      fetchSheet(SHEETS.CI),
      fetchSheet(SHEETS.SAFETY),
      fetchSheet(SHEETS.QUALITY)
    ]);
    const ciRowsAll      = rowsByTitle(ciSheet);
    const safetyRowsAll  = rowsByTitle(safetySheet);
    const qualityRowsAll = rowsByTitle(qualitySheet);

    const ciRows      = ciRowsAll.filter(r => matchesEmployee(r, target));
    const safetyRows  = safetyRowsAll.filter(r => matchesEmployee(r, target));
    const qualityRows = qualityRowsAll.filter(r => matchesEmployee(r, target));

    // id -> display name map (for admin synthetic column)
    let empNameById;
    if (isAdmin) {
      empNameById = new Map();
      try {
        const em = await ns.api.getRowsByTitle(ns.api.SHEETS.EMPLOYEE_MASTER);
        em.forEach(r => {
          const id = String(r['Position ID'] || r['Employee ID'] || '').trim();
          const nm = String(r['Display Name'] || r['Employee Name'] || r['Name'] || '').trim();
          if (id) empNameById.set(id.toLowerCase(), nm);
        });
      } catch {}
    }

    function withAdminEmployeeCol(mapObj) {
      if (!isAdmin) return mapObj;
      const friendly = Object.values(mapObj).map(v => String(v).toLowerCase());
      if (friendly.includes('submitted by') || friendly.includes('employee') || friendly.includes('name')) return mapObj;
      return Object.assign({ "__EMP_NAME__": "Employee" }, mapObj);
    }
    const ciMapWithEmp     = withAdminEmployeeCol(Object.assign({}, COL_MAP.ci));
    const safetyMapWithEmp = withAdminEmployeeCol(Object.assign({}, COL_MAP.safety));
    const qualityMap       = Object.assign({}, COL_MAP.quality);

    renderTable(document.querySelector('[data-hook="table.ci.tbody"]'), ciRows, ciMapWithEmp, "ci-table", empNameById);
    renderTable(document.querySelector('[data-hook="table.safety.tbody"]'), safetyRows, safetyMapWithEmp, "safety-table", empNameById);
    renderTable(document.querySelector('[data-hook="table.quality.tbody"]'), qualityRows, qualityMap, "quality-table", empNameById);

    const setCount = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${n} submission${n === 1 ? "" : "s"}`;
    };
    setCount("ci-count", ciRows.length);
    setCount("safety-count", safetyRows.length);
    setCount("quality-count", qualityRows.length);

    wireFilters();
    document.dispatchEvent(new Event('data-hydrated'));
  };

  ns.tables.applyFilterFor = (kind) => {
    if (FILTER_CONFIG[kind]) applyFilterFor(kind);
  };

  // Live rehydrate when admin changes employee filter
  document.addEventListener('powerup-admin-filter-change', () => {
    ns.tables.hydrateDashboardTables().catch(console.error);
  });

})(window.PowerUp);
