import { tidyStepText } from "./format.js";
import { parseAmount, parseIngredientLine } from "./parse-ingredient.js";
import { COURSES, MEALS, METHODS, SEASONS, normalizeTags } from "./tags.js";
import { applyConversions, interpretUnit } from "./units.js";

export const SCHEMA_VERSION = "1.0.0";

const DENSITY_WARNING = "Some weights are estimates.";

function cleanString(value, max = 500) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function toNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const numeric = Number(text.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function cleanQuantity(value) {
  const number = toNumber(value);
  if (number == null) return null;
  return Math.round(number * 10000) / 10000;
}

function stringList(value, maxItems = 40, maxLength = 120) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set();
  const result = [];
  for (const item of source) {
    const text = cleanString(item, maxLength);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function bool(value) {
  if (value === true || value === false) return value;
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "yes";
}

function temperatureFromText(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*°?\s*([FC])\b/i);
  if (!match) return null;
  return {
    value: Number(match[1]),
    valueMax: match[2] ? Number(match[2]) : null,
    unit: match[3].toUpperCase(),
  };
}

function durationFromText(text) {
  const source = String(text || "");
  const hours = source.match(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*hours?\b/i);
  const minutes = source.match(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(?:minutes|minute|mins|min)\b/i);
  if (!hours && !minutes) return { durationMinutes: null, durationMinutesMax: null };
  if (hours && minutes && !hours[2] && !minutes[2]) {
    return { durationMinutes: Number(hours[1]) * 60 + Number(minutes[1]), durationMinutesMax: null };
  }
  if (hours && !minutes) {
    return {
      durationMinutes: Number(hours[1]) * 60,
      durationMinutesMax: hours[2] ? Number(hours[2]) * 60 : null,
    };
  }
  return {
    durationMinutes: Number(minutes[1]),
    durationMinutesMax: minutes[2] ? Number(minutes[2]) : null,
  };
}

function normalizeTemperature(temp, text) {
  const source = temp && (temp.value != null || temp.celsius || temp.fahrenheit) ? temp : temperatureFromText(text);
  if (!source) return null;

  let unit = null;
  let value = null;
  let valueMax = null;
  if (source.celsius?.value != null || source.fahrenheit?.value != null) {
    if (source.fahrenheit?.value != null) {
      unit = "F";
      value = toNumber(source.fahrenheit.value);
      valueMax = toNumber(source.fahrenheit.valueMax);
    } else {
      unit = "C";
      value = toNumber(source.celsius.value);
      valueMax = toNumber(source.celsius.valueMax);
    }
  } else {
    const rawUnit = String(source.unit || "").toLowerCase();
    if (rawUnit.startsWith("f")) unit = "F";
    if (rawUnit.startsWith("c")) unit = "C";
    value = toNumber(source.value);
    valueMax = toNumber(source.valueMax);
  }
  if (value == null || !unit) return null;

  const toC = (fahrenheit) => ((fahrenheit - 32) * 5) / 9;
  const toF = (celsius) => (celsius * 9) / 5 + 32;
  const celsiusValue = unit === "C" ? value : toC(value);
  const celsiusMax = valueMax == null ? null : unit === "C" ? valueMax : toC(valueMax);
  const fahrenheitValue = unit === "F" ? value : toF(value);
  const fahrenheitMax = valueMax == null ? null : unit === "F" ? valueMax : toF(valueMax);
  return {
    celsius: { value: Math.round(celsiusValue), valueMax: celsiusMax == null ? null : Math.round(celsiusMax) },
    fahrenheit: { value: Math.round(fahrenheitValue), valueMax: fahrenheitMax == null ? null : Math.round(fahrenheitMax) },
  };
}

function blankMeasures() {
  return {
    asWritten: { quantity: null, quantityMax: null, unit: null },
    metric: { mass: null, volume: null },
    us: { mass: null, volume: null },
  };
}

function statedFrom(source) {
  const stated = Array.isArray(source.stated) ? source.stated.map(cleanStated).filter(Boolean) : [];
  const commentParts = [];
  const comment = cleanString(source.comment ?? source.note, 240);
  if (comment) {
    for (const part of comment.split(/\s*;\s*/)) {
      const amount = parseAmount(part);
      if (amount) stated.push(amount);
      else if (part.trim()) commentParts.push(part.trim());
    }
  }
  const text = cleanString(source.text || source.original || source.raw, 500) || "";
  if (!stated.length && text.includes("(")) {
    for (const amount of parseIngredientLine(text).stated) {
      const clean = cleanStated(amount);
      if (clean) stated.push(clean);
    }
  }
  return { stated, comment: commentParts.length ? commentParts.join("; ") : null };
}

function cleanStated(amount) {
  const quantity = cleanQuantity(amount?.quantity);
  const unit = interpretUnit(amount?.unit);
  if (quantity == null || !unit.known) return null;
  return { quantity, quantityMax: cleanQuantity(amount.quantityMax), unit: unit.code };
}

function normalizeIngredient(raw, index) {
  const source = typeof raw === "string" ? parseIngredientLine(raw) : raw || {};
  const text = cleanString(source.text || source.original || source.raw, 500) || "";
  const interpreted = interpretUnit(source.unit);
  const name = cleanString(String(source.name || source.ingredient || "").replace(/[*†‡]+$/g, ""), 240) || text || "ingredient";
  const stated = statedFrom(source);
  return {
    id: `ingredient-${index}`,
    text,
    name,
    quantity: cleanQuantity(source.quantity ?? source.amount),
    quantityMax: cleanQuantity(source.quantityMax ?? source.amountMax),
    unit: interpreted.code,
    unitDimension: interpreted.dimension,
    preparation: cleanString(source.preparation, 240),
    optional: bool(source.optional),
    comment: stated.comment,
    stated: stated.stated,
    measures: blankMeasures(),
  };
}

function normalizeStep(raw, index) {
  const source = typeof raw === "string" ? { text: raw } : raw || {};
  const text = tidyStepText(cleanString(source.text || source.name || source.step, 2000) || "");
  const fromText = durationFromText(text);
  const durationMinutes = cleanQuantity(source.durationMinutes);
  const durationMinutesMax = cleanQuantity(source.durationMinutesMax);
  return {
    id: `step-${index}`,
    text,
    durationMinutes: durationMinutes ?? (source.durationMinutes == null ? fromText.durationMinutes : null),
    durationMinutesMax: durationMinutesMax ?? (source.durationMinutesMax == null && source.durationMinutes == null ? fromText.durationMinutesMax : null),
    temperature: normalizeTemperature(source.temperature, text),
  };
}

function groupList(value, itemKey) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30);
}

