import { GITHUB_BRANCH, GITHUB_REPO, withDefaults } from "./settings.js";

export function parseEnv(text) {
  const result = {};
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (const line of source.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.replace(/^export\s+/, "");
    const eq = body.indexOf("=");
    if (eq < 0) continue;
    const key = body.slice(0, eq).trim();
    let value = body.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

export function settingsFromEnv(env = {}, prefs = {}) {
  const settings = withDefaults(prefs);
  const provider = String(env.RECIPE_PROVIDER || "").trim().toLowerCase();
  if (provider === "ollama" || provider === "openrouter") settings.provider = provider;
  if (env.OPENROUTER_API_KEY) settings.openrouterKey = env.OPENROUTER_API_KEY.trim();
  if (env.OPENROUTER_MODEL) settings.openrouterModel = env.OPENROUTER_MODEL.trim();
  if (env.OLLAMA_URL) settings.ollamaUrl = env.OLLAMA_URL.trim();
  if (env.OLLAMA_MODEL) settings.ollamaModel = env.OLLAMA_MODEL.trim();
  if (env.PREFER_STRUCTURED_DATA === "true" || env.PREFER_STRUCTURED_DATA === "false") {
    settings.preferStructuredData = env.PREFER_STRUCTURED_DATA === "true";
  }
  return settings;
}

export function resolveSettings(stored = {}, env = {}) {
  const fromEnv = settingsFromEnv(env, {});
  const settings = withDefaults({
    ...fromEnv,
    preferStructuredData: stored.preferStructuredData ?? fromEnv.preferStructuredData,
    displaySystem: stored.displaySystem || fromEnv.displaySystem,
    githubPush: stored.githubPush !== false,
    githubRepo: GITHUB_REPO,
    githubBranch: GITHUB_BRANCH,
    githubToken: String(stored.githubToken || "").trim(),
  });
  const storedKey = String(stored.openrouterKey || "").trim();
  settings.openrouterKey = storedKey || fromEnv.openrouterKey;
  if (stored.provider === "ollama" || stored.provider === "openrouter") settings.provider = stored.provider;
  if (String(stored.openrouterModel || "").trim()) settings.openrouterModel = String(stored.openrouterModel).trim();
  if (String(stored.ollamaUrl || "").trim()) settings.ollamaUrl = String(stored.ollamaUrl).trim();
  if (String(stored.ollamaModel || "").trim()) settings.ollamaModel = String(stored.ollamaModel).trim();
  return settings;
}
