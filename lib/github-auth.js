export const GITHUB_REDIRECT_URL = "https://hcjdglghcapfdoomklfpdgmofmkkefdo.chromiumapp.org/";

export function githubAppManifest(redirectUrl = GITHUB_REDIRECT_URL) {
  return {
    name: "lemd recipe",
    url: "https://lemd.github.io/recipes/",
    redirect_url: "https://lemd.github.io/recipes/",
    callback_urls: [redirectUrl],
    public: false,
    request_oauth_on_install: true,
    default_permissions: {
      contents: "write",
      actions: "write",
    },
    hook_attributes: {
      url: "https://lemd.github.io/recipes/",
      active: false,
    },
  };
}

export function authorizeUrl({ clientId, redirectUrl, state }) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUrl);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export function parseGithubToken(body) {
  if (!body || typeof body !== "object") throw new Error("GitHub didn't return a token.");
  if (body.error) throw new Error(body.error_description || body.error);
  if (!body.access_token) throw new Error("GitHub didn't return a token.");
  return body.access_token;
}

export async function exchangeManifestCode(code, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.client_id || !body.client_secret) {
    throw new Error(body.message || "Couldn't create the GitHub app.");
  }
  return { clientId: body.client_id, clientSecret: body.client_secret };
}

export async function exchangeUserCode({ clientId, clientSecret, code, redirectUrl }, fetchImpl = fetch) {
  const response = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUrl,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.error || "Couldn't sign in with GitHub.");
  return parseGithubToken(body);
}

export async function githubLogin(token, fetchImpl = fetch) {
  const response = await fetchImpl("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Couldn't read the GitHub account.");
  return body.login || "";
}
