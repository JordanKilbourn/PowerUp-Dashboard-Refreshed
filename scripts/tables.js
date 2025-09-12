// scripts/tables.js
// DROP-IN REPLACEMENT with labeled Meta Chips + Prev/Next navigation + dual filters w/ Clear
window.PowerUp = window.PowerUp || {};
(function (ns) {
  const { fetchSheet, rowsByTitle, SHEETS } = ns.api;

  // === Column dictionaries (for table rendering only) ===
  const COL_MAP = {
    ci: {
      "Submission Date": "Submitted",
      "Submission ID": "ID",
      "Problem Statements": "Problem",
      "Proposed Improvement": "Improvement",
      "CI Approval": "Approval",
      "Assigned To (Primary)": "Assigned",
      "Status": "Status",
      "Action Item Entry Date": "Action Entered",
      "Last Meeting Action Item's": "Last Action",
      "Resourced": "Resourced",
      "Resourced Date": "Resourced On",
      "Token Payout": "Tokens",
      "Paid": "Paid"
    },
    safety: {
      "Date": "Date",
      "Department/Area": "Dept/Area",
      "Safety Concern": "Safety Concern",
      "Describe the safety concern": "Description",
      "Recommendations to correct/improve safety issue": "Recommendations",
      "Resolution": "Resolution",
      "Who was the safety concern escalated to": "Escalated To",
      "Leadership update": "Leadership Update",
      "Closed/Confirmed by- leadership only": "Closed/Confirmed",
      "Status": "Status"
    },
    quality: {
      "Catch ID": "Catch ID",
      "Entry Date": "Entry Date",
      "Submitted By": "Submitted By",
      "Area": "Area",
      "Quality Catch": "Quality Catch",
      "Part Number": "Part Number",
      "Description": "Description"
    }
  };

  // === Helpers ===
  const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const fmtDate = (v) => {
    if (v == null || String(v).trim() === "") return "-";
    const d = new Date(v);
    return isNaN(d) ? "-" : `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
  };
  const boolMark = (v) => {
    const raw = String(v ?? "").trim().toLowerCase();
    if (raw === "") return "-";
    if (v === true || raw === "true" || raw === "yes" || raw === "paid") return `<span class="pill pill--green" title="Yes">✓</span>`;
    if (v === false || raw === "false" || raw === "no") return `<span class="pill pill--red" title="No">✗</span>`;
    return esc(v);
  };
  const statusPill = (v) => {
    if (v == null || String(v).trim() === "") return "-";
    const t = String(v).toLowerCase();
    if (/approved|accepted|closed|complete/.test(t)) return `<span class="pill pill--green">${esc(v)}</span>`;
    if (/pending|progress|open|new|not\s*started/.test(t)) return `<span class="pill pill--blue">${esc(v)}</span>`;
    if (/denied|rejected|cancel/.test(t))           return `<span class="pill pill--red">${esc(v)}</span>`;
    return esc(v);
  };
  function format(col, value) {
    const t = String(col || "").toLowerCase();
    if (t.includes("date")) return fmtDate(value);
    if (t.includes("token")) {
      const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? `$${n}` : "-";
    }
    if (t === "paid" || t === "resourced") return boolMark(value);
    if (t.includes("status") || t.includes("approval")) return statusPill(value);
    const blank = value == null || String(value).trim() === "";
    return blank ? "-" : esc(value);
  }

  // ===== Modal utilities =====
  function openRecordModal(title, entries, metaChips = []) {
    const modal = document.getElementById('pu-record-modal');
    const card  = modal?.querySelector('.pu-modal__card');
    const dl    = document.getElementById('pu-record-dl');
    const ttl   = document.getElementById('pu-record-title');
    const meta  = document.getElementById('pu-record-meta');
    if (!modal || !card || !dl || !ttl || !meta) return;

    // Fill content
    ttl.textContent = title || 'Record';
    dl.innerHTML = entries.map(([k,v]) => `<dt>${String(k)}</dt><dd>${v}</dd>`).join('');
    if (metaChips.length) { meta.innerHTML = metaChips.join(''); meta.hidden = false; }
    else { meta.innerHTML = ''; meta.hidden = true; }

    // Remember opener to restore focus on close
    const opener = document.activeElement;

    // Show dialog + focus the card
    modal.classList.add('is-open');
    modal.inert = false;
    modal.setAttribute('aria-hidden', 'false');
    if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex','-1');
    card.focus({ preventScroll: true });

    function onKeyDown(e) {
      if (e.key === 'Escape') { doClose(); return; }
      if (e.key !== 'Tab') return;
      const focusables = card.querySelectorAll(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }

    function doClose() {
      modal.inert = true;
      const fallback = document.body;
      const target = (opener && document.contains(opener) && typeof opener.focus === 'function')
        ? opener : fallback;
      try { target.focus({ preventScroll: true }); } catch {}
      if (modal.contains(document.activeElement)) {
        fallback.setAttribute('tabindex', '-1');
        fallback.focus({ preventScroll: true });
        fallback.removeAttribute('tabindex');
      }
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      modal.querySelectorAll('[data-modal-close]').forEach(el => el.removeEventListener('click', onCloseClick));
      document.removeEventListener('keydown', onKeyDown);
    }
    function onCloseClick(e){ e.preventDefault(); doClose(); }

    modal.querySelectorAll('[data-modal-close]').forEach(el => el.addEventListener('click', onCloseClick));
    document.addEventListener('keydown', onKeyDown);
  }

  // Build entries from DOM (skip "View" column)
  function buildEntriesFromDOM(tbody, tr) {
    const table = tbody.closest('table');
    const headerCells = Array.from(table.querySelectorAll('thead th'));
    const cells = Array.from(tr.children);
    const entries = [];
    for (let i = 1; i < headerCells.length && i < cells.length; i++) {
      const label = (headerCells[i].textContent || '').trim();
      if (!label) continue;
      let html = cells[i].innerHTML;
      if (!html || html.trim() === "") html = "-";
      entries.push([label, html]);
    }
    return entries;
  }

  // Title: prefer the actual ID cell, tighten hyphens, otherwise fallback to table prefix
  function deriveTitle(tableId, tr) {
    const headerCells = Array.from(tr.closest('table').querySelectorAll('thead th'));
    const cells = Array.from(tr.children);
    const idLabels = ['ID','Submission ID','Catch ID'];
    for (let i = 1; i < headerCells.length && i < cells.length; i++) {
      const label = (headerCells[i].textContent || '').trim();
      if (idLabels.includes(label)) {
        let idText = (cells[i].textContent || '').trim();
        idText = idText.replace(/\s*[\-\u2013\u2014]\s*/g, '-');
        if (idText) return idText;
      }
    }
    if (tableId === 'ci-table') return 'CI';
    if (tableId === 'safety-table') return 'Safety';
    if (tableId === 'quality-table') return 'Quality';
    return 'Record';
  }

  // Build labeled meta chips from the DOM (Date • Status • Assigned/Submitter/Area)
  function buildMetaChipsFromDOM(tbody, tr) {
    const table = tbody.closest('table');
    const hs = Array.from(table.querySelectorAll('thead th'));
    const cs = Array.from(tr.children);

    const wants = [
      { match: ['submitted','entry date','date'], icon: 'fa-regular fa-calendar' },
      { match: ['status'],                        icon: 'fa-regular fa-flag'    },
      { match: ['assigned','submitted by','employee','area'], icon: 'fa-regular fa-user' }
    ];

    const canonical = (lblLC) => {
      switch (lblLC) {
        case 'submitted': case 'entry date': case 'date': return 'Date';
        case 'status': return 'Status';
        case 'assigned': return 'Assigned';
        case 'submitted by': return 'Submitter';
        case 'employee': return 'Employee';
        case 'area': return 'Area';
        default: return lblLC.replace(/\b\w/g, c => c.toUpperCase());
      }
    };

    const chips = [];
    for (const want of wants) {
      for (let i = 1; i < hs.length && i < cs.length; i++) {
        const lbl = (hs[i].textContent || '').trim();
        const lblLC = lbl.toLowerCase();
        if (want.match.includes(lblLC)) {
          let contentHTML = cs[i].innerHTML.trim();
          if (!contentHTML) continue;
          const value = contentHTML.includes('pill') ? contentHTML : esc(cs[i].textContent || '');
          const labelText = canonical(lblLC);
          chips.push(
            `<span class="chip"><i class="${want.icon} fa"></i><span class="chip__label">${labelText}</span><span class="chip__value">${value}</span></span>`
          );
          break;
        }
      }
    }
    return chips;
  }

  // ===== Prev/Next navigation state =====
  let _nav = null; // { tbody, index }
  function visibleRows(tbody) {
    return Array.from(tbody.querySelectorAll('tr'))
      .filter(tr => tr.style.display !== 'none' && tr.children.length > 1);
  }
  function updateNavButtons() {
    const prev = document.getElementById('pu-nav-prev');
    const next = document.getElementById('pu-nav-next');
    if (!_nav) { if (prev) prev.disabled = true; if (next) next.disabled = true; return; }
    const rows = visibleRows(_nav.tbody);
    const len = rows.length;
    const i = Math.min(Math.max(_nav.index, 0), len - 1);
    if (prev) prev.disabled = (i <= 0);
    if (next) next.disabled = (i >= len - 1);
  }
  function renderModalFromIndex() {
    if (!_nav) return;
    const rows = visibleRows(_nav.tbody);
    if (!rows.length) return;
    _nav.index = Math.min(Math.max(_nav.index, 0), rows.length - 1);
    const tr = rows[_nav.index];
    const tableId = _nav.tbody.closest('table')?.id || '';
    const entries = buildEntriesFromDOM(_nav.tbody, tr);
    const title = deriveTitle(tableId, tr);
    const metaChips = buildMetaChipsFromDOM(_nav.tbody, tr);
    openRecordModal(title, entries, metaChips);
    updateNavButtons();
  }
  function wireNavButtonsOnce() {
    const prev = document.getElementById('pu-nav-prev');
    const next = document.getElementById('pu-nav-next');
    if (prev && !prev.dataset.bound) {
      prev.dataset.bound = "1";
      prev.addEventListener('click', () => { if (!_nav) return; _nav.index--; renderModalFromIndex(); });
    }
    if (next && !next.dataset.bound) {
      next.dataset.bound = "1";
      next.addEventListener('click', () => { if (!_nav) return; _nav.index++; renderModalFromIndex(); });
    }
  }
  function startNavFromRow(tbody, tr) {
    const rows = visibleRows(tbody);
    _nav = { tbody, index: rows.indexOf(tr) };
    wireNavButtonsOnce();
    renderModalFromIndex();
  }

  // --- widths for compact columns (headers + cells)
  function widthFor(label){
    const t = String(label||'').toLowerCase();
    if (label === 'ID' || label === 'Catch ID') return 90;
    if (t.includes('date')) return 110;
    if (t.includes('token')) return 90;
    if (t === 'paid' || t === 'resourced') return 84;
    if (t.includes('status') || t.includes('approval')) return 120;
    if (t.includes('assigned') || t.includes('submitted by') || t === 'employee' || t === 'area' || t.includes('dept')) return 150;
    if (t === 'part number') return 130;
    return 0; // long text columns expand naturally
  }

  // ===== Render + sort =====
  function renderTable(tbody, rows, colMap, tableId, empNameById) {
    if (!tbody) return;
    const cols = Object.keys(colMap);
    const friendly = Object.values(colMap);
    tbody._data = { rows, colMap, cols, friendly, tableId, empNameById };

    const widths = friendly.map(widthFor);

    const html = rows.map((r, i) => {
      const cells = [];
      cells.push(`<td class="view-cell"><button class="view-btn" data-action="view" data-idx="${i}" aria-label="View record">View</button></td>`);
      cols.forEach((c, ci) => {
        const w = widths[ci];
        const style = w ? ` style="width:${w}px;max-width:${w+20}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"` : '';
        if (c === "__EMP_NAME__") {
          const idRaw = String(r["Employee ID"] || r["Position ID"] || "").trim();
          const by = String(r["Submitted By"] || r["Employee Name"] || r["Name"] || "").trim();
          const name = (idRaw && empNameById && empNameById.get(idRaw.toLowerCase())) || by || (idRaw || "-");
          cells.push(`<td data-sort="${(name||'').toString().toLowerCase()}"${style}>${esc(name)}</td>`);
          return;
        }
        const raw = r[c];
        const val = format(c, raw);
        let sortVal = (raw ?? "").toString().toLowerCase();
        if (c.toLowerCase().includes("date")) {
          const d = new Date(raw);
          sortVal = isNaN(d) ? "" : d.getTime();
        } else if (c.toLowerCase().includes("token")) {
          const n = Number(String(raw).replace(/[^0-9.\-]/g, ""));
          sortVal = Number.isFinite(n) ? String(n) : "";
        }
        cells.push(`<td data-sort="${sortVal}"${style}>${val}</td>`);
      });
      return `<tr data-idx="${i}">${cells.join("")}</tr>`;
    }).join("");

    tbody.innerHTML = html || `<tr><td colspan="${cols.length + 1}" style="text-align:center;opacity:.7;">No rows</td></tr>`;

    const thead = tbody.closest("table")?.querySelector("thead tr");
    if (thead) {
      const ths = [`<th class="view-col" aria-label="View" style="width:56px"></th>`]
        .concat(friendly.map((label, i) => {
          const w = widths[i];
          const style = w ? ` style="width:${w}px"` : '';
          return `<th${style}>${label}</th>`;
        }));
      thead.innerHTML = ths.join("");
      bindHeaderSort(thead, tbody);
    }

    // Delegate clicks to open modal with nav
    if (!tbody.dataset.viewBound) {
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="view"]');
        if (!btn) return;
        const tr = btn.closest('tr');
        startNavFromRow(tbody, tr);
      });
      tbody.dataset.viewBound = "1";
    }
  }

  function bindHeaderSort(thead, tbody) {
    let state = { col: 1, asc: true }; // skip view column
    const applyIndicators = () => {
      thead.querySelectorAll("th").forEach((h, i) => {
        h.setAttribute("data-sort", "none");
        h.removeAttribute("aria-sort");
        if (i === state.col) {
          h.setAttribute("data-sort", state.asc ? "asc" : "desc");
          h.setAttribute("aria-sort", state.asc ? "ascending" : "descending");
        }
      });
    };
    thead.querySelectorAll("th").forEach((th, idx) => {
      th.style.cursor = (idx === 0) ? "default" : "pointer";
      th.onclick = () => {
        if (idx === 0) return;
        state.asc = state.col === idx ? !state.asc : true;
        state.col = idx;
        const rows = Array.from(tbody.querySelectorAll("tr"));
        rows.sort((ra, rb) => {
          const a = ra.children[idx]?.getAttribute("data-sort") ?? "";
          const b = rb.children[idx]?.getAttribute("data-sort") ?? "";
          const na = Number(a), nb = Number(b);
          const bothNum = !isNaN(na) && !isNaN(nb);
          const cmp = bothNum ? (na - nb) : a.localeCompare(b);
          return state.asc ? cmp : -cmp;
        });
        rows.forEach(r => tbody.appendChild(r));
        applyIndicators();
      };
    });
    applyIndicators();
  }

  // === Filter UI (dual selects + Clear chip) ==========================
  const UI = {
    ci:      { container: '#tab-ci  .table-header-controls',      oldSelectId: 'ci-filter',      countId: 'ci-count',      tableId: 'ci-table',      store: 'pu.f.ci'      },
    safety:  { container: '#tab-safety .table-header-controls',    oldSelectId: 'safety-filter',  countId: 'safety-count',  tableId: 'safety-table',  store: 'pu.f.safety'  },
    quality: { container: '#tab-quality .table-header-controls',   oldSelectId: 'quality-filter', countId: 'quality-count', tableId: 'quality-table', store: 'pu.f.quality' }
  };

  function getAccent() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--pu-clear-accent').trim();
    return v || '#60a5fa'; // sky-400 default
  }

  // helper: short label (full shown in title)
  function truncateLabel(s, max = 80) {
    const t = String(s || '').trim().replace(/\s+/g, ' ');
    return t.length > max ? (t.slice(0, max - 1) + '…') : t;
  }

  function installDualFilters(kind) {
    const cfg = UI[kind];
    const box = document.querySelector(cfg.container);
    if (!box) return;

    // Clean any prior instances (prevents duplicates)
    box.querySelectorAll('.pu-filter-wrap').forEach(el => el.remove());

    // Legacy <select> present? remove it.
    const legacy = document.getElementById(cfg.oldSelectId);
    if (legacy) legacy.remove();

    // Group wrapper with accented frame
    const wrap = document.createElement('div');
    wrap.className = 'pu-filter-wrap';
    wrap.style.cssText = [
      'display:flex','gap:8px','align-items:center',
      'border:1px solid rgba(16,185,129,.35)','border-radius:10px',
      'padding:6px 8px','background:rgba(16,185,129,.04)'
    ].join(';');

    // Column select
    const colSel = document.createElement('select');
    colSel.id = `${kind}-filter-col`;
    colSel.style.cssText = [
      'padding:6px 10px','background:#213331','color:#e5e7eb',
      'border:1px solid #2a354b','border-radius:8px',
      'min-width:150px','max-width:240px'
    ].join(';');
    colSel.innerHTML = `<option value="__ALL__">Filter by…</option>`;

    // Value select (clamped width + ellipsis)
    const valSel = document.createElement('select');
    valSel.id = `${kind}-filter-val`;
    valSel.style.cssText = [
      'padding:6px 10px','background:#213331','color:#e5e7eb',
      'border:1px solid #2a354b','border-radius:8px',
      'min-width:180px','width:clamp(220px, 35vw, 520px)','max-width:520px',
      'white-space:nowrap','overflow:hidden','text-overflow:ellipsis'
    ].join(';');
    valSel.disabled = true;
    valSel.innerHTML = `<option value="__ALL__">All</option>`;

    // Clear chip
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.id = `${kind}-filter-clear`;
    clearBtn.textContent = '× Clear';
    clearBtn.title = 'Clear filters';
    clearBtn.setAttribute('aria-label', 'Clear filters');
    clearBtn.style.cssText = [
      'padding:4px 10px','border-radius:999px','border:1px dashed #2a354b',
      'background:#0b1328','color:#9ca3af','font-size:12px','cursor:default',
      'opacity:.55','transition:all .15s ease'
    ].join(';');

    function setWrapActive(active){
      wrap.style.border = active
        ? `1.5px solid ${getAccent()}`
        : '1px solid rgba(16,185,129,.35)';
      wrap.style.boxShadow = active ? '0 0 0 3px rgba(16,185,129,.12)' : 'none';
    }
    function setClearActive(active) {
      if (active) {
        const c = getAccent();
        clearBtn.disabled = false;
        clearBtn.style.opacity = '1';
        clearBtn.style.cursor  = 'pointer';
        clearBtn.style.border  = `1.5px solid ${c}`;
        clearBtn.style.color   = c;
        clearBtn.style.background = 'rgba(96,165,250,.10)';
        clearBtn.style.boxShadow  = '0 0 0 3px rgba(96,165,250,.12)';
      } else {
        clearBtn.disabled = true;
        clearBtn.style.opacity = '.55';
        clearBtn.style.cursor  = 'default';
        clearBtn.style.border  = '1px dashed #2a354b';
        clearBtn.style.color   = '#9ca3af';
        clearBtn.style.background = '#0b1328';
        clearBtn.style.boxShadow  = 'none';
      }
    }

    wrap.append(colSel, valSel, clearBtn);
    box.prepend(wrap);

    // populate columns from table header (skip "View")
    const tableEl = document.getElementById(cfg.tableId);
    const headers = Array.from(tableEl?.querySelectorAll('thead th') || [])
      .map(th => (th.textContent || '').trim()).filter(Boolean).slice(1);
    headers.forEach(lbl => {
      const opt = document.createElement('option');
      opt.value = lbl; opt.textContent = `Filter by ${lbl}`;
      colSel.appendChild(opt);
    });

    // restore persisted state
    const SKEY = `${cfg.store}`;
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem(SKEY) || '{}'); } catch {}
    if (saved.col && headers.includes(saved.col)) {
      colSel.value = saved.col;
      valSel.disabled = false;
      populateValOptions(kind, colSel.value, valSel, tableEl, true);
      if (saved.val && Array.from(valSel.options).some(o => o.value === saved.val)) {
        valSel.value = saved.val;
      }
    }

    // initial apply
    applyDualFilter(kind, colSel, valSel, tableEl, cfg.countId);
    valSel.title = valSel.value === '__ALL__' ? '' : (valSel.selectedOptions[0]?.title || valSel.value);
    const active = (colSel.value !== '__ALL__' && valSel.value !== '__ALL__');
    setWrapActive(active);
    setClearActive(active);

    // events
    function persist(){
      try {
        sessionStorage.setItem(SKEY, JSON.stringify({ col: colSel.value, val: valSel.value }));
      } catch {}
    }

    colSel.addEventListener('change', () => {
      if (colSel.value === '__ALL__') {
        valSel.innerHTML = `<option value="__ALL__">All</option>`;
        valSel.disabled = true;
      } else {
        populateValOptions(kind, colSel.value, valSel, tableEl, true);
        valSel.disabled = false;
      }
      persist();
      applyDualFilter(kind, colSel, valSel, tableEl, cfg.countId);
      valSel.title = valSel.value === '__ALL__' ? '' : (valSel.selectedOptions[0]?.title || valSel.value);
      const on = (colSel.value !== '__ALL__' && valSel.value !== '__ALL__');
      setWrapActive(on); setClearActive(on);
    });

    valSel.addEventListener('change', () => {
      persist();
      applyDualFilter(kind, colSel, valSel, tableEl, cfg.countId);
      valSel.title = valSel.value === '__ALL__' ? '' : (valSel.selectedOptions[0]?.title || valSel.value);
      const on = (colSel.value !== '__ALL__' && valSel.value !== '__ALL__');
      setWrapActive(on); setClearActive(on);
    });

    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (clearBtn.disabled) return;
      colSel.value = '__ALL__';
      valSel.innerHTML = `<option value="__ALL__">All</option>`;
      valSel.disabled = true;
      persist();
      applyDualFilter(kind, colSel, valSel, tableEl, cfg.countId);
      valSel.title = '';
      setWrapActive(false); setClearActive(false);
    });
  }

  function populateValOptions(kind, friendlyLabel, valSel, tableEl, fromAllRows = true) {
    const idx = findHeaderIndexByText(tableEl, friendlyLabel); // absolute index incl. View
    const tbody = tableEl.querySelector('tbody');
    const set = new Map(); // norm -> display
    const add = (s) => {
      const disp = (s == null || String(s).trim()==='') ? '-' : String(s).trim();
      const norm = disp.toLowerCase();
      if (!set.has(norm)) set.set(norm, disp);
    };

    if (fromAllRows && tbody && tbody._data && Array.isArray(tbody._data.rows)) {
      const colIdx = (tbody._data.friendly || []).indexOf(friendlyLabel);
      if (colIdx >= 0) {
        const key = tbody._data.cols[colIdx];
        tbody._data.rows.forEach(r => add( stripTags(format(key, r[key])) ));
      }
    } else {
      Array.from(tbody?.rows || []).forEach(tr => {
        const td = tr.children[idx];
        if (!td) return;
        add(td.textContent || '');
      });
    }

    const items = Array.from(set.values()).sort((a,b) => a.localeCompare(b));

    // Build options programmatically so we can keep full value but truncate label
    valSel.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = '__ALL__'; optAll.text = 'All';
    valSel.appendChild(optAll);

    items.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;                 // full string (used for exact match)
      opt.text  = truncateLabel(v);  // short label
      opt.title = v;                 // tooltip shows full text
      valSel.appendChild(opt);
    });
  }

  function stripTags(html){
    const d = document.createElement('div');
    d.innerHTML = String(html || '');
    return d.textContent || d.innerText || '';
  }

  // Apply the filter to rows
  function applyDualFilter(kind, colSel, valSel, tableEl, countId) {
    const tbody = tableEl.querySelector('tbody');
    if (!tbody) return;
    const colLabel = colSel.value;
    const val = (valSel.value || '__ALL__');
    const idx = (colLabel && colLabel !== '__ALL__') ? findHeaderIndexByText(tableEl, colLabel) : -1;

    Array.from(tbody.rows).forEach(tr => {
      let ok = true;
      if (idx > 0 && val !== '__ALL__') {
        const cellTxt = (tr.children[idx]?.textContent || '').trim().toLowerCase();
        ok = (cellTxt === String(val).trim().toLowerCase());
      }
      tr.style.display = ok ? '' : 'none';
    });

    updateCount(countId, tableEl);
  }

  // === Utilities shared by filters ===
  function findHeaderIndexByText(tableEl, friendlyHeader) {
    const ths = tableEl?.querySelectorAll('thead th');
    if (!ths) return -1;
    const needle = String(friendlyHeader || "").toLowerCase().trim();
    for (let i = 0; i < ths.length; i++) {
      const txt = (ths[i].textContent || "").toLowerCase().trim();
      if (txt === needle) return i;
    }
    return -1;
  }
  function updateCount(countId, tableEl) {
    const tbody = tableEl?.querySelector('tbody');
    if (!tbody) return;
    const visible = Array.from(tbody.rows)
      .filter(tr => tr.style.display !== 'none' && tr.children.length > 1).length;
    const el = document.getElementById(countId);
    if (el) el.textContent = `${visible} submission${visible === 1 ? "" : "s"}`;
  }

  // === Main hydrate ===
  ns.tables = ns.tables || {};
  ns.tables.hydrateDashboardTables = async function () {
    const target = await (async () => {
      const me = ns.session.get() || {};
      const isAdmin = !!(ns.auth && ns.auth.isAdmin && ns.auth.isAdmin());
      if (!isAdmin) return { id: String(me.employeeId||'').trim(), name: String(me.displayName||'').trim() };
      try {
        const sel = (sessionStorage.getItem('pu.adminEmployeeFilter') || '').trim();
        if (!sel || sel === '__ALL__') return null;
        const em = await ns.api.getRowsByTitle(ns.api.SHEETS.EMPLOYEE_MASTER);
        const norm = (s) => String(s||'').trim().toLowerCase();
        const row = em.find(r => norm(r['Display Name']||r['Employee Name']||r['Name']) === norm(sel));
        if (!row) return { id: '', name: sel };
        const id = String(row['Position ID'] || row['Employee ID'] || '').trim();
        return { id, name: sel };
      } catch { return null; }
    })();
    const isAdmin = !!(ns.auth && ns.auth.isAdmin && ns.auth.isAdmin());

    const [ciSheet, safetySheet, qualitySheet] = await Promise.all([
      fetchSheet(SHEETS.CI),
      fetchSheet(SHEETS.SAFETY),
      fetchSheet(SHEETS.QUALITY)
    ]);
    const ciRowsAll      = rowsByTitle(ciSheet);
    const safetyRowsAll  = rowsByTitle(safetySheet);
    const qualityRowsAll = rowsByTitle(qualitySheet);

    const matchesEmployee = (row, targetEmp) => {
      if (!targetEmp || (!targetEmp.id && !targetEmp.name)) return true;
      const norm = (s) => String(s||'').trim().toLowerCase();
      const rid  = norm(row['Employee ID']);
      const rpid = norm(row['Position ID']);
      const rname= norm(row['Submitted By'] || row['Employee Name'] || row['Name']);
      const idLC = norm(targetEmp.id);
      const nameLC = norm(targetEmp.name);
      return (idLC && (rid === idLC || rpid === idLC)) || (nameLC && rname === nameLC);
    };

    const ciRows      = ciRowsAll.filter(r => matchesEmployee(r, target));
    const safetyRows  = safetyRowsAll.filter(r => matchesEmployee(r, target));
    // Everyone can see all Quality; Admin employee filter applies when selected
    const qualityRows = (isAdmin && target)
      ? qualityRowsAll.filter(r => matchesEmployee(r, target))
      : qualityRowsAll;

    let empNameById;
    if (isAdmin) {
      empNameById = new Map();
      try {
        const em = await ns.api.getRowsByTitle(ns.api.SHEETS.EMPLOYEE_MASTER);
        em.forEach(r => {
          const id = String(r['Position ID'] || r['Employee ID'] || '').trim();
          const nm = String(r['Display Name'] || r['Employee Name'] || r['Name'] || '').trim();
          if (id) empNameById.set(id.toLowerCase(), nm);
        });
      } catch {}
    }

    function withAdminEmployeeCol(mapObj) {
      if (!isAdmin) return mapObj;
      const friendly = Object.values(mapObj).map(v => String(v).toLowerCase());
      if (friendly.includes('submitted by') || friendly.includes('employee') || friendly.includes('name')) return mapObj;
      return Object.assign({ "__EMP_NAME__": "Employee" }, mapObj);
    }
    const ciMapWithEmp     = withAdminEmployeeCol(Object.assign({}, COL_MAP.ci));
    const safetyMapWithEmp = withAdminEmployeeCol(Object.assign({}, COL_MAP.safety));
    const qualityMap       = Object.assign({}, COL_MAP.quality);

    renderTable(document.querySelector('[data-hook="table.ci.tbody"]'),      ciRows,      ciMapWithEmp,     "ci-table",     empNameById);
    renderTable(document.querySelector('[data-hook="table.safety.tbody"]'),  safetyRows,  safetyMapWithEmp, "safety-table", empNameById);
    renderTable(document.querySelector('[data-hook="table.quality.tbody"]'), qualityRows, qualityMap,       "quality-table",empNameById);

    const setCount = (id, n) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${n} submission${n === 1 ? "" : "s"}`;
    };
    setCount("ci-count", ciRows.length);
    setCount("safety-count", safetyRows.length);
    setCount("quality-count", qualityRows.length);

    // Install dual filters + clear chip for each table
    installDualFilters('ci');
    installDualFilters('safety');
    installDualFilters('quality');

    document.dispatchEvent(new Event('data-hydrated'));
  };

  // Back-compat (no-op): callers may still invoke this symbol
  ns.tables.applyFilterFor = () => {};

  document.addEventListener('powerup-admin-filter-change', () => {
    ns.tables.hydrateDashboardTables().catch(console.error);
  });

})(window.PowerUp);
