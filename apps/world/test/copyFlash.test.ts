/* The Pair screen's Copy button (components/PairPage.tsx) as a pure helper (round 50, r48-ui N1 and N3): a copy that
   cannot happen (no clipboard: an insecure origin, a LAN address over http) or that the browser refuses says so, and
   the 2 s timer that turns "Copied" back is cancelled when the screen goes. No DOM: the clipboard and the timer are
   injected. */
import assert from "node:assert/strict";
import test from "node:test";
import { createCopyFlash, type CopyState } from "../src/state/copyFlash.ts";

function rig() {
  const states: CopyState[] = [];
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const flash = createCopyFlash((s) => states.push(s), (fn, ms) => {
    const timer = { fn, ms, cancelled: false };
    timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  });
  const fire = () => {
    for (const t of timers.splice(0)) if (!t.cancelled) t.fn();
  };
  return { flash, states, timers, fire };
}

test("copyFlash: a copy that works says Copied, and Copy again after 2 s", async () => {
  const { flash, states, timers, fire } = rig();
  assert.equal(await flash.copy({ writeText: async () => undefined }, "npm run world"), "copied");
  assert.deepEqual(timers.map((t) => t.ms), [2000]);
  fire();
  assert.deepEqual(states, ["copied", "idle"]);
});

test("copyFlash (N1): no clipboard, or one that refuses, says it failed instead of nothing", async () => {
  const { flash, states } = rig();
  assert.equal(await flash.copy(undefined, "npm run world"), "failed");
  assert.equal(await flash.copy({ writeText: () => Promise.reject(new Error("NotAllowedError")) }, "npm run world"), "failed");
  assert.deepEqual(states, ["failed", "failed"]);
});

test("copyFlash (N3): the timer that turns Copied back is cancelled when the screen goes, and a late copy changes nothing", async () => {
  const { flash, states, timers, fire } = rig();
  await flash.copy({ writeText: async () => undefined }, "npm run world");
  flash.dispose();
  assert.ok(timers.every((t) => t.cancelled), "the pending timer is cancelled");
  fire();
  let resolve!: () => void;
  const late = flash.copy({ writeText: () => new Promise<void>((r) => (resolve = r)) }, "npm run world");
  resolve();
  await late;
  assert.deepEqual(states, ["copied"], "nothing after dispose");
});
