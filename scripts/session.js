// /scripts/session.js
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const Session = {
    save({ employeeId, displayName }) {
      sessionStorage.setItem("empID", employeeId || "");
      sessionStorage.setItem("displayName", displayName || "");
    },
    get() {
      return {
        employeeId: sessionStorage.getItem("empID") || "",
        displayName: sessionStorage.getItem("displayName") || ""
      };
    },
    async initHeader() {
      let { employeeId, displayName } = this.get();
      if (!employeeId) {
        const entered = prompt("Enter your Employee ID (Position ID)");
        if (!entered) return;
        employeeId = entered.trim();
        sessionStorage.setItem("empID", employeeId);
      }

      const { fetchSheet, rowsByTitle, SHEETS } = ns.api;
      const emSheet = await fetchSheet(SHEETS.EMPLOYEE_MASTER);
      const emRows  = rowsByTitle(emSheet);

      const row = emRows.find(r =>
        String(r["Position ID"] || "").trim() === String(employeeId).trim()
      );

      // If a row isn’t found, keep the ID and show Unknown level
      const name  = row?.["Display Name"] || employeeId;
      const level = row?.["PowerUp Level (Select)"] || "Level Unknown";

      sessionStorage.setItem("displayName", name);
      sessionStorage.setItem("currentLevel", level);

      const nameEl  = document.querySelector('[data-hook="userName"]');
      const levelEl = document.querySelector('[data-hook="userLevel"]');
      if (nameEl)  nameEl.textContent  = name;
      if (levelEl) levelEl.textContent = level;
    }
  };

  ns.session = Session;
})(window.PowerUp);
