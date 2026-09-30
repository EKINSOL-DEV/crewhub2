import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import {
  PROP_LIMITS,
  occupancy,
  partBounds,
  toPropDefinition,
  validateLayout,
  validatePropModel,
  type PropPart,
  type WorldLayout,
} from "../src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** A small valid prop; `patch` replaces top-level keys, `part` replaces keys of the first part. */
function prop(patch: Record<string, unknown> = {}, part: Record<string, unknown> = {}) {
  return {
    format: "crewhub-prop/1",
    id: "user:test-crate",
    name: "Test crate",
    description: "A crate.",
    category: "storage",
    tags: ["crate"],
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    approaches: [{ x: 0, z: 1 }],
    parts: [{ shape: "box", size: [0.5, 0.5, 0.5], position: [0, 0.25, 0], material: "clay", ...part }],
    ...patch,
  };
}
function errors(value: unknown) {
  const r = validatePropModel(value);
  return r.ok ? [] : r.errors.map((e) => `${e.path}: ${e.message}`);
}
function assertError(value: unknown, path: string, fragment: string) {
  const list = errors(value);
  assert.ok(
    list.some((e) => e.startsWith(`${path}: `) && e.includes(fragment)),
    `expected "${path}: …${fragment}…", got ${JSON.stringify(list)}`,
  );
}

test("a valid prop passes, is copied, and has no warnings", () => {
  const input = prop();
  const r = validatePropModel(input);
  assert.ok(r.ok);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.value, input);
  assert.notEqual(r.value, input);
});

test("top-level rules report precise paths", () => {
  assertError(null, "(root)", "JSON object");
  assertError(prop({ format: "crewhub-prop/2" }), "format", "crewhub-prop/1");
  assertError(prop({ id: "custom:crate" }), "id", "user:");
  assertError(prop({ id: "user:Crate" }), "id", "kebab");
  assertError(prop({ id: "user:crate--big" }), "id", "kebab");
  assertError(prop({ id: `user:${"a".repeat(41)}` }), "id", "at most 40");
  assert.deepEqual(errors(prop({ id: "builtin:desk" })), []);
  assertError(prop({ name: "   " }), "name", "1 to 40");
  assertError(prop({ name: "x".repeat(41) }), "name", "1 to 40");
  assertError(prop({ description: "x".repeat(201) }), "description", "at most 200");
  assertError(prop({ category: "kitchen" }), "category", '"work"');
  assertError(prop({ tags: "crate" }), "tags", "array");
  assertError(prop({ tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }), "tags", "at most 8");
  assertError(prop({ tags: ["ok", "Not Kebab"] }), "tags[1]", "kebab-case");
  assertError(prop({ tags: ["a", "a"] }), "tags[1]", "duplicate");
  assertError(prop({ blocksMovement: "yes" }), "blocksMovement", "true or false");
  const { parts: _, ...noParts } = prop();
  assertError(noParts, "parts", "is required");
});

test("footprint and approaches follow the engine's rules", () => {
  assertError(prop({ footprint: { width: 0, depth: 1 } }), "footprint.width", "between 1 and 6");
  assertError(prop({ footprint: { width: 2, depth: 7 } }), "footprint.depth", "between 1 and 6");
  assertError(prop({ footprint: { width: 1.5, depth: 1 } }), "footprint.width", "integer");
  assertError(prop({ approaches: [{ x: 0, z: 2 }] }), "approaches[0]", "one cell around it");
  assertError(prop({ approaches: [{ x: 0.5, z: 1 }] }), "approaches[0]", "integers");
  assertError(prop({ approaches: [{ x: 0, z: 0 }] }), "approaches[0]", "inside a blocking footprint");
  assert.deepEqual(errors(prop({ blocksMovement: false, approaches: [{ x: 0, z: 0 }] })), []);
  assertError(prop({ approaches: [{ x: 0, z: 1 }, { x: 0, z: 1 }] }), "approaches[1]", "duplicate");
  assertError(
    prop({ approaches: Array.from({ length: 9 }, (_, i) => ({ x: -1, z: i - 1 })) }),
    "approaches",
    "at most 8",
  );
});

