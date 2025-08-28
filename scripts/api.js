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
  const STORE_KEY    = "pu.sheetCache.v1";     // bump if schema changes
  const SHEET_TTL_MS = 5 * 60 * 1000;          // 5 minutes

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

  async function fetchJSON(url, init) {
    const res = await fetch(url, { credentials: "omit", cache: "no-store", ...(init||{}) });
    if (!res.ok) {
      let detail = ""; try { detail = await res.text(); } catch {}
      throw new Error(`Proxy error ${res.status} for ${url}${detail ? `: ${detail}` : ""}`);
    }
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  // ---------- core fetchers ----------
  async function fetchSheet(sheetIdOrKey, { force = false } = {}) {
    const id = resolveSheetId(sheetIdOrKey);
    assertValidId(id, `fetchSheet(${String(sheetIdOrKey)})`);

    // in-memory fast path
    if (!force) {
      if (_rawCache.has(id)) return _rawCache.get(id);
      if (_inflight.has(id)) return _inflight.get(id);
    }

    // sessionStorage TTL cache
    if (!force) {
      const store = loadStore();
      const hit = store[id];
      const now = Date.now();
      if (hit && (now - (hit.ts || 0)) < SHEET_TTL_MS && hit.data) {
        _rawCache.set(id, hit.data);   // promote to memory
        return hit.data;
      }
    }

    // network (deduped)
    const p = (async () => {
      const json = await fetchJSON(`${API_BASE}/sheet/${id}`);
      _rawCache.set(id, json);

      // write-through to session store
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
      saveStore({}); // nuke session cache
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

  // ---------- WRITE: add rows (client maps titles → columnId) ----------
  /**
   * addRows('SHEET_KEY_OR_ID', [
   *   { "Squad ID": "SQ-001", "Employee ID": "IX7992604", "Role": "Member", "Active": true, "Start Date": "2025-08-28" }
   * ])
   */
  async function addRows(sheetIdOrKey, titleRows, { toTop = true } = {}) {
    const id = resolveSheetId(sheetIdOrKey);
    assertValidId(id, `addRows(${String(sheetIdOrKey)})`);

    if (!Array.isArray(titleRows) || !titleRows.length) {
      throw new Error("addRows: 'titleRows' must be a non-empty array");
    }

    // fetch column schema to build title → id map
    const sheet = await fetchSheet(id, { force: true });
    const titleToId = {};
    (sheet.columns || []).forEach(c => {
      const k = String(c.title).replace(/\s+/g, " ").trim().toLowerCase();
      titleToId[k] = c.id;
    });

    function coerceValue(title, value) {
      const t = String(title).toLowerCase();
      let v = value;

      // YYYY-MM-DD for any "date" title
      if (t.includes("date")) {
        if (v instanceof Date) {
          v = v.toISOString().slice(0, 10);
        } else if (typeof v === "string") {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
            const d = new Date(v);
            if (!isNaN(d)) v = d.toISOString().slice(0, 10);
          }
        }
      }

      // checkbox → boolean
      if (typeof v === "string" && (t.includes("active") || t.includes("checkbox"))) {
        const s = v.trim().toLowerCase();
        if (["true","yes","1","y"].includes(s)) v = true;
        else if (["false","no","0","n"].includes(s)) v = false;
      }

      return v;
    }

    const rows = titleRows.map(obj => {
      const cells = [];
      Object.entries(obj || {}).forEach(([title, value]) => {
        const key  = String(title).replace(/\s+/g, " ").trim().toLowerCase();
        const colId = titleToId[key];
        if (!colId) {
          console.warn(`[addRows] Unknown column title in sheet ${id}:`, title);
          return;
        }
        cells.push({ columnId: colId, value: coerceValue(title, value) });
      });
      return { toTop, cells };
    });

    // prevent posting blanks
    const nonEmpty = rows.filter(r => r.cells && r.cells.length > 0);
    if (!nonEmpty.length) throw new Error("addRows: all rows were empty after mapping; check column titles.");

    return fetchJSON(`${API_BASE}/sheet/${id}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: nonEmpty }),
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
