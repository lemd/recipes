export const SEASONS = ["spring", "summer", "fall", "winter"];
export const MEALS = ["breakfast", "brunch", "lunch", "dinner", "snack"];
export const COURSES = ["appetizer", "main", "side", "soup", "salad", "dessert", "drink", "bread"];
export const METHODS = ["bake", "grill", "stovetop", "no-cook", "slow", "one-pot"];

const TAG_KEYS = ["seasons", "meals", "courses", "methods"];
const ALLOWED = { seasons: SEASONS, meals: MEALS, courses: COURSES, methods: METHODS };

const LABELS = { grill: "BBQ" };

export function tagLabel(value) {
  return LABELS[value] || value;
}

export function assignTags(recipe = {}) {
  const head = [recipe.name, recipe.category, recipe.cuisine, ...(recipe.keywords || [])].filter(Boolean).join(" ");
  const steps = (recipe.stepGroups || [])
    .flatMap((group) => [group?.name, ...(group?.steps || []).map((step) => step?.text)])
    .filter(Boolean)
    .join(" ");
  const courses = [];
  const seasons = [];
  const meals = [];
  const methods = [];

  if (has(head, "appetizer", "starter")) add(courses, "appetizer");
  if (has(head, "side dish") || has(head, "side")) add(courses, "side");
  if (has(head, "main course", "main dish", "entree", "entrée")) add(courses, "main");
  if (has(head, "soup", "chowder", "stew", "chili", "bisque")) add(courses, "soup");
  if (has(head, "salad")) add(courses, "salad");
  if (has(head, "pot pie", "potpie")) add(courses, "main");
  else if (has(head, "dessert", "cookie", "cake", "brownie", "pie", "ice cream", "pudding")) add(courses, "dessert");
  if (has(head, "smoothie", "cocktail", "lemonade")) add(courses, "drink");
  if (has(head, "bread", "biscuit")) add(courses, "bread");

  const summerDish = has(head, "salad", "bbq", "barbecue", "grill", "grilled", "salsa", "gazpacho", "slaw", "coleslaw", "popsicle", "ice cream", "summer");
  const winterDish = has(head, "soup", "chowder", "stew", "chili", "bisque", "gratin", "casserole", "pot roast", "pot pie", "potpie", "winter");
  if (has(head, "spring")) add(seasons, "spring");
  if (summerDish) add(seasons, "summer");
  if (has(head, "pumpkin", "squash", "thanksgiving", "fall", "autumn")) add(seasons, "fall");
  if (winterDish && !summerDish) add(seasons, "winter");

  if (has(head, "breakfast", "pancake", "waffle", "oatmeal", "granola", "french toast", "omelette", "omelet", "eggs")) add(meals, "breakfast");
  if (has(head, "brunch")) add(meals, "brunch");
  if (has(head, "lunch") || courses.includes("salad")) add(meals, "lunch");
  if (has(head, "dinner", "supper")) add(meals, "dinner");
  if (has(head, "snack") || courses.includes("dessert")) add(meals, "snack");
  if (!meals.length && (courses.includes("main") || courses.includes("soup") || courses.includes("side"))) add(meals, "dinner");

  if (has(head, "grill", "grilled", "bbq", "barbecue") || has(steps, "grill", "grilled", "bbq", "barbecue")) {
    add(methods, "grill");
    add(seasons, "summer");
    const winterAt = seasons.indexOf("winter");
    if (winterAt >= 0) seasons.splice(winterAt, 1);
  }
  if (has(head, "bake", "oven", "roast", "gratin") || has(steps, "bake", "oven")) add(methods, "bake");
  if (has(head, "stir-fry", "stir fry", "stir-fried", "stir fried", "skillet", "saute", "sauté", "saucepan", "stovetop")
    || (has(steps, "stir-fry", "stir fry", "stir-fried", "stir fried", "skillet", "saute", "sauté", "saucepan") && !methods.includes("bake") && !methods.includes("grill"))) {
    add(methods, "stovetop");
  }
  if (has(head, "no-cook", "no cook") || has(steps, "no-cook", "no cook")) add(methods, "no-cook");
  if (has(`${head} ${steps}`, "slow cooker", "crockpot", "crock pot")) add(methods, "slow");
  if (has(`${head} ${steps}`, "one-pot", "one pot", "sheet pan", "sheet-pan")) add(methods, "one-pot");

  return { seasons, meals, courses, methods };
}

export function normalizeTags(source, recipe) {
  const inferred = assignTags(recipe);
  const given = source?.tags && typeof source.tags === "object" ? source.tags : {};
  const tags = {};
  for (const key of TAG_KEYS) {
    const picked = [];
    for (const item of [...asList(given[key]), ...inferred[key]]) {
      const value = String(item || "").trim().toLowerCase();
      if (ALLOWED[key].includes(value) && !picked.includes(value)) picked.push(value);
    }
    tags[key] = picked;
  }
  if (tags.seasons.includes("summer") && tags.seasons.includes("winter")) {
    tags.seasons = tags.seasons.filter((item) => item !== "winter");
  }
  return tags;
}

export function visibleTags(recipe = {}) {
  const stored = recipe.tags;
  const tags = stored && TAG_KEYS.some((key) => Array.isArray(stored[key]) && stored[key].length)
    ? stored
    : assignTags(recipe);
  return TAG_KEYS.flatMap((key) => (Array.isArray(tags[key]) ? tags[key] : []).map((value) => ({
    value,
    label: tagLabel(value),
  })));
}

function add(list, value) {
  if (!list.includes(value)) list.push(value);
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",");
  return [];
}

function has(text, ...terms) {
  const source = String(text || "").toLowerCase();
  return terms.some((term) => {
    const pattern = String(term).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, "i").test(source);
  });
}
