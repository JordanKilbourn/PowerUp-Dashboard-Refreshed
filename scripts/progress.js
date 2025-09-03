// /scripts/progress.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  // ---------- helpers ----------
  const now = new Date();
  const nowMonthNum = now.getMonth() + 1; // 1..12
  const monthName = now.toLocaleString(undefined, { month: 'long' });

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

  // Prefer Month (1..12); else derive from Date column
  function rowMonthNumber(r) {
    const m = Number(String(r["Month"] ?? "").replace(/^0+/, ""));
    if (m >= 1 && m <= 12) return m;
    const d = r["Date"] ? new Date(r["Date"]) : null;
    if (d && !isNaN(d)) return d.getMonth() + 1;
    return NaN;
  }

  async function getMonthlyGoalsForEmployee(employeeId) {
    try {
      const [emSheet, targetsSheet] = await Promise.all([
        fetchSheet(SHEETS.EMPLOYEE_MASTER),
        fetchSheet(SHEETS.POWER_HOUR_GOALS) // Power Hour Targets
      ]);
      const em = rowsByTitle(emSheet);
      const targets = rowsByTitle(targetsSheet);

      const me = em.find(r =>
        String(r["Employee ID"] || r["Position ID"] || "").trim() === String(employeeId).trim()
      );

      const lvlKey = normalizeLevel(me?.["PowerUp Level (Select)"]);
      const row = targets.find(t => String(t["Level"] || "").toUpperCase() === lvlKey);

      const min = Number(row?.["Min Hours"]) || 8;
      const max = Number(row?.["Max Hours"]) || min || 8;
      return { min, max };
    } catch {
      return { min: 8, max: 8 };
    }
  }

  // ---------- visual renderer (Progress V2) ----------
  function renderProgressV2({ min, max, current, neutral = false }) {
    const pct    = neutral ? 1 : cap01(max ? (current / max) : 0);
    const minPct = neutral ? 0 : cap01(max ? (min / max) : 0);

    const track  = document.querySelector('[data-hook="ph.track"]');
    const fill   = document.querySelector('[data-hook="ph.fill"]');
    const band   = document.querySelector('[data-hook="ph.band"]');
    const thumb  = document.querySelector('[data-hook="ph.thumb"]');

    const state = neutral ? 'met' : stateFor(current, min, max);

    // min→max band
    if (band) {
      band.style.left  = neutral ? '0%' : (minPct * 100) + '%';
      band.style.width = neutral ? '0%' : ((1 - minPct) * 100) + '%';
    }

    // 0→current fill
    if (fill) {
      fill.style.width = (pct * 100) + '%';
      fill.classList.remove('below','met','exceeded');
      fill.classList.add(state);
    }

    // thumb position
    if (thumb) {
      thumb.style.left = (pct * 100) + '%';
      thumb.title = `${current.toFixed(1)}h`;
    }

    // a11y progress values
    if (track) {
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(neutral ? current : max));
      track.setAttribute('aria-valuenow', String(Math.max(0, Math.min(current, neutral ? current : max))));
    }

    return state;
  }

  // ----- SMART message builder -----
  function setSmartMessage({ monthCompleted, min, max, neutral = false }) {
    const msgEl = document.querySelector('[data-hook="ph.message"]');
    if (!msgEl) return;

    if (neutral) {
      msgEl.textContent = `Admin view: ${monthCompleted.toFixed(1)}h logged across all employees in ${monthName}.`;
      msgEl.className = `ph-msg ok`;
      return;
    }

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

  // ---------- main entry ----------
  ns.renderDashboardPowerHours = async function () {
    const phSheet = await fetchSheet(SHEETS.POWER_HOURS);
    const allRows = rowsByTitle(phSheet);

    // Determine scope
    let scoped = allRows;
    let neutral = false; // true when admin viewing "All Employees"
    let employeeIdForGoals = null;

    if (ns.auth?.maybeFilterByEmployee) {
      // If admin & filter=All → keep all rows and set neutral=true
      const saved = sessionStorage.getItem('pu.adminEmployeeFilter') || '__ALL__';
      const admin = ns.auth.isAdmin && ns.auth.isAdmin();
      if (admin) {
        if (saved !== '__ALL__') {
          // scope by display name / id
          const cols = ['Employee ID','Position ID','Display Name','Employee Name','Name'];
          scoped = ns.auth.maybeFilterByEmployee(allRows, cols);
          // try to discover an ID from scoped rows for goals
          const any = scoped.find(r => r['Employee ID'] || r['Position ID']);
          employeeIdForGoals = (any && (any['Employee ID'] || any['Position ID'])) || null;
        } else {
          neutral = true; // admin ALL
        }
      } else {
        // non-admin: filter to self
        const { employeeId } = ns.session.get();
        scoped = allRows.filter(r => String(r["Employee ID"] || r["Position ID"] || "").trim() === String(employeeId || "").trim());
        employeeIdForGoals = employeeId || null;
      }
    } else {
      // no roles helper available; fallback to self
      const { employeeId } = ns.session.get();
      scoped = allRows.filter(r => String(r["Employee ID"] || r["Position ID"] || "").trim() === String(employeeId || "").trim());
      employeeIdForGoals = employeeId || null;
    }

    const rowsThisMonth = scoped.filter(r => rowMonthNumber(r) === nowMonthNum);

    const monthCompleted = rowsThisMonth.reduce((sum, r) => sum + num(r["Completed Hours"]), 0);

    // UI hooks
    const totalEl   = document.querySelector('[data-hook="ph.total"]');
    const goalMaxEl = document.querySelector('[data-hook="ph.goalMax"]');

    if (totalEl) totalEl.textContent = monthCompleted.toFixed(1);

    if (neutral) {
      if (goalMaxEl) goalMaxEl.textContent = '—';
      renderProgressV2({ min: 0, max: 0, current: monthCompleted, neutral: true });
      setSmartMessage({ monthCompleted, min: 0, max: 0, neutral: true });
      return;
    }

    // Use goals for the chosen employee
    const { min, max } = await getMonthlyGoalsForEmployee(employeeIdForGoals || (ns.session.get().employeeId || ''));

    if (goalMaxEl) goalMaxEl.textContent = String(max);
    renderProgressV2({ min, max, current: monthCompleted, neutral: false });
    setSmartMessage({ monthCompleted, min, max, neutral: false });
  };

  // Recompute on admin scope change
  document.addEventListener('powerup-admin-filter-change', () => {
    try { ns.api.clearCache(); } catch {}
    ns.renderDashboardPowerHours();
  });

})(window.PowerUp);
