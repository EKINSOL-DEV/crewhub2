/* The contract every registered cast passes: a fifth cast is covered the moment it is registered. */
import assert from "node:assert/strict";
import test from "node:test";
import { castProblems, validateFigure } from "@crewhub/world-cast";
import { castRegistry, FALLBACK_CAST_ID } from "../src/world/cast.ts";

test("the fallback cast is registered", () => {
  assert.ok(castRegistry.has(FALLBACK_CAST_ID));
});

for (const manifest of castRegistry.listCasts())
  test(`cast ${manifest.id}: every role and state builds, inside its budget, batchable far`, () => {
    const figure = castRegistry.figureOf(manifest.id);
    if (figure) assert.deepEqual(validateFigure(figure), { ok: true, value: figure });
    // Measured with the reference kit (no style): the same shapes as a style's kit draws.
    const cast = castRegistry.castFor({ manifest: { id: "reference" } }, manifest.id);
    assert.equal(cast.manifest.id, manifest.id, "the cast builds (not the fallback)");
    assert.deepEqual(castProblems(cast), []);
  });
