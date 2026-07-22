const publicSvgBrand: unique symbol = Symbol("ValidatedPublicSvg");

/** SVG markup that has crossed the shared public-artifact allowlist. */
export type ValidatedPublicSvg = string & { readonly [publicSvgBrand]: true };

export const MAX_PUBLIC_SVG_BYTES = 512 * 1024;
export const MAX_PUBLIC_SVG_ELEMENTS = 8_192;
export const MAX_PUBLIC_SVG_DEPTH = 64;
export const MAX_PUBLIC_SVG_ATTRIBUTES = 65_536;

export const PUBLIC_SVG_ALLOWED_ELEMENTS = Object.freeze([
  "svg",
  "g",
  "rect",
  "ellipse",
  "circle",
  "path",
  "polygon",
  "text",
] as const);

export const PUBLIC_SVG_ALLOWED_ATTRIBUTES = Object.freeze([
  "xmlns",
  "viewBox",
  "role",
  "aria-label",
  "aria-hidden",
  "focusable",
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "d",
  "points",
  "transform",
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "font-family",
  "font-size",
] as const);

const ALLOWED_ELEMENTS = new Set<string>(PUBLIC_SVG_ALLOWED_ELEMENTS);
const ALLOWED_ATTRIBUTES = new Set<string>(PUBLIC_SVG_ALLOWED_ATTRIBUTES);
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const NUMBER_SOURCE = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const NUMBER_TOKEN = new RegExp(NUMBER_SOURCE, "g");
const NUMBER = new RegExp(`^${NUMBER_SOURCE}$`);
const NUMBER_LIST = new RegExp(`^\\s*${NUMBER_SOURCE}(?:[\\s,]+${NUMBER_SOURCE})*\\s*$`);
const VIEW_BOX = new RegExp(`^\\s*${NUMBER_SOURCE}(?:[\\s,]+${NUMBER_SOURCE}){3}\\s*$`);
const POINTS = NUMBER_LIST;
const PATH_DATA = /^[\s,0-9.+\-eEMmLlHhVvCcSsQqTtAaZz]+$/;
const TRANSFORM = new RegExp(
  `^(?:\\s*(?:translate|scale)\\(\\s*${NUMBER_SOURCE}(?:[\\s,]+${NUMBER_SOURCE})?\\s*\\)){1,8}\\s*$`,
);
const COLOR = /^(?:none|currentColor|transparent|#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,32}|(?:rgb|rgba|hsl|hsla)\([0-9.,%+\-\s/]+\))$/;
const SAFE_TEXT_ATTRIBUTE = /^[^<>\u0000-\u001F\u007F]{0,2000}$/u;
const SAFE_DATA_ATTRIBUTE = /^[^<>\u0000-\u001F\u007F]{0,512}$/u;
const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-fA-F]{1,6});/g;

interface ParsedTag {
  readonly name: string;
  readonly closing: boolean;
  readonly selfClosing: boolean;
  readonly attributes: ReadonlyMap<string, string>;
}

const parseBoundedNumbers = (
  value: string,
  field: string,
  minimum = -1_000_000,
  maximum = 1_000_000,
): number[] => {
  const values = [...value.matchAll(NUMBER_TOKEN)].map((match) => Number(match[0]));
  if (
    values.length === 0 ||
    values.some((number) => !Number.isFinite(number) || number < minimum || number > maximum)
  ) {
    throw new Error(`Portrait SVG ${field} contains an out-of-range number.`);
  }
  return values;
};

