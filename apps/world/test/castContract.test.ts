/* The contract every registered cast passes: a fifth cast is covered the moment it is registered. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { castProblems, validateFigure, validatePerson, WORK_POSES } from "@crewhub/world-cast";
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

/** The four casts that ship each bring a person of their own (spec: "a person looks like a person", 2026-10-21). */
test("every shipped cast draws a person of its own: no project colour, no role, no perch, inside the budget", () => {
  const ids = castRegistry.listCasts().map((m) => m.id);
  assert.deepEqual(ids.sort(), ["classic-bots", "overgrown-bots", "potlings", "sprouts"]);
  for (const id of ids) {
    const person = castRegistry.personOf(id);
    assert.ok(person, `${id} has a person`);
    assert.deepEqual(validatePerson(person), { ok: true, value: person }, id);
    const cast = castRegistry.castFor({ manifest: { id: "reference" } }, id);
    assert.equal(cast.hasPerson, true, id);
    // The person is no agent: nothing of the agent figure's rig is a screen, an antenna or a project band; here, at
    // least, it is a figure of its own (the overgrown person re-dresses the classic one, as its bots do).
    assert.notEqual(person, castRegistry.figureOf(id), `${id}: the person is not the agent figure`);
    // The same person dresses the same on every load, and two people may dress differently.
    const dress = (key: string) =>
      cast
        .person({ key })
        .object.getObjectsByProperty("type", "Mesh")
        .map((m) => (m as import("three").Mesh).material as import("three").Material)
        // The kit's shared materials; the shadow and the halo are the kit's own, fresh per figure.
        .filter((m) => m.type === "MeshStandardMaterial")
        .map((m) => m.uuid)
        .join();
    assert.equal(dress("person:nicky"), dress("person:nicky"));
    assert.ok(new Set(["person:nicky", "person:sam", "person:ada", "person:ben", "visitor", "person:cy"].map(dress)).size > 1, `${id}: seeded clothes`);
  }
});
