// scripts/squad-member-form.js
(function (P) {
  const SHEETS = P.api.SHEETS;

  // --- Elements ---
  const modal   = document.getElementById('addMemberModal');
  const openBtn = document.getElementById('addMemberBtn'); // your existing button
  const sel     = document.getElementById('memberSelect');
  const roleSel = document.getElementById('roleSelect');
  const dateEl  = document.getElementById('startDate');
  const activeEl= document.getElementById('activeChk');

  if (!modal || !openBtn) return; // page safety

  // Default start date = today (YYYY-MM-DD is ideal for Smartsheet API)
  dateEl.value = new Date().toISOString().slice(0,10);

  // Non-admins cannot assign leader
  const isAdmin = !!P.roles?.has?.('admin');
  if (!isAdmin) {
    roleSel.value = "Member";
    roleSel.disabled = true;
  }

  // Wire up
  openBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    await populatePeople();
    show(true);
  });
  document.getElementById('am-cancel').onclick = () => show(false);
  document.getElementById('am-save').onclick = onSave;

  function show(on){ modal.classList.toggle('show', !!on); modal.setAttribute('aria-hidden', on ? "false" : "true"); }
  function toast(msg, error){
    const c = document.createElement('div');
    c.textContent = msg;
    Object.assign(c.style, {
      position:"fixed", right:"16px", bottom:"16px", zIndex:2000,
      background: error ? "#7f1d1d" : "#0f3d35",
      border: `1px solid ${error ? "#dc2626" : "#10b981"}`,
      color:"#fff", padding:"10px 12px", borderRadius:"8px",
      boxShadow:"0 6px 18px rgba(0,0,0,.35)"
    });
    document.body.appendChild(c); setTimeout(()=>c.remove(), 2400);
  }
  const esc = (s)=>String(s??"").replace(/[&<>]/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;'}[m]));

  // You likely store the Squad ID in the URL (?squad=...) or data- attribute
  function getSquadId(){
    const u = new URL(location.href);
    return u.searchParams.get('squad') || document.body.dataset.squadId || "";
  }

  async function populatePeople(){
    if (sel.options.length) return;

    const rows = await P.api.getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    const idKey = rows.length && ("Position ID" in rows[0] ? "Position ID" : "Employee ID");
    const opts = rows
      .map(r => ({ name: r["Display Name"] || r["Employee Name"] || r["Name"], id: r[idKey] }))
      .filter(x => x.name && x.id)
      .sort((a,b) => a.name.localeCompare(b.name));

    sel.innerHTML = opts.map(o => `<option value="${o.id}">${esc(o.name)} — ${o.id}</option>`).join("");
  }

  async function onSave(){
    const squadId    = getSquadId();
    const employeeId = sel.value;
    const role       = roleSel.value || "Member";
    const start      = dateEl.value;   // YYYY-MM-DD
    const active     = !!activeEl.checked;

    if (!squadId || !employeeId) {
      toast("Pick a member (and ensure squad id is present).", true);
      return;
    }

    // Prevent duplicates (same Squad ID + Employee ID active)
    const existing = await P.api.getRowsByTitle(SHEETS.SQUAD_MEMBERS, { force:true });
    const dup = existing.some(r =>
      String(r["Squad ID"]).trim() === String(squadId).trim() &&
      String(r["Employee ID"]).trim() === String(employeeId).trim() &&
      String(r["Active"]).toLowerCase() === "true"
    );
    if (dup) { toast("Already an active member of this squad.", true); return; }

    try {
      await P.api.addRows(SHEETS.SQUAD_MEMBERS, [{
        "Squad ID": squadId,
        "Employee ID": employeeId,
        "Role": role,
        "Active": active,
        "Start Date": start
      }], { toTop: true });

      toast("Member added.");
      show(false);

      // Clear caches related to members so your table reload fetches fresh
      P.api.clearCache(SHEETS.SQUAD_MEMBERS);
      // Call your existing re-render
      if (typeof window.refreshMembers === "function") window.refreshMembers();

    } catch (err) {
      console.error(err);
      toast("Failed to add member (see console).", true);
    }
  }
})(window.PowerUp || {});
