/* The town's prop-request queue (state/propQueue.ts, round 53, review S3): a done prop ticket whose read failed (a 503,
   the host away) is tried again once after the wait; one imported, gone or turned down is not; and a ticket never has
   two imports on their way. The import and the timer are handed in. */
import assert from "node:assert/strict";
import test from "node:test";
import { PROP_RETRY_MS, createPropQueue } from "../src/state/propQueue.ts";

/** A hand-run timer: what was scheduled, and a way to fire it. */
function timers() {
  const pending: { fn: () => void; ms: number }[] = [];
  return {
    pending,
    schedule: (fn: () => void, ms: number) => void pending.push({ fn, ms }),
    fire() {
      for (const { fn } of pending.splice(0)) fn();
    },
  };
}

const quiet = () => {};

test("a failed import is tried again once after the wait, when the request is still listed", async () => {
  const clock = timers();
  const runs: string[] = [];
  let fail = true;
  const listed = ["T-1"];
  const queue = createPropQueue({
    run: async (key) => {
      runs.push(key);
      if (fail) throw new Error("503");
    },
    again: () => queue.offer(listed),
    schedule: clock.schedule,
    warn: quiet,
  });
  queue.offer(listed);
  await queue.idle();
  assert.deepEqual(runs, ["T-1"]);
  assert.deepEqual(clock.pending.map((t) => t.ms), [PROP_RETRY_MS], "one wait is scheduled after the failure");
  queue.offer(listed);
  await queue.idle();
  assert.deepEqual(runs, ["T-1"], "not again before the wait");
  fail = false;
  clock.fire();
  await queue.idle();
  assert.deepEqual(runs, ["T-1", "T-1"], "tried again after the wait");
  assert.equal(clock.pending.length, 0, "a success schedules nothing");
  queue.offer(listed);
  await queue.idle();
  assert.deepEqual(runs, ["T-1", "T-1"], "and is done with");
});

test("after the wait, a request that is no longer listed is not tried again", async () => {
  const clock = timers();
  const runs: string[] = [];
  let listed = ["T-2"];
  const queue = createPropQueue({
    run: async (key) => {
      runs.push(key);
      throw new Error("host away");
    },
    again: () => queue.offer(listed),
    schedule: clock.schedule,
    warn: quiet,
  });
  queue.offer(listed);
  await queue.idle();
  listed = [];
  clock.fire();
  await queue.idle();
  assert.deepEqual(runs, ["T-2"]);
});

test("an import that returns (imported, invalid, gone or turned down) is never tried again", async () => {
  const clock = timers();
  const runs: string[] = [];
  const queue = createPropQueue({ run: async (key) => void runs.push(key), again: () => queue.offer(["T-3", "T-4"]), schedule: clock.schedule, warn: quiet });
  queue.offer(["T-3", "T-4"]);
  await queue.idle();
  queue.offer(["T-3", "T-4"]);
  await queue.idle();
  assert.deepEqual(runs, ["T-3", "T-4"]);
  assert.equal(clock.pending.length, 0);
});

test("one import at a time, and at most one per ticket on its way", async () => {
  const clock = timers();
  const started: string[] = [];
  const release: (() => void)[] = [];
  const queue = createPropQueue({
    run: (key) => {
      started.push(key);
      return new Promise<void>((resolve) => release.push(resolve));
    },
    again: quiet,
    schedule: clock.schedule,
    warn: quiet,
  });
  queue.offer(["T-5", "T-6"]);
  queue.offer(["T-5", "T-6", "T-5"]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["T-5"], "the second waits for the first");
  release.shift()?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, ["T-5", "T-6"]);
  release.shift()?.();
  await queue.idle();
  assert.deepEqual(started, ["T-5", "T-6"]);
});

test("a failure is warned about with its error", async () => {
  const warned: unknown[] = [];
  const error = new Error("503");
  const queue = createPropQueue({
    run: async () => {
      throw error;
    },
    again: quiet,
    schedule: () => {},
    warn: (message, e) => warned.push(message, e),
  });
  queue.offer(["T-7"]);
  await queue.idle();
  assert.deepEqual(warned, ["Prop request failed", error]);
});
