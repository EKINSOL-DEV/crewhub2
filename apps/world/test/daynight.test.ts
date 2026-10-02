import assert from "node:assert/strict";
import test from "node:test";
import { DAYNIGHT_KEY, defaultDayNight, readDayNight, writeDayNight } from "../src/state/daynight.ts";
import { DAY_LENGTH_MS, dayPhase, driftPhase } from "../src/world/dayClock.ts";

test("one day of the drift is one 16-minute loop of the demo script, from the morning", () => {
  assert.equal(DAY_LENGTH_MS, 16 * 60_000);
  assert.equal(dayPhase(0), 0);
  assert.equal(dayPhase(4 * 60_000), 0.25);
  assert.equal(dayPhase(12 * 60_000), 0.75);
  // Every loop starts from the same morning; source time before the start counts back.
  assert.equal(dayPhase(DAY_LENGTH_MS * 3 + 4 * 60_000), 0.25);
  assert.equal(dayPhase(-4 * 60_000), 0.75);
  assert.equal(dayPhase(60_000, 4 * 60_000), 0.25);
});

test("reduced motion, Fast and the setting off keep the theme's own light", () => {
  const at = { dayNight: true, reducedMotion: false, quality: "pretty" as const, sinceStartMs: 8 * 60_000 };
  assert.equal(driftPhase(at), 0.5);
  assert.equal(driftPhase({ ...at, dayNight: false }), null);
  assert.equal(driftPhase({ ...at, reducedMotion: true }), null);
  assert.equal(driftPhase({ ...at, quality: "fast" }), null);
});

test("the Day and night setting is on in demo mode and off in live mode until the viewer chooses", () => {
  assert.equal(defaultDayNight("demo"), true);
  assert.equal(defaultDayNight("live"), false);
  assert.equal(readDayNight("demo", null), true);
  assert.equal(readDayNight("live", null), false);
  const store = new Map<string, string>();
  const memory = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  writeDayNight(false, memory);
  assert.equal(store.get(DAYNIGHT_KEY), "off");
  assert.equal(readDayNight("demo", memory), false);
  writeDayNight(true, memory);
  assert.equal(readDayNight("live", memory), true);
  const throwing = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readDayNight("demo", throwing), true);
  assert.doesNotThrow(() => writeDayNight(true, throwing));
});

test("the light follows the clock exactly up to 4x, keeps a 4x pace beyond, and snaps on a seek", async () => {
  const { followPhase, MAX_DRIFT_SPEED } = await import("../src/world/dayClock.ts");
  const day = 16 * 60_000;
  let s = followPhase({ phase: null, clock: 0, wall: 0 }, 0.5, 8 * 60_000, 0);
  assert.equal(s.phase, 0.5);
  // 4x: one second of real time is four seconds of the day, followed exactly.
  s = followPhase(s, 0.5 + 4000 / day, 8 * 60_000 + 4000, 1000);
  assert.ok(Math.abs(s.phase! - (0.5 + 4000 / day)) < 1e-9);
  // 16x: sixteen seconds of the day in one real second; the light moves at most MAX_DRIFT_SPEED of them.
  const before = s.phase!;
  s = followPhase(s, before + 16000 / day, s.clock + 16000, s.wall + 1000);
  assert.ok(Math.abs(s.phase! - (before + (MAX_DRIFT_SPEED * 1000) / day)) < 1e-9);
  // It never runs backwards in forward play, even far behind the clock.
  const behind = followPhase({ phase: 0.9, clock: 0, wall: 0 }, 0.3, 16000, 1000);
  assert.ok(behind.phase! > 0.9 || behind.phase! < 0.1);
  // A seek (source time jumps more than play explains) or a jump back snaps; null keeps the theme's look.
  assert.equal(followPhase({ phase: 0.2, clock: 0, wall: 0 }, 0.7, 8 * 60_000, 100).phase, 0.7);
  assert.equal(followPhase({ phase: 0.7, clock: 8 * 60_000, wall: 0 }, 0.2, 1000, 100).phase, 0.2);
  assert.equal(followPhase({ phase: 0.7, clock: 0, wall: 0 }, null, 1000, 100).phase, null);
  // Paused: the clock stands still, so does the light.
  assert.equal(followPhase({ phase: 0.4, clock: 5000, wall: 0 }, 0.4, 5000, 250).phase, 0.4);
});
