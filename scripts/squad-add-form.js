// scripts/squad-add-form.js
(function (P) {
  const { api } = P;
  const overlayId = "addSquadOverlay";
  const overlayMsgId = "addSquadOverlayMsg";
  const modalOverlayId = "addSquadModalOverlay"; // outer wrapper

  // === Utility: Modal Control ===
  function showModal() {
    const overlay = document.getElementById(modalOverlayId);
    if (overlay) overlay.style.display = "flex";
  }
  function hideModal() {
    const overlay = document.getElementById(modalOverlayId);
    if (overlay) overlay.style.display = "none";
  }

  // === Overlay Loader ===
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
    await new Promise(r => setTimeout(r, 650));
  }
  function hideOverlay() {
    const overlay = document.getElementById(overlayId);
    if (overlay) overlay.style.display = "none";
  }

  // === Toast System (non-blocking notifications) ===
  function showToast(message, type = "info") {
    let toast = document.getElementById("pu-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "pu-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.borderColor = type === "error" ? "#ff6060" : "var(--accent)";
    toast.style.color = type === "error" ? "#ff8080" : "#9ffbe6";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2800);
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

      options.sort((a, b) => a.name.localeCompare(b.name));
      select.innerHTML =
        `<option value="">-- Select Leader --</option>` +
        options.map(o => `<option value="${o.id}">${o.name}</option>`).join("");
    } catch (err) {
      console.error("❌ Error loading employees:", err);
      select.innerHTML = `<option value="">Failed to load employees</option>`;
    }
  }

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

  // Normalize category values to match picklist exactly
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

    // === Step 1: Create the Squad ===
    const squadRow = [{
      "Squad Name": name,
      "Category": categoryFixed,
      "Objective": objective,
      "Active": active,
      "Created Date": createdDate,
      "Created By": createdBy
    }];
    await api.addRows("SQUADS", squadRow, { toTop: true });

    // === Step 2: Wait for Smartsheet to assign Auto-Number ID ===
    let newSquadId = "";
    const maxTries = 6;

    for (let i = 0; i < maxTries; i++) {
      await new Promise(r => setTimeout(r, 1500)); // wait 1.5s

      const updatedSquads = await api.getRowsByTitle("SQUADS", { force: true });
      const newSquad = updatedSquads.find(r =>
        (r["Squad Name"] || "").trim().toLowerCase() === name.toLowerCase()
      );

      newSquadId = (newSquad?.["Squad ID"] || newSquad?.["ID"] || "").toString().trim();

      if (newSquadId) {
        console.log(`✅ Squad ID found after ${i + 1} attempt(s): ${newSquadId}`);
        break;
      } else {
        console.log(`⏳ Waiting for Squad ID... (${i + 1}/${maxTries})`);
      }
    }

    if (!newSquadId) {
      hideOverlay();
      alert("Squad was created, but no ID was retrieved yet. Please refresh.");
      return;
    }

    // === Step 3: Add the Leader to the Squad Members sheet ===
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

    api.clearCache(api.SHEETS.SQUADS);
    api.clearCache(api.SHEETS.SQUAD_MEMBERS);

    // === Step 4: UX feedback ===
    await flashSuccess();
    hideOverlay();
    hideModal();
    document.getElementById("addSquadForm").reset();

    showToast(`✅ Squad "${name}" created successfully!`);
    document.dispatchEvent(new Event("squad-added"));
  } catch (err) {
    console.error("❌ Error creating squad:", err);
    hideOverlay();
    showToast("Failed to create squad. See console for details.", "error");
  }
}
      // Step 5: UX feedback + cleanup
      await flashSuccess();
      hideOverlay();
      hideModal();
      document.getElementById("addSquadForm").reset();

      showToast(`✅ Squad "${name}" created successfully!`);
      document.dispatchEvent(new Event("squad-added"));
    } catch (err) {
      console.error("❌ Error creating squad:", err);
      hideOverlay();
      showToast("Failed to create squad. See console for details.", "error");
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
