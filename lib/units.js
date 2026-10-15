export const CUP_ML = 236.5882365;

export const VOLUME_TO_ML = {
  ml: 1,
  l: 1000,
  tsp: CUP_ML / 48,
  tbsp: CUP_ML / 16,
  cup: CUP_ML,
  fl_oz: CUP_ML / 8,
  pint: CUP_ML * 2,
  quart: CUP_ML * 4,
  gallon: CUP_ML * 16,
};

export const MASS_TO_G = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.349523125,
  lb: 453.59237,
};

const UNITS = [
  { code: "fl_oz", dimension: "volume", aliases: ["fl oz", "fluid oz", "fluid ounce", "fluid ounces", "floz"] },
  { code: "tbsp", dimension: "volume", aliases: ["tablespoon", "tablespoons", "tbsp", "tbsps", "tbs"] },
  { code: "tsp", dimension: "volume", aliases: ["teaspoon", "teaspoons", "tsp", "tsps"] },
  { code: "cup", dimension: "volume", aliases: ["cup", "cups"] },
  { code: "pint", dimension: "volume", aliases: ["pint", "pints"] },
  { code: "quart", dimension: "volume", aliases: ["quart", "quarts"] },
  { code: "gallon", dimension: "volume", aliases: ["gallon", "gallons"] },
  { code: "ml", dimension: "volume", aliases: ["ml", "milliliter", "milliliters", "millilitre", "millilitres", "mls"] },
  { code: "l", dimension: "volume", aliases: ["l", "liter", "liters", "litre", "litres"] },
  { code: "mg", dimension: "mass", aliases: ["mg", "milligram", "milligrams"] },
  { code: "kg", dimension: "mass", aliases: ["kg", "kilogram", "kilograms", "kilogramme", "kilogrammes"] },
  { code: "oz", dimension: "mass", aliases: ["oz", "ounce", "ounces"] },
  { code: "lb", dimension: "mass", aliases: ["lb", "lbs", "pound", "pounds"] },
  { code: "g", dimension: "mass", aliases: ["g", "gram", "grams", "gramme", "grammes"] },
  { code: "pinch", dimension: "count", aliases: ["pinch", "pinches"] },
  { code: "dash", dimension: "count", aliases: ["dash", "dashes"] },
  { code: "clove", dimension: "count", aliases: ["clove", "cloves"] },
  { code: "bunch", dimension: "count", aliases: ["bunch", "bunches"] },
  { code: "sprig", dimension: "count", aliases: ["sprig", "sprigs"] },
  { code: "slice", dimension: "count", aliases: ["slice", "slices"] },
  { code: "can", dimension: "count", aliases: ["can", "cans"] },
  { code: "package", dimension: "count", aliases: ["package", "packages", "packet", "packets", "pkg"] },
  { code: "piece", dimension: "count", aliases: ["piece", "pieces"] },
  { code: "head", dimension: "count", aliases: ["head", "heads"] },
  { code: "stalk", dimension: "count", aliases: ["stalk", "stalks"] },
  { code: "ear", dimension: "count", aliases: ["ear", "ears"] },
  { code: "strip", dimension: "count", aliases: ["strip", "strips"] },
  { code: "sheet", dimension: "count", aliases: ["sheet", "sheets"] },
  { code: "stick", dimension: "count", aliases: ["stick", "sticks"] },
  { code: "bag", dimension: "count", aliases: ["bag", "bags"] },
  { code: "jar", dimension: "count", aliases: ["jar", "jars"] },
  { code: "bottle", dimension: "count", aliases: ["bottle", "bottles"] },
  { code: "box", dimension: "count", aliases: ["box", "boxes"] },
];

const METRIC_MASS = new Set(["mg", "g", "kg"]);
const US_MASS = new Set(["oz", "lb"]);
const METRIC_VOLUME = new Set(["ml", "l"]);
const US_VOLUME = new Set(["tsp", "tbsp", "cup", "fl_oz", "pint", "quart", "gallon"]);
const LARGE_VOLUME = new Set(["cup", "pint", "quart", "gallon"]);

