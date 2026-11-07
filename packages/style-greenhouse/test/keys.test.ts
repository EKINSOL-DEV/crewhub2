/* Round 61 (W11): a desk top's height is said once. Where style.json's `workSurfaces` has the top, `SURFACES` (what the
   style sets as `userData.surface`) reads it, and a desk's screen glow sits on `SURFACES`. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ModelKey } from "@crewhub/world-style";
import { LIGHT_POOLS, SURFACES, type LightPool } from "../src/keys.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { workSurfaces } = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as { workSurfaces: Record<string, { height: number }> };
/** The height above a desk's top at which its glow lies, so the decal does not fight the top. */
const GLOW_LIFT = 0.004;

test("the tops the manifest and SURFACES share are the manifest's; its other work surfaces stay out of SURFACES", () => {
  const shared = Object.keys(workSurfaces).filter((key) => key in SURFACES);
  assert.deepEqual(shared, ["furniture.workdesk", "furniture.lead-desk", "furniture.huddle-table"]);
  for (const key of shared) assert.equal(SURFACES[key as ModelKey], workSurfaces[key]!.height, key);
});

test("a desk's screen glow lies on the top SURFACES gives it", () => {
  for (const desk of ["furniture.workdesk", "furniture.lead-desk", "furniture.desk"] as const) {
    const [onTheDesk] = LIGHT_POOLS[desk] as LightPool[];
    assert.equal(onTheDesk!.y, SURFACES[desk]! + GLOW_LIFT, desk);
  }
});
