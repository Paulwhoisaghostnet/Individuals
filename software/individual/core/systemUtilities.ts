import type { Clock, IdGenerator } from "./systems/contracts";

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

export class StableIdGenerator implements IdGenerator {
  create(parts: readonly (string | number)[]): string {
    return parts.map(String).join("--");
  }
}
