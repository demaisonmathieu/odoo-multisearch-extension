const DEFAULT_MODELS = [
  "res.partner",
  "sale.order",
  "purchase.order",
  "account.move",
  "project.task",
  "crm.lead",
];

async function toggleOverlay(tab) {
  if (!tab || !tab.id || !/^https?:/.test(tab.url || "")) {
    return;
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["overlay.js"],
  });
}

chrome.action.onClicked.addListener(toggleOverlay);

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-search") {
    toggleOverlay(tab);
  }
});

async function ensureBridge(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    files: ["bridge.js"],
  });
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => window.__oms && window.__oms.isReady(),
  });
  return !!result;
}

async function runSearch(tabId, models, domain) {
  await ensureBridge(tabId); // self-sufficient: don't assume a prior oms:ensureBridge call landed first
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (models, domain) => window.__oms.search(models, domain),
    args: [models, domain],
  });
  return result;
}

async function openResult(tabId, model, domain, viewType, resId) {
  await ensureBridge(tabId);
  // chrome.scripting.executeScript requires structured-cloneable args: `undefined` (e.g. no
  // viewType/resId for a given call) is rejected as "unserializable", so normalize to null.
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (model, domain, viewType, resId) => window.__oms.openList(model, domain, viewType, resId),
    args: [model, domain, viewType ?? null, resId ?? null],
  });
  return result;
}

async function listAllModels(tabId) {
  await ensureBridge(tabId);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => window.__oms.listModels(),
  });
  return result;
}

async function searchMenus(tabId, term) {
  await ensureBridge(tabId);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (term) => window.__oms.searchMenus(term),
    args: [term],
  });
  return result;
}

async function selectMenu(tabId, menuId) {
  await ensureBridge(tabId);
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: (menuId) => window.__oms.selectMenu(menuId),
    args: [menuId],
  });
  return result;
}

function defaultModelsConfig() {
  return Object.fromEntries(DEFAULT_MODELS.map((m) => [m, true]));
}

// `modelsConfig` is { [model]: checkedByDefault } — presence as a key means the model is in the
// user's list (shown as a pill), the boolean value means it starts checked/selected when the
// palette opens (vs. present but requiring a click to include it in that search).
async function getStoredModelsConfig() {
  const { modelsConfig, models } = await chrome.storage.sync.get(["modelsConfig", "models"]);
  if (modelsConfig && typeof modelsConfig === "object" && Object.keys(modelsConfig).length) {
    return modelsConfig;
  }
  if (Array.isArray(models) && models.length) {
    // Migrate the legacy flat-list format (everything was implicitly checked by default).
    return Object.fromEntries(models.map((m) => [m, true]));
  }
  return defaultModelsConfig();
}

async function setStoredModelsConfig(modelsConfig) {
  await chrome.storage.sync.set({ modelsConfig });
  await chrome.storage.sync.remove("models");
}

async function getStoredViewMode() {
  const { viewMode } = await chrome.storage.sync.get("viewMode");
  return viewMode === "kanban" ? "kanban" : "list";
}

async function setStoredViewMode(viewMode) {
  await chrome.storage.sync.set({ viewMode: viewMode === "kanban" ? "kanban" : "list" });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;

  (async () => {
    try {
      switch (msg.type) {
        case "oms:ensureBridge":
          sendResponse({ ready: await ensureBridge(tabId) });
          break;
        case "oms:search":
          sendResponse(await runSearch(tabId, msg.models, msg.domain));
          break;
        case "oms:open":
          sendResponse(await openResult(tabId, msg.model, msg.domain, msg.viewType, msg.resId));
          break;
        case "oms:listAllModels":
          sendResponse(await listAllModels(tabId));
          break;
        case "oms:searchMenus":
          sendResponse(await searchMenus(tabId, msg.term));
          break;
        case "oms:selectMenu":
          sendResponse(await selectMenu(tabId, msg.menuId));
          break;
        case "oms:getModels":
          sendResponse({
            modelsConfig: await getStoredModelsConfig(),
            defaults: DEFAULT_MODELS,
            viewMode: await getStoredViewMode(),
          });
          break;
        case "oms:setModels":
          await setStoredModelsConfig(msg.modelsConfig);
          sendResponse({ ok: true });
          break;
        case "oms:setViewMode":
          await setStoredViewMode(msg.viewMode);
          sendResponse({ ok: true });
          break;
        default:
          sendResponse({ error: "Message inconnu: " + msg.type });
      }
    } catch (e) {
      sendResponse({ error: (e && e.message) || String(e) });
    }
  })();

  return true; // keep the message channel open for the async response
});
