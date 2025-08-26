// /scripts/tables.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  // === Column dictionaries (KEEPING YOUR FRIENDLY LABELS) ===
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

  // === Centralized filtering config (lists + which column to filter on) ===
  const FILTER_CONFIG = {
    ci: {
      selectId: "ci-filter",
      countId: "ci-count",
      friendlyHeader: "Status",    // filter column header (friendly)
      options: [
        "All",
        "Not Started",
        "Open",
        "Needs Researched",
        "Completed",
        "Denied/Cancelled"
      ],
      match(cellText, selected) {
        const t = (cellText || "").toLowerCase();
        const s = (selected || "").toLowerCase();
        if (s === "all") return true;
        if (s === "denied/cancelled") return /(denied|reject|cancel)/.test(t);
        if (s === "needs researched") return /needs\s*research/.test(t);
        // exact-ish contains for others
        return t.includes(s);
      }
    },
    safety: {
      selectId: "safety-filter",
      countId: "safety-count",
      friendlyHeader: "Safety Concern",
      options: [
        "All",
        "Hand tool in disrepair",
        "Machine in disrepair",
        "Electrical hazard",
        "Ergonomic",
        "Guarding missing",
        "Guarding in disrepair",
        "PPE missing",
        "PPE suggested improvement",
        "Missing GHS label",
        "Missing SDS"
      ],
      match(cellText, selected) {
        if ((selected || "").toLowerCase() === "all") return true;
        return (cellText || "").toLowerCase().trim() === (selected || "").toLowerCase().trim();
      }
    },
    quality: {
      selectId: "quality-filter",
      countId: "quality-count",
      friendlyHeader: "Area",
      options: [
        "All",
        "Assembly",
        "Customs",
        "Dip Line",
        "Fab",
        "Office",
        "Powder Coat",
        "Router",
        "Roto Mold",
        "SMF",
        "Welding"
      ],
      match(cellText, selected) {
        if ((selected || "").toLowerCase() === "all") return true;
        return (cellText || "").toLowerCase().trim() === (selected || "").toLowerCase().trim();
      }
    }
  };

  // === Helpers (KEEPING / UPDATING FORMATTERS) ===
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

  // ✓ / ✗ for boolean-ish values (used by Resourced + Paid)
  const boolMark = (v) => {
    const raw = String(v ?? "").trim().toLowerCase();
    if (raw === "") return "-";
    if (raw === "true" || raw === "yes" || raw === "paid" || raw === "1") {
      return `<span class="pill pill--green" title="Yes">✓</span>`;
    }
    if (raw === "false" || raw === "no" || raw === "0") {
      return `<span class="pill pill--red" title="No">✗</span>`;
    }
    // Unexpected values — show raw text (escaped)
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

    // Dates (handles "Submission Date", "Entry Date", etc.)
    if (t.includes("date")) return fmtDate(value);

    // Tokens — ensure only one "$" by stripping any existing symbols first
    if (t.includes("token")) {
      const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
      if (Number.isFinite(n)) return n !== 0 ? `$${n}` : "$0";
      return "-";
    }

    // Paid / Resourced — green ✓ or red ✗
    if (t === "paid" || t === "resourced") {
      return boolMark(value);
    }

    // Status / Approval — use colored pills
    if (t.includes("status") || t.includes("approval")) {
      return statusPill(value);
    }

    // Everything else
    const blank = value == null || String(value).trim() === "";
    return blank ? "-" : esc(value);
  }

  // === Render function with sorting (KEEPING YOUR PATTERN) ===
  function renderTable(tbody, rows, colMap, tableId) {
    if (!tbody) return;
    const cols = Object.keys(colMap);
    const friendly = Object.values(colMap);

    // Fill body
    const html = rows.map(r => {
      const tds = cols.map(c => {
        const raw = r[c];
        const val = format(c, raw);
        // For sorting, also store a normalized value
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

    // Fill header
    const thead = tbody.closest("table")?.querySelector("thead tr");
    if (thead) {
      thead.innerHTML = friendly.map(label => `<th>${label}</th>`).join("");
      // Bind sorting
      bindHeaderSort(thead, tbody);
    }
  }

  // === Sorting logic (KEEPING YOUR CODE) ===
  function bindHeaderSort(thead, tbody) {
    let state = { col: 0, asc: true };

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

        thead.querySelectorAll("th").forEach((h,i) => {
          h.removeAttribute("data-sort-dir");
          if (i === state.col) h.setAttribute("data-sort-dir", state.asc ? "asc" : "desc");
        });
      };
    });
  }

  // === Filtering (operates on rendered rows using friendly header to find the column) ===
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
      // run once
      applyFilterFor(kind);
    });
  }

  // === Main hydrate function (RENDERS + WIRE FILTERS + DISPATCH) ===
  ns.tables = ns.tables || {};
  ns.tables.hydrateDashboardTables = async function () {
    console.log("[tables] Hydrating dashboard tables…");

    const { employeeId } = ns.session.get();

    const [ciSheet, safetySheet, qualitySheet] = await Promise.all([
      fetchSheet(SHEETS.CI),
      fetchSheet(SHEETS.SAFETY),
      fetchSheet(SHEETS.QUALITY)
    ]);

    const filterMine = (rows) =>
      rows.filter(r => r["Employee ID"] === employeeId || r["Position ID"] === employeeId);

    const ciRows = filterMine(rowsByTitle(ciSheet));
    const safetyRows = filterMine(rowsByTitle(safetySheet));
    const qualityRows = filterMine(rowsByTitle(qualitySheet));

    renderTable(document.querySelector('[data-hook="table.ci.tbody"]'), ciRows, COL_MAP.ci, "ci-table");
    renderTable(document.querySelector('[data-hook="table.safety.tbody"]'), safetyRows, COL_MAP.safety, "safety-table");
    renderTable(document.querySelector('[data-hook="table.quality.tbody"]'), qualityRows, COL_MAP.quality, "quality-table");

    // Initial counts before filters
    const setCount = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${n} submission${n === 1 ? "" : "s"}`;
    };
    setCount("ci-count", ciRows.length);
    setCount("safety-count", safetyRows.length);
    setCount("quality-count", qualityRows.length);

    // Wire the dropdowns and apply filters once
    wireFilters();

    // Let the page know data is ready (your HTML listens for this)
    document.dispatchEvent(new Event('data-hydrated'));
  };

  // Optional: expose filter trigger
  ns.tables.applyFilterFor = applyFilterFor;

})(window.PowerUp);
