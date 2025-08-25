// scripts/tables.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});

  // --- Define the exact headers to display for each sheet ---
  const DISPLAY = {
    CI: [
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
    SAFETY: [
      "Date",
      "Department/Area",
      "Safety Concern",
      "Describe the safety concern",
      "Recommendations to correct/improve safety issue",
      "Resolution",
      "Who was the safety concern escalated to",
      "Leadership update",
      "Closed/Confirmed by- leadership only",
      "Status"
    ],
    QUALITY: [
      "Catch ID",
      "Entry Date",
      "Submitted By",
      "Area",
      "Quality Catch",
      "Part Number",
      "Description"
    ]
  };

  const $q = (s, r = document) => r.querySelector(s);
  const num = (v) => PowerUp.api.toNumber(v);
  const isTrue = (v) => /^(true|yes|1|paid)$/i.test(String(v ?? "").trim());
  const norm = (s) => String(s || "").trim().toLowerCase();

  // --- Belongs-to-user filter ---
  function belongsToUser(row, session) {
    const meId = norm(session.employeeId);
    const meName = norm(session.displayName);
    if (!meId && !meName) return false;
    for (const k of ["Employee ID", "Position ID"]) {
      if (meId && norm(row[k]) === meId) return true;
    }
    for (const k of ["Employee Name", "Display Name", "Submitted By", "Name"]) {
      if (meName && norm(row[k]) === meName) return true;
    }
    return false;
  }

  // --- Cell formatting (pills, tokens, etc.) ---
  function pill(text, color) {
    const cls =
      color === "green"
        ? "pill pill--green"
        : color === "red"
        ? "pill pill--red"
        : color === "blue"
        ? "pill pill--blue"
        : "pill";
    return `<span class="${cls}">${text}</span>`;
  }

  function formatCell(title, value) {
    const t = title.toLowerCase();
    if (t === "status") {
      const v = String(value || "").toLowerCase();
      if (/(approved|closed|complete|completed|done)/.test(v))
        return pill(value, "green");
      if (/(pending|open|in progress|scheduled)/.test(v))
        return pill(value, "blue");
      if (/(denied|rejected|cancelled|canceled)/.test(v))
        return pill(value, "red");
      return value || "";
    }
    if (/^paid$/.test(t)) return isTrue(value) ? pill("Paid", "green") : "";
    if (/^resourced$/.test(t))
      return isTrue(value) ? pill("Resourced", "green") : "";
    if (/token payout/i.test(t))
      return num(value) ? `${num(value)}` : "";
    return value ?? "";
  }

  // --- Render helpers ---
  function ensureHeader(table, cols) {
    const thead = table.querySelector("thead") || table.createTHead();
    thead.innerHTML = "";
    const tr = document.createElement("tr");
    cols.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c;
      th.dataset.k = c;
      tr.appendChild(th);
    });
    thead.appendChild(tr);
  }

  function renderRows(tbody, cols, rows) {
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="${cols.length}" class="muted" style="text-align:center;padding:16px;">No rows</td></tr>`;
      return;
    }
    tbody.innerHTML = rows
      .map(
        (r) =>
          `<tr>${cols
            .map((c) => `<td>${formatCell(c, r[c])}</td>`)
            .join("")}</tr>`
      )
      .join("");
  }

  function attachSort(table, cols) {
    const ths = table.querySelectorAll("thead th[data-k]");
    ths.forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.k;
        const headers = Array.from(table.querySelectorAll("thead th"));
        const idx = headers.findIndex(
          (h) => (h.dataset.k || h.textContent.trim()) === key
        );
        const asc = th.dataset.sort !== "asc";
        headers.forEach((h) => (h.dataset.sort = ""));
        th.dataset.sort = asc ? "asc" : "desc";
        const tb = table.querySelector("tbody");
        const rows = Array.from(tb.querySelectorAll("tr"));
        const sorted = rows.sort((a, b) => {
          const av = (a.children[idx]?.textContent || "").trim();
          const bv = (b.children[idx]?.textContent || "").trim();
          const an = parseFloat(av.replace(/[^0-9.\-]/g, ""));
          const bn = parseFloat(bv.replace(/[^0-9.\-]/g, ""));
          const numMode =
            !Number.isNaN(an) && !Number.isNaN(bn) && (/\d/.test(av) || /\d/.test(bv));
          return asc
            ? numMode
              ? an - bn
              : av.localeCompare(bv)
            : numMode
            ? bn - an
            : bv.localeCompare(av);
        });
        const frag = document.createDocumentFragment();
        sorted.forEach((tr) => frag.appendChild(tr));
        tb.innerHTML = "";
        tb.appendChild(frag);
      });
    });
  }

  // --- Hydration for one table ---
  async function hydrateOne(kind, sheetId, cols) {
    const table =
      document.querySelector(`#${kind}-table`) ||
      document.querySelector(`table[data-table="${kind}"]`);
    if (!table) return;

    ensureHeader(table, cols);
    const tbody = table.querySelector("tbody");
    const s = PowerUp.session.get();
    const all = await PowerUp.api.getRowsByTitle(sheetId);

    // Warn if any requested display column is missing
    cols.forEach((c) => {
      if (!all[0] || !(c in all[0])) {
        console.warn(`[PowerUp] Column "${c}" not found in ${kind} sheet!`);
      }
    });

    const mine = all
      .filter((r) => belongsToUser(r, s))
      .sort(
        (a, b) =>
          new Date(b["Submission Date"] || b["Date"] || b["Entry Date"] || 0) -
          new Date(a["Submission Date"] || a["Date"] || a["Entry Date"] || 0)
      );

    renderRows(tbody, cols, mine);
    attachSort(table, cols);
  }

  // --- Main entry ---
  async function hydrateDashboardTables() {
    PowerUp.session.requireLogin();
    await PowerUp.session.initHeader();
    await Promise.all([
      hydrateOne("ci", PowerUp.api.SHEETS.CI, DISPLAY.CI),
      hydrateOne("safety", PowerUp.api.SHEETS.SAFETY, DISPLAY.SAFETY),
      hydrateOne("quality", PowerUp.api.SHEETS.QUALITY, DISPLAY.QUALITY),
    ]);
  }

  PowerUp.tables = { hydrateDashboardTables };
  window.PowerUp = P;
})(window.PowerUp || {});
