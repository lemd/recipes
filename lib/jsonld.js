import { parseIngredientLine } from "./parse-ingredient.js";

const DIETS = {
  vegandiet: "vegan",
  vegetariandiet: "vegetarian",
  glutenfreediet: "gluten-free",
  lowcaloriediet: "low-calorie",
  lowfatdiet: "low-fat",
  lowlactosediet: "low-lactose",
  lowsaltdiet: "low-salt",
  diabeticdiet: "diabetic",
  halaldiet: "halal",
  hindudiet: "hindu",
  kosherdiet: "kosher",
};

export function parseIsoDuration(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return null;
  const match = String(value).trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!match || (!match[1] && !match[2] && !match[3] && !match[4])) return null;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);
  return days * 1440 + hours * 60 + minutes + Math.round(seconds / 60);
}

function minutesFrom(value) {
  const iso = parseIsoDuration(value);
  if (iso != null) return iso;
  if (value == null) return null;
  const text = String(value);
  const hours = text.match(/(\d+(?:\.\d+)?)\s*hours?/i);
  const mins = text.match(/(\d+(?:\.\d+)?)\s*min/i);
  if (!hours && !mins) return null;
  return (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0);
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function looseSteps(value) {
  const clean = stripTags(value);
  if (!clean) return [];
  const lines = clean.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const base = lines.length > 1 ? lines : [clean];
  const steps = [];
  for (const line of base) {
    const numbered = line.split(/\s(?=\d+\.\s)/).map((part) => part.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
    steps.push(...(numbered.length > 1 ? numbered : [line.replace(/^\d+\.\s*/, "").trim()].filter(Boolean)));
  }
  return steps;
}

function stepText(node) {
  if (typeof node === "string") return stripTags(node);
  if (!node || typeof node !== "object") return "";
  return stripTags(node.text || node.name || "");
}

function typesOf(node) {
  const type = node?.["@type"];
  return (Array.isArray(type) ? type : type ? [type] : []).map((item) => String(item).toLowerCase());
}

export function instructionGroups(value) {
  const groups = [];

  const addLoose = (node) => {
    const texts = typeof node === "string" ? looseSteps(node) : [stepText(node)].filter(Boolean);
    if (!texts.length) return;
    let group = groups.find((item) => item.name == null);
    if (!group) {
      group = { name: null, steps: [] };
      groups.push(group);
    }
    for (const text of texts) group.steps.push({ text });
  };

  const visit = (node) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === "string") {
      addLoose(node);
      return;
    }
    if (typeof node !== "object") return;
    if (typesOf(node).some((type) => type.includes("howtosection"))) {
      const group = { name: node.name || null, steps: [] };
      const items = Array.isArray(node.itemListElement) ? node.itemListElement : [];
      for (const item of items) {
        const text = stepText(item);
        if (text) group.steps.push({ text });
      }
      if (group.steps.length) groups.push(group);
      return;
    }
    if (Array.isArray(node.itemListElement) && !node.text) {
      visit(node.itemListElement);
      return;
    }
    addLoose(node);
  };

  visit(value);
  return groups;
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function personName(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return personName(value[0]);
  if (typeof value === "object") return value.name || null;
  return null;
}

function imageUrls(value, out = []) {
  if (!value) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => imageUrls(item, out));
    return out;
  }
  if (typeof value === "object") {
    if (typeof value.url === "string") out.push(value.url);
    else if (Array.isArray(value.url)) imageUrls(value.url, out);
  }
  return out;
}

function yieldParts(value) {
  if (value == null) return { servings: null, yieldText: null };
  const text = asArray(value).map((item) => stripTags(item)).filter(Boolean).join(", ");
  if (!text) return { servings: null, yieldText: null };
  const match = text.match(/(\d+(?:\.\d+)?)/);
  const servings = match && (/serv/i.test(text) || /^\d+(?:\.\d+)?$/.test(text.trim())) ? Number(match[1]) : null;
  return { servings, yieldText: text };
}

