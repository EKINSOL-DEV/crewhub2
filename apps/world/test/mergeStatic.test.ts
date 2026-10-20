/* Static batching (mergeStatic.ts) against the shapes a building shell is made of. The hall partitions of the
   three-room plan were raised from 0.52 to 0.56 on 7 October because a 0.52 one "vanished from the merged shell";
   this pins that every partition of the plan's lengths, at the design height, comes through the merge with all its
   vertices, in a kit-shaped scene: shared cached geometries, a palette batch of plain materials with a lighting hook. */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { BUILDING_CELL, buildingTemplate, wallRuns, type WallRun } from "../src/world/buildingTemplate.ts";
import { mergeStatic } from "../src/world/mergeStatic.ts";
import { agent, building } from "./fixtures.ts";

/** The classic partition: 0.52 high, 0.1 thick (buildingView.ts WALLS.inner). */
const HEIGHT = 0.52,
  THICK = 0.1;

/** A Greenhouse-like kit: one geometry per size (shared), plain standard materials with the style's lighting hook. */
function kit() {
  const geometries = new Map<string, THREE.BufferGeometry>();
  const hook: THREE.Material["onBeforeCompile"] = () => {};
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const material = (color: number) => {
    let m = materials.get(String(color));
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 });
      m.onBeforeCompile = hook;
      m.userData.lightHook = hook;
      materials.set(String(color), m);
    }
    return m;
  };
  const box = (w: number, h: number, d: number, color: number) => {
    const key = `box:${w},${h},${d}`;
    let g = geometries.get(key);
    if (!g) geometries.set(key, (g = new RoundedBoxGeometry(w, h, d, 1, 0.02)));
    const mesh = new THREE.Mesh(g, material(color));
    mesh.castShadow = true;
    return mesh;
  };
  /** The style's partition: the wall and its timber cap. */
  const partition = (width: number) => {
    const g = new THREE.Group();
    const wall = box(width, HEIGHT, THICK, 0xd8d3c8);
    wall.position.y = HEIGHT / 2;
    const cap = box(width + 0.01, 0.035, THICK + 0.035, 0x8a6a4a);
    cap.position.y = HEIGHT + 0.0175;
    g.add(wall, cap);
    return g;
  };
  return { partition };
}

/** The partitions of a template, placed as the building view places them (buildingView.ts), under one root. */
function partitions(k: ReturnType<typeof kit>, runs: WallRun[], root: THREE.Group) {
  const placed: { run: WallRun; box: THREE.Box3 }[] = [];
  for (const run of runs) {
    const horizontal = run.z1 === run.z2;
    const length = (horizontal ? run.x2 - run.x1 : run.z2 - run.z1) * BUILDING_CELL;
    const wall = k.partition(length + THICK);
    wall.position.set(((run.x1 + run.x2) / 2) * BUILDING_CELL, 0, ((run.z1 + run.z2) / 2) * BUILDING_CELL);
    wall.rotation.y = horizontal ? 0 : Math.PI / 2;
    root.add(wall);
    wall.updateMatrixWorld(true);
    placed.push({ run, box: new THREE.Box3().setFromObject(wall).expandByScalar(0.01) });
  }
  return placed;
}

const inner = (b: ReturnType<typeof building>, plan: "three-rooms" | "classic") => wallRuns(buildingTemplate(b, plan)).filter((r) => r.side === "inner");

test("every hall partition at 0.52 comes through the static merge with all its vertices, whatever its length", () => {
  const k = kit();
  const teams = [
    building("cr", [agent("cr/lead", "lead-office"), agent("cr/dev-0", "workers")]),
    building("ops", [agent("ops/lead", "lead-office"), ...Array.from({ length: 11 }, (_, i) => agent(`ops/dev-${i}`, "workers"))]),
    building("lab", [agent("lab/lead", "lead-office"), ...Array.from({ length: 17 }, (_, i) => agent(`lab/dev-${i}`, "workers")), ...Array.from({ length: 4 }, (_, i) => agent(`lab/an-${i}`, "analyst"))]),
  ];
  // The classic building first: its partitions are 0.52 too, so a length both plans share reuses a cached geometry.
  const classic = new THREE.Group();
  partitions(k, inner(teams[0]!, "classic"), classic);
  mergeStatic(classic);
  for (const b of teams) {
    const root = new THREE.Group();
    const placed = partitions(k, inner(b, "three-rooms"), root);
    assert.ok(placed.length >= 3, `${b.slug}: the three halls have partitions between them`);
    const perPartition = k.partition(1).children.reduce((n, c) => n + (c as THREE.Mesh).geometry.attributes.position!.count, 0);
    const created = mergeStatic(root);
    assert.equal(created.length, 1, `${b.slug}: one palette batch for the chalk and the timber`);
    assert.ok(root.children.every((c) => c instanceof THREE.Mesh), `${b.slug}: only merged meshes are left under the root`);
    const position = created[0]!.attributes.position!;
    const p = new THREE.Vector3();
    for (const { run, box } of placed) {
      let n = 0;
      for (let i = 0; i < position.count; i++) if (box.containsPoint(p.fromBufferAttribute(position, i))) n++;
      // At least: a partition's box also holds the end vertices of the one that meets it.
      assert.ok(n >= perPartition, `${b.slug}: the partition ${run.x1},${run.z1}-${run.x2},${run.z2} keeps its ${perPartition} vertices (${n} in its box)`);
    }
  }
});
