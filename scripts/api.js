/* scripts/api.js – Stable version (route fix + safe caching + back-compat)
   - Matches proxy routes: GET /sheet/:id, POST /sheet/:id/rows
   - Keeps legacy calls working via P.api shim at bottom
*/
window.PowerUp = window.PowerUp || {};
PowerUp.api = (() => {
  const BASE = 'https://powerup-proxy.onrender.com';
  const STORE_KEY = 'pu.cache.v2';
  const META_KEY  = 'pu.cache.meta.v1';

  // 10 minutes default TTL
  const CACHE_TTL_MS = 10 * 60 * 1000;

  const SHEETS = {
    EMPLOYEE_MASTER: '2195459817820036',
    POWER_HOUR_GOALS: '3542697273937796',
    POWER_HOURS: '1240392906264452',
    CI: '6797575881445252',
    SAFETY: '3310696565526404',
    QUALITY: '8096237664292740',
    LEVEL_TRACKER: '8346763116105604',
    SQUADS: '2480892254572420',
    SQUAD_MEMBERS: '2615493107076996',
  };

  const inflight = new Map();
  const now = () => Date.now();

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveStore(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch {}
  }
  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      return raw ? JSON.parse(raw) : { lastRefreshAt: 0 };
    } catch { return { lastRefreshAt: 0 }; }
  }
  function saveMeta(meta) {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
  }

  function clearCache() {
    try {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(META_KEY);
    } catch {}
  }

  function markRefreshed() {
    const meta = loadMeta();
    meta.lastRefreshAt = now();
    saveMeta(meta);
  }

  function lastRefreshAt() {
    const meta = loadMeta();
    return meta.lastRefreshAt || 0;
  }

  function getKey(resource, params) {
    return `${resource}::${params ? JSON.stringify(params) : ''}`;
  }

  function isStale(entryTs) {
    if (!entryTs) return true;
    return (now() - entryTs) > CACHE_TTL_MS;
  }

  async function fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text || url}`);
    }
    return res.json();
  }

  // Unified GET with TTL’d cache
  async function cachedGet(resource, params, { force = false } = {}) {
    const key = getKey(resource, params);
    const store = loadStore();
    const cached = store[key];

    if (!force && cached && !isStale(cached.ts)) {
      return cached.data;
    }

    if (inflight.has(key)) return inflight.get(key);

    const url = new URL(`${BASE}${resource}`);
    if (params && typeof params === 'object') {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const p = (async () => {
      const data = await fetchJSON(url.toString());
      store[key] = { data, ts: now() };
      saveStore(store);
      markRefreshed();
      inflight.delete(key);
      return data;
    })().catch(err => { inflight.delete(key); throw err; });

    inflight.set(key, p);
    return p;
  }

  // ----- Smartsheet helpers -----
  function sheetResource(sheetId) { return `/sheet/${sheetId}`; }

  async function getSheet(sheetId, { force = false } = {}) {
    return cachedGet(sheetResource(sheetId), null, { force });
  }

  // Convert Smartsheet sheet JSON -> array of objects keyed by column title
  function rowsToObjects(sheetJson) {
    const cols = sheetJson.columns.map(c => ({ id: c.id, title: c.title }));
    const colById = new Map(cols.map(c => [c.id, c.title]));
    return sheetJson.rows.map(r => {
      const obj = { _rowId: r.id };
      r.cells.forEach(cell => {
        const title = colById.get(cell.columnId);
        obj[title] = (cell.displayValue ?? cell.value ?? null);
      });
      return obj;
    });
  }

  // Add rows: values = array of {"Column Title": value}
  async function addRows(sheetId, values) {
    // Let the proxy map titles -> columnId; include toTop as a hint
    const body = { rows: values.map(v => ({ toTop: true, ...v })) };

    const url = `${BASE}${sheetResource(sheetId)}/rows`;
    const res = await fetchJSON(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // Invalidate cached sheet data immediately
    const store = loadStore();
    const key = getKey(sheetResource(sheetId));
    delete store[key];
    saveStore(store);
    markRefreshed();

    return res;
  }

  return {
    SHEETS,
    getSheet,
    rowsToObjects,
    addRows,
    clearCache,
    lastRefreshAt,
    isStale,
    _debug: { loadStore, saveStore, loadMeta }
  };
})();

/* ===== Back-compat shims for legacy P.api calls ===========================
   Allows old page code (P.api.getRowsByTitle, etc.) to keep working. */
(function legacyApiShim() {
  window.P = window.P || {};
  window.P.api = window.PowerUp.api;

  if (!window.P.api.SHEETS && window.PowerUp?.api?.SHEETS) {
    window.P.api.SHEETS = window.PowerUp.api.SHEETS;
  }

  // Old: await P.api.getSheetJson(sheetId, { force:true })
  if (typeof window.P.api.getSheetJson !== 'function') {
    window.P.api.getSheetJson = (sheetId, opts = {}) =>
      window.PowerUp.api.getSheet(sheetId, opts);
  }

  // Old: const rows = await P.api.getRowsByTitle(sheetId)
  if (typeof window.P.api.getRowsByTitle !== 'function') {
    window.P.api.getRowsByTitle = async (sheetId, opts = {}) => {
      const sheet = await window.PowerUp.api.getSheet(sheetId, opts);
      return window.PowerUp.api.rowsToObjects(sheet);
    };
  }

  // Old: const rows = await P.api.getRows(sheetId)
  if (typeof window.P.api.getRows !== 'function') {
    window.P.api.getRows = (sheetId, opts = {}) =>
      window.P.api.getRowsByTitle(sheetId, opts);
  }

  // Old: await P.api.fetchSheet(sheetId)
  if (typeof window.P.api.fetchSheet !== 'function') {
    window.P.api.fetchSheet = (sheetId, opts = {}) =>
      window.PowerUp.api.getSheet(sheetId, opts);
  }

  // Old: const objs = P.api.rowsToObjects(sheetJson)
  if (typeof window.P.api.rowsToObjects !== 'function') {
    window.P.api.rowsToObjects = (sheetJson) =>
      window.PowerUp.api.rowsToObjects(sheetJson);
  }

  // Old: await P.api.addRows(sheetId, [obj, ...])
  if (typeof window.P.api.addRows !== 'function') {
    window.P.api.addRows = (sheetId, values) =>
      window.PowerUp.api.addRows(sheetId, values);
  }

  // Old: await P.api.addRow(sheetId, obj)
  if (typeof window.P.api.addRow !== 'function') {
    window.P.api.addRow = (sheetId, value) =>
      window.PowerUp.api.addRows(sheetId, [value]);
  }

  // Old: P.api.clearCache()
  if (typeof window.P.api.clearCache !== 'function') {
    window.P.api.clearCache = () => window.PowerUp.api.clearCache();
  }

  // Old: P.api.clearSheetCache(sheetId) – fallback to full clear
  if (typeof window.P.api.clearSheetCache !== 'function') {
    window.P.api.clearSheetCache = (_sheetId) => window.PowerUp.api.clearCache();
  }

  // Old: const row = await P.api.findRow(sheetId, 'Employee ID', empId)
  if (typeof window.P.api.findRow !== 'function') {
    window.P.api.findRow = async (sheetId, columnTitle, value, opts = {}) => {
      const rows = await window.P.api.getRowsByTitle(sheetId, opts);
      return rows.find(r => String(r[columnTitle]) === String(value)) || null;
    };
  }

  // Old: const matches = await P.api.filterRows(sheetId, r => ...)
  if (typeof window.P.api.filterRows !== 'function') {
    window.P.api.filterRows = async (sheetId, predicate, opts = {}) => {
      const rows = await window.P.api.getRowsByTitle(sheetId, opts);
      return rows.filter(predicate);
    };
  }
})();
