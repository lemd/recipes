export function shouldRetryModel(error) {
  const message = String(error?.message || error || "");
  if (/API key|rejected the API key|rate-limited|Couldn't reach|took too long|couldn't bill/i.test(message)) return false;
  return /valid JSON|schemaVersion|missing|doesn't look like a recipe|Ingredient|Step|measures|keys are/i.test(message);
}
