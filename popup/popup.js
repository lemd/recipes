import { formatMeasure, formatMinutes, shownMeasures, tidyStepText } from "../lib/format.js";
import { ingredientPhotoUrl } from "../lib/ingredient-photo.js";
import { findSavedRecipe, runtimeSettings } from "../lib/folder.js";
import { publishRecipe, saveStatus } from "../lib/publish.js";
import { SCHEMA_VERSION } from "../lib/schema.js";
import { withDefaults } from "../lib/settings.js";

const pageTitle = document.querySelector("#page-title");
const extractButton = document.querySelector("#extract");
const settingsButton = document.querySelector("#settings");
const systemSelect = document.querySelector("#system");
const status = document.querySelector("#status");
const result = document.querySelector("#result");

let current = null;
let tabUrl = "";
let shownTabId = null;
let extracting = false;

settingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

systemSelect.addEventListener("change", async () => {
  await chrome.storage.local.set({ displaySystem: systemSelect.value });
  if (current) render(current);
});

extractButton.addEventListener("click", async () => {
  extracting = true;
  extractButton.disabled = true;
  setStatus("Extracting the recipe…");
  result.hidden = true;
  try {
    const tab = await focusedTab();
    if (!tab?.id || !isRecipePage(tab.url)) throw new Error("Open a recipe page first.");
    const { folder, settings } = await runtimeSettings();
    const savedAlready = folder ? await findSavedRecipe(folder, tab.url) : null;
    if (savedAlready) {
      current = savedAlready;
      render(current);
      setStatus("Already saved.", "ok");
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: "EXTRACT_RECIPE", tabId: tab.id, settings });
    if (!response?.ok) throw new Error(response?.error || "Couldn't extract that recipe.");
    const saved = await publishRecipe(folder, settings, response.document);
    current = response.document;
    render(current);
    setStatus(saveStatus(saved), saved.githubError ? "error" : "ok");
  } catch (error) {
    setStatus(error.message || "Couldn't extract that recipe.", "error");
  } finally {
    extracting = false;
    extractButton.disabled = !isRecipePage(tabUrl);
  }
});

chrome.tabs.onActivated.addListener(() => {
  syncTab();
});

chrome.tabs.onUpdated.addListener((_tabId, change) => {
  if (change.url || change.status === "complete") syncTab();
});

init();

async function focusedTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

function isRecipePage(url) {
  return /^https?:/i.test(url || "");
}

async function init() {
  await chrome.action.setBadgeText({ text: "" });
  const settings = withDefaults(await chrome.storage.local.get(["displaySystem"]));
  systemSelect.value = settings.displaySystem || "us";
  await syncTab();
}

async function syncTab() {
  if (extracting) return;
  const tab = await focusedTab();
  const url = tab?.url || "";
  const title = tab?.title || "This page";
  if (tab?.id === shownTabId && url === tabUrl) {
    pageTitle.textContent = title;
    return;
  }
  shownTabId = tab?.id ?? null;
  tabUrl = url;
  pageTitle.textContent = title;
  current = null;
  result.hidden = true;
  if (!isRecipePage(url)) {
    extractButton.disabled = true;
    setStatus("Open a recipe page first.");
    return;
  }
  extractButton.disabled = false;
  setStatus("");
  const stored = await chrome.storage.session.get(["lastExtraction", "extractTabId"]);
  if (stored.extractTabId === tab.id) {
    await chrome.storage.session.remove("extractTabId");
    extractButton.click();
    return;
  }
  if (stored.lastExtraction?.url === url && stored.lastExtraction.document?.schemaVersion === SCHEMA_VERSION) {
    current = stored.lastExtraction.document;
    render(current);
  }
}

function setStatus(message, kind) {
  status.textContent = message;
  status.className = kind || "";
}

function render(doc) {
  result.replaceChildren();
  const recipe = doc.recipe;
  const title = document.createElement("h2");
  title.textContent = recipe.name;
  result.append(title);

  const facts = document.createElement("div");
  facts.className = "facts";
  const factText = [];
  if (recipe.yield.servings) factText.push(`${recipe.yield.servings} servings`);
  else if (recipe.yield.text) factText.push(recipe.yield.text);
  for (const [key, label] of [["prep", "prep"], ["cook", "cook"], ["total", "total"]]) {
    const formatted = formatMinutes(recipe.timesMinutes[key]);
    if (formatted) factText.push(`${label} ${formatted}`);
  }
  for (const text of factText) {
    const chip = document.createElement("span");
    chip.textContent = text;
    facts.append(chip);
  }
  if (factText.length) result.append(facts);

  const system = systemSelect.value;
  const ingredientCount = recipe.ingredientGroups.reduce((sum, group) => sum + group.ingredients.length, 0);
  if (ingredientCount) {
    const heading = document.createElement("h3");
    heading.textContent = "Ingredients";
    const wrap = document.createElement("div");
    wrap.className = "ingredients";
    wrap.append(heading);
    for (const group of recipe.ingredientGroups) {
      if (group.name) {
        const name = document.createElement("div");
        name.className = "group-name";
        name.textContent = group.name;
        wrap.append(name);
      }
      const list = document.createElement("ul");
      list.className = "ingredient-grid";
      for (const ingredient of group.ingredients) {
        list.append(ingredientCard(ingredient, system));
      }
      wrap.append(list);
    }
    result.append(wrap);
  }

  const stepCount = recipe.stepGroups.reduce((sum, group) => sum + group.steps.length, 0);
  if (stepCount) {
    const wrap = document.createElement("div");
    wrap.className = "steps";
    const heading = document.createElement("h3");
    heading.textContent = "Steps";
    wrap.append(heading);
    let number = 1;
    for (const group of recipe.stepGroups) {
      if (group.name) {
        const name = document.createElement("div");
        name.className = "group-name";
        name.textContent = group.name;
        wrap.append(name);
      }
      const list = document.createElement("ol");
      list.start = number;
      for (const step of group.steps) {
        const item = document.createElement("li");
        item.textContent = tidyStepText(step.text);
        list.append(item);
        number += 1;
      }
      wrap.append(list);
    }
    result.append(wrap);
  }

  const notes = doc.extraction.warnings.map(warningNote).filter(Boolean);
  if (notes.length) {
    const warnings = document.createElement("p");
    warnings.className = "warnings";
    warnings.textContent = notes.join(" ");
    result.append(warnings);
  }
  result.hidden = false;
}

function warningNote(warning) {
  if (/density were estimated/i.test(warning)) return "Some weights are estimates.";
  return warning;
}

function ingredientCard(ingredient, system) {
  const item = document.createElement("li");
  const photo = document.createElement("div");
  photo.className = "photo";
  const url = ingredientPhotoUrl(ingredient.name);
  if (url) {
    const image = document.createElement("img");
    image.alt = "";
    image.src = url;
    image.addEventListener("error", () => image.remove());
    photo.append(image);
  }
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = ingredient.name || ingredient.text || "Ingredient";
  const amount = document.createElement("div");
  amount.className = "amount";
  const shown = system === "original"
    ? { measure: ingredient.measures?.asWritten, also: null }
    : shownMeasures(ingredient, system);
  const bits = [
    formatMeasure(shown.measure),
    shown.also ? formatMeasure(shown.also) : "",
    ingredient.preparation,
    ingredient.optional ? "optional" : "",
  ].filter(Boolean);
  amount.textContent = bits.join(" · ");
  item.append(photo, name);
  if (amount.textContent) item.append(amount);
  return item;
}
