import { INGREDIENT_CATALOG } from "./ingredient-catalog.js";

const ALIASES = new Map([
  ["sesame oil", "sesame seed oil"],
  ["toasted sesame oil", "sesame seed oil"],
  ["green onion", "spring onions"],
  ["green onions", "spring onions"],
  ["scallion", "scallions"],
  ["corn starch", "cornstarch"],
  ["hoisin", "hoisin sauce"],
  ["ap flour", "all purpose flour"],
  ["confectioners sugar", "powdered sugar"],
  ["confectioner's sugar", "powdered sugar"],
  ["bell pepper", "red pepper"],
  ["soy", "soy sauce"],
]);

const BY_NAME = new Map(INGREDIENT_CATALOG.map((name) => [normalize(name), name]));

export function ingredientPhotoName(name) {
  const query = normalize(name);
  if (!query) return "";
  const queries = ALIASES.has(query) ? [ALIASES.get(query), query] : [query];
  for (const item of queries) {
    const exact = lookupExact(item);
    if (exact) return exact;
  }
  let best = "";
  let bestLength = 0;
  let bestAt = Infinity;
  for (const item of INGREDIENT_CATALOG) {
    const norm = normalize(item);
    if (norm.length < 3) continue;
    const at = phraseAt(query, norm);
    if (at < 0) continue;
    if (norm.length > bestLength || (norm.length === bestLength && at < bestAt)) {
      best = item;
      bestLength = norm.length;
      bestAt = at;
    }
  }
  return best;
}

export function ingredientPhotoUrl(name) {
  const match = ingredientPhotoName(name);
  if (!match) return "";
  return `https://www.themealdb.com/images/ingredients/${encodeURIComponent(match)}-Small.png`;
}

function lookupExact(query) {
  if (BY_NAME.has(query)) return BY_NAME.get(query);
  if (query.includes(" ")) return "";
  if (!query.endsWith("s") && BY_NAME.has(`${query}s`)) return BY_NAME.get(`${query}s`);
  if (query.endsWith("s") && !query.endsWith("ss")) {
    const singular = query.slice(0, -1);
    if (BY_NAME.has(singular)) return BY_NAME.get(singular);
  }
  return "";
}

function phraseAt(haystack, needle) {
  return ` ${haystack} `.indexOf(` ${needle} `);
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
