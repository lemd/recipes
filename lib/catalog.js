import { recipeFilename } from "./format.js";

export function emptyCatalog() {
  return { recipes: [] };
}

export function recipeUrlKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`;
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

export function findCatalogEntry(catalog, url) {
  const key = recipeUrlKey(url);
  if (!key) return null;
  return (catalog?.recipes || []).find((item) => recipeUrlKey(item.sourceUrl) === key) || null;
}

export function catalogEntry(doc) {
  return {
    file: recipeFilename(doc),
    name: doc.recipe.name,
    sourceUrl: doc.recipe.sourceUrl || null,
    extractedAt: doc.extraction.extractedAt,
  };
}

export function upsertEntry(catalog, entry) {
  const current = Array.isArray(catalog?.recipes) ? catalog.recipes : [];
  const recipes = current.filter((item) => item.file !== entry.file && (!entry.sourceUrl || item.sourceUrl !== entry.sourceUrl));
  recipes.push(entry);
  recipes.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
  return { recipes };
}

export function upsertCatalog(catalog, doc) {
  return upsertEntry(catalog, catalogEntry(doc));
}

export function mergeCatalogs(remote, local) {
  let catalog = { recipes: [] };
  for (const item of [...(remote?.recipes || []), ...(local?.recipes || [])]) {
    if (item?.file && item?.name) catalog = upsertEntry(catalog, item);
  }
  return catalog;
}
