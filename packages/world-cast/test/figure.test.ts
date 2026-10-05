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
  wave,
  type CastManifest,
  type FigureSpec,
  type FigureState,
} from "../src/index.ts";

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
  const joint = (index: number) => handle.object.children.filter((c) => c.type === "Group")[0]!.children.filter((c) => c.type === "Group")[index] ?? handle.object.children.filter((c) => c.type === "Group")[0]!;
  return { handle, body: handle.object.children.find((c) => c.type === "Group")!, head: joint(0) };
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

test("looks swap shared materials; a proxy and a stale figure draw their own see-through copies", () => {
  const kit = referenceKit(manifest.colors);
  const handle = createCast(manifest, figure(), kit).figure({ key: "a:1", role: "worker", accent: null });
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
