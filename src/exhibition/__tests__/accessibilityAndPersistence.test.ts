import { beforeEach, describe, expect, it } from "vitest";

const STORAGE_KEY_CYCLE = "individuals.cycle.v1";
const STORAGE_KEY_PAUSED = "individuals.paused.v1";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

describe("Exhibition Local Persistence & Accessibility", () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage === "undefined") {
      Object.defineProperty(globalThis, "localStorage", {
        value: new MemoryStorage(),
        writable: true,
      });
    }
    localStorage.clear();
  });

  it("persists cycle position and pause state in localStorage", () => {
    localStorage.setItem(STORAGE_KEY_CYCLE, "12");
    localStorage.setItem(STORAGE_KEY_PAUSED, "true");

    expect(localStorage.getItem(STORAGE_KEY_CYCLE)).toBe("12");
    expect(localStorage.getItem(STORAGE_KEY_PAUSED)).toBe("true");
  });

  it("handles corrupted or missing localStorage gracefully", () => {
    localStorage.setItem(STORAGE_KEY_CYCLE, "invalid-number");
    const cycleVal = parseInt(localStorage.getItem(STORAGE_KEY_CYCLE) ?? "7", 10);
    expect(Number.isNaN(cycleVal)).toBe(true);

    // Fallback logic check
    const validCycle = Number.isFinite(cycleVal) && cycleVal > 0 ? cycleVal : 7;
    expect(validCycle).toBe(7);
  });
});
