<!-- /scripts/api.js -->
<script>
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
    // (add others here later if needed, e.g. LEVEL_TRACKER)
  };

  async function fetchSheet(id) {
    if (!id) throw new Error("fetchSheet: missing sheet id");
    const res = await fetch(`${API_BASE}/sheet/${id}`, { credentials: "omit" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Proxy error ${res.status}: ${body || "(no body)"}`);
    }
    return res.json(); // raw Smartsheet shape
  }

  // Convert Smartsheet rows into simple objects keyed by column title
  function rowsByTitle(sheet) {
    const colTitleById = {};
    (sheet.columns || []).forEach(c => { colTitleById[c.id] = c.title; });
    return (sheet.rows || []).map(r => {
      const o = {};
      (r.cells || []).forEach(cell => {
        const title = colTitleById[cell.columnId];
        if (!title) return;
        o[title] = cell.displayValue ?? cell.value ?? "";
      });
      return o;
    });
  }

  // 🔙 Backcompat helper (what session.js expects)
  async function getRowsByTitle(sheetId) {
    const raw = await fetchSheet(sheetId);
    return rowsByTitle(raw);
  }

  // tiny numeric helper (used by tokens/tables in some versions)
  function toNumber(v) {
    const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  // super-simple in-memory cache (unchanged)
  const Cache = { set(k, v) { this[k] = v; }, get(k) { return this[k]; } };

  ns.api = { API_BASE, SHEETS, fetchSheet, rowsByTitle, getRowsByTitle, toNumber, Cache };
})(window.PowerUp);
</script>
