import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFigurePatch,
  createCast,
  figureColor,
  measureFigure,
  referenceKit,
  validateCastManifest,
  validateFigure,
  validateFigurePatch,
  validatePerson,
  wave,
  type CastManifest,
  type FigureSpec,
  type FigureState,
  type Perch,
  type WorkPlace,
} from "../src/index.ts";
import { castProblems, sightProblems } from "../src/index.ts";

const manifest: CastManifest = {
  format: "crewhub-cast/1",
  id: "pegs",
  name: "Pegs",
  version: "1.0.0",
  description: "A peg with a head.",
  colors: { wood: { day: "#bf9873", lamplight: "#bf9873" }, pale: { day: "#f2ecdc", lamplight: "#f2ecdc" } },
  budget: { nearTriangles: 400, farTriangles: 200, nearMeshes: 4, farMeshes: 2 },
};

const figure = (): FigureSpec => ({
  format: "crewhub-figure/1",
  joints: [
    { id: "body", position: [0, 0.2, 0] },
    { id: "head", parent: "body", position: [0, 0.6, 0] },
  ],
  parts: [
    { id: "peg", joint: "body", shape: "cylinder", size: [0.2, 0.6, 0.2], position: [0, 0.3, 0], color: "slot:coat" },
    { id: "knob", joint: "head", shape: "sphere", size: [0.2, 0.2, 0.2], position: [0, 0, 0], color: "pale" },
    { id: "nose", joint: "head", shape: "sphere", size: [0.03, 0.03, 0.03], position: [0, 0, 0.2], color: "accent", detail: "near" },
    { id: "flag", joint: "head", shape: "box", size: [0.1, 0.1, 0.02], position: [0, 0.3, 0], color: "pale", waiting: true },
    { id: "crown", joint: "head", shape: "cone", size: [0.1, 0.1, 0.1], position: [0, 0.25, 0], color: "pale", roles: ["lead"] },
  ],
  poses: { working: { head: { rotation: [10, 0, 0] } }, waiting: { head: { rotation: [0, 0, 20] } }, carrying: { body: { offset: [0, 0.1, 0] } } },
  motions: { working: [{ joint: "head", channel: "rotation.y", wave: "sine", amplitude: 90, period: 4 }], walking: [{ joint: "body", channel: "offset.y", wave: "bounce", amplitude: 0.1, period: 1 }] },
  looks: { working: { parts: { knob: { glow: 0.5 } } }, selected: { parts: { peg: { color: "pale" } } } },
  colorways: { coat: { lead: "soft:accent", others: ["wood", "pale"] } },
  anchors: { label: [0, 1.1, 0], carry: [0, 0.4, 0.3], ground: 0.25, height: 1 },
});

const state = (change: Partial<FigureState>): FigureState => ({ activity: "idle", waiting: false, alert: false, proxy: false, carrying: false, ...change });
const build = (role: "lead" | "worker" = "worker") => {
  const kit = referenceKit(manifest.colors);
  const handle = createCast(manifest, figure(), kit).figure({ key: "a:1", role, accent: role === "lead" ? "coral" : null });
  // The joints ride in the figure's body (the group a perch lifts); the first is the "body" joint, its child the head.
  const body = handle.body.children.find((c) => c.type === "Group")!;
  return { handle, body, head: body.children.find((c) => c.type === "Group")! };
};

test("the validators accept the example and name each problem with its path", () => {
  assert.equal(validateCastManifest(manifest).ok, true);
  assert.equal(validateFigure(figure()).ok, true);
  const bad = figure();
  bad.parts[0]!.joint = "tail";
  bad.parts[1]!.color = "#ffffff";
  bad.motions.working![0]!.joint = "root";
  (bad.anchors as { ground: number }).ground = 0;
  const checked = validateFigure(bad);
  assert.equal(checked.ok, false);
  const errors = checked.ok ? [] : checked.errors;
  for (const path of ["figure.parts[0].joint", "figure.parts[1].color", "figure.motions.working[0].joint", "figure.anchors.ground"]) assert.ok(errors.some((e) => e.startsWith(path)), path);
  const cast = validateCastManifest({ ...manifest, id: "Pegs", colors: { wood: { day: "brown", lamplight: "#000000" } } });
  assert.deepEqual(cast.ok ? [] : cast.errors.map((e) => e.split(":")[0]), ["cast.id", "cast.colors.wood.day"]);
  assert.equal(validateFigurePatch({ format: "crewhub-figure-patch/1", recolor: { wood: "pale" }, remove: ["nose"] }).ok, true);
  assert.equal(validateFigurePatch({ format: "crewhub-figure/1" }).ok, false);
});

