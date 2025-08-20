// /scripts/tokens.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  ns.renderTokenCard = async function () {
    const { employeeId } = ns.session.get();
    if (!employeeId) return;

    const ciSheet = await fetchSheet(SHEETS.CI);
    const ciRows  = rowsByTitle(ciSheet);

    const total = ciRows
      .filter(r => String(r["Employee ID"] || r["Position ID"] || "").trim() === employeeId)
      .reduce((sum, r) => sum + (Number(r["Token Payout"] || 0) || 0), 0);

    const el = document.querySelector('[data-hook="token.total"]');
    if (el) el.textContent = total.toString();
  };
})(window.PowerUp);
