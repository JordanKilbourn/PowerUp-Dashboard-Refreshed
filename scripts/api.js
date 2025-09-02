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
  function sheetResource(sheetId) { return `/sheets/${sheetId}`; }

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