test("colourways: the lead takes the soft project tint, others a seeded colour, and an accent without a project falls back", () => {
  const spec = figure();
  assert.equal(figureColor(spec, "slot:coat", { key: "a:1", role: "lead", accent: "coral" }), "soft:coral");
  const seeded = figureColor(spec, "slot:coat", { key: "a:1", role: "worker", accent: "coral" });
  assert.ok(["wood", "pale"].includes(seeded));
  assert.equal(figureColor(spec, "slot:coat", { key: "a:1", role: "worker", accent: null }), seeded, "the same on every load");
  assert.equal(figureColor(spec, "slot:coat", { key: "a:1", role: "lead", accent: null }), seeded);
  assert.equal(figureColor(spec, "accent", { key: "a:1", role: "worker", accent: "coral" }), "coral");
  assert.equal(figureColor(spec, "accent", { key: "a:1", role: "worker", accent: null }), seeded);
});

test("waves", () => {
  assert.ok(Math.abs(wave("sine", 0.25, 2) - 1) < 1e-9);
  assert.ok(Math.abs(wave("bounce", 0.75, 2) - 1) < 1e-9);
  assert.equal(wave("lift", 0.75, 2), 0);
  assert.equal(wave("blink", 0.01, 5), 1);
  assert.equal(wave("blink", 0.5, 5), 0);
  assert.ok(Math.abs(wave("glance", 0.1, 8) - 1) < 1e-9, "the swell peaks 0.8 s in");
  assert.equal(wave("glance", 0.5, 8), 0);
});

test("a figure shows the parts of its role and state, poses in layers and drops small parts far", () => {
  const { handle, head, body } = build();
  const count = () => measureFigure(handle).meshes;
  assert.equal(count(), 3, "peg, knob, nose: no crown for a worker, no flag while not waiting");
  assert.equal(measureFigure(build("lead").handle).meshes, 4);
  handle.setState(state({ activity: "working", waiting: true }));
  assert.equal(count(), 4);
  assert.ok(Math.abs(head.rotation.z - (20 * Math.PI) / 180) < 1e-6, "the waiting pose replaces the working head rotation");
  assert.equal(head.rotation.x, 0);
  handle.setState(state({ activity: "walking", waiting: true, carrying: true }));
  assert.equal(head.rotation.z, 0, "walking wins over the waiting pose");
  assert.ok(Math.abs(body.position.y - 0.3) < 1e-6, "carrying layers on");
  handle.setDetail("far");
  assert.equal(count(), 3, "the nose is dropped far; the flag still shows while waiting");
});

test("motion plays over the still pose and stops for a proxy and a stale figure", () => {
  const { handle, head } = build();
  handle.setState(state({ activity: "working" }));
  handle.update(1);
  assert.ok(Math.abs(head.rotation.y - Math.PI / 2) < 1e-6, "a quarter period in, the sine is at its amplitude");
  assert.ok(Math.abs(head.rotation.x - (10 * Math.PI) / 180) < 1e-6, "the pose stays under the motion");
  handle.setState(state({ activity: "idle" }));
  assert.equal(head.rotation.y, 0, "a new state starts from its still pose");
  for (const still of [state({ activity: "stale" }), state({ activity: "working", proxy: true })]) {
    handle.setState(still);
    handle.update(1);
    assert.equal(head.rotation.y, 0);
  }
});

