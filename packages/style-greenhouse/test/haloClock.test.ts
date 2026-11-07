/* The alert halo's pulse clock (round 50, r50-packages N1): it wraps at the pulse's period, so a halo shown for days
   keeps a smooth pulse in its float32 uniform. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { figureKit } from "../src/figureKit.ts";
import { Kit, type GreenhouseManifestData } from "../src/kit.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { lighting: ConstructorParameters<typeof Kit>[1] };

test("round 50 (N1): the halo's clock wraps at the pulse's period (π s), so the pulse reads the same, and stays small", () => {
  const kit = figureKit(new Kit(manifest, manifest.lighting), { id: "pegs", colors: {} });
  const halo = kit.halo(0.3);
  const time = () => ((halo.object as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uTime!.value as number;
  // The shader's pulse: sin(uTime * 2.0).
  const pulse = (t: number) => Math.sin(t * 2);
  let shown = 0;
  for (let i = 0; i < 1000; i++) {
    halo.update(0.37);
    shown += 0.37;
    assert.ok(time() >= 0 && time() < Math.PI, `uTime ${time()} after ${shown.toFixed(2)} s`);
    assert.ok(Math.abs(pulse(time()) - pulse(shown)) < 1e-6);
  }
  // A day of halo: still under π.
  halo.update(86_400);
  assert.ok(time() < Math.PI, `uTime ${time()} after a day`);
  halo.dispose();
});
