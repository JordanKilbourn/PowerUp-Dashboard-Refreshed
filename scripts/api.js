// scripts/api.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const API_BASE = "https://powerup-proxy.onrender.com";

  // ✅ Smartsheet IDs (unchanged)
  const SHEETS = {
    EMPLOYEE_MASTER: "2195459817820036",
    POWER_HOUR_GOALS: "3542697273937796",
    POWER_HOURS: "1240392906264452",
    CI: "6797575881445252",
    SAFETY: "3310696565526404",
    QUALITY: "8096237664292740",
    LEVEL_TRACKER: "8346763116105604",
    SQUADS: "2480892254572420",
    SQUAD_MEMBERS: "2615493107076996",
  };

  // ---------- caches ----------
  const _rawCache  = new Map();  // id -> raw sheet json (in-memory)
  const _inflight  = new Map();  // id -> Promise (dedupe concurrent)
  const _rowsCache = new Map();  // id -> [{title:value,...}] (in-memory)

  // ---- persistent (session) cache with TTL ----
  const STORE_KEY    = "pu.sheetCache.v1";
  const SHEET_TTL_MS = 5 * 60 * 1000;

  function loadStore() { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}"); } catch { return {}; } }
  function saveStore(obj) { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(obj || {})); } catch {} }

  // ---------- utils ----------
  function resolveSheetId(sheetIdOrKey) {
    if (sheetIdOrKey == null) return "";
    const s = String(sheetIdOrKey).trim();
    return Object.prototype.hasOwnProperty.call(SHEETS, s) ? String(SHEETS[s]).trim() : s;
  }

  function assertValidId(id, hint) {
    if (!id || String(id).toLowerCase() === "undefined" || String(id).toLowerCase() === "null") {
      const mapping = Object.entries(SHEETS).map(([k,v]) => `${k}: ${v || "MISSING"}`).join(" | ");
      console.error("Missing Smartsheet ID", { hint, id, mapping });
      throw new Error("Missing Smartsheet ID (see console for mapping).");
    }
  }

  // Convert Smartsheet rows into objects keyed by column title
  function rowsByTitle(sheetJson) {
    const colTitleById = {};
    (sheetJson.columns || []).forEach(c => { colTitleById[c.id] = c.title; });
    return (sheetJson.rows || []).map(r => {
      const o = {};
      (r.cells || []).forEach(cell => {
        const t = colTitleById[cell.columnId];
        if (!t) return;
        o[t] = (cell.displayValue !== undefined ? cell.displayValue : cell.value) ?? "";
      });
      return o;
    });
  }

  // ---- robust fetch with timeout + retry/backoff (ADD) ----
  const API_RETRY_LIMIT = 2;          // total attempts = 1 + retries
  const API_TIMEOUT_MS  = 30000;      // 15s per request
  const API_BACKOFF_MS  = 600;        // base backoff; jitter added

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
      promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
  }

  // single-attempt fetch (kept for parity with your previous logic)
  async function fetchJSON(url, init) {
    const res = await withTimeout(fetch(url, { credentials: "omit", cache: "no-store", ...(init||{}) }), API_TIMEOUT_MS);
    if (!res.ok) {
      let detail = ""; try { detail = await res.text(); } catch {}
      const err = new Error(`Proxy error ${res.status} for ${url}${detail ? `: ${detail}` : ""}`);
      err.status = res.status;
      err.body   = detail;
      throw err;
    }
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  // retry wrapper for transient failures (NEW)
  async function fetchJSONRetry(url, init) {
    let attempt = 0;
    while (true) {
      try {
        return await fetchJSON(url, init);
      } catch (err) {
        attempt++;
        const status = err && err.status;
        const retryable = !status || status === 429 || (status >= 500 && status < 600);
        if (!retryable || attempt > API_RETRY_LIMIT) throw err;
        const jitter = Math.floor(Math.random() * 200);
        await sleep(API_BACKOFF_MS * attempt + jitter);
      }
    }
  }

  // ---------- core fetchers ----------
  async function fetchSheet(sheetIdOrKey, { force = false } = {}) {
    const id = resolveSheetId(sheetIdOrKey);
    assertValidId(id, `fetchSheet(${String(sheetIdOrKey)})`);

    if (!force) {
      if (_rawCache.has(id)) return _rawCache.get(id);
      if (_inflight.has(id)) return _inflight.get(id);
    }

    if (!force) {
      const store = loadStore();
      const hit = store[id];
      const now = Date.now();
      if (hit && (now - (hit.ts || 0)) < SHEET_TTL_MS && hit.data) {
        _rawCache.set(id, hit.data);
        return hit.data;
      }
    }

    const p = (async () => {
      // CHANGED: use retry wrapper
      const json = await fetchJSONRetry(`${API_BASE}/sheet/${id}`);
      _rawCache.set(id, json);
      const store = loadStore();
      store[id] = { ts: Date.now(), data: json };
      saveStore(store);
      _inflight.delete(id);
      return json;
    })();

    _inflight.set(id, p);
    return p;
  }

  async function getRowsByTitle(sheetIdOrKey, { force = false } = {}) {
    const id = resolveSheetId(sheetIdOrKey);
    assertValidId(id, `getRowsByTitle(${String(sheetIdOrKey)})`);

    if (!force && _rowsCache.has(id)) return _rowsCache.get(id);

    const raw  = await fetchSheet(id, { force });
    const rows = rowsByTitle(raw);
    _rowsCache.set(id, rows);
    return rows;
  }

  function clearCache(sheetIdOrKey) {
    if (!sheetIdOrKey) { _rawCache.clear(); _inflight.clear(); _rowsCache.clear(); saveStore({}); return; }
    const id = resolveSheetId(sheetIdOrKey);
    _rawCache.delete(id); _inflight.delete(id); _rowsCache.delete(id);
    const store = loadStore(); if (store[id]) { delete store[id]; saveStore(store); }
  }

  function toNumber(x) {
    if (x == null) return 0;
    if (typeof x === "number") return x;
    const n = parseFloat(String(x).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  // ---------- WRITE: add rows (client maps titles → columnId) ----------
  /**
   * addRows('SHEET_KEY_OR_ID', [
   *   { "Squad ID": "SQ-001", "Employee ID": "IX7992604", "Role": "Member", "Active": true, "Start Date": "2025-08-28" }
   * ])
   */
  async function addRows(sheetIdOrKey, titleRows, { toTop = true } = {}) {
    const id = resolveSheetId(sheetIdOrKey);
    assertValidId(id, `addRows(${String(sheetIdOrKey)})`);
    if (!Array.isArray(titleRows) || !titleRows.length) throw new Error("addRows: 'titleRows' must be a non-empty array");

    // Get column metadata (includes column formula info)
    let columns;
    try {
      columns = await fetchJSONRetry(`${API_BASE}/sheet/${id}/columns`);
      if (!Array.isArray(columns)) columns = columns?.data || columns?.columns;
    } catch {
      const sheet = await fetchSheet(id, { force: true });
      columns = sheet.columns || [];
    }

    const titleToCol = {};
    (columns || []).forEach(c => {
      const k = String(c.title).replace(/\s+/g, " ").trim().toLowerCase();
      titleToCol[k] = c; // keep full column (id, type, formula, systemColumnType, etc)
    });

    const isFormulaCol = (col) => !!(col && (col.formula || col.systemColumnType));

    function coerceValue(title, value, col) {
      const t = String(title).toLowerCase();
      let v = value;

      // date columns → YYYY-MM-DD
      if (t.includes("date") || (col && String(col.type).toUpperCase() === "DATE")) {
        if (v instanceof Date) v = v.toISOString().slice(0, 10);
        else if (typeof v === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          const d = new Date(v);
          if (!isNaN(d)) v = d.toISOString().slice(0, 10);
        }
      }

      // checkbox → boolean
      if (typeof v === "string" && (t.includes("active") || t.includes("checkbox") || (col && String(col.type).toUpperCase() === "CHECKBOX"))) {
        const s = v.trim().toLowerCase();
        if (["true","yes","1","y","on"].includes(s)) v = true;
        else if (["false","no","0","n","off",""].includes(s)) v = false;
      }
      return v;
    }

    const rows = titleRows.map(obj => {
      const cells = [];
      Object.entries(obj || {}).forEach(([title, value]) => {
        const key  = String(title).replace(/\s+/g, " ").trim().toLowerCase();
        const col  = titleToCol[key];
        if (!col) { console.warn(`[addRows] Unknown column title in sheet ${id}:`, title); return; }
        if (isFormulaCol(col)) { console.warn(`[addRows] Skipping column with formula/system type:`, col.title); return; }
        cells.push({ columnId: col.id, value: coerceValue(title, value, col) });
      });
      return { toTop, cells };
    });

    const nonEmpty = rows.filter(r => r.cells && r.cells.length > 0);
    if (!nonEmpty.length) {
      console.error("[addRows] No valid cells matched any writable columns.", { attempted: titleRows, columns });
      throw new Error("addRows: rows did not contain any writable columns.");
    }

    const payload = { rows: nonEmpty };
    console.debug("[addRows] payload", { sheetId: id, payload });

    // CHANGED: use retry wrapper
    return fetchJSONRetry(`${API_BASE}/sheet/${id}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  // ---------- export ----------
  P.api = {
    API_BASE,
    SHEETS,
    resolveSheetId,
    fetchSheet,
    rowsByTitle,
    getRowsByTitle,
    clearCache,
    toNumber,
    addRows,
  };
  window.PowerUp = P;
})(window.PowerUp || {});
