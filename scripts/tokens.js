<script>
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, SHEETS } = ns.api;

  ns.renderTokenCard = async function () {
    const { employeeId } = ns.session.get();
    if (!employeeId) return;
    const ci = await fetchSheet(SHEETS.CI);
    const total = (ci.rows || [])
      .filter(r => String(r["Employee ID"]||"").trim() === employeeId)
      .reduce((s, r) => s + (Number(r["Token Payout"]||0) || 0), 0);

    const el = document.querySelector('[data-hook="token.total"]');
    if (el) el.textContent = total.toString();
  };
})(window.PowerUp);
</script>
