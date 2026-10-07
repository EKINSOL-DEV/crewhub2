/* The contract every registered cast passes: a fifth cast is covered the moment it is registered. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { castProblems, validateFigure, WORK_POSES } from "@crewhub/world-cast";
import type { StyleManifest } from "@crewhub/world-style";
import { castRegistry, FALLBACK_CAST_ID } from "../src/world/cast.ts";
import { FIGURE_SCALE } from "../src/world/castRoomPlan.ts";
import { templateWorkPlaces } from "../src/world/workPlaces.ts";

/** Every style package's manifest, read as data (the style itself draws with the DOM and is not loaded here). */
const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../packages");
const styles = readdirSync(PACKAGES)
  .filter((name) => name.startsWith("style-"))
  .map((name) => JSON.parse(readFileSync(path.join(PACKAGES, name, "style.json"), "utf8")) as Pick<StyleManifest, "id" | "workSurfaces">);
/** One work place of every pose in every style: its tops as its manifest gives them, laid out as a building is. */
const places = styles.flatMap((style) => templateWorkPlaces(style.workSurfaces ?? {}, FIGURE_SCALE));

test("every style gives a top for every work pose", () => {
  assert.ok(styles.length > 0);
  // Two pieces may share a pose (the meeting table and the huddle table): every pose, each at least once.
  for (const style of styles) assert.deepEqual([...new Set(templateWorkPlaces(style.workSurfaces ?? {}, FIGURE_SCALE).map((p) => p.pose))], [...WORK_POSES], style.id);
});

test("the fallback cast is registered", () => {
  assert.ok(castRegistry.has(FALLBACK_CAST_ID));
});

for (const manifest of castRegistry.listCasts())
  test(`cast ${manifest.id}: every role and state builds, inside its budget, batchable far, and sees its work at every work place`, () => {
    const figure = castRegistry.figureOf(manifest.id);
    if (figure) assert.deepEqual(validateFigure(figure), { ok: true, value: figure });
    // Measured with the reference kit (no style): the same shapes as a style's kit draws.
    const cast = castRegistry.castFor({ manifest: { id: "reference" } }, manifest.id);
    assert.equal(cast.manifest.id, manifest.id, "the cast builds (not the fallback)");
    assert.deepEqual(castProblems(cast, places), []);
  });
