import { formatMinutes, ingredientLines, scaleIngredient, tidyStepText } from "./lib/format.js";
import { visibleTags } from "./lib/tags.js";

const list = document.querySelector("#list");
const article = document.querySelector("#recipe");
const systemSelect = document.querySelector("#system");
const filters = document.querySelector("#filters");

const TIMER_KEY = "recipe-step-timer";

let catalog = [];
let current = null;
let currentFile = "";
let servingCount = null;
let timer = loadTimer();
let tickId = null;
const selectedTags = new Set();
const cache = new Map();

const timerBar = document.createElement("div");
timerBar.id = "timer";
timerBar.hidden = true;
document.body.append(timerBar);

systemSelect.addEventListener("change", () => {
  if (current) renderRecipe(current);
});

load().catch((error) => {
  article.textContent = error.message || "Couldn't load the recipes.";
});

const addForm = document.querySelector("#add");
const addUrl = document.querySelector("#add-url");
const addStatus = document.querySelector("#add-status");
const githubSignIn = document.querySelector("#github-signin");
const TOKEN_KEY = "recipe-github-token";

function showGithubUser() {
  const login = document.documentElement.dataset.githubUser;
  if (login) githubSignIn.textContent = login;
}

document.addEventListener("recipe-github-ready", showGithubUser);
showGithubUser();

githubSignIn.addEventListener("click", () => {
  let handled = false;
  const ack = () => { handled = true; };
  document.addEventListener("recipe-github-signin-ack", ack, { once: true });
  document.dispatchEvent(new CustomEvent("recipe-github-signin"));
  if (!handled) {
    addStatus.textContent = "Sign in from the recipe extension, or run Fetch recipe on GitHub.";
    return;
  }
  addStatus.textContent = "Approve recipe on GitHub.";
});

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = addUrl.value.trim();
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if (!token) {
    addStatus.textContent = "Sign in with GitHub first.";
    return;
  }
  addStatus.textContent = "Starting…";
  let response;
  try {
    response = await fetch("https://api.github.com/repos/lemd/recipes/actions/workflows/fetch-recipe.yml/dispatches", {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main", inputs: { url } }),
    });
  } catch {
    addStatus.textContent = "Couldn't reach GitHub.";
    return;
  }
  if (response.status === 204) {
    addStatus.textContent = "Started. Refresh in a minute.";
    return;
  }
  addStatus.textContent = `Couldn't start it (${response.status}). The token needs permission to start Actions.`;
});

async function load() {
  const response = await fetch("recipes/index.json");
  if (!response.ok) throw new Error("Couldn't read recipes/index.json.");
  const body = await response.json();
  catalog = Array.isArray(body.recipes) ? body.recipes : [];
  await Promise.all(catalog.map((entry) => loadDoc(entry).catch(() => null)));
  renderList();
  if (!catalog.length) {
    article.textContent = "No recipes saved yet.";
    return;
  }
  const requested = new URLSearchParams(location.search).get("recipe");
  const entry = catalog.find((item) => item.file === requested) || catalog[0];
  await openRecipe(entry);
}

function renderList() {
  renderFilters();
  list.replaceChildren();
  const shown = catalog.filter((entry) => matchesTags(entry));
  if (!catalog.length) {
    list.textContent = "None yet.";
    return;
  }
  if (!shown.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Nothing with those tags.";
    list.append(empty);
    return;
  }
  for (const entry of shown) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recipe-link";
    button.textContent = entry.name;
    button.addEventListener("click", () => openRecipe(entry));
    if (entry.file === currentFile) button.setAttribute("aria-current", "true");
    list.append(button);
  }
}

function renderFilters() {
  filters.replaceChildren();
  const available = new Map();
  for (const entry of catalog) {
    for (const tag of entryTags(entry)) available.set(tag.value, tag.label);
  }
  for (const [value, label] of available) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = label;
    button.setAttribute("aria-pressed", selectedTags.has(value) ? "true" : "false");
    button.addEventListener("click", () => {
      if (selectedTags.has(value)) selectedTags.delete(value);
      else selectedTags.add(value);
      renderList();
      if (current) renderRecipe(current);
    });
    filters.append(button);
  }
}

