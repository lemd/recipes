const LABELS = {
  mg: "mg",
  g: "g",
  kg: "kg",
  oz: "oz",
  lb: "lb",
  ml: "ml",
  l: "L",
  tsp: "tsp",
  tbsp: "tbsp",
  cup: "cup",
  fl_oz: "fl oz",
  pint: "pint",
  quart: "quart",
  gallon: "gallon",
  pinch: "pinch",
  dash: "dash",
  clove: "clove",
  bunch: "bunch",
  sprig: "sprig",
  slice: "slice",
  can: "can",
  package: "package",
  piece: "piece",
  head: "head",
  stalk: "stalk",
  ear: "ear",
  strip: "strip",
  sheet: "sheet",
  stick: "stick",
  bag: "bag",
  jar: "jar",
  bottle: "bottle",
  box: "box",
};

const NO_PLURAL = new Set(["mg", "g", "kg", "oz", "lb", "ml", "L", "tsp", "tbsp", "fl oz"]);

const FRACTIONS = [
  [0.125, "1/8"],
  [0.25, "1/4"],
  [0.333, "1/3"],
  [0.375, "3/8"],
  [0.5, "1/2"],
  [0.625, "5/8"],
  [0.667, "2/3"],
  [0.75, "3/4"],
  [0.875, "7/8"],
];

function formatNumber(value, unit) {
  if (value == null || !Number.isFinite(value)) return "";
  if ((unit === "oz" || unit === "lb") && Math.abs(value) >= 0.95) return String(Math.round(value));
  const cooking = unit === "cup" || unit === "tsp" || unit === "tbsp" || unit === "oz";
  if (!cooking) {
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  }
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute + 1e-9);
  const fraction = absolute - whole;
  if (fraction < 0.02) return `${sign}${whole}`;
  let best = null;
  for (const [amount, label] of FRACTIONS) {
    const delta = Math.abs(fraction - amount);
    if (delta <= 0.02 && (!best || delta < best.delta)) best = { label, delta };
  }
  if (!best) return `${sign}${Math.round(absolute * 100) / 100}`;
  return whole ? `${sign}${whole} ${best.label}` : `${sign}${best.label}`;
}

function plural(unit, quantity) {
  const label = LABELS[unit] || (unit ? String(unit).replace(/_/g, " ") : "");
  if (!label || NO_PLURAL.has(label) || Math.abs(quantity ?? 0) === 1) return label;
  return label.endsWith("s") ? label : `${label}s`;
}

export function scaleMeasure(measure, factor) {
  if (!measure || measure.quantity == null || factor === 1) return measure;
  return {
    ...measure,
    quantity: measure.quantity * factor,
    quantityMax: measure.quantityMax == null ? null : measure.quantityMax * factor,
  };
}

export function scaleIngredient(ingredient, factor) {
  if (!ingredient || factor === 1) return ingredient;
  const measures = ingredient.measures;
  const scaleSide = (side) => side && {
    mass: scaleMeasure(side.mass, factor),
    volume: scaleMeasure(side.volume, factor),
  };
  return {
    ...ingredient,
    quantity: ingredient.quantity == null ? ingredient.quantity : ingredient.quantity * factor,
    quantityMax: ingredient.quantityMax == null ? null : ingredient.quantityMax * factor,
    measures: measures && {
      ...measures,
      asWritten: scaleMeasure(measures.asWritten, factor),
      metric: scaleSide(measures.metric),
      us: scaleSide(measures.us),
    },
  };
}

export function formatMeasure(measure) {
  if (!measure || measure.quantity == null) return "";
  if (measure.quantity === 0 && measure.quantityMax == null) return "";
  const amount = formatNumber(measure.quantity, measure.unit);
  const max = measure.quantityMax == null ? "" : `–${formatNumber(measure.quantityMax, measure.unit)}`;
  const unit = plural(measure.unit, measure.quantityMax ?? measure.quantity);
  return [amount + max, unit].filter(Boolean).join(" ");
}

const CUPS_FROM_OZ = 4;

export function preferredMeasure(ingredient, system) {
  return shownMeasures(ingredient, system).measure;
}

export function shownMeasures(ingredient, system) {
  const measures = ingredient?.measures;
  if (!measures || system === "original") return { measure: measures?.asWritten || null, also: null };
  const block = measures[system] || {};
  const mass = usableMeasure(block.mass) ? block.mass : null;
  const volume = usableMeasure(block.volume) ? block.volume : null;
  const smallSpoon = volume && (volume.unit === "tsp" || volume.unit === "tbsp" || volume.unit === "pinch" || volume.unit === "dash");
  let measure = mass || volume || measures.asWritten;
  if (smallSpoon && mass?.confidence === "density" && ounceWeight(mass) < 1) measure = volume;
  const cups = volume?.unit === "cup" ? volume : null;
  if (system === "us" && measure === mass && cups && ounceWeight(mass) >= CUPS_FROM_OZ) return { measure, also: cups };
  return { measure, also: null };
}

function usableMeasure(measure) {
  return Boolean(measure && measure.quantity != null && !(measure.quantity === 0 && measure.quantityMax == null));
}

function ounceWeight(measure) {
  if (!measure || measure.quantity == null) return 0;
  const factor = measure.unit === "lb" ? 16 : measure.unit === "oz" ? 1 : 0;
  const amount = measure.quantityMax ?? measure.quantity;
  return amount * factor;
}

export function ingredientLines(ingredient, system) {
  if (system === "original") {
    const primary = ingredient.text || compose(ingredient, ingredient.measures?.asWritten);
    return { primary: withOptional(primary, ingredient.optional), secondary: "", approximate: false };
  }
  const shown = shownMeasures(ingredient, system);
  const amount = [formatMeasure(shown.measure), shown.also ? formatMeasure(shown.also) : ""].filter(Boolean).join(" · ");
  const detail = [ingredient.preparation, ingredient.comment].filter(Boolean).join(", ");
  const name = [amount, ingredient.name].filter(Boolean).join(" ");
  const primary = withOptional(detail ? `${name}, ${detail}` : name, ingredient.optional);
  const secondary = ingredient.text && ingredient.text !== primary ? ingredient.text : "";
  return { primary, secondary, approximate: shown.measure?.confidence === "density" || shown.also?.confidence === "density" };
}

function compose(ingredient, measure) {
  return [formatMeasure(measure), ingredient.name, ingredient.preparation].filter(Boolean).join(" ");
}

function withOptional(text, optional) {
  if (!optional) return text;
  return `${text} (optional)`;
}

export function tidyStepText(value) {
  return String(value || "")
    .replace(/\*+/g, "")
    .replace(/\bdbl\b/gi, "double")
    .replace(/\bppll?\b/gi, "people")
    .replace(/([.!?])([A-Za-z])/g, "$1 $2")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function formatMinutes(value) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  const minutes = Math.round(Number(value));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export function recipeFilename(doc) {
  const name = doc?.recipe?.name || "recipe";
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "recipe";
  return `${slug}.json`;
}

export function methodLabel(doc) {
  const extraction = doc?.extraction || {};
  if (extraction.method === "structured-data") return "From the page's embedded recipe data";
  if (extraction.method === "hybrid") return `From ${extraction.model}, checked against the page's embedded data`;
  if (extraction.model) return `From ${extraction.model}`;
  return "Extracted recipe";
}
