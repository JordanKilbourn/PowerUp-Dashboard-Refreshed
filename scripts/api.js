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
  const SHEET_TTL_MS = 5 * 60 * 1000; // 5 minutes

  function loadStore() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveStore(obj) {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(obj || {})); }
    catch {}
  }

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

  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

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

  async function fetchJSON(url) {
    const res = await fetch(url, { credentials: "omit", cache: "no-store" });
    if (!res.ok) {
      let detail = ""; try { detail = await res.text(); } catch {}
      throw new Error(`Proxy error ${res.status} for ${url}${detail ? `: ${detail}` : ""}`);
    }
    return res.json();
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
        _rawCache.set(id, hit.data);   // promote to memory
        return hit.data;
      }
    }

    const p = (async () => {
      const json = await fetchJSON(`${API_BASE}/sheet/${id}`);
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
    if (!sheetIdOrKey) {
      _rawCache.clear(); _inflight.clear(); _rowsCache.clear();
      saveStore({});
      return;
    }
    const id = resolveSheetId(sheetIdOrKey);
    _rawCache.delete(id);
    _inflight.delete(id);
    _rowsCache.delete(id);

    const store = loadStore();
    if (store[id]) { delete store[id]; saveStore(store); }
  }

  function toNumber(x) {
    if (x == null) return 0;
    if (typeof x === "number") return x;
    const n = parseFloat(String(x).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  // ---------- addRows with client-side title→columnId mapping ----------
  const _colMapCache = new Map(); // id -> { normTitle: { id, primary } }

  async function getColumnMap(sheetIdOrKey) {
    const id = resolveSheetId(sheetIdOrKey);
    if (_colMapCache.has(id)) return _colMapCache.get(id);
    const sheet = await fetchSheet(id);
    const map = {};
    (sheet.columns || []).forEach(c => {
      map[norm(c.title)] = { id: c.id, primary: !!c.primary };
    });
    _colMapCache.set(id, map);
    return map;
  }

  function normaliseValue(title, value) {
    const t = norm(title);

    // booleans / checkboxes
    if (t === "active" || t === "completed" || t === "scheduled") {
      if (typeof value === "boolean") return value;
      const s = String(value || "").trim().toLowerCase();
      return s === "true" || s === "yes" || s === "1" || s === "y";
    }

    // dates (YYYY-MM-DD)
    if (t.includes("date")) {
      if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
      }
      const sv = String(value || "").trim();
      // Accept "MM/DD/YY" from UI; convert to YYYY-MM-DD when we can
      const mdy = sv.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (mdy) {
        let [ , m, d, y ] = mdy;
        if (y.length === 2) y = `20${y}`;
        return `${y.padStart(4,"0")}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(sv)) return sv;
      const d = new Date(sv);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
      return sv;
    }

    return value;
  }

  /**
   * Append one or more rows to a sheet using column **titles** as keys.
   * This function resolves titles to columnIds on the client, so Smartsheet
   * receives proper {columnId, value} cells and won’t create blank rows.
   *
   * Example:
   *   await PowerUp.api.addRows('SQUAD_MEMBERS', [
   *     { "Squad ID": "SQ-001", "Employee ID": "IX7992604", "Role": "Member",
   *       "Active": true, "Start Date": "2025-08-28" }
   *   ])
   */
  async function addRows(sheetIdOrKey, rowObjects, { toTop = true } = {}) {
    const id = resolveSheetId(sheetIdOrKey);
    assertValidId(id, `addRows(${String(sheetIdOrKey)})`);
    if (!Array.isArray(rowObjects) || rowObjects.length === 0) {
      throw new Error("addRows: 'rowObjects' must be a non-empty array");
    }

    const colMap = await getColumnMap(id);

    const payloadRows = rowObjects.map((obj, idx) => {
      const cells = [];
      for (const [title, raw] of Object.entries(obj || {})) {
        const key = norm(title);
        const col = colMap[key];
        if (!col) {
          console.warn(`[addRows] Column not found for title "${title}" on sheet ${id}`);
          continue;
        }
        cells.push({
          columnId: col.id,
          value: normaliseValue(title, raw),
        });
      }
      if (!cells.length) {
        console.warn(`[addRows] Row ${idx} produced no cells; check your titles.`);
      }
      return { toTop, cells };
    });

    const res = await fetch(`${API_BASE}/sheet/${id}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payloadRows, toTop }),
      credentials: "omit",
    });

    const text = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(`Proxy write ${res.status} for sheet ${id}: ${text || "no body"}`);
    }
    try { return JSON.parse(text); } catch { return text; }
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
    addRows, // <— use this for in-app forms
  };
  window.PowerUp = P;
})(window.PowerUp || {});
