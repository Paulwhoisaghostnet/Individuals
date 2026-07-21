/**
 * A small seqlock with a last-known-good cache. Writers may be long-running;
 * readers therefore receive the prior proven state instead of observing a
 * partially committed mutation. The first read waits if no stable state has
 * ever been captured.
 */
export class ConsistentStateCoordinator<T> {
  private activeMutations = 0;
  private generation = 0;
  private cached: T | undefined;
  private readonly stableWaiters = new Set<() => void>();
  private readonly stableNotifications = new Set<() => void>();

  beginMutation(): () => void {
    this.activeMutations += 1;
    this.generation += 1;
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.activeMutations -= 1;
      this.generation += 1;
      if (this.activeMutations === 0) {
        for (const resolve of this.stableWaiters) resolve();
        this.stableWaiters.clear();
        const notifications = [...this.stableNotifications];
        this.stableNotifications.clear();
        for (const notify of notifications) this.notifySafely(notify);
      }
    };
  }

  /**
   * Runs a failure-isolated notification now, or immediately after the
   * outermost mutation lease releases. The boolean tells callers whether the
   * notification was deferred so they can coalesce repeated publications.
   */
  notifyWhenStable(notification: () => void): boolean {
    if (this.activeMutations === 0) {
      this.notifySafely(notification);
      return false;
    }
    this.stableNotifications.add(notification);
    return true;
  }

  async mutate<R>(operation: () => Promise<R>): Promise<R> {
    const end = this.beginMutation();
    try {
      return await operation();
    } finally {
      end();
    }
  }

  mutateSync<R>(operation: () => R): R {
    const end = this.beginMutation();
    try {
      return operation();
    } finally {
      end();
    }
  }

  async read(reader: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    for (;;) {
      signal?.throwIfAborted();
      if (this.activeMutations > 0) {
        if (this.cached !== undefined) return this.cached;
        await this.waitForStableState(signal);
        continue;
      }

      const generation = this.generation;
      const candidate = await reader();
      signal?.throwIfAborted();
      if (this.activeMutations === 0 && this.generation === generation) {
        this.cached = candidate;
        return candidate;
      }
      if (this.cached !== undefined) return this.cached;
      await this.waitForStableState(signal);
    }
  }

  private async waitForStableState(signal?: AbortSignal): Promise<void> {
    if (this.activeMutations === 0) return Promise.resolve();
    if (!signal) return new Promise<void>((resolve) => this.stableWaiters.add(resolve));
    signal.throwIfAborted();
    let resolveStable!: () => void;
    let rejectAbort!: (reason: unknown) => void;
    const stable = new Promise<void>((resolve) => {
      resolveStable = resolve;
      this.stableWaiters.add(resolve);
    });
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const onAbort = (): void => rejectAbort(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      await Promise.race([stable, aborted]);
    } finally {
      signal.removeEventListener("abort", onAbort);
      this.stableWaiters.delete(resolveStable);
    }
  }

  private notifySafely(notification: () => void): void {
    try {
      notification();
    } catch {
      // A display/telemetry notification cannot invalidate a completed state
      // mutation or strand later stable-state notifications.
    }
  }
}
