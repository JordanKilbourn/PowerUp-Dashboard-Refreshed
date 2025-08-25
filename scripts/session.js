// /scripts/session.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const STORAGE_KEY = "pu.session.v1";

  // --- tiny helpers --------------------------------------------------------
  const normalizeId = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  const pick = (row, ...names) => {
    for (const n of names) {
      if (row[n] != null && String(row[n]).trim() !== "") return String(row[n]).trim();
    }
    return "";
  };

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }
  function save(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s || {}));
  }

  // --- public session accessors -------------------------------------------
  function get() { return load(); }
  function set(s) { save({ ...(load()), ...(s || {}) }); }
  function clear() { localStorage.removeItem(STORAGE_KEY); }

  // --- login by Position ID OR Employee ID --------------------------------
  async function loginWithId(idInput) {
    const id = normalizeId(idInput);
    if (!id) throw new Error("Please enter your Position ID or Employee ID.");

    const { SHEETS, getRowsByTitle } = ns.api;
    // Pull Employee Master using your current proxy & helper
    const rows = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);

    // We’ll try to match against “Position ID” or “Employee ID”
    // (Handles different column names you’ve used across sheets)
    const match = rows.find((r) => {
      const pos = normalizeId(pick(r, "Position ID", "PositionID"));
      const emp = normalizeId(pick(r, "Employee ID", "EmployeeID"));
      return pos === id || emp === id;
    });

    if (!match) {
      throw new Error("We couldn’t find that ID in Employee Master. Double-check and try again.");
    }

    // derive display name / level from common columns you’ve used
    const displayName = pick(
      match,
      "Preferred Name",
      "Employee Name",
      "Display Name",
      "Name"
    ) || "—";

    const level = pick(match, "Level", "Lvl", "Level (calc)", "PowerUp Level") || "—";

    const positionId = pick(match, "Position ID", "PositionID");
    const employeeId = pick(match, "Employee ID", "EmployeeID") || positionId;

    // store session
    const session = { employeeId, positionId, displayName, level };
    save(session);

    // bounce to dashboard (login.html calls this and expects us to redirect)
    location.href = "Dashboard-Refresh.html";
  }

  // --- protect pages that require auth ------------------------------------
  function requireLogin() {
    const s = load();
    if (!s || !s.employeeId) {
      if (!/login\.html$/i.test(location.pathname)) {
        location.href = "login.html";
      }
      return false;
    }
    return true;
  }

  // --- header wiring for your current dashboard markup --------------------
  async function initHeader() {
    const s = load();
    const $ = (sel) => document.querySelector(sel);

    const nameEl  = $('[data-hook="userName"]');
    const levelEl = $('[data-hook="userLevel"]');

    if (nameEl)  nameEl.textContent  = s.displayName || "—";
    if (levelEl) levelEl.textContent = s.level ? `Lvl ${s.level}`.replace(/^Lvl Lvl/i, "Lvl ") : "Level Unknown";

    // Optional logout button if present
    const logoutBtn = $('[data-hook="logout"]');
    if (logoutBtn && !logoutBtn.__wired) {
      logoutBtn.__wired = true;
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        clear();
        location.href = "login.html";
      });
    }
  }

  ns.session = { get, set, clear, loginWithId, requireLogin, initHeader };
})(window.PowerUp);
