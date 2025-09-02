/* scripts/api.js – Patch 1 (TTL + cache hygiene + helpers)
   Notes:
   - Adds CACHE_TTL_MS (default 10 min)
   - Clears cache on demand (used by header “Refresh Data” + on login/logout)
   - Exposes isStale() + lastRefreshAt() for UI hints
*/
window.PowerUp = window.PowerUp || {};
PowerUp.api = (() => {
  const BASE = 'https://powerup-proxy.onrender.com'; // existing proxy
  const STORE_KEY = 'pu.cache.v2';  // bump to v2 to invalidate old format
  const META_KEY  = 'pu.cache.meta.v1';

  // 10 minutes default TTL (tweak as you like)
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

  function now() { return Date.now(); }

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
    // stable key per resource+params
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

  // Smartsheet helpers
  function sheetResource(sheetId) { return `/sheet/${sheetId}`; }

  async function getSheet(sheetId, { force = false } = {}) {
    return cachedGet(sheetResource(sheetId), null, { force });
  }

  // Convert Smartsheet row array -> array of { "Col Title": value, ... , _rowId }
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

  // Add rows: values = array of objects {"Col Title": value}
  async function addRows(sheetId, values) {
    // Build Smartsheet-style rows skipping system/formula columns (we can’t know formula columns here, rely on server to ignore)
    const body = { rows: values.map(v => ({
      toTop: true,
      cells: Object.entries(v).map(([title, value]) => ({ columnTitle: title, value }))
    }))};
    const url = `${BASE}${sheetResource(sheetId)}/rows`;
    const res = await fetchJSON(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    // Invalidate any cached sheet data immediately
    const store = loadStore();
    const key = getKey(sheetResource(sheetId));
    delete store[key];
    saveStore(store);
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
    // power users
    _debug: { loadStore, saveStore, loadMeta }
  };
})();

// ===== Back-compat shims for legacy P.api calls =============================
// Paste this at the very bottom of scripts/api.js

(function legacyApiShim() {
  // 1) Keep old namespace available
  window.P = window.P || {};
  window.P.api = window.PowerUp.api;

  // 2) Ensure SHEETS is reachable via both namespaces
  if (!window.P.api.SHEETS && window.PowerUp?.api?.SHEETS) {
    window.P.api.SHEETS = window.PowerUp.api.SHEETS;
  }

  // 3) Legacy getters --------------------------------------------------------
  // Old code: await P.api.getSheetJson(sheetId, { force:true })
  if (typeof window.P.api.getSheetJson !== 'function') {
    window.P.api.getSheetJson = (sheetId, opts = {}) =>
      window.PowerUp.api.getSheet(sheetId, opts);
  }

  // Old code: const rows = await P.api.getRowsByTitle(sheetId)
  if (typeof window.P.api.getRowsByTitle !== 'function') {
    window.P.api.getRowsByTitle = async (sheetId, opts = {}) => {
      const sheet = await window.PowerUp.api.getSheet(sheetId, opts);
      return window.PowerUp.api.rowsToObjects(sheet);
    };
  }

  // Old code: const rows = await P.api.getRows(sheetId)
  if (typeof window.P.api.getRows !== 'function') {
    window.P.api.getRows = (sheetId, opts = {}) =>
      window.P.api.getRowsByTitle(sheetId, opts);
  }

  // Sometimes older code used different names:
  // Old code: await P.api.fetchSheet(sheetId)
  if (typeof window.P.api.fetchSheet !== 'function') {
    window.P.api.fetchSheet = (sheetId, opts = {}) =>
      window.PowerUp.api.getSheet(sheetId, opts);
  }

  // 4) Row conversion passthrough -------------------------------------------
  // Old code: const objs = P.api.rowsToObjects(sheetJson)
  if (typeof window.P.api.rowsToObjects !== 'function') {
    window.P.api.rowsToObjects = (sheetJson) =>
      window.PowerUp.api.rowsToObjects(sheetJson);
  }

  // 5) Add rows helpers ------------------------------------------------------
  // Old code: await P.api.addRows(sheetId, [obj, ...])
  if (typeof window.P.api.addRows !== 'function') {
    window.P.api.addRows = (sheetId, values) =>
      window.PowerUp.api.addRows(sheetId, values);
  }

  // Old code: await P.api.addRow(sheetId, obj)
  if (typeof window.P.api.addRow !== 'function') {
    window.P.api.addRow = (sheetId, value) =>
      window.PowerUp.api.addRows(sheetId, [value]);
  }

  // 6) Cache helpers ---------------------------------------------------------
  // Old code: P.api.clearCache()
  if (typeof window.P.api.clearCache !== 'function') {
    window.P.api.clearCache = () => window.PowerUp.api.clearCache();
  }

  // Old code: P.api.clearSheetCache(sheetId) – we don’t support per-sheet
  // invalidation in the new core yet, so fall back to a full clear to be safe.
  if (typeof window.P.api.clearSheetCache !== 'function') {
    window.P.api.clearSheetCache = (_sheetId) => window.PowerUp.api.clearCache();
  }

  // 7) Convenience finders (commonly used in older code) --------------------
  // Old code: const row = await P.api.findRow(sheetId, 'Employee ID', empId)
  if (typeof window.P.api.findRow !== 'function') {
    window.P.api.findRow = async (sheetId, columnTitle, value, opts = {}) => {
      const rows = await window.P.api.getRowsByTitle(sheetId, opts);
      return rows.find(r => String(r[columnTitle]) === String(value)) || null;
    };
  }

  // Old code: const matches = await P.api.filterRows(sheetId, r => ...)
  if (typeof window.P.api.filterRows !== 'function') {
    window.P.api.filterRows = async (sheetId, predicate, opts = {}) => {
      const rows = await window.P.api.getRowsByTitle(sheetId, opts);
      return rows.filter(predicate);
    };
  }
})();

