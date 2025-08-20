// /scripts/progress.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

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

  // Derive 'YYYY-MM' from Month Key / Month / Date
  function rowMonthKey(r) {
    const mk = r["MonthKey"] || r["Month Key"];
    if (mk) return String(mk).slice(0, 7);
    const m = r["Month"];
    if (m) {
      const d = new Date(m);
      if (!isNaN(d)) return monthKey(d);
    }
    const d = new Date(r["Date"]);
    if (!isNaN(d)) return monthKey(d);
    return "";
  }

  function sumCompletedHours(rows, employeeId, targetMk) {
    return rows
      .filter(r => {
        const id = String(r["Employee ID"] || r["Position ID"] || "").trim();
        return id === employeeId && rowMonthKey(r) === targetMk;
      })
      .reduce((sum, r) => {
        const ch = Number(r["Completed Hours"]) || 0;
        return sum + ch;
      }, 0);
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

    const hours = sumCompletedHours(phRows, employeeId, mk);

    const totalEl   = document.querySelector('[data-hook="ph.total"]');
    const goalMaxEl = document.querySelector('[data-hook="ph.goalMax"]');
    const fillEl    = document.querySelector('[data-hook="ph.barFill"]');
    const msgEl     = document.querySelector('[data-hook="ph.message"]');

    if (totalEl)   totalEl.textContent   = hours.toFixed(1);
    if (goalMaxEl) goalMaxEl.textContent = String(goals.max);

    const pct = (hours / (goals.max || 1)) * 100;
    const state = pickState(hours, goals.min, goals.max);
    setBar(fillEl, pct, state);

    let msg = "";
    if (state === "below") msg = `Keep going — ${(goals.min - hours).toFixed(1)} hrs to minimum`;
    else if (state === "met") msg = `Target met! (${hours.toFixed(1)} hrs)`;
    else msg = `Exceeded! (${hours.toFixed(1)} hrs)`;
    if (msgEl) msgEl.textContent = msg;
  };
})(window.PowerUp);
