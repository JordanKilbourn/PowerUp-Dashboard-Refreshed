
window.PowerUp = window.PowerUp || {};
(function (ns) {
  // If your proxy base is different, change this:
  const API_BASE = "/api/smartsheet";

  // Keep these key names exactly (CI / SAFETY / QUALITY) so other scripts work
  const SHEETS = {
    EMPLOYEE_MASTER: "2195459817820036",
    GOALS:           "3542697273937796",
    POWER_HOURS:     "1240392906264452",

    // ✅ your corrected IDs:
    CI:              "6797575881445252",
    SAFETY:          "3310696565526404",
    QUALITY:         "8096237664292740"
  };

  async function fetchSheet(id) {
    const res = await fetch(`${API_BASE}/sheet/${id}`);
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    return res.json();
  }

  const Cache = { set(k, v){ this[k] = v; }, get(k){ return this[k]; } };

  ns.api = { fetchSheet, SHEETS, Cache };
})(window.PowerUp);

