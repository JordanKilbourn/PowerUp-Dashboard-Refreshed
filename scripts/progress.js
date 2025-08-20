// /scripts/progress.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  // ---------- helpers ----------
  const nowMonthNum = (new Date()).getMonth() + 1; // 1..12
  const toNum  = v => { const n = Number(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
  const toBool = v => v === true || /^(true|yes|y|1|checked)$/i.test(String(v ?? "").trim());
  const cap01  = x => Math.max(0, Math.min(1, x));
  const monthName = new Date(new Date().getFullYear(), nowMonthNum - 1, 1)
    .toLocaleString(undefined, { month: 'long' });

  function stateFor(h, min, max) {
    if (h < min) return "below";
    if (h <= max) return "met";
    return "exceeded";
  }

  function normalizeLevel(val) {
    const s = String(val || "").toUpperCase();
    const m = s.match(/(\d+)/);
    if (m) return `L${m[1]}`;
    if (/^L\d+$/.test(s)) return s;
    return "";
  }

  // Prefer Month (1..12); else derive from Date column
  function rowMonthNumber(r) {
    const m = Number(String(r["Month"] ?? "").replace(/^0+/, ""));
    if (m >= 1 && m <= 12) return m;
    const d = r["Date"] ? new Date(r["Date"]) : null;
    if (d && !isNaN(d)) return d.getMonth() + 1;
    return NaN;
  }

  async function getMonthlyGoals(employeeId) {
    try {
      const [emSheet, targetsSheet] = await Promise.all([
        fetchSheet(SHEETS.EMPLOYEE_MASTER),
        fetchSheet(SHEETS.GOALS) // "Power Hour Targets" sheet
      ]);
      const em = rowsByTitle(emSheet);
      const targets = rowsByTitle(targetsSheet);

      const me = em.find(r =>
        String(r["Employee ID"] || r["Position ID"] || "").trim() === String(employeeId).trim()
      );

      const lvlKey = normalizeLevel(me?.["PowerUp Level (Select)"]);
      const row = targets.find(t => String(t["Level"] || "").toUpperCase() === lvlKey);

      const min = toNum(row?.["Min Hours"]) || 8;
      const max = toNum(row?.["Max Hours"]) || min || 8;
      return { min, max };
    } catch {
      return { min: 8, max: 8 };
    }
  }

  // ---------- visual renderer (target band + thumb) ----------
  function renderProgress({ min, max, current }) {
    const pct    = cap01(max ? (current / max) : 0);
    const minPct = cap01(max ? (min / max) : 0);
    const state  = stateFor(current, min, max);

    const fillEl     = document.querySelector('[data-hook="ph.barFill"]');
    const bandEl     = document.querySelector('[data-hook="ph.band"]');
    const thumbEl    = document.querySelector('[data-hook="ph.thumb"]');
    const zeroLegend = document.querySelector('[data-hook="ph.zeroLegend"]');
    const minLegend  = document.querySelector('[data-hook="ph.minLegend"]');
    const maxLegend  = document.querySelector('[data-hook="ph.maxLegend"]');

    if (zeroLegend) zeroLegend.textContent = '0h';
    if (minLegend)  minLegend.textContent  = `Min — ${min.toFixed(1)}h`;
    if (maxLegend)  maxLegend.textContent  = `Max — ${max.toFixed(1)}h`;

    // band from min -> max edge
    if (bandEl) {
      bandEl.style.left  = (minPct * 100) + '%';
      bandEl.style.width = ((1 - minPct) * 100) + '%';
    }

    // fill from 0 -> current
    if (fillEl) {
      fillEl.style.width = (pct * 100) + '%';
      fillEl.classList.remove('below','met','exceeded');
      fillEl.classList.add(state);
    }

    // thumb at current
    if (thumbEl) {
      thumbEl.style.left = (pct * 100) + '%';
      thumbEl.title = `${current.toFixed(1)}h`;
    }

    return state;
  }

  // ---------- main entry ----------
  ns.renderDashboardPowerHours = async function () {
    const { employeeId } = ns.session.get();
    if (!employeeId) return;

    const phSheet = await fetchSheet(SHEETS.POWER_HOURS);
    const allRows = rowsByTitle(phSheet);

    const mine = allRows.filter(r =>
      String(r["Employee ID"] || "").trim() === String(employeeId).trim()
    );
    const rowsThisMonth = mine.filter(r => rowMonthNumber(r) === nowMonthNum);

    const allTimeCompleted = mine.reduce((s, r) => s + toNum(r["Completed Hours"]), 0);
    const scheduledHours   = mine
      .filter(r => toBool(r["Scheduled"]) && !toBool(r["Completed"]))
      .reduce((s, r) => s + toNum(r["Duration (hrs)"]), 0);

    const { min, max } = await getMonthlyGoals(employeeId);

    // UI hooks
    const totalEl   = document.querySelector('[data-hook="ph.total"]');
    const goalMaxEl = document.querySelector('[data-hook="ph.goalMax"]');
    const msgEl     = document.querySelector('[data-hook="ph.message"]');

    if (goalMaxEl) goalMaxEl.textContent = String(max);

    // Empty-state for month
    if (rowsThisMonth.length === 0) {
      ns.powerHours = { monthCompleted: 0, allTimeCompleted, scheduledHours };
      if (totalEl) totalEl.textContent = '0.0';
      renderProgress({ min, max, current: 0 });
      if (msgEl) msgEl.textContent = `No Power Hours logged for ${monthName} yet.`;
      console.log('[PH] No current-month rows', { month: nowMonthNum, monthName, mine: mine.length });
      return;
    }

    // Compute month total and render
    const monthCompleted = rowsThisMonth.reduce((sum, r) => sum + toNum(r["Completed Hours"]), 0);
    ns.powerHours = { monthCompleted, allTimeCompleted, scheduledHours };

    if (totalEl) totalEl.textContent = monthCompleted.toFixed(1);
    const state = renderProgress({ min, max, current: monthCompleted });

    // Smart message
    let msg = '';
    if (state === 'below')      msg = `Keep going — ${(min - monthCompleted).toFixed(1)} hrs to minimum`;
    else if (state === 'met')   msg = `Target met (≥ ${min.toFixed(1)} hrs)`;
    else                        msg = `Exceeded max (${monthCompleted.toFixed(1)} / ${max})`;
    if (msgEl) msgEl.textContent = msg;

    console.log('[PH]', { monthCompleted, allTimeCompleted, scheduledHours, min, max });
  };
})(window.PowerUp);
