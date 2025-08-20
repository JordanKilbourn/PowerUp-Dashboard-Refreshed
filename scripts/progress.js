
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, SHEETS } = ns.api;

  function monthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }
  function startOfDay(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
  function startOfWeek(d){ const x=startOfDay(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x; }
  function endOfDay(d){ const x=new Date(d); x.setHours(23,59,59,999); return x; }

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
    const [em, goals] = await Promise.all([
      fetchSheet(SHEETS.EMPLOYEE_MASTER),
      fetchSheet(SHEETS.GOALS)
    ]);
    const user = (em.rows || []).find(r =>
      String(r["Position ID"] || "").trim() === String(employeeId).trim()
    ) || {};
    const level = (user["PowerUp Level (Select)"] || "Unknown");
    const row = (goals.rows || []).find(r => String(r["Level"]||"").trim() === String(level).trim()) || {};
    return {
      min: Number(row["Min"]) || 8,
      max: Number(row["Max"]) || Number(row["Min"]) || 8,
      level
    };
  }

  function sumHours(rows, filterFn) {
    return rows
      .filter(filterFn)
      .reduce((sum, r) => sum + (Number(r["Completed Hours"] || 0) || 0), 0);
  }

  // Dashboard progress card
  ns.renderDashboardPowerHours = async function () {
    const { employeeId } = ns.session.get();
    if (!employeeId) return;

    const [phSheet, goals] = await Promise.all([
      fetchSheet(SHEETS.POWER_HOURS),
      computeGoalsFromEmployeeMaster(employeeId)
    ]);
    const mk = monthKey();
    const phRows = phSheet.rows || [];

    // Accept either "Employee ID" or "Position ID" in Power Hours sheet
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
    if (goalMaxEl) goalMaxEl.textContent = goals.max.toString();

    const pct = (myMonthHours / (goals.max || 1)) * 100;
    const state = pickState(myMonthHours, goals.min, goals.max);
    setBar(fillEl, pct, state);

    let msg = "";
    if (state === "below") msg = `Keep going — ${(goals.min - myMonthHours).toFixed(1)} hrs to minimum`;
    else if (state === "met") msg = `Target met! (${myMonthHours.toFixed(1)} hrs)`;
    else msg = `Exceeded! (${myMonthHours.toFixed(1)} hrs)`;
    if (msgEl) msgEl.textContent = msg;
  };

  // OPTIONAL — for the Power Hours page with timeframe dropdown:
  ns.renderPowerHoursCompact = async function () {
    const { employeeId } = ns.session.get();
    if (!employeeId) return;
    const [phSheet, goals] = await Promise.all([
      fetchSheet(SHEETS.POWER_HOURS),
      computeGoalsFromEmployeeMaster(employeeId)
    ]);
    const phRows = phSheet.rows || [];

    function compute(range) {
      const now = new Date();
      if (range === "today") {
        const s = startOfDay(now), e = endOfDay(now);
        return sumHours(phRows, r => {
          const emp = String(r["Employee ID"] || r["Position ID"] || "").trim();
          if (emp !== employeeId) return false;
          const d = new Date(r["Date"] || r["Entry Date"] || Date.now());
          return d >= s && d <= e;
        });
      }
      if (range === "week") {
        const s = startOfWeek(now), e = endOfDay(now);
        return sumHours(phRows, r => {
          const emp = String(r["Employee ID"] || r["Position ID"] || "").trim();
          if (emp !== employeeId) return false;
          const d = new Date(r["Date"] || r["Entry Date"] || Date.now());
          return d >= s && d <= e;
        });
      }
      if (range === "all") {
        return sumHours(phRows, r => String(r["Employee ID"] || r["Position ID"] || "").trim() === employeeId);
      }
      // default month
      const mk = monthKey(now);
      return sumHours(phRows, r => {
        const emp = String(r["Employee ID"] || r["Position ID"] || "").trim();
        const mkCell = String(r["MonthKey"] || r["Month Key"] || "").trim();
        return emp === employeeId && mkCell === mk;
      });
    }

    function paint(range) {
      const hours = compute(range);
      const pct = (hours / (goals.max || 1)) * 100;
      const state = pickState(hours, goals.min, goals.max);

      const totalEl = document.querySelector('[data-hook="ph.total.compact"]');
      const fillEl  = document.querySelector('[data-hook="ph.barFill.compact"]');
      const msgEl   = document.querySelector('[data-hook="ph.message.compact"]');

      if (totalEl) totalEl.textContent = hours.toFixed(1);
      setBar(fillEl, pct, state);

      let msg = "";
      if (state === "below") msg = `Need ${(goals.min - hours).toFixed(1)} hrs to hit min`;
      else if (state === "met") msg = `On target`;
      else msg = `Above target`;
      if (msgEl) msgEl.textContent = msg;
    }

    const sel = document.querySelector('[data-hook="ph.range"]');
    const current = (sel && sel.value) || "month";
    paint(current);
    if (sel) sel.addEventListener("change", () => paint(sel.value));
  };
})(window.PowerUp);

