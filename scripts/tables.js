// scripts/tables.js (diagnostic header dump)
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});

  // ---- TEMP: Dump actual Smartsheet headers ----
  async function dumpHeaders() {
    try {
      const { SHEETS, fetchSheet } = PowerUp.api;
      const ci = await fetchSheet(SHEETS.CI);
      const safety = await fetchSheet(SHEETS.SAFETY);
      const quality = await fetchSheet(SHEETS.QUALITY);

      console.group("[PowerUp] Smartsheet Headers");
      console.log("CI:", ci.columns.map(c => c.title));
      console.log("Safety:", safety.columns.map(c => c.title));
      console.log("Quality:", quality.columns.map(c => c.title));
      console.groupEnd();
    } catch (err) {
      console.error("Failed to dump headers", err);
    }
  }

  // Run the dump as soon as the page loads
  document.addEventListener("DOMContentLoaded", dumpHeaders);

  // ---- Minimal stub so app doesn’t break ----
  async function hydrateDashboardTables() {
    console.warn("hydrateDashboardTables skipped (diagnostic mode).");
  }

  P.tables = { hydrateDashboardTables };
  window.PowerUp = P;
})(window.PowerUp || {});
