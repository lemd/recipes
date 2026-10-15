const UNIT_CODES = "mg, g, kg, oz, lb, ml, l, tsp, tbsp, cup, fl_oz, pint, quart, gallon, pinch, dash, clove, bunch, sprig, slice, can, package, piece, head, stalk, ear, strip, sheet, stick, bag, jar, bottle, box";

const SYSTEM = `You extract one recipe from a web page into JSON. Return one JSON object and nothing else.

Use this shape:
{
  "notRecipe": false,
  "name": "string",
  "description": "string or null",
  "author": "string or null",
  "language": "string or null",
  "imageUrls": ["string"],
  "servings": 0,
  "yieldText": "string or null",
  "times": { "prep": null, "cook": null, "total": null, "rest": null },
  "cuisine": "string or null",
  "category": "string or null",
  "keywords": ["string"],
  "diets": ["string"],
  "tags": { "seasons": [], "meals": [], "courses": [], "methods": [] },
  "equipment": ["string"],
  "notes": ["string"],
  "nutrition": { "servingSizeText": null, "nutrients": [{ "name": "calories", "amount": 0, "unit": "kcal" }] },
  "ingredientGroups": [{ "name": null, "ingredients": [{ "text": "string", "name": "string", "quantity": 0, "quantityMax": null, "unit": "cup", "preparation": null, "optional": false, "comment": null }] }],
  "stepGroups": [{ "name": null, "steps": [{ "text": "string", "durationMinutes": null, "durationMinutesMax": null, "temperature": null }] }]
}

Rules:
- If the page is not a recipe, return {"notRecipe": true, "reason": "short reason"}.
- Use only information written on the page. Use null or [] when something is missing. Do not guess nutrition, times, or temperatures.
- name is the dish itself. Strip personal names and possessives such as "Grandma's" or "Jamie's", and drop a parenthetical subtitle.
- description is at most 2 or 3 neutral sentences. Leave out marketing ("you'll love", "perfect for weeknights") and the site name.
- Keep each ingredient in the unit written on the page. Do not convert cups to grams or Fahrenheit to Celsius.
- quantity and quantityMax are numbers. Convert fractions to decimals. quantityMax is only for a range such as 1 to 2.
- unit is one of: ${UNIT_CODES}. Use null when there is no unit, including "2 large eggs".
- text is the original ingredient or step line. name is only the food, lowercase, without the quantity, unit, or preparation. preparation is a technique such as minced, sliced, or softened. Put sizes such as "14 ounce" in comment.
- Garlic uses clove or bulb. 1 clove is about 1 tsp minced or 3 g. Do not use cups, grams, or ounces for garlic.
- Put section headings into group name. Use one group with name null when the page has no sections.
- step text is a direct instruction. Drop ads and cross-promotion. Put each action on its own line, separated by a newline. Merge tiny actions that are the same motion.
- times and durationMinutes are minutes. A range uses durationMinutes and durationMinutesMax, and durationMinutesMax is the longer one. temperature, when the step states one, is {"value": 350, "valueMax": null, "unit": "F"} and unit is F or C.
- diets only when the whole dish clearly matches one of: vegetarian, vegan, pescatarian, gluten-free, dairy-free, nut-free, low-carb, keto.
- tags use only these words. Leave a list empty when none fit, and do not invent a season for an ordinary weeknight main.
  seasons: spring, summer, fall, winter. Soups, stews, and gratins are winter unless the dish is clearly warm-weather, such as gazpacho. Salads, grilled food, and barbecue are summer.
  meals: breakfast, brunch, lunch, dinner, snack.
  courses: appetizer, main, side, soup, salad, dessert, drink, bread.
  methods: bake, grill, stovetop, no-cook, slow, one-pot. Barbecue is grill.`;

function clip(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n[truncated]`;
}

export function buildMessages(page, { compact = false, correction = "" } = {}) {
  const textLimit = compact ? 8000 : 14000;
  const dataLimit = compact ? 6000 : 10000;
  const structured = Array.isArray(page.structured) && page.structured.length
    ? clip(JSON.stringify(page.structured), dataLimit)
    : "";
  const lines = [
    `URL: ${page.canonicalUrl || page.url || ""}`,
    `Title: ${page.title || ""}`,
    `Site: ${page.siteName || ""}`,
    `Language: ${page.language || ""}`,
  ];
  if (page.description) lines.push(`Description: ${page.description}`);
  if (structured) {
    lines.push("", "Embedded recipe data, if it disagrees with the article use the article:", structured);
  }
  lines.push("", "Article text:", clip(page.text || "", textLimit));
  if (correction) {
    lines.push("", "The previous JSON was rejected:", correction, "Return one corrected JSON object in the required shape.");
  }
  return {
    usedStructuredHint: Boolean(structured),
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: lines.join("\n") },
    ],
  };
}
