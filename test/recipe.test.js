import assert from "node:assert/strict";
import test from "node:test";
import { findCatalogEntry, mergeCatalogs, recipeUrlKey, upsertCatalog } from "../lib/catalog.js";
import { parseEnv, resolveSettings, settingsFromEnv } from "../lib/env.js";
import { pageFromHtml } from "../lib/fetch-html.js";
import { exchangeManifestCode, githubAppManifest, parseGithubToken } from "../lib/github-auth.js";
import { assignTags, normalizeTags } from "../lib/tags.js";
import { decodeBase64Utf8, parseGithubRepo, pushRecipe, utf8Base64 } from "../lib/github.js";
import { publishRecipe, saveStatus } from "../lib/publish.js";
import { extractPage } from "../lib/extract-page.js";
import { formatMeasure, ingredientLines, preferredMeasure, recipeFilename, scaleIngredient, tidyStepText } from "../lib/format.js";
import { ingredientPhotoName, ingredientPhotoUrl } from "../lib/ingredient-photo.js";
import { bestStructuredRecipe, parseIsoDuration } from "../lib/jsonld.js";
import { parseIngredientLine } from "../lib/parse-ingredient.js";
import { buildMessages } from "../lib/prompt.js";
import { parseModelJson } from "../lib/providers.js";
import { shouldRetryModel } from "../lib/retry.js";
import { assertStandardShape, finalizeRecipe } from "../lib/schema.js";
import { buildMeasures, interpretUnit } from "../lib/units.js";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

const page = {
  url: "https://example.com/soup",
  canonicalUrl: "https://example.com/soup",
  title: "Weeknight soup",
  siteName: "Example",
  language: "en",
  truncated: false,
};

test("converts cups of flour to grams and milliliters", () => {
  const result = buildMeasures({ name: "all-purpose flour", quantity: 2, quantityMax: null, unit: "cup" });
  assert.equal(result.measures.metric.mass.quantity, 250);
  assert.equal(result.measures.metric.mass.unit, "g");
  assert.equal(result.measures.metric.mass.confidence, "density");
  assert.equal(result.measures.metric.volume.quantity, 473);
  assert.equal(result.measures.metric.volume.unit, "ml");
  assert.equal(result.measures.metric.volume.confidence, "exact");
  assert.equal(result.measures.us.volume.quantity, 2);
  assert.equal(result.measures.us.volume.unit, "cup");
  assert.equal(result.measures.us.volume.confidence, "exact");
  assert.equal(result.measures.us.mass.unit, "oz");
  assert.equal(result.measures.us.mass.confidence, "density");
});

test("converts a range of cups", () => {
  const result = buildMeasures({ name: "all-purpose flour", quantity: 1, quantityMax: 2, unit: "cup" });
  assert.deepEqual(
    [result.measures.metric.mass.quantity, result.measures.metric.mass.quantityMax],
    [125, 250],
  );
});

test("converts pounds exactly and leaves unknown foods without a volume", () => {
  const result = buildMeasures({ name: "chicken thighs", quantity: 1, quantityMax: null, unit: "lb" });
  assert.equal(result.measures.metric.mass.quantity, 454);
  assert.equal(result.measures.metric.mass.unit, "g");
  assert.equal(result.measures.metric.mass.confidence, "exact");
  assert.equal(result.measures.us.mass.quantity, 1);
  assert.equal(result.measures.us.mass.unit, "lb");
  assert.equal(result.measures.metric.volume, null);
  assert.equal(result.measures.us.volume, null);
});

test("converts sugar by weight back into cups", () => {
  const result = buildMeasures({ name: "granulated sugar", quantity: 200, quantityMax: null, unit: "g" });
  assert.equal(result.measures.metric.mass.quantity, 200);
  assert.equal(result.measures.metric.mass.confidence, "exact");
  assert.equal(result.measures.us.volume.quantity, 1);
  assert.equal(result.measures.us.volume.unit, "cup");
  assert.equal(result.measures.us.volume.confidence, "density");
  assert.equal(result.measures.metric.volume.quantity, 237);
});

test("converts a tablespoon of water both ways", () => {
  const result = buildMeasures({ name: "water", quantity: 1, quantityMax: null, unit: "tbsp" });
  assert.equal(result.measures.metric.volume.quantity, 14.8);
  assert.equal(result.measures.metric.mass.quantity, 14.8);
  assert.equal(result.measures.metric.mass.confidence, "density");
});