function entryTags(entry) {
  const doc = cache.get(entry.file);
  return doc ? visibleTags(doc.recipe) : [];
}

function matchesTags(entry) {
  if (!selectedTags.size) return true;
  const values = new Set(entryTags(entry).map((tag) => tag.value));
  return [...selectedTags].every((value) => values.has(value));
}

async function loadDoc(entry) {
  if (!cache.has(entry.file)) {
    const response = await fetch(`recipes/${encodeURIComponent(entry.file)}`);
    if (!response.ok) throw new Error(`Couldn't read ${entry.file}.`);
    cache.set(entry.file, await response.json());
  }
  return cache.get(entry.file);
}

async function openRecipe(entry) {
  current = await loadDoc(entry);
  currentFile = entry.file;
  servingCount = baseServings(current);
  const url = new URL(location.href);
  url.searchParams.set("recipe", entry.file);
  history.replaceState(null, "", url);
  renderList();
  renderRecipe(current);
}

function renderRecipe(doc) {
  article.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = doc.recipe.name;
  article.append(title);
  if (doc.recipe.description) {
    const description = document.createElement("p");
    description.textContent = doc.recipe.description;
    article.append(description);
  }
  const base = baseServings(doc);
  const factor = base && servingCount ? servingCount / base : 1;
  const facts = document.createElement("div");
  facts.className = "facts";
  if (base) facts.append(servingsControl(servingCount));
  else if (doc.recipe.yield?.text) facts.append(chip(doc.recipe.yield.text));
  const bits = [];
  for (const [key, label] of [["prep", "prep"], ["cook", "cook"], ["total", "total"]]) {
    const formatted = formatMinutes(doc.recipe.timesMinutes?.[key]);
    if (formatted) bits.push(`${label} ${formatted}`);
  }
  for (const bit of bits) facts.append(chip(bit));
  if (facts.childNodes.length) article.append(facts);

  const tags = visibleTags(doc.recipe);
  if (tags.length) {
    const row = document.createElement("div");
    row.className = "tags";
    for (const tag of tags) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = tag.label;
      button.setAttribute("aria-pressed", selectedTags.has(tag.value) ? "true" : "false");
      button.addEventListener("click", () => {
        if (selectedTags.has(tag.value)) selectedTags.delete(tag.value);
        else selectedTags.add(tag.value);
        renderList();
        renderRecipe(doc);
      });
      row.append(button);
    }
    article.append(row);
  }

  const system = systemSelect.value;
  const ingredients = document.createElement("section");
  const ingredientHeading = document.createElement("h3");
  ingredientHeading.textContent = "Ingredients";
  ingredients.append(ingredientHeading);
  for (const group of doc.recipe.ingredientGroups || []) {
    if (group.name) {
      const name = document.createElement("div");
      name.className = "group";
      name.textContent = group.name;
      ingredients.append(name);
    }
    const items = document.createElement("ol");
    for (const ingredient of group.ingredients || []) {
      const item = document.createElement("li");
      const lines = ingredientLines(scaleIngredient(ingredient, factor), system);
      const primary = document.createElement("div");
      primary.textContent = lines.primary;
      item.append(primary);
      if (lines.secondary) {
        const secondary = document.createElement("div");
        secondary.className = "secondary";
        secondary.textContent = lines.secondary;
        item.append(secondary);
      }
      items.append(item);
    }
    ingredients.append(items);
  }
  article.append(ingredients);

  const steps = document.createElement("section");
  const stepHeading = document.createElement("h3");
  stepHeading.textContent = "Steps";
  steps.append(stepHeading);
  let number = 1;
  for (const group of doc.recipe.stepGroups || []) {
    if (group.name) {
      const name = document.createElement("div");
      name.className = "group";
      name.textContent = group.name;
      steps.append(name);
    }
    const items = document.createElement("ol");
    items.start = number;
    for (const step of group.steps || []) {
      const item = document.createElement("li");
      const text = document.createElement("div");
      text.className = "step-text";
      text.textContent = tidyStepText(step.text);
      item.append(text);
      const minutes = step.durationMinutesMax ?? step.durationMinutes;
      if (minutes) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "step-timer";
        button.dataset.step = step.id;
        button.textContent = timerLabel(step, minutes);
        button.addEventListener("click", () => startStepTimer(step, `Step ${number}`));
        item.append(button);
      }
      items.append(item);
      number += 1;
    }
    steps.append(items);
  }
  article.append(steps);
  renderTimer();
  if (doc.recipe.sourceUrl) {
    const link = document.createElement("a");
    link.href = doc.recipe.sourceUrl;
    link.textContent = doc.recipe.sourceUrl;
    article.append(link);
  }
}

