import { findCatalogEntry, upsertCatalog } from "./catalog.js";
import { parseEnv, resolveSettings, settingsFromEnv } from "./env.js";
import { recipeFilename } from "./format.js";

const DB_NAME = "recipe";
const STORE = "handles";
const KEY = "repo";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getRecipeFolder() {
  const db = await openDb();
  try {
    const handle = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    return handle;
  } finally {
    db.close();
  }
}

export async function chooseRecipeFolder() {
  const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "recipe-repo" });
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(handle, KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
  return handle;
}

export async function recipeFolder() {
  const handle = await getRecipeFolder();
  if (!handle) return null;
  const permission = await handle.queryPermission({ mode: "readwrite" });
  if (permission === "granted") return handle;
  return handle;
}

async function readText(dir, name) {
  const fileHandle = await dir.getFileHandle(name);
  const file = await fileHandle.getFile();
  return file.text();
}

const ENV_FILES = ["recipe.env", ".env"];

async function readEnv(dir) {
  const errors = [];
  for (const name of ENV_FILES) {
    try {
      return { name, text: await readText(dir, name), errors };
    } catch (error) {
      errors.push(`${name}: ${error?.name || "unreadable"}`);
    }
  }
  return { name: null, text: "", errors };
}

async function writeText(dir, name, text) {
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function folderStatus(dir) {
  const envFile = await readEnv(dir);
  const env = parseEnv(envFile.text);
  const settings = settingsFromEnv(env, {});
  return {
    name: dir.name,
    envFile: envFile.name,
    envError: envFile.name ? "" : envFile.errors.join(", "),
    hasEnv: Boolean(envFile.text.trim()),
    hasKey: Boolean(settings.openrouterKey),
    provider: settings.provider,
    model: settings.provider === "ollama" ? settings.ollamaModel : settings.openrouterModel,
    settings,
  };
}

const STORED_KEYS = [
  "preferStructuredData",
  "displaySystem",
  "provider",
  "openrouterKey",
  "openrouterModel",
  "ollamaUrl",
  "ollamaModel",
  "githubPush",
  "githubToken",
];

export async function runtimeSettings() {
  const stored = await chrome.storage.local.get(STORED_KEYS);
  const folder = await recipeFolder();
  let env = {};
  if (folder) {
    if (await folder.queryPermission({ mode: "readwrite" }) !== "granted") {
      const permission = await folder.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") throw new Error("Allow recipe to write to that folder.");
    }
    const envFile = await readEnv(folder);
    env = parseEnv(envFile.text);
  }
  const settings = resolveSettings(stored, env);
  if (settings.provider === "openrouter" && !settings.openrouterKey) {
    throw new Error("Add an OpenRouter API key in settings.");
  }
  return { folder, settings };
}

export async function findSavedRecipe(folder, url) {
  const catalog = await readRecipeCatalog(folder);
  const entry = findCatalogEntry(catalog, url);
  if (!entry?.file) return null;
  try {
    const recipesDir = await folder.getDirectoryHandle("recipes");
    return JSON.parse(await readText(recipesDir, entry.file));
  } catch {
    return null;
  }
}

export async function readRecipeCatalog(folder) {
  const recipesDir = await folder.getDirectoryHandle("recipes", { create: true });
  try {
    return JSON.parse(await readText(recipesDir, "index.json"));
  } catch {
    return { recipes: [] };
  }
}

export async function saveRecipe(folder, doc) {
  const recipesDir = await folder.getDirectoryHandle("recipes", { create: true });
  let catalog = { recipes: [] };
  try {
    catalog = JSON.parse(await readText(recipesDir, "index.json"));
  } catch {
    catalog = { recipes: [] };
  }
  const next = upsertCatalog(catalog, doc);
  const file = recipeFilename(doc);
  await writeText(recipesDir, file, `${JSON.stringify(doc, null, 2)}\n`);
  await writeText(recipesDir, "index.json", `${JSON.stringify(next, null, 2)}\n`);
  return file;
}
