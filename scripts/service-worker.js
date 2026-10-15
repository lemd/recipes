import { extractPage } from "../lib/extract-page.js";
import { bestStructuredRecipe } from "../lib/jsonld.js";
import { buildMessages } from "../lib/prompt.js";
import { completeChat, parseModelJson } from "../lib/providers.js";
import { shouldRetryModel } from "../lib/retry.js";
import { finalizeRecipe } from "../lib/schema.js";
import { withDefaults } from "../lib/settings.js";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "extract-recipe",
      title: "Save recipe",
      contexts: ["page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "EXTRACT_RECIPE") return undefined;
  extractRecipe(message.tabId, message.settings)
    .then((doc) => sendResponse({ ok: true, document: doc }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "Couldn't extract that recipe." }));
  return true;
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "extract-recipe" || !tab?.id) return;
  await chrome.storage.session.set({ extractTabId: tab.id });
  await chrome.sidePanel.open({ tabId: tab.id });
});

async function loadSettings(override) {
  const prefs = withDefaults(await chrome.storage.local.get(["preferStructuredData", "displaySystem"]));
  return withDefaults({ ...prefs, ...(override || {}) });
}

function providerReady(settings) {
  if (settings.provider === "ollama") return Boolean(String(settings.ollamaUrl || "").trim() && String(settings.ollamaModel || "").trim());
  return Boolean(String(settings.openrouterKey || "").trim() && String(settings.openrouterModel || "").trim());
}

async function extractRecipe(tabId, override) {
  const settings = await loadSettings(override);
  let page;
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPage,
    });
    page = injection?.result;
  } catch (error) {
    throw new Error(friendlyAccess(error));
  }
  if (!page) throw new Error("Couldn't read this page.");
  if (page.error) throw new Error(page.error);

  const structured = bestStructuredRecipe(page.structured);
  const ready = providerReady(settings);
  const warnings = [];
  if (page.truncated) warnings.push("The page text was shortened before extraction.");

  let doc;
  if (structured && (settings.preferStructuredData || !ready)) {
    if (!ready) warnings.push("No model was configured, so this file came from the page's embedded recipe data.");
    doc = finalizeRecipe(structured, { page, method: "structured-data", provider: null, model: null, warnings });
  } else {
    if (!ready) {
      throw new Error(settings.provider === "ollama"
        ? "Set OLLAMA_MODEL in recipe.env. You can also turn on embedded recipe data in settings."
        : "Add an OpenRouter API key in settings.");
    }
    doc = await recipeFromModel(settings, page, warnings);
  }

  await chrome.storage.session.set({ lastExtraction: { url: page.url, document: doc } });
  return doc;
}

async function recipeFromModel(settings, page, warnings) {
  const compact = settings.provider === "ollama";
  const model = settings.provider === "ollama" ? settings.ollamaModel.trim() : settings.openrouterModel.trim();
  let correction = "";
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const built = buildMessages(page, { compact, correction });
      const content = await completeChat(settings, built.messages);
      const partial = parseModelJson(content);
      const attemptWarnings = correction
        ? [...warnings, "The first model response didn't match the recipe shape, so it was requested again."]
        : warnings;
      return finalizeRecipe(partial, {
        page,
        method: built.usedStructuredHint ? "hybrid" : "llm",
        provider: settings.provider,
        model,
        warnings: attemptWarnings,
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0 && shouldRetryModel(error)) {
        correction = error.message;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function friendlyAccess(error) {
  const message = error?.message || String(error);
  if (/Cannot access contents|The extensions gallery|cannot be scripted|chrome:\/\//i.test(message)) {
    return "Open a normal recipe page, then try again.";
  }
  return message;
}