function ingredientGroupsFrom(partial) {
  if (Array.isArray(partial.ingredientGroups) && partial.ingredientGroups.length) return partial.ingredientGroups;
  if (Array.isArray(partial.ingredients)) return [{ name: null, ingredients: partial.ingredients }];
  return [];
}

function stepGroupsFrom(partial) {
  if (Array.isArray(partial.stepGroups) && partial.stepGroups.length) return partial.stepGroups;
  const steps = partial.steps || partial.instructions;
  if (typeof steps === "string") {
    const lines = steps.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    return [{ name: null, steps: (lines.length ? lines : [steps]).map((text) => ({ text })) }];
  }
  if (Array.isArray(steps)) return [{ name: null, steps }];
  return [];
}

function normalizeNutrition(nutrition) {
  const source = nutrition && typeof nutrition === "object" ? nutrition : {};
  const nutrients = [];
  const rows = Array.isArray(source.nutrients) ? source.nutrients : [];
  for (const row of rows.slice(0, 40)) {
    if (!row) continue;
    const name = cleanString(row.name, 80);
    if (!name) continue;
    nutrients.push({
      name,
      amount: toNumber(row.amount),
      unit: cleanString(row.unit, 20),
    });
  }
  return {
    servingSizeText: cleanString(source.servingSizeText, 160),
    nutrients,
  };
}