test("a motion with `carrying` runs only while the figure carries, or only while it does not", () => {
  // The validator: a boolean, nothing else.
  const flagged = figure();
  flagged.motions.walking = [
    { joint: "body", channel: "offset.y", wave: "bounce", amplitude: 0.1, period: 1 },
    { joint: "head", channel: "rotation.y", wave: "sine", amplitude: 30, period: 1, carrying: false },
    { joint: "head", channel: "rotation.z", wave: "sine", amplitude: 10, period: 1, carrying: true },
  ];
  assert.equal(validateFigure(flagged).ok, true);
  const bad = validateFigure({ ...flagged, motions: { walking: [{ ...flagged.motions.walking[1], carrying: "yes" }] } });
  assert.equal(bad.ok, false);
  assert.ok(!bad.ok && bad.errors.some((e) => e.startsWith("figure.motions.walking[0].carrying")), bad.ok ? "" : bad.errors.join("\n"));
  // The runtime: the walk's head turn swings with free hands and holds still with a package; the walk's bounce runs
  // in both; the carrying-only motion runs only with the package.
  const kit = referenceKit(manifest.colors);
  const handle = createCast(manifest, flagged, kit).figure({ key: "a:1", role: "worker", accent: null });
  const body = handle.body.children.find((c) => c.type === "Group")!;
  const head = body.children.find((c) => c.type === "Group")!;
  handle.setState(state({ activity: "walking" }));
  handle.update(0.25);
  assert.ok(Math.abs(head.rotation.y - (30 * Math.PI) / 180) < 1e-6, "free hands: the head turns");
  assert.equal(head.rotation.z, 0, "free hands: no carrying-only motion");
  assert.ok(body.position.y > 0.2, "the bounce runs");
  // The figure's clock runs on: three quarters in, the sine is at minus its amplitude.
  handle.setState(state({ activity: "walking", carrying: true }));
  handle.update(0.5);
  assert.equal(head.rotation.y, 0, "carrying: the head turn is left out, the joint rests in its pose");
  assert.ok(Math.abs(head.rotation.z + (10 * Math.PI) / 180) < 1e-6, "carrying: the carrying-only motion runs");
  assert.ok(Math.abs(body.position.y - 0.4) < 1e-6, "the bounce peaks over the carrying pose (rest 0.2, carried 0.1, bounce 0.1)");
  // Putting the package down alone re-poses: the turn is back (a period and a quarter in).
  handle.setState(state({ activity: "walking" }));
  handle.update(0.5);
  assert.ok(Math.abs(head.rotation.y - (30 * Math.PI) / 180) < 1e-6);
  assert.equal(head.rotation.z, 0);
});

test("looks swap shared materials; a proxy and a stale figure draw their own see-through copies", () => {
  const kit = referenceKit(manifest.colors);
  const handle = createCast(manifest, figure(), kit).figure({ key: "a:1", role: "worker", accent: null });
  // The parts are data until the figure is drawn near (round 23): a reader of meshes asks for them.
  handle.materialise();
  const knob = handle.object.getObjectsByProperty("type", "Mesh").find((m) => (m as import("three").Mesh).material === kit.material("pale")) as import("three").Mesh;
  handle.setState(state({ activity: "working" }));
  assert.equal(knob.material, kit.material("pale", { glow: 0.5 }));
  assert.equal(measureFigure(handle).unbatched, 0);
  handle.setState(state({ activity: "working", proxy: true }));
  assert.notEqual(knob.material, kit.material("pale", { glow: 0.5 }));
  assert.equal((knob.material as import("three").Material).transparent, true);
  assert.equal(knob.castShadow, false);
  handle.setState(state({ activity: "idle" }));
  assert.equal(knob.material, kit.material("pale"), "back on the shared material");
  const same = state({ activity: "idle" });
  knob.material = kit.material("wood");
  handle.setState(same);
  assert.equal(knob.material, kit.material("wood"), "an unchanged state does nothing");
});

