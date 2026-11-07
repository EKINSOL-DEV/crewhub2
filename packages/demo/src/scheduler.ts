/**
 * Wall time for the demo. The browser passes `browserScheduler()`; tests pass a manual scheduler
 * and drive it without waiting. The package itself never reads the clock.
 */
export interface Scheduler {
  /** Wall time in ms. */
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export function browserScheduler(): Scheduler {
  return {
    now: () => globalThis.performance.now(),
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof globalThis.setInterval>),
  };
}

export interface ManualScheduler extends Scheduler {
  /** Moves wall time forward, firing due intervals in order. */
  advance(ms: number): void;
}

export function createManualScheduler(start = 0): ManualScheduler {
  let wall = start;
  let nextId = 1;
  const timers = new Map<number, { fn: () => void; every: number; due: number }>();
  return {
    now: () => wall,
    setInterval(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, every: Math.max(1, ms), due: wall + Math.max(1, ms) });
      return id;
    },
    clearInterval(id) {
      timers.delete(id as number);
    },
    advance(ms) {
      const end = wall + ms;
      for (;;) {
        let next: { id: number; due: number } | null = null;
        for (const [id, timer] of timers) {
          if (timer.due <= end && (next === null || timer.due < next.due)) next = { id, due: timer.due };
        }
        if (next === null) break;
        const timer = timers.get(next.id);
        if (timer === undefined) break;
        wall = timer.due;
        timer.due += timer.every;
        timer.fn();
      }
      wall = end;
    },
  };
}