test("treats a butter stick as a defined weight", () => {
  const result = buildMeasures({ name: "unsalted butter", quantity: 1, quantityMax: null, unit: "stick" });
  assert.equal(result.measures.metric.mass.quantity, 113);
  assert.equal(result.measures.metric.mass.confidence, "exact");
  assert.equal(result.measures.us.volume.quantity, 0.5);
  assert.equal(result.measures.us.volume.unit, "cup");
  assert.equal(result.measures.us.mass.quantity, 4);
  assert.equal(result.measures.us.mass.unit, "oz");
});

test("does not invent a weight for kosher salt or cup measures of salt", () => {
  const kosher = buildMeasures({ name: "kosher salt", quantity: 1, quantityMax: null, unit: "tsp" });
  assert.equal(kosher.measures.metric.mass, null);
  const cups = buildMeasures({ name: "table salt", quantity: 1, quantityMax: null, unit: "cup" });
  assert.equal(cups.measures.metric.mass, null);
  assert.equal(cups.skippedSalt, true);
  assert.equal(cups.measures.metric.volume.unit, "ml");
});

test("converts a teaspoon of table salt", () => {
  const result = buildMeasures({ name: "table salt", quantity: 1, quantityMax: null, unit: "tsp" });
  assert.equal(result.measures.metric.mass.quantity, 6.1);
  assert.equal(result.measures.metric.mass.unit, "g");
});

test("leaves unrecognized units as written", () => {
  const result = buildMeasures({ name: "olive oil", quantity: 1, quantityMax: null, unit: "glug" });
  assert.equal(result.unknownUnit, true);
  assert.equal(result.measures.metric.mass, null);
  assert.equal(result.measures.metric.volume, null);
  assert.equal(result.measures.asWritten.unit, "glug");
});

test("canonicalizes unit synonyms", () => {
  assert.equal(interpretUnit("grams").code, "g");
  assert.equal(interpretUnit("Cups").code, "cup");
  assert.equal(interpretUnit("fl. oz.").code, "fl_oz");
  assert.equal(interpretUnit("").code, null);
});

test("parses common ingredient lines", () => {
  assert.deepEqual(parseIngredientLine("1 1/2 cups all-purpose flour"), {
    text: "1 1/2 cups all-purpose flour",
    name: "all-purpose flour",
    quantity: 1.5,
    quantityMax: null,
    unit: "cup",
    preparation: null,
    optional: false,
    comment: null,
    stated: [],
  });
  assert.equal(parseIngredientLine("2 tablespoons olive oil").unit, "tbsp");
  assert.equal(parseIngredientLine("¾ tsp kosher salt").quantity, 0.75);
  assert.equal(parseIngredientLine("¾ tsp kosher salt").unit, "tsp");
  const can = parseIngredientLine("1 (14 ounce) can diced tomatoes");
  assert.equal(can.quantity, 1);
  assert.equal(can.unit, "can");
  assert.equal(can.name, "diced tomatoes");
  assert.equal(can.comment, null);
  assert.equal(can.stated[0].quantity, 14);
  assert.equal(can.stated[0].unit, "oz");
  const taste = parseIngredientLine("Salt, to taste");
  assert.equal(taste.name, "Salt");
  assert.equal(taste.quantity, null);
  assert.equal(taste.comment, "to taste");
  const eggs = parseIngredientLine("2 large eggs, beaten");
  assert.equal(eggs.quantity, 2);
  assert.equal(eggs.unit, null);
  assert.equal(eggs.name, "large eggs");
  assert.equal(eggs.preparation, "beaten");
  const garlic = parseIngredientLine("1-2 cloves garlic, minced");
  assert.equal(garlic.quantity, 1);
  assert.equal(garlic.quantityMax, 2);
  assert.equal(garlic.unit, "clove");
  assert.equal(garlic.preparation, "minced");
  const sized = parseIngredientLine("One 14-ounce can of diced tomatoes");
  assert.equal(sized.quantity, 1);
  assert.equal(sized.unit, "can");
  assert.equal(sized.name, "diced tomatoes");
  assert.equal(sized.stated[0].quantity, 14);
  assert.equal(sized.stated[0].unit, "oz");
  const salmon = parseIngredientLine("8-ounce salmon fillet");
  assert.equal(salmon.quantity, null);
  assert.equal(salmon.stated[0].quantity, 8);
  assert.equal(salmon.stated[0].unit, "oz");
  assert.equal(salmon.name, "salmon fillet");
  assert.equal(parseIngredientLine("a pinch of salt").unit, "pinch");
});

