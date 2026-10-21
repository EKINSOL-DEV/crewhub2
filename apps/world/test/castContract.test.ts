/* The contract every registered cast passes: a fifth cast is covered the moment it is registered. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Vector3 } from "three";
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

/** Carrying looks like carrying (round 4 of the same night): the arms that hold the package do not swing with the walk. */
test("every shipped person's walk leaves the joints of the carrying pose still while carrying", () => {
  for (const id of castRegistry.listCasts().map((m) => m.id)) {
    const person = castRegistry.personOf(id)!;
    const held = Object.keys(person.poses.carrying ?? {});
    assert.ok(held.length > 0, `${id}: the carrying pose holds the package with some joint`);
    // In the data: a walk motion on a held joint is left out while carrying.
    for (const motion of person.motions.walking ?? [])
      if (held.includes(motion.joint)) assert.equal(motion.carrying, false, `${id}: the walk's ${motion.channel} on ${motion.joint} swings while carrying`);
    // In the built figure: the held joints (found by their rest position; a walk moves them by rotation only) keep
    // their rotation frame after frame while walking with the package, and swing with free hands.
    const handle = castRegistry.castFor({ manifest: { id: "reference" } }, id).person({ key: "person:nicky" });
    const groups: import("three").Object3D[] = [];
    handle.body.traverse((o) => {
      if (o.type === "Group" && o !== handle.body) groups.push(o);
    });
    const joints = held.map((joint) => {
      const rest = person.joints.find((j) => j.id === joint)!.position;
      const found = groups.filter((g) => g.position.distanceTo(new Vector3(...rest)) < 1e-9);
      assert.equal(found.length, 1, `${id}: one joint rests at ${rest.join()} (${joint})`);
      return found[0]!;
    });
    const turns = () => joints.map((g) => [g.rotation.x, g.rotation.y, g.rotation.z].map((n) => n.toFixed(6)).join()).join(";");
    const walk = (carrying: boolean) => {
      handle.setState({ activity: "walking", waiting: false, alert: false, proxy: false, carrying });
      handle.update(0.1);
      const a = turns();
      handle.update(0.17);
      return [a, turns()];
    };
    const [heldA, heldB] = walk(true);
    assert.equal(heldA, heldB, `${id}: the held joints are still while carrying`);
    const [freeA, freeB] = walk(false);
    assert.notEqual(freeA, freeB, `${id}: the arms swing with free hands`);
  }
});
