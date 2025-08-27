// scripts/roles.js
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});

  // === ADMIN ALLOWLIST =========================================
  // Add Employee IDs (Position IDs) that should have admin powers.
  // Example: ["E12345","E77777","99999"]
  const ADMIN_IDS = new Set([
    "IKS968538","IKS968547"
  ]);
  // =============================================================

  function isAdmin() {
    try {
      const me = P.session?.get?.() || {};
      const id = String(me.employeeId || "").trim();
      return id && ADMIN_IDS.has(id);
    } catch { return false; }
  }

  P.auth = { isAdmin, ADMIN_IDS };
  window.PowerUp = P;
})(window.PowerUp || {});
