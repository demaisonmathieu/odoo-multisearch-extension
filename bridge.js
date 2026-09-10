// Injected in the page's MAIN world (same trick used by Odoo Terminal-style extensions).
(function () {
  // Always redefine (don't early-return if window.__oms already exists): this file is injected
  // fresh into the page's MAIN world on every palette open, and the page itself is never
  // reloaded by the extension, so a stale early-return would keep an old API version alive
  // indefinitely after the extension is updated.

  // Finding the webclient's OWL `env` (for env.services.orm/action/menu) has to work across
  // any Odoo version, not just the one this extension happened to be built against:
  // - odoo.__WOWL_DEBUG__.root.env is set unconditionally when the root component mounts (see
  //   addons/web/static/src/env.js), even outside debug mode — but that hook only exists from
  //   Odoo 17 onward.
  // - window.__OWL_DEVTOOLS__.apps (a Set of every mounted OWL App instance, each exposing
  //   `.env` directly) is set unconditionally by the OWL library itself — not Odoo-specific —
  //   and exists identically from Odoo 16 through the latest OWL 2.x. This is the fallback used
  //   whenever the Odoo-specific hook above isn't present, so the extension keeps working
  //   regardless of which Odoo version (or future one) it's pointed at.
  function getEnv() {
    const root = window.odoo && window.odoo.__WOWL_DEBUG__ && window.odoo.__WOWL_DEBUG__.root;
    if (root && root.env) {
      return root.env;
    }
    const apps = window.__OWL_DEVTOOLS__ && window.__OWL_DEVTOOLS__.apps;
    if (apps) {
      for (const app of apps) {
        if (app && app.env && app.env.services && app.env.services.orm && app.env.services.action) {
          return app.env;
        }
      }
    }
    return null;
  }

  // RPCError's own .message is a generic string ("Odoo Server Error"); the actual server-side
  // exception message (e.g. "Invalid field 'project_id.name' on model 'res.partner'") is in
  // .data.message (see addons/web/static/src/core/network/rpc.js: makeErrorFromResponse).
  function describeError(e) {
    return (e && e.data && e.data.message) || (e && e.message) || String(e);
  }

  // name_search()'s 2nd positional/kwarg name changed across Odoo versions: "domain" in v19+,
  // "args" in v18 and earlier. Rather than hardcode (and break) on one version, try "domain"
  // first and silently retry with "args" on failure — works unmodified on any Odoo version,
  // past or future, without needing to detect the server version client-side.
  async function nameSearchAnyVersion(env, model, term) {
    const base = { name: term || "", operator: "ilike", limit: 20 };
    try {
      return await env.services.orm.call(model, "name_search", [], { ...base, domain: [] });
    } catch (e) {
      return await env.services.orm.call(model, "name_search", [], { ...base, args: [] });
    }
  }

  function normalizeAlias(s) {
    return (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip accents (é -> e, â -> a...) for loose matching
      .toLowerCase()
      .trim();
  }

  // aliasMap entries are either a plain model string (legacy / no default domain) or
  // { model, domain } (set via the ⚙ settings' alias editor, `domain` being a default filter
  // always applied when that alias is used, e.g. "actifs" -> { model: "res.partner", domain:
  // [["active", "=", true]] }). This normalizes either shape to { model, domain }, or null if
  // `alias` doesn't match a user-defined entry at all.
  function getAliasEntry(alias, aliasMap) {
    if (!aliasMap) {
      return null;
    }
    const norm = normalizeAlias((alias || "").trim());
    const entry = aliasMap[norm];
    if (!entry) {
      return null;
    }
    if (typeof entry === "string") {
      return { model: entry, domain: [] };
    }
    return { model: entry.model, domain: Array.isArray(entry.domain) ? entry.domain : [] };
  }

  // Resolves a free-typed path segment like "projets" or "taches" to an actual model technical
  // name, purely from what's already visible in the UI (ir.model's own display name) — no
  // hardcoded French/English dictionary, so this works in whatever language Odoo is configured
  // for. Tries, in order: the segment as a literal technical name (power users), an exact
  // (accent/case-insensitive, naive-plural-stripped) match against the model's display name, then
  // a substring match, preferring the shortest/most-specific display name on ties.
  function resolveModelAlias(alias, allModels, aliasMap) {
    const raw = (alias || "").trim();
    if (!raw) {
      return null;
    }
    const norm = normalizeAlias(raw);
    // User-defined alias (e.g. "projet" -> "project.project", set in the ⚙ settings) always
    // wins over the fuzzy display-name guess below — it's an explicit, unambiguous mapping.
    const aliasEntry = getAliasEntry(raw, aliasMap);
    if (aliasEntry && allModels.some((m) => m.model === aliasEntry.model)) {
      return aliasEntry.model;
    }
    if (raw.includes(".") && allModels.some((m) => m.model === raw)) {
      return raw;
    }
    const normNoS = norm.endsWith("s") ? norm.slice(0, -1) : norm;
    let best = null;
    let bestScore = -1;
    let bestLength = Infinity;
    for (const m of allModels) {
      const mName = normalizeAlias(m.name);
      let score = 0;
      if (mName === norm || mName === normNoS) {
        score = 100;
      } else if (mName.startsWith(norm) || mName.startsWith(normNoS)) {
        score = 60;
      } else if (norm.length > 2 && mName.includes(norm)) {
        score = 40;
      } else if (normNoS.length > 2 && mName.includes(normNoS)) {
        score = 35;
      } else {
        continue;
      }
      if (score > bestScore || (score === bestScore && mName.length < bestLength)) {
        bestScore = score;
        bestLength = mName.length;
        best = m.model;
      }
    }
    return best;
  }

  // Finds the many2one field on `childModel` that points back to `parentModel` (e.g.
  // "project_id" on project.task relating to project.project) — the natural "this belongs to
  // that" relationship implied by a path like /projets/.../taches. Prefers a field literally
  // named "<parent's last technical segment>_id" when several candidates exist.
  async function findRelationField(childModel, parentModel) {
    const res = await window.__oms.getFields(childModel);
    if (res.error) {
      return { error: res.error };
    }
    const candidates = Object.entries(res.fields).filter(
      ([, meta]) => meta.type === "many2one" && meta.relation === parentModel
    );
    if (!candidates.length) {
      return { field: null };
    }
    const preferredName = parentModel.split(".").pop() + "_id";
    const preferred = candidates.find(([name]) => name === preferredName);
    return { field: (preferred || candidates[0])[0] };
  }

  // Cache lives on `window` itself (not inside window.__oms, which is fully redefined on every
  // palette open) so it survives across opens/closes for the lifetime of the tab, and only
  // resets on an actual page navigation/reload — avoiding a fields_get RPC per keystroke.
  window.__omsFieldsCache = window.__omsFieldsCache || {};
  // window.__omsModelsCache: the full ir.model list, fetched once per tab lifetime (used by the
  // model picker and by path-search's alias resolution below).
  // Caches many2one value lookups (real record names via name_search) keyed by "relation|term",
  // since retyping/re-focusing the same value often repeats the same query. Capped so it can't
  // grow unbounded over a long browsing session.
  window.__omsValueCache = window.__omsValueCache || new Map();
  const VALUE_CACHE_MAX = 300;

  window.__oms = {
    isReady() {
      const env = getEnv();
      return !!(env && env.services && env.services.orm && env.services.action);
    },

    // `domain` is a fully-formed Odoo domain (already combined client-side by the overlay,
    // e.g. free-text OR-terms AND'ed with advanced field criteria such as partner_id.name = 'test').
    async search(models, domain) {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      const results = [];
      for (const model of models) {
        try {
          const [count, ids] = await Promise.all([
            env.services.orm.searchCount(model, domain),
            env.services.orm.search(model, domain, { limit: 1 }),
          ]);
          results.push({ model, count, domain, firstId: ids[0] || null, error: null });
        } catch (e) {
          results.push({ model, count: 0, domain, firstId: null, error: describeError(e) });
        }
      }
      return { results };
    },

    // "/alias/nomprojet" (2 segments, 2nd one not purely numeric — see openByAlias for the
    // numeric-id case) -> an ilike search on display_name, scoped to that one resolved model.
    // Returns the same shape as search() above so the overlay can render it identically.
    // `extraDomain`, when given, is the overlay's advanced-criteria panel domain (built from the
    // field/operator/value rows, on whatever single model those were entered against) — AND'ed
    // in on top, so those criteria aren't silently ignored just because the search was triggered
    // via "/alias/term" instead of the plain multi-model search box.
    async aliasSearch(modelAlias, term, aliasMap, extraDomain) {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      try {
        const modelsRes = await this.listModels();
        if (modelsRes.error) {
          return modelsRes;
        }
        const model = resolveModelAlias(modelAlias, modelsRes.models, aliasMap);
        if (!model) {
          return { error: `Aucun modèle ne correspond à "${modelAlias}".` };
        }
        const aliasDomain = (getAliasEntry(modelAlias, aliasMap) || {}).domain || [];
        const domain = [["display_name", "ilike", term]].concat(aliasDomain).concat(extraDomain || []);
        return await this.search([model], domain);
      } catch (e) {
        return { error: describeError(e) };
      }
    },

    // "/alias/42/json" or "/alias/nomprojet/json" -> the record(s)' raw field values, as JSON.
    // "/alias/.../json/champ" narrows it to just that one field's bare value(s) (no wrapping
    // object) — a single value for the numeric-id form, an array of values for the term-search
    // form (since that can match several records). Binary fields are excluded from the
    // "all fields" dump (illegible base64 blobs) unless explicitly requested by name.
    // `operation`, when given, requires `fieldName` too (it's the 5th path segment, after the
    // field) and replaces the raw value(s) with a single aggregate: sum/avg/min/max (numeric —
    // non-numeric values are dropped rather than erroring) or count (number of matching records,
    // regardless of the field's content). Computed client-side over the actual fetched records
    // rather than via read_group, since read_group's result shape (e.g. the group-count key)
    // isn't stable across Odoo versions — see nameSearchAnyVersion above for the same rationale.
    // `extraDomain`: see aliasSearch above — same idea, applied to the term-search branch only
    // (a direct numeric-id lookup bypasses domain filtering entirely, same as openByAlias).
    async jsonDump(modelAlias, idOrTerm, fieldName, operation, aliasMap, extraDomain) {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      try {
        const modelsRes = await this.listModels();
        if (modelsRes.error) {
          return modelsRes;
        }
        const model = resolveModelAlias(modelAlias, modelsRes.models, aliasMap);
        if (!model) {
          return { error: `Aucun modèle ne correspond à "${modelAlias}".` };
        }
        const aliasDomain = (getAliasEntry(modelAlias, aliasMap) || {}).domain || [];

        const trimmed = (idOrTerm || "").trim();
        const isSingleId = /^\d+$/.test(trimmed);
        let ids;
        if (isSingleId) {
          ids = [Number(trimmed)];
        } else {
          const domain = [["display_name", "ilike", trimmed]].concat(aliasDomain).concat(extraDomain || []);
          // An aggregate should cover every match, not just the first page shown for browsing —
          // capped well above any reasonable dataset rather than left fully unbounded.
          ids = await env.services.orm.search(model, domain, { limit: operation ? 10000 : 50 });
          if (!ids.length) {
            if (operation) {
              return { json: operation === "count" ? 0 : null };
            }
            return { json: isSingleId ? null : [] };
          }
        }

        let fields;
        if (fieldName) {
          fields = [fieldName];
        } else {
          const fieldsRes = await this.getFields(model);
          if (fieldsRes.error) {
            return fieldsRes;
          }
          fields = Object.entries(fieldsRes.fields)
            .filter(([, meta]) => meta.type !== "binary")
            .map(([name]) => name);
        }

        const records = await env.services.orm.read(model, ids, fields);

        if (operation) {
          if (operation === "count") {
            return { json: records.length };
          }
          const values = records
            .map((r) => (Object.prototype.hasOwnProperty.call(r, fieldName) ? r[fieldName] : null))
            .filter((v) => typeof v === "number");
          if (!values.length) {
            return { json: null };
          }
          switch (operation) {
            case "sum":
              return { json: values.reduce((a, b) => a + b, 0) };
            case "avg":
              return { json: values.reduce((a, b) => a + b, 0) / values.length };
            case "min":
              return { json: Math.min(...values) };
            case "max":
              return { json: Math.max(...values) };
            default:
              return { error: `Opération inconnue : "${operation}" (attendu : sum, avg, min, max, count).` };
          }
        }

        if (fieldName) {
          const values = records.map((r) => (Object.prototype.hasOwnProperty.call(r, fieldName) ? r[fieldName] : null));
          return { json: isSingleId ? (values.length ? values[0] : null) : values };
        }
        return { json: isSingleId ? records[0] || null : records };
      } catch (e) {
        return { error: describeError(e) };
      }
    },

    async listModels() {
      if (window.__omsModelsCache) {
        return { models: window.__omsModelsCache };
      }
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      try {
        const records = await env.services.orm.searchRead("ir.model", [], ["model", "name"], {
          order: "model",
        });
        const models = records.map((r) => ({ model: r.model, name: r.name }));
        window.__omsModelsCache = models;
        return { models };
      } catch (e) {
        return { error: describeError(e) };
      }
    },

    // Resolves a path-search alias/model segment to a real technical model name, for the overlay
    // to then run its own client-side field-suggestion logic against (e.g. autocompleting the
    // "/champ" segment of "/alias/id/json/champ").
    async resolveAlias(alias, aliasMap) {
      const modelsRes = await this.listModels();
      if (modelsRes.error) {
        return modelsRes;
      }
      const model = resolveModelAlias(alias, modelsRes.models, aliasMap);
      return { model: model || null };
    },

    // Used to suggest field names (including relational ones, one hop at a time) while typing a
    // domain criterion's "champ" — only offered when a single model is selected, since fields
    // differ per model. Cached on window.__omsFieldsCache (see above) per model name.
    async getFields(model) {
      if (window.__omsFieldsCache[model]) {
        return { fields: window.__omsFieldsCache[model] };
      }
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      try {
        const fields = await env.services.orm.call(model, "fields_get", [], {
          attributes: ["string", "type", "relation", "selection"],
        });
        window.__omsFieldsCache[model] = fields;
        return { fields };
      } catch (e) {
        return { error: describeError(e) };
      }
    },

    // Suggests plausible values for the "valeur" input, based on what kind of field `fieldPath`
    // resolves to on `model` (reuses the same dotted-path traversal as getFields, and its cache):
    // - selection fields: their fixed (key, label) options.
    // - boolean fields: true/false.
    // - relational fields (many2one and friends): real record names via name_search, filtered by
    //   `term` server-side — cached per (relation, term) since the same prefix is often retyped.
    // Anything else (char, text, integer, date...) has no well-defined value set, so no suggestions.
    async getFieldValues(model, fieldPath, term) {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      const segments = (fieldPath || "").split(".").filter(Boolean);
      if (!segments.length) {
        return { values: [] };
      }
      let currentModel = model;
      let fieldMeta = null;
      for (let i = 0; i < segments.length; i++) {
        const res = await this.getFields(currentModel);
        if (res.error) {
          return res;
        }
        const meta = res.fields[segments[i]];
        if (!meta) {
          return { values: [] };
        }
        if (i === segments.length - 1) {
          fieldMeta = meta;
        } else {
          if (!meta.relation) {
            return { values: [] };
          }
          currentModel = meta.relation;
        }
      }

      if (fieldMeta.type === "selection" && Array.isArray(fieldMeta.selection)) {
        const t = (term || "").toLowerCase();
        const values = fieldMeta.selection
          .filter(([key, label]) => !t || String(key).toLowerCase().includes(t) || String(label).toLowerCase().includes(t))
          .slice(0, 50)
          .map(([key, label]) => ({ value: String(key), label: `${key} — ${label}` }));
        return { values };
      }

      if (fieldMeta.type === "boolean") {
        return {
          values: [
            { value: "true", label: "true" },
            { value: "false", label: "false" },
          ],
        };
      }

      if (fieldMeta.relation) {
        const cacheKey = `${fieldMeta.relation}|${term || ""}`;
        if (window.__omsValueCache.has(cacheKey)) {
          return { values: window.__omsValueCache.get(cacheKey) };
        }
        try {
          const matches = await nameSearchAnyVersion(env, fieldMeta.relation, term);
          const values = matches.map(([, name]) => ({ value: name, label: name }));
          if (window.__omsValueCache.size >= VALUE_CACHE_MAX) {
            window.__omsValueCache.delete(window.__omsValueCache.keys().next().value);
          }
          window.__omsValueCache.set(cacheKey, values);
          return { values };
        } catch (e) {
          return { error: describeError(e) };
        }
      }

      return { values: [] };
    },

    // Mirrors Odoo's own Ctrl+K "/" command (addons/web/static/src/webclient/menus/menu_providers.js):
    // env.services.menu already holds the full menu tree client-side (loaded once at webclient
    // start), no RPC needed. Builds a parent map ourselves since menusData only has children.
    searchMenus(term) {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      try {
        const all = env.services.menu.getAll();
        const parentOf = new Map();
        const byId = new Map(all.map((m) => [m.id, m]));
        for (const m of all) {
          for (const childId of m.children || []) {
            parentOf.set(childId, m.id);
          }
        }
        function pathOf(menu) {
          const parts = [menu.name];
          let pid = parentOf.get(menu.id);
          while (pid) {
            const p = byId.get(pid);
            if (!p || !p.name) {
              break;
            }
            parts.unshift(p.name);
            pid = parentOf.get(pid);
          }
          return parts.join(" / ");
        }
        const t = (term || "").trim().toLowerCase();
        const menus = all
          .filter((m) => m && m.actionID && m.name)
          .map((m) => ({ id: m.id, path: pathOf(m) }))
          .filter((m) => !t || m.path.toLowerCase().includes(t))
          .sort((a, b) => a.path.localeCompare(b.path))
          .slice(0, 50);
        return { menus };
      } catch (e) {
        return { error: describeError(e) };
      }
    },

    async selectMenu(menuId) {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      try {
        await env.services.menu.selectMenu(menuId);
        return { ok: true };
      } catch (e) {
        return { error: describeError(e) };
      }
    },

    // Live suggestions for the path-search's 3rd segment while typing (e.g. "/projet/sprinter/"
    // -> propose "tache", "ticket"...): checks a bounded `candidateModels` list (common models +
    // any alias targets, passed in by the overlay) rather than scanning every installed model,
    // since that would mean a fields_get per model just to see which ones happen to relate back.
    async suggestChildModels(parentAlias, aliasMap, candidateModels, partial) {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      try {
        const modelsRes = await this.listModels();
        if (modelsRes.error) {
          return modelsRes;
        }
        const allModels = modelsRes.models;
        const byModel = new Map(allModels.map((m) => [m.model, m.name]));
        const parentModel = resolveModelAlias(parentAlias, allModels, aliasMap);
        if (!parentModel) {
          return { models: [] };
        }
        const t = (partial || "").toLowerCase();
        const matches = [];
        for (const cm of candidateModels || []) {
          if (cm === parentModel || !byModel.has(cm)) {
            continue;
          }
          const fieldsRes = await this.getFields(cm);
          if (fieldsRes.error) {
            continue;
          }
          const hasRelation = Object.values(fieldsRes.fields).some(
            (f) => f.type === "many2one" && f.relation === parentModel
          );
          if (!hasRelation) {
            continue;
          }
          const name = byModel.get(cm);
          if (t && !name.toLowerCase().includes(t) && !cm.toLowerCase().includes(t)) {
            continue;
          }
          matches.push({ value: name, label: `${name} (${cm})` });
        }
        return { models: matches.slice(0, 20) };
      } catch (e) {
        return { error: describeError(e) };
      }
    },

    // Path-search: "/projets/sprinter/taches" -> one row per project.project matching "sprinter"
    // (ilike on display_name), each showing the count of project.task rows linked to it via
    // whichever many2one field on project.task relates back to project.project. `segments` is
    // the "/"-split path with the leading empty string already removed by the caller, e.g.
    // ["projets", "sprinter", "taches"]. Model aliases are resolved from ir.model's own display
    // name (see resolveModelAlias above) — no hardcoded per-language dictionary.
    // `extraDomain`: see aliasSearch above — applied only to the parent-model search (segment 0),
    // since that's the single unambiguous "searched" model; the child model (segment 2) may not
    // even share those fields.
    async pathSearch(segments, aliasMap, extraDomain) {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      const parts = (segments || []).map((s) => (s || "").trim()).filter(Boolean);
      if (parts.length !== 3) {
        // Only a single relation hop is supported for now — reject anything else explicitly
        // rather than silently ignoring extra segments.
        return {
          error: 'Syntaxe attendue : /modèle/terme/modèle-lié (ex: /projets/sprinter/taches)',
        };
      }
      try {
        const modelsRes = await this.listModels();
        if (modelsRes.error) {
          return modelsRes;
        }
        const allModels = modelsRes.models;

        const parentModel = resolveModelAlias(parts[0], allModels, aliasMap);
        if (!parentModel) {
          return { error: `Aucun modèle ne correspond à "${parts[0]}".` };
        }
        const parentAliasDomain = (getAliasEntry(parts[0], aliasMap) || {}).domain || [];
        const term = parts[1];
        const childModel = resolveModelAlias(parts[2], allModels, aliasMap);
        if (!childModel) {
          return { error: `Aucun modèle ne correspond à "${parts[2]}".` };
        }
        const childAliasDomain = (getAliasEntry(parts[2], aliasMap) || {}).domain || [];

        const relRes = await findRelationField(childModel, parentModel);
        if (relRes.error) {
          return relRes;
        }
        if (!relRes.field) {
          return {
            error: `Aucun champ ne relie "${childModel}" à "${parentModel}" (recherche limitée à un lien direct many2one).`,
          };
        }
        const relationField = relRes.field;

        const parents = await env.services.orm.searchRead(
          parentModel,
          [["display_name", "ilike", term]].concat(parentAliasDomain).concat(extraDomain || []),
          ["display_name"],
          { limit: 50 }
        );
        if (!parents.length) {
          return { rows: [], parentModel, childModel, relationField };
        }

        // One searchCount per matching parent — fired concurrently rather than awaited one at a
        // time in sequence, since that's the difference between "a few dozen ms" and "a few
        // seconds that feel like a hang" once there are more than a handful of matches.
        const rows = await Promise.all(
          parents.map(async (p) => {
            const domain = [[relationField, "=", p.id]].concat(childAliasDomain);
            const count = await env.services.orm.searchCount(childModel, domain);
            return { label: p.display_name, count, model: childModel, domain };
          })
        );
        return { rows, parentModel, childModel, relationField };
      } catch (e) {
        return { error: describeError(e) };
      }
    },

    // "/alias/42" -> jump straight to that record's form, no search involved. `modelAlias` is
    // resolved the same way as path-search's segments (user alias first, then fuzzy display-name
    // match — see resolveModelAlias above).
    async openByAlias(modelAlias, id, aliasMap) {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      try {
        const modelsRes = await this.listModels();
        if (modelsRes.error) {
          return modelsRes;
        }
        const model = resolveModelAlias(modelAlias, modelsRes.models, aliasMap);
        if (!model) {
          return { error: `Aucun modèle ne correspond à "${modelAlias}".` };
        }
        return await this.openList(model, [], null, id);
      } catch (e) {
        return { error: describeError(e) };
      }
    },

    // `viewType`: "list" or "kanban" for a multi-record result, ignored (forced to "form") when
    // `resId` is set — used for the single-result case, opening straight on that record's form.
    async openList(model, domain, viewType, resId) {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      const primary = viewType === "kanban" ? "kanban" : "list";
      const views = resId
        ? [[false, "form"]]
        : [
            [false, primary],
            [false, primary === "kanban" ? "list" : "kanban"],
            [false, "form"],
          ];
      try {
        await env.services.action.doAction(
          {
            type: "ir.actions.act_window",
            name: model,
            res_model: model,
            domain: resId ? [] : domain,
            res_id: resId || undefined,
            views,
            target: "current",
          },
          { clearBreadcrumbs: true }
        );
        return { ok: true };
      } catch (e) {
        return { error: describeError(e) };
      }
    },
  };
})();
