// scripts/squad-add-form.js
(function (P) {
  const { api } = P;
  const overlayId = "addSquadOverlay";
  const overlayMsgId = "addSquadOverlayMsg";
  const modalOverlayId = "addSquadModalOverlay"; // outer wrapper

  // === Utility Functions ===
  function showModal() {
    const overlay = document.getElementById(modalOverlayId);
    if (overlay) overlay.style.display = "flex";
  }
  function hideModal() {
    const overlay = document.getElementById(modalOverlayId);
    if (overlay) overlay.style.display = "none";
  }

  function showOverlay(text = "Saving…") {
    const overlay = document.getElementById(overlayId);
    const msg = document.getElementById(overlayMsgId);
    if (overlay && msg) {
      msg.textContent = text;
      msg.style.color = "#e5e7eb";
      overlay.style.display = "flex";
    }
  }
  async function flashSuccess() {
    const msg = document.getElementById(overlayMsgId);
    if (!msg) return;
    msg.textContent = "Saved!";
    msg.style.color = "#00f08e";
    await new Promise(r => setTimeout(r, 700));
  }
  function hideOverlay() {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.style.display = "none";
  }

  // === Load Employee List for Leader Select ===
  async function loadEmployees() {
    const select = document.getElementById("squadLeaderSelect");
    if (!select) return;
    select.innerHTML = `<option value="">Loading employees...</option>`;
    try {
      const rows = await api.getRowsByTitle("EMPLOYEE_MASTER");
      const options = rows.map(r => {
        const id = (r["Position ID"] || r["Employee ID"] || "").toString().trim();
        const name = (r["Display Name"] || r["Employee Name"] || r["Name"] || "").toString().trim();
        return id && name ? { id, name } : null;
      }).filter(Boolean);

      // Sort alphabetically
      options.sort((a, b) => a.name.localeCompare(b.name));

      select.innerHTML = `<option value="">-- Select Leader --</option>` +
        options.map(o => `<option value="${o.id}">${o.name}</option>`).join("");
    } catch (err) {
      console.error("Error loading employees:", err);
      select.innerHTML = `<option value="">Failed to load employees</option>`;
    }
  }

  // === Handle Form Submit ===
  async function handleSubmit(e) {
    e.preventDefault();

    const name = document.getElementById("squadName")?.value.trim();
    const category = document.getElementById("squadCategory")?.value.trim();
    const leaderId = document.getElementById("squadLeaderSelect")?.value.trim();
    const leaderName = document.getElementById("squadLeaderSelect")?.selectedOptions[0]?.text || "";
    const objective = document.getElementById("squadObjective")?.value.trim();
    const active = document.getElementById("squadActive")?.checked ?? true;

    if (!name || !category || !leaderId || !objective) {
      alert("Please complete all required fields.");
      return;
    }

// Map to valid Smartsheet picklist values
const categoryMap = {
  ci: "CI",
  "continuous improvement": "CI",
  quality: "Quality",
  safety: "Safety",
  training: "Training",
  other: "Other"
};
const categoryFixed = categoryMap[category.toLowerCase()] || "Other";


    showOverlay("Saving…");

    try {
      const createdBy = (P.session?.get()?.displayName || "System");
      const createdDate = new Date().toISOString().slice(0, 10);

      // Create the new Squad
      const squadRow = [{
        "Squad Name": name,
        "Category": categoryFixed,
        "Objective": objective,
        "Active": active,
        "Created Date": createdDate,
        "Created By": createdBy
      }];

      const addResult = await api.addRows("SQUADS", squadRow, { toTop: true });
      const newSquadId = (addResult?.[0]?.["Squad ID"] || addResult?.[0]?.["ID"] || "").toString().trim();

      // Add the leader as a member row
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

      api.clearCache(api.SHEETS.SQUAD_MEMBERS);

      await flashSuccess();
      hideOverlay();
      hideModal();
      document.getElementById("addSquadForm").reset();

      // Fire event to refresh list
      document.dispatchEvent(new Event("squad-added"));
    } catch (err) {
      console.error("❌ Error creating squad:", err);
      hideOverlay();
      alert("Failed to create squad. See console for details.");
    }
  }

  // === Initialize Form Events ===
  function init() {
    document.getElementById("cancelAddSquad")?.addEventListener("click", hideModal);
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
