// scripts/api.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});
  const API_BASE = "https://powerup-proxy.onrender.com";

  // ✅ Smartsheet IDs
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

    // If you have these, leave them; if not, harmless.
    SQUAD_ACTIVITIES: "1315116675977092",
    SQUAD_ACTIVITY_PARTICIPANTS: "4817175027076996",
  };

  // ---------- caches ----------
  const _rawCache  = new Map();
  const _inflight  = new Map();
  const _rowsCache = new Map();

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

  // ---- robust fetch with timeout + retry/backoff + overall deadline ----
  const API_RETRY_LIMIT     = 3;
  const ATTEMPT_TIMEOUT_MS  = 12000;
  const OVERALL_DEADLINE_MS = 30000;
  const BACKOFF_BASE_MS     = 300;

  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  async function fetchOnce(url, init, signal) {
    const res = await fetch(url, { credentials: "omit", cache: "no-store", ...(init||{}), signal });
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

  async function fetchJSONRetry(url, init) {
    const start = Date.now();
    let attempt = 0;
    let lastErr;

    while (attempt < API_RETRY_LIMIT) {
      attempt++;
      const controller = new AbortController();
      const perAttemptTimeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

      try {
        const remaining = OVERALL_DEADLINE_MS - (Date.now() - start);
        if (remaining <= 0) throw new Error("deadline");
        return await fetchOnce(url, init, controller.signal);
      } catch (err) {
        lastErr = err;
        const status = err && err.status;
        const retryable = err.name === "AbortError" || err.message === "deadline" ||
                          !status || status === 429 || (status >= 500 && status < 600);
        if (!retryable || attempt >= API_RETRY_LIMIT) break;
        const jitter = Math.floor(Math.random() * 250);
        await sleep(BACKOFF_BASE_MS * attempt + jitter);
      } finally {
        clearTimeout(perAttemptTimeout);
      }
    }
    throw lastErr || new Error("request failed");
  }

  // ---------- READY GATE ----------
  let _readyPromise = null;
  async function ready({ deadlineMs = 60000 } = {}) {
    if (_readyPromise) return _readyPromise;
    _readyPromise = (async () => {
      const start = Date.now();
      while (true) {
        try {
          const h = await fetchJSONRetry(`${API_BASE}/health`, { method: "GET" });
          if (h && (h.ok === true || h.status === "ok" || h === "ok")) break;
        } catch {}
        if (Date.now() - start > deadlineMs) throw new Error("service not ready (deadline)");
        await sleep(600);
      }
      try { await fetchJSONRetry(`${API_BASE}/sheet/${SHEETS.EMPLOYEE_MASTER}/columns`, { method: "GET" }); } catch {}
      return true;
    })();
    return _readyPromise;
  }

  // ---------- warm proxy ----------
  const WARM_KEY = "pu.proxy.warmAt";
  const WARM_TTL = 5 * 60 * 1000;
  async function warmProxy() {
    try {
      const last = Number(sessionStorage.getItem(WARM_KEY) || 0);
      if (last && (Date.now() - last) < WARM_TTL) return;
      await ready().catch(() => {});
      sessionStorage.setItem(WARM_KEY, String(Date.now()));
    } catch {}
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

  // ---------- prefetch ----------
  async function prefetchEssential() {
    await ready().catch(() => {});
    const keys = [
      'EMPLOYEE_MASTER',
      'POWER_HOURS', 'POWER_HOUR_GOALS',
      'CI', 'SAFETY', 'QUALITY',
      'LEVEL_TRACKER',
      'SQUADS', 'SQUAD_MEMBERS'
    ];
    await Promise.allSettled(keys.map(k => getRowsByTitle(k)));
  }

  // ---------- READ helpers for activities (if you use them) ----------
  function _norm(s){ return String(s||'').trim().toLowerCase(); }
  function _fmtDate(v){
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return '';
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
  }
  async function _rows(idKey){ return getRowsByTitle(SHEETS[idKey]).catch(()=>[]); }

  const activities = {
    async listBySquad({ squadId = '', squadName = '' } = {}) {
      const rows = await _rows('SQUAD_ACTIVITIES');
      const idLC = _norm(squadId), nameLC = _norm(squadName);
      return rows
        .map(r => ({
          raw: r,
          id:        r['Activity ID'] || r['ID'] || '',
          squadId:   r['Squad ID'] || r['Squad'] || '',
          squadName: r['Squad'] || '',
          title:     r['Activity Title'] || r['Title'] || '',
          type:      r['Type'] || '',
          status:    r['Status'] || '',
          startDate: _fmtDate(r['Start Date'] || r['Start']),
          endDate:   _fmtDate(r['End Date'] || r['Due Date'] || r['End']),
          ownerName: r['Owner (Display Name)'] || r['Owner'] || '',
          description: r['Description'] || r['Notes'] || ''
        }))
        .filter(a => {
          if (idLC)   return _norm(a.squadId)   === idLC;
          if (nameLC) return _norm(a.squadName) === nameLC;
          return true;
        });
    },
    async participantsByActivity() {
      const rows = await _rows('SQUAD_ACTIVITY_PARTICIPANTS');
      const map = new Map();
      rows.forEach(r => {
        const aid = String(r['Activity ID'] || r['Activity'] || '').trim();
        if (!aid) return;
        const id = String(r['Employee ID'] || r['Position ID'] || '').trim();
        if (!map.has(aid)) map.set(aid, new Set());
        if (id) map.get(aid).add(id);
      });
      return map;
    },
    async hoursByActivity() {
      const ph = await _rows('POWER_HOURS');
      const map = new Map();
      ph.forEach(r => {
        const aid = String(r['Activity ID'] || '').trim();
        if (!aid) return;
        const completed = String(r['Completed'] || r['Is Complete'] || '').toLowerCase();
        const isDone = completed === 'true' || completed === 'yes' || completed === 'y' || completed === '1';
        if (!isDone) return;
        const hrsRaw = r['Completed Hours'] ?? r['Hours'] ?? r['PH'] ?? 0;
        const hrs = parseFloat(String(hrsRaw).replace(/[^0-9.\-]/g,''));
        if (!Number.isFinite(hrs)) return;
        map.set(aid, (map.get(aid) || 0) + hrs);
      });
      return map;
    }
  };

  // ---------- WRITE: add rows (maps titles → columnId, posts to /rows) ----------
  /**
   * addRows('SHEET_KEY_OR_ID', [
   *   { "Squad ID": "SQ-001", "Employee ID": "IX7992604", "Role": "Member", "Active": true, "Start Date": "2025-08-28" }
   * ], { toTop: true })
   */
  async function addRows(sheetIdOrKey, titleRows, { toTop = true } = {}) {
    const id = resolveSheetId(sheetIdOrKey);
    assertValidId(id, `addRows(${String(sheetIdOrKey)})`);
    if (!Array.isArray(titleRows) || !titleRows.length) throw new Error("addRows: 'titleRows' must be a non-empty array");

    // Get columns (try fast endpoint, fall back to full sheet)
    let columns;
    try {
      columns = await fetchJSONRetry(`${API_BASE}/sheet/${id}/columns`, { method: "GET" });
      if (!Array.isArray(columns)) columns = columns?.data || columns?.columns;
    } catch {
      const sheet = await fetchSheet(id, { force: true });
      columns = sheet.columns || [];
    }

    const titleToCol = {};
    (columns || []).forEach(c => {
      const k = String(c.title).replace(/\s+/g, " ").trim().toLowerCase();
      titleToCol[k] = c; // keep full column (id, type, formula, systemColumnType, etc.)
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

    // This is the same path your older code used:
    const res = await fetchJSONRetry(`${API_BASE}/sheet/${id}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Invalidate caches so fresh data shows after write
    clearCache(id);
    return res;
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
    prefetchEssential,
    warmProxy,
    ready,
    activities,
    addRows, // 👈 restored
  };

    // =====================================================
  // ✅ Squad & Employee Helper Functions for Dashboard
  // =====================================================

  // Fetch all employees (used to populate leader/member lists)
  P.getEmployees = async function () {
    try {
      const rows = await P.api.getRowsByTitle(P.api.SHEETS.EMPLOYEE_MASTER);
      return rows.map(r => ({
        id: r["Employee ID"] || r["ID"] || "",
        name: r["Name"] || r["Employee Name"] || "",
        level: r["Level"] || "",
        dept: r["Department"] || ""
      })).filter(e => e.name);
    } catch (err) {
      console.error("getEmployees error:", err);
      return [];
    }
  };

  // Lookup one employee by name (case-insensitive)
  P.findEmployeeByName = async function (name) {
    if (!name) return null;
    const employees = await P.getEmployees();
    const n = String(name).trim().toLowerCase();
    return employees.find(e => e.name.trim().toLowerCase() === n) || null;
  };

  // Fetch all squads (used for ID auto-increment and reload)
  P.getSquads = async function () {
    try {
      const rows = await P.api.getRowsByTitle(P.api.SHEETS.SQUADS);
      return rows.map(r => ({
        id: r["Squad ID"] || "",
        name: r["Squad Name"] || "",
        category: r["Category"] || "",
        objective: r["Objective"] || "",
        active: r["Active"] === true || String(r["Active"]).toLowerCase() === "true"
      }));
    } catch (err) {
      console.error("getSquads error:", err);
      return [];
    }
  };

  // Write a new Squad record
  P.addSquad = async function (rowData) {
    try {
      const res = await P.api.addRows(P.api.SHEETS.SQUADS, [rowData]);
      console.info("✅ Squad added:", res);
      return res;
    } catch (err) {
      console.error("addSquad error:", err);
      alert("Error creating squad. Check console for details.");
      throw err;
    }
  };

  // Write a new Squad Member record
  P.addSquadMember = async function (rowData) {
    try {
      const res = await P.api.addRows(P.api.SHEETS.SQUAD_MEMBERS, [rowData]);
      console.info("✅ Squad member added:", res);
      return res;
    } catch (err) {
      console.error("addSquadMember error:", err);
      alert("Error adding squad member. Check console for details.");
      throw err;
    }
  };

  window.PowerUp = P;
})(window.PowerUp || {});