test("a patch re-dresses a figure: recolours, drops and adds parts, keeps the rig", () => {
  const base = figure();
  const patched = applyFigurePatch(base, {
    format: "crewhub-figure-patch/1",
    recolor: { pale: "moss", wood: "bark" },
    remove: ["nose"],
    add: [{ id: "leaf", joint: "head", shape: "sphere", size: [0.1, 0.02, 0.1], position: [0, 0.2, 0], color: "moss" }],
    anchors: { height: 1.2 },
  });
  assert.deepEqual(patched.parts.map((p) => p.id), ["peg", "knob", "flag", "crown", "leaf"]);
  assert.equal(patched.parts[1]!.color, "moss");
  assert.deepEqual(patched.colorways.coat, { lead: "soft:accent", others: ["bark", "moss"] });
  assert.equal(patched.looks?.selected?.parts.peg?.color, "moss");
  assert.deepEqual(patched.anchors, { ...base.anchors, height: 1.2 });
  assert.equal(patched.joints, patched.joints);
  assert.equal(base.parts.length, 5, "the base is untouched");
  assert.equal(validateFigure(patched).ok, true);
});

/* ── Perches ──────────────────────────────────────────────────────────── */

/** A desk as a world would tell it: the top above the peg's eyes (0.8 at scale 1), a screen ahead and a little left. */
const desk = (free: { x: number; z: number } | null = { x: 0.1, z: 0.6 }): WorkPlace => ({
  pose: "desk",
  scale: 0.5,
  height: 0.5,
  edge: 0.3,
  focus: [-0.2, 0.7, 0.8],
  screen: [0, -1],
  spot: (radius) => (free && radius <= 0.2 ? free : null),
});
const step: Perch = {
  kind: "step",
  gap: 0.3,
  steps: [
    { id: "crate", height: 0.5, parts: [{ shape: "box", size: [0.4, 0.5, 0.4], position: [0, 0.25, 0], color: "wood" }] },
    { id: "drum", height: 0.5, parts: [{ shape: "cylinder", size: [0.2, 0.5, 0.2], position: [0, 0.25, 0], color: "slot:coat" }] },
  ],
  pose: { head: { rotation: [0, 0, 5] } },
};
const perched = (perch: Record<string, Perch> | undefined, key = "a:1") => {
  const spec = { ...figure(), ...(perch ? { perch } : {}) };
  return createCast(manifest, spec, referenceKit(manifest.colors)).figure({ key, role: "worker", accent: null });
};

test("the validators check a perch: its poses, its steps and their parts", () => {
  assert.equal(validateFigure({ ...figure(), perch: { default: step, "review-table": { kind: "floor" }, "lead-desk": { kind: "surface", base: 0.2 } } }).ok, true);
  assert.equal(validateFigurePatch({ format: "crewhub-figure-patch/1", perch: { desk: { kind: "surface" } } }).ok, true);
  const bad = validateFigure({
    ...figure(),
    perch: {
      sofa: { kind: "surface" },
      desk: { kind: "ladder" },
      "lead-desk": { kind: "step", steps: [] },
      "meeting-table": { kind: "step", gap: -1, steps: [{ id: "Crate", height: 0, parts: [{ shape: "box", size: [1, 1, 1], position: [0, 0, 0], color: "slot:none", joint: "head" }] }], pose: { tail: {} } },
      "planning-table": { kind: "surface", base: 0, steps: [] },
    },
  });
  const errors = bad.ok ? [] : bad.errors;
  for (const path of [
    "figure.perch.sofa",
    "figure.perch.desk.kind",
    "figure.perch.lead-desk.steps",
    "figure.perch.meeting-table.gap",
    "figure.perch.meeting-table.steps[0].id",
    "figure.perch.meeting-table.steps[0].height",
    "figure.perch.meeting-table.steps[0].parts[0].joint",
    "figure.perch.meeting-table.steps[0].parts[0].color",
    "figure.perch.meeting-table.pose.tail",
    "figure.perch.planning-table.base",
    "figure.perch.planning-table.steps",
  ])
    assert.ok(errors.some((e) => e.startsWith(path)), `${path} in\n${errors.join("\n")}`);
});

