/**
 * Small scheduling boundary for room lifecycle work.
 *
 * Production uses platform timers. Tests can supply TestClock to advance time without sleeping,
 * keeping debounce and idle-room tests deterministic.
 */
export interface SyncClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(timer: unknown): void;
}

export const systemClock: SyncClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>),
};

interface ScheduledTask {
  id: number;
  dueAt: number;
  callback: () => void;
}

/** Deterministic timer implementation for unit tests. */
export class TestClock implements SyncClock {
  private currentTime = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, ScheduledTask>();

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.tasks.set(id, { id, dueAt: this.currentTime + Math.max(0, delayMs), callback });
    return id;
  }

  clearTimeout(timer: unknown): void {
    if (typeof timer === "number") this.tasks.delete(timer);
  }

  now(): number {
    return this.currentTime;
  }

  pendingTaskCount(): number {
    return this.tasks.size;
  }

  async advanceBy(delayMs: number): Promise<void> {
    const target = this.currentTime + Math.max(0, delayMs);
    while (true) {
      const next = [...this.tasks.values()]
        .filter((task) => task.dueAt <= target)
        .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)[0];
      if (!next) break;
      this.tasks.delete(next.id);
      this.currentTime = next.dueAt;
      next.callback();
      await Promise.resolve();
    }
    this.currentTime = target;
    await Promise.resolve();
  }
}
