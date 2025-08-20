// /scripts/progress.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  const nowMonthNum = (new Date()).getMonth() + 1; // 1..12

  const toNum  = v => { const n = Number(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
  const toBool = v => v === true || /^(true|yes|y|1|checked)$/i.test(String(v ?? "").trim());

  function cap01(x){ return Math.max(0, Math.min(1, x)); }

  function setBar(el, pct, state) {
    if (!el) return;
    el.style.width = Math.round(cap01(pct) * 100) + "%";
    el.classList.remove("below","met","exceeded");
    if (state) el.classList.add(state);
  }
  function stateFor(h, min, max) { return h < min ? "below" : (h <= max ? "met" : "exceeded"); }

  // Normalize "LVL 2", "Lvl 2", "L2" -> "L2"
  function normalizeLevel(val) {
    const s = String(val || "").toUpperCase();
    const m = s.match(/(\d+)/);
    if (m) return `L${m[1]}`;
    if (/^L\d+$/.test(s)) return s;
    return "";
  }

  // Prefer Month (1..12); if missing/invalid, derive from Date
  function rowMonthNumber(r) {
    const m = Number(String(r["Month"] ?? "").replace(/^0+/, "")); // "08" -> 8
    if (m >= 1 && m <= 12) return m;
    const d = r["Date"] ? new Date(r["Date"]) : null;
    if (d && !isNaN(d)) return d.getMonth() + 1;
    return NaN;
  }

  async function getMonthlyGoals(employeeId) {
    try {
      const [emSheet, targetsSheet] = await Promise.all([
        fetchSheet(SHEETS.EMPLOYEE_MASTER),
        fetchSheet(SHEETS.GOALS) // "Power Hour Targets"
      ]);
      const em = rowsByTitle(emSheet);
      const targets = rowsByTitle(targetsSheet);
      const me = em.find(r => String(r["Employee ID"] || r["Position ID"] || "").trim() === String(employeeId).trim());
      const lvlKey = normalizeLevel(me?.["PowerUp Level (Select)"]);
      const row = targets.find(t => String(t["Level"] || "").toUpperCase() === lvlKey);
      const min = toNum(row?.["Min Hours"]) || 8;
      const max = toNum(row?.["Max Hours"]) || min || 8;
      return { min, max, levelText: me?.["PowerUp Level (Select)"] || "" };
    } catch { return { min: 8, max: 8, levelText: "" }; }
  }

  ns.renderDashboardPowerHours = async function () {
    const { employeeId } = ns.session.get();
    if (!employeeId) return;

    const phSheet = await fetchSheet(SHEETS.POWER_HOURS);
    const allRows = rowsByTitle(phSheet);

    const mine = allRows.filter(r => String(r["Employee ID"] || "").trim() === String(employeeId).trim());
    const rowsThisMonth = mine.filter(r => rowMonthNumber(r) === nowMonthNum);

    // scheduled & all-time (for later pages)
    const allTimeCompleted = mine.reduce((s, r) => s + toNum(r["Completed Hours"]), 0);
    const scheduledHours = mine
      .filter(r => toBool(r["Scheduled"]) && !toBool(r["Completed"]))
      .reduce((s, r) => s + toNum(r["Duration (hrs)"]), 0);

    const monthName = new Date(new Date().getFullYear(), nowMonthNum - 1, 1)
      .toLocaleString(undefined, { month: 'long' });

    const { min, max } = await getMonthlyGoals(employeeId);

    // UI targets
    const totalEl   = document.querySelector('[data-hook="ph.total"]');
    const goalMaxEl = document.querySelector('[data-hook="ph.goalMax"]');
    const barEl     = document.querySelector('[data-hook="ph.barFill"]') || document.querySelector('.power-card .progress-bar .progress-bar-inner');
    const msgEl     = document.querySelector('[data-hook="ph.message"]');
    const minMark   = document.querySelector('[data-hook="ph.minMarker"]');
    const maxMark   = document.querySelector('[data-hook="ph.maxMarker"]');
    const minLegend = document.querySelector('[data-hook="ph.minLegend"]');
    const maxLegend = document.querySelector('[data-hook="ph.maxLegend"]');

    // Marker positions
    if (minMark) minMark.style.left = (cap01(max ? (min/max) : 0) * 100) + '%';
    if (maxMark) maxMark.style.left = '100%';
    if (minLegend) minLegend.textContent = `Min — ${min.toFixed(1)}h`;
    if (maxLegend) maxLegend.textContent = `Max — ${max.toFixed(1)}h`;

    // Empty-state for the month
    if (rowsThisMonth.length === 0) {
      ns.powerHours = { monthCompleted: 0, allTimeCompleted, scheduledHours };
      if (totalEl)   totalEl.textContent   = '0.0';
      if (goalMaxEl) goalMaxEl.textContent = String(max);
      setBar(barEl, 0, 'below');
      if (msgEl) msgEl.textContent = `No Power Hours logged for ${monthName} yet.`;
      console.log('[PH] No current-month rows', { month: nowMonthNum, monthName, mine: mine.length });
      return;
    }

    // Compute month
    const monthCompleted = rowsThisMonth.reduce((sum, r) => sum + toNum(r["Completed Hours"]), 0);
    ns.powerHours = { monthCompleted, allTimeCompleted, scheduledHours };

    if (totalEl)   totalEl.textContent   = monthCompleted.toFixed(1);
    if (goalMaxEl) goalMaxEl.textContent = String(max);

    const pct   = max ? (monthCompleted / max) : 0;
    const state = stateFor(monthCompleted, min, max);
    setBar(barEl, pct, state);

    let msg = '';
    if (state === 'below')      msg = `Keep going — ${(min - monthCompleted).toFixed(1)} hrs to minimum`;
    else if (state === 'met')   msg = `Target met (≥ ${min.toFixed(1)} hrs)`;
    else                        msg = `Exceeded max (${monthCompleted.toFixed(1)} / ${max})`;
    if (msgEl) msgEl.textContent = msg;

    console.log('[PH]', { monthCompleted, allTimeCompleted, scheduledHours, min, max, pct: Math.round(cap01(pct)*100) });
  };
})(window.PowerUp);