const assertEntitiesAreBounded = (value: string, field: string): void => {
  const withoutKnownEntities = value.replace(ENTITY, "");
  if (withoutKnownEntities.includes("&")) {
    throw new Error(`Portrait SVG ${field} contains an unsupported entity.`);
  }
  for (const match of value.matchAll(/&#(x[0-9a-fA-F]+|\d+);/g)) {
    const token = match[1];
    const point = token.startsWith("x")
      ? Number.parseInt(token.slice(1), 16)
      : Number.parseInt(token, 10);
    if (
      !Number.isSafeInteger(point) ||
      point < 0x20 ||
      point > 0x10ffff ||
      (point >= 0xd800 && point <= 0xdfff)
    ) {
      throw new Error(`Portrait SVG ${field} contains an invalid character entity.`);
    }
  }
};

const assertAttributeValue = (name: string, value: string): void => {
  assertEntitiesAreBounded(value, `attribute "${name}"`);
  if (CONTROL_CHARACTERS.test(value)) {
    throw new Error(`Portrait SVG attribute "${name}" contains control characters.`);
  }

  if (["x", "y", "cx", "cy", "r", "rx", "ry", "width", "height", "stroke-width", "font-size"].includes(name)) {
    if (!NUMBER.test(value)) throw new Error(`Portrait SVG attribute "${name}" is not numeric.`);
    const minimum = ["r", "rx", "ry", "width", "height", "stroke-width", "font-size"].includes(name)
      ? 0
      : -1_000_000;
    parseBoundedNumbers(value, `attribute "${name}"`, minimum, 1_000_000);
    return;
  }
  if (["opacity", "fill-opacity"].includes(name)) {
    if (!NUMBER.test(value)) throw new Error(`Portrait SVG attribute "${name}" is not numeric.`);
    const number = Number(value);
    if (number < 0 || number > 1) {
      throw new Error(`Portrait SVG attribute "${name}" is outside the public range.`);
    }
    return;
  }
  if (name === "viewBox") {
    if (!VIEW_BOX.test(value)) throw new Error("Portrait SVG viewBox is invalid.");
    const values = parseBoundedNumbers(value, "viewBox");
    if (values[2] <= 0 || values[3] <= 0) {
      throw new Error("Portrait SVG viewBox dimensions must be positive.");
    }
    return;
  }
  if (name === "points") {
    if (!POINTS.test(value)) throw new Error("Portrait SVG points are invalid.");
    parseBoundedNumbers(value, "points");
    return;
  }
  if (name === "d") {
    if (value.length > 64 * 1024 || !PATH_DATA.test(value)) {
      throw new Error("Portrait SVG path data is invalid.");
    }
    parseBoundedNumbers(value, "path data");
    return;
  }
  if (name === "transform") {
    if (!TRANSFORM.test(value)) throw new Error("Portrait SVG transform is invalid.");
    parseBoundedNumbers(value, "transform", -10_000, 10_000);
    return;
  }
  if (["fill", "stroke"].includes(name)) {
    if (!COLOR.test(value)) throw new Error(`Portrait SVG ${name} is not an inert color.`);
    return;
  }
  if (name === "stroke-dasharray") {
    if (value !== "none" && !NUMBER_LIST.test(value)) {
      throw new Error("Portrait SVG stroke-dasharray is invalid.");
    }
    if (value !== "none") parseBoundedNumbers(value, "stroke-dasharray", 0, 100_000);
    return;
  }
  if (name === "stroke-linecap") {
    if (!["butt", "round", "square"].includes(value)) {
      throw new Error("Portrait SVG stroke-linecap is invalid.");
    }
    return;
  }
  if (name === "stroke-linejoin") {
    if (!["miter", "round", "bevel"].includes(value)) {
      throw new Error("Portrait SVG stroke-linejoin is invalid.");
    }
    return;
  }
  if (name === "font-family") {
    if (value !== "sans-serif") throw new Error("Portrait SVG font-family is unsupported.");
    return;
  }
  if (name === "role") {
    if (value !== "img") throw new Error("Portrait SVG role is unsupported.");
    return;
  }
  if (name === "aria-hidden" || name === "focusable") {
    if (value !== "true" && value !== "false") {
      throw new Error(`Portrait SVG ${name} must be a boolean string.`);
    }
    return;
  }
  if (name === "aria-label") {
    if (!SAFE_TEXT_ATTRIBUTE.test(value)) throw new Error("Portrait SVG aria-label is invalid.");
    return;
  }
  if (name.startsWith("data-")) {
    if (!SAFE_DATA_ATTRIBUTE.test(value)) throw new Error(`Portrait SVG ${name} is invalid.`);
    return;
  }
  if (name === "xmlns") {
    if (value !== "http://www.w3.org/2000/svg") {
      throw new Error("Portrait SVG namespace is invalid.");
    }
    return;
  }
  throw new Error(`Portrait SVG attribute "${name}" is not allowlisted.`);
};

const parseTag = (raw: string): ParsedTag => {
  if (raw.startsWith("<!") || raw.startsWith("<?")) {
    throw new Error("Portrait SVG contains declarations or processing instructions.");
  }
  if (/^<\/?[A-Za-z][A-Za-z0-9-]*:/.test(raw)) {
    throw new Error("Portrait SVG contains an unsafe namespace-qualified name that is not allowlisted.");
  }
  const closing = /^<\//.test(raw);
  if (closing) {
    const match = raw.match(/^<\/([A-Za-z][A-Za-z0-9-]*)\s*>$/);
    if (!match) throw new Error("Portrait SVG contains a malformed closing tag.");
    return { name: match[1], closing: true, selfClosing: false, attributes: new Map() };
  }

  const match = raw.match(/^<([A-Za-z][A-Za-z0-9-]*)([\s\S]*?)(\/?)>$/);
  if (!match) throw new Error("Portrait SVG contains a malformed opening tag.");
  const [, name, attributeSource, slash] = match;
  const attributes = new Map<string, string>();
  let cursor = 0;
  while (cursor < attributeSource.length) {
    const whitespace = attributeSource.slice(cursor).match(/^\s+/);
    if (!whitespace) throw new Error(`Portrait SVG element "${name}" has malformed attributes.`);
    cursor += whitespace[0].length;
    if (cursor === attributeSource.length) break;
    if (/^[A-Za-z][A-Za-z0-9-]*:[A-Za-z][A-Za-z0-9-]*/.test(attributeSource.slice(cursor))) {
      throw new Error("Portrait SVG contains an unsafe namespace-qualified attribute.");
    }
    const nameMatch = attributeSource.slice(cursor).match(/^([A-Za-z][A-Za-z0-9-]*)/);
    if (!nameMatch) throw new Error(`Portrait SVG element "${name}" has an invalid attribute name.`);
    const attributeName = nameMatch[1];
    cursor += attributeName.length;
    const beforeEquals = attributeSource.slice(cursor).match(/^\s*/)?.[0] ?? "";
    cursor += beforeEquals.length;
    if (attributeSource[cursor] !== "=") {
      throw new Error(`Portrait SVG attribute "${attributeName}" has no value.`);
    }
    cursor += 1;
    const afterEquals = attributeSource.slice(cursor).match(/^\s*/)?.[0] ?? "";
    cursor += afterEquals.length;
    const quote = attributeSource[cursor];
    if (quote !== '"' && quote !== "'") {
      throw new Error(`Portrait SVG attribute "${attributeName}" is not quoted.`);
    }
    cursor += 1;
    const endQuote = attributeSource.indexOf(quote, cursor);
    if (endQuote < 0) throw new Error(`Portrait SVG attribute "${attributeName}" is unterminated.`);
    const value = attributeSource.slice(cursor, endQuote);
    cursor = endQuote + 1;

    const collisionKey = attributeName.toLowerCase();
    if ([...attributes.keys()].some((prior) => prior.toLowerCase() === collisionKey)) {
      throw new Error(`Portrait SVG element "${name}" repeats an attribute.`);
    }
    if (!ALLOWED_ATTRIBUTES.has(attributeName) && !/^data-[a-z0-9-]{1,64}$/.test(attributeName)) {
      throw new Error(`Portrait SVG attribute "${attributeName}" is unsafe or not allowlisted.`);
    }
    assertAttributeValue(attributeName, value);
    attributes.set(attributeName, value);
    if (attributes.size > 64) {
      throw new Error(`Portrait SVG element "${name}" has too many attributes.`);
    }
  }
  return { name, closing: false, selfClosing: slash === "/", attributes };
};

const findTagEnd = (content: string, start: number): number => {
  let quote: '"' | "'" | undefined;
  for (let index = start + 1; index < content.length; index += 1) {
    const character = content[index];
    if (quote) {
      if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    } else if (character === "<") {
      break;
    }
  }
  throw new Error("Portrait SVG contains an unterminated tag.");
};

/**
 * Validates the deliberately small, inert SVG dialect shared by every public
 * portrait surface. This is an allowlist validator, not a best-effort scrubber:
 * unsupported or malformed markup is rejected rather than rewritten.
 */
export const validatePublicSvg = (content: string): ValidatedPublicSvg => {
  if (Buffer.byteLength(content, "utf8") > MAX_PUBLIC_SVG_BYTES) {
    throw new Error("Portrait SVG exceeds the 512 KiB public artifact limit.");
  }
  const trimmed = content.trim();
  if (trimmed.length === 0 || CONTROL_CHARACTERS.test(trimmed)) {
    throw new Error("Portrait SVG is empty or contains control characters.");
  }

  const stack: string[] = [];
  let cursor = 0;
  let rootSeen = false;
  let elementCount = 0;
  let attributeCount = 0;
  while (cursor < trimmed.length) {
    const tagStart = trimmed.indexOf("<", cursor);
    const text = tagStart < 0 ? trimmed.slice(cursor) : trimmed.slice(cursor, tagStart);
    assertEntitiesAreBounded(text, "text");
    if (text.trim().length > 0 && stack.at(-1) !== "text") {
      throw new Error("Portrait SVG contains text outside an allowlisted text element.");
    }
    if (tagStart < 0) {
      cursor = trimmed.length;
      break;
    }

    const tagEnd = findTagEnd(trimmed, tagStart);
    const tag = parseTag(trimmed.slice(tagStart, tagEnd + 1));
    if (!ALLOWED_ELEMENTS.has(tag.name)) {
      throw new Error(`Portrait SVG element "${tag.name}" is not allowlisted.`);
    }
    if (stack.at(-1) === "text" && !(tag.closing && tag.name === "text")) {
      throw new Error("Portrait SVG text elements cannot contain child markup.");
    }

    if (tag.closing) {
      if (stack.pop() !== tag.name) throw new Error("Portrait SVG element nesting is invalid.");
    } else {
      elementCount += 1;
      attributeCount += tag.attributes.size;
      if (elementCount > MAX_PUBLIC_SVG_ELEMENTS) {
        throw new Error(`Portrait SVG exceeds ${MAX_PUBLIC_SVG_ELEMENTS} elements.`);
      }
      if (attributeCount > MAX_PUBLIC_SVG_ATTRIBUTES) {
        throw new Error(`Portrait SVG exceeds ${MAX_PUBLIC_SVG_ATTRIBUTES} attributes.`);
      }
      if (!rootSeen) {
        if (tag.name !== "svg" || tag.selfClosing) {
          throw new Error("Portrait artwork is not a complete SVG document.");
        }
        rootSeen = true;
        if (tag.attributes.get("xmlns") !== "http://www.w3.org/2000/svg") {
          throw new Error("Portrait SVG must use exactly the standard SVG namespace.");
        }
      } else if (tag.name === "svg") {
        throw new Error("Portrait SVG cannot contain a nested document root.");
      }
      if (tag.name !== "svg" && tag.attributes.has("xmlns")) {
        throw new Error("Portrait SVG contains a nested namespace declaration.");
      }
      if (!tag.selfClosing) stack.push(tag.name);
      if (stack.length > MAX_PUBLIC_SVG_DEPTH) {
        throw new Error(`Portrait SVG exceeds a nesting depth of ${MAX_PUBLIC_SVG_DEPTH}.`);
      }
    }
    if (rootSeen && stack.length === 0 && tagEnd !== trimmed.length - 1) {
      throw new Error("Portrait SVG contains markup outside its document root.");
    }
    cursor = tagEnd + 1;
  }

  if (!rootSeen || stack.length !== 0 || !trimmed.endsWith("</svg>")) {
    throw new Error("Portrait artwork is not a complete SVG document.");
  }
  return trimmed as ValidatedPublicSvg;
};
