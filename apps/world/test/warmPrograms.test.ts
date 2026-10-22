/* Round 23: the shader programs a building's hidden interior will need are made ready in idle time (world/warmPrograms.ts),
   not in the frame of the enter. The seam is three's own `compileAsync` and each program's `getUniforms()`: these tests
   pin what is asked of the renderer, with a stand-in for it (no WebGL under node). */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { materialsOf, warmPrograms, type ProgramWarmer, type WarmableProgram } from "../src/world/warmPrograms.ts";

function program(name: string, reads: string[]): WarmableProgram {
  return { getUniforms: () => reads.push(name) };
}

/** A building's group as the town has it: a shell shown, an interior hidden, two meshes sharing one material. */
function building() {
  const group = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial();
  const glass = new THREE.MeshStandardMaterial({ transparent: true });
  const wood = new THREE.MeshStandardMaterial();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), shell));
  const interior = new THREE.Group();
  interior.visible = false;
  interior.add(new THREE.Mesh(new THREE.BoxGeometry(), glass), new THREE.Mesh(new THREE.BoxGeometry(), wood), new THREE.Mesh(new THREE.BoxGeometry(), [wood, shell]));
  group.add(interior);
  return { group, shell, glass, wood };
}

test("materialsOf: every material under the object once, the hidden ones and array materials included", () => {
  const { group, shell, glass, wood } = building();
  assert.deepEqual(new Set(materialsOf(group)), new Set([shell, glass, wood]));
  assert.equal(materialsOf(group).length, 3);
});

test("warmPrograms: compiles the object with the camera in the scene, then reads every program's locations once, and says how many", async () => {
  const { group, shell, glass, wood } = building();
  const camera = new THREE.OrthographicCamera();
  const scene = new THREE.Scene();
  const reads: string[] = [];
  const compiled: unknown[][] = [];
  const lit = program("lit", reads), clear = program("clear", reads);
  const programs = new Map<THREE.Material, WarmableProgram | null>([
    [shell, lit],
    [wood, lit],
    [glass, clear],
  ]);
  const renderer: ProgramWarmer = {
    compileAsync: async (object, cam, sc) => {
      compiled.push([object, cam, sc]);
      return object;
    },
    properties: { get: (m) => ({ currentProgram: programs.get(m) ?? null }) },
  };
  const n = await warmPrograms(renderer, group, camera, scene);
  assert.deepEqual(compiled, [[group, camera, scene]], "one compile of the whole group, hidden interior included, in the town's scene");
  assert.deepEqual(reads.sort(), ["clear", "lit"], "each program's locations read once, however many materials share it");
  assert.equal(n, 2);
});

test("warmPrograms: a material without a program is skipped, a failed compile warms nothing, and a gone object is left alone", async () => {
  const { group, shell } = building();
  const camera = new THREE.OrthographicCamera();
  const scene = new THREE.Scene();
  const reads: string[] = [];
  const only = program("only", reads);
  const renderer: ProgramWarmer = {
    compileAsync: async () => {
      throw new Error("context lost");
    },
    properties: { get: (m) => ({ currentProgram: m === shell ? only : undefined }) },
  };
  assert.equal(await warmPrograms(renderer, group, camera, scene), 1, "the compile's failure is not the warm's: what has a program is still read");
  assert.deepEqual(reads, ["only"]);
  reads.length = 0;
  assert.equal(await warmPrograms(renderer, group, camera, scene, () => false), 0, "the interior was released meanwhile: nothing is read");
  assert.deepEqual(reads, []);
});
