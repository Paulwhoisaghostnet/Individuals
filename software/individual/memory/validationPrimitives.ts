const UNSAFE_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const requireRecord = (
  value: unknown,
  field: string,
  maxKeys = 128,
): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`);
  if (Object.keys(value).length > maxKeys) throw new Error(`${field} contains too many fields.`);
  return value;
};

export const assertExactKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  field: string,
): void => {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) {
    throw new Error(`${field} contains unsupported field "${unexpected}".`);
  }
};

export const requireString = (
  value: unknown,
  field: string,
  maxLength = 10_000,
  allowEmpty = false,
): string => {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.trim().length === 0) ||
    value.length > maxLength ||
    UNSAFE_CONTROL_CHARACTERS.test(value)
  ) {
    throw new Error(
      `${field} must be ${allowEmpty ? "a" : "a non-empty"} safe string no longer than ${maxLength} characters.`,
    );
  }
  return value;
};

export const requireSafeIdentifier = (
  value: unknown,
  field: string,
  maxLength = 128,
): string => {
  const identifier = requireString(value, field, maxLength);
  if (!SAFE_IDENTIFIER.test(identifier) || RESERVED_KEYS.has(identifier)) {
    throw new Error(`${field} must be a safe, non-reserved identifier.`);
  }
  return identifier;
};

export const requireStringArray = (
  value: unknown,
  field: string,
  maxCount = 64,
  maxItemLength = 2_000,
  allowEmptyItems = false,
): readonly string[] => {
  if (!Array.isArray(value) || value.length > maxCount) {
    throw new Error(`${field} must be an array with no more than ${maxCount} items.`);
  }
  value.forEach((item, index) =>
    requireString(item, `${field}[${index}]`, maxItemLength, allowEmptyItems),
  );
  return value as string[];
};

export const requireUniqueSafeIdentifiers = (
  value: unknown,
  field: string,
  maxCount: number,
  maxItemLength: number,
): readonly string[] => {
  if (!Array.isArray(value) || value.length > maxCount) {
    throw new Error(`${field} must be an array with no more than ${maxCount} items.`);
  }
  const identifiers = value.map((item, index) =>
    requireSafeIdentifier(item, `${field}[${index}]`, maxItemLength),
  );
  if (new Set(identifiers).size !== identifiers.length) {
    throw new Error(`${field} contains duplicate identifiers.`);
  }
  return identifiers;
};

export const requireInteger = (
  value: unknown,
  field: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new Error(`${field} must be a safe integer between ${minimum} and ${maximum}.`);
  }
  return value as number;
};

export const requireFinite = (
  value: unknown,
  field: string,
  minimum = -Number.MAX_VALUE,
  maximum = Number.MAX_VALUE,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be a finite number between ${minimum} and ${maximum}.`);
  }
  return value;
};

export const requireUnitInterval = (value: unknown, field: string): number =>
  requireFinite(value, field, 0, 1);

export const requireBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean.`);
  return value;
};

export const requireTimestamp = (value: unknown, field: string): string => {
  const timestamp = requireString(value, field, 40);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(`${field} must be a valid timestamp.`);
  return timestamp;
};

export const requireEnum = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  field: string,
): T => {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(`${field} is unsupported.`);
  }
  return value as T;
};
