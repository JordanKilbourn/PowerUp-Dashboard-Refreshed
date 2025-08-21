// /scripts/tables.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS, Cache } = ns.api;

  const COLS = {
    ci: [
      "Submission Date","Submission ID","Problem Statements","Proposed Improvement",
      "CI Approval","Assigned To (Primary)","Status","Action Item Entry Date",
      "Last Meeting Action Item's","Resourced","Resourced Date","Token Payout","Paid"
    ],
    safety: [
      "Date","Department/Area","Safety Concern","Describe the safety concern",
      "Recommendations to correct/improve safety issue","Resolution",
      "Who was the safety concern escalated to","Leadership update",
      "Closed/Confirmed by- leadership only","Status"
    ],
    quality: ["Catch ID","Entry Date","Submitted By","Area","Quality Catch","Part Number","Description"]
  };

  // ---- formatting helpers ----
  const money = v => {
    const n = Number(String(v).replace(/[^0-9.-]/g,"") || 0);
    return Number.isFinite(n) && n !== 0 ? `$${n}` : (v ?? "");
  };
  const boolBadge = v => {
    const t = String(v ?? "").toLowerCase();
    if (t === "true" || t === "yes") return `<span class="pill pill--green">Yes</span>`;
    if (t === "false" || t === "no")  return `<span class="pill pill--gray">No</span>`;
    return v ?? "";
  };
  const dateish = v => (v ? new Date(v) : null);
  const fmtDate = v => {
    const d = dateish(v); if (!d || isNaN(d)) return v ?? "";
    return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
  };
  const statusPill = (text) => {
    if (!text) return "";
    const t = String(text).toLowerCase();
    let cls = "pill--gray";
    if (/approved|accepted|closed|complete/.test(t)) cls = "pill--green";
    else if (/pending|in ?progress|open|new/.test(t)) cls = "pill--blue";
    else if (/denied|rejected|not.*started|cancel/.test(t)) cls = "pill--red";
    return `<span class="pill ${cls}">${text}</span>`;
  };
  function formatCell(colTitle, value) {
    if (value == null) return "";
    const t = colTitle.toLowerCase();
    if (t.includes("date")) return fmtDate(value);
    if (t.includes("token")) return money(value);
    if (t === "paid") return boolBadge(value);
    if (t.includes("status") || t.includes("approval")) return statusPill(value);
    return value;
  }
  function sortKey(colTitle, rawValue) {
    const t = colTitle.toLowerCase();
    if (t.includes("date")) {
      const d = dateish(rawValue);
      return d && !isNaN(d) ? d.getTime() : -8.64e15;
    }
    const num = Number(String(rawValue).replace(/[^0-9.-]/g,""));
    if (!Number.isNaN(num) && String(rawValue).match(/[0-9]/)) return num;
    if (String(rawValue).toLowerCase() === "true") return 1;
    if (String(rawValue).toLowerCase() === "false") return 0;
    return String(rawValue || "").toLowerCase();
  }

  // 🔒 ID-only scoping
  function belongsToUser(row, employeeId) {
    const id = String(employeeId || "").trim();
    if (!id) return false;
    const a = String(row["Employee ID"] || "").trim();
    const b = String(row["Position ID"] || "").trim();
    return a === id || b === id;
  }

  // ----------- readability helpers (classes per column) -----------
  function getTableTypeFromTbody(tbody) {
    const id = tbody?.closest("table")?.id || "";
    if (id.startsWith("ci-")) return "ci";
    if (id.startsWith("safety-")) return "safety";
    if (id.startsWith("quality-")) return "quality";
    return "";
  }

  // returns a space-separated class list for a cell
  function cellClasses(type, idx /* 0-based */, title) {
    const t = title.toLowerCase();
    const cls = [];

    // general small utility columns
    const isDate = t.includes("date");
    const isId   = /id\b/i.test(title) && !/catch id/i.test(title); // treat "Catch ID" separately below
    const isStatus = t.includes("status") || t.includes("approval");
    if (isDate || isId) cls.push("nowrap","mono");
    if (isStatus) cls.push("t-center");

    // per-table specifics
    if (type === "ci") {
      if (idx === 0 || idx === 7 || idx === 10) cls.push("nowrap","mono"); // date-like
      if (idx === 1) cls.push("nowrap","t-center","mono");                  // Submission ID
      if (idx === 6) cls.push("t-center");                                  // Status
      if (idx === 9) cls.push("t-center");                                  // Resourced
      if (idx === 11) cls.push("nowrap","mono","t-right");                  // Tokens
      if (idx === 12) cls.push("t-center");                                 // Paid
      if (idx === 2) cls.push("clamp-3","cell-expandable");                 // Problem
      if (idx === 3) cls.push("clamp-3","cell-expandable");                 // Improvement
      if (idx === 8) cls.push("clamp-2","cell-expandable");                 // Last Action
    } else if (type === "safety") {
      if (idx === 0) cls.push("nowrap","mono");                             // Date
      if (idx === 2) cls.push("clamp-2","cell-expandable");                 // Safety Concern
      if (idx === 3) cls.push("clamp-3","cell-expandable");                 // Describe
      if (idx === 4) cls.push("clamp-3","cell-expandable");                 // Recommendations
      if (idx === 5) cls.push("clamp-2","cell-expandable");                 // Resolution
      if (idx === 6) cls.push("nowrap");                                    // Escalated To
      if (idx === 7) cls.push("clamp-2","cell-expandable");                 // Leadership
      if (idx === 8) cls.push("nowrap");                                    // Closed/Confirmed
      if (idx === 9) cls.push("t-center");                                  // Status
    } else if (type === "quality") {
      if (idx === 0) cls.push("nowrap","mono","t-center");                  // Catch ID
      if (idx === 1) cls.push("nowrap","mono");                             // Entry Date
      if (idx === 2) cls.push("nowrap");                                    // Submitted By
      if (idx === 4) cls.push("clamp-2","cell-expandable");                 // Quality Catch
      if (idx === 5) cls.push("nowrap");                                    // Part Number
      if (idx === 6) cls.push("clamp-3","cell-expandable");                 // Description
    }
    return cls.join(" ");
  }

  function enableClampClick(tbody) {
    if (!tbody) return;
    tbody.querySelectorAll(".cell-expandable").forEach(td => {
      // add full text to title once
      if (!td.title) td.title = td.textContent.trim();
      td.addEventListener("click", () => {
        td.classList.toggle("cell-expanded");
      }, { passive: true });
    });
  }

  // mark one sticky context column per table (index is 1-based)
  function markSticky(table, nth) {
    if (!table || !nth) return;
    const th = table.querySelector(`thead th:nth-child(${nth})`);
    if (th) th.classList.add("sticky-col");
    table.querySelectorAll(`tbody td:nth-child(${nth})`).forEach(td => td.classList.add("sticky-col"));
  }

  // ----------- render -----------
  function renderTbody(tbody, rows, columns) {
    if (!tbody) return;
    const type = getTableTypeFromTbody(tbody);

    const html = rows.map(r => {
      const tds = columns.map((col, i) => {
        const raw = r[col];
        const display = formatCell(col, raw);
        const key = sortKey(col, raw);
        const cls = cellClasses(type, i, col);
        const titleAttr = (cls.includes("clamp-") && typeof display === "string")
          ? ` title="${String(r[col] ?? "").replace(/"/g, '&quot;')}"`
          : "";
        return `<td class="${cls}" data-sort="${key}"${titleAttr}>${display}</td>`;
      }).join("");
      return `<tr>${tds}</tr>`;
    }).join("");

    tbody.innerHTML = html || `<tr><td colspan="${columns.length}" style="text-align:center;opacity:.7;">No rows</td></tr>`;

    // click-to-expand behavior for clamped cells
    enableClampClick(tbody);
  }

  function sortNewest(rows) {
    const dateCols = ["Submission Date","Entry Date","Date","Action Item Entry Date","Resourced Date","Created","Last Action"];
    return [...rows].sort((a,b) => {
      const getTime = (row) => {
        for (const c of dateCols) {
          if (row[c]) {
            const d = new Date(row[c]);
            if (!isNaN(d)) return d.getTime();
          }
        }
        return -8.64e15;
      };
      return getTime(b) - getTime(a);
    });
  }

  function bindHeaderSort(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    let state = { col: 0, asc: false };

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
          const bothNum = !Number.isNaN(na) && !Number.isNaN(nb);
          const cmp = bothNum ? (na - nb) : String(a).localeCompare(String(b));
          return state.asc ? cmp : -cmp;
        });
        rows.forEach(r => tbody.appendChild(r));
        thead.querySelectorAll("th").forEach((h,i) => {
          h.classList.toggle("sorted-asc", i === state.col && state.asc);
          h.classList.toggle("sorted-desc", i === state.col && !state.asc);
        });
      };
    });
  }

  function applyStatusDropdownFiltering(typeKey) {
    const select = document.getElementById(`${typeKey}-filter`);
    const table  = document.getElementById(`${typeKey}-table`);
    const tbody  = table?.querySelector("tbody");
    const count  = document.getElementById(`${typeKey}-count`);
    if (!select || !tbody) return;

    const run = () => {
      const v = (select.value || "all").toLowerCase();
      let visible = 0;
      Array.from(tbody.rows).forEach(tr => {
        const cells = Array.from(tr.cells).map(td => td.textContent.toLowerCase());
        const show = v === "all" || cells.some(text => text.includes(v));
        tr.style.display = show ? "" : "none";
        if (show) visible++;
      });
      if (count) count.textContent = `${visible} submission${visible === 1 ? "" : "s"}`;
    };

    select.onchange = run;
    run();
  }

  ns.hydrateDashboardTables = async function () {
    const { employeeId } = ns.session.get();

    const [ciSheet, safetySheet, qualitySheet] = await Promise.all([
      fetchSheet(SHEETS.CI),
      fetchSheet(SHEETS.SAFETY),
      fetchSheet(SHEETS.QUALITY)
    ]);
    const ciAll      = rowsByTitle(ciSheet);
    const safetyAll  = rowsByTitle(safetySheet);
    const qualityAll = rowsByTitle(qualitySheet);

    const mineCI      = ciAll.filter(r => belongsToUser(r, employeeId));
    const mineSafety  = safetyAll.filter(r => belongsToUser(r, employeeId));
    const mineQuality = qualityAll.filter(r => belongsToUser(r, employeeId));

    const ciView      = sortNewest(mineCI);
    const safetyView  = sortNewest(mineSafety);
    const qualityView = sortNewest(mineQuality);

    Cache.set("ci", ciAll); Cache.set("safety", safetyAll); Cache.set("quality", qualityAll);

    renderTbody(document.querySelector('[data-hook="table.ci.tbody"]'),      ciView,      COLS.ci);
    renderTbody(document.querySelector('[data-hook="table.safety.tbody"]'),  safetyView,  COLS.safety);
    renderTbody(document.querySelector('[data-hook="table.quality.tbody"]'), qualityView, COLS.quality);

    // Sticky context columns (1-based indices)
    markSticky(document.getElementById("ci-table"), 1);       // Submission Date
    markSticky(document.getElementById("safety-table"), 1);   // Date
    markSticky(document.getElementById("quality-table"), 2);  // Entry Date

    bindHeaderSort("ci-table"); bindHeaderSort("safety-table"); bindHeaderSort("quality-table");
    applyStatusDropdownFiltering("ci"); applyStatusDropdownFiltering("safety"); applyStatusDropdownFiltering("quality");

    const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = `${n} submission${n === 1 ? "" : "s"}`; };
    setCount("ci-count", ciView.length); setCount("safety-count", safetyView.length); setCount("quality-count", qualityView.length);
  };
})(window.PowerUp);
