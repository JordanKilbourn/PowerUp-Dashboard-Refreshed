// scripts/api.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const API_BASE = "https://powerup-proxy.onrender.com"; // keep your current proxy
  // Smartsheet IDs (leave as-is if these match your repo; adjust if needed)
  const SHEETS = {
    EMPLOYEE_MASTER: "2195459817820036",
    POWER_HOUR_GOALS: "3542697273937796",
    POWER_HOURS: "1240392906264452",
    CI: "6797575881445252",
    SAFETY: "3310696565526404",
    QUALITY: "8096237664292740",
    LEVEL_TRACKER: "8346763116105604"
  };

  // Lightweight caches
  const _rawCache = new Map();      // id -> raw sheet json
  const _inflight = new Map();      // id -> Promise
  const _rowsCache = new Map();     // id -> array of row objects keyed by column title

  async function fetchSheet(sheetId, { force = false } = {}) {
    if (!force) {
      if (_rawCache.has(sheetId)) return _rawCache.get(sheetId);
      if (_inflight.has(sheetId)) return _inflight.get(sheetId);
    }
    const p = (async () => {
      const res = await fetch(`${API_BASE}/sheet/${sheetId}`, { credentials: "omit" });
      if (!res.ok) throw new Error(`Proxy error ${res.status} for sheet ${sheetId}`);
      const json = await res.json();
      _rawCache.set(sheetId, json);
      _inflight.delete(sheetId);
      return json;
    })();
    _inflight.set(sheetId, p);
    return p;
  }

  function rowsByTitle(rawSheet) {
    // Map columnId -> title
    const byId = new Map(rawSheet.columns.map(c => [c.id, c.title]));
    // Build simple objects keyed by column title
    return rawSheet.rows.map(r => {
      const o = {};
      for (const cell of r.cells) {
        const title = byId.get(cell.columnId);
        if (!title) continue;
        // Prefer .displayValue when present; fallback to .value
        const v = (cell.displayValue ?? cell.value ?? "");
        o[title] = v;
      }
      return o;
    });
  }

  async function getRowsByTitle(sheetId, { force = false } = {}) {
    if (!force && _rowsCache.has(sheetId)) return _rowsCache.get(sheetId);
    const raw = await fetchSheet(sheetId, { force });
    const rows = rowsByTitle(raw);
    _rowsCache.set(sheetId, rows);
    return rows;
  }

  function clearCache(sheetId) {
    if (!sheetId) {
      _rawCache.clear(); _rowsCache.clear(); _inflight.clear(); return;
    }
    _rawCache.delete(sheetId);
    _rowsCache.delete(sheetId);
    _inflight.delete(sheetId);
  }

  // Utility: safe number parse for currency/integers in text
  function toNumber(x) {
    if (x == null) return 0;
    if (typeof x === 'number') return x;
    const m = String(x).replace(/[^0-9.\-]/g, '');
    const n = parseFloat(m);
    return isFinite(n) ? n : 0;
  }

  P.api = { API_BASE, SHEETS, fetchSheet, rowsByTitle, getRowsByTitle, clearCache, toNumber };
  window.PowerUp = P;
}(window.PowerUp || {}));
