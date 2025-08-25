// scripts/tables.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  // ---------- Column mappings (tolerant to minor name differences) ----------
  const COLS = {
    CI: [
      "Submission Date", "Submission ID", "Problem Statements", "Proposed Improvement",
      "CI Approval", "Assigned To (Primary)", "Status", "Action Item Entry Date",
      "Last Meeting Action Item's", "Resourced", "Resourced Date", "Token Payout", "Paid"
    ],
    SAFETY: [
      "Submission Date", "Department", "Description", "Recommendations",
      "Status", "Assigned To (Primary)", "Action Item Entry Date", "Follow-up Date", "Severity"
    ],
    QUALITY: [
      "Submission Date", "Part Number", "Part Description", "Issue",
      "Status", "Assigned To (Primary)", "Containment", "Root Cause", "Corrective Action"
    ]
  };

  // Where to look up user IDs in sheets
  const EMP_ID_KEYS = ["Employee ID", "Position ID"];

  // ---------- DOM helpers with graceful fallbacks ----------
  function $q(sel, root = document) { return root.querySelector(sel); }
  function findTable(kind) {
    return (
      $q(`table[data-table="${kind}"]`) ||
      $q(`#${kind}-table`) ||
      $q(`.${kind}-table`)
    );
  }
  function findBody(kind, table) {
    return (
      (table && table.querySelector("tbody")) ||
      $q(`#${kind}-rows`) ||
      $q(`[data-body="${kind}"]`)
    );
  }
  function findStatusSelect(kind) {
    return (
      $q(`select[data-filter="${kind}-status"]`) ||
      $q(`#${kind}-status`) ||
      null
    );
  }
  function findCountBadge(kind) {
    return (
      $q(`[data-count="${kind}"]`) ||
      $q(`#${kind}-count`) ||
      null
    );
  }

  // ---------- utilities ----------
  const num = (v) => PowerUp.api.toNumber(v);
  const isTrue = (v) => String(v).toLowerCase() === "true" || String(v).toLowerCase() === "yes";
  const get = (row, key) => row[key] ?? "";

  function belongsToUser(row, empId) {
    const rid = (EMP_ID_KEYS.map(k => row[k]).find(v => v != null && v !== "") || "").toString().trim();
    return rid === (empId || "").toString().trim();
  }

  function pill(text, color) {
    const cls = color === "green" ? "pill pill--green" :
                color === "red"   ? "pill pill--red"   :
                color === "blue"  ? "pill pill--blue"  : "pill";
    return `<span class="${cls}">${text}</span>`;
  }

  function formatCell(title, value) {
    const t = title.toLowerCase();
    if (t === "status") {
      const v = String(value || "").toLowerCase();
      if (/(approved|closed|complete|completed|done)/.test(v)) return pill(value, "green");
      if (/(pending|open|in progress|scheduled)/.test(v))     return pill(value, "blue");
      if (/(denied|rejected|cancelled|canceled)/.test(v))     return pill(value, "red");
      return value || "";
    }
    if (/^paid$/.test(t)) return isTrue(value) ? pill("Paid", "green") : "";
    if (/^resourced$/.test(t)) return isTrue(value) ? pill("Resourced", "green") : "";
    if (/token payout/i.test(t)) return num(value) ? `${num(value)}` : "";
    return value ?? "";
  }

  // Build header row based on COLS
  function ensureHeader(table, cols) {
    const thead = table.querySelector("thead") || table.createTHead();
    if (!thead.innerHTML.trim()) {
      const tr = document.createElement("tr");
      cols.forEach(c => {
        const th = document.createElement("th");
        th.textContent = c;
        th.dataset.k = c; // for sorting
        tr.appendChild(th);
      });
      thead.appendChild(tr);
    }
  }

  function renderRows(tbody, cols, rows) {
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}" class="muted" style="text-align:center;padding:16px;">No rows</td></tr>`;
      return;
    }
    const html = rows.map(r => {
      const tds = cols.map(col => `<td>${formatCell(col, get(r, col))}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
    tbody.innerHTML = html;
  }

  function attachSort(table, cols) {
    const ths = table.querySelectorAll("thead th[data-k]");
    ths.forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.k;
        const tbody = table.querySelector("tbody");
        const rows = Array.from(tbody.querySelectorAll("tr"));
        // Determine column index
        const headers = Array.from(table.querySelectorAll("thead th"));
        const idx = headers.findIndex(h => (h.dataset.k || h.textContent.trim()) === key);

        // Current sort dir toggle
        const asc = th.dataset.sort !== "asc";
        headers.forEach(h => h.dataset.sort = "");
        th.dataset.sort = asc ? "asc" : "desc";

        const getCellText = (tr) => (tr.children[idx]?.textContent || "").trim();

        const sorted = rows.sort((a, b) => {
          const av = getCellText(a);
          const bv = getCellText(b);
          // numeric if both numbers (e.g., Token Payout)
          const an = parseFloat(av.replace(/[^0-9.\-]/g, "")); 
          const bn = parseFloat(bv.replace(/[^0-9.\-]/g, ""));
          const numMode = !Number.isNaN(an) && !Number.isNaN(bn) && (/\d/.test(av) || /\d/.test(bv));
          if (numMode) return asc ? (an - bn) : (bn - an);
          return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        });

        // reattach sorted rows
        const frag = document.createDocumentFragment();
        sorted.forEach(tr => frag.appendChild(tr));
        tbody.innerHTML = ""; // clear
        tbody.appendChild(frag);
      });
    });
  }

  function attachStatusFilter(kind, table, select) {
    if (!select) return;
    select.addEventListener("change", () => {
      const val = select.value || "";
      const tbody = table.querySelector("tbody");
      const rows = Array.from(tbody.querySelectorAll("tr"));
      // Find "Status" column index
      const headers = Array.from(table.querySelectorAll("thead th"));
      const sIdx = headers.findIndex(h => /status/i.test(h.textContent.trim()));
      rows.forEach(tr => {
        // Keep "No rows" visible logic consistent
        if (tr.children.length === 1) { tr.style.display = ""; return; }
        if (!val || val === "All") { tr.style.display = ""; return; }
        const cellText = (tr.children[sIdx]?.textContent || tr.textContent || "").toLowerCase();
        tr.style.display = cellText.includes(val.toLowerCase()) ? "" : "none";
      });
      // Update count after filter
      const visible = rows.filter(tr => tr.style.display !== "none" && tr.children.length > 1).length;
      const badge = findCountBadge(kind);
      if (badge) badge.textContent = visible;
    });
  }

  function updateCount(kind, table) {
    const tbody = table.querySelector("tbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));
    const count = rows.filter(tr => tr.children.length > 1).length; // ignore "No rows"
    const badge = findCountBadge(kind);
    if (badge) badge.textContent = count;
  }

  async function hydrateOne(kind, sheetId, cols) {
    const table = findTable(kind);
    if (!table) return; // nothing to do if the page doesn't have this table
    ensureHeader(table, cols);
    const tbody = findBody(kind, table);

    const s = PowerUp.session.get();
    const all = await PowerUp.api.getRowsByTitle(sheetId);
    const mine = all.filter(r => belongsToUser(r, s.employeeId)).sort((a, b) => {
      // Default newest first by "Submission Date" if present
      const ad = new Date(a["Submission Date"] || a["Date"] || 0);
      const bd = new Date(b["Submission Date"] || b["Date"] || 0);
      return bd - ad;
    });

    renderRows(tbody, cols, mine);
    updateCount(kind, table);
    attachSort(table, cols);
    attachStatusFilter(kind, table, findStatusSelect(kind));
  }

  async function hydrateDashboardTables() {
    PowerUp.session.requireLogin();
    await PowerUp.session.initHeader();
    await Promise.all([
      hydrateOne("ci",      PowerUp.api.SHEETS.CI,      COLS.CI),
      hydrateOne("safety",  PowerUp.api.SHEETS.SAFETY,  COLS.SAFETY),
      hydrateOne("quality", PowerUp.api.SHEETS.QUALITY, COLS.QUALITY)
    ]);
  }

  P.tables = { hydrateDashboardTables };
  window.PowerUp = P;
}(window.PowerUp || {}));
