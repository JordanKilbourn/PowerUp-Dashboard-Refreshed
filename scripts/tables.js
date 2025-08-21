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
    return Number.isFinite(n) && n !== 0 ? `$${n}` : (v || "");
  };
  const boolBadge = v => {
    const t = String(v).toLowerCase();
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

  // Class/tooltip helper for readability
  function cellClasses(typeKey, colTitle) {
    const t = colTitle.toLowerCase();

    // short numeric/id/date-ish
    if (/(^id$|token|paid$|catch id|entry date|resourced on|action item entry date)/.test(t))
      return "nowrap mono";

    // align center for some status booleans/labels
    if (/(status$|approval$|resourced$)/.test(t))
      return "t-center";

    // long text columns: clamp to 3 lines, expand on hover
    if (
      /problem|improvement|last meeting|describe|recommendations|resolution|leadership|quality catch|description/.test(t)
    ) return "clip clip-3";

    return "";
  }

  function renderTbody(tbody, rows, columns, typeKey) {
    if (!tbody) return;
    const html = rows.map(r => {
      const tds = columns.map(col => {
        const raw = r[col];
        const display = formatCell(col, raw);
        const key = sortKey(col, raw);
        const cls = cellClasses(typeKey, col);
        // Title shows full text on hover (esp. for clipped cells)
        const titleAttr = (cls.includes("clip") && raw) ? ` title="${String(raw).replace(/"/g,'&quot;')}"` : "";
        return `<td class="${cls}" data-sort="${key}"${titleAttr}>${display}</td>`;
      }).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
    tbody.innerHTML = html || `<tr><td colspan="${columns.length}" style="text-align:center;opacity:.7;">No rows</td></tr>`;
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

  function applyStatusDropdownFiltering(type) {
    const select = document.getElementById(`${type}-filter`);
    const table  = document.getElementById(`${type}-table`);
    const tbody  = table?.querySelector("tbody");
    const count  = document.getElementById(`${type}-count`);
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

    renderTbody(document.querySelector('[data-hook="table.ci.tbody"]'),      ciView,      COLS.ci,      "ci");
    renderTbody(document.querySelector('[data-hook="table.safety.tbody"]'),  safetyView,  COLS.safety,  "safety");
    renderTbody(document.querySelector('[data-hook="table.quality.tbody"]'), qualityView, COLS.quality, "quality");

    bindHeaderSort("ci-table"); bindHeaderSort("safety-table"); bindHeaderSort("quality-table");
    applyStatusDropdownFiltering("ci"); applyStatusDropdownFiltering("safety"); applyStatusDropdownFiltering("quality");

    const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = `${n} submission${n === 1 ? "" : "s"}`; };
    setCount("ci-count", ciView.length); setCount("safety-count", safetyView.length); setCount("quality-count", qualityView.length);
  };
})(window.PowerUp);