test("part rules: shapes, named materials, sizes per shape, rotation and radius", () => {
  assertError(prop({ parts: [] }), "parts", "1 to 64");
  const part = prop().parts[0]!;
  assertError(prop({ parts: Array.from({ length: 65 }, () => part) }), "parts", "1 to 64");
  assertError(prop({}, { shape: "pyramid" }), "parts[0].shape", '"box"');
  assertError(prop({}, { material: "#ff0000" }), "parts[0].material", "hex colours are not allowed");
  assertError(prop({}, { size: [0.5, 3.5, 0.5] }), "parts[0].size[1]", "must be between 0.01 and 3");
  assertError(prop({}, { size: [0.5, 0.005, 0.5] }), "parts[0].size[1]", "must be between 0.01 and 3");
  assertError(prop({}, { size: [0.5, 0.5] }), "parts[0].size", "three numbers");
  assertError(prop({}, { size: [0.5, Number.NaN, 0.5] }), "parts[0].size[1]", "finite");
  assertError(prop({}, { position: [0, Infinity, 0] }), "parts[0].position[1]", "finite");
  assertError(prop({}, { shape: "cone", size: [0.2, 0.3, 0.2], position: [0, 0.15, 0] }), "parts[0].size[2]", "must be 0");
  assertError(prop({}, { shape: "torus", size: [0.1, 0.2, 0], position: [0, 0.2, 0] }), "parts[0].size[1]", "at most the radius");
  assertError(prop({}, { shape: "cylinder", size: [0, 0.3, 0], position: [0, 0.15, 0] }), "parts[0].size", "radiusTop or radiusBottom");
  assert.deepEqual(errors(prop({}, { shape: "cylinder", size: [0, 0.3, 0.2], position: [0, 0.15, 0] })), []);
  assertError(prop({}, { rotation: [0, 400, 0] }), "parts[0].rotation[1]", "-360 and 360");
  assertError(prop({}, { shape: "sphere", size: [0.2, 0.2, 0.2], position: [0, 0.2, 0], radius: 0.1 }), "parts[0].radius", "only allowed on a box");
  assertError(prop({}, { radius: 0.6 }), "parts[0].radius", "between 0 and 0.5");
  assertError(prop({}, { emissive: 1 }), "parts[0].emissive", "true or false");
});

test("unknown keys are rejected everywhere, as an import format should", () => {
  assertError(prop({ colour: "red" }), "colour", "unknown key");
  assertError(prop({}, { color: "red" }), "parts[0].color", "unknown key");
  assertError(prop({ footprint: { width: 1, depth: 1, height: 2 } }), "footprint.height", "unknown key");
  assertError(prop({ approaches: [{ x: 0, z: 1, y: 0 }] }), "approaches[0].y", "unknown key");
  assertError(prop({ provenance: { kind: "local", ticketKey: "CR-1" } }), "provenance.ticketKey", "unknown key");
});

test("provenance is optional and either a ticket key or local", () => {
  assert.deepEqual(errors(prop({ provenance: { kind: "ticket", ticketKey: "CR-12" } })), []);
  assert.deepEqual(errors(prop({ provenance: { kind: "local" } })), []);
  assertError(prop({ provenance: { kind: "ticket", ticketKey: "" } }), "provenance.ticketKey", "ticket key");
  assertError(prop({ provenance: { kind: "upload" } }), "provenance.kind", '"ticket" or "local"');
});

test("parts must fit the footprint plus the overhang, above the floor and below the ceiling", () => {
  // 1x1: half-width 0.3 + 0.1 overhang = 0.4.
  assert.deepEqual(errors(prop({}, { size: [0.8, 0.5, 0.5] })), []);
  assertError(prop({}, { size: [0.82, 0.5, 0.5] }), "parts[0].position[0]", "outside the footprint");
  assertError(prop({}, { position: [0, 0.25, 0.2] }), "parts[0].position[2]", "outside the footprint");
  assert.deepEqual(errors(prop({ footprint: { width: 2, depth: 1 }, approaches: [] }, { position: [0.3, 0.25, 0] })), []);
  assertError(prop({}, { position: [0, 0.2, 0] }), "parts[0].position[1]", "below the floor");
  assertError(prop({}, { position: [0, -0.5, 0] }), "parts[0]", "fully below the floor");
  assertError(prop({}, { position: [0, 2.8, 0] }), "parts[0].position[1]", "above 3");
});

