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
    SQUAD_ACTIVITIES: "1315116675977092",
    SQUAD_ACTIVITY_PARTICIPANTS: "4817175027076996",
  };

  // ---------- caches ----------
  const _rawCache  = new Map();
  const _inflight  = new Map();
  const _rowsCache = new Map();

  const STORE_KEY = "pu.sheetCache.v1";
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
      o.__rowId = r.id; // Keep internal row ID for updates
      return o;
    });
  }

  // ---------- fetch with retry ----------
  // Note: "cold start" on Render can make the first requests slow (or return transient 5xx).
  // These defaults are intentionally modest for normal app usage.
  // For login / warm-up, callers can pass per-call overrides via the `net` option.
  const DEFAULT_NET = Object.freeze({
    retryLimit: 3,
    attemptTimeoutMs: 12000,
    overallTimeoutMs: 30000,
    backoffBaseMs: 300,
    backoffCapMs: 4000
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function normalizeNet(net) {
    const n = { ...DEFAULT_NET, ...(net || {}) };
    // Basic guards
    n.retryLimit = Math.max(1, Math.min(10, Number(n.retryLimit) || DEFAULT_NET.retryLimit));
    n.attemptTimeoutMs = Math.max(1000, Number(n.attemptTimeoutMs) || DEFAULT_NET.attemptTimeoutMs);
    n.overallTimeoutMs = Math.max(1000, Number(n.overallTimeoutMs) || DEFAULT_NET.overallTimeoutMs);
    n.backoffBaseMs = Math.max(0, Number(n.backoffBaseMs) || DEFAULT_NET.backoffBaseMs);
    n.backoffCapMs = Math.max(0, Number(n.backoffCapMs) || DEFAULT_NET.backoffCapMs);
    return n;
  }

  function isRetryableError(err) {
    const status = err && err.status;
    if (status === 429) return true;
    if (status === 502 || status === 503 || status === 504) return true;
    if (typeof status === "number" && status >= 500) return true;

    // AbortController timeout or browser network error
    if (err && (err.name === "AbortError" || /aborted|timeout/i.test(err.message || ""))) return true;
    if (err instanceof TypeError) return true; // fetch network failures often surface as TypeError
    return false;
  }


  async function fetchOnce(url, init, signal) {
    const res = await fetch(url, { credentials: "omit", cache: "no-store", ...(init||{}), signal });
    if (!res.ok) {
      let detail = ""; try { detail = await res.text(); } catch {}
      const err = new Error(`Proxy error ${res.status} for ${url}${detail ? `: ${detail}` : ""}`);
      err.status = res.status;
      err.body = detail;
      throw err;
    }
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  async function fetchJSONRetry(url, init, net) {
    const n = normalizeNet(net);
    const start = Date.now();
    let attempt = 0, lastErr;

    while (attempt < n.retryLimit) {
      attempt++;

      const elapsed = Date.now() - start;
      const remainingOverall = n.overallTimeoutMs - elapsed;
      if (remainingOverall <= 0) {
        const e = new Error("deadline");
        e.code = "DEADLINE";
        throw e;
      }

      const controller = new AbortController();
      const perAttemptTimeout = setTimeout(() => controller.abort(), Math.min(n.attemptTimeoutMs, remainingOverall));

      try {
        const json = await fetchOnce(url, init, controller.signal);
        return json;
      } catch (err) {
        lastErr = err;
        const elapsedNow = Date.now() - start;
        const remainingAfter = n.overallTimeoutMs - elapsedNow;
        const retryable = isRetryableError(err);
        if (!retryable || attempt >= n.retryLimit || remainingAfter <= 0) break;

        // Exponential backoff + jitter
        const exp = n.backoffBaseMs * Math.pow(2, attempt - 1);
        const backoff = Math.min(exp, n.backoffCapMs);
        const jitter = Math.floor(Math.random() * 250);
        await sleep(backoff + jitter);
      } finally {
        clearTimeout(perAttemptTimeout);
      }
    }

    throw lastErr || new Error("request failed");
  }


  // ---------- READY ----------
  let _readyPromise = null;
  async function ready({ deadlineMs = 60000, net = null, force = false } = {}) {
    if (force) _readyPromise = null;
    if (_readyPromise) return _readyPromise;

    _readyPromise = (async () => {
      const start = Date.now();
      while (true) {
        try {
          const h = await fetchJSONRetry(`${API_BASE}/health`, { method: "GET" }, net);
          if (h && (h.ok === true || h.status === "ok" || h === "ok")) return true;
        } catch {}
        if (Date.now() - start > deadlineMs) throw new Error("service not ready (deadline)");
        await sleep(600);
      }
    })().catch(err => {
      // If the warm-up fails, allow future calls to retry.
      _readyPromise = null;
      throw err;
    });

    return _readyPromise;
  }

  async function warmProxy({ deadlineMs = 90000, net = null, force = false } = {}) {
    return ready({ deadlineMs, net, force });
  }


  async function fetchSheet(sheetIdOrKey, { force = false, net = null } = {}) {
    const id = resolveSheetId(sheetIdOrKey);
    assertValidId(id, `fetchSheet(${sheetIdOrKey})`);

    if (!force) {
      if (_rawCache.has(id)) return _rawCache.get(id);
      if (_inflight.has(id)) return _inflight.get(id);
      
      const store = loadStore();
      const hit = store[id];
      if (hit && Date.now() - hit.ts < SHEET_TTL_MS) {
        _rawCache.set(id, hit.data);
        return hit.data;
      }
    }

    const p = (async () => {
      const data = await fetchJSONRetry(`${API_BASE}/sheet/${id}`, { method: "GET" }, net);
      _rawCache.set(id, data);

      // Save into sessionStorage (STORE_KEY) as: { [sheetId]: { ts, data } }
      const store = loadStore();
      store[id] = { ts: Date.now(), data };
      saveStore(store);

      return data;

    })();

    _inflight.set(id, p);
    try { return await p; } finally { _inflight.delete(id); }
  }


  async function getRowsByTitle(sheetIdOrKey, { force = false, net = null } = {}) {
    const id = resolveSheetId(sheetIdOrKey);
    assertValidId(id, `getRowsByTitle(${sheetIdOrKey})`);
    if (!force && _rowsCache.has(id)) return _rowsCache.get(id);
    const raw = await fetchSheet(id, { force, net });
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

  // ---------- addRows ----------
  async function addRows(sheetIdOrKey, titleRows, { toTop = true } = {}) {
    const id = resolveSheetId(sheetIdOrKey);
    assertValidId(id, `addRows(${sheetIdOrKey})`);
    if (!Array.isArray(titleRows) || !titleRows.length) throw new Error("addRows: empty array");
    let columns;
    try {
      columns = await fetchJSONRetry(`${API_BASE}/sheet/${id}/columns`, { method: "GET" });
      if (!Array.isArray(columns)) columns = columns?.data || columns?.columns;
    } catch {
      const sheet = await fetchSheet(id, { force: true });
      columns = sheet.columns || [];
    }

    const titleToCol = {};
    (columns || []).forEach(c => titleToCol[c.title.trim().toLowerCase()] = c);
    const isFormula = c => !!(c && (c.formula || c.systemColumnType));

    function coerce(title, value, col) {
      const t = String(title).toLowerCase(); let v = value;
      if (t.includes("date") || (col && String(col.type).toUpperCase() === "DATE")) {
        const d = new Date(v); if (!isNaN(d)) v = d.toISOString().slice(0,10);
      }
      if (typeof v === "string" && (t.includes("active") || t.includes("checkbox"))) {
        const s = v.trim().toLowerCase(); v = ["true","yes","1","y","on"].includes(s);
      }
      return v;
    }

    const rows = titleRows.map(obj => ({
      toTop,
      cells: Object.entries(obj).map(([t,v]) => {
        const col = titleToCol[t.trim().toLowerCase()];
        if (!col || isFormula(col)) return null;
        return { columnId: col.id, value: coerce(t,v,col) };
      }).filter(Boolean)
    }));

    const payload = { rows };
    const res = await fetchJSONRetry(`${API_BASE}/sheet/${id}/rows`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });

    clearCache(id);
    return res;
  }

// Build the public API object (prefetchEssential is attached just below)
P.api = {
  API_BASE,
  SHEETS,
  resolveSheetId,
  fetchSheet,
  rowsByTitle,
  getRowsByTitle,
  clearCache,
  ready,
  warmProxy,
  addRows
};


  // Prefetch: warm the proxy + prime the dashboard sheets into sessionStorage cache
P.api.prefetchEssential = async function prefetchEssential({ net = null } = {}) {
  // Warm the proxy to avoid first-hit latency
  try { await P.api.warmProxy({ net }); } catch {}

  // Prime the main sheets the dashboard needs
const sheets = [
  P.api.SHEETS.CI,
  P.api.SHEETS.SAFETY,
  P.api.SHEETS.QUALITY,
  P.api.SHEETS.POWER_HOURS,
  P.api.SHEETS.POWER_HOUR_GOALS,
];

  // Best-effort: don’t block login if one fetch fails
  await Promise.allSettled(
    sheets.map(k => P.api.fetchSheet(k, { net }))
  );
};


// ✅ Dynamically mapped Employee Master reader (using "Display Name" if present)
  
P.getEmployees = async function () {
  try {
    // Fetch both the sheet definition (for column titles) and the row data
    const [sheet, rowsRaw] = await Promise.all([
      P.api.fetchSheet(P.api.SHEETS.EMPLOYEE_MASTER, { force: false }),
      P.api.getRowsByTitle(P.api.SHEETS.EMPLOYEE_MASTER)
    ]);

    // Build a lowercase list of column titles
    const cols = (sheet.columns || []).map(c => c.title.trim().toLowerCase());
    const findCol = names => cols.find(c => names.some(n => c.includes(n.toLowerCase())));

    // Dynamically find the key columns in your sheet
    const colId = findCol(["employee id", "position id", "id"]);
    const colName = findCol(["display name", "employee name", "full name", "first name"]);
    const colDept = findCol(["department", "home department", "business unit"]);
    const colLevel = findCol(["level", "powerup lvl", "powerup level"]);

    // Normalize all row keys (lowercase) to allow case-insensitive access
    const rows = rowsRaw.map(r => {
      const normalized = {};
      for (const [k, v] of Object.entries(r)) {
        normalized[k.trim().toLowerCase()] = v;
      }
      return normalized;
    });

    // Map employee rows into a normalized list
    const employees = rows
      .map(r => ({
        id: r[colId] || r["position id"] || r["employee id"] || "",
        // use Display Name directly if available
        name: r["display name"] || r[colName] || "",
        dept: r[colDept] || r["home department"] || r["business unit"] || "",
        level:
          r[colLevel] ||
          r["powerup lvl (calculated)"] ||
          r["powerup level (select)"] ||
          ""
      }))
      .filter(e => e.name && e.id);

    console.log(`✅ Loaded ${employees.length} employees (normalized)`, {
      colId,
      colName,
      colDept,
      colLevel
    });

    return employees;
  } catch (err) {
    console.error("getEmployees error:", err);
    return [];
  }
};



  P.findEmployeeByName = async function (name) {
    if (!name) return null;
    const employees = await P.getEmployees();
    const n = String(name).trim().toLowerCase();
    return employees.find(e => e.name.trim().toLowerCase() === n) || null;
  };

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

// =====================================================
// ✅ Update or insert Smartsheet row (proxy-safe)
// =====================================================
P.api.updateRowById = async function (sheetIdOrKey, rowId, data) {
  const id = P.api.resolveSheetId(sheetIdOrKey);
  assertValidId(id, "updateRowById");
  if (!rowId) throw new Error("updateRowById: Missing rowId");

  // --- 1️⃣ Fetch columns for proper mapping ---
  let columns;
  try {
    columns = await fetchJSONRetry(`${API_BASE}/sheet/${id}/columns`, { method: "GET" });
    if (!Array.isArray(columns)) columns = columns?.data || columns?.columns;
  } catch {
    const sheet = await fetchSheet(id, { force: true });
    columns = sheet.columns || [];
  }

  const titleToCol = {};
  (columns || []).forEach(c => (titleToCol[c.title.trim().toLowerCase()] = c));
  const isFormula = c => !!(c && (c.formula || c.systemColumnType));

  // --- 2️⃣ Build Smartsheet-style cells ---
  const cells = Object.entries(data || {})
    .map(([title, value]) => {
      const key = title.trim().toLowerCase();
      const col = titleToCol[key];
      if (!col || isFormula(col)) return null;
      return { columnId: col.id, value };
    })
    .filter(Boolean);

  if (!cells.length) throw new Error("updateRowById: No valid writable columns found");

  // --- 3️⃣ Build payload (POST-with-ID trick) ---
  const payload = {
    rows: [
      {
        id: rowId, // Smartsheet treats this as an update
        cells
      }
    ]
  };

// --- 4️⃣ Send PUT to new proxy route for updates ---
const url = `${API_BASE}/sheet/${id}/rows`;
console.log("🔄 Proxy updateRowById via PUT:", url, payload);

const res = await fetchJSONRetry(url, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});


  clearCache(id);
  console.log("✅ Row update successful:", { sheetId: id, rowId, data });
  return res;
};


 // =====================================================
// ✅ Update or replace a Squad Leader in Squad Members sheet
// =====================================================
P.api.updateOrReplaceLeader = async function ({ squadId, newLeaderId, newLeaderName }) {
  const sheetId = P.api.SHEETS.SQUAD_MEMBERS;
  if (!squadId || !newLeaderId) throw new Error("updateOrReplaceLeader: Missing squad or leader info");

  // Fetch all current members for this sheet
  const members = await P.api.getRowsByTitle(sheetId);

  // Normalize helper for safe matching
  const norm = v => String(v || "").trim().toUpperCase();

  // Find the current leader row for this squad
  const currentLeader = members.find(m =>
    norm(m["Squad ID"]) === norm(squadId) &&
    norm(m["Role"]) === "LEADER"
  );

  // Log what we found for easier debugging
  console.log("👀 Searching for existing leader row:", {
    squadId,
    found: !!currentLeader,
    rowId: currentLeader ? currentLeader.__rowId || currentLeader._rowId : null,
    name: currentLeader ? currentLeader["Employee Name"] : null
  });

  if (currentLeader && (currentLeader.__rowId || currentLeader._rowId)) {
    // ✅ Update existing leader record in-place
    const rowId = currentLeader.__rowId || currentLeader._rowId;
    console.log("🔄 Updating existing leader:", currentLeader["Employee Name"], "→", newLeaderName);
    return await P.api.updateRowById(sheetId, rowId, {
      "Employee ID": newLeaderId,
      "Employee Name": newLeaderName,
      "Role": "Leader",
      "Active": true,
      "Added By": "System Update"
    });
  }

  // 🚨 No existing leader found — add a new record
  console.log("➕ Adding new leader for squad:", squadId);
  return await P.api.addRows(sheetId, [{
    "Squad ID": squadId,
    "Employee ID": newLeaderId,
    "Employee Name": newLeaderName,
    "Role": "Leader",
    "Active": true,
    "Added By": "System Insert"
  }]);
};

window.PowerUp = P;
})(window.PowerUp || {});