test("a figure without a perch stays on the floor; too small for the desk, the contract says so", () => {
  const handle = perched(undefined);
  handle.setPerch(desk(), true);
  assert.deepEqual(handle.body.position.toArray(), [0, 0, 0]);
  assert.match(sightProblems(handle, desk(), "peg").join(), /eyes \(40 cm\) are not above the surface \(50 cm\); it needs a perch/);
  const cast = createCast(manifest, figure(), referenceKit(manifest.colors));
  const sight = castProblems(cast, [desk()]).filter((problem) => !castProblems(cast).includes(problem));
  assert.equal(sight.length, 7, "every role is checked at every work place");
  assert.ok(sight.every((problem) => /at the desk: its eyes/.test(problem)));
});

test("a step: seeded per figure, drawn up to the top, the figure on it turned to its screen, and gone again", () => {
  const handle = perched({ default: step });
  const before = measureFigure(handle).meshes;
  handle.setPerch(desk(), true);
  // The edge is 0.3 away at scale 0.5: 0.6 figure units, less the gap of 0.3.
  assert.deepEqual(handle.body.position.toArray().map((n) => +n.toFixed(6)), [0, 0.5, 0.3]);
  assert.ok(handle.body.rotation.y < 0, "turned to the screen on its left");
  assert.equal(measureFigure(handle).meshes, before + 1, "its step stands under it");
  assert.deepEqual(sightProblems(handle, desk(), "peg"), []);
  // The same figure takes the same step on every load; some other figure takes the other one.
  const colour = (h: typeof handle) => {
    h.setPerch(desk(), true);
    let found = "";
    h.materialise();
    h.object.children.forEach((child) => child !== h.body && child.traverse((o) => "material" in o && (found = (o.material as { color: { getHexString(): string } }).color.getHexString())));
    return found;
  };
  assert.equal(colour(perched({ default: step })), colour(perched({ default: step })));
  assert.equal(new Set(["a:1", "a:2", "a:3", "a:4", "a:5", "a:6"].map((key) => colour(perched({ default: step }, key)))).size, 2);
  handle.setPerch(null, true);
  assert.deepEqual(handle.body.position.toArray(), [0, 0, 0]);
  assert.equal(handle.body.rotation.y, 0);
  assert.equal(measureFigure(handle).meshes, before, "the step is gone with it");
});

test("getting on a perch is a hop over a few updates, or a cut", () => {
  const handle = perched({ default: step });
  handle.setPerch(desk());
  assert.equal(handle.body.position.y, 0, "nothing moves before the first update");
  let top = 0;
  for (let i = 0; i < 12; i++) {
    handle.update(1 / 60);
    top = Math.max(top, handle.body.position.y);
  }
  assert.ok(handle.body.position.y > 0.2 && handle.body.position.y < 0.66, "on its way after a fifth of a second");
  for (let i = 0; i < 60; i++) {
    handle.update(1 / 60);
    top = Math.max(top, handle.body.position.y);
  }
  assert.ok(top > 0.55, "the hop arcs over the step");
  assert.ok(Math.abs(handle.body.position.y - 0.5) < 1e-6, "and lands on it");
  // A stale figure stands still, but still gets down.
  handle.setState(state({ activity: "stale" }));
  handle.setPerch(null);
  for (let i = 0; i < 60; i++) handle.update(1 / 60);
  assert.equal(handle.body.position.y, 0);
});