test("normalizes embedded recipe data into the standard file", () => {
  const partial = bestStructuredRecipe([{
    "@type": "Recipe",
    name: "Tomato soup",
    description: "A <em>simple</em> soup",
    author: { "@type": "Person", name: "Ada" },
    recipeYield: "4 servings",
    prepTime: "PT15M",
    cookTime: "PT30M",
    recipeIngredient: ["2 cups water", "1 tsp table salt"],
    recipeInstructions: [
      { "@type": "HowToSection", name: "Soup", itemListElement: [
        { "@type": "HowToStep", text: "Boil for 10 minutes." },
        { "@type": "HowToStep", text: "Simmer at 180°C." },
      ] },
    ],
    suitableForDiet: "https://schema.org/VeganDiet",
    nutrition: { calories: "120 kcal", servingSize: "1 bowl" },
  }]);
  const doc = finalizeRecipe(partial, { page, method: "structured-data", warnings: [] });
  assert.equal(doc.schemaVersion, "1.0.0");
  assert.equal(doc.recipe.name, "Tomato soup");
  assert.equal(doc.recipe.description, "A simple soup");
  assert.equal(doc.recipe.author, "Ada");
  assert.equal(doc.recipe.yield.servings, 4);
  assert.equal(doc.recipe.timesMinutes.prep, 15);
  assert.equal(doc.recipe.timesMinutes.cook, 30);
  assert.equal(doc.recipe.ingredientGroups[0].ingredients[0].measures.metric.volume.quantity, 473);
  assert.equal(doc.recipe.ingredientGroups[0].ingredients[1].measures.metric.mass.quantity, 6.1);
  assert.equal(doc.recipe.stepGroups[0].name, "Soup");
  assert.equal(doc.recipe.stepGroups[0].steps[0].durationMinutes, 10);
  assert.equal(doc.recipe.stepGroups[0].steps[1].temperature.celsius.value, 180);
  assert.equal(doc.recipe.stepGroups[0].steps[1].temperature.fahrenheit.value, 356);
  assert.deepEqual(doc.recipe.diets, ["vegan"]);
  assert.deepEqual(doc.recipe.tags.seasons, ["winter"]);
  assert.deepEqual(doc.recipe.tags.courses, ["soup"]);
  assert.deepEqual(doc.recipe.tags.meals, ["dinner"]);
  assert.equal(doc.recipe.nutrition.nutrients[0].amount, 120);
  assert.equal(parseIsoDuration("PT1H30M"), 90);
});

test("keeps the same ingredient and recipe keys for sparse and rich recipes", () => {
  const sparse = finalizeRecipe({
    name: "Eggs",
    ingredients: ["2 large eggs"],
    steps: ["Cook."],
  }, { page, method: "llm", provider: "openrouter", model: "test" });
  const rich = finalizeRecipe({
    name: "Cake",
    servings: "8",
    yieldText: "8 servings",
    times: { prep: 10, cook: "20", total: 30, rest: null },
    ingredientGroups: [{ name: "Batter", ingredients: [{ text: "1 1/2 cups flour", name: "flour", quantity: "1 1/2", unit: "cups" }] }],
    stepGroups: [{ name: "Bake", steps: [{ text: "Bake at 350°F for 25 minutes.", temperature: { value: 350, unit: "F" } }] }],
    nutrition: { servingSizeText: "1 slice", nutrients: [{ name: "calories", amount: "200", unit: "kcal" }] },
  }, { page, method: "llm", provider: "openrouter", model: "test" });

  assert.deepEqual(Object.keys(sparse.recipe), Object.keys(rich.recipe));
  assert.deepEqual(
    Object.keys(sparse.recipe.ingredientGroups[0].ingredients[0]),
    Object.keys(rich.recipe.ingredientGroups[0].ingredients[0]),
  );
  assert.deepEqual(
    Object.keys(sparse.recipe.ingredientGroups[0].ingredients[0].measures),
    ["asWritten", "metric", "us"],
  );
  assert.equal(rich.recipe.ingredientGroups[0].ingredients[0].quantity, 1.5);
  assert.equal(rich.recipe.ingredientGroups[0].ingredients[0].measures.metric.mass.quantity, 188);
  assert.equal(rich.recipe.stepGroups[0].steps[0].temperature.fahrenheit.value, 350);
  assert.equal(rich.recipe.stepGroups[0].steps[0].temperature.celsius.value, 177);
  assert.equal(rich.recipe.stepGroups[0].steps[0].durationMinutes, 25);
  assert.equal(recipeFilename(rich), "cake.json");
});

