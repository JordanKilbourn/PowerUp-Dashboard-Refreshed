// /scripts/tokens.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  // ---- helpers ------------------------------------------------------------
  const num = (v) => {
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const truthy = (v) => /^(true|yes|y|1|paid)$/i.test(String(v ?? "").trim());

  function belongsToUser(row, employeeId) {
    const id = String(employeeId || "").trim();
    if (!id) return false;
    const a = String(row["Employee ID"] || "").trim();
    const b = String(row["Position ID"] || "").trim();
    return a === id || b === id;
  }

  // ---- main card renderer -------------------------------------------------
  ns.renderTokenCard = async function () {
    const totalEl = document.querySelector('[data-hook="token.total"]');
    const setTotal = (v) => { if (totalEl) totalEl.textContent = String(v); };

    try {
      const { employeeId } = ns.session.get();
      if (!employeeId) { setTotal(0); return; }

      // Tokens live on the CI sheet (Token Payout, Paid)
      const ciSheet = await fetchSheet(SHEETS.CI);
      const ciRows  = rowsByTitle(ciSheet);

      const minePaid = ciRows.filter(r =>
        belongsToUser(r, employeeId) &&
        truthy(r["Paid"])
      );

      const total = minePaid.reduce((sum, r) => sum + num(r["Token Payout"]), 0);
      setTotal(total);
    } catch (err) {
      console.error("[tokens] failed to render token card:", err);
      setTotal(0);
    }
  };
})(window.PowerUp);
