<script>
window.PowerUp = window.PowerUp || {};
(function (ns) {
  // 🔧 If your proxy base is different, change this:
  const API_BASE = "/api/smartsheet";

  // Use your authoritative Smartsheet IDs here
  const SHEETS = {
    EMPLOYEE_MASTER: "2195459817820036",
    GOALS:           "3542697273937796",
    POWER_HOURS:     "1240392906264452",
    CI:              "6584024920182660",
    SAFETY:          "4089265651666820",
    QUALITY:         "1431258165890948"
  };

  async function fetchSheet(id) {
    const res = await fetch(`${API_BASE}/sheet/${id}`);
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    return res.json();
  }

  const Cache = { set(k, v){ this[k] = v; }, get(k){ return this[k]; } };

  ns.api = { fetchSheet, SHEETS, Cache };
})(window.PowerUp);
</script>