function keywordsOf(value) {
  if (Array.isArray(value)) return value.flatMap((item) => keywordsOf(item));
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function dietsOf(value) {
  return asArray(value).map((item) => {
    const text = String(item || "");
    const slug = text.split("/").pop().toLowerCase();
    return DIETS[slug] || null;
  }).filter(Boolean);
}

function joinValue(value) {
  const parts = asArray(value).map((item) => stripTags(item)).filter(Boolean);
  return parts[0] || null;
}

function nutrient(name, value) {
  if (value == null || value === "") return null;
  const match = String(value).replace(/,/g, "").match(/(-?\d+(?:\.\d+)?)\s*([a-zA-Z%µ]+)?/);
  if (!match) return { name, amount: null, unit: null };
  return { name, amount: Number(match[1]), unit: match[2] || null };
}

function nutritionOf(nutrition) {
  if (!nutrition || typeof nutrition !== "object") return { servingSizeText: null, nutrients: [] };
  const fields = [
    ["calories", "calories"],
    ["fatContent", "fat"],
    ["saturatedFatContent", "saturated fat"],
    ["transFatContent", "trans fat"],
    ["carbohydrateContent", "carbohydrates"],
    ["sugarContent", "sugar"],
    ["fiberContent", "fiber"],
    ["proteinContent", "protein"],
    ["sodiumContent", "sodium"],
    ["cholesterolContent", "cholesterol"],
  ];
  return {
    servingSizeText: nutrition.servingSize ? stripTags(nutrition.servingSize) : null,
    nutrients: fields.map(([key, name]) => nutrient(name, nutrition[key])).filter(Boolean),
  };
}

function ingredientFrom(value) {
  if (typeof value === "string") return parseIngredientLine(value);
  if (!value || typeof value !== "object") return null;
  const text = stripTags(value.text || value.description || value.name || "");
  if (value.name && (value.amount != null || value.unit)) {
    return {
      text: text || [value.amount, value.unit, value.name].filter(Boolean).join(" "),
      name: value.name,
      quantity: value.amount ?? value.quantity ?? null,
      quantityMax: value.amountMax ?? null,
      unit: value.unit || null,
      preparation: value.preparation || null,
      optional: Boolean(value.optional),
      comment: value.comment || null,
    };
  }
  return text ? parseIngredientLine(text) : null;
}

export function partialFromStructured(node) {
  if (!node || typeof node !== "object") return null;
  const ingredients = asArray(node.recipeIngredient).map(ingredientFrom).filter((item) => item && (item.name || item.text));
  const stepGroups = instructionGroups(node.recipeInstructions);
  if (!ingredients.length && !stepGroups.length) return null;
  const yieldInfo = yieldParts(node.recipeYield);
  const category = asArray(node.recipeCategory).map((item) => stripTags(item)).filter(Boolean);
  return {
    name: stripTags(node.name || ""),
    description: stripTags(node.description || ""),
    author: personName(node.author),
    imageUrls: imageUrls(node.image).slice(0, 8),
    servings: yieldInfo.servings,
    yieldText: yieldInfo.yieldText,
    times: {
      prep: minutesFrom(node.prepTime),
      cook: minutesFrom(node.cookTime),
      total: minutesFrom(node.totalTime),
      rest: minutesFrom(node.performTime),
    },
    cuisine: joinValue(node.recipeCuisine),
    category: category[0] || null,
    keywords: [...category.slice(1), ...keywordsOf(node.keywords)],
    diets: dietsOf(node.suitableForDiet),
    equipment: asArray(node.tool).map((item) => (typeof item === "string" ? item : item?.name)).filter(Boolean),
    ingredientGroups: ingredients.length ? [{ name: null, ingredients }] : [],
    stepGroups,
    nutrition: nutritionOf(node.nutrition),
    notes: [],
  };
}

function score(partial) {
  const ingredients = partial.ingredientGroups.reduce((sum, group) => sum + group.ingredients.length, 0);
  const steps = partial.stepGroups.reduce((sum, group) => sum + group.steps.length, 0);
  return ingredients * 2 + steps;
}

export function bestStructuredRecipe(nodes) {
  const recipes = (nodes || []).map(partialFromStructured).filter(Boolean);
  recipes.sort((a, b) => score(b) - score(a));
  return recipes[0] || null;
}
