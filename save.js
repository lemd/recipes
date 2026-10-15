import { runtimeSettings } from "./lib/folder.js";
import { publishRecipe, saveStatus } from "./lib/publish.js";

const status = document.querySelector("#status");

save().catch((error) => {
  status.textContent = error.message || "Couldn't save that recipe.";
});

async function save() {
  const stored = await chrome.storage.session.get("extractTabId");
  const tabId = stored.extractTabId;
  if (!tabId) throw new Error("Open a recipe page and try again.");
  const { folder, settings } = await runtimeSettings();
  const response = await chrome.runtime.sendMessage({ type: "EXTRACT_RECIPE", tabId, settings });
  if (!response?.ok) throw new Error(response?.error || "Couldn't extract that recipe.");
  const saved = await publishRecipe(folder, settings, response.document);
  status.textContent = saveStatus(saved);
}
