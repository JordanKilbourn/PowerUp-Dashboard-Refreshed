// scripts/select-helper.js
(function (PowerUp) {
  const P = PowerUp || (PowerUp = {});

  /**
   * SmartSelect Component
   * - Multi-select dropdown with search
   * - Prevents duplicate selections
   * - PowerUp theme compatible
   */
  P.SmartSelect = class SmartSelect {
    constructor(container, options = [], config = {}) {
      this.container = container;
      this.options = options;
      this.selected = new Set();
      this.config = Object.assign({ placeholder: "Select…" }, config);
      this.render();
    }

    render() {
      this.container.classList.add("pu-smartselect");

      this.container.innerHTML = `
        <div class="pu-ss-field">
          <div class="pu-ss-tags"></div>
          <input class="pu-ss-input" placeholder="${this.config.placeholder}" />
          <button type="button" class="pu-ss-toggle"><i class="fa fa-chevron-down"></i></button>
        </div>
        <div class="pu-ss-dropdown" hidden>
          <input class="pu-ss-search" type="text" placeholder="Search..." />
          <div class="pu-ss-list"></div>
        </div>
      `;

      this.field = this.container.querySelector(".pu-ss-field");
      this.tags = this.container.querySelector(".pu-ss-tags");
      this.input = this.container.querySelector(".pu-ss-input");
      this.dropdown = this.container.querySelector(".pu-ss-dropdown");
      this.search = this.container.querySelector(".pu-ss-search");
      this.list = this.container.querySelector(".pu-ss-list");

      this.populateList();
      this.bindEvents();
    }

    populateList(filter = "") {
      const f = filter.trim().toLowerCase();
      this.list.innerHTML = "";
      for (const opt of this.options) {
        const already = this.selected.has(opt);
        if (f && !opt.toLowerCase().includes(f)) continue;

        const div = document.createElement("div");
        div.className = `pu-ss-item ${already ? "disabled" : ""}`;
        div.textContent = opt;
        div.dataset.value = opt;
        if (!already) {
          div.addEventListener("click", () => this.select(opt));
        }
        this.list.appendChild(div);
      }
    }

    bindEvents() {
      this.field.addEventListener("click", () => this.toggleDropdown());
      this.search.addEventListener("input", (e) => this.populateList(e.target.value));
      document.addEventListener("click", (e) => {
        if (!this.container.contains(e.target)) this.hideDropdown();
      });
    }

    toggleDropdown() {
      const visible = !this.dropdown.hasAttribute("hidden");
      this.dropdown.toggleAttribute("hidden", visible);
      if (!visible) this.search.focus();
    }

    hideDropdown() {
      this.dropdown.setAttribute("hidden", "");
    }

    select(value) {
      if (this.selected.has(value)) return;
      this.selected.add(value);
      this.updateTags();
      this.populateList();
    }

    remove(value) {
      this.selected.delete(value);
      this.updateTags();
      this.populateList();
    }

    updateTags() {
      this.tags.innerHTML = "";
      for (const val of this.selected) {
        const tag = document.createElement("span");
        tag.className = "pu-ss-tag";
        tag.innerHTML = `${val}<i class="fa fa-times"></i>`;
        tag.querySelector("i").addEventListener("click", () => this.remove(val));
        this.tags.appendChild(tag);
      }
    }

    getSelected() {
      return Array.from(this.selected);
    }
  };

// =====================================================
// PowerUp Multi-Select Dropdown (Extended from Add Member)
// =====================================================
PowerUp.buildEmployeeMultiSelect = async function (elementId, selectedNames = [], options = {}) {
  const container = document.getElementById(elementId);
  if (!container) return;

  const employees = await PowerUp.getEmployees();
  container.innerHTML = "";

  // Create the wrapper
  const wrap = document.createElement("div");
  wrap.className = "pu-multi-select";

  // Create the search input
  const input = document.createElement("input");
  input.type = "text";
  input.className = "pu-ms-input";
  input.placeholder = options.placeholder || "Search employees...";

  // Create dropdown list
  const list = document.createElement("div");
  list.className = "pu-ms-dropdown hidden";

  // Build options
  employees.forEach(emp => {
    const item = document.createElement("div");
    item.className = "pu-ms-option";
    item.textContent = emp.name;
    if (selectedNames.includes(emp.name)) item.classList.add("selected");
    item.addEventListener("click", () => {
      item.classList.toggle("selected");
      rebuildSelected();
    });
    list.appendChild(item);
  });

  // Rebuild tag-style display
  const selectedWrap = document.createElement("div");
  selectedWrap.className = "pu-ms-selected";

  function rebuildSelected() {
    const selected = Array.from(list.querySelectorAll(".pu-ms-option.selected")).map(i => i.textContent);
    selectedWrap.innerHTML = "";
    selected.forEach(name => {
      const tag = document.createElement("span");
      tag.className = "pu-ms-tag";
      tag.textContent = name;
      tag.addEventListener("click", () => {
        const opt = Array.from(list.children).find(i => i.textContent === name);
        if (opt) opt.classList.remove("selected");
        rebuildSelected();
      });
      selectedWrap.appendChild(tag);
    });
  }

  // Input interactions
  input.addEventListener("focus", () => list.classList.remove("hidden"));
  input.addEventListener("input", () => {
    const val = input.value.toLowerCase();
    Array.from(list.children).forEach(opt => {
      opt.style.display = opt.textContent.toLowerCase().includes(val) ? "block" : "none";
    });
  });
  document.addEventListener("click", e => {
    if (!wrap.contains(e.target)) list.classList.add("hidden");
  });

  wrap.appendChild(selectedWrap);
  wrap.appendChild(input);
  wrap.appendChild(list);
  container.appendChild(wrap);

  rebuildSelected();

  return {
    getSelected: () => Array.from(list.querySelectorAll(".pu-ms-option.selected")).map(i => i.textContent)
  };
};

  window.PowerUp = P;
})(window.PowerUp || {});
