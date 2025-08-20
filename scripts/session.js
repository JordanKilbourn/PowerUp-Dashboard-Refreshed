<script>
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
      // Prompt for Employee ID if missing (temporary until login page)
      let { employeeId, displayName } = this.get();
      if (!employeeId) {
        const entered = prompt("Enter your Employee ID (Position ID)");
        if (!entered) return;
        employeeId = entered.trim();
        sessionStorage.setItem("empID", employeeId);
      }

      // Pull Display Name + Level from Employee Master
      const { fetchSheet, SHEETS } = ns.api;
      const em = await fetchSheet(SHEETS.EMPLOYEE_MASTER);
      const rows = em.rows || [];

      // Employee Master keys per your screenshot
      // Position ID (unique), Display Name, PowerUp Level (Select)
      const row = rows.find(r =>
        String(r["Position ID"] || "").trim() === String(employeeId).trim()
      ) || {};

      displayName = displayName || (row["Display Name"] || employeeId);
      sessionStorage.setItem("displayName", displayName);

      const level = (row["PowerUp Level (Select)"] || "Unknown");
      sessionStorage.setItem("currentLevel", level);

      // Paint header (NO month)
      const nameEl  = document.querySelector('[data-hook="userName"]');
      const levelEl = document.querySelector('[data-hook="userLevel"]');
      if (nameEl)  nameEl.textContent  = displayName;
      if (levelEl) levelEl.textContent = String(level).startsWith("LVL") ? level : `Level ${level}`;
    }
  };

  ns.session = Session;
})(window.PowerUp);
</script>