test("on the surface: at the free place the furniture offers, with its perched pose; on the floor when the top is full", () => {
  const sit: Perch = { kind: "surface", base: 0.3, pose: { head: { rotation: [0, 0, 5] } } };
  const { head } = (() => {
    const handle = perched({ default: step, desk: sit });
    handle.setPerch(desk(), true);
    // The spot is in world units, the body in figure units: twice as far at scale 0.5, the top's height too.
    assert.deepEqual(handle.body.position.toArray().map((n) => +n.toFixed(6)), [0.2, 1, 1.2]);
    assert.deepEqual(sightProblems(handle, desk(), "peg"), []);
    handle.setPerch(desk(), true);
    const body = handle.body.children.find((c) => c.type === "Group")!;
    return { head: body.children.find((c) => c.type === "Group")! };
  })();
  assert.ok(Math.abs(head.rotation.z - (5 * Math.PI) / 180) < 1e-6, "the perched pose layers over the activity's");
  const full = perched({ desk: sit });
  full.setPerch(desk(null), true);
  assert.deepEqual(full.body.position.toArray(), [0, 0, 0]);
  // Smaller on the top: its body, and the room it asks for (0.5 x 0.8 x 0.5 = 0.2, the widest this desk offers).
  const small = perched({ desk: { kind: "surface", base: 0.5, scale: 0.8 } });
  small.setPerch(desk(), true);
  assert.ok(Math.abs(small.body.scale.x - 0.8) < 1e-9 && small.body.position.y === 1);
  small.setPerch(null, true);
  assert.equal(small.body.scale.x, 1, "its own size again on the floor");
  assert.equal(validateFigure({ ...figure(), perch: { desk: { kind: "surface", scale: 3 } } }).ok, false);
  const wide = perched({ desk: { kind: "surface" } });
  wide.setPerch(desk(), true);
  assert.deepEqual(wide.body.position.toArray().map((n) => +n.toFixed(6)), [0.2, 1, 1.2], "left out, the base is its ground radius (0.25 at scale 0.5: 0.125)");
  // Behind the screen it cannot read it.
  const behind: WorkPlace = { ...desk({ x: 0, z: 1.2 }), focus: [0, 0.7, 0.8] };
  assert.match(sightProblems(perched({ desk: sit }), behind, "peg").join(), /off the screen's axis/);
});

test("a re-dress keeps its base's perch, recoloured, unless it brings its own", () => {
  const base = { ...figure(), perch: { default: step } };
  const kept = applyFigurePatch(base, { format: "crewhub-figure-patch/1", recolor: { wood: "pale" } });
  assert.equal(kept.perch?.default?.kind === "step" && kept.perch.default.steps[0]!.parts[0]!.color, "pale");
  const own = applyFigurePatch(base, { format: "crewhub-figure-patch/1", perch: { default: { kind: "floor" } } });
  assert.deepEqual(own.perch, { default: { kind: "floor" } });
  assert.equal("perch" in applyFigurePatch(figure(), { format: "crewhub-figure-patch/1" }), false);
});

/* ── The person ───────────────────────────────────────────────────────── */

/** A person in the pegs' language: a peg in a coat with a round head, no accent, no role, no perch. */
const person = (): FigureSpec => ({
  format: "crewhub-figure/1",
  joints: [
    { id: "body", position: [0, 0.2, 0] },
    { id: "head", parent: "body", position: [0, 0.5, 0] },
  ],
  parts: [
    { id: "coat", joint: "body", shape: "cylinder", size: [0.18, 0.5, 0.2], position: [0, 0.25, 0], color: "slot:coat" },
    { id: "head", joint: "head", shape: "sphere", size: [0.16, 0.18, 0.16], position: [0, 0.1, 0], color: "pale" },
    { id: "hair", joint: "head", shape: "sphere", size: [0.17, 0.08, 0.16], position: [0, 0.2, -0.02], color: "wood", detail: "near" },
  ],
  poses: { carrying: { body: { rotation: [5, 0, 0] } } },
  motions: { walking: [{ joint: "body", channel: "offset.y", wave: "bounce", amplitude: 0.05, period: 1 }] },
  colorways: { coat: { others: ["wood", "pale"] } },
  anchors: { label: [0, 1.05, 0], carry: [0, 0.4, 0.25], ground: 0.2, height: 0.95 },
});

test("a person wears no project colour, has no role and never sits at a desk: the validator says so", () => {
  assert.equal(validatePerson(person()).ok, true);
  const bad = person();
  bad.parts[0]!.color = "soft:accent";
  bad.parts[1]!.roles = ["lead"];
  bad.parts[2]!.glow = "accent";
  bad.colorways.coat = { lead: "accent", roles: { worker: "pale" }, others: ["wood"] };
  bad.looks = { selected: { parts: { head: { color: "accent" } } } };
  bad.halo = "soft:accent";
  bad.perch = { default: { kind: "surface" } };
  const checked = validatePerson(bad);
  assert.equal(checked.ok, false);
  const errors = checked.ok ? [] : checked.errors;
  for (const path of ["person.parts[0].color", "person.parts[1].roles", "person.parts[2].glow", "person.colorways.coat.lead", "person.colorways.coat.roles", "person.looks.selected.parts.head.color", "person.halo", "person.perch"])
    assert.ok(errors.some((e) => e.startsWith(path)), `${path} in\n${errors.join("\n")}`);
  assert.equal(errors.length, 8);
  // A figure that is not a figure at all fails as a figure first.
  assert.equal(validatePerson({ ...person(), format: "crewhub-cast/1" }).ok, false);
});

test("a cast without a person draws its plain worker for one; with person data it draws that, seeded by the key", () => {
  const kit = referenceKit(manifest.colors);
  const plain = createCast(manifest, figure(), kit);
  assert.equal(plain.hasPerson, false);
  const stood = plain.person({ key: "visitor" });
  assert.equal(measureFigure(stood).meshes, measureFigure(plain.figure({ key: "visitor", role: "worker", accent: null })).meshes, "the plain worker: peg, knob, nose");
  const own = createCast(manifest, figure(), kit, undefined, person());
  assert.equal(own.hasPerson, true);
  const handle = own.person({ key: "person:nicky" });
  assert.equal(measureFigure(handle).meshes, 3, "coat, head, hair");
  handle.setDetail("far");
  assert.equal(measureFigure(handle).meshes, 2, "the hair is dropped far");
  assert.deepEqual(handle.anchors, person().anchors);
  // The coat's colour is seeded by the key, the same on every load, and never the project colour.
  const coat = (key: string) =>
    (((h) => (h.materialise(), h))(own.person({ key })).object.getObjectsByProperty("type", "Mesh") as import("three").Mesh[]).find((m) => (m.material as import("three").Material).type === "MeshStandardMaterial")!.material;
  assert.equal(coat("person:nicky"), coat("person:nicky"));
  assert.ok([kit.material("wood"), kit.material("pale")].includes(coat("person:sam") as import("three").MeshStandardMaterial));
  // The person figure poses and moves like any figure: the carrying pose and the walk.
  handle.setState(state({ activity: "walking", carrying: true }));
  handle.update(0.25);
  const body = handle.body.children.find((c) => c.type === "Group")!;
  assert.ok(Math.abs(body.rotation.x - (5 * Math.PI) / 180) < 1e-6, "the carrying pose");
  assert.ok(body.position.y > 0.2, "the walk's bounce");
});

test("the contract holds the person to the anchors and the budget, in every state, near and far", () => {
  const kit = referenceKit(manifest.colors);
  // A budget the pegs themselves fit (the manifest's own is a toy one the lead already breaks).
  const roomy: CastManifest = { ...manifest, budget: { nearTriangles: 2000, farTriangles: 1200, nearMeshes: 8, farMeshes: 6 } };
  assert.deepEqual(castProblems(createCast(roomy, figure(), kit, undefined, person())), []);
  const tall = person();
  tall.anchors = { ...tall.anchors, label: [0, 3, 0] };
  assert.match(castProblems(createCast(roomy, figure(), kit, undefined, tall)).join("\n"), /^pegs person: the label anchor/m);
  const heavy = person();
  for (let i = 0; i < 6; i++) heavy.parts.push({ id: `button-${i}`, joint: "body", shape: "sphere", size: [0.03, 0.03, 0.03], position: [0, 0.07 * i, 0.2], color: "pale" });
  const problems = castProblems(createCast(roomy, figure(), kit, undefined, heavy));
  assert.ok(problems.some((p) => /^pegs person: 9 meshes near, over the budget of 8/.test(p)), problems.join("\n"));
  assert.ok(problems.every((p) => p.startsWith("pegs person")), "the roles are untouched by the person");
});
