import { authorizeUrl, exchangeUserCode, githubAppManifest, githubLogin } from "../lib/github-auth.js";
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
const githubAccount = document.querySelector("#github-account");
const githubSignIn = document.querySelector("#github-signin");
const githubAppForm = document.querySelector("#github-app");

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
  if (githubPush.checked && !String(current.githubToken || "").trim()) {
    setStatus("Sign in with GitHub before turning on push.", "error");
    return;
  }
  const updates = {
    preferStructuredData: preferStructured.checked,
    githubPush: githubPush.checked,
  };
  if (typedKey) updates.openrouterKey = typedKey;
  await chrome.storage.local.set(updates);
  keyInput.value = "";
  await showSecrets();
  setStatus("Saved.", "ok");
});

clearKey.addEventListener("click", async () => {
  await chrome.storage.local.remove("openrouterKey");
  keyInput.value = "";
  await showSecrets();
  setStatus("Cleared the saved OpenRouter key.", "ok");
});

githubSignIn.addEventListener("click", () => {
  signIn().catch((error) => setStatus(error.message || "Couldn't sign in with GitHub.", "error"));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.githubToken || changes.githubLogin || changes.githubClientId)) showGithub();
  if (area === "session" && changes.githubStatus?.newValue) setStatus(changes.githubStatus.newValue, "error");
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
  await showGithub();
  const folder = await recipeFolder();
  if (folder) await showFolder(folder);
  if (location.hash === "#github") {
    const stored = await chrome.storage.local.get(["githubToken", "githubClientId"]);
    if (!stored.githubToken) {
      signIn().catch((error) => setStatus(error.message || "Couldn't sign in with GitHub.", "error"));
    }
  }
}

async function showSecrets() {
  const stored = await chrome.storage.local.get(["openrouterKey"]);
  const hasKey = Boolean(String(stored.openrouterKey || "").trim());
  keyHelp.textContent = hasKey
    ? "A key is saved in this browser. Leave the field blank to keep it, or type a new one to replace it."
    : "Saved in this browser only. Leave the field blank to keep using a key from recipe.env.";
  clearKey.hidden = !hasKey;
}

async function showGithub() {
  const stored = await chrome.storage.local.get(["githubToken", "githubLogin"]);
  const signedIn = Boolean(String(stored.githubToken || "").trim());
  githubAccount.textContent = stored.githubLogin
    ? `Signed in as ${stored.githubLogin}.`
    : signedIn
      ? "Signed in."
      : "Not signed in.";
  githubSignIn.textContent = signedIn ? "Sign out" : "Sign in with GitHub";
}

let signingIn = false;

async function signIn() {
  const stored = await chrome.storage.local.get(["githubToken", "githubClientId", "githubClientSecret"]);
  if (String(stored.githubToken || "").trim()) {
    await chrome.storage.local.remove(["githubToken", "githubLogin"]);
    await showGithub();
    setStatus("Signed out.", "ok");
    return;
  }
  if (signingIn) return;
  signingIn = true;
  githubSignIn.disabled = true;
  try {
    const redirectUrl = chrome.identity.getRedirectURL();
    if (!stored.githubClientId || !stored.githubClientSecret) {
      const state = crypto.randomUUID();
      await chrome.storage.session.set({ githubAppState: state });
      document.querySelector("#github-manifest").value = JSON.stringify(githubAppManifest(redirectUrl));
      document.querySelector("#github-state").value = state;
      githubAppForm.submit();
      setStatus("Approve recipe on GitHub. This page will finish signing in when you come back.");
      return;
    }
    const state = crypto.randomUUID();
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authorizeUrl({ clientId: stored.githubClientId, redirectUrl, state }),
      interactive: true,
    });
    const code = new URL(responseUrl).searchParams.get("code");
    if (!code) throw new Error("GitHub didn't finish signing in.");
    const token = await exchangeUserCode({
      clientId: stored.githubClientId,
      clientSecret: stored.githubClientSecret,
      code,
      redirectUrl,
    });
    const login = await githubLogin(token);
    await chrome.storage.local.set({ githubToken: token, githubLogin: login });
    await showGithub();
    setStatus(login ? `Signed in as ${login}.` : "Signed in.", "ok");
  } finally {
    signingIn = false;
    githubSignIn.disabled = false;
  }
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
