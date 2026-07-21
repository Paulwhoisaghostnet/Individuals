/**
 * Detaches accepted protocol/state values from caller- or adapter-owned object
 * graphs, then recursively freezes the bridge-owned copy.
 *
 * Inter-site schemas contain only structured-clone-safe data. Validation still
 * runs at each protocol boundary; this module owns reference isolation rather
 * than schema policy.
 */
export const detachedCopy = <T>(value: T): T => structuredClone(value);

export const deepFreeze = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
};

export const detachedImmutableCopy = <T>(value: T): T => deepFreeze(detachedCopy(value));
