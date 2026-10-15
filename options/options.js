import { testProvider } from "../lib/providers.js";
import { chooseRecipeFolder, folderStatus, recipeFolder, runtimeSettings } from "../lib/folder.js";

const form = document.querySelector("#settings");
const status = document.querySelector("#status");
const folderLine = document.querySelector("#folder");
const preferStructured = document.querySelector("#prefer-structured");
const chooseButton = document.querySelector("#choose");
const testButton = document.querySelector("#test");
const keyInput = document.querySelector("#openrouter-key");
const keyHelp = document.querySelector("#key-help");
const clearKey = document.querySelector("#clear-key");
const githubPush = document.querySelector("#github-push");
const githubToken = document.querySelector("#github-token");
const clearToken = document.querySelector("#clear-token");

const STORED_KEYS = ["preferStructuredData", "openrouterKey", "githubPush", "githubToken"];

init();

chooseButton.addEventListener("click", async () => {
  chooseButton.disabled = true;
  setStatus("Choose the recipe folder.");
  try {
    const folder = await chooseRecipeFolder();
    await showFolder(folder);
    setStatus(`Using ${folder.name}.`, "ok");
  } catch (error) {
    if (error?.name === "AbortError") setStatus("Folder choice was cancelled.");
    else setStatus(error.message || "Couldn't use that folder.", "error");
  } finally {
    chooseButton.disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = await chrome.storage.local.get(STORED_KEYS);
  const typedKey = keyInput.value.trim();
  const typedToken = githubToken.value.trim();
  const token = typedToken || String(current.githubToken || "").trim();
  if (githubPush.checked && !token) {
    setStatus("Add a GitHub token before turning on push.", "error");
    return;
  }
  const updates = {
    preferStructuredData: preferStructured.checked,
    githubPush: githubPush.checked,
  };
  if (typedKey) updates.openrouterKey = typedKey;
  if (typedToken) updates.githubToken = typedToken;
  await chrome.storage.local.set(updates);
  keyInput.value = "";
  githubToken.value = "";
  await showSecrets();
  setStatus("Saved.", "ok");
});

clearKey.addEventListener("click", async () => {
  await chrome.storage.local.remove("openrouterKey");
  keyInput.value = "";
  await showSecrets();
  setStatus("Cleared the saved OpenRouter key.", "ok");
});

clearToken.addEventListener("click", async () => {
  await chrome.storage.local.remove("githubToken");
  githubToken.value = "";
  await showSecrets();
  setStatus("Cleared the saved GitHub token.", "ok");
});

testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  setStatus("Checking…");
  try {
    const { settings } = await runtimeSettings();
    const result = await testProvider(settings);
    setStatus(result.message, "ok");
  } catch (error) {
    setStatus(error.message || "Couldn't reach that provider.", "error");
  } finally {
    testButton.disabled = false;
  }
});

async function init() {
  const stored = await chrome.storage.local.get(STORED_KEYS);
  preferStructured.checked = Boolean(stored.preferStructuredData);
  githubPush.checked = stored.githubPush !== false;
  await showSecrets();
  const folder = await recipeFolder();
  if (folder) await showFolder(folder);
}

async function showSecrets() {
  const stored = await chrome.storage.local.get(["openrouterKey", "githubToken"]);
  const hasKey = Boolean(String(stored.openrouterKey || "").trim());
  const hasToken = Boolean(String(stored.githubToken || "").trim());
  keyHelp.textContent = hasKey
    ? "A key is saved in this browser. Leave the field blank to keep it, or type a new one to replace it."
    : "Saved in this browser only. Leave the field blank to keep using a key from recipe.env.";
  clearKey.hidden = !hasKey;
  githubToken.placeholder = hasToken ? "Token saved" : "";
  clearToken.hidden = !hasToken;
}

async function showFolder(folder) {
  const info = await folderStatus(folder);
  const stored = await chrome.storage.local.get(["openrouterKey"]);
  let key = `Ollama model ${info.model}.`;
  if (info.provider === "openrouter") {
    if (String(stored.openrouterKey || "").trim()) key = "OpenRouter key saved in this browser.";
    else if (info.hasKey) key = `OpenRouter key found in ${info.envFile}.`;
    else if (info.envFile) key = `${info.envFile} has no OPENROUTER_API_KEY.`;
    else key = "No OpenRouter key yet. Add one in the field below.";
  }
  folderLine.textContent = `Folder “${info.name}”. ${key}`;
}

function setStatus(message, kind) {
  status.textContent = message;
  status.className = kind || "";
}