const ALIAS_TO_UNIT = new Map();
for (const unit of UNITS) {
  ALIAS_TO_UNIT.set(unit.code, unit);
  for (const alias of unit.aliases) ALIAS_TO_UNIT.set(cleanUnitToken(alias), unit);
}

const DENSITIES = [
  { re: /\balmond flour\b|\balmond meal\b/, gramsPerCup: 96 },
  { re: /\bcoconut flour\b/, gramsPerCup: 128 },
  { re: /\bbread flour\b/, gramsPerCup: 130 },
  { re: /\bcake flour\b/, gramsPerCup: 114 },
  { re: /\bwhole wheat flour\b|\bwholemeal flour\b|\bwhole-wheat flour\b/, gramsPerCup: 130 },
  { re: /\bself[- ]?rising flour\b|\bself[- ]?raising flour\b/, gramsPerCup: 125 },
  { re: /\ball[- ]purpose flour\b|\bplain flour\b|\bap flour\b/, gramsPerCup: 125 },
  { re: /\brice flour\b/, gramsPerCup: 158 },
  { re: /\bflour\b/, gramsPerCup: 125 },
  { re: /\bpowdered sugar\b|\bconfectioners' sugar\b|\bconfectioners sugar\b|\bicing sugar\b/, gramsPerCup: 120 },
  { re: /\bbrown sugar\b/, gramsPerCup: 220 },
  { re: /\bgranulated sugar\b|\bcaster sugar\b|\bwhite sugar\b/, gramsPerCup: 200 },
  { re: /\bsugar\b/, gramsPerCup: 200 },
  { re: /\bcocoa powder\b|\bcocoa\b/, gramsPerCup: 85 },
  { re: /\bcornstarch\b|\bcorn starch\b|\bcornflour\b/, gramsPerCup: 128 },
  { re: /\brolled oats\b|\bold[- ]fashioned oats\b|\boatmeal\b/, gramsPerCup: 90 },
  { re: /\bbreadcrumbs\b|\bbread crumbs\b/, gramsPerCup: 108 },
  { re: /\bchocolate chips\b/, gramsPerCup: 170 },
  { re: /\bwhite rice\b|\blong[- ]grain rice\b/, gramsPerCup: 185 },
  { re: /\bbrown rice\b/, gramsPerCup: 190 },
  { re: /\brice\b/, gramsPerCup: 185 },
  { re: /\bhoney\b/, gramsPerCup: 340 },
  { re: /\bmaple syrup\b/, gramsPerCup: 315 },
  { re: /\bmolasses\b/, gramsPerCup: 320 },
  { re: /\bcorn syrup\b/, gramsPerCup: 328 },
  { re: /\bpeanut butter\b/, gramsPerCup: 270 },
  { re: /\bbutter\b|\bmargarine\b/, gramsPerCup: 227 },
  { re: /\bolive oil\b/, gramsPerCup: 216 },
  { re: /\bcoconut oil\b|\bsesame oil\b|\bvegetable oil\b|\bcanola oil\b|\bsunflower oil\b|\bavocado oil\b/, gramsPerCup: 218 },
  { re: /\boil\b/, gramsPerCup: 216 },
  { re: /\bheavy cream\b|\bdouble cream\b|\bwhipping cream\b/, gramsPerCup: 238 },
  { re: /\bsour cream\b/, gramsPerCup: 230 },
  { re: /\bcream cheese\b/, gramsPerCup: 232 },
  { re: /\bhalf[- ]and[- ]half\b|\bhalf and half\b/, gramsPerCup: 242 },
  { re: /\bbuttermilk\b/, gramsPerCup: 245 },
  { re: /\bgreek yogurt\b|\bgreek yoghurt\b/, gramsPerCup: 270 },
  { re: /\byogurt\b|\byoghurt\b/, gramsPerCup: 245 },
  { re: /\bmayonnaise\b|\bmayo\b/, gramsPerCup: 220 },
  { re: /\bketchup\b/, gramsPerCup: 240 },
  { re: /\bmilk\b/, gramsPerCup: 244 },
  { re: /\bwater\b|\bbroth\b|\bstock\b|\bjuice\b/, gramsPerCup: CUP_ML },
  { re: /\bwine\b/, gramsPerCup: 236 },
  { re: /\bvinegar\b/, gramsPerCup: 239 },
  { re: /\bsoy sauce\b/, gramsPerCup: 270 },
  { re: /\bkosher salt\b|\bflake salt\b|\bflaky salt\b|\bsea salt\b/, gramsPerCup: null },
  { re: /\bsalt\b/, gramsPerCup: 292 },
  { re: /\bbaking powder\b/, gramsPerCup: 192 },
  { re: /\bbaking soda\b/, gramsPerCup: 221 },
  { re: /\byeast\b/, gramsPerCup: 149 },
];

const BUTTER_STICK_G = 113.398;

export function cleanUnitToken(input) {
  return String(input).trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

export function interpretUnit(input) {
  if (input == null || String(input).trim() === "") {
    return { code: null, dimension: null, known: true };
  }
  const cleaned = cleanUnitToken(input).replace(/_/g, " ");
  const direct = ALIAS_TO_UNIT.get(cleaned) || ALIAS_TO_UNIT.get(cleaned.replace(/ /g, "_"));
  const underscored = ALIAS_TO_UNIT.get(cleanUnitToken(input).replace(/ /g, "_"));
  const unit = ALIAS_TO_UNIT.get(cleanUnitToken(input)) || direct || underscored;
  if (unit) return { code: unit.code, dimension: unit.dimension, known: true };
  return { code: cleanUnitToken(input).replace(/\s+/g, "_"), dimension: null, known: false };
}

export function consumeUnit(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const limit = Math.min(3, words.length);
  for (let n = limit; n >= 1; n -= 1) {
    const cleaned = cleanUnitToken(words.slice(0, n).join(" "));
    const unit = ALIAS_TO_UNIT.get(cleaned);
    if (unit) return { code: unit.code, rest: words.slice(n).join(" ") };
  }
  return { code: null, rest: text.trim() };
}

export function roundCooking(value, unit) {
  if (value == null || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  let decimals = 2;
  if (unit === "g" || unit === "ml" || unit === "mg") decimals = abs >= 40 ? 0 : 1;
  else if (unit === "kg" || unit === "l" || unit === "lb") decimals = abs >= 10 ? 1 : 2;
  else if (unit === "oz" || unit === "fl_oz") decimals = 1;
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function lookupGramsPerCup(name) {
  const normalized = String(name || "").toLowerCase();
  if (/\btortilla\b/.test(normalized)) return undefined;
  for (const row of DENSITIES) {
    if (row.re.test(normalized)) return row.gramsPerCup;
  }
  return undefined;
}

function scaled(quantity, quantityMax, factor) {
  return {
    quantity: quantity == null ? null : quantity * factor,
    quantityMax: quantityMax == null ? null : quantityMax * factor,
  };
}

function converted(quantity, quantityMax, unit, confidence) {
  if (quantity == null) return null;
  return {
    quantity: roundCooking(quantity, unit),
    quantityMax: quantityMax == null ? null : roundCooking(quantityMax, unit),
    unit,
    confidence,
  };
}

function exact(quantity, quantityMax, unit) {
  if (quantity == null) return null;
  return { quantity, quantityMax, unit, confidence: "exact" };
}

function chooseUsVolume(ml, mlMax) {
  const cup = ml / CUP_ML;
  if (cup >= 0.24) return { quantity: cup, quantityMax: mlMax == null ? null : mlMax / CUP_ML, unit: "cup" };
  const tbsp = ml / VOLUME_TO_ML.tbsp;
  if (tbsp >= 1) return { quantity: tbsp, quantityMax: mlMax == null ? null : mlMax / VOLUME_TO_ML.tbsp, unit: "tbsp" };
  return { quantity: ml / VOLUME_TO_ML.tsp, quantityMax: mlMax == null ? null : mlMax / VOLUME_TO_ML.tsp, unit: "tsp" };
}

function chooseMetricVolume(ml, mlMax) {
  if (ml >= 1000) return { quantity: ml / 1000, quantityMax: mlMax == null ? null : mlMax / 1000, unit: "l" };
  return { quantity: ml, quantityMax: mlMax, unit: "ml" };
}

function chooseUsMass(grams, gramsMax) {
  const pounds = grams / MASS_TO_G.lb;
  if (pounds >= 1) return { quantity: pounds, quantityMax: gramsMax == null ? null : gramsMax / MASS_TO_G.lb, unit: "lb" };
  return { quantity: grams / MASS_TO_G.oz, quantityMax: gramsMax == null ? null : gramsMax / MASS_TO_G.oz, unit: "oz" };
}

function chooseMetricMass(grams, gramsMax) {
  if (grams >= 1000) return { quantity: grams / 1000, quantityMax: gramsMax == null ? null : gramsMax / 1000, unit: "kg" };
  return { quantity: grams, quantityMax: gramsMax, unit: "g" };
}

function emptyMeasures(quantity, quantityMax, unit) {
  return {
    asWritten: { quantity, quantityMax, unit },
    metric: { mass: null, volume: null },
    us: { mass: null, volume: null },
  };
}

export function buildMeasures(ingredient) {
  const quantity = ingredient.quantity;
  const quantityMax = ingredient.quantityMax;
  const interpreted = interpretUnit(ingredient.unit);
  const unit = interpreted.code;
  const name = ingredient.name || "";
  const flags = { usedDensity: false, skippedSalt: false, unknownUnit: interpreted.known === false };

  if (unit === "stick" && /\bbutter\b|\bmargarine\b/.test(name.toLowerCase())) {
    const grams = scaled(quantity, quantityMax, BUTTER_STICK_G);
    const cups = scaled(quantity, quantityMax, 0.5);
    const ml = scaled(cups.quantity, cups.quantityMax, CUP_ML);
    return {
      unitDimension: "count",
      ...flags,
      measures: {
        asWritten: { quantity, quantityMax, unit },
        metric: {
          mass: converted(grams.quantity, grams.quantityMax, "g", "exact"),
          volume: converted(ml.quantity, ml.quantityMax, "ml", "exact"),
        },
        us: {
          mass: converted(grams.quantity / MASS_TO_G.oz, grams.quantityMax == null ? null : grams.quantityMax / MASS_TO_G.oz, "oz", "exact"),
          volume: exact(cups.quantity, cups.quantityMax, "cup"),
        },
      },
    };
  }

  let grams = null;
  let gramsMax = null;
  let ml = null;
  let mlMax = null;
  let massSource = null;
  let volumeSource = null;
  let massIsEstimate = false;
  let volumeIsEstimate = false;

  if (interpreted.known && quantity != null && interpreted.dimension === "mass") {
    grams = quantity * MASS_TO_G[unit];
    gramsMax = quantityMax == null ? null : quantityMax * MASS_TO_G[unit];
    massSource = { quantity, quantityMax, unit };
  } else if (interpreted.known && quantity != null && interpreted.dimension === "volume") {
    ml = quantity * VOLUME_TO_ML[unit];
    mlMax = quantityMax == null ? null : quantityMax * VOLUME_TO_ML[unit];
    volumeSource = { quantity, quantityMax, unit };
  }

  const saltByCup = /\bsalt\b/.test(name.toLowerCase()) && LARGE_VOLUME.has(unit);
  const gramsPerCup = lookupGramsPerCup(name);
  if (interpreted.dimension === "volume" && grams == null && gramsPerCup != null && !saltByCup && ml != null) {
    const cups = ml / CUP_ML;
    grams = cups * gramsPerCup;
    gramsMax = mlMax == null ? null : (mlMax / CUP_ML) * gramsPerCup;
    massIsEstimate = true;
  } else if (interpreted.dimension === "mass" && ml == null && gramsPerCup && grams != null) {
    const cups = grams / gramsPerCup;
    ml = cups * CUP_ML;
    mlMax = gramsMax == null ? null : (gramsMax / gramsPerCup) * CUP_ML;
    volumeIsEstimate = true;
  }

  for (const extra of statedAmounts(ingredient)) {
    const extraUnit = interpretUnit(extra.unit);
    if (!extraUnit.known || extra.quantity == null) continue;
    if (extraUnit.dimension === "mass" && (grams == null || massIsEstimate)) {
      grams = extra.quantity * MASS_TO_G[extraUnit.code];
      gramsMax = extra.quantityMax == null ? null : extra.quantityMax * MASS_TO_G[extraUnit.code];
      massSource = { quantity: extra.quantity, quantityMax: extra.quantityMax, unit: extraUnit.code };
      massIsEstimate = false;
    } else if (extraUnit.dimension === "volume" && (ml == null || volumeIsEstimate)) {
      ml = extra.quantity * VOLUME_TO_ML[extraUnit.code];
      mlMax = extra.quantityMax == null ? null : extra.quantityMax * VOLUME_TO_ML[extraUnit.code];
      volumeSource = { quantity: extra.quantity, quantityMax: extra.quantityMax, unit: extraUnit.code };
      volumeIsEstimate = false;
    }
  }

  flags.usedDensity = massIsEstimate || volumeIsEstimate;
  flags.skippedSalt = saltByCup && grams == null;
  if (!interpreted.known) flags.unknownUnit = true;

  if (!interpreted.known && grams == null && ml == null) {
    return {
      unitDimension: interpreted.dimension,
      ...flags,
      measures: emptyMeasures(quantity, quantityMax, unit),
    };
  }

  const mass = emitMass(grams, gramsMax, massIsEstimate ? "density" : "exact", massSource);
  const volume = emitVolume(ml, mlMax, volumeIsEstimate ? "density" : "exact", volumeSource);

  return {
    unitDimension: interpreted.dimension,
    ...flags,
    measures: {
      asWritten: { quantity, quantityMax, unit },
      metric: { mass: mass.metric, volume: volume.metric },
      us: { mass: mass.us, volume: volume.us },
    },
  };
}

function statedAmounts(ingredient) {
  return Array.isArray(ingredient.stated) ? ingredient.stated : [];
}

function emitMass(grams, gramsMax, confidence, source) {
  if (grams == null) return { metric: null, us: null };
  const metricChoice = chooseMetricMass(grams, gramsMax);
  const usChoice = chooseUsMass(grams, gramsMax);
  return {
    metric: source && METRIC_MASS.has(source.unit)
      ? exact(source.quantity, source.quantityMax, source.unit)
      : converted(metricChoice.quantity, metricChoice.quantityMax, metricChoice.unit, confidence),
    us: source && US_MASS.has(source.unit)
      ? exact(source.quantity, source.quantityMax, source.unit)
      : converted(usChoice.quantity, usChoice.quantityMax, usChoice.unit, confidence),
  };
}

function emitVolume(ml, mlMax, confidence, source) {
  if (ml == null) return { metric: null, us: null };
  const metricChoice = chooseMetricVolume(ml, mlMax);
  const usChoice = chooseUsVolume(ml, mlMax);
  return {
    metric: source && METRIC_VOLUME.has(source.unit)
      ? exact(source.quantity, source.quantityMax, source.unit)
      : converted(metricChoice.quantity, metricChoice.quantityMax, metricChoice.unit, confidence),
    us: source && US_VOLUME.has(source.unit)
      ? exact(source.quantity, source.quantityMax, source.unit)
      : converted(usChoice.quantity, usChoice.quantityMax, usChoice.unit, confidence),
  };
}

export function applyConversions(doc) {
  let usedDensity = false;
  let skippedSalt = false;
  let unknownUnit = false;

  for (const group of doc.recipe.ingredientGroups) {
    for (const ingredient of group.ingredients) {
      const result = buildMeasures(ingredient);
      delete ingredient.stated;
      ingredient.unitDimension = result.unitDimension;
      ingredient.measures = result.measures;
      usedDensity = usedDensity || result.usedDensity;
      skippedSalt = skippedSalt || result.skippedSalt;
      unknownUnit = unknownUnit || result.unknownUnit;
    }
  }

  if (usedDensity) {
    pushWarning(doc, "Some weights are estimates.");
  }
  if (skippedSalt) {
    pushWarning(doc, "Salt measured in cups was left as volume because brands differ too much to convert safely.");
  }
  if (unknownUnit) {
    pushWarning(doc, "Some units were not recognized and were left as written.");
  }
  return doc;
}

function pushWarning(doc, warning) {
  if (!doc.extraction.warnings.includes(warning)) doc.extraction.warnings.push(warning);
}
