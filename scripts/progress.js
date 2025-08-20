// /scripts/progress.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  // --- helpers ---------------------------------------------------------------

  // Current month key "YYYY-MM"
  const thisMonthKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}`;
  })();

  // Try to normalize any of ['Month Key','MonthKey','Month','Date'] to "YYYY-MM"
  function rowMonthKey(r) {
    const mk = r["Month Key"] || r["MonthKey"];
    if (mk) return String(mk).slice(0, 7); // assume "YYYY-MM..." or exact

    const m = r["Month"] ?? r["month"];
    if (m) {
      const d = tryParseDate(m);
      if (d) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, "0")}`;
    }

    const d2 = tryParseDate(r["Date"]);
    if (d2) return `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2, "0")}`;

    return ""; // unknown
  }

  function tryParseDate(v) {
    if (!v) return null;
    // Works for ISO, MM/DD/YYYY, YYYY-MM, Smartsheet's display, etc.
    const d = new Date(v);
    if (!isNaN(d)) return d;

    // Try common "MM/YYYY"
    const m = String(v).match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const mm = Number(m[1]) - 1, yyyy = Number(m[2]);
      const d2 = new Date(yyyy, mm, 1);
      return isNaN(d2) ? null : d2;
    }
    return null;
  }

  function num(v) {
    const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function setBar(fillEl, pct, state) {
    if (!fillEl) return;
    fillEl.style.width = Math.max(0, Math.min(100, pct)) + "%";
    fillEl.classList.remove("below", "met", "exceeded");
    if (state) fillEl.classList.add(state);
  }

  function stateFor(hours, minGoal, maxGoal) {
    if (hours < minGoal) return "below";
    if (hours <= maxGoal) return "met";
    return "exceeded";
  }

  // Optional goals by level; if that fetch fails we use 8
  async function getGoalsOrDefault(employeeId) {
    try {
      const [emSheet, goalsSheet] = await Promise.all([
        fetchSheet(SHEETS.EMPLOYEE_MASTER),
        fetchSheet(SHEETS.GOALS)
      ]);
      const em = rowsByTitle(emSheet);
      const goals = rowsByTitle(goalsSheet);

      const me = em.find(r => String(r["Position ID"] || "").trim() === String(employeeId).trim());
      const level = me?.["PowerUp Level (Select)"] || "";

      const row = goals.find(g => String(g["Level"]||"").trim() === String(level).trim());
      if (row) {
        const min = num(row["Min"]); const max = num(row["Max"]) || min;
        if (min) return { min, max };
      }
      return { min: 8, max: 8 };
    } catch {
      return { min: 8, max: 8 };
    }
  }

  // --- main ------------------------------------------------------------------

  ns.renderDashboardPowerHours = async function () {
    const { employeeId } = ns.session.get();
    if (!employeeId) return;

    // 1) Get Power Hours rows
    const phSheet = await fetchSheet(SHEETS.POWER_HOURS);
    const rows = rowsByTitle(phSheet);

    // 2) Filter: this employee + current month
    const mineThisMonth = rows.filter(r => {
      const id = String(r["Employee ID"] || r["Position ID"] || "").trim();
      return id === String(employeeId).trim() && rowMonthKey(r) === thisMonthKey;
    });

    // 3) Sum Completed Hours
    const hours = mineThisMonth.reduce((sum, r) => sum + num(r["Completed Hours"]), 0);

    // 4) Goals (by level) with safe fallback
    const { min, max } = await getGoalsOrDefault(employeeId);

    // 5) Update UI
    const totalEl   = document.querySelector('[data-hook="ph.total"]');
    const goalMaxEl = document.querySelector('[data-hook="ph.goalMax"]');
    const barFill   = document.querySelector('[data-hook="ph.barFill"]');
    const msgEl     = document.querySelector('[data-hook="ph.message"]');

    if (totalEl)   totalEl.textContent   = hours.toFixed(1);
    if (goalMaxEl) goalMaxEl.textContent = String(max);

    const pct = max ? (hours / max) * 100 : 0;
    const state = stateFor(hours, min, max);
    setBar(barFill, pct, state);

    let msg = "";
    if (state === "below")   msg = `Keep going — ${(min - hours).toFixed(1)} hrs to minimum`;
    else if (state === "met")      msg = `Target met! (${hours.toFixed(1)} hrs)`;
    else                      msg = `Exceeded! (${hours.toFixed(1)} hrs)`;
    if (msgEl) msgEl.textContent = msg;

    // Optional: for quick diagnostics if something still shows 0
    // console.debug("[PH] rows:", rows.length, "mineThisMonth:", mineThisMonth.length, "hours:", hours, "min/max:", min, max, "month:", thisMonthKey);
  };
})(window.PowerUp);
