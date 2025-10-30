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
  const API_RETRY_LIMIT = 3;
  const ATTEMPT_TIMEOUT_MS = 12000;
  const OVERALL_DEADLINE_MS = 30000;
  const BACKOFF_BASE_MS = 300;

  const sleep = ms => new Promise(r => setTimeout(r, ms));

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

  async function fetchJSONRetry(url, init) {
    const start = Date.now();
    let attempt = 0, lastErr;
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
      } finally { clearTimeout(perAttemptTimeout); }
    }
    throw lastErr || new Error("request failed");
  }

  // ---------- READY ----------
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
      return true;
    })();
    return _readyPromise;
  }

  async function fetchSheet(sheetIdOrKey, { force = false } = {}) {
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
    assertValidId(id, `getRowsByTitle(${sheetIdOrKey})`);
    if (!force && _rowsCache.has(id)) return _rowsCache.get(id);
    const raw = await fetchSheet(id, { force });
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

  // ---------- export base API ----------
  P.api = { API_BASE, SHEETS, resolveSheetId, fetchSheet, rowsByTitle, getRowsByTitle, clearCache, ready, addRows };


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

  clearCache(id);
await fetchSheet(id, { force: true });

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
