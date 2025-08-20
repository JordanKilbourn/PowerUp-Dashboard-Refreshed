<script>
window.PowerUp = window.PowerUp || {};
(function (ns) {
  // TODO: confirm the proxy base path matches your Original. Adjust if needed.
  const API_BASE = "/api/smartsheet"; // e.g., your Render proxy routes

  // Sheet IDs (use your authoritative IDs)
  const SHEETS = {
    EMPLOYEE_MASTER: "2195459817820036",
    GOALS: "3542697273937796",
    POWER_HOURS: "1240392906264452",
    CI: "6584024920182660",
    SAFETY: "4089265651666820",
    QUALITY: "1431258165890948"
  };

  async function fetchSheet(sheetId) {
    const res = await fetch(`${API_BASE}/sheet/${sheetId}`);
    if (!res.ok) throw new Error(`Smartsheet fetch failed ${res.status}`);
    return res.json();
  }

  // Light cache so search/sort can reuse rows without refetching
  const Cache = {
    set(key, value) { this[key] = value; },
    get(key) { return this[key]; }
  };

  ns.api = { fetchSheet, SHEETS, Cache };
})(window.PowerUp);
</script>