test("rejects a page that is not a recipe", () => {
  assert.throws(() => finalizeRecipe({ notRecipe: true, reason: "This is a news article." }, { page }), /news article/);
  assert.throws(() => finalizeRecipe({ name: "Nothing" }, { page }), /doesn't look like a recipe/);
});

test("cookie yield stays in the yield text", () => {
  const partial = bestStructuredRecipe([{
    "@type": "Recipe",
    name: "Cookies",
    recipeYield: "24 cookies",
    recipeIngredient: ["1 cup sugar"],
    recipeInstructions: ["Bake."],
  }]);
  const doc = finalizeRecipe(partial, { page, method: "structured-data" });
  assert.equal(doc.recipe.yield.servings, null);
  assert.equal(doc.recipe.yield.text, "24 cookies");
});

test("reads recipe JSON-LD out of a page", () => {
  const script = {
    textContent: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [{
        "@type": "Recipe",
        name: "Soup",
        recipeIngredient: ["1 cup water"],
        recipeInstructions: ["Boil."],
      }],
    }),
  };
  const doc = {
    title: "Soup recipe",
    location: { href: "https://example.com/soup" },
    documentElement: { lang: "en" },
    body: {
      cloneNode() {
        return { querySelectorAll() { return []; }, textContent: "Soup\n1 cup water\nBoil." };
      },
    },
    querySelector(selector) {
      if (selector === 'link[rel="canonical"]') return { href: "https://example.com/soup", getAttribute: () => "https://example.com/soup" };
      if (selector === 'meta[property="og:site_name"]') return { getAttribute: () => "Example" };
      if (selector === 'meta[name="description"]') return { getAttribute: () => "A soup" };
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'script[type="application/ld+json"]') return [script];
      return [];
    },
  };
  const extracted = extractPage(doc);
  assert.equal(extracted.title, "Soup recipe");
  assert.equal(extracted.structured.length, 1);
  assert.equal(extracted.structured[0].name, "Soup");
  assert.match(extracted.text, /Boil/);
  const recipe = bestStructuredRecipe(extracted.structured);
  assert.equal(recipe.ingredientGroups[0].ingredients[0].unit, "cup");
});

