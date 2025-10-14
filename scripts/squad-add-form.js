// scripts/squad-add-form.js
(function (P) {
  const { api } = P;

  // === Utility Functions ===
  const modalId = "addSquadModal";

  function showModal() {
    const overlay = document.getElementById(modalId);
    if (overlay) overlay.style.display = "flex";
  }
  function hideModal() {
    const overlay = document.getElementById(modalId);
    if (overlay) overlay.style.display = "none";
  }

  // --- Standardized Modal UX (shared across all modals) ---
  function ensureModalUX(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal || modal.querySelector(".modal-ux")) return;
    const ux = document.createElement("div");
    ux.className = "modal-ux";
    ux.style.cssText = `
      position:absolute;inset:0;display:none;
      align-items:center;justify-content:center;
      background:rgba(0,0,0,0.45);z-index:999;border-radius:10px;
    `;
    ux.innerHTML = `
      <div class="box" style="
        background:#0f1a1a;
        border:1px solid #2d3f3f;
        padding:14px 16px;
        border-radius:10px;
        min-width:220px;
        text-align:center;
        color:#e5e7eb;
        font-weight:700;
      ">Saving…</div>`;
    modal.appendChild(ux);
  }

  function showBusy(modalId, text = "Saving…") {
    ensureModalUX(modalId);
    const el = document.querySelector(`#${modalId} .modal-ux`);
    if (!el) return;
    el.style.display = "flex";
    const msg = el.querySelector(".box");
    if (msg) msg.textContent = text;
  }

  async function flashSuccess(modalId) {
    const msg = document.querySelector(`#${modalId} .modal-ux .box`);
    if (!msg) return;
    msg.textContent = "Saved!";
    msg.style.color = "#20d3a8";
    await new Promise(r => setTimeout(r, 700));
  }

  function hideBusy(modalId) {
    const el = document.querySelector(`#${modalId} .modal-ux`);
    if (el) el.style.display = "none";
  }

  // === Toast Notifications ===
  function showToast(message, type = "success") {
    let toast = document.getElementById("pu-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "pu-toast";
      toast.style.cssText = `
        position:fixed;bottom:30px;right:30px;z-index:2000;
        background:#0f1a1a;border:1px solid var(--accent,#00f08e);
        color:#9ffbe6;padding:10px 16px;border-radius:10px;
        box-shadow:0 2px 10px rgba(0,0,0,0.3);
        opacity:0;transition:opacity 0.3s ease;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.borderColor = type === "error" ? "#ff7070" : "var(--accent, #00f08e)";
    toast.style.color = type === "error" ? "#ff7070" : "#9ffbe6";
    toast.style.opacity = 1;

    setTimeout(() => {
      toast.style.opacity = 0;
    }, 3500);
  }

  // === Reset Form ===
  function resetAddSquadForm() {
    const form = document.getElementById("addSquadForm");
    if (form) form.reset();

    const sel = document.getElementById("squadLeaderSelect");
    if (sel) sel.selectedIndex = 0;

    const name = document.getElementById("squadName");
    const category = document.getElementById("squadCategory");
    const objective = document.getElementById("squadObjective");
    const active = document.getElementById("squadActive");

    if (name) name.value = "";
    if (category) category.value = "";
    if (objective) objective.value = "";
    if (active) active.checked = true;
  }

  // === Load Employee List for Leader Dropdown ===
  async function loadEmployees() {
    const select = document.getElementById("squadLeaderSelect");
    if (!select) return;
    select.innerHTML = `<option value="">Loading employees...</option>`;
    try {
      const rows = await api.getRowsByTitle("EMPLOYEE_MASTER");
      const options = rows
        .map(r => {
          const id = (r["Position ID"] || r["Employee ID"] || "").toString().trim();
          const name = (r["Display Name"] || r["Employee Name"] || r["Name"] || "").toString().trim();
          return id && name ? { id, name } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));

      // Add a clearable “None” option at the top
      select.innerHTML = `<option value="">— None —</option>` +
        options.map(o => `<option value="${o.id}">${o.name}</option>`).join("");
    } catch (err) {
      console.error("Error loading employees:", err);
      select.innerHTML = `<option value="">Failed to load employees</option>`;
    }
  }

  // === Handle Form Submission ===
  async function handleSubmit(e) {
    e.preventDefault();

    const name = document.getElementById("squadName")?.value.trim();
    const category = document.getElementById("squadCategory")?.value.trim();
    const leaderId = document.getElementById("squadLeaderSelect")?.value.trim();
    const leaderName = document.getElementById("squadLeaderSelect")?.selectedOptions[0]?.text || "";
    const objective = document.getElementById("squadObjective")?.value.trim();
    const active = document.getElementById("squadActive")?.checked ?? true;

    if (!name || !category || !objective) {
      alert("Please complete all required fields (Leader is optional).");
      return;
    }

    // Normalize category picklist values
    const categoryMap = {
      ci: "CI",
      "continuous improvement": "CI",
      quality: "Quality",
      safety: "Safety",
      training: "Training",
      other: "Other"
    };
    const categoryFixed = categoryMap[category.toLowerCase()] || "Other";

    showBusy(modalId, "Saving…");

    try {
      const createdBy = (P.session?.get()?.displayName || "System");
      const createdDate = new Date().toISOString().slice(0, 10);

      // Step 1: Create Squad
      const squadRow = [{
        "Squad Name": name,
        "Category": categoryFixed,
        "Objective": objective,
        "Active": active,
        "Created Date": createdDate,
        "Created By": createdBy
      }];
      await api.addRows("SQUADS", squadRow, { toTop: true });

      // Step 2: Wait for Auto-number ID
      let newSquadId = "";
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 1500));
        const updatedSquads = await api.getRowsByTitle("SQUADS", { force: true });
        const newSquad = updatedSquads.find(r =>
          (r["Squad Name"] || "").trim().toLowerCase() === name.toLowerCase()
        );
        newSquadId = (newSquad?.["Squad ID"] || newSquad?.["ID"] || "").toString().trim();
        if (newSquadId) break;
      }

      if (!newSquadId) {
        hideBusy(modalId);
        showToast("Squad created but ID not yet assigned — refresh to link members.", "error");
        return;
      }

      // Step 3: Add Leader if provided
      if (leaderId) {
        const memberRow = [{
          "Squad ID": newSquadId,
          "Squad Name": name,
          "Employee ID": leaderId,
          "Employee Name": leaderName,
          "Role": "Leader",
          "Active": true,
          "Added By": createdBy,
          "Start Date": createdDate
        }];
        await api.addRows("SQUAD_MEMBERS", memberRow, { toTop: true });
      }

      api.clearCache(api.SHEETS.SQUADS);
      api.clearCache(api.SHEETS.SQUAD_MEMBERS);

      await flashSuccess(modalId);
      hideBusy(modalId);
      hideModal();
      resetAddSquadForm();
      showToast(`✅ Squad "${name}" created successfully!`);
      document.dispatchEvent(new Event("squad-added"));
    } catch (err) {
      console.error("❌ Error creating squad:", err);
      hideBusy(modalId);
      showToast("Failed to create squad. See console for details.", "error");
    }
  }

  // === Init Form Events ===
  function init() {
    document.getElementById("cancelAddSquad")?.addEventListener("click", () => {
      resetAddSquadForm();
      hideModal();
    });
    document.getElementById("addSquadForm")?.addEventListener("submit", handleSubmit);
  }

  // === Public API ===
  P.squadAddForm = {
    open: async function () {
      await loadEmployees();
      showModal();
    },
    close: hideModal
  };

  document.addEventListener("DOMContentLoaded", init);
})(window.PowerUp || (window.PowerUp = {}));

console.log("✅ squad-add-form.js loaded and PowerUp.squadAddForm defined:", !!PowerUp.squadAddForm);
