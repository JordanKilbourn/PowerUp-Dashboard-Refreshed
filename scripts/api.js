// /scripts/api.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  // 🔴 IMPORTANT: Use the FULL proxy URL so requests don't resolve to the static site
  // If you later mount the proxy under the same domain (e.g., /api/smartsheet), you can switch back.
  const API_BASE = "https://powerup-proxy.onrender.com";

  // Keep these keys as-is; other scripts reference CI / SAFETY / QUALITY
  const SHEETS = {
    EMPLOYEE_MASTER: "2195459817820036",
    GOALS:           "3542697273937796",
    POWER_HOURS:     "1240392906264452",
    CI:              "6797575881445252",
    SAFETY:          "3310696565526404",
    QUALITY:         "8096237664292740",
  };

  async function fetchSheet(id) {
    const res = await fetch(`${API_BASE}/sheet/${id}`, { credentials: "omit" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Proxy error ${res.status}: ${body || "(no body)"}`);
    }
    return res.json();
  }

  const Cache = { set(k, v) { this[k] = v; }, get(k) { return this[k]; } };

  ns.api = { fetchSheet, SHEETS, Cache };
})(window.PowerUp);
