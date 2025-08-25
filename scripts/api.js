// /scripts/api.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const API_BASE = "https://powerup-proxy.onrender.com"; // your proxy

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
    return res.json(); // raw Smartsheet shape: { columns, rows:[{cells:[]}, ...], ... }
  }

  // 🔑 Helper: convert Smartsheet rows into simple objects keyed by column title
  function rowsByTitle(sheet) {
    const colTitleById = {};
    (sheet.columns || []).forEach(c => { colTitleById[c.id] = c.title; });
    return (sheet.rows || []).map(r => {
      const o = {};
      (r.cells || []).forEach(cell => {
        const title = colTitleById[cell.columnId];
        if (!title) return;
        // Prefer displayValue (human-friendly), fall back to value
        o[title] = cell.displayValue ?? cell.value ?? "";
      });
      return o;
    });
  }

  const Cache = { set(k, v) { this[k] = v; }, get(k) { return this[k]; } };

  ns.api = { fetchSheet, SHEETS, Cache, rowsByTitle };
})(window.PowerUp);
