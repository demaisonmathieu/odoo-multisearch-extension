// Injected on demand (icon click / keyboard shortcut) into the ISOLATED world of the active tab.
// Toggles a centered command-palette-style overlay, similar to Odoo's own Ctrl+K search.
// All Odoo RPC/action calls go through the background service worker, which runs the actual
// bridge.js calls in the page's MAIN world (see background.js).
(function () {
  const HOST_ID = "oms-overlay-host";

  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const STYLE = `
    :host { all: initial; }
    .oms-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 17, 21, 0.55);
      z-index: 2147483647;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding-top: 12vh;
      font: 13px/1.4 -apple-system, "Segoe UI", Roboto, sans-serif;
      --bg: #ffffff;
      --fg: #1f2430;
      --muted: #6b7280;
      --border: #d7dbe0;
      --accent: #714b67;
      --accent-fg: #ffffff;
      --danger: #b3261e;
      --hover: #f2eef1;
    }
    @media (prefers-color-scheme: dark) {
      .oms-backdrop {
        --bg: #1b1d22;
        --fg: #e8e8ec;
        --muted: #9aa0aa;
        --border: #34373f;
        --accent: #b48fbd;
        --accent-fg: #1b1d22;
        --hover: #2a2d34;
      }
    }
    * { box-sizing: border-box; }
    .oms-modal {
      width: min(640px, 92vw);
      max-height: 72vh;
      background: var(--bg);
      color: var(--fg);
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .oms-view.hidden { display: none; }
    .oms-search-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
    }
    .oms-search-row input[type="text"] {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      color: var(--fg);
      font-size: 16px;
    }
    .oms-icon-btn {
      border: none;
      background: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 16px;
      padding: 4px 6px;
      border-radius: 6px;
    }
    .oms-icon-btn:hover { background: var(--hover); color: var(--fg); }
    .oms-view-toggle {
      display: flex;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .oms-view-toggle button {
      border: none;
      background: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 11px;
      padding: 5px 8px;
      white-space: nowrap;
    }
    .oms-view-toggle button:first-child { border-right: 1px solid var(--border); }
    .oms-view-toggle button.active {
      background: var(--accent);
      color: var(--accent-fg);
    }
    .oms-advanced {
      padding: 0 14px;
      margin-top: 8px;
    }
    .oms-advanced-rows {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .oms-advanced-row {
      display: flex;
      gap: 5px;
    }
    .oms-advanced-row input,
    .oms-advanced-row select {
      border: 1px solid var(--border);
      border-radius: 6px;
      background: transparent;
      color: var(--fg);
      font-family: ui-monospace, monospace;
      font-size: 12px;
      padding: 5px 6px;
      min-width: 0;
    }
    .oms-adv-field { flex: 3; }
    .oms-adv-operator { flex: 1.4; }
    /* ".oms-advanced-row select" above has higher specificity (class+type) than a bare
       ".oms-adv-operator" would, so its "background: transparent" shorthand (which resets
       background-image to none too) was silently winning over an earlier attempt here — hence
       the fix appearing to do nothing. Qualifying with the parent class matches that specificity. */
    .oms-advanced-row .oms-adv-operator {
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      padding-right: 20px;
      background-color: var(--bg);
      background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%),
        linear-gradient(135deg, var(--muted) 50%, transparent 50%);
      background-position: calc(100% - 12px) center, calc(100% - 8px) center;
      background-size: 5px 5px, 5px 5px;
      background-repeat: no-repeat;
    }
    /* The dropdown's open option list is native OS chrome that CSS can't fully restyle, but
       Chromium does honor background/color set directly on <option>. */
    .oms-adv-operator option {
      background: var(--bg);
      color: var(--fg);
    }
    .oms-adv-value { flex: 3; }
    .oms-adv-remove {
      border: none;
      background: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 15px;
      padding: 0 4px;
      flex-shrink: 0;
    }
    .oms-adv-remove:hover { color: var(--danger); }
    .oms-advanced-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 6px;
    }
    .oms-advanced-add-row {
      border: 1px dashed var(--border);
      background: none;
      color: var(--muted);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 11.5px;
      cursor: pointer;
    }
    .oms-advanced-add-row:hover { color: var(--fg); border-color: var(--fg); }
    .oms-advanced-hint {
      color: var(--muted);
      font-size: 10.5px;
      margin-top: 6px;
    }
    #oms-advanced-search-btn {
      margin-top: 6px;
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .oms-models {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px 14px 0;
    }
    .oms-pill {
      display: flex;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }
    .oms-pill.checked {
      background: var(--accent);
      color: var(--accent-fg);
      border-color: var(--accent);
    }
    .oms-status {
      padding: 8px 14px 0;
      color: var(--muted);
      font-size: 12px;
    }
    .oms-status.error { color: var(--danger); }
    .oms-status.ok { color: #2e7d32; }
    .oms-results {
      overflow-y: auto;
      padding: 8px 14px 4px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .oms-result-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 7px 10px;
    }
    .oms-result-row.zero { opacity: 0.5; }
    .oms-result-model { font-family: ui-monospace, monospace; font-size: 12px; }
    .oms-result-count { color: var(--muted); font-size: 12px; margin-left: 8px; }
    .oms-result-error { color: var(--danger); font-size: 11px; }
    .oms-result-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }
    .oms-result-open {
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    .oms-result-open.secondary {
      background: none;
      color: var(--accent);
      border: 1px solid var(--accent);
    }
    .oms-hint {
      padding: 8px 14px 12px;
      color: var(--muted);
      font-size: 11px;
    }
    .oms-model-picker-hint {
      padding: 6px 14px 0;
      color: var(--muted);
      font-size: 10.5px;
    }
    .oms-model-picker {
      overflow-y: auto;
      max-height: 40vh;
      padding: 8px 14px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .oms-model-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 6px;
      border-radius: 6px;
    }
    .oms-model-row:hover { background: var(--hover); }
    .oms-model-present {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 12.5px;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .oms-model-picker .oms-model-name { color: var(--muted); font-size: 11px; }
    .oms-model-picker .oms-badge {
      border: 1px solid var(--accent);
      color: var(--accent);
      border-radius: 999px;
      padding: 1px 8px;
      font-size: 10px;
      white-space: nowrap;
    }
    .oms-model-checked-default {
      display: flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      font-size: 10.5px;
      color: var(--muted);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .oms-model-checked-default input:disabled { cursor: not-allowed; }
    .oms-editor-actions {
      display: flex;
      gap: 8px;
      padding: 10px 14px 14px;
      border-top: 1px solid var(--border);
    }
    .oms-editor-actions button {
      border-radius: 6px;
      padding: 7px 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border);
      background: none;
      color: var(--fg);
    }
    .oms-editor-actions button:not(.secondary) {
      background: var(--accent);
      color: var(--accent-fg);
      border: none;
    }
  `;

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${STYLE}</style>
    <div class="oms-backdrop" id="oms-backdrop">
      <div class="oms-modal" id="oms-modal">
        <div class="oms-view" data-view="search">
          <div class="oms-search-row">
            <input type="text" id="oms-terms" placeholder="Rechercher… (Entrée pour lancer, virgule = OR, vide = tout afficher)" autocomplete="off" />
            <button type="button" class="oms-icon-btn" id="oms-advanced-btn" title="Critères avancés (domaine)">🔧</button>
            <div class="oms-view-toggle" id="oms-view-toggle" title="Vue par défaut pour plusieurs résultats">
              <button type="button" data-view-mode="list">☰ Liste</button>
              <button type="button" data-view-mode="kanban">▦ Kanban</button>
            </div>
            <button type="button" class="oms-icon-btn" id="oms-settings-btn" title="Modèles par défaut">⚙</button>
          </div>
          <div class="oms-advanced hidden" id="oms-advanced">
            <div class="oms-advanced-rows" id="oms-advanced-rows"></div>
            <div class="oms-advanced-toolbar">
              <button type="button" class="oms-advanced-add-row" id="oms-advanced-add-row">+ Ajouter un critère</button>
              <div class="oms-view-toggle" id="oms-advanced-combinator" title="Comment combiner les critères entre eux">
                <button type="button" data-combinator="and">ET</button>
                <button type="button" data-combinator="or">OU</button>
              </div>
            </div>
            <div class="oms-advanced-hint" id="oms-advanced-hint">
              Critères combinés en ET entre eux et avec le terme de recherche ci-dessus (facultatif si un critère est saisi ici).
            </div>
            <button type="button" id="oms-advanced-search-btn">Rechercher</button>
          </div>
          <div class="oms-models" id="oms-models"></div>
          <div class="oms-status" id="oms-status">Connexion à Odoo…</div>
          <div class="oms-results" id="oms-results"></div>
          <div class="oms-hint">Échap pour fermer</div>
        </div>
        <div class="oms-view hidden" data-view="settings">
          <div class="oms-search-row">
            <button type="button" class="oms-icon-btn" id="oms-back-btn" title="Retour">←</button>
            <input type="text" id="oms-model-filter" placeholder="Filtrer les modèles (ex: partner, invoice…)" autocomplete="off" />
          </div>
          <div class="oms-model-picker-hint" id="oms-model-picker-hint"></div>
          <div class="oms-model-picker" id="oms-model-picker">Chargement des modèles…</div>
          <div class="oms-editor-actions">
            <button type="button" id="oms-save-defaults">Enregistrer par défaut</button>
            <button type="button" class="secondary" id="oms-reset-defaults">Réinitialiser</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // --- element refs ---
  const backdrop = shadow.getElementById("oms-backdrop");
  const modal = shadow.getElementById("oms-modal");
  const searchView = shadow.querySelector('.oms-view[data-view="search"]');
  const settingsView = shadow.querySelector('.oms-view[data-view="settings"]');
  const termsInput = shadow.getElementById("oms-terms");
  const modelsEl = shadow.getElementById("oms-models");
  const statusEl = shadow.getElementById("oms-status");
  const resultsEl = shadow.getElementById("oms-results");
  const advancedBtn = shadow.getElementById("oms-advanced-btn");
  const advancedPanel = shadow.getElementById("oms-advanced");
  const advancedRowsEl = shadow.getElementById("oms-advanced-rows");
  const advancedAddRowBtn = shadow.getElementById("oms-advanced-add-row");
  const advancedCombinatorEl = shadow.getElementById("oms-advanced-combinator");
  const advancedHintEl = shadow.getElementById("oms-advanced-hint");
  const advancedSearchBtn = shadow.getElementById("oms-advanced-search-btn");
  const viewToggleEl = shadow.getElementById("oms-view-toggle");
  const settingsBtn = shadow.getElementById("oms-settings-btn");
  const backBtn = shadow.getElementById("oms-back-btn");
  const modelFilterInput = shadow.getElementById("oms-model-filter");
  const modelPickerHintEl = shadow.getElementById("oms-model-picker-hint");
  const modelPickerEl = shadow.getElementById("oms-model-picker");
  const saveDefaultsBtn = shadow.getElementById("oms-save-defaults");
  const resetDefaultsBtn = shadow.getElementById("oms-reset-defaults");

  let modelsConfig = {}; // { [model]: checkedByDefault } — the user's persisted configuration
  let currentModels = []; // models present in modelsConfig, used for the quick search pills
  let selectedModels = new Set(); // this session's active pill selection (starts from modelsConfig's checked ones)
  let defaultModels = new Set(); // built-in suggested defaults, independent of what's currently present
  let allModelsCache = null; // [{model, name}] fetched lazily
  let checkedInPicker = new Set(); // settings view: which models are present in the list
  let checkedByDefaultInPicker = new Set(); // settings view: which of those start checked
  let viewMode = "list"; // default view for a multi-record result: "list" or "kanban"
  let advancedCombinator = "and"; // how the advanced criteria rows combine with each other

  function close() {
    host.remove();
  }

  function buildOrDomain(field, terms) {
    const clean = terms.map((t) => t.trim()).filter(Boolean);
    if (!clean.length) {
      return [];
    }
    const leaves = clean.map((t) => [field, "ilike", t]);
    const operators = Array(Math.max(leaves.length - 1, 0)).fill("|");
    return operators.concat(leaves);
  }

  function parseValue(raw) {
    if (/^'(.*)'$/.test(raw) || /^"(.*)"$/.test(raw)) {
      return raw.slice(1, -1);
    }
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      return Number(raw);
    }
    if (/^true$/i.test(raw)) {
      return true;
    }
    if (/^false$/i.test(raw)) {
      return false;
    }
    return raw;
  }

  const ADVANCED_OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "like", "ilike", "not like", "not ilike"];

  function makeOperatorSelect() {
    const select = document.createElement("select");
    select.className = "oms-adv-operator";
    for (const op of ADVANCED_OPERATORS) {
      const option = document.createElement("option");
      option.value = op;
      option.textContent = op;
      select.appendChild(option);
    }
    return select;
  }

  // Each row is one Odoo domain leaf: [field, operator, value]. Dotted field paths (e.g.
  // "partner_id.name") are passed through as-is; Odoo resolves related-field traversal
  // server-side. Splitting field/operator/value into separate inputs avoids the ambiguity of
  // parsing a free-text "field operator value" line (e.g. operator characters inside a value).
  function addAdvancedRow(initial) {
    const row = document.createElement("div");
    row.className = "oms-advanced-row";

    const fieldInput = document.createElement("input");
    fieldInput.type = "text";
    fieldInput.className = "oms-adv-field";
    fieldInput.placeholder = "champ (ex: partner_id.name)";
    fieldInput.value = (initial && initial.field) || "";

    const operatorSelect = makeOperatorSelect();
    operatorSelect.value = (initial && initial.operator) || "=";

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = "oms-adv-value";
    valueInput.placeholder = "valeur";
    valueInput.value = (initial && initial.value) || "";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "oms-adv-remove";
    removeBtn.title = "Supprimer ce critère";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => row.remove());

    for (const input of [fieldInput, valueInput]) {
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          runSearch();
        }
      });
    }

    row.appendChild(fieldInput);
    row.appendChild(operatorSelect);
    row.appendChild(valueInput);
    row.appendChild(removeBtn);
    advancedRowsEl.appendChild(row);
    return row;
  }

  function renderAdvancedCombinator() {
    for (const btn of advancedCombinatorEl.querySelectorAll("button")) {
      btn.classList.toggle("active", btn.dataset.combinator === advancedCombinator);
    }
    if (advancedHintEl) {
      advancedHintEl.textContent =
        advancedCombinator === "or"
          ? "Au moins un des critères ci-dessus doit correspondre (OU), combiné en ET avec le terme de recherche ci-dessus (facultatif si un critère est saisi ici)."
          : "Tous les critères ci-dessus doivent correspondre (ET), combinés aussi en ET avec le terme de recherche ci-dessus (facultatif si un critère est saisi ici).";
    }
  }

  // Rows combine with each other per `advancedCombinator` ("and": implicit, no prefix needed for
  // a flat list — or "or": prefix with enough "|" operators). Empty rows (no field entered) are
  // silently skipped rather than erroring.
  function buildAdvancedDomain() {
    const leaves = [];
    for (const row of advancedRowsEl.querySelectorAll(".oms-advanced-row")) {
      const field = row.querySelector(".oms-adv-field").value.trim();
      if (!field) {
        continue;
      }
      const operator = row.querySelector(".oms-adv-operator").value;
      const rawValue = row.querySelector(".oms-adv-value").value.trim();
      leaves.push([field, operator, parseValue(rawValue)]);
    }
    if (advancedCombinator === "or" && leaves.length > 1) {
      const operators = Array(leaves.length - 1).fill("|");
      return { domain: operators.concat(leaves) };
    }
    return { domain: leaves };
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "oms-status" + (kind ? ` ${kind}` : "");
  }

  function send(message) {
    return chrome.runtime.sendMessage(message);
  }

  function renderModelPills() {
    modelsEl.innerHTML = "";
    for (const model of currentModels) {
      const pill = document.createElement("div");
      pill.className = "oms-pill" + (selectedModels.has(model) ? " checked" : "");
      pill.textContent = model;
      pill.addEventListener("click", () => {
        if (selectedModels.has(model)) {
          selectedModels.delete(model);
        } else {
          selectedModels.add(model);
        }
        renderModelPills();
      });
      modelsEl.appendChild(pill);
    }
  }

  function renderViewToggle() {
    for (const btn of viewToggleEl.querySelectorAll("button")) {
      btn.classList.toggle("active", btn.dataset.viewMode === viewMode);
    }
  }

  function renderResults(results) {
    resultsEl.innerHTML = "";
    for (const r of results) {
      const row = document.createElement("div");
      row.className = "oms-result-row" + (r.count === 0 && !r.error ? " zero" : "");

      const left = document.createElement("div");
      const modelSpan = document.createElement("span");
      modelSpan.className = "oms-result-model";
      modelSpan.textContent = r.model;
      left.appendChild(modelSpan);

      if (r.error) {
        const err = document.createElement("div");
        err.className = "oms-result-error";
        err.textContent = r.error;
        left.appendChild(err);
      } else {
        const count = document.createElement("span");
        count.className = "oms-result-count";
        count.textContent = `${r.count} résultat${r.count > 1 ? "s" : ""}`;
        left.appendChild(count);
      }
      row.appendChild(left);

      if (!r.error && r.count > 0) {
        const singleResult = r.count === 1 && r.firstId;
        const actions = document.createElement("div");
        actions.className = "oms-result-actions";

        const makeOpenButton = (label, payload, secondary) => {
          const btn = document.createElement("button");
          btn.className = "oms-result-open" + (secondary ? " secondary" : "");
          btn.textContent = label;
          btn.addEventListener("click", async () => {
            btn.disabled = true;
            const originalLabel = btn.textContent;
            btn.textContent = "…";
            const res = await send({ type: "oms:open", model: r.model, domain: r.domain, ...payload });
            if (res && res.error) {
              setStatus(res.error, "error");
              btn.disabled = false;
              btn.textContent = originalLabel;
            } else {
              close();
            }
          });
          return btn;
        };

        // A single result can still be opened via list/kanban (e.g. to keep the search view
        // open) in addition to jumping straight to its form.
        actions.appendChild(
          makeOpenButton(`Ouvrir (${viewMode === "kanban" ? "kanban" : "liste"})`, { viewType: viewMode })
        );
        if (singleResult) {
          actions.appendChild(makeOpenButton("Ouvrir la fiche", { resId: r.firstId }, true));
        }
        row.appendChild(actions);
      }

      resultsEl.appendChild(row);
    }
  }

  async function runSearch() {
    const terms = termsInput.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const advanced = buildAdvancedDomain();
    const orDomain = buildOrDomain("display_name", terms);
    // No terms and no advanced criteria at all is a deliberate "show everything" search (empty
    // domain), not an error — only the model selection below is actually required.
    const models = Array.from(selectedModels);
    if (!models.length) {
      setStatus("Sélectionnez au moins un modèle.", "error");
      return;
    }
    // Simple concatenation is enough: two complete domain expressions placed back to back in a
    // flat list are implicitly AND'ed together, same as Odoo's own expression.AND() convention.
    const domain = orDomain.concat(advanced.domain);
    setStatus("Recherche en cours…");
    resultsEl.innerHTML = "";
    const res = await send({ type: "oms:search", models, domain });
    if (res && res.error) {
      setStatus(res.error, "error");
      return;
    }
    setStatus(`${res.results.length} modèle(s) interrogé(s).`, "ok");
    renderResults(res.results);
  }

  function showSettingsView() {
    searchView.classList.add("hidden");
    settingsView.classList.remove("hidden");
    modelFilterInput.value = "";
    modelFilterInput.focus();
    loadModelPicker();
  }

  function showSearchView() {
    settingsView.classList.add("hidden");
    searchView.classList.remove("hidden");
    termsInput.focus();
  }

  // Shown by default (no filter typed) so the picker isn't a wall of ~500 technical models;
  // typing in the filter searches the full catalog (allModelsCache) regardless of this list.
  const COMMON_MODELS = new Set([
    "res.partner",
    "res.company",
    "res.users",
    "account.move",
    "account.move.line",
    "account.payment",
    "sale.order",
    "sale.order.line",
    "purchase.order",
    "purchase.order.line",
    "crm.lead",
    "project.project",
    "project.task",
    "product.template",
    "product.product",
    "stock.picking",
    "stock.move",
    "stock.warehouse",
    "hr.employee",
    "calendar.event",
    "mail.activity",
    "helpdesk.ticket",
  ]);

  function renderModelPicker(filterText) {
    if (!allModelsCache) {
      return;
    }
    const filter = (filterText || "").toLowerCase();
    // Without a filter, restrict to common models plus anything already in the user's list (so
    // a previously chosen uncommon model doesn't vanish); typing searches every installed model.
    const pool = filter
      ? allModelsCache
      : allModelsCache.filter((m) => COMMON_MODELS.has(m.model) || checkedInPicker.has(m.model));
    modelPickerHintEl.textContent = filter
      ? `Recherche parmi les ${allModelsCache.length} modèles installés.`
      : "Modèles courants — tapez pour chercher parmi tous les modèles installés.";
    const filtered = pool.filter(
      (m) => !filter || m.model.toLowerCase().includes(filter) || m.name.toLowerCase().includes(filter)
    );
    modelPickerEl.innerHTML = "";
    if (!filtered.length) {
      modelPickerEl.textContent = "Aucun modèle ne correspond.";
      return;
    }
    const frag = document.createDocumentFragment();
    for (const m of filtered.slice(0, 200)) {
      const row = document.createElement("div");
      row.className = "oms-model-row";

      const presentLabel = document.createElement("label");
      presentLabel.className = "oms-model-present";
      const presentCheckbox = document.createElement("input");
      presentCheckbox.type = "checkbox";
      presentCheckbox.title = "Présent dans ma liste";
      presentCheckbox.checked = checkedInPicker.has(m.model);
      presentLabel.appendChild(presentCheckbox);
      const text = document.createElement("span");
      text.textContent = m.name;
      presentLabel.appendChild(text);
      const modelName = document.createElement("span");
      modelName.className = "oms-model-name";
      modelName.textContent = `(${m.model})`;
      presentLabel.appendChild(modelName);
      if (defaultModels.has(m.model)) {
        const badge = document.createElement("span");
        badge.className = "oms-badge";
        badge.textContent = "défaut";
        presentLabel.appendChild(badge);
      }
      row.appendChild(presentLabel);

      const defaultLabel = document.createElement("label");
      defaultLabel.className = "oms-model-checked-default";
      const defaultCheckbox = document.createElement("input");
      defaultCheckbox.type = "checkbox";
      defaultCheckbox.checked = checkedByDefaultInPicker.has(m.model);
      defaultCheckbox.disabled = !presentCheckbox.checked;
      defaultLabel.title = "Coché par défaut à l'ouverture de la palette";
      defaultLabel.appendChild(defaultCheckbox);
      defaultLabel.appendChild(document.createTextNode("coché par défaut"));
      row.appendChild(defaultLabel);

      presentCheckbox.addEventListener("change", () => {
        if (presentCheckbox.checked) {
          checkedInPicker.add(m.model);
        } else {
          checkedInPicker.delete(m.model);
          checkedByDefaultInPicker.delete(m.model);
          defaultCheckbox.checked = false;
        }
        defaultCheckbox.disabled = !presentCheckbox.checked;
      });
      defaultCheckbox.addEventListener("change", () => {
        if (defaultCheckbox.checked) {
          checkedByDefaultInPicker.add(m.model);
        } else {
          checkedByDefaultInPicker.delete(m.model);
        }
      });

      frag.appendChild(row);
    }
    modelPickerEl.appendChild(frag);
  }

  async function loadModelPicker() {
    checkedInPicker = new Set(currentModels);
    checkedByDefaultInPicker = new Set(currentModels.filter((m) => modelsConfig[m]));
    if (allModelsCache) {
      renderModelPicker(modelFilterInput.value);
      return;
    }
    modelPickerEl.textContent = "Chargement des modèles…";
    modelPickerHintEl.textContent = "";
    const res = await send({ type: "oms:listAllModels" });
    if (res && res.error) {
      modelPickerEl.textContent = "Erreur: " + res.error;
      return;
    }
    allModelsCache = res.models || [];
    renderModelPicker(modelFilterInput.value);
  }

  async function init() {
    const stored = await send({ type: "oms:getModels" });
    modelsConfig = stored.modelsConfig || {};
    currentModels = Object.keys(modelsConfig);
    selectedModels = new Set(currentModels.filter((m) => modelsConfig[m]));
    defaultModels = new Set(stored.defaults);
    viewMode = stored.viewMode || "list";
    renderModelPills();
    renderViewToggle();

    const bridgeRes = await send({ type: "oms:ensureBridge" });
    if (!bridgeRes || !bridgeRes.ready) {
      setStatus("Cet onglet ne semble pas être une session Odoo connectée.", "error");
      return;
    }
    setStatus("Connecté à l'onglet Odoo actif.", "ok");
  }

  // --- events ---
  backdrop.addEventListener("mousedown", (ev) => {
    if (ev.target === backdrop) {
      close();
    }
  });
  modal.addEventListener("mousedown", (ev) => ev.stopPropagation());

  termsInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      runSearch();
    }
  });

  advancedAddRowBtn.addEventListener("click", () => {
    const row = addAdvancedRow();
    row.querySelector(".oms-adv-field").focus();
  });

  advancedCombinatorEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-combinator]");
    if (!btn) {
      return;
    }
    advancedCombinator = btn.dataset.combinator;
    renderAdvancedCombinator();
  });

  advancedSearchBtn.addEventListener("click", () => runSearch());

  advancedBtn.addEventListener("click", () => {
    advancedPanel.classList.toggle("hidden");
    if (!advancedPanel.classList.contains("hidden")) {
      if (!advancedRowsEl.querySelector(".oms-advanced-row")) {
        addAdvancedRow();
      }
      advancedRowsEl.querySelector(".oms-adv-field").focus();
    }
  });

  viewToggleEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-view-mode]");
    if (!btn) {
      return;
    }
    viewMode = btn.dataset.viewMode;
    renderViewToggle();
    send({ type: "oms:setViewMode", viewMode });
    // Refresh the "Ouvrir" labels on any results already shown, without re-searching.
    if (resultsEl.children.length) {
      for (const btn2 of resultsEl.querySelectorAll(".oms-result-open:not(:disabled)")) {
        if (btn2.textContent !== "Ouvrir la fiche") {
          btn2.textContent = `Ouvrir (${viewMode === "kanban" ? "kanban" : "liste"})`;
        }
      }
    }
  });

  settingsBtn.addEventListener("click", showSettingsView);
  backBtn.addEventListener("click", showSearchView);
  modelFilterInput.addEventListener("input", () => renderModelPicker(modelFilterInput.value));

  saveDefaultsBtn.addEventListener("click", async () => {
    const models = Array.from(checkedInPicker);
    if (!models.length) {
      return;
    }
    const newConfig = {};
    for (const m of models) {
      newConfig[m] = checkedByDefaultInPicker.has(m);
    }
    await send({ type: "oms:setModels", modelsConfig: newConfig });
    modelsConfig = newConfig;
    currentModels = models;
    selectedModels = new Set(models.filter((m) => newConfig[m]));
    renderModelPills();
    showSearchView();
  });

  resetDefaultsBtn.addEventListener("click", async () => {
    const stored = await send({ type: "oms:getModels" });
    checkedInPicker = new Set(stored.defaults);
    checkedByDefaultInPicker = new Set(stored.defaults); // built-in defaults all start checked
    renderModelPicker(modelFilterInput.value);
  });

  // Trap keyboard input so the underlying page (and its own shortcuts, e.g. Odoo's Ctrl+K)
  // doesn't react while the overlay is open. This must run in the BUBBLE phase: a capture-phase
  // listener on `host` would stop the event before it ever reaches our own inputs inside the
  // shadow tree (e.g. the Enter handler on the search field), breaking the whole palette. Bubble
  // phase lets our internal listeners fire first, then blocks the event only as it exits `host`
  // on its way further up into the page.
  host.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      close();
    }
    ev.stopPropagation();
  });
  host.addEventListener("keyup", (ev) => ev.stopPropagation());
  host.addEventListener("keypress", (ev) => ev.stopPropagation());

  renderAdvancedCombinator();
  termsInput.focus();
  init();
})();
