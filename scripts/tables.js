// /scripts/tables.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS, Cache } = ns.api;

  // ------------------------------------------------------------------
  // Column sets per table (titles must match your sheet headers)
  // ------------------------------------------------------------------
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
    quality: [
      "Catch ID","Entry Date","Submitted By","Area","Quality Catch","Part Number","Description"
    ]
  };

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const num = v => {
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const yes = v => /^(true|yes|y|1)$/i.test(String(v || "").trim());

  const dateish = v => (v ? new Date(v) : null);
  const fmtDate = v => {
    const d = dateish(v);
    if (!d || isNaN(d)) return v ?? "";
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  };

  const money = v => {
    const n = num(v);
    return n ? `$${n}` : (v || "");
  };

  const statusPill = (text) => {
    if (!text) return "";
    const t = String(text).toLowerCase();
    let cls = "pill--gray";
    if (/approved|accepted|closed|complete/.test(t)) cls = "pill--green";
    else if (/pending|in ?progress|open|new|research/.test(t)) cls = "pill--blue";
    else if (/denied|rejected|not.*started|cancel/.test(t)) cls = "pill--red";
    return `<span class="pill ${cls}">${escapeHtml(text)}</span>`;
  };

  const boolBadge = (v) => {
    if (yes(v)) return `<span class="pill pill--green">Yes</span>`;
    if (/^(false|no|n|0)$/i.test(String(v || ""))) return `<span class="pill pill--gray">No</span>`;
    return escapeHtml(v ?? "");
  };

  function sortKey(colTitle, rawValue) {
    const t = colTitle.toLowerCase();
    if (t.includes("date")) {
      const d = dateish(rawValue);
      return d && !isNaN(d) ? d.getTime() : -8.64e15;
    }
    const n = Number(String(rawValue).replace(/[^0-9.-]/g, ""));
    if (!Number.isNaN(n) && String(rawValue).match(/[0-9]/)) return n;
    if (String(rawValue).toLowerCase() === "true") return 1;
    if (String(rawValue).toLowerCase() === "false") return 0;
    return String(rawValue || "").toLowerCase();
  }

  // Long-text columns get a tooltip
  const LONG_TXT_RE = /(problem|improvement|description|recommend|resolution|leadership|quality catch)/i;

  function formatCell(colTitle, value) {
    if (value == null) return "";
    const t = colTitle.toLowerCase();

    // specific types
    if (t.includes("date")) return fmtDate(value);
    if (t.includes("token")) return money(value);
    if (t === "paid") return boolBadge(value);
    if (t.includes("status") || t.includes("approval")) return statusPill(value);

    // long text: keep simple inline and add a hover title
    const text = String(value);
    if (LONG_TXT_RE.test(colTitle)) {
      return `<span title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
    }
    return escapeHtml(text);
  }

  // Security: restrict to this user's rows
  function belongsToUser(row, employeeId) {
    const id = String(employeeId || "").trim();
    if (!id) return false;
    const a = String(row["Employee ID"] || "").trim();
    const b = String(row["Position ID"] || "").trim();
    return a === id || b === id;
  }

  // Render tbody (adds a single .empty row when there's no data)
  function renderTbody(tbody, rows, columns) {
    if (!tbody) return;

    if (!rows || rows.length === 0) {
      tbody.innerHTML =
        `<tr class="empty"><td colspan="${columns.length}" style="text-align:center;opacity:.7;">No rows</td></tr>`;
      return;
    }

    const html = rows.map(r => {
      const tds = columns.map(col => {
        const raw = r[col];
        const display = formatCell(col, raw);
        const key = sortKey(col, raw);
        return `<td data-sort="${key}">${display}</td>`;
      }).join("");
      return `<tr>${tds}</tr>`;
    }).join("");

    tbody.innerHTML = html;
  }

  // default sort by "newest" using the first date-like column found
  function sortNewest(rows) {
    const dateCols = [
      "Submission Date","Entry Date","Date","Action Item Entry Date","Resourced Date","Created","Last Action"
    ];
    return [...rows].sort((a, b) => {
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

  // click-to-sort on header
  function bindHeaderSort(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    if (!thead || !tbody) return;

    let state = { col: 0, asc: false };

    thead.querySelectorAll("th").forEach((th, idx) => {
      th.style.cursor = "pointer";
      th.onclick = () => {
        state.asc = state.col === idx ? !state.asc : true;
        state.col = idx;

        const rows = Array.from(tbody.querySelectorAll("tr")).filter(r => !r.classList.contains("empty"));
        rows.sort((ra, rb) => {
          const a = ra.children[idx]?.getAttribute("data-sort") ?? "";
          const b = rb.children[idx]?.getAttribute("data-sort") ?? "";
          const na = Number(a), nb = Number(b);
          const bothNum = !Number.isNaN(na) && !Number.isNaN(nb);
          const cmp = bothNum ? (na - nb) : String(a).localeCompare(String(b));
          return state.asc ? cmp : -cmp;
        });
        rows.forEach(r => tbody.appendChild(r));

        thead.querySelectorAll("th").forEach((h, i) => {
          h.classList.toggle("sorted-asc", i === state.col && state.asc);
          h.classList.toggle("sorted-desc", i === state.col && !state.asc);
        });
      };
    });
  }

  // status dropdown filter + accurate visible count (ignores .empty row)
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
        const isEmpty = tr.classList.contains("empty");
        if (isEmpty) {
          // show placeholder only if everything else is hidden/absent
          return;
        }
        const cells = Array.from(tr.cells).map(td => td.textContent.toLowerCase());
        const show = v === "all" || cells.some(text => text.includes(v));
        tr.style.display = show ? "" : "none";
        if (show) visible++;
      });

      // toggle placeholder based on visibility
      const placeholder = tbody.querySelector("tr.empty");
      if (placeholder) placeholder.style.display = visible === 0 ? "" : "none";

      if (count) count.textContent = `${visible} submission${visible === 1 ? "" : "s"}`;
    };

    select.onchange = run;
    run();
  }

  // helper to set count after initial render (uses actual visible rows)
  const setCount = (id, n, tableId) => {
    const el = document.getElementById(id);
    if (!el) return;

    const tb = document.getElementById(tableId)?.querySelector("tbody");
    if (tb) {
      const visible = Array.from(tb.rows)
        .filter(r => !r.classList.contains("empty") && r.style.display !== "none").length;
      el.textContent = `${visible} submission${visible === 1 ? "" : "s"}`;
    } else {
      el.textContent = `${n} submission${n === 1 ? "" : "s"}`;
    }
  };

  // ------------------------------------------------------------------
  // Main entry
  // ------------------------------------------------------------------
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

    // cache for other modules (tokens.js uses this)
    Cache.set("ci", ciAll);
    Cache.set("safety", safetyAll);
    Cache.set("quality", qualityAll);

    // render
    renderTbody(document.querySelector('[data-hook="table.ci.tbody"]'),      ciView,      COLS.ci);
    renderTbody(document.querySelector('[data-hook="table.safety.tbody"]'),  safetyView,  COLS.safety);
    renderTbody(document.querySelector('[data-hook="table.quality.tbody"]'), qualityView, COLS.quality);

    // sorting + filtering
    bindHeaderSort("ci-table");
    bindHeaderSort("safety-table");
    bindHeaderSort("quality-table");

    applyStatusDropdownFiltering("ci");
    applyStatusDropdownFiltering("safety");
    applyStatusDropdownFiltering("quality");

    // counts (uses visible rows)
    setCount("ci-count",      ciView.length,      "ci-table");
    setCount("safety-count",  safetyView.length,  "safety-table");
    setCount("quality-count", qualityView.length, "quality-table");
  };
})(window.PowerUp);