function chip(text) {
  const el = document.createElement("span");
  el.className = "chip";
  el.textContent = text;
  return el;
}

function baseServings(doc) {
  const value = Number(doc?.recipe?.yield?.servings);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function servingsControl(count) {
  const wrap = document.createElement("div");
  wrap.className = "servings";
  const fewer = document.createElement("button");
  fewer.type = "button";
  fewer.textContent = "−";
  fewer.setAttribute("aria-label", "Fewer servings");
  fewer.disabled = count <= 1;
  fewer.addEventListener("click", () => {
    servingCount = Math.max(1, count - 1);
    renderRecipe(current);
  });
  const label = document.createElement("span");
  label.textContent = `${count} ${count === 1 ? "serving" : "servings"}`;
  const more = document.createElement("button");
  more.type = "button";
  more.textContent = "+";
  more.setAttribute("aria-label", "More servings");
  more.addEventListener("click", () => {
    servingCount = count + 1;
    renderRecipe(current);
  });
  wrap.append(fewer, label, more);
  return wrap;
}

function timerLabel(step, minutes) {
  if (timer?.stepId === step.id && remainingSeconds() > 0) return formatClock(remainingSeconds());
  return formatMinutes(minutes);
}

function startStepTimer(step, label) {
  const minutes = Number(step.durationMinutesMax ?? step.durationMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  const total = Math.round(minutes * 60);
  timer = { stepId: step.id, label, total, endsAt: Date.now() + total * 1000 };
  localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
  renderTimer();
  ensureTick();
  if (current) renderRecipe(current);
}

function stopTimer() {
  timer = null;
  localStorage.removeItem(TIMER_KEY);
  renderTimer();
  if (current) renderRecipe(current);
}

function remainingSeconds() {
  if (!timer?.endsAt) return 0;
  return Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
}

function formatClock(seconds) {
  const whole = Math.max(0, seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function loadTimer() {
  try {
    const saved = JSON.parse(localStorage.getItem(TIMER_KEY) || "null");
    if (!saved?.endsAt || !saved.stepId) return null;
    return saved;
  } catch {
    return null;
  }
}

function renderTimer() {
  const left = remainingSeconds();
  if (!timer) {
    timerBar.replaceChildren();
    timerBar.hidden = true;
    document.body.classList.remove("timing");
    return;
  }
  timerBar.hidden = false;
  document.body.classList.add("timing");
  let label = timerBar.querySelector("span");
  if (!label) {
    timerBar.replaceChildren();
    label = document.createElement("span");
    const stop = document.createElement("button");
    stop.type = "button";
    stop.textContent = "Stop";
    stop.addEventListener("click", stopTimer);
    timerBar.append(label, stop);
  }
  label.textContent = left > 0 ? `${timer.label} · ${formatClock(left)}` : `${timer.label} · done`;
  const active = document.querySelector(`.step-timer[data-step="${CSS.escape(timer.stepId)}"]`);
  if (active && left > 0) active.textContent = formatClock(left);
}

function ensureTick() {
  if (tickId || !timer) return;
  tickId = setInterval(() => {
    if (!timer) {
      clearInterval(tickId);
      tickId = null;
      return;
    }
    renderTimer();
  }, 250);
}

if (timer) ensureTick();
