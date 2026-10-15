import { consumeUnit } from "./units.js";

const FRACTIONS = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const WORDS = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const HYPHEN_SIZE = /^(\d+(?:\.\d+)?)-(oz|ounce|ounces|lb|lbs|pound|pounds|g|gram|grams|kg|ml)\b\s*/i;

function cleanNumber(value) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10000) / 10000;
}

function normalizeFractions(input) {
  return input
    .replace(/\u2044/g, "/")
    .replace(/(\d)\s*([½⅓⅔¼¾⅛⅜⅝⅞])/g, (_, digit, fraction) => `${digit} ${FRACTIONS[fraction]}`)
    .replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, (fraction) => FRACTIONS[fraction]);
}

function parseLooseNumber(token) {
  const mixed = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = token.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

export function parseAmount(note) {
  let text = normalizeFractions(String(note || "")).replace(/\s+/g, " ").trim();
  text = text.replace(/^(about|approximately|approx\.?|roughly)\s+/i, "");
  if (!text) return null;
  const qty = consumeQuantity(text);
  if (qty.value == null) return null;
  const unit = consumeUnit(qty.rest);
  if (!unit.code || unit.rest.trim()) return null;
  return { quantity: qty.value, quantityMax: qty.max, unit: unit.code };
}

function consumeHyphenSize(text) {
  const match = text.match(HYPHEN_SIZE);
  if (!match) return null;
  return {
    stated: parseAmount(`${match[1]} ${match[2]}`),
    rest: text.slice(match[0].length).trim(),
  };
}

function consumeQuantity(text) {
  let rest = text.trim();
  let value = null;

  const mixed = rest.match(/^(\d+)\s+(\d+)\/(\d+)\b/);
  if (mixed) {
    value = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    rest = rest.slice(mixed[0].length).trim();
  } else {
    const fraction = rest.match(/^(\d+)\/(\d+)\b/);
    if (fraction) {
      value = Number(fraction[1]) / Number(fraction[2]);
      rest = rest.slice(fraction[0].length).trim();
    } else {
      const decimal = rest.match(/^(\d+(?:\.\d+)?)(?![.\d])/);
      if (decimal) {
        value = Number(decimal[1]);
        rest = rest.slice(decimal[0].length).trim();
      } else {
        const word = rest.match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i);
        if (word) {
          value = WORDS[word[1].toLowerCase()];
          rest = rest.slice(word[0].length).trim();
        }
      }
    }
  }

  let max = null;
  if (value != null) {
    const range = rest.match(/^(?:-|–|to)\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\b/i);
    if (range) {
      max = parseLooseNumber(range[1]);
      rest = rest.slice(range[0].length).trim();
      if (max === value) max = null;
    }
  }

  return { value: cleanNumber(value), max: cleanNumber(max), rest };
}

function pullParens(text) {
  const notes = [];
  const rest = text
    .replace(/\(([^)]*)\)/g, (_, inner) => {
      const note = inner.trim();
      if (note) notes.push(note);
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { rest, notes };
}

function splitPreparation(name) {
  const parts = name.split(",");
  if (parts.length === 1) return { name: name.trim(), preparation: null };
  return {
    name: parts[0].trim(),
    preparation: parts.slice(1).join(",").trim() || null,
  };
}

function applyTaste(name, preparation, comment) {
  let nextName = name;
  let nextPreparation = preparation;
  let nextComment = comment;
  const inline = nextName.match(/^(.*?)(?:,|\s)\s*to taste$/i);
  if (inline && inline[1].trim()) {
    nextName = inline[1].trim();
    nextComment = nextComment ? `${nextComment}; to taste` : "to taste";
  }
  if (nextPreparation && /^to taste$/i.test(nextPreparation)) {
    nextComment = nextComment ? `${nextComment}; to taste` : "to taste";
    nextPreparation = null;
  }
  return { name: nextName, preparation: nextPreparation, comment: nextComment };
}

export function parseIngredientLine(line) {
  const original = String(line || "").replace(/\s+/g, " ").trim();
  if (!original) {
    return {
      text: "",
      name: "",
      quantity: null,
      quantityMax: null,
      unit: null,
      preparation: null,
      optional: false,
      comment: null,
      stated: [],
    };
  }

  let text = original.replace(/^[\s*\-•–]+/, "").trim();
  const optional = /\boptional\b/i.test(text);
  text = text.replace(/\(\s*optional\s*\)/gi, " ");
  text = text.replace(/,?\s*\boptional\b\.?$/i, "");
  text = normalizeFractions(text).replace(/\s+/g, " ").trim();

  const parens = pullParens(text);
  text = parens.rest;

  let comment = null;
  let quantity = null;
  let quantityMax = null;
  const stated = [];

  const leadingSize = consumeHyphenSize(text);
  if (leadingSize) {
    if (leadingSize.stated) stated.push(leadingSize.stated);
    text = leadingSize.rest;
  }

  const qty = consumeQuantity(text);
  if (qty.value != null) {
    quantity = qty.value;
    quantityMax = qty.max;
    text = qty.rest;
    const trailingSize = consumeHyphenSize(text);
    if (trailingSize) {
      if (trailingSize.stated) stated.push(trailingSize.stated);
      text = trailingSize.rest;
    }
  }

  const unitHit = consumeUnit(text);
  text = unitHit.rest.replace(/^of\s+/i, "").trim();
  const split = splitPreparation(text);
  let name = split.name;
  let preparation = split.preparation;

  for (const note of parens.notes) {
    if (/^optional$/i.test(note)) continue;
    const amount = parseAmount(note);
    if (amount) {
      stated.push(amount);
      continue;
    }
    if (/\d/.test(note)) comment = comment ? `${comment}; ${note}` : note;
    else preparation = preparation ? `${preparation}, ${note}` : note;
  }

  const taste = applyTaste(name, preparation, comment);
  name = taste.name.replace(/[*†‡]+$/g, "").trim();
  preparation = taste.preparation;
  comment = taste.comment;

  return {
    text: original,
    name,
    quantity,
    quantityMax,
    unit: unitHit.code,
    preparation,
    optional,
    comment,
    stated,
  };
}
