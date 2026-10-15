import { mergeCatalogs, upsertCatalog } from "./catalog.js";
import { recipeFilename } from "./format.js";

export function parseGithubRepo(value) {
  const text = String(value || "")
    .trim()
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const match = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) throw new Error("GitHub repo should look like owner/name.");
  return { owner: match[1], repo: match[2] };
}

export function parseGithubBranch(value) {
  const branch = String(value || "main").trim() || "main";
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..") || branch.startsWith("/") || branch.endsWith("/")) {
    throw new Error("Branch name should look like main.");
  }
  return branch;
}

export function utf8Base64(text) {
  const bytes = new TextEncoder().encode(String(text));
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

export function decodeBase64Utf8(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

export function commitMessage(doc) {
  const name = String(doc?.recipe?.name || "recipe").replace(/\s+/g, " ").trim().slice(0, 72) || "recipe";
  return `Save recipe: ${name}`;
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "recipe",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function githubError(data, status) {
  if (status === 401) return "GitHub rejected the token.";
  if (status === 403) return "GitHub refused that token. It needs permission to write repository contents.";
  if (status === 404) return "GitHub could not find that repository or branch.";
  const message = data?.message || data?.error || "";
  return message ? `GitHub returned ${status}: ${message}` : `GitHub returned ${status}.`;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 180) };
  }
}

async function githubGet(fetchImpl, token, owner, repo, path, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  let response;
  try {
    response = await fetchImpl(url, { headers: githubHeaders(token) });
  } catch {
    throw new Error("Couldn't reach GitHub.");
  }
  if (response.status === 404) return null;
  const data = await readJson(response);
  if (!response.ok) throw new Error(githubError(data, response.status));
  if (!data.content || !data.sha) throw new Error(`GitHub did not return ${path}.`);
  return { sha: data.sha, text: decodeBase64Utf8(data.content) };
}

async function githubPut(fetchImpl, token, owner, repo, path, branch, text, sha, message) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = { message, content: utf8Base64(text), branch };
  if (sha) body.sha = sha;
  let response;
  try {
    response = await fetchImpl(url, {
      method: "PUT",
      headers: githubHeaders(token),
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach GitHub.");
  }
  const data = await readJson(response);
  if (response.status === 409) return { conflict: true };
  if (!response.ok) throw new Error(githubError(data, response.status));
  return { conflict: false, sha: data.content?.sha || data.commit?.sha || "" };
}

export async function pushRecipe(settings, doc, localCatalog = { recipes: [] }, fetchImpl = fetch) {
  const token = String(settings?.githubToken || "").trim();
  if (!token) throw new Error("Add a GitHub token in settings.");
  const { owner, repo } = parseGithubRepo(settings?.githubRepo);
  const branch = parseGithubBranch(settings?.githubBranch);
  const file = recipeFilename(doc);
  const recipePath = `recipes/${file}`;
  const indexPath = "recipes/index.json";
  const message = commitMessage(doc);
  const recipeText = `${JSON.stringify(doc, null, 2)}\n`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existingRecipe = await githubGet(fetchImpl, token, owner, repo, recipePath, branch);
    const existingIndex = await githubGet(fetchImpl, token, owner, repo, indexPath, branch);
    let remoteCatalog = { recipes: [] };
    if (existingIndex?.text) {
      try {
        remoteCatalog = JSON.parse(existingIndex.text);
      } catch {
        remoteCatalog = { recipes: [] };
      }
    }
    const indexText = `${JSON.stringify(upsertCatalog(mergeCatalogs(remoteCatalog, localCatalog), doc), null, 2)}\n`;
    const recipeWrite = await githubPut(fetchImpl, token, owner, repo, recipePath, branch, recipeText, existingRecipe?.sha, message);
    if (recipeWrite.conflict) continue;
    const indexWrite = await githubPut(fetchImpl, token, owner, repo, indexPath, branch, indexText, existingIndex?.sha, message);
    if (indexWrite.conflict) continue;
    return { file, owner, repo, branch };
  }
  throw new Error("GitHub was updated at the same time. Try saving again.");
}
