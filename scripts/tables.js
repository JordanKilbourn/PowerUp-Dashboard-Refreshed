// scripts/tables.js (Hybrid Whitelist Approach)
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});

  // ✅ Whitelist of columns to display (exact names from Smartsheet)
  const DISPLAY = {
    CI: [
      "Submission Date", "Submission ID", "Problem Statements", "Proposed Improvement",
      "CI Approval", "Assigned To (Primary)", "Status", "Action Item Entry Date",
      "Last Meeting Action Item's", "Resourced", "Resourced Date", "Token Payout", "Paid"
    ],
    SAFETY: [
      "Date", "Department/Area", "Safety Concern", "Describe the safety concern",
      "Recommendations to correct/improve safety issue", "Resolution",
      "Who was the safety concern escalated to", "Leadership update",
      "Closed/Confirmed by- leadership only", "Status"
    ],
    QUALITY: [
      "Catch ID", "Entry Date", "Submitted By", "Area",
      "Quality Catch", "Part Number", "Description"
    ]
  };

  const $q = (s, r = document) => r.querySelector(s);
  const num = (v) => PowerUp.api.toNumber(v);
  const isTrue = (v) => /^(true|yes|1|paid)$/i.test(String(v ?? "").trim());

  // Match row to logged in user
  function belongsToUser(row, session) {
    const meId = String(session.employeeId || "").trim().toLowerCase();
    const meName = String(session.displayName || "").trim().toLowerCase();
    if (!meId && !meName) return false;

    for (const k of ["Employee ID", "Position ID"]) {
      if (String(row[k] || "").trim().toLowerCase() === meId) return true;
    }
    for (const k of ["Employee Name", "Display Name"]) {
      if (String(row[k] || "").trim().toLowerCase() === meName) return true;
    }
    return false;
  }

  // Formatting helpers
  function pill(text, color) {
    const cls = color === "green" ? "pill pill--green" :
                color === "red"   ? "pill pill--red"   :
                color === "blue"  ? "pill pill--blue"  :
                "pill";
    return `<span class="${cls}">${text}</span>`;
  }

  function formatCell(title, value) {
    const t = title.toLowerCase();
    if (t === "status") {
      const v = String(value || "").toLowerCase();
      if (/approved|closed|complete|done/.test(v)) return pill(value, "green");
      if (/pending|open|in progress|scheduled/.test(v)) return pill(value, "blue");
      if (/denied|rejected|cancelled|canceled/.test(v)) return pill(value, "red");
      return value || "";
    }
    if (/^paid$/.test(t)) return isTrue(value) ? pill("Paid", "green") : "";
    if (/^resourced$/.test(t)) return isTrue(value) ? pill("Resourced", "green") : "";
    if (/token payout/i.test(t)) return num(value) ? `${num(value)}` : "";
    return value ?? "";
  }

  function renderRows(tbody, cols, rows) {
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}" style="text-align:center;padding:16px;">No rows</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(r =>
      `<tr>${cols.map(c => `<td>${formatCell(c, r[c])}</td>`).join("")}</tr>`
    ).join("");
  }

  // Sorting support
  function attachSort(table, cols) {
    const ths = table.querySelectorAll("thead th[data-k]");
    ths.forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.k;
        const idx = cols.indexOf(key);
        const asc = th.dataset.sort !== "asc";
        ths.forEach(h => h.dataset.sort = "");
        th.dataset.sort = asc ? "asc" : "desc";

        const tb = table.querySelector("tbody");
        const rows = Array.from(tb.querySelectorAll("tr"));
        const sorted = rows.sort((a, b) => {
          const av = a.children[idx]?.textContent || "";
          const bv = b.children[idx]?.textContent || "";
          const an = parseFloat(av.replace(/[^0-9.\-]/g, "")),
                bn = parseFloat(bv.replace(/[^0-9.\-]/g, ""));
          const numMode = !isNaN(an) && !isNaN(bn);
          return asc ? (numMode ? an - bn : av.localeCompare(bv))
                     : (numMode ? bn - an : bv.localeCompare(av));
        });
        tb.innerHTML = "";
        sorted.forEach(tr => tb.appendChild(tr));
      });
    });
  }

  async function hydrateOne(kind, sheetId) {
    const table = document.getElementById(`${kind}-table`);
    if (!table) return;

    const tbody = table.querySelector("tbody");
    const raw = await PowerUp.api.fetchSheet(sheetId);
    const allHeaders = raw.columns.map(c => c.title);
    const rows = PowerUp.api.rowsByTitle(raw);

    // Filter only whitelisted columns
    const display = DISPLAY[kind] || allHeaders;
    const valid = display.filter(h => {
      if (!allHeaders.includes(h)) {
        console.warn(`[tables.js] Column "${h}" not found in ${kind} sheet. Available:`, allHeaders);
        return false;
      }
      return true;
    });

    // Build header if not already
    if (!table.querySelector("thead tr")) {
      const thead = table.querySelector("thead");
      thead.innerHTML = `<tr>${valid.map(h => `<th data-k="${h}">${h}</th>`).join("")}</tr>`;
    }

    // Filter rows for logged in user
    const s = PowerUp.session.get();
    const mine = rows.filter(r => belongsToUser(r, s))
      .sort((a, b) => new Date(b["Submission Date"] || b["Date"] || 0) - new Date(a["Submission Date"] || a["Date"] || 0));

    renderRows(tbody, valid, mine);
    attachSort(table, valid);
  }

  async function hydrateDashboardTables() {
    PowerUp.session.requireLogin();
    await PowerUp.session.initHeader();
    await Promise.all([
      hydrateOne("ci", PowerUp.api.SHEETS.CI),
      hydrateOne("safety", PowerUp.api.SHEETS.SAFETY),
      hydrateOne("quality", PowerUp.api.SHEETS.QUALITY),
    ]);
  }

  P.tables = { hydrateDashboardTables };
  window.PowerUp = P;
}(window.PowerUp || {}));
