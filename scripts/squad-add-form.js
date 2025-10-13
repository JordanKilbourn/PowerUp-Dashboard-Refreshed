// scripts/squad-add-form.js
(function (P) {
  const { api } = P;
  const modalId = "addSquadModal";
  const overlayId = "addSquadOverlay";
  const overlayMsgId = "addSquadOverlayMsg";

  function showModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add("show"); m.setAttribute("aria-hidden", "false"); }
  }
  function hideModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove("show"); m.setAttribute("aria-hidden", "true"); }
  }

  function showOverlay(text = "Saving…") {
    const overlay = document.getElementById(overlayId);
    const msg = document.getElementById(overlayMsgId);
    if (overlay && msg) { msg.textContent = text; overlay.style.display = "flex"; }
  }
  async function flashSuccess() {
    const msg = document.getElementById(overlayMsgId);
    if (!msg) return;
    msg.textContent = "Saved!";
    msg.style.color = "#20d3a8";
    await new Promise(r => setTimeout(r, 650));
  }
  function hideOverlay() {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.style.display = "none";
  }

  async function loadEmployees() {
    const select = document.getElementById("squadLeaderSelect");
    if (!select) return;
    select.innerHTML = `<option value="">Loading employees...</option>`;
    const rows = await api.getRowsByTitle("EMPLOYEE_MASTER").catch(() => []);
    const options = rows.map(r => {
      const id = (r["Position ID"] || r["Employee ID"] || "").toString().trim();
      const name = (r["Display Name"] || r["Employee Name"] || r["Name"] || "").toString().trim();
      return id && name ? `<option value="${id}">${name}</option>` : "";
    }).join("");
    select.innerHTML = `<option value="">-- Select Leader --</option>${options}`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = document.getElementById("squadName")?.value.trim();
    const category = document.getElementById("squadCategory")?.value.trim();
    const leaderId = document.getElementById("squadLeaderSelect")?.value.trim();
    const leaderName = document.getElementById("squadLeaderSelect")?.selectedOptions[0]?.text || "";
    const objective = document.getElementById("squadObjective")?.value.trim();

    if (!name || !category || !leaderId || !objective) {
      alert("Please complete all required fields."); return;
    }

    showOverlay("Saving…");

    try {
      // Create Squad
      const createdBy = (P.session?.get()?.displayName || "System");
      const createdDate = new Date().toISOString().slice(0, 10);

      const squadRow = [{
        "Squad Name": name,
        "Category": category,
        "Objective": objective,
        "Active": true,
        "Created Date": createdDate,
        "Created By": createdBy
      }];
      await api.addRows("SQUADS", squadRow, { toTop: true });

      // Refresh cache and get squad list for ID
      const squads = await api.getRowsByTitle("SQUADS", { force: true });
      const newSquad = squads.find(r => (r["Squad Name"] || "").trim().toLowerCase() === name.toLowerCase());
      const newSquadId = newSquad ? (newSquad["Squad ID"] || newSquad["ID"] || "").toString().trim() : "";

      // Add Leader as Member
      if (newSquadId) {
        const memberRow = [{
          "Squad ID": newSquadId,
          "Squad Name": name,
          "Employee ID": leaderId,
          "Employee Name": leaderName,
          "Role": "Leader",
          "Active": true,
          "Start Date": createdDate
        }];
        await api.addRows("SQUAD_MEMBERS", memberRow, { toTop: true });
        api.clearCache(api.SHEETS.SQUAD_MEMBERS);
      }

      await flashSuccess();
      hideOverlay();
      hideModal(modalId);

      document.getElementById("addSquadForm").reset();
      const evt = new Event("squad-added");
      document.dispatchEvent(evt);
    } catch (err) {
      console.error("Error creating squad:", err);
      hideOverlay();
      alert("Failed to create squad. See console for details.");
    }
  }

  function init() {
    document.getElementById("cancelAddSquad")?.addEventListener("click", () => hideModal(modalId));
    document.getElementById("addSquadForm")?.addEventListener("submit", handleSubmit);
  }

  P.squadAddForm = {
    open: async function () {
      await loadEmployees();
      showModal(modalId);
    }
  };

  document.addEventListener("DOMContentLoaded", init);
})(window.PowerUp || (window.PowerUp = {}));