test("bounds follow the rotation of each part", () => {
  const plank = { shape: "box", size: [0.9, 0.1, 0.1], position: [0, 0.45, 0] };
  assertError(prop({}, plank), "parts[0].position[0]", "outside the footprint");
  // Standing it up (90° about z) moves its length onto y: it fits.
  assert.deepEqual(errors(prop({}, { ...plank, rotation: [0, 0, 90] })), []);
  // Turning it 90° about y moves its length onto z: still too long.
  assertError(prop({}, { ...plank, rotation: [0, 90, 0] }), "parts[0].position[2]", "outside the footprint");
  // 45° about y: the diagonal (0.9 + 0.1) / √2 ≈ 0.707 wide on x and z, which fits 0.8.
  assert.deepEqual(errors(prop({}, { ...plank, rotation: [0, 45, 0] })), []);
  // A flat ring stood up on its edge gains height.
  const ring = { shape: "torus", size: [0.3, 0.05, 0], position: [0, 0.05, 0] };
  assert.deepEqual(errors(prop({}, ring)), []);
  assertError(prop({}, { ...ring, rotation: [90, 0, 0] }), "parts[0].position[1]", "below the floor");
});

/** The renderer's geometry for a part (as partsModel builds it), for comparing bounds with three.js itself. */
function threeMesh(part: PropPart): THREE.Mesh {
  const [a, b, c] = part.size;
  const geometry =
    part.shape === "box"
      ? new THREE.BoxGeometry(a, b, c)
      : part.shape === "cylinder"
        ? new THREE.CylinderGeometry(a, c, b, 64)
        : part.shape === "cone"
          ? new THREE.CylinderGeometry(0, a, b, 64)
          : part.shape === "sphere"
            ? new THREE.SphereGeometry(1, 64, 48)
            : new THREE.TorusGeometry(a, b, 48, 96).rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry);
  if (part.shape === "sphere") mesh.scale.set(a, b, c);
  mesh.position.set(...part.position);
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
  mesh.rotation.set((rx * Math.PI) / 180, (ry * Math.PI) / 180, (rz * Math.PI) / 180, "XYZ");
  mesh.updateMatrixWorld();
  return mesh;
}

test("validator bounds match three.js geometry with the renderer's conventions (Euler XYZ, flat torus)", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const shapes: PropPart["shape"][] = ["box", "cylinder", "sphere", "torus", "cone"];
  for (let i = 0; i < 60; i++) {
    const shape = shapes[i % shapes.length]!;
    const s = () => 0.05 + random() * 0.4;
    const size: [number, number, number] =
      shape === "torus" ? [0.2 + random() * 0.2, 0.02 + random() * 0.1, 0] : shape === "cone" ? [s(), s(), 0] : [s(), s(), s()];
    const part: PropPart = {
      shape,
      size,
      position: [random() - 0.5, 1, random() - 0.5],
      rotation: [random() * 360 - 180, random() * 360 - 180, random() * 360 - 180],
      material: "clay",
    };
    const ours = partBounds(part);
    const theirs = new THREE.Box3().setFromObject(threeMesh(part), true);
    for (let axis = 0; axis < 3; axis++) {
      const key = (["x", "y", "z"] as const)[axis]!;
      // Ours must contain the tessellated mesh and be close to it (the bounds are exact; the mesh is faceted).
      const slack = 0.01;
      assert.ok(ours.min[axis]! <= theirs.min[key] + 1e-6, `${shape} min ${key}`);
      assert.ok(ours.max[axis]! >= theirs.max[key] - 1e-6, `${shape} max ${key}`);
      assert.ok(theirs.min[key] - ours.min[axis]! <= slack, `${shape} min ${key} too generous`);
      assert.ok(ours.max[axis]! - theirs.max[key] <= slack, `${shape} max ${key} too generous`);
    }
  }
});

test("a prop whose parts are too small to see is an error", () => {
  assertError(prop({}, { size: [0.05, 0.05, 0.05], position: [0, 0.025, 0] }), "parts", "too small to see");
});