export function toStandardRecipe(partial, context = {}) {
  const source = partial || {};
  const page = context.page || {};
  const times = source.timesMinutes || source.times || {};
  const yieldSource = source.yield && typeof source.yield === "object" ? source.yield : {};
  let ingredientIndex = 0;
  let stepIndex = 0;

  const ingredientGroups = groupList(ingredientGroupsFrom(source)).map((group, groupIndex) => {
    const items = Array.isArray(group?.ingredients) ? group.ingredients : Array.isArray(group) ? group : [];
    return {
      id: `group-${groupIndex + 1}`,
      name: cleanString(group?.name, 160),
      ingredients: items.slice(0, 80).map((item) => {
        ingredientIndex += 1;
        return normalizeIngredient(item, ingredientIndex);
      }),
    };
  });

  const stepGroups = groupList(stepGroupsFrom(source)).map((group, groupIndex) => {
    const items = Array.isArray(group?.steps) ? group.steps : Array.isArray(group) ? group : [];
    return {
      id: `step-group-${groupIndex + 1}`,
      name: cleanString(group?.name, 160),
      steps: items.slice(0, 80).map((item) => {
        stepIndex += 1;
        return normalizeStep(item, stepIndex);
      }),
    };
  });

  const doc = {
    schemaVersion: SCHEMA_VERSION,
    recipe: {
      name: cleanString(source.name, 240) || cleanString(page.title, 240) || "Untitled recipe",
      description: cleanString(source.description, 1200),
      author: cleanString(source.author, 160),
      sourceUrl: page.canonicalUrl || page.url || null,
      language: cleanString(source.language, 40) || cleanString(page.language, 40),
      imageUrls: stringList(source.imageUrls, 8),
      yield: {
        servings: toNumber(source.servings ?? yieldSource.servings ?? yieldSource.amount),
        text: cleanString(source.yieldText ?? yieldSource.text, 160),
      },
      timesMinutes: {
        prep: toNumber(times.prep),
        cook: toNumber(times.cook),
        total: toNumber(times.total),
        rest: toNumber(times.rest),
      },
      cuisine: cleanString(source.cuisine, 80),
      category: cleanString(source.category, 80),
      keywords: stringList(source.keywords),
      diets: stringList(source.diets),
      tags: { seasons: [], meals: [], courses: [], methods: [] },
      equipment: stringList(source.equipment),
      ingredientGroups,
      stepGroups,
      nutrition: normalizeNutrition(source.nutrition),
      notes: stringList(source.notes, 20),
    },
    extraction: {
      extractedAt: new Date().toISOString(),
      method: context.method || "llm",
      provider: context.provider || null,
      model: context.model || null,
      conversionTable: "1",
      pageTitle: cleanString(page.title, 240),
      siteName: cleanString(page.siteName, 120),
      warnings: stringList(context.warnings, 20, 400),
    },
  };
  doc.recipe.tags = normalizeTags(source, doc.recipe);
  return doc;
}

export function finalizeRecipe(partial, context) {
  if (partial?.notRecipe) {
    const reason = cleanString(partial.reason, 240);
    throw new Error(reason || "This page doesn't look like a recipe.");
  }
  const doc = toStandardRecipe(partial, context);
  applyConversions(doc);
  const ingredientCount = doc.recipe.ingredientGroups.reduce((sum, group) => sum + group.ingredients.length, 0);
  const stepCount = doc.recipe.stepGroups.reduce((sum, group) => sum + group.steps.length, 0);
  if (!ingredientCount && !stepCount) {
    throw new Error("This page doesn't look like a recipe.");
  }
  assertStandardShape(doc);
  return doc;
}

const RECIPE_KEYS = ["name", "description", "author", "sourceUrl", "language", "imageUrls", "yield", "timesMinutes", "cuisine", "category", "keywords", "diets", "tags", "equipment", "ingredientGroups", "stepGroups", "nutrition", "notes"];
const TAG_KEYS = ["seasons", "meals", "courses", "methods"];
const YIELD_KEYS = ["servings", "text"];
const TIME_KEYS = ["prep", "cook", "total", "rest"];
const NUTRITION_KEYS = ["servingSizeText", "nutrients"];
const NUTRIENT_KEYS = ["name", "amount", "unit"];
const GROUP_KEYS = ["id", "name", "ingredients"];
const STEP_GROUP_KEYS = ["id", "name", "steps"];
const INGREDIENT_KEYS = ["id", "text", "name", "quantity", "quantityMax", "unit", "unitDimension", "preparation", "optional", "comment", "measures"];
const STEP_KEYS = ["id", "text", "durationMinutes", "durationMinutesMax", "temperature"];
const MEASURES_KEYS = ["asWritten", "metric", "us"];
const WRITTEN_KEYS = ["quantity", "quantityMax", "unit"];
const SIDE_KEYS = ["mass", "volume"];
const MEASURE_KEYS = ["quantity", "quantityMax", "unit", "confidence"];
const TEMPERATURE_KEYS = ["celsius", "fahrenheit"];
const TEMPERATURE_VALUE_KEYS = ["value", "valueMax"];
const EXTRACTION_KEYS = ["extractedAt", "method", "provider", "model", "conversionTable", "pageTitle", "siteName", "warnings"];

