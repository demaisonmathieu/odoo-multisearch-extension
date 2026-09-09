// Injected in the page's MAIN world (same trick used by Odoo Terminal-style extensions):
// odoo.__WOWL_DEBUG__.root.env is set unconditionally when the webclient root component
// mounts (see addons/web/static/src/env.js), so it is available even outside debug mode.
(function () {
  // Always redefine (don't early-return if window.__oms already exists): this file is injected
  // fresh into the page's MAIN world on every palette open, and the page itself is never
  // reloaded by the extension, so a stale early-return would keep an old API version alive
  // indefinitely after the extension is updated.
  function getEnv() {
    const root = window.odoo && window.odoo.__WOWL_DEBUG__ && window.odoo.__WOWL_DEBUG__.root;
    return root ? root.env : null;
  }

  // RPCError's own .message is a generic string ("Odoo Server Error"); the actual server-side
  // exception message (e.g. "Invalid field 'project_id.name' on model 'res.partner'") is in
  // .data.message (see addons/web/static/src/core/network/rpc.js: makeErrorFromResponse).
  function describeError(e) {
    return (e && e.data && e.data.message) || (e && e.message) || String(e);
  }

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

    async listModels() {
      const env = getEnv();
      if (!env) {
        return { error: "Odoo n'est pas chargé sur cet onglet." };
      }
      try {
        const records = await env.services.orm.searchRead("ir.model", [], ["model", "name"], {
          order: "model",
        });
        return { models: records.map((r) => ({ model: r.model, name: r.name })) };
      } catch (e) {
        return { error: describeError(e) };
      }
    },

    // `viewType`: "list" or "kanban" for a multi-record result, ignored (forced to "form") when
    // `resId` is set — used for the single-result case, opening straight on that record's form.
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
