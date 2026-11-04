/* The chat stores on a clock and timers a test moves by hand: `at` sets the time alone, `advance` also runs what fell due. */
import { createChatStores } from "../src/state/chatStores.ts";

export function manualChatStores(start = 0) {
  let wall = start;
  let nextId = 0;
  const timers = new Map<number, { fn: () => void; due: number }>();
  const stores = createChatStores({
    now: () => wall,
    schedule(fn, ms) {
      const id = (nextId += 1);
      timers.set(id, { fn, due: wall + ms });
      return () => void timers.delete(id);
    },
  });
  return {
    stores,
    at(ms: number) {
      wall = ms;
    },
    advance(ms: number) {
      wall += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.due > wall) continue;
        timers.delete(id);
        timer.fn();
      }
    },
    /** How many timers wait: one at most while a bubble lives, none after. */
    armed: () => timers.size,
  };
}
