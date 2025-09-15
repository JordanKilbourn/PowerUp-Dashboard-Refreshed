// /scripts/squad-member-form.js
(function (P) {
  const { api, roles } = P;

  const el = {
    modal:      document.getElementById("addMemberModal"),
    member:     document.getElementById("memberSelect"),
    role:       document.getElementById("roleSelect"),
    start:      document.getElementById("startDate"),
    active:     document.getElementById("activeChk"),
    btnCancel:  document.getElementById("am-cancel"),
    btnSave:    document.getElementById("am-save"),
  };

  // --- COMPAT: pick the right "add rows" function your api.js actually exposes
  async function addRowsCompat(sheetKeyOrTitle, rows) {
    // Prefer exact methods if present
    if (typeof api.addRows === "function")          return api.addRows(sheetKeyOrTitle, rows);
    if (typeof api.appendRows === "function")       return api.appendRows(sheetKeyOrTitle, rows);
    if (typeof api.addRowsByTitle === "function")   return api.addRowsByTitle(sheetKeyOrTitle, rows);
    if (typeof api.insertRows === "function")       return api.insertRows(sheetKeyOrTitle, rows);
    if (typeof api.writeRows === "function")        return api.writeRows(sheetKeyOrTitle, rows);
    if (typeof api.add === "function")              return api.add(sheetKeyOrTitle, rows);

    // Last-resort: some projects expose a generic "save" call
    if (typeof api.saveRows === "function")         return api.saveRows(sheetKeyOrTitle, rows);

    console.error("[squad-member-form] No add/append function found on P.api:", Object.keys(api || {}));
    throw new Error("No row-append function available on P.api");
  }

  // local state
  let STATE = {
    squadId: "",
    squadName: "",
    employeesLoaded: false,
    empIndex: {},   // id -> name
    members: []     // rows from SQUAD_MEMBERS
  };

  function isoToday() { return new Date().toISOString().slice(0,10); }
  function norm(s){ return String(s || "").trim().toLowerCase(); }

  function toast(msg, ok=false) {
    const n = document.createElement("div");
    n.textContent = msg;
    n.style.cssText = `position:fixed;right:18px;bottom:18px;background:${ok?'#065f46':'#b91c1c'};color:#fff;padding:10px 12px;border-radius:8px;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.35)`;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2200);
  }

  function getOrMakeNoteEl() {
    let note = document.getElementById("am-dupnote");
    if (!note) {
      note = document.createElement("div");
      note.id = "am-dupnote";
      note.style.cssText = "margin-top:6px;font-size:12px;color:#f59e0b;";
      el.member?.parentElement?.appendChild(note);
    }
    return note;
  }

  async function ensureEmployees() {
    if (STATE.employeesLoaded) return;
    const rows = await api.getRowsByTitle('EMPLOYEE_MASTER');
    rows.forEach(r => {
      const id   = r["Position ID"] || r["Employee ID"] || r["ID"] || "";
      const name = r["Display Name"] || r["Employee Name"] || r["Name"] || id;
      if (id) STATE.empIndex[id] = name || id;
    });
    STATE.employeesLoaded = true;
  }

  async function ensureMembers() {
    STATE.members = await api.getRowsByTitle('SQUAD_MEMBERS', { force: true });
  }

  async function ensureRoleOptions() {
    try {
      const raw = await api.fetchSheet(api.SHEETS.SQUAD_MEMBERS); // includes columns
      const roleCol = (raw.columns || []).find(c => norm(c.title) === "role");
      const options = Array.isArray(roleCol?.options) && roleCol.options.length
        ? roleCol.options
        : ["Member","Leader"]; // fallback
      if (el.role) {
        el.role.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join("");
        const def = options.find(o => norm(o) === "member") || options[0];
        el.role.value = def || "";
      }
    } catch {
      if (el.role) {
        el.role.innerHTML = `<option value="Member">Member</option><option value="Leader">Leader</option>`;
        el.role.value = "Member";
      }
    }
  }

  function findExistingRow(employeeId) {
    const sid = norm(STATE.squadId);
    const eid = norm(employeeId);
    return STATE.members.find(r =>
      norm(r["Squad ID"]) === sid &&
      norm(r["Employee ID"]) === eid &&
      String(r["Active"] || "").toLowerCase() === "true"
    );
  }

  function updateDuplicateWarning() {
    if (!el.member || !el.btnSave) return false;
    const note = getOrMakeNoteEl();
    const val  = el.member.value || "";
    if (!val) {
      note.textContent = "";
      el.btnSave.disabled = false;
      return false;
    }
    const dup = findExistingRow(val);
    if (dup) {
      const role  = dup["Role"] || "Member";
      const start = dup["Start Date"] || dup["Start"] || "";
      note.textContent = `Already an active member of this squad (${role}${start ? ` — since ${start}` : ""}).`;
      el.btnSave.disabled = true;
      return true;
    } else {
      note.textContent = "";
      el.btnSave.disabled = false;
      return false;
    }
  }

  function rebuildMemberOptions() {
    if (!el.member) return;
    const isAdmin = !!(roles && roles.isAdmin && roles.isAdmin());

    const currentIds = new Set(
      STATE.members
        .filter(r => norm(r["Squad ID"]) === norm(STATE.squadId) && String(r["Active"]||"").toLowerCase() === "true")
        .map(r => String(r["Employee ID"] || "").trim().toLowerCase())
    );

    const all = Object.entries(STATE.empIndex)
      .map(([id, name]) => ({ id, name, nameLC: norm(name) }))
      .sort((a,b) => a.nameLC.localeCompare(b.nameLC));

    const existing = [];
    const available = [];
    all.forEach(e => (currentIds.has(norm(e.id)) ? existing : available).push(e));

    const labelFor = (e) => isAdmin ? `${e.name} — ${e.id}` : `${e.name}`;

    let html = `<option value="">Select a person…</option>`;
    if (existing.length) {
      html += `<optgroup label="Already on this squad">` +
        existing.map(e =>
          `<option value="${e.id}" disabled aria-disabled="true" data-existing="1">${labelFor(e)} (already on this squad)</option>`
        ).join("") +
      `</optgroup>`;
    }
    html += `<optgroup label="Available to add">` +
      available.map(e => `<option value="${e.id}">${labelFor(e)}</option>`).join("") +
    `</optgroup>`;

    el.member.innerHTML = html;
    el.member.value = "";
  }

  function open({ squadId, squadName }) {
    STATE.squadId = String(squadId || "").trim();
    STATE.squadName = String(squadName || "").trim();

    if (el.start) el.start.value = isoToday();
    if (el.active) el.active.checked = true;
    if (el.member) el.member.value = "";

    (async () => {
      await ensureEmployees();
      await ensureMembers();
      rebuildMemberOptions();
      updateDuplicateWarning();
    })();

    ensureRoleOptions();

    if (el.modal) {
      el.modal.classList.add("show");     // works with your modal CSS skin
      el.modal.style.display = "flex";
      el.modal.setAttribute("aria-hidden", "false");
    }
  }

  function close() {
    if (el.modal) {
      el.modal.classList.remove("show");
      el.modal.style.display = "none";
      el.modal.setAttribute("aria-hidden", "true");
    }
  }

  async function save() {
    if (!el.member || !el.role || !el.start || !el.active || !el.btnSave) return;
    const employeeId = (el.member.value || "").trim();
    let   role       = el.role.value || "Member";
    const startDate  = el.start.value || isoToday();
    const active     = !!el.active.checked;

    if (!employeeId || !STATE.squadId) {
      toast("Pick a member (and ensure squad ID is present).");
      return;
    }
    if (updateDuplicateWarning()) {
      toast("This person is already on the squad.", false);
      return;
    }

    const roleOptions = Array.from(el.role.options).map(o => o.value);
    const matchIdx = roleOptions.findIndex(o => norm(o) === norm(role));
    if (matchIdx >= 0) role = roleOptions[matchIdx];

    el.btnSave.disabled = true;

    try {
      const empName  = STATE.empIndex[employeeId] || "";
      const addedBy  = (P.session?.get?.()?.displayName) || (P.session?.get?.()?.employeeId) || "";

      await addRowsCompat(api.SHEETS.SQUAD_MEMBERS, [{
        "Squad ID": STATE.squadId,
        "Squad Name": STATE.squadName,
        "Employee ID": employeeId,
        "Employee Name": empName,
        "Role": role,
        "Active": active,
        "Start Date": startDate,
        "Added By": addedBy
      }]);

      close();
      document.dispatchEvent(new CustomEvent("squad-member-added", {
        detail: { squadId: STATE.squadId, employeeId }
      }));
      toast("Member added.", true);

      await ensureMembers();
      rebuildMemberOptions();
    } catch (err) {
      console.error(err);
      toast("Unable to add member. Please try again.");
    } finally {
      el.btnSave.disabled = false;
    }
  }

  if (el.btnCancel) el.btnCancel.onclick = (e) => { e.preventDefault(); close(); };
  if (el.btnSave)   el.btnSave.onclick   = (e) => { e.preventDefault(); save(); };
  if (el.member)    el.member.addEventListener("change", updateDuplicateWarning);

  // Close when clicking the dim backdrop
  if (el.modal) {
    el.modal.addEventListener("click", (e) => {
      if (e.target === el.modal) close();
    });
  }

  P.squadForm = { open, close };
})(window.PowerUp || (window.PowerUp = {}));
