// /scripts/tokens.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS, Cache } = ns.api;

  const num = v => {
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  };
  const yes = v => /^(true|yes|y|1)$/i.test(String(v || '').trim());

  async function getCIRows() {
    if (Cache?.get) {
      const cached = Cache.get('ci');
      if (cached) return cached;
    }
    // Fallback if user lands on dashboard before tables hydrate
    const sheet = await fetchSheet(SHEETS.CI);
    return rowsByTitle(sheet);
  }

  ns.renderTokenCard = async function () {
    const ci = await getCIRows();

    // Only count tokens from rows that are marked Paid
    const totalPaid = ci.reduce((sum, r) => {
      return yes(r['Paid']) ? sum + num(r['Token Payout']) : sum;
    }, 0);

    const el = document.querySelector('[data-hook="token.total"]');
    if (el) el.textContent = String(totalPaid);
  };
})(window.PowerUp);
