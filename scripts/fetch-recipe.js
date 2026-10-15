import fs from "node:fs";
import path from "node:path";
import { findCatalogEntry, upsertCatalog } from "../lib/catalog.js";
import { settingsFromEnv } from "../lib/env.js";
import { fetchRecipePage } from "../lib/fetch-html.js";
import { recipeFilename } from "../lib/format.js";
import { makeRecipe } from "../lib/make-recipe.js";

const url = process.argv[2];
if (!url || !/^https?:\/\//i.test(url)) {
  console.error("Pass an http or https recipe URL.");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const indexPath = path.join(root, "recipes", "index.json");
const catalog = fs.existsSync(indexPath)
  ? JSON.parse(fs.readFileSync(indexPath, "utf8"))
  : { recipes: [] };

if (findCatalogEntry(catalog, url)) {
  console.log("Already saved.");
  process.exit(0);
}

const settings = settingsFromEnv(process.env, {});
const page = await fetchRecipePage(url);
const doc = await makeRecipe(page, settings);
const file = recipeFilename(doc);
fs.mkdirSync(path.join(root, "recipes"), { recursive: true });
fs.writeFileSync(path.join(root, "recipes", file), `${JSON.stringify(doc, null, 2)}\n`);
fs.writeFileSync(indexPath, `${JSON.stringify(upsertCatalog(catalog, doc), null, 2)}\n`);
console.log(`Saved recipes/${file}`);
