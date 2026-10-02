import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { StyleManifest } from "@crewhub/world-style";
import { cloneLight, compileLights, DAY_STOPS, driftLight, drifts, mixLights, sameLight, wrapPhase } from "../src/daylight.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as StyleManifest;
const lights = compileLights(manifest.lighting);
const out = () => cloneLight(lights.day);

test("every lighting preset says how far into the evening it is: day 0, lamplight and night 1", () => {
  assert.equal(manifest.lighting.day.evening, 0);
  assert.equal(manifest.lighting.lamplight.evening, 1);
  assert.equal(manifest.lighting.night?.evening, 1);
  for (const preset of Object.values(manifest.lighting)) assert.ok(preset.evening >= 0 && preset.evening <= 1);
});

test("each theme's day starts and ends on the theme's own light, with stops in order", () => {
  for (const theme of ["day", "lamplight"] as const) {
    const stops = DAY_STOPS[theme];
    assert.equal(stops[0]![0], 0);
    assert.equal(stops.at(-1)![0], 1);
    assert.equal(stops[0]![1], theme);
    assert.equal(stops.at(-1)![1], theme);
    for (let i = 1; i < stops.length; i++) assert.ok(stops[i]![0] >= stops[i - 1]![0]);
    assert.ok(drifts(lights, theme));
    // The morning is the theme's base look, so the drift and the fixed theme agree at the loop's start.
    assert.ok(sameLight(driftLight(lights, theme, 0, out()), lights[theme]));
  }
});

test("the drift lands on its stops and blends smoothly between them", () => {
  assert.ok(sameLight(driftLight(lights, "day", 0.62, out()), lights.dusk!));
  assert.ok(sameLight(driftLight(lights, "day", 0.92, out()), lights.dawn!));
  assert.ok(sameLight(driftLight(lights, "lamplight", 0.75, out()), lights.night!));
  // Half-way from the afternoon to the dusk (smoothstep's middle is the plain middle).
  const half = driftLight(lights, "day", 0.56, out());
  const middle = mixLights(lights.day, lights.dusk!, 0.5, out());
  assert.ok(sameLight(half, middle));
  // No jumps: small steps of the clock make small steps of the light.
  let previous = driftLight(lights, "day", 0, out());
  for (let i = 1; i <= 400; i++) {
    const light = driftLight(lights, "day", i / 400, out());
    assert.ok(Math.abs(light.evening - previous.evening) < 0.05, `evening jumps at ${i / 400}`);
    assert.ok(Math.abs(light.exposure - previous.exposure) < 0.02, `exposure jumps at ${i / 400}`);
    previous = light;
  }
});

test("by day the evening rises at dusk and falls at dawn; in lamplight the lamps stay lit", () => {
  const evening = (theme: "day" | "lamplight", phase: number) => driftLight(lights, theme, phase, out()).evening;
  assert.equal(evening("day", 0.3), 0);
  assert.ok(evening("day", 0.62) > 0.5);
  assert.ok(evening("day", 0.77) > 0.85);
  assert.ok(evening("day", 0.95) < evening("day", 0.85));
  for (let i = 0; i < 20; i++) assert.equal(evening("lamplight", i / 20), 1);
});

test("phases wrap: 1 is the morning again, negative phases count back", () => {
  assert.equal(wrapPhase(1), 0);
  assert.equal(wrapPhase(1.25), 0.25);
  assert.equal(wrapPhase(-0.25), 0.75);
  assert.ok(sameLight(driftLight(lights, "day", 1.62, out()), lights.dusk!));
});

test("a style without drift lights keeps its theme's look at every phase", () => {
  const plain = compileLights({ day: manifest.lighting.day, lamplight: manifest.lighting.lamplight });
  assert.equal(drifts(plain, "day"), false);
  assert.ok(sameLight(driftLight(plain, "day", 0.75, out()), plain.day));
  assert.ok(sameLight(driftLight(plain, "lamplight", 0.75, out()), plain.lamplight));
});

test("the air follows the drift: the theme's own by day, warm at dawn, rosy at dusk, blue-green in the evening", () => {
  const air = (theme: "day" | "lamplight", phase: number) => driftLight(lights, theme, phase, out());
  assert.equal(air("day", 0.3).airTint, 0);
  assert.equal(air("lamplight", 0.3).airTint, 0);
  assert.ok(sameLight(air("day", 0.92), lights.dawn!));
  assert.ok(sameLight(air("day", 0.62), lights.dusk!));
  // The day theme's evening has the night's blue-green air behind its still-lit town.
  const evening = air("day", 0.77);
  assert.ok(evening.air.equals(lights.night!.air) && evening.airTint === lights.night!.airTint);
  // Lamplight shows the dusk and the dawn only in its air, faintly; its light stays the lamplight.
  const dusk = air("lamplight", 0.6);
  assert.ok(dusk.air.equals(lights.dusk!.air) && dusk.airTint > 0 && dusk.airTint < lights.dusk!.airTint);
  assert.equal(dusk.keyIntensity, lights.lamplight.keyIntensity);
  assert.ok(air("lamplight", 0.93).air.equals(lights.dawn!.air));
});
