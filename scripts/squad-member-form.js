// scripts/squad-member-form.js
(function (P) {
  const { api } = P;

  const el = {
    modal:      document.getElementById("addMemberModal"),
    member:     document.getElementById("memberSelect"),
    role:       document.getElementById("roleSelect"),
    start:      document.getElementById("startDate"),
    active:     document.getElementById("activeChk"),
    btnCancel:  document.getElementById("am-cancel"),
    btnSave:    document.getElementById("am-save"),
  };

  // local state
  let STATE = { squadId: "", squadName: "", employeesLoaded: false };

  function isoToday() { return new Date().toISOString().slice(0,10); }

  function toast(msg) {
    // If you already have a nicer toaster, wire it here.
    // Simple fallback:
    console.warn(msg);
    const n = document.createElement("div");
    n.textContent = msg;
    n.style.cssText = "position:fixed;right:18px;bottom:18px;background:#b91c1c;color:#fff;padding:10px 12px;border-radius:8px;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,.35)";
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 3000);
  }

  async function ensureEmployees() {
    if (STATE.employeesLoaded) return;
    const rows = await api.getRowsByTitle('EMPLOYEE_MASTER');
    // Build options: value=Employee ID (Position ID), label=Display Name — ID
    const opts = rows.map(r => {
      const id   = r["Position ID"] || r["Employee ID"] || r["ID"] || "";
      const name = r["Display Name"] || r["Employee Name"] || r["Name"] || id;
      return id ? `<option value="${id}">${name} — ${id}</option>` : "";
    }).join("");
    el.member.innerHTML = `<option value="">Select a person…</option>${opts}`;
    STATE.employeesLoaded = true;
  }

  function open({ squadId, squadName }) {
    STATE.squadId = String(squadId || "").trim();
    STATE.squadName = String(squadName || "").trim();

    // Debug if no squad id
    if (!STATE.squadId) {
      console.debug("[squad-member-form] open() received no squadId", { squadId, squadName });
    }

    // Prefill UI
    el.role.value = "Member";
    el.start.value = isoToday();
    el.active.checked = true;
    el.member.value = ""; // default to placeholder

    ensureEmployees();

    // Show modal
    el.modal.style.display = "flex";
    el.modal.setAttribute("aria-hidden", "false");
  }

  function close() {
    el.modal.style.display = "none";
    el.modal.setAttribute("aria-hidden", "true");
  }

  async function save() {
    const employeeId = el.member.value.trim();
    const role       = el.role.value || "Member";
    const startDate  = el.start.value || isoToday();
    const active     = !!el.active.checked;

    if (!employeeId || !STATE.squadId) {
      toast("Pick a member (and ensure squad ID is present).");
      return;
    }

    try {
      await api.addRows(api.SHEETS.SQUAD_MEMBERS, [{
        "Squad ID": STATE.squadId,
        "Employee ID": employeeId,
        "Role": role,
        "Active": active,
        "Start Date": startDate
      }]);

      close();
      // let the details page refresh the table
      document.dispatchEvent(new CustomEvent("squad-member-added", {
        detail: { squadId: STATE.squadId, employeeId }
      }));
    } catch (err) {
      console.error(err);
      toast("Unable to add member. Please try again.");
    }
  }

  // wire buttons
  if (el.btnCancel) el.btnCancel.onclick = (e) => { e.preventDefault(); close(); };
  if (el.btnSave)   el.btnSave.onclick   = (e) => { e.preventDefault(); save(); };

  // expose
  P.squadForm = { open, close };
})(window.PowerUp || (window.PowerUp = {}));
