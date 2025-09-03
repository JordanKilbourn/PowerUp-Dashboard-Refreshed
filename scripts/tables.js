
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

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

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const fmtDate = (v) => {
    if (v == null || String(v).trim() === "") return "-";
    const d = new Date(v);
    return isNaN(d)
      ? "-"
      : `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
  };

  const boolMark = (v) => {
    const raw = String(v ?? "").trim().toLowerCase();
    if (raw === "") return "-";
    if (v === true || raw === "true" || raw === "yes" || raw === "paid") {
      return `<span class="pill pill--green" title="Yes">✓</span>`;
    }
    if (v === false || raw === "false" || raw === "no") {
      return `<span class="pill pill--red" title="No">✗</span>`;
    }
    return esc(v);
  };

  const statusPill = (v) => {
    if (v == null || String(v).trim() === "") return "-";
    const t = String(v).toLowerCase();
    if (/approved|accepted|closed|complete/.test(t)) return `<span class="pill pill--green">${esc(v)}</span>`;
    if (/pending|progress|open|new/.test(t)) return `<span class="pill pill--blue">${esc(v)}</span>`;
    if (/denied|rejected|cancel/.test(t)) return `<span class="pill pill--red">${esc(v)}</span>`;
    return esc(v);
  };

  function format(col, value) {
    const t = String(col || "").toLowerCase();
    if (t.includes("date")) return fmtDate(value);
    if (t.includes("token")) {
      const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
      if (Number.isFinite(n)) return n !== 0 ? `$${n}` : "$0";
      return "-";
    }
    if (t === "paid" || t === "resourced") return boolMark(value);
    if (t.includes("status") || t.includes("approval")) return statusPill(value);
    const blank = value == null || String(value).trim() === "";
    return blank ? "-" : esc(value);
  }

  function renderTable(tbody, rows, colMap) {
    if (!tbody) return;
    const cols = Object.keys(colMap);
    const friendly = Object.values(colMap);

    const html = rows.map(r => {
      const tds = cols.map(c => {
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

  // ---------- NEW: Admin-aware fetch + render ------------------
  let __cache = { ci: [], safety: [], quality: [] };

  function nameColsFor(kind) {
    // Which columns could hold a display name for admin filtering
    // We pass these into roles.maybeFilterByEmployee to match the admin dropdown.
    const COMMON = ["Display Name","Employee Name","Name","Submitted By"];
    if (kind === 'ci') return COMMON.concat(["Assigned To (Primary)"]);
    if (kind === 'quality') return COMMON;
    if (kind === 'safety') return COMMON;
    return COMMON;
  }

  async function loadAllFor(kind, sheetId) {
    const raw = await fetchSheet(sheetId);
    return rowsByTitle(raw);
  }

  async function hydrateDashboardTables() {
    console.log("[tables] Hydrating dashboard tables…");

    const isAdmin = !!(ns.auth && ns.auth.isAdmin && ns.auth.isAdmin());
    const { employeeId } = ns.session.get();

    const [ciAll, safetyAll, qualityAll] = await Promise.all([
      loadAllFor('ci', SHEETS.CI),
      loadAllFor('safety', SHEETS.SAFETY),
      loadAllFor('quality', SHEETS.QUALITY)
    ]);

    if (isAdmin) {
      // Admins see everything; apply optional admin employee filter
      __cache.ci      = ns.auth.maybeFilterByEmployee(ciAll,      nameColsFor('ci'));
      __cache.safety  = ns.auth.maybeFilterByEmployee(safetyAll,  nameColsFor('safety'));
      __cache.quality = ns.auth.maybeFilterByEmployee(qualityAll, nameColsFor('quality'));
    } else {
      const mine = (rows) => rows.filter(r => r["Employee ID"] === employeeId || r["Position ID"] === employeeId);
      __cache.ci      = mine(ciAll);
      __cache.safety  = mine(safetyAll);
      __cache.quality = mine(qualityAll);
    }

    renderTable(document.querySelector('[data-hook="table.ci.tbody"]'),      __cache.ci,      COL_MAP.ci);
    renderTable(document.querySelector('[data-hook="table.safety.tbody"]'),  __cache.safety,  COL_MAP.safety);
    renderTable(document.querySelector('[data-hook="table.quality.tbody"]'), __cache.quality, COL_MAP.quality);

    const setCount = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${n} submission${n === 1 ? "" : "s"}`;
    };
    setCount("ci-count",      __cache.ci.length);
    setCount("safety-count",  __cache.safety.length);
    setCount("quality-count", __cache.quality.length);

    wireFilters();
    document.dispatchEvent(new Event('data-hydrated'));
  }

  // Re-apply admin employee filter when dropdown changes (no refetch)
  document.addEventListener('powerup-admin-filter-change', () => {
    if (!__cache.ci.length && !__cache.safety.length && !__cache.quality.length) return;
    const isAdmin = !!(ns.auth && ns.auth.isAdmin && ns.auth.isAdmin());
    if (!isAdmin) return;

    const refilter = (rows, kind) => ns.auth.maybeFilterByEmployee(rows, nameColsFor(kind));

    const ciRows      = refilter(__cache.ci,      'ci');
    const safetyRows  = refilter(__cache.safety,  'safety');
    const qualityRows = refilter(__cache.quality, 'quality');

    renderTable(document.querySelector('[data-hook="table.ci.tbody"]'),      ciRows,      COL_MAP.ci);
    renderTable(document.querySelector('[data-hook="table.safety.tbody"]'),  safetyRows,  COL_MAP.safety);
    renderTable(document.querySelector('[data-hook="table.quality.tbody"]'), qualityRows, COL_MAP.quality);

    const setCount = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${n} submission${n === 1 ? "" : "s"}`;
    };
    setCount("ci-count",      ciRows.length);
    setCount("safety-count",  safetyRows.length);
    setCount("quality-count", qualityRows.length);

    wireFilters();
  });

  ns.tables = ns.tables || {};
  ns.tables.hydrateDashboardTables = hydrateDashboardTables;
  ns.tables.applyFilterFor = applyFilterFor;

})(window.PowerUp);

