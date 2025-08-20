<script>
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, SHEETS, Cache } = ns.api;

  // --- Column selections by sheet (Smartsheet titles) ---
  const COLS = {
    // CI: per your list
    ci: [
      "Submission Date",
      "Submission ID",
      "Problem Statements",
      "Proposed Improvement",
      "CI Approval",
      "Assigned To (Primary)",
      "Status",
      "Action Item Entry Date",
      "Last Meeting Action Item's",
      "Resourced",
      "Resourced Date",
      "Token Payout",
      "Paid"
    ],
    // Safety: use the displayed columns from your Safety sheet (adjust if names differ)
    safety: [
      "Entry Date",
      "Submitted By",
      "Area",
      "Concern",            // if your column is literally "Concern"; change if different
      "Description",
      "Status"
    ],
    // Quality Catches: “all displayed” in your screenshot
    quality: [
      "Catch ID",
      "Entry Date",
      "Submitted By",
      "Area",
      "Quality Catch",
      "Part Number",
      "Description"
    ]
  };

  // --- Optional shorter headers for the dashboard view ---
  const DISPLAY = {
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
      "Entry Date": "Date",
      "Submitted By": "Submitted By",
      "Area": "Area",
      "Concern": "Concern",
      "Description": "Description",
      "Status": "Status"
    },
    quality: {
      "Catch ID": "ID",
      "Entry Date": "Date",
      "Submitted By": "Submitted By",
      "Area": "Area",
      "Quality Catch": "Catch",
      "Part Number": "Part #",
      "Description": "Description"
    }
  };

  function normalize(rows) { return rows || []; }

  function ensureTheadMatches(tableEl, cols, displayMap) {
    if (!tableEl) return;
    const thead = tableEl.querySelector("thead");
    if (!thead) return;
    thead.innerHTML = `
      <tr>
        ${cols.map(c => `<th>${displayMap?.[c] || c}</th>`).join("")}
      </tr>
    `;
  }

  function renderTbody(tbody, rows, columns) {
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => `
      <tr>
        ${columns.map(c => `<td>${r[c] ?? ""}</td>`).join("")}
      </tr>
    `).join("");
  }

  function bindSearch(searchEl, sourceRows, onChange) {
    if (!searchEl) return;
    let t; searchEl.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const q = (searchEl.value||"").toLowerCase();
        const filtered = !q ? sourceRows : sourceRows.filter(r =>
          JSON.stringify(r).toLowerCase().includes(q)
        );
        onChange(filtered);
      }, 180);
    });
  }

  function bindSort(sortEl, onChange) {
    if (!sortEl) return;
    sortEl.addEventListener("change", () => onChange(sortEl.value));
  }

  function bindExpand(btnEl, tableRegionEl) {
    if (!btnEl || !tableRegionEl) return;
    btnEl.addEventListener("click", () => {
      tableRegionEl.classList.toggle("rows-expanded");
    });
  }

  function applySortGeneric(rows, mode) {
    if (mode === "owner") {
      return [...rows].sort((a,b)=>String(a["Owner"]||a["Submitted By"]||"").localeCompare(String(b["Owner"]||b["Submitted By"]||"")));
    }
    // default: most recent by typical date columns if present
    const dateKeys = ["Created","Entry Date","Submission Date","Date","Action Item Entry Date","Resourced Date"];
    return [...rows].sort((a,b) => {
      const ad = new Date(dateKeys.map(k=>a[k]).find(v=>v) || 0);
      const bd = new Date(dateKeys.map(k=>b[k]).find(v=>v) || 0);
      return bd - ad;
    });
  }

  ns.hydrateDashboardTables = async function () {
    const [ciSheet, safetySheet, qualitySheet] = await Promise.all([
      fetchSheet(SHEETS.CI),
      fetchSheet(SHEETS.SAFETY),
      fetchSheet(SHEETS.QUALITY)
    ]);
    Cache.set("ci", ciSheet);
    Cache.set("safety", safetySheet);
    Cache.set("quality", qualitySheet);

    [
      {
        key: "ci",
        tableSel: "#ci-table",
        tbodySel: '[data-hook="table.ci.tbody"]',
        searchSel: '#ci-search',      // optional if you add a search box later
        sortSel:   '#ci-sort',        // optional
        expandSel: '[data-hook="table.ci.expand"]', // optional
      },
      {
        key: "safety",
        tableSel: "#safety-table",
        tbodySel: '[data-hook="table.safety.tbody"]',
        searchSel: '#safety-search',
        sortSel:   '#safety-sort',
        expandSel: '[data-hook="table.safety.expand"]',
      },
      {
        key: "quality",
        tableSel: "#quality-table",
        tbodySel: '[data-hook="table.quality.tbody"]',
        searchSel: '#quality-search',
        sortSel:   '#quality-sort',
        expandSel: '[data-hook="table.quality.expand"]',
      }
    ].forEach(({ key, tableSel, tbodySel, searchSel, sortSel, expandSel }) => {
      const sheet = Cache.get(key);
      const all = normalize(sheet.rows);
      const columns = COLS[key];
      const display = DISPLAY[key];

      // 1) Make sure THEAD matches requested columns (keeps your sort UI intact)
      const tableEl = document.querySelector(tableSel);
      ensureTheadMatches(tableEl, columns, display);

      // 2) Initial sort + render
      let view = applySortGeneric(all, "recent");
      const tbodyEl = document.querySelector(tbodySel);
      renderTbody(tbodyEl, view, columns);

      // 3) Hook up your existing sort icons again (your page script will rebind heads)
      if (window.__bindSortHeaders__ && window.__bindSortHeaders__[key]) {
        window.__bindSortHeaders__[key]();
      }

      // 4) Optional: wire search/sort/expand controls if you add them
      const searchEl = document.querySelector(searchSel);
      const sortEl   = document.querySelector(sortSel);
      const expandEl = document.querySelector(expandSel);
      const region   = tableEl ? tableEl.parentNode : document.body;

      bindSearch(searchEl, all, (filtered) => {
        view = applySortGeneric(filtered, (sortEl && sortEl.value) || "recent");
        renderTbody(tbodyEl, view, columns);
      });
      bindSort(sortEl, (mode) => {
        view = applySortGeneric(view, mode);
        renderTbody(tbodyEl, view, columns);
      });
      bindExpand(expandEl, region);
    });
  };
})(window.PowerUp);
</script>
