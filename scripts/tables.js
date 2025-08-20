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

  function renderTbody(tbody, rows, columns) {
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => `
      <tr>${columns.map(c => `<td>${r[c] ?? ""}</td>`).join("")}</tr>
    `).join("");
  }

  function applySortRecent(rows) {
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

    const ciRows      = rowsByTitle(ciSheet);
    const safetyRows  = rowsByTitle(safetySheet);
    const qualityRows = rowsByTitle(qualitySheet);

    Cache.set("ci", ciRows); Cache.set("safety", safetyRows); Cache.set("quality", qualityRows);

    [
      { key: "ci",      rows: ciRows,      tbodySel: '[data-hook="table.ci.tbody"]' },
      { key: "safety",  rows: safetyRows,  tbodySel: '[data-hook="table.safety.tbody"]' },
      { key: "quality", rows: qualityRows, tbodySel: '[data-hook="table.quality.tbody"]' }
    ].forEach(({ rows, tbodySel, key }) => {
      const view = applySortRecent(rows);
      const tbodyEl = document.querySelector(tbodySel);
      renderTbody(tbodyEl, view, COLS[key]);
      // update count badge
      const countEl = document.getElementById(`${key}-count`);
      if (countEl) countEl.textContent = `${view.length} submission${view.length !== 1 ? "s" : ""}`;
    });
  };
})(window.PowerUp);
