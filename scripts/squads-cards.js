// =============================================
// PowerUp: Squads Page – Corrected Build (CB1)
// =============================================
(function (PowerUp) {
  const P = PowerUp || (window.PowerUp = {});
  const { SHEETS, getRowsByTitle } = P.api;

  // =======================
  // Admin-only button visibility
  // =======================
  document.addEventListener("DOMContentLoaded", () => {
    const isAdmin = P.auth?.isAdmin?.() || false;
    const addBtn = document.getElementById("btn-add-squad");
    const manageBtn = document.getElementById("btn-manage");
    const viewBtn = document.getElementById("btn-view-activities");
    if (!isAdmin) {
      if (addBtn) addBtn.style.display = "none";
      if (manageBtn) manageBtn.style.display = "none";
      if (viewBtn) viewBtn.style.display = "inline-flex";
    } else {
      if (addBtn) addBtn.style.display = "inline-flex";
      if (manageBtn) manageBtn.style.display = "inline-flex";
      if (viewBtn) viewBtn.style.display = "inline-flex";
    }

    // =======================
    // Admin filter dropdown change event
    // =======================
    const adminSelect = document.getElementById("pu-admin-employee-select");
    if (adminSelect) {
      adminSelect.addEventListener("change", (e) => {
        const val = e.target.value?.trim();
        sessionStorage.setItem("pu.adminEmployeeFilter", val || "__ALL__");
        console.debug("[Filter] Admin filter changed →", val);
        document.dispatchEvent(
          new CustomEvent("powerup-admin-filter-change", { detail: val })
        );
        applyFilters(); // immediate refresh
      });
    }
  });

  // ==== Column maps ====
  const EMP_COL = {
    id: ["Position ID", "Employee ID"],
    name: ["Display Name", "Employee Name", "Name"],
  };
  const SQUAD_COL = {
    id: ["Squad ID", "ID"],
    name: ["Squad Name", "Squad", "Name", "Team"],
    category: ["Category", "Squad Category"],
    leaderId: ["Squad Leader", "Leader Employee ID", "Leader Position ID"],
    members: ["Members", "Member List"],
    objective: ["Objective", "Focus", "Purpose"],
    active: ["Active", "Is Active?"],
    created: ["Created Date", "Start Date", "Started"],
    notes: ["Notes", "Description"],
  };
  const SM_COL = {
    squadId: ["Squad ID", "SquadID", "Squad"],
    empId: ["Employee ID", "EmployeeID", "Position ID"],
    empName: ["Employee Name", "Name", "Display Name"],
    active: ["Active", "Is Active?"],
    role: ["Role"],
  };

  const CATS = ["All", "CI", "Quality", "Safety", "Training", "Other"];
  const CAT_CLASS = {
    CI: "cat-ci",
    Quality: "cat-quality",
    Safety: "cat-safety",
    Training: "cat-training",
    Other: "cat-other",
  };

  const pick = (r, list, d = "") => {
    for (const k of list) if (r[k] != null && r[k] !== "") return r[k];
    return d;
  };
  const dash = (v) =>
    v == null || String(v).trim() === "" ? "-" : String(v);
  const isTrue = (v) =>
    v === true || /^(true|yes|y|checked|1)$/i.test(String(v ?? "").trim());

  const MEMBERS_BY_SQUAD = new Map();
  const LEADERS_BY_SQUAD = new Map();
  let ALL = [];
  let idToName = new Map();

  function normCategory(v) {
    const t = String(v || "").toLowerCase();
    if (/^ci|improve/.test(t)) return "CI";
    if (/^quality/.test(t)) return "Quality";
    if (/^safety/.test(t)) return "Safety";
    if (/^training/.test(t)) return "Training";
    return "Other";
  }

  // =======================
  // Data Loading
  // =======================
  async function load() {
    const emRows = await getRowsByTitle(SHEETS.EMPLOYEE_MASTER);
    idToName = new Map();
    emRows.forEach((r) => {
      const id = pick(r, EMP_COL.id, "").toString().trim();
      const name = pick(r, EMP_COL.name, "").toString().trim();
      if (id) idToName.set(id, name);
    });

    MEMBERS_BY_SQUAD.clear();
    LEADERS_BY_SQUAD.clear();

    const smRows = await getRowsByTitle(SHEETS.SQUAD_MEMBERS);
    smRows.forEach((r) => {
      if (!isTrue(pick(r, SM_COL.active, "true"))) return;
      const sid = pick(r, SM_COL.squadId, "").trim();
      if (!sid) return;
      const eid = pick(r, SM_COL.empId, "").trim();
      const enm =
        pick(r, SM_COL.empName, "") || idToName.get(eid) || "";
      const role = String(r["Role"] || "").toLowerCase();

      let entry = MEMBERS_BY_SQUAD.get(sid);
      if (!entry) {
        entry = { ids: new Set(), names: new Set() };
        MEMBERS_BY_SQUAD.set(sid, entry);
      }
      if (eid) entry.ids.add(eid.toLowerCase());
      if (enm) entry.names.add(enm.toLowerCase());
      if (role === "leader") {
        const arr = LEADERS_BY_SQUAD.get(sid) || [];
        arr.push({ id: eid, name: enm });
        LEADERS_BY_SQUAD.set(sid, arr);
      }
    });

    const rows = await getRowsByTitle(SHEETS.SQUADS);
    ALL = rows.map((r) => ({
      id: pick(r, SQUAD_COL.id, ""),
      name: pick(r, SQUAD_COL.name, ""),
      category: normCategory(pick(r, SQUAD_COL.category, "Other")),
      leaderId: pick(r, SQUAD_COL.leaderId, ""),
      leaderName: idToName.get(pick(r, SQUAD_COL.leaderId, "")) || "",
      members: pick(r, SQUAD_COL.members, ""),
      objective: pick(r, SQUAD_COL.objective, ""),
      active: pick(r, SQUAD_COL.active, ""),
      created: pick(r, SQUAD_COL.created, ""),
      notes: pick(r, SQUAD_COL.notes, ""),
    }));
  }

  // ============================================================
  // Filtering Logic (Admin/User Fixed)
  // ============================================================
  let activeCategory = "All";
  let activeOnly = false;

  async function applyFilters() {
    const manageMode = document
      .getElementById("btn-manage")
      ?.classList.contains("managing");
    if (manageMode) return;

    const cardsContainer = document.getElementById("cards");
    if (cardsContainer) {
      cardsContainer.classList.remove("manage-view");
      cardsContainer.classList.add("cards-grid");
      cardsContainer.style.display = "grid";
      cardsContainer.style.gridTemplateColumns = "repeat(4, 1fr)";
      cardsContainer.style.gap = "1.2rem";
    }

    const session = P.session.get?.() || {};
    const cat =
      document.querySelector(".pill-cat.active")?.dataset.cat ||
      activeCategory ||
      "All";
    const myOnly = document.getElementById("myOnly")?.checked;
    const activeOnly = document.getElementById("activeOnly")?.checked;
    const q = (document.getElementById("search")?.value || "")
      .trim()
      .toLowerCase();

    let list = [...ALL];
    const isAdmin = P.auth?.isAdmin?.() || false;
    const norm = (s) => String(s || "").trim().toLowerCase();

    if (myOnly) {
      let targetName = "";
      let targetId = "";

      if (isAdmin) {
        const adminVal =
          sessionStorage.getItem("pu.adminEmployeeFilter") || "";
        if (
          adminVal &&
          adminVal !== "__ALL__" &&
          adminVal.toLowerCase() !== "all employees"
        ) {
          targetName = adminVal.trim();
          for (const [id, nm] of idToName.entries()) {
            if (norm(nm) === norm(targetName)) {
              targetId = id;
              break;
            }
          }
        }
        console.debug("[Filter] Admin MySquads", { targetName, targetId });
      } else {
        targetName = (session.displayName || session.name || "").trim();
        targetId = (
          session.employeeId ||
          session.positionId ||
          ""
        ).trim();
        console.debug("[Filter] User MySquads", { targetName, targetId });
      }

      if (targetName && targetName.toLowerCase() !== "all employees") {
        const tgtName = norm(targetName);
        const tgtId = norm(targetId);

        list = list.filter((s) => {
          const sid = String(s.id || "").trim().toLowerCase();
          const members = MEMBERS_BY_SQUAD.get(sid);
          const leaders = LEADERS_BY_SQUAD.get(sid) || [];

          const memberHit =
            members &&
            ([...members.names].has(tgtName) ||
              [...members.ids].has(tgtId));

          const leaderHit = leaders.some((l) => {
            const lid = norm(l.id);
            const lname = norm(l.name);
            return lid === tgtId || lname === tgtName;
          });

          return memberHit || leaderHit;
        });
      }
    }

    if (activeOnly) list = list.filter((s) => isTrue(s.active));
    if (cat !== "All") list = list.filter((s) => s.category === cat);

    if (q) {
      list = list.filter((s) => {
        const hay = [
          s.name,
          s.leaderName,
          s.leaderId,
          s.objective,
          s.notes,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    console.debug("[Filter] Final count:", list.length);
    renderCards(list);
  }

   // =======================
  // UI Rendering
  // =======================
  function getCatVar(cat) {
    switch (cat) {
      case "CI":
        return "var(--sq-ci)";
      case "Quality":
        return "var(--sq-quality)";
      case "Safety":
        return "var(--sq-safety)";
      case "Training":
        return "var(--sq-training)";
      case "Other":
        return "var(--sq-other)";
      default:
        return "var(--accent)";
    }
  }

  function renderCategoryPills(activeCat) {
    const wrap = document.getElementById("cat-pills");
    if (!wrap) return;
    wrap.innerHTML = CATS.map((cat) => {
      const style = `--cat:${getCatVar(cat)};`;
      return `<button class="pill-cat${
        cat === activeCat ? " active" : ""
      }" data-cat="${cat}" style="${style}">
                <span class="dot"></span>${cat}
              </button>`;
    }).join("");
  }

  // =======================
  // Card Rendering
  // =======================
  function renderCards(list) {
    const cards = document.getElementById("cards");
    const msg = document.getElementById("s-msg");
    if (!cards) return;

    if (!list.length) {
      cards.innerHTML = "";
      msg.style.display = "block";
      msg.innerHTML =
        "No squads match your filters.<br/>Try clearing search or showing inactive.";
      return;
    }
    msg.style.display = "none";

    cards.innerHTML = list
      .map((sq) => {
        const status = isTrue(sq.active)
          ? `<span class="status-pill status-on">Active</span>`
          : `<span class="status-pill status-off">Inactive</span>`;

        const leaders = LEADERS_BY_SQUAD.get(String(sq.id || "").trim());
        let leaderLine = dash(sq.leaderName || sq.leaderId);
        if (leaders && leaders.length)
          leaderLine = leaders.map((x) => x.name).filter(Boolean).join(", ");

        const memberEntry = MEMBERS_BY_SQUAD.get(String(sq.id || "").trim());
        const mCount = memberEntry ? memberEntry.ids.size : 0;
        const memberChip = `
          <span class="member-chip">
            <img src="https://playworld.com/wp-content/uploads/2023/09/logo-icon.svg" 
                 alt="Playworld logo" 
                 class="emoji-logo" />
            ${mCount} member${mCount === 1 ? "" : "s"}
          </span>`;

        const detailsHref = sq.id
          ? `squad-details.html?id=${encodeURIComponent(sq.id)}`
          : `squad-details.html?name=${encodeURIComponent(sq.name)}`;
        const catCls = CAT_CLASS[sq.category] || CAT_CLASS.Other;

        return `<div class="squad-card ${catCls}">
                  <h4>${dash(sq.name)}</h4>
                  <div class="squad-meta"><b>Leader(s):</b> ${leaderLine}</div>
                  <div class="squad-meta"><b>Status:</b> ${status}</div>
                  <div class="squad-meta"><b>Focus:</b> ${dash(sq.objective)}</div>
                  <div class="squad-foot">
                    ${memberChip}
                    <a class="squad-link" href="${detailsHref}">View Details →</a>
                  </div>
                </div>`;
      })
      .join("");
  }

  // =======================
  // Manage Table Rendering (with sticky header fix)
  // =======================
  async function renderManageTable() {
    const cardsContainer = document.getElementById("cards");
    const msg = document.getElementById("s-msg");
    if (msg) msg.style.display = "none";

    cardsContainer.classList.remove("cards-grid");
    cardsContainer.classList.add("manage-view");
    cardsContainer.style.display = "none";

    try {
      const [squadSheet, members] = await Promise.all([
        P.api.fetchSheet(SHEETS.SQUADS, { force: true }),
        P.api.getRowsByTitle(SHEETS.SQUAD_MEMBERS, { force: true }),
      ]);

      const squads = P.api.rowsByTitle(squadSheet).map((r, i) => ({
        ...r,
        __rowId: squadSheet.rows[i]?.id || "",
      }));

      const allEmps = await P.getEmployees();

      const leadersBySquad = new Map();
      members.forEach((r) => {
        const isActive = /^(true|yes|y|1)$/i.test(String(r["Active"] || ""));
        if (!isActive) return;
        const sid = String(r["Squad ID"] || "").trim().toUpperCase();
        const role = String(r["Role"] || "").trim().toLowerCase();
        if (role === "leader") {
          leadersBySquad.set(sid, {
            id: String(r["Employee ID"] || "").trim(),
            name: String(r["Employee Name"] || "").trim(),
          });
        }
      });

      const table = document.createElement("table");
      table.className = "manage-table";
      table.innerHTML = `
        <thead>
          <tr>
            <th style="width:8%">ID</th>
            <th style="width:20%">Squad Name</th>
            <th style="width:12%">Category</th>
            <th style="width:6%">Active</th>
            <th style="width:26%">Objective</th>
            <th style="width:18%">Leader</th>
            <th style="width:10%">Created By</th>
            <th style="width:10%">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${squads
            .map((r) => {
              const sheetRowId = r.__rowId;
              const squadId = (r["Squad ID"] || "").trim().toUpperCase();
              const leader = leadersBySquad.get(squadId);
              const selectedName = leader ? leader.name : "";
              const rowData = {
                name: r["Squad Name"] || "",
                category: r["Category"] || "",
                active:
                  r["Active"] === true ||
                  String(r["Active"]).toLowerCase() === "true",
                objective: r["Objective"] || "",
                createdBy: r["Created By"] || "",
                leader: selectedName,
              };
              return `
              <tr data-rowid="${sheetRowId}" data-squadid="${squadId}"
                  data-original='${JSON.stringify(rowData)}'>
                <td>${squadId}</td>
                <td contenteditable class="editable name">${rowData.name}</td>
                <td contenteditable class="editable category">${rowData.category}</td>
                <td><input type="checkbox" class="active" ${
                  rowData.active ? "checked" : ""
                }></td>
                <td contenteditable class="editable objective">${rowData.objective}</td>
                <td>
                  <select class="leader-select-single">
                    <option value="">— Select Leader —</option>
                    ${allEmps
                      .map(
                        (emp) =>
                          `<option value="${emp.name}" ${
                            emp.name === selectedName ? "selected" : ""
                          }>${emp.name}</option>`
                      )
                      .join("")}
                  </select>
                </td>
                <td contenteditable class="editable created-by">${rowData.createdBy}</td>
                <td class="actions-cell">
                  <button class="btn-save">Save</button>
                  <button class="btn-cancel">Cancel</button>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>`;

      cardsContainer.innerHTML = "";
      const wrapper = document.createElement("div");
      wrapper.className = "manage-table-wrapper";
      wrapper.style.maxHeight = "calc(100vh - 320px)";
      wrapper.style.overflowY = "auto";
      wrapper.appendChild(table);
      cardsContainer.style.display = "block";
      cardsContainer.appendChild(wrapper);

      // Delegated Save + Cancel handlers
      table.addEventListener("click", async (e) => {
        const tr = e.target.closest("tr[data-rowid]");
        if (!tr) return;
        const rowId = tr.dataset.rowid;
        const original = JSON.parse(tr.dataset.original || "{}");

        if (e.target.classList.contains("btn-save")) {
          const name = tr.querySelector(".name")?.textContent.trim();
          const category = tr.querySelector(".category")?.textContent.trim();
          const active = tr.querySelector(".active")?.checked;
          const objective = tr.querySelector(".objective")?.textContent.trim();
          const createdBy = tr
            .querySelector(".created-by")
            ?.textContent.trim();
          const leaderName = tr.querySelector(".leader-select-single")?.value;
          const leaderEmp = allEmps.find((e) => e.name === leaderName);
          const squadId = tr.dataset.squadid;

          const hasChanges =
            name !== original.name ||
            category !== original.category ||
            active !== original.active ||
            objective !== original.objective ||
            createdBy !== original.createdBy ||
            (leaderEmp ? leaderEmp.name : leaderName) !== original.leader;

          if (!hasChanges) {
            showToast("No changes detected — nothing to save.", "info");
            return;
          }
          if (!leaderName) {
            showToast("Select a leader before saving.", "warn");
            return;
          }

          try {
            document
              .querySelectorAll(
                ".btn-save, .btn-cancel, .leader-select-single, .editable"
              )
              .forEach((el) => (el.disabled = true));
            showLoadingOverlay("Saving squad changes...");

            await P.api.updateRowById(P.api.SHEETS.SQUADS, rowId, {
              "Squad Name": name,
              Category: category,
              Active: active,
              Objective: objective,
              "Created By": createdBy,
            });

            if (leaderEmp && squadId) {
              await P.api.updateOrReplaceLeader({
                squadId,
                newLeaderId: leaderEmp.id,
                newLeaderName: leaderEmp.name,
              });
            }

            hideLoadingOverlay();
            document
              .querySelectorAll(
                ".btn-save, .btn-cancel, .leader-select-single, .editable"
              )
              .forEach((el) => (el.disabled = false));

            showToast("✅ Squad saved successfully.", "success");
            await renderManageTable();
          } catch (err) {
            hideLoadingOverlay();
            document
              .querySelectorAll(
                ".btn-save, .btn-cancel, .leader-select-single, .editable"
              )
              .forEach((el) => (el.disabled = false));
            console.error("Save error:", err);
            showToast("Error saving squad. Check console.", "error");
          }
        }

        if (e.target.classList.contains("btn-cancel")) {
          tr.querySelector(".name").textContent = original.name || "";
          tr.querySelector(".category").textContent =
            original.category || "";
          tr.querySelector(".active").checked = !!original.active;
          tr.querySelector(".objective").textContent =
            original.objective || "";
          tr.querySelector(".created-by").textContent =
            original.createdBy || "";
          const sel = tr.querySelector(".leader-select-single");
          if (sel) sel.value = original.leader || "";
          tr.style.backgroundColor = "rgba(255,255,0,0.1)";
          setTimeout(() => (tr.style.backgroundColor = ""), 700);
        }
      });
    } catch (err) {
      console.error("Render Manage Table error:", err);
      showToast("⚠️ Failed to load manage view.", "error");
    }
  }

   // =======================
  // Filter Bindings
  // =======================
  function bindFilters() {
    const catWrap = document.getElementById("cat-pills");
    const activeToggle = document.getElementById("activeOnly");
    const myToggle = document.getElementById("myOnly");
    const searchBox = document.getElementById("search");

    if (catWrap) {
      catWrap.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-cat]");
        if (!btn) return;
        activeCategory = btn.dataset.cat;
        renderCategoryPills(activeCategory);
        applyFilters();
      });
    }

    if (activeToggle)
      activeToggle.addEventListener("change", (e) => {
        activeOnly = e.target.checked;
        applyFilters();
      });

    if (myToggle)
      myToggle.addEventListener("change", (e) => {
        mySquadsOnly = e.target.checked;
        applyFilters();
      });

    if (searchBox) searchBox.addEventListener("input", applyFilters);

    // Also reapply when admin filter changes
    document.addEventListener("powerup-admin-filter-change", applyFilters);
  }

  // =======================
  // Page Init
  // =======================
  document.addEventListener("DOMContentLoaded", async () => {
    P.session?.requireLogin?.();
    P.layout.injectLayout();
    P.layout.setTitles("Squads");
    await P.session.initHeader();

    renderCategoryPills("All");
    await load();
    bindFilters?.();

    const myToggle = document.getElementById("myOnly");
    if (myToggle) {
      myToggle.checked = true;
    }
    applyFilters();

    const btnManage = document.getElementById("btn-manage");
    const btnAdd = document.getElementById("btn-add-squad");
    const btnView = document.getElementById("btn-view-activities");

    if (btnAdd)
      btnAdd.addEventListener("click", () =>
        PowerUp.squadAddForm?.open?.()
      );

    // Manage ↔ Card toggle
    if (btnManage) {
      btnManage.addEventListener("click", async () => {
        const isManaging = btnManage.classList.toggle("managing");
        showViewSwitchOverlay(
          isManaging ? "Loading Manage View..." : "Loading Card View..."
        );

        const cardsContainer = document.getElementById("cards");
        const msg = document.getElementById("s-msg");

        if (isManaging) {
          btnManage.textContent = "View Cards";
          cardsContainer.classList.remove("cards-grid");
          cardsContainer.classList.add("manage-view");
          cardsContainer.style.display = "block";
          if (msg) msg.style.display = "none";
          await renderManageTable();
        } else {
          btnManage.textContent = "Manage Squads";
          cardsContainer.classList.remove("manage-view");
          cardsContainer.classList.add("cards-grid");
          cardsContainer.style.display = "grid";
          applyFilters(); // restore grid layout + filters
        }
      });
    }

    // View All Activities placeholder (ready for later table integration)
    if (btnView) {
      btnView.addEventListener("click", () => {
        showToast("View All Activities coming soon!", "info");
      });
    }

    // Reset manage mode if category clicked
    document.getElementById("cat-pills")?.addEventListener("click", () => {
      const btnManage = document.getElementById("btn-manage");
      if (btnManage?.classList.contains("managing")) {
        btnManage.classList.remove("managing");
        btnManage.textContent = "Manage Squads";
      }
    });
  });

  // =======================
  // Inline Styles (Unified Layout + Sticky Header)
  // =======================
  const style = document.createElement("style");
  style.textContent = `
.squad-container {
  flex: 1;
  background-color: var(--panel-bg, #062a24);
  border-radius: 12px;
  padding: 1rem;
  margin: 0 auto;
  overflow: hidden;
  position: relative;
  max-height: calc(100vh - 220px);
  display: flex;
  flex-direction: column;
}

/* CARD GRID */
#cards.cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.2rem;
  width: 100%;
  flex: 1;
  overflow-y: auto;
  padding: 1rem 0;
  box-sizing: border-box;
}

/* STICKY HEADER FIX */
.manage-table-wrapper {
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: calc(100vh - 320px);
}
.manage-table th {
  position: sticky;
  top: 0;
  background: #122020;
  color: #99ffcc;
  z-index: 2;
  box-shadow: 0 2px 4px rgba(0,0,0,0.4);
}

.manage-view {
  display: block;
  overflow: hidden;
}

.btn-save, .btn-cancel {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 0.85rem;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  transition: all .2s;
}
.btn-save { color: #33ff99; border-color: #33ff99; }
.btn-save:hover { background: rgba(51,255,153,0.1); }
.btn-cancel { color: #ff8080; border-color: #ff5050; }
.btn-cancel:hover { background: rgba(255,80,80,0.1); }

#cards::-webkit-scrollbar-thumb {
  background-color: #33ff99;
  border-radius: 10px;
  border: 2px solid #0b1414;
}
#cards::-webkit-scrollbar-thumb:hover {
  background-color: #66ffc4;
}
.emoji-logo {
  width: 18px; height: 18px;
  filter: invert(52%) sepia(88%) saturate(3789%) hue-rotate(2deg) brightness(102%) contrast(101%);
  vertical-align: middle; margin-right: 6px;
}
@media (max-width: 1300px) {
  #cards { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 900px) {
  #cards { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  #cards { grid-template-columns: repeat(1, 1fr); }
}
`;
  document.head.appendChild(style);
})(window.PowerUp);
