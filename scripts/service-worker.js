import { extractPage } from "../lib/extract-page.js";
import { makeRecipe } from "../lib/make-recipe.js";
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
  const doc = await makeRecipe(page, settings);
  await chrome.storage.session.set({ lastExtraction: { url: page.url, document: doc } });
  return doc;
}

function friendlyAccess(error) {
  const message = error?.message || String(error);
  if (/Cannot access contents|The extensions gallery|cannot be scripted|chrome:\/\//i.test(message)) {
    return "Open a normal recipe page, then try again.";
  }
  return message;
}
