const TOKEN_KEY = "recipe-github-token";

applyStored();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.githubToken || changes.githubLogin) applyStored();
});

const params = new URLSearchParams(location.search);
const code = params.get("code");
const state = params.get("state");
if (code && state) {
  params.delete("code");
  params.delete("state");
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
  chrome.runtime.sendMessage({ type: "GITHUB_APP_CODE", code, state });
}

document.addEventListener("recipe-github-signin", () => {
  document.dispatchEvent(new CustomEvent("recipe-github-signin-ack"));
  chrome.runtime.sendMessage({ type: "GITHUB_SIGN_IN" });
});

function applyStored() {
  chrome.storage.local.get(["githubToken", "githubLogin"], (stored) => {
    if (stored.githubToken) localStorage.setItem(TOKEN_KEY, stored.githubToken);
    else localStorage.removeItem(TOKEN_KEY);
    if (stored.githubLogin) document.documentElement.dataset.githubUser = stored.githubLogin;
    else delete document.documentElement.dataset.githubUser;
    document.dispatchEvent(new CustomEvent("recipe-github-ready"));
  });
}
