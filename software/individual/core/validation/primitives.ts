const textEncoder = new TextEncoder();
const ROUTE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const DISALLOWED_TEXT_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

export const utf8Bytes = (value: string): number => textEncoder.encode(value).byteLength;

export const requireRecord = (value: unknown, field: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
};

export const requireExactKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
  field: string,
): void => {
  const accepted = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !accepted.has(key) || UNSAFE_OBJECT_KEYS.has(key))
  ) {
    throw new Error(`${field} has an invalid field set.`);
  }
};

export const requireBoundedText = (
  value: unknown,
  field: string,
  maximumBytes: number,
  allowEmpty = false,
): string => {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.trim().length === 0) ||
    utf8Bytes(value) > maximumBytes ||
    DISALLOWED_TEXT_CONTROLS.test(value)
  ) {
    throw new Error(`${field} exceeds accepted text bounds.`);
  }
  return value;
};

export const requireRouteId = (
  value: unknown,
  field: string,
  maximumBytes = 256,
): string => {
  const id = requireBoundedText(value, field, maximumBytes);
  if (!ROUTE_ID.test(id) || UNSAFE_OBJECT_KEYS.has(id)) {
    throw new Error(`${field} is not a safe route identifier.`);
  }
  return id;
};

export const requireUtcTimestamp = (
  value: unknown,
  field: string,
  maximumBytes = 64,
): string => {
  const timestamp = requireBoundedText(value, field, maximumBytes);
  if (!UTC_TIMESTAMP.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    throw new Error(`${field} is not a bounded UTC timestamp.`);
  }
  return timestamp;
};

export const requireFinite = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${field} is outside accepted numeric bounds.`);
  }
  return value;
};

export const requireUnit = (value: unknown, field: string): number =>
  requireFinite(value, field, 0, 1);

export const requireBoundedStringArray = (
  value: unknown,
  field: string,
  maximumItems: number,
  maximumItemBytes: number,
  ids = false,
): readonly string[] => {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw new Error(`${field} exceeds accepted array bounds.`);
  }
  const result = value.map((item, index) =>
    ids
      ? requireRouteId(item, `${field}[${index}]`, maximumItemBytes)
      : requireBoundedText(item, `${field}[${index}]`, maximumItemBytes, true),
  );
  if (new Set(result).size !== result.length) {
    throw new Error(`${field} contains duplicate entries.`);
  }
  return result;
};