test("a footprint much larger than the parts is a warning, not an error", () => {
  const roomy = validatePropModel(
    prop({ footprint: { width: 3, depth: 3 }, approaches: [] }, { size: [0.4, 0.5, 0.4] }),
  );
  assert.ok(roomy.ok);
  assert.equal(roomy.warnings.length, 1);
  assert.equal(roomy.warnings[0]!.path, "footprint");
  assert.match(roomy.warnings[0]!.message, /covers only 5% of the 3×3 footprint/);
  // Covering the footprint (a quarter or more) is fine.
  const snug = validatePropModel(prop({ footprint: { width: 2, depth: 2 }, approaches: [] }, { size: [0.7, 0.5, 0.7] }));
  assert.ok(snug.ok);
  assert.deepEqual(snug.warnings, []);
  // An invalid prop still reports its warnings next to its errors.
  const both = validatePropModel(prop({ footprint: { width: 3, depth: 3 }, approaches: [], name: "" }, { size: [0.4, 0.5, 0.4] }));
  assert.ok(!both.ok);
  assert.equal(both.warnings.length, 1);
});

test("toPropDefinition gives the engine a record that drives occupancy, never the parts", () => {
  const r = validatePropModel(
    prop({
      footprint: { width: 2, depth: 1 },
      category: "work",
      tags: ["bench", "work"],
      approaches: [{ x: 0, z: 1 }],
    }),
  );
  assert.ok(r.ok);
  const def = toPropDefinition(r.value);
  assert.deepEqual(def, {
    id: "user:test-crate",
    label: "Test crate",
    footprint: { width: 2, depth: 1 },
    blocksMovement: true,
    tags: ["work", "bench"],
    approaches: [{ x: 0, z: 1 }],
  });
  const layout: WorldLayout = {
    version: 1,
    grid: { width: 4, depth: 3, cellSize: PROP_LIMITS.cellSize },
    entrance: { x: 0, z: 2 },
    props: [{ id: "bench-1", definitionId: def.id, cell: { x: 1, z: 0 }, rotation: 1 }],
  };
  const defs = { [def.id]: def };
  const blocked = occupancy(validateLayout(layout, defs), defs);
  // Rotated a quarter turn, the 2x1 footprint covers (1,0) and (1,1).
  const cells = [...blocked].flatMap((v, i) => (v === 0 ? [`${i % 4},${Math.floor(i / 4)}`] : []));
  assert.deepEqual(cells, ["1,0", "1,1"]);
});

test("the CLI exits 0 for valid files, 1 with precise messages for invalid ones, 2 on usage errors", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "prop-validate-"));
  writeFileSync(path.join(dir, "good.json"), JSON.stringify(prop()));
  writeFileSync(path.join(dir, "bad.json"), JSON.stringify(prop({}, { size: [0.5, 3.5, 0.5] })));
  writeFileSync(path.join(dir, "roomy.json"), JSON.stringify(prop({ footprint: { width: 3, depth: 3 }, approaches: [] }, { size: [0.4, 0.5, 0.4] })));
  writeFileSync(path.join(dir, "broken.json"), "{ not json");
  // npm runs scripts from the repository root and passes the caller's directory as INIT_CWD.
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [path.join(root, "scripts/prop-validate.ts"), ...args], {
      cwd: root,
      env: { ...process.env, INIT_CWD: dir },
      encoding: "utf8",
    });

  const good = run("good.json");
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /good\.json: ok \(Test crate, 1 parts, footprint 1x1\)/);

  const bad = run("good.json", "bad.json");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^bad\.json: parts\[0\]\.size\[1\]: must be between 0\.01 and 3$/m);
  assert.match(bad.stderr, /1 of 2 prop file\(s\) invalid/);

  const roomy = run("roomy.json");
  assert.equal(roomy.status, 0);
  assert.match(roomy.stderr, /^roomy\.json: warning: footprint: /m);

  assert.equal(run("broken.json").status, 1);
  assert.match(run("broken.json").stderr, /broken\.json: not valid JSON/);
  assert.equal(run().status, 2);
  assert.equal(run("missing.json").status, 2);
  assert.equal(run("--strict", "good.json").status, 2);
  assert.equal(run("--help").status, 0);
});
