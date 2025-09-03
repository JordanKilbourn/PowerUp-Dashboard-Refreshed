// /scripts/tokens.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  const num = (v) => {
    const n = Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const truthy = (v) => /^(true|yes|y|1|paid)$/i.test(String(v ?? "").trim());

  function scopeRows(allRows) {
    // Admin path (All or specific employee by name/ID)
    if (ns.auth?.maybeFilterByEmployee) {
      const cols = ['Employee ID','Position ID','Display Name','Employee Name','Name','Submitted By'];
      return ns.auth.maybeFilterByEmployee(allRows, cols);
    }
    // Non-admin: mine only
    const { employeeId } = ns.session.get();
    return allRows.filter(r => {
      const a = String(r["Employee ID"] || "").trim();
      const b = String(r["Position ID"] || "").trim();
      return a === String(employeeId || "").trim() || b === String(employeeId || "").trim();
    });
  }

  ns.renderTokenCard = async function () {
    const totalEl = document.querySelector('[data-hook="token.total"]');
    const setTotal = (v) => { if (totalEl) totalEl.textContent = String(v); };

    try {
      const ciSheet = await fetchSheet(SHEETS.CI);
      const ciRows  = rowsByTitle(ciSheet);

      const scoped = scopeRows(ciRows);
      const minePaid = scoped.filter(r => truthy(r["Paid"]));
      const total = minePaid.reduce((sum, r) => sum + num(r["Token Payout"]), 0);

      setTotal(total);
    } catch (err) {
      console.error("[tokens] failed to render token card:", err);
      setTotal(0);
    }
  };

  document.addEventListener('powerup-admin-filter-change', () => {
    try { ns.api.clearCache(); } catch {}
    ns.renderTokenCard();
  });

})(window.PowerUp);
