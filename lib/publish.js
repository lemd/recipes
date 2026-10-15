import { readRecipeCatalog, saveRecipe } from "./folder.js";
import { parseGithubBranch, parseGithubRepo, pushRecipe } from "./github.js";
import { recipeFilename } from "./format.js";

export async function publishRecipe(folder, settings, doc, deps = {}) {
  const githubOn = Boolean(settings?.githubPush);
  if (!folder && !githubOn) throw new Error("Choose a folder in settings, or turn on GitHub push.");
  if (githubOn) {
    if (!String(settings.githubToken || "").trim()) throw new Error("Add a GitHub token in settings.");
    parseGithubRepo(settings.githubRepo);
    parseGithubBranch(settings.githubBranch);
  }

  const save = deps.saveRecipe || saveRecipe;
  const push = deps.pushRecipe || pushRecipe;
  const readCatalog = deps.readRecipeCatalog || readRecipeCatalog;
  let file = recipeFilename(doc);
  if (folder) file = await save(folder, doc);

  if (!githubOn) return { file, folder: Boolean(folder), github: false };

  try {
    const localCatalog = folder ? await readCatalog(folder) : { recipes: [] };
    const pushed = await push(settings, doc, localCatalog, deps.fetchImpl);
    return { file: pushed.file || file, folder: Boolean(folder), github: true };
  } catch (error) {
    const message = error?.message || "Couldn't push to GitHub.";
    if (folder) return { file, folder: true, github: false, githubError: message };
    throw new Error(message);
  }
}

export function saveStatus(result) {
  if (result.githubError) return `Saved recipes/${result.file} in the folder. GitHub push failed: ${result.githubError}`;
  if (result.folder && result.github) return `Saved recipes/${result.file} and pushed it to GitHub.`;
  if (result.github) return `Pushed recipes/${result.file} to GitHub.`;
  return "Saved.";
}
