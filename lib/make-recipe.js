import { bestStructuredRecipe } from "./jsonld.js";
import { buildMessages } from "./prompt.js";
import { completeChat, parseModelJson } from "./providers.js";
import { shouldRetryModel } from "./retry.js";
import { finalizeRecipe } from "./schema.js";

export function providerReady(settings) {
  if (settings?.provider === "ollama") {
    return Boolean(String(settings.ollamaUrl || "").trim() && String(settings.ollamaModel || "").trim());
  }
  return Boolean(String(settings?.openrouterKey || "").trim() && String(settings?.openrouterModel || "").trim());
}

export async function makeRecipe(page, settings) {
  const structured = bestStructuredRecipe(page.structured);
  const ready = providerReady(settings);
  const warnings = [];
  if (page.truncated) warnings.push("The page text was shortened before extraction.");
  if (structured && (settings?.preferStructuredData || !ready)) {
    if (!ready) warnings.push("No model was configured, so this file came from the page's embedded recipe data.");
    return finalizeRecipe(structured, { page, method: "structured-data", provider: null, model: null, warnings });
  }
  if (!ready) {
    throw new Error(settings?.provider === "ollama"
      ? "Set OLLAMA_MODEL in recipe.env. You can also turn on embedded recipe data in settings."
      : "Add an OpenRouter API key in settings.");
  }
  return recipeFromModel(settings, page, warnings);
}

async function recipeFromModel(settings, page, warnings) {
  const compact = settings.provider === "ollama";
  const model = settings.provider === "ollama" ? settings.ollamaModel.trim() : settings.openrouterModel.trim();
  let correction = "";
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const built = buildMessages(page, { compact, correction });
      const content = await completeChat(settings, built.messages);
      const partial = parseModelJson(content);
      const attemptWarnings = correction
        ? [...warnings, "The first model response didn't match the recipe shape, so it was requested again."]
        : warnings;
      return finalizeRecipe(partial, {
        page,
        method: built.usedStructuredHint ? "hybrid" : "llm",
        provider: settings.provider,
        model,
        warnings: attemptWarnings,
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0 && shouldRetryModel(error)) {
        correction = error.message;
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
