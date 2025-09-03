
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;
  const num = (v) => { const n = Number(String(v).replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };
  const truthy = (v) => /^(true|yes|y|1|paid)$/i.test(String(v ?? "").trim());
  const norm = s => String(s||'').trim();

  function belongsToUser(row, employeeId) {
    const id = norm(employeeId);
    if (!id) return false;
    const a = norm(row["Employee ID"]);
    const b = norm(row["Position ID"]);
    return a === id || b === id;
  }

  function maybeFilterByAdminDisplay(rows) {
    if (!(ns.auth?.isAdmin && ns.auth.isAdmin())) return rows;
    // try to filter by chosen display name, if any
    return ns.auth.maybeFilterByEmployee(rows, ["Display Name","Employee Name","Name","Submitted By"]);
  }

  async function computeTotal() {
    const isAdmin = !!(ns.auth && ns.auth.isAdmin && ns.auth.isAdmin());
    const { employeeId } = ns.session.get();

    const ciSheet = await fetchSheet(SHEETS.CI);
    let rows  = rowsByTitle(ciSheet);

    // only paid tokens count
    rows = rows.filter(r => truthy(r["Paid"]));

    if (isAdmin) {
      rows = maybeFilterByAdminDisplay(rows);
      return rows.reduce((sum, r) => sum + num(r["Token Payout"]), 0);
    } else {
      const minePaid = rows.filter(r => belongsToUser(r, employeeId));
      return minePaid.reduce((sum, r) => sum + num(r["Token Payout"]), 0);
    }
  }

  ns.renderTokenCard = async function () {
    const totalEl = document.querySelector('[data-hook="token.total"]');
    const setTotal = (v) => { if (totalEl) totalEl.textContent = String(v); };

    try {
      setTotal(await computeTotal());
    } catch (err) {
      console.error("[tokens] failed to render token card:", err);
      setTotal(0);
    }
  };

  // update when admin changes employee
  document.addEventListener('powerup-admin-filter-change', async () => {
    try { await ns.renderTokenCard(); } catch {}
  });
})(window.PowerUp);

