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

  async function getMonthlyGoals(employeeId) {
    try {
      const [emSheet, targetsSheet] = await Promise.all([
        fetchSheet(SHEETS.EMPLOYEE_MASTER),
        fetchSheet(SHEETS.GOALS) // Power Hour Targets
      ]);
      const em = rowsByTitle(emSheet);
      const targets = rowsByTitle(targetsSheet);

      const me = em.find(r =>
        String(r["Employee ID"] || r["Position ID"] || "").trim() === String(employeeId).trim()
      );

      const lvlKey = normalizeLevel(me?.["PowerUp Level (Select)"]);
      const row = targets.find(t => String(t["Level"] || "").toUpperCase() === lvlKey);

      const min = num(row?.["Min Hours"]) || 8;
      const max = num(row?.["Max Hours"]) || min || 8;
      return { min, max };
    } catch {
      return { min: 8, max: 8 };
    }
  }

  // ---------- visual renderer (Progress V2) ----------
  function renderProgressV2({ min, max, current }) {
    const pct    = cap01(max ? (current / max) : 0);
    const minPct = cap01(max ? (min / max) : 0);

    const track  = document.querySelector('[data-hook="ph.track"]');
    const fill   = document.querySelector('[data-hook="ph.fill"]');
    const band   = document.querySelector('[data-hook="ph.band"]');
    const thumb  = document.querySelector('[data-hook="ph.thumb"]');

    const minMarker = document.querySelector('[data-hook="ph.minMarker"]');
    const maxMarker = document.querySelector('[data-hook="ph.maxMarker"]');
    const minLabel  = document.querySelector('[data-hook="ph.minLabel"]');
    const maxLabel  = document.querySelector('[data-hook="ph.maxLabel"]');

    const state = stateFor(current, min, max);

    // band (min -> max)
    if (band) {
      band.style.left  = (minPct * 100) + '%';
      band.style.width = ((1 - minPct) * 100) + '%';
    }

    // 0 -> current fill
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

    // floating min/max bubbles positioning + labels
    const placeBubble = (el, percent, labelEl, labelText) => {
      if (!el || !track) return;
      el.style.left = (percent * 100) + '%';
      if (labelEl) labelEl.textContent = labelText;
      el.title = labelText;
    };
    placeBubble(minMarker, minPct, minLabel, `MIN (${min.toFixed(1)}h)`);
    placeBubble(maxMarker, 1,      maxLabel, `MAX (${max.toFixed(1)}h)`);

    // a11y progress values
    if (track) {
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(max));
      track.setAttribute('aria-valuenow', String(Math.max(0, Math.min(current, max))));
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

    const allTimeCompleted = mine.reduce((s, r) => s + num(r["Completed Hours"]), 0);
    const scheduledHours   = mine
      .filter(r => bool(r["Scheduled"]) && !bool(r["Completed"]))
      .reduce((s, r) => s + num(r["Duration (hrs)"]), 0);

    const { min, max } = await getMonthlyGoals(employeeId);

    // UI hooks
    const totalEl   = document.querySelector('[data-hook="ph.total"]');
    const goalMaxEl = document.querySelector('[data-hook="ph.goalMax"]');
    const msgEl     = document.querySelector('[data-hook="ph.message"]');

    if (goalMaxEl) goalMaxEl.textContent = String(max);

    // Empty month UX
    if (rowsThisMonth.length === 0) {
      ns.powerHours = { monthCompleted: 0, allTimeCompleted, scheduledHours };
      if (totalEl) totalEl.textContent = '0.0';
      renderProgressV2({ min, max, current: 0 });
      if (msgEl) msgEl.textContent = `No Power Hours logged for ${monthName} yet.`;
      return;
    }

    // Compute current month
    const monthCompleted = rowsThisMonth.reduce((sum, r) => sum + num(r["Completed Hours"]), 0);
    ns.powerHours = { monthCompleted, allTimeCompleted, scheduledHours };

    if (totalEl) totalEl.textContent = monthCompleted.toFixed(1);
    const state = renderProgressV2({ min, max, current: monthCompleted });

    // Smart message
    let msg = '';
    if (state === 'below')      msg = `Keep going — ${(min - monthCompleted).toFixed(1)} hrs to minimum`;
    else if (state === 'met')   msg = `Target met (≥ ${min.toFixed(1)} hrs)`;
    else                        msg = `Exceeded max (${monthCompleted.toFixed(1)} / ${max})`;
    if (msgEl) msgEl.textContent = msg;
  };
})(window.PowerUp);