function exactKeys(object, keys, label) {
  if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error(`${label} is missing.`);
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (actual.join("|") !== expected.join("|")) {
    throw new Error(`${label} keys are ${actual.join(", ") || "empty"}.`);
  }
}

function isMeasure(value) {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  try {
    exactKeys(value, MEASURE_KEYS, "measure");
  } catch {
    return false;
  }
  return (value.quantity == null || typeof value.quantity === "number")
    && (value.quantityMax == null || typeof value.quantityMax === "number")
    && (value.unit == null || typeof value.unit === "string")
    && (value.confidence === "exact" || value.confidence === "density");
}

export function assertStandardShape(doc) {
  if (doc?.schemaVersion !== SCHEMA_VERSION) throw new Error("Recipe file is missing schemaVersion.");
  exactKeys(doc, ["schemaVersion", "recipe", "extraction"], "recipe file");
  const recipe = doc.recipe;
  exactKeys(recipe, RECIPE_KEYS, "recipe");
  exactKeys(recipe.tags, TAG_KEYS, "tags");
  for (const [key, allowed] of [["seasons", SEASONS], ["meals", MEALS], ["courses", COURSES], ["methods", METHODS]]) {
    if (!Array.isArray(recipe.tags[key]) || recipe.tags[key].some((item) => !allowed.includes(item))) {
      throw new Error(`Recipe ${key} are invalid.`);
    }
  }
  exactKeys(recipe.yield, YIELD_KEYS, "yield");
  exactKeys(recipe.timesMinutes, TIME_KEYS, "times");
  exactKeys(recipe.nutrition, NUTRITION_KEYS, "nutrition");
  if (!Array.isArray(recipe.imageUrls) || !Array.isArray(recipe.keywords) || !Array.isArray(recipe.diets) || !Array.isArray(recipe.equipment) || !Array.isArray(recipe.notes)) {
    throw new Error("Recipe lists are missing.");
  }
  for (const nutrient of recipe.nutrition.nutrients) exactKeys(nutrient, NUTRIENT_KEYS, "nutrient");
  if (!Array.isArray(recipe.ingredientGroups) || !Array.isArray(recipe.stepGroups)) throw new Error("Recipe groups are missing.");
  for (const group of recipe.ingredientGroups) {
    exactKeys(group, GROUP_KEYS, "ingredient group");
    if (!Array.isArray(group.ingredients)) throw new Error("Ingredient group is invalid.");
    for (const ingredient of group.ingredients) {
      exactKeys(ingredient, INGREDIENT_KEYS, "ingredient");
      exactKeys(ingredient.measures, MEASURES_KEYS, "measures");
      exactKeys(ingredient.measures.asWritten, WRITTEN_KEYS, "as written");
      for (const side of [ingredient.measures.metric, ingredient.measures.us]) {
        exactKeys(side, SIDE_KEYS, "measure side");
        if (!isMeasure(side.mass) || !isMeasure(side.volume)) throw new Error("Converted measure is invalid.");
      }
    }
  }
  for (const group of recipe.stepGroups) {
    exactKeys(group, STEP_GROUP_KEYS, "step group");
    if (!Array.isArray(group.steps)) throw new Error("Step group is invalid.");
    for (const step of group.steps) {
      exactKeys(step, STEP_KEYS, "step");
      if (step.temperature) {
        exactKeys(step.temperature, TEMPERATURE_KEYS, "temperature");
        exactKeys(step.temperature.celsius, TEMPERATURE_VALUE_KEYS, "celsius");
        exactKeys(step.temperature.fahrenheit, TEMPERATURE_VALUE_KEYS, "fahrenheit");
      }
    }
  }
  exactKeys(doc.extraction, EXTRACTION_KEYS, "extraction");
  if (!Array.isArray(doc.extraction.warnings)) throw new Error("Extraction warnings are missing.");
  return doc;
}

export { DENSITY_WARNING };
