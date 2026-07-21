const canonicalize = (value: unknown, seen: Set<object>): string => {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("Canonical JSON cannot contain cycles.");
    seen.add(value);
    const result = `[${value.map((item) => canonicalize(item, seen)).join(",")}]`;
    seen.delete(value);
    return result;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new Error("Canonical JSON cannot contain cycles.");
    seen.add(value);
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => {
        if (record[key] === undefined) {
          throw new Error(`Canonical JSON field "${key}" cannot be undefined.`);
        }
        return `${JSON.stringify(key)}:${canonicalize(record[key], seen)}`;
      });
    seen.delete(value);
    return `{${entries.join(",")}}`;
  }
  throw new Error(`Canonical JSON cannot represent ${typeof value}.`);
};

export const canonicalJson = (value: unknown): string => canonicalize(value, new Set());
