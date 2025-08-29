// scripts/roles.js  (v2025-08-29-c)
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});

  // === ADMIN ALLOWLIST =========================================
  // Employee IDs (Position IDs) with admin powers
  const ADMIN_IDS = new Set([
    "IKS968538","IKS968547"
  ]);
  // =============================================================

  function isAdmin() {
    try {
      const me = P.session?.get?.() || {};
      const id = String(me.employeeId || "").trim();
      return !!id && ADMIN_IDS.has(id);
    } catch { return false; }
  }

  P.auth = { isAdmin, ADMIN_IDS };
  window.PowerUp = P;

  // Tell the app that auth helpers are ready
  document.dispatchEvent(new Event('powerup-auth-ready'));
})(window.PowerUp || {});