test("asks the model for the original units and sends article text", () => {
  const built = buildMessages({
    url: "https://example.com/soup",
    canonicalUrl: "https://example.com/soup",
    title: "Soup",
    siteName: "Example",
    language: "en",
    description: "A soup",
    text: "Boil 1 cup of water.",
    structured: [{ "@type": "Recipe", name: "Soup" }],
  });
  assert.match(built.messages[0].content, /Do not convert/);
  assert.match(built.messages[0].content, /Grandma's/);
  assert.match(built.messages[0].content, /clove/);
  assert.match(built.messages[0].content, /winter/);
  assert.match(built.messages[0].content, /own line/);
  assert.match(built.messages[1].content, /https:\/\/example.com\/soup/);
  assert.match(built.messages[1].content, /Boil 1 cup of water/);
  assert.equal(built.usedStructuredHint, true);
  assert.doesNotMatch(built.messages[1].content, /<html/);
});

test("parses fenced model JSON", () => {
  const parsed = parseModelJson("```json\n{\"name\":\"Soup\",\"notRecipe\":false}\n```");
  assert.equal(parsed.name, "Soup");
});

test("prefers a weight printed on the page over a density estimate", () => {
  const flour = parseIngredientLine("2 cups (240g) King Arthur Unbleached All-Purpose Flour");
  const flourMeasures = buildMeasures(flour);
  assert.equal(flourMeasures.measures.metric.mass.quantity, 240);
  assert.equal(flourMeasures.measures.metric.mass.unit, "g");
  assert.equal(flourMeasures.measures.metric.mass.confidence, "exact");
  assert.equal(flourMeasures.usedDensity, false);
  assert.equal(flourMeasures.measures.us.volume.quantity, 2);

  const sugar = parseIngredientLine("2/3 cup (142g) light brown sugar, packed");
  assert.equal(sugar.quantity, 0.6667);
  assert.equal(sugar.preparation, "packed");
  assert.equal(sugar.stated[0].quantity, 142);
  const sugarMeasures = buildMeasures(sugar);
  assert.equal(sugarMeasures.measures.metric.mass.quantity, 142);
  assert.equal(sugarMeasures.measures.metric.mass.confidence, "exact");

  const butter = parseIngredientLine("8 tablespoons (113g) unsalted butter");
  assert.equal(buildMeasures(butter).measures.metric.mass.quantity, 113);

  const canMeasures = buildMeasures(parseIngredientLine("1 (14 ounce) can diced tomatoes"));
  assert.equal(canMeasures.measures.us.mass.quantity, 14);
  assert.equal(canMeasures.measures.us.mass.unit, "oz");
  assert.equal(canMeasures.measures.metric.mass.quantity, 397);
  assert.equal(canMeasures.measures.metric.mass.confidence, "exact");
});

test("keeps a spoon measure when the ounce weight rounds to nothing", () => {
  const sugar = {
    name: "sugar",
    preparation: null,
    optional: false,
    measures: {
      asWritten: { quantity: 0.25, quantityMax: null, unit: "tsp" },
      us: {
        mass: { quantity: 0, quantityMax: null, unit: "oz", confidence: "density" },
        volume: { quantity: 0.25, quantityMax: null, unit: "tsp", confidence: "exact" },
      },
    },
  };
  const oil = {
    name: "oil",
    preparation: null,
    optional: false,
    measures: {
      asWritten: { quantity: 1, quantityMax: null, unit: "tbsp" },
      us: {
        mass: { quantity: 0.5, quantityMax: null, unit: "oz", confidence: "density" },
        volume: { quantity: 1, quantityMax: null, unit: "tbsp", confidence: "exact" },
      },
    },
  };
  assert.equal(formatMeasure(preferredMeasure(sugar, "us")), "1/4 tsp");
  assert.equal(formatMeasure(preferredMeasure(oil, "us")), "1 tbsp");
  assert.equal(formatMeasure({ quantity: 9.9, quantityMax: null, unit: "oz", confidence: "exact" }), "10 oz");
});

test("spaces joined sentences and drops step markup", () => {
  assert.equal(
    tidyStepText("wash and dry all produce.Heat Guide (dbl each measurement for 4 ppll): mild! Cut mushrooms."),
    "wash and dry all produce. Heat Guide (double each measurement for 4 people): mild! Cut mushrooms.",
  );
  assert.equal(tidyStepText("until no pink remains, 4-5 min.** Stir in cabbage."), "until no pink remains, 4-5 min. Stir in cabbage.");
});

test("formats converted amounts for display", () => {
  const doc = finalizeRecipe({
    name: "Flour",
    ingredients: ["1 1/2 cups all-purpose flour"],
    steps: ["Stir."],
  }, { page, method: "structured-data" });
  const ingredient = doc.recipe.ingredientGroups[0].ingredients[0];
  assert.equal(formatMeasure(ingredient.measures.us.volume), "1 1/2 cups");
  const lines = ingredientLines(ingredient, "metric");
  assert.match(lines.primary, /^188 g all-purpose flour/);
  assert.equal(lines.approximate, true);
  assert.equal(ingredientLines(ingredient, "original").primary, "1 1/2 cups all-purpose flour");
  const us = ingredientLines(ingredient, "us");
  assert.match(us.primary, /oz · 1 1\/2 cups all-purpose flour/);
  const pinch = finalizeRecipe({
    name: "Salt",
    ingredients: ["1 tsp salt"],
    steps: ["Add."],
  }, { page, method: "structured-data" });
  assert.doesNotMatch(ingredientLines(pinch.recipe.ingredientGroups[0].ingredients[0], "us").primary, /cup/);
});

test("cleans a messy model response into the standard shape", () => {
  const doc = finalizeRecipe({
    name: "  Soup  ",
    extra: true,
    servings: "4",
    times: { prep: "15", cook: "nope" },
    ingredients: [
      { name: "flour", quantity: "1 1/2", unit: "cups", extra: true, text: "1 1/2 cups flour" },
      "1 tsp salt",
    ],
    instructions: "Boil.\nSimmer 10 minutes.",
    nutrition: { calories: "10 kcal" },
  }, { page, method: "llm", provider: "openrouter", model: "test" });
  assertStandardShape(doc);
  assert.equal(doc.recipe.name, "Soup");
  assert.equal(doc.recipe.yield.servings, 4);
  assert.equal(doc.recipe.timesMinutes.prep, 15);
  assert.equal(doc.recipe.timesMinutes.cook, null);
  assert.equal(doc.recipe.ingredientGroups[0].ingredients.length, 2);
  assert.equal(doc.recipe.ingredientGroups[0].ingredients[0].quantity, 1.5);
  assert.equal("extra" in doc.recipe, false);
  assert.equal("extra" in doc.recipe.ingredientGroups[0].ingredients[0], false);
  assert.equal(doc.recipe.stepGroups[0].steps.length, 2);
  assert.equal(doc.recipe.stepGroups[0].steps[1].durationMinutes, 10);
  assert.equal(doc.recipe.nutrition.nutrients.length, 0);
});

test("replaces a saved recipe with the same source", () => {
  const first = finalizeRecipe({ name: "Soup", ingredients: ["1 cup water"], steps: ["Boil."] }, { page, method: "llm" });
  const second = finalizeRecipe({ name: "Soup again", ingredients: ["2 cups water"], steps: ["Simmer."] }, { page, method: "llm" });
  const catalog = upsertCatalog(upsertCatalog({ recipes: [] }, first), second);
  assert.equal(catalog.recipes.length, 1);
  assert.equal(catalog.recipes[0].name, "Soup again");
  assert.equal(catalog.recipes[0].sourceUrl, page.canonicalUrl);
});

test("matches ingredient names to produce photos", () => {
  assert.equal(ingredientPhotoName("garlic cloves"), "Garlic");
  assert.equal(ingredientPhotoName("ground pork"), "Ground Pork");
  assert.equal(ingredientPhotoName("sesame oil"), "Sesame Seed Oil");
  assert.equal(ingredientPhotoName("carrot"), "Carrots");
  assert.equal(ingredientPhotoName(""), "");
  assert.match(ingredientPhotoUrl("cabbage"), /^https:\/\/www\.themealdb\.com\/images\/ingredients\/Cabbage-Small\.png$/);
});

test("reads the cloud key from an env file", () => {
  const env = parseEnv('# cloud\nexport OPENROUTER_API_KEY="sk-test"\nOPENROUTER_MODEL=google/gemini-2.5-flash\n');
  const settings = settingsFromEnv(env, {});
  assert.equal(settings.provider, "openrouter");
  assert.equal(settings.openrouterKey, "sk-test");
  assert.equal(settings.openrouterModel, "google/gemini-2.5-flash");
  const local = settingsFromEnv(parseEnv("RECIPE_PROVIDER=ollama\nOLLAMA_MODEL=llama3.1\n"), {});
  assert.equal(local.provider, "ollama");
  assert.equal(local.ollamaModel, "llama3.1");
});

test("a settings key overrides the env file, and an empty field keeps the env key", () => {
  const env = { OPENROUTER_API_KEY: "from-env", OPENROUTER_MODEL: "google/gemini-2.5-flash" };
  const saved = resolveSettings({ openrouterKey: "from-settings", githubPush: true, githubRepo: "ada/recipes" }, env);
  assert.equal(saved.openrouterKey, "from-settings");
  assert.equal(saved.openrouterModel, "google/gemini-2.5-flash");
  assert.equal(saved.githubPush, true);
  assert.equal(saved.githubRepo, "lemd/recipes");
  assert.equal(saved.githubBranch, "main");
  const fallback = resolveSettings({ openrouterKey: "  " }, env);
  assert.equal(fallback.openrouterKey, "from-env");
  assert.equal(fallback.githubPush, true);
  assert.equal(resolveSettings({ githubPush: false }, env).githubPush, false);
});

test("treats the same recipe address as one saved page", () => {
  const catalog = {
    recipes: [{ file: "tacos.json", name: "Tacos", sourceUrl: "https://www.hellofresh.ca/recipes/moo-shu-pork-tacos", extractedAt: "2026-10-09T00:00:00.000Z" }],
  };
  const found = findCatalogEntry(catalog, "https://hellofresh.ca/recipes/moo-shu-pork-tacos/?utm=1");
  assert.equal(found.file, "tacos.json");
  assert.equal(recipeUrlKey("https://www.hellofresh.ca/recipes/moo-shu-pork-tacos/"), recipeUrlKey("https://hellofresh.ca/recipes/moo-shu-pork-tacos"));
  assert.equal(findCatalogEntry(catalog, "https://example.com/other"), null);
});

test("reads a recipe from page HTML", () => {
  const page = pageFromHtml("https://example.com/soup", `<!doctype html><html lang="en"><head>
    <title>Soup</title>
    <link rel="canonical" href="https://example.com/soup">
    <script type="application/ld+json">{"@type":"Recipe","name":"Soup","recipeIngredient":["1 cup water"],"recipeInstructions":"Boil."}</script>
    </head><body><p>Boil the water.</p></body></html>`);
  assert.equal(page.title, "Soup");
  assert.equal(page.structured.length, 1);
  assert.equal(page.structured[0].name, "Soup");
  assert.match(page.text, /Boil the water/);
});

test("tags seasons, meals, courses, and methods from the dish", () => {
  const soup = assignTags({ name: "Tomato soup", category: "Soup" });
  assert.deepEqual(soup.seasons, ["winter"]);
  assert.deepEqual(soup.courses, ["soup"]);
  assert.deepEqual(soup.meals, ["dinner"]);

  const salad = assignTags({ name: "Tomato salad" });
  assert.deepEqual(salad.seasons, ["summer"]);
  assert.deepEqual(salad.courses, ["salad"]);
  assert.ok(salad.meals.includes("lunch"));

  const bbq = assignTags({ name: "BBQ chicken", category: "Main course" });
  assert.deepEqual(bbq.seasons, ["summer"]);
  assert.deepEqual(bbq.courses, ["main"]);
  assert.deepEqual(bbq.methods, ["grill"]);

  const cold = assignTags({ name: "Gazpacho", category: "Soup" });
  assert.deepEqual(cold.seasons, ["summer"]);

  const side = assignTags({
    name: "Potatoes au gratin",
    category: "Side Dish",
    stepGroups: [{ steps: [{ text: "Bake until golden." }] }],
  });
  assert.deepEqual(side.courses, ["side"]);
  assert.deepEqual(side.seasons, ["winter"]);
  assert.ok(side.methods.includes("bake"));

  const tagged = normalizeTags({ tags: { meals: ["brunch", "holiday"], seasons: ["spring"] } }, { name: "Eggs" });
  assert.deepEqual(tagged.meals, ["brunch", "breakfast"]);
  assert.deepEqual(tagged.seasons, ["spring"]);
  assert.deepEqual(assignTags({ name: "Stir fry", timesMinutes: { total: 20 } }).times, ["quick"]);
  assert.deepEqual(assignTags({ name: "Pasta", timesMinutes: { prep: 15, cook: 20 } }).times, ["hour"]);
  assert.deepEqual(assignTags({ name: "Stew", timesMinutes: { total: 90 } }).times, ["long"]);
  assert.deepEqual(normalizeTags({ tags: { times: ["quick"] } }, { name: "Stew", timesMinutes: { total: 90 } }).times, ["long"]);
});

test("starts GitHub sign-in without a pasted token", async () => {
  const manifest = githubAppManifest();
  assert.equal(manifest.default_permissions.contents, "write");
  assert.equal(manifest.default_permissions.actions, "write");
  assert.equal(manifest.callback_urls[0], "https://hcjdglghcapfdoomklfpdgmofmkkefdo.chromiumapp.org/");
  assert.equal(parseGithubToken({ access_token: "ghu_test" }), "ghu_test");
  assert.throws(() => parseGithubToken({ error: "access_denied", error_description: "cancelled" }), /cancelled/);
  const app = await exchangeManifestCode("code", async () => ({
    ok: true,
    json: async () => ({ client_id: "Iv1.abc", client_secret: "secret", pem: "private" }),
  }));
  assert.deepEqual(app, { clientId: "Iv1.abc", clientSecret: "secret" });
});

test("scales ingredient amounts with the serving count", () => {
  const doc = finalizeRecipe({
    name: "Soup",
    servings: 2,
    ingredients: ["1 cup water"],
    steps: ["Boil 5 minutes."],
  }, { page, method: "llm" });
  const scaled = scaleIngredient(doc.recipe.ingredientGroups[0].ingredients[0], 2);
  assert.equal(formatMeasure(scaled.measures.us.volume), "2 cups");
  assert.equal(scaled.quantity, 2);
});

test("merges a remote catalog with the local one", () => {
  const remote = { recipes: [{ file: "a.json", name: "A", sourceUrl: "https://example.com/a", extractedAt: "2020-01-01T00:00:00.000Z" }] };
  const local = { recipes: [{ file: "b.json", name: "B", sourceUrl: "https://example.com/b", extractedAt: "2021-01-01T00:00:00.000Z" }] };
  const merged = mergeCatalogs(remote, local);
  assert.deepEqual(merged.recipes.map((item) => item.file), ["a.json", "b.json"]);
});

test("pushes the recipe file and catalog to GitHub", async () => {
  const doc = finalizeRecipe({ name: "Soup", ingredients: ["1 cup water"], steps: ["Boil."] }, { page, method: "llm" });
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null, authorization: options.headers.Authorization });
    if ((options.method || "GET") === "GET" && String(url).includes("index.json")) {
      return jsonResponse(200, { sha: "index-sha", content: utf8Base64('{"recipes":[{"file":"other.json","name":"Other","sourceUrl":null,"extractedAt":"2020-01-01T00:00:00.000Z"}]}\n') });
    }
    if ((options.method || "GET") === "GET") return jsonResponse(404, { message: "Not Found" });
    return jsonResponse(201, { content: { sha: "new" } });
  };
  const result = await pushRecipe({
    githubToken: "ghp_test",
    githubRepo: "https://github.com/ada/recipes.git",
    githubBranch: "main",
  }, doc, { recipes: [] }, fetchImpl);
  assert.equal(parseGithubRepo("ada/recipes").owner, "ada");
  assert.equal(result.file, "soup.json");
  const puts = calls.filter((call) => call.method === "PUT");
  assert.equal(puts.length, 2);
  assert.equal(puts[0].authorization, "Bearer ghp_test");
  assert.match(puts[0].body.message, /^Save recipe: Soup$/);
  const index = JSON.parse(decodeBase64Utf8(puts[1].body.content));
  assert.deepEqual(index.recipes.map((item) => item.file), ["other.json", "soup.json"]);
});

