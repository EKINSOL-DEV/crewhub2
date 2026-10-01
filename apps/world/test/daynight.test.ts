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
