export const GITHUB_REPO = "lemd/recipes";
export const GITHUB_BRANCH = "main";

export const DEFAULT_SETTINGS = {
  provider: "openrouter",
  openrouterKey: "",
  openrouterModel: "google/gemini-2.5-flash",
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "llama3.1",
  preferStructuredData: false,
  displaySystem: "us",
  githubPush: true,
  githubRepo: GITHUB_REPO,
  githubBranch: GITHUB_BRANCH,
  githubToken: "",
};

export function withDefaults(stored = {}) {
  return { ...DEFAULT_SETTINGS, ...stored };
}
