// /scripts/tables.js
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

  // === Helpers ===
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const fmtDate = (v) => {
    if (!v) return "";
    const d = new Date(v);
    return isNaN(d) ? String(v) : 
      `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
  };

  const boolBadge = (v) => {
    const t = String(v).toLowerCase();
    if (t === "true" || t === "yes" || t === "paid") return `<span class="pill pill--green">Yes</span>`;
    if (t === "false" || t === "no") return `<span class="pill pill--gray">No</span>`;
    return esc(v);
  };

  const statusPill = (v) => {
    if (!v) return "";
    const t = String(v).toLowerCase();
    if (/approved|accepted|closed|complete/.test(t)) return `<span class="pill pill--green">${esc(v)}</span>`;
    if (/pending|progress|open|new/.test(t)) return `<span class="pill pill--blue">${esc(v)}</span>`;
    if (/denied|rejected|cancel/.test(t)) return `<span class="pill pill--red">${esc(v)}</span>`;
    return esc(v);
  };

  function format(col, value) {
    const t = col.toLowerCase();
    if (t.includes("date")) return fmtDate(value);
    if (t.includes("token")) return value ? `$${value}` : "";
    if (t === "paid") return boolBadge(value);
    if (t.includes("status") || t.includes("approval")) return statusPill(value);
    return esc(value ?? "");
  }

  // === Render function with sorting ===
  function renderTable(tbody, rows, colMap, tableId) {
    if (!tbody) return;
    const cols = Object.keys(colMap);

    // Fill body
    const html = rows.map(r => {
      const tds = cols.map(c => {
        const val = format(c, r[c]);
        // For sorting, also store a normalized value
        let sortVal = (r[c] ?? "").toString().toLowerCase();
        if (c.toLowerCase().includes("date")) {
          const d = new Date(r[c]);
          sortVal = isNaN(d) ? "" : d.getTime();
        }
        return `<td data-sort="${sortVal}">${val}</td>`;
      }).join("");
      return `<tr>${tds}</tr>`;
    }).join("");

    tbody.innerHTML = html || `<tr><td colspan="${cols.length}" style="text-align:center;opacity:.7;">No rows</td></tr>`;

    // Fill header
    const thead = tbody.closest("table")?.querySelector("thead tr");
    if (thead) {
      thead.innerHTML = Object.values(colMap)
        .map(label => `<th>${label}</th>`).join("");

      // Bind sorting
      bindHeaderSort(thead, tbody);
    }
  }

  // === Sorting logic ===
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

  // === Main hydrate function ===
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

    // Auto row counts
    const setCount = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${n} submission${n === 1 ? "" : "s"}`;
    };
    setCount("ci-count", ciRows.length);
    setCount("safety-count", safetyRows.length);
    setCount("quality-count", qualityRows.length);
  };
})(window.PowerUp);
