export function ollamaBase(url) {
  const trimmed = String(url || "").trim().replace(/\/+$/, "").replace(/\/api$/, "");
  if (!trimmed) return "http://127.0.0.1:11434";
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("The Ollama address needs to start with http:// or https://.");
  return trimmed;
}

export function parseModelJson(content) {
  const text = messageText(content).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("The model did not return valid JSON.");
  }
}

export function messageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => part?.text || part?.content || "").join("");
  if (content && typeof content === "object" && typeof content.text === "string") return content.text;
  return "";
}

function errorMessage(data, fallback) {
  if (!data) return fallback;
  if (typeof data.error === "string") return data.error;
  if (data.error?.message) return data.error.message;
  if (typeof data.message === "string") return data.message;
  return fallback;
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

export async function completeChat(settings, messages) {
  if (settings.provider === "ollama") return completeOllama(settings, messages);
  return completeOpenRouter(settings, messages);
}

async function completeOpenRouter(settings, messages) {
  const key = String(settings.openrouterKey || "").trim();
  if (!key) throw new Error("Add an OpenRouter API key in settings.");
  const model = String(settings.openrouterModel || "").trim();
  if (!model) throw new Error("Choose an OpenRouter model in settings.");

  const send = async (useJsonMode) => {
    const body = { model, temperature: 0, messages };
    if (useJsonMode) body.response_format = { type: "json_object" };
    let response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://recipe.extension",
          "X-Title": "recipe",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
      });
    } catch (error) {
      if (error?.name === "TimeoutError") throw new Error("OpenRouter took too long to answer.");
      throw new Error("Couldn't reach OpenRouter.");
    }
    const data = await readBody(response);
    if (!response.ok) {
      const message = errorMessage(data, `OpenRouter returned ${response.status}.`);
      if (response.status === 401) throw new Error("OpenRouter rejected the API key.");
      if (response.status === 402) throw new Error("OpenRouter couldn't bill that request. Check the key and credits.");
      if (response.status === 429) throw new Error("OpenRouter rate-limited the request. Wait a moment and try again.");
      const failure = new Error(message);
      failure.status = response.status;
      throw failure;
    }
    const content = data.choices?.[0]?.message?.content;
    if (!messageText(content).trim()) throw new Error("OpenRouter returned an empty recipe.");
    return messageText(content);
  };

  try {
    return await send(true);
  } catch (error) {
    if (error.status === 400) return send(false);
    throw error;
  }
}

async function completeOllama(settings, messages) {
  const base = ollamaBase(settings.ollamaUrl);
  const model = String(settings.ollamaModel || "").trim();
  if (!model) throw new Error("Set an Ollama model in settings.");
  let response;
  try {
    response = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages,
        options: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (error) {
    if (error?.name === "TimeoutError") throw new Error("The local model took too long to answer.");
    throw new Error(`Couldn't reach Ollama at ${base}. Start it with ollama serve, then pull a model.`);
  }
  const data = await readBody(response);
  if (!response.ok) throw new Error(errorMessage(data, `Ollama returned ${response.status}.`));
  const content = messageText(data.message?.content);
  if (!content.trim()) throw new Error("The local model returned an empty recipe.");
  return content;
}

export async function testProvider(settings) {
  if (settings.provider === "ollama") {
    const base = ollamaBase(settings.ollamaUrl);
    let response;
    try {
      response = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new Error(`Couldn't reach Ollama at ${base}.`);
    }
    const data = await readBody(response);
    if (!response.ok) throw new Error(errorMessage(data, `Ollama returned ${response.status}.`));
    const models = (data.models || []).map((model) => model.name).filter(Boolean);
    const chosen = String(settings.ollamaModel || "").trim();
    const ready = models.some((name) => name === chosen || name.startsWith(`${chosen}:`));
    const message = models.length
      ? ready
        ? `Ollama is running and ${chosen} is installed.`
        : `Ollama is running. Installed models: ${models.join(", ")}.`
      : "Ollama is running, but no models are installed yet.";
    return { ok: true, message, models };
  }

  const key = String(settings.openrouterKey || "").trim();
  if (!key) throw new Error("Add an OpenRouter API key first.");
  let response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("Couldn't reach OpenRouter.");
  }
  const data = await readBody(response);
  if (response.status === 401) throw new Error("OpenRouter rejected the API key.");
  if (!response.ok) throw new Error(errorMessage(data, `OpenRouter returned ${response.status}.`));
  const models = (data.data || []).map((model) => model.id).filter(Boolean);
  const chosen = String(settings.openrouterModel || "").trim();
  const known = !chosen || models.includes(chosen);
  return {
    ok: true,
    message: known ? "OpenRouter accepted the key." : "The key works. That model id was not in the list, so check the spelling.",
    models,
  };
}
