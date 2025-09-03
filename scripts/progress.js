
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  const now = new Date();
  const nowMonthNum = now.getMonth() + 1;
  const num  = v => { const n = Number(String(v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : 0; };
  const bool = v => v === true || /^(true|yes|y|1|checked)$/i.test(String(v ?? "").trim());
  const cap01 = x => Math.max(0, Math.min(1, x));

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

  function rowMonthNumber(r) {
    const m = Number(String(r["Month"] ?? "").replace(/^0+/, ""));
    if (m >= 1 && m <= 12) return m;
    const d = r["Date"] ? new Date(r["Date"]) : null;
    if (d && !isNaN(d)) return d.getMonth() + 1;
    return NaN;
  }

  async function getMonthlyGoalsForEmployeeId(employeeId) {
    try {
      const [emSheet, targetsSheet] = await Promise.all([
        fetchSheet(SHEETS.EMPLOYEE_MASTER),
        fetchSheet(SHEETS.POWER_HOUR_GOALS)
      ]);
      const em = rowsByTitle(emSheet);
      const targets = rowsByTitle(targetsSheet);

      const me = em.find(r =>
        String(r["Employee ID"] || r["Position ID"] || "").trim() === String(employeeId).trim()
      );

      const sLevel = me?.["PowerUp Level (Select)"] ?? me?.["PowerUp Level"] ?? me?.["Level"];
      const lvlKey = normalizeLevel(sLevel);
      const row = targets.find(t => String(t["Level"] || "").toUpperCase() === lvlKey);

      const min = num(row?.["Min Hours"]) || 8;
      const max = num(row?.["Max Hours"]) || min || 8;
      return { min, max };
    } catch {
      return { min: 8, max: 8 };
    }
  }

  function renderProgressV2({ min, max, current }) {
    const pct    = cap01(max ? (current / max) : 0);
    const minPct = cap01(max ? (min / max) : 0);

    const track  = document.querySelector('[data-hook="ph.track"]');
    const fill   = document.querySelector('[data-hook="ph.fill"]');
    const band   = document.querySelector('[data-hook="ph.band"]');
    const thumb  = document.querySelector('[data-hook="ph.thumb"]');

    const state = stateFor(current, min, max);

    if (band) {
      band.style.left  = (minPct * 100) + '%';
      band.style.width = ((1 - minPct) * 100) + '%';
    }
    if (fill) {
      fill.style.width = (pct * 100) + '%';
      fill.classList.remove('below','met','exceeded');
      fill.classList.add(state);
    }
    if (thumb) {
      thumb.style.left = (pct * 100) + '%';
      thumb.title = `${current.toFixed(1)}h`;
    }
    if (track) {
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(max));
      track.setAttribute('aria-valuenow', String(Math.max(0, Math.min(current, max))));
    }
    return state;
  }

  function setSmartMessage({ monthCompleted, min, max }) {
    const msgEl = document.querySelector('[data-hook="ph.message"]');
    if (!msgEl) return;

    const year = now.getFullYear();
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const today = now.getDate();
    const daysLeft = Math.max(0, lastDay - today);

    const remainingToMin = Math.max(0, min - monthCompleted);
    const remainingToMax = Math.max(0, max - monthCompleted);
    const dailyPaceMin = daysLeft > 0 ? (remainingToMin / daysLeft) : remainingToMin;
    const dailyPaceMax = daysLeft > 0 ? (remainingToMax / daysLeft) : remainingToMax;

    let text = "";
    let tone = "ok";

    if (remainingToMin === 0 && remainingToMax === 0) {
      text = `🔥 Amazing! You’ve exceeded the goal (${monthCompleted.toFixed(1)} / ${max}h).`;
      tone = "exceeded";
    } else if (remainingToMin === 0) {
      text = `✅ Target met (≥ ${min.toFixed(1)}h). ${remainingToMax.toFixed(1)}h to reach the monthly max.`;
      if (daysLeft > 0) text += ` ~${dailyPaceMax.toFixed(1)}h/day for the remaining ${daysLeft} day${daysLeft!==1?'s':''}.`;
      tone = "ok";
    } else {
      const highUrgency = daysLeft <= 2 || dailyPaceMin >= 2;
      const medUrgency  = daysLeft <= 5 || dailyPaceMin >= 1;
      if (highUrgency) tone = "urgent";
      else if (medUrgency) tone = "warn";
      else tone = "ok";
      const prefix = highUrgency ? "⏳" : (medUrgency ? "⚡" : "👉");
      text = `${prefix} ${remainingToMin.toFixed(1)}h left to hit minimum (${min}h).`;
      if (daysLeft > 0) {
        text += ` ${daysLeft} day${daysLeft!==1?'s':''} left — that’s ~${dailyPaceMin.toFixed(1)}h/day.`;
      } else {
        text += ` Final day — push to finish!`;
        tone = "urgent";
      }
    }
    msgEl.textContent = text;
    msgEl.className = `ph-msg ${tone}`;
  }

  function pickDisplayName(row) {
    return row["Display Name"] || row["Employee Name"] || row["Name"] || "";
  }

  function byAdminChosenDisplay(rows) {
    return ns.auth?.maybeFilterByEmployee
      ? ns.auth.maybeFilterByEmployee(rows, ["Display Name","Employee Name","Name"])
      : rows;
  }

  async function renderDashboardPowerHours() {
    const isAdmin = !!(ns.auth && ns.auth.isAdmin && ns.auth.isAdmin());
    const { employeeId } = ns.session.get();
    const phSheet = await fetchSheet(SHEETS.POWER_HOURS);
    const allRows = rowsByTitle(phSheet);

    let working = allRows.slice();

    if (!isAdmin) {
      working = working.filter(r => String(r["Employee ID"] || "").trim() === String(employeeId).trim());
    } else {
      working = byAdminChosenDisplay(working);
    }

    const rowsThisMonth = working.filter(r => rowMonthNumber(r) === nowMonthNum);
    const monthCompleted = rowsThisMonth.reduce((sum, r) => sum + num(r["Completed Hours"]), 0);

    const totalEl   = document.querySelector('[data-hook="ph.total"]');
    const goalMaxEl = document.querySelector('[data-hook="ph.goalMax"]');

    // For goals, if admin and "All Employees" is selected, default to min/max 8/8
    // If a specific employee is selected, compute their level-based goals.
    let min=8, max=8;
    if (!isAdmin) {
      const g = await getMonthlyGoalsForEmployeeId(employeeId);
      min = g.min; max = g.max;
    } else {
      // try to infer a specific employee from current filter by looking at the first row’s name
      const filtered = byAdminChosenDisplay(allRows);
      // if one person is chosen, try to resolve their employeeId via EMPLOYEE_MASTER
      if (filtered.length) {
        try {
          const emSheet = await fetchSheet(SHEETS.EMPLOYEE_MASTER);
          const emRows = rowsByTitle(emSheet);
          const chosenName = pickDisplayName(filtered[0]);
          const em = emRows.find(r => (r["Display Name"]||r["Employee Name"]||r["Name"]) === chosenName);
          if (em) {
            const chosenId = em["Employee ID"] || em["Position ID"];
            if (chosenId) {
              const g = await getMonthlyGoalsForEmployeeId(chosenId);
              min = g.min; max = g.max;
            }
          }
        } catch {}
      }
    }

    if (goalMaxEl) goalMaxEl.textContent = String(max);
    if (totalEl) totalEl.textContent = monthCompleted.toFixed(1);
    renderProgressV2({ min, max, current: monthCompleted });
    setSmartMessage({ monthCompleted, min, max });

    ns.powerHours = {
      monthCompleted,
      allTimeCompleted: working.reduce((s, r) => s + num(r["Completed Hours"]), 0),
      scheduledHours: working
        .filter(r => bool(r["Scheduled"]) && !bool(r["Completed"]))
        .reduce((s, r) => s + num(r["Duration (hrs)"]), 0)
    };
  }

  ns.renderDashboardPowerHours = renderDashboardPowerHours;

  document.addEventListener('powerup-admin-filter-change', async () => {
    try { await ns.renderDashboardPowerHours(); } catch {}
  });
})(window.PowerUp);

