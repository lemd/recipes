export function extractPage(doc) {
  const TEXT_LIMIT = 20000;
  const page = doc && typeof doc.querySelector === "function" ? doc : globalThis.document;

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function collectRecipes(node, out) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item) => collectRecipes(item, out));
      return;
    }
    const type = node["@type"];
    const types = (Array.isArray(type) ? type : type ? [type] : []).map((item) => String(item).toLowerCase());
    if (types.some((item) => item === "recipe" || item.endsWith("/recipe"))) out.push(node);
    if (node["@graph"]) collectRecipes(node["@graph"], out);
  }

  function textOf(element) {
    return clean(element.getAttribute("content") || element.textContent || "");
  }

  function microdataRecipe() {
    const root = page.querySelector('[itemtype*="Recipe" i]') || page.querySelector('[itemtype*="recipe"]');
    if (!root) return null;
    const props = (name) => [...root.querySelectorAll(`[itemprop="${name}"]`)].map(textOf).filter(Boolean);
    const recipe = {
      "@type": "Recipe",
      name: props("name")[0] || "",
      description: props("description")[0] || "",
      recipeIngredient: props("recipeIngredient"),
      recipeInstructions: props("recipeInstructions"),
      prepTime: props("prepTime")[0] || null,
      cookTime: props("cookTime")[0] || null,
      totalTime: props("totalTime")[0] || null,
      recipeYield: props("recipeYield")[0] || null,
      author: props("author")[0] || null,
      image: props("image"),
      recipeCuisine: props("recipeCuisine")[0] || null,
      recipeCategory: props("recipeCategory"),
      keywords: props("keywords")[0] || null,
    };
    if (!recipe.recipeIngredient.length && !recipe.recipeInstructions.length) return null;
    return recipe;
  }

  try {
    const locationHref = page.location?.href || "";
    const canonicalLink = page.querySelector('link[rel="canonical"]');
    const canonicalUrl = canonicalLink?.href || canonicalLink?.getAttribute("href") || locationHref;
    const siteMeta = page.querySelector('meta[property="og:site_name"]');
    let siteName = siteMeta?.getAttribute("content") || "";
    if (!siteName && canonicalUrl) {
      try {
        siteName = new URL(canonicalUrl, locationHref || undefined).hostname.replace(/^www\./, "");
      } catch {
        siteName = "";
      }
    }
    const descriptionMeta = page.querySelector('meta[name="description"]') || page.querySelector('meta[property="og:description"]');
    const root = page.querySelector('[itemtype*="Recipe" i]')
      || page.querySelector('[itemtype*="recipe"]')
      || page.querySelector("article")
      || page.querySelector("main")
      || page.body;
    let text = "";
    if (root) {
      const clone = root.cloneNode(true);
      clone.querySelectorAll("script,style,noscript,svg,iframe,nav,footer,header,form,button,[role='navigation'],[role='banner'],[role='contentinfo']").forEach((element) => element.remove());
      text = (clone.textContent || "").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    }
    const truncated = text.length > TEXT_LIMIT;
    if (truncated) text = text.slice(0, TEXT_LIMIT);
    const structured = [];
    page.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try {
        collectRecipes(JSON.parse(script.textContent), structured);
      } catch {
        // Ignore broken JSON-LD blocks.
      }
    });
    const microdata = microdataRecipe();
    if (microdata) structured.push(microdata);
    return {
      url: locationHref,
      canonicalUrl: canonicalUrl || locationHref,
      title: clean(page.title || page.querySelector('meta[property="og:title"]')?.getAttribute("content")),
      siteName: clean(siteName),
      language: page.documentElement?.lang || null,
      description: clean(descriptionMeta?.getAttribute("content")),
      text,
      truncated,
      structured,
    };
  } catch (error) {
    return {
      url: page.location?.href || "",
      canonicalUrl: page.location?.href || "",
      title: "",
      siteName: "",
      language: null,
      description: null,
      text: "",
      truncated: false,
      structured: [],
      error: String(error && error.message ? error.message : error),
    };
  }
}