test("keeps the local save when GitHub push fails", async () => {
  const doc = finalizeRecipe({ name: "Soup", ingredients: ["1 cup water"], steps: ["Boil."] }, { page, method: "llm" });
  const result = await publishRecipe({ name: "recipe" }, {
    githubPush: true,
    githubToken: "ghp_test",
    githubRepo: "ada/recipes",
    githubBranch: "main",
  }, doc, {
    saveRecipe: async () => "soup.json",
    readRecipeCatalog: async () => ({ recipes: [] }),
    pushRecipe: async () => {
      throw new Error("GitHub rejected the token.");
    },
  });
  assert.equal(result.folder, true);
  assert.equal(result.github, false);
  assert.match(saveStatus(result), /Saved recipes\/soup.json in the folder. GitHub push failed: GitHub rejected the token./);
});

test("retries a bad model shape and leaves connection errors alone", () => {
  assert.equal(shouldRetryModel(new Error("The model did not return valid JSON.")), true);
  assert.equal(shouldRetryModel(new Error("This page doesn't look like a recipe.")), true);
  assert.equal(shouldRetryModel(new Error("ingredient keys are extra.")), true);
  assert.equal(shouldRetryModel(new Error("OpenRouter rejected the API key.")), false);
  assert.equal(shouldRetryModel(new Error("Couldn't reach OpenRouter.")), false);
  const built = buildMessages({ url: "https://example.com/soup", title: "Soup", text: "Boil water." }, { correction: "Recipe is missing name." });
  assert.match(built.messages[1].content, /Recipe is missing name/);
});
