// /scripts/progress.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  // ---------- helpers ----------
  const nowMonthNum = (new Date()).getMonth() + 1; // 1..12

  const toNum = (v) => {
    const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const toBool = (v) => {
    if (v === true) return true;
    const s = String(v).trim().toLowerCase();
    return s === "true" || s === "yes" || s === "y" || s === "1" || s === "checked";
  };

  function setBar(fillEl, pct, state) {
    if (!fillEl) return;
    fillEl.style.width = Math.max(0, Math.min(100, pct)) + "%";
    fillEl.classList.remove("below","met","exceeded");
    if (state) fillEl.classList.add(state);
  }
  function stateFor(hours, minGoal, maxGoal) {
    if (hours < minGoal) return "below";
    if (hours <= maxGoal) return "met";
    return "exceeded";
  }

  // Normalize "PowerUp Level (Select)" -> L1/L2/L3 for lookup in Power Hour Targets
  function normalizeLevel(val) {
    if (!val) return "";                   // unknown
    const s = String(val).toUpperCase();   // e.g., "LVL 2", "L2", "Lvl 3"
    const m = s.match(/(\d+)/);            // first digit
    if (m) return `L${m[1]}`;              // -> "L2"
    // If sheet already stores "L1"/"L2"/"L3" without digit elsewhere, pass through:
    if (/^L[0-9]+$/.test(s)) return s;
    return ""; // no match
  }

  // Read goals from Employee Master + Power Hour Targets
  async function getMonthlyGoals(employeeId) {
    try {
      const [emSheet, targetsSheet] = await Promise.all([
        fetchSheet(SHEETS.EMPLOYEE_MASTER), // has "PowerUp Level (Select)"
        fetchSheet(SHEETS.GOALS)            // your "Power Hour Targets" sheet
      ]);
      const emRows = rowsByTitle(emSheet);
      const targets = rowsByTitle(targetsSheet);

      const me = emRows.find(r => String(r["Employee ID"] || r["Position ID"] || "").trim() === String(employeeId).trim());
      const levelKey = normalizeLevel(me?.["PowerUp Level (Select)"]);
      const row = targets.find(t => String(t["Level"] || "").toUpperCase() === levelKey);

      if (row) {
        const min = toNum(row["Min Hours"]);
        const max = toNum(row["Max Hours"]) || min || 8;
        return { min: min || 8, max: max || 8, level: me?.["PowerUp Level (Select)"] || "Unknown" };
      }
      return { min: 8, max: 8, level: me?.["PowerUp Level (Select)"] || "Unknown" };
    } catch {
      return { min: 8, max: 8, level: "Unknown" };
    }
  }

  // ---------- main ----------
  ns.renderDashboardPowerHours = async function () {
    const { employeeId } = ns.session.get();
    if (!employeeId) return;

    // 1) Read Power Hours Tracker
    const phSheet = await fetchSheet(SHEETS.POWER_HOURS);
    const rows    = rowsByTitle(phSheet);

    // Only this user's rows
    const mine = rows.filter(r => String(r["Employee ID"] || "").trim() === String(employeeId).trim());

    // 2) Current month completed hours
    const monthCompleted = mine
      .filter(r => Number(r["Month"]) === nowMonthNum)
      .reduce((sum, r) => sum + toNum(r["Completed Hours"]), 0);

    // 3) All-time completed hours
    const allTimeCompleted = mine.reduce((sum, r) => sum + toNum(r["Completed Hours"]), 0);

    // 4) Scheduled (not completed) hours — sum Duration (hrs)
    const scheduledHours = mine
      .filter(r => toBool(r["Scheduled"]) && !toBool(r["Completed"]))
      .reduce((sum, r) => sum + toNum(r["Duration (hrs)"]), 0);

    // Expose for later pages if needed
    ns.powerHours = { monthCompleted, allTimeCompleted, scheduledHours };

    // 5) Goals from Power Hour Targets (via level from Employee Master)
    const { min, max } = await getMonthlyGoals(employeeId);

    // 6) Update UI
    const totalEl   = document.querySelector('[data-hook="ph.total"]');
    const goalMaxEl = document.querySelector('[data-hook="ph.goalMax"]');
    const fillEl    = document.querySelector('[data-hook="ph.barFill"]');
    const msgEl     = document.querySelector('[data-hook="ph.message"]');

    if (totalEl)   totalEl.textContent   = monthCompleted.toFixed(1);
    if (goalMaxEl) goalMaxEl.textContent = String(max);

    const pct   = max ? (monthCompleted / max) * 100 : 0;
    const state = stateFor(monthCompleted, min, max);
    setBar(fillEl, pct, state);

    let msg = "";
    if (state === "below")   msg = `Keep going — ${(min - monthCompleted).toFixed(1)} hrs to minimum`;
    else if (state === "met")      msg = `Target met! (${monthCompleted.toFixed(1)} hrs)`;
    else                      msg = `Exceeded! (${monthCompleted.toFixed(1)} hrs)`;
    if (msgEl) msgEl.textContent = msg;

    // Optional quick check:
    // console.debug({ monthCompleted, allTimeCompleted, scheduledHours, min, max, nowMonthNum });
  };
})(window.PowerUp);
