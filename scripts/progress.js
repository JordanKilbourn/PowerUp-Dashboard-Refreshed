// /scripts/progress.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  function monthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function setBar(fillEl, pct, state) {
    if (!fillEl) return;
    fillEl.style.width = Math.max(0, Math.min(100, pct)) + "%";
    fillEl.classList.remove("below","met","exceeded");
    if (state) fillEl.classList.add(state);
  }
  function pickState(hours, minGoal, maxGoal) {
    if (hours < minGoal) return "below";
    if (hours <= maxGoal) return "met";
    return "exceeded";
  }

  async function computeGoalsFromEmployeeMaster(employeeId) {
    const [emSheet, goalsSheet] = await Promise.all([
      fetchSheet(SHEETS.EMPLOYEE_MASTER),
      fetchSheet(SHEETS.GOALS)
    ]);
    const emRows = rowsByTitle(emSheet);
    const goals  = rowsByTitle(goalsSheet);

    const user = emRows.find(r => String(r["Position ID"]||"").trim() === String(employeeId).trim());
    const level = user?.["PowerUp Level (Select)"] || "Unknown";

    const row = goals.find(g => String(g["Level"]||"").trim() === String(level).trim()) || {};
    return {
      min: Number(row["Min"]) || 8,
      max: Number(row["Max"]) || Number(row["Min"]) || 8,
      level
    };
  }

  function sumHours(rows, filterFn) {
    return rows.filter(filterFn)
      .reduce((sum, r) => sum + (Number(r["Completed Hours"] || 0) || 0), 0);
  }

  ns.renderDashboardPowerHours = async function () {
    const { employeeId } = ns.session.get();
    if (!employeeId) return;

    const [phSheet, goals] = await Promise.all([
      fetchSheet(SHEETS.POWER_HOURS),
      computeGoalsFromEmployeeMaster(employeeId)
    ]);
    const phRows = rowsByTitle(phSheet);
    const mk = monthKey();

    const myMonthHours = sumHours(phRows, r => {
      const emp = String(r["Employee ID"] || r["Position ID"] || "").trim();
      const mkCell = String(r["MonthKey"] || r["Month Key"] || "").trim();
      return emp === employeeId && mkCell === mk;
    });

    const totalEl   = document.querySelector('[data-hook="ph.total"]');
    const goalMaxEl = document.querySelector('[data-hook="ph.goalMax"]');
    const fillEl    = document.querySelector('[data-hook="ph.barFill"]');
    const msgEl     = document.querySelector('[data-hook="ph.message"]');

    if (totalEl)   totalEl.textContent   = myMonthHours.toFixed(1);
    if (goalMaxEl) goalMaxEl.textContent = String(goals.max);

    const pct = (myMonthHours / (goals.max || 1)) * 100;
    const state = pickState(myMonthHours, goals.min, goals.max);
    setBar(fillEl, pct, state);

    let msg = "";
    if (state === "below") msg = `Keep going — ${(goals.min - myMonthHours).toFixed(1)} hrs to minimum`;
    else if (state === "met") msg = `Target met! (${myMonthHours.toFixed(1)} hrs)`;
    else msg = `Exceeded! (${myMonthHours.toFixed(1)} hrs)`;
    if (msgEl) msgEl.textContent = msg;
  };
})(window.PowerUp);
