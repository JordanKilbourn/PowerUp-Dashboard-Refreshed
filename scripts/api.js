// scripts/api.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const API_BASE = "https://powerup-proxy.onrender.com";

  // 🔐 Smartsheet IDs (verify these match your sheets)
  const SHEETS = {
    EMPLOYEE_MASTER: "2195459817820036",
    POWER_HOUR_GOALS: "3542697273937796",
    POWER_HOURS: "1240392906264452",
    CI: "6797575881445252",
    SAFETY: "3310696565526404",
    QUALITY: "8096237664292740",
    LEVEL_TRACKER: "8346763116105604",
  };

  // ---------- Caching ----------
  const _rawCache = new Map();   // id -> raw sheet json
  const _inflight = new Map();   // id -> Promise
  const _rowsCache = new Map();  // id -> array of row objects keyed by column title

  // ---------- Helpers ----------
  function resolveSheetId(sheetIdOrKey) {
    // Allow calling with a key ("CI") or a raw numeric string id ("6797...")
    if (sheetIdOrKey == null) return "";
    const s = String(sheetIdOrKey).trim();

    // If they passed the key name, map to the real ID
    if (SHEETS.hasOwnProperty(s)) return String(SHEETS[s]).trim();

    // Otherwise assume it's already an ID
    return s;
  }

  function assertValidId(id) {
    if (!id || id.toLowerCase() === "undefined" || id.toLowerCase() === "null") {
      const mapping = Object.entries(SHEETS)
        .map(([k, v]) => `${k}: ${v ? v : "MISSING"}`)
        .join(" | ");
      const msg =
        "Missing Smartsheet ID: a call was made with an empty/undefined id.\n" +
        "Check scripts/api.js SHEETS{...} and the caller’s argument.\n" +
        `Current SHEETS -> ${mapping}`;
      console.error(msg);
      throw new Error("Missing Smartsheet ID (see console for mapping).");
    }
  }

  // ---------- Core fetchers ----------

function resolveSheetId(sheetIdOrKey) {
  if (sheetIdOrKey == null) return "";
  const s = String(sheetIdOrKey).trim();
  if (SHEETS.hasOwnProperty(s)) return String(SHEETS[s]).trim();
  return s; // assume raw ID
}

function assertValidId(id, hint) {
  if (!id || id.toLowerCase() === "undefined" || id.toLowerCase() === "null") {
    const mapping = Object.entries(SHEETS).map(([k, v]) => `${k}: ${v || "MISSING"}`).join(" | ");
    console.error("Missing Smartsheet ID: a call was made with an empty/undefined id.", {
      hint,
      id,
      mapping,
    });
    console.trace("Call stack for missing sheetId");
    throw new Error("Missing Smartsheet ID (see console for mapping and stack).");
  }
}

async function fetchSheet(sheetIdOrKey, { force = false } = {}) {
  const id = resolveSheetId(sheetIdOrKey);
  assertValidId(id, `fetchSheet(arg=${String(sheetIdOrKey)})`);

  if (!force) {
    if (_rawCache.has(id)) return _rawCache.get(id);
    if (_inflight.has(id)) return _inflight.get(id);
  }
  const p = (async () => {
    const res = await fetch(`${API_BASE}/sheet/${id}`, { credentials: "omit" });
    if (!res.ok) {
      let detail = ""; try { detail = await res.text(); } catch {}
      throw new Error(`Proxy error ${res.status} for sheet ${id}${detail ? `: ${detail}` : ""}`);
    }
    const json = await res.json();
    _rawCache.set(id, json);
    _inflight.delete(id);
    return json;
  })();
  _inflight.set(id, p);
  return p;
}

async function getRowsByTitle(sheetIdOrKey, { force = false } = {}) {
  const id = resolveSheetId(sheetIdOrKey);
  assertValidId(id, `getRowsByTitle(arg=${String(sheetIdOrKey)})`);

  if (!force && _rowsCache.has(id)) return _rowsCache.get(id);
  const raw = await fetchSheet(id, { force });
  const rows = rowsByTitle(raw);
  _rowsCache.set(id, rows);
  return rows;
}

  // ---------- Utils ----------
  function toNumber(x) {
    if (x == null) return 0;
    if (typeof x === "number") return x;
    const m = String(x).replace(/[^0-9.\-]/g, "");
    const n = parseFloat(m);
    return isFinite(n) ? n : 0;
  }

  P.api = {
    API_BASE,
    SHEETS,
    resolveSheetId,
    fetchSheet,
    rowsByTitle,
    getRowsByTitle,
    clearCache,
    toNumber,
  };
  window.PowerUp = P;
})(window.PowerUp || {});
