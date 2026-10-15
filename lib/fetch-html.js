export function pageFromHtml(url, html) {
  const source = String(html || "");
  const canonical = matchAttr(source, /<link[^>]*rel=["']canonical["'][^>]*>/i, "href") || url;
  const title = decode(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const siteName = decode(matchAttr(source, /<meta[^>]*property=["']og:site_name["'][^>]*>/i, "content"));
  const description = decode(matchAttr(source, /<meta[^>]*(?:name=["']description["']|property=["']og:description["'])[^>]*>/i, "content"));
  const structured = [];
  for (const block of source.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectRecipes(JSON.parse(block[1]), structured);
    } catch {
      // Ignore a broken JSON-LD block.
    }
  }
  const text = source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20000);
  return {
    url,
    canonicalUrl: canonical,
    title,
    siteName,
    language: matchAttr(source, /<html[^>]*>/i, "lang") || null,
    description,
    text,
    truncated: false,
    structured,
  };
}

export async function fetchRecipePage(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "text/html",
        "User-Agent": "recipe",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error("Couldn't reach that page.");
  }
  if (!response.ok) throw new Error(`That page returned ${response.status}.`);
  return pageFromHtml(response.url || url, await response.text());
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

function matchAttr(source, tagPattern, name) {
  const tag = source.match(tagPattern)?.[0] || "";
  const attr = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return decode(attr?.[1] || "");
}

function decode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
