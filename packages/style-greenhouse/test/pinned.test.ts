/* Rules of the greenhouse kit and of world-style that a mutation run found unpinned (round 54, r54-mut-style): each
   test here was red under the mutant it names and green without it. Headless three.js only: geometry, materials and
   matrices, no renderer. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { staticPartsOf } from "@crewhub/world-style";
import { cloneLight, sameLight, toLight } from "../src/daylight.ts";
import { environment } from "../src/environment.ts";
import { plant } from "../src/furniture.ts";
import { Kit, type GreenhouseManifestData } from "../src/kit.ts";
import { PartsNode } from "../src/partsNode.ts";
import { glassWall } from "../src/shell.ts";
import { townDetail } from "../src/town.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "style.json"), "utf8")) as GreenhouseManifestData & { lighting: ConstructorParameters<typeof Kit>[1] };
const kit = () => new Kit(manifest, manifest.lighting);

test("a plant has seven leaves (round 54, r54-mut-style: furniture.ts:14)", () => {
  const k = kit();
  const leaf = k.geometry("leaf", () => new THREE.SphereGeometry(1, 10, 8));
  let leaves = 0;
  plant(k).traverse((o) => {
    if ((o as THREE.Mesh).geometry === leaf) leaves += 1;
  });
  assert.equal(leaves, 7);
});

test("only an archived glass wall is boarded up; an open one has no boards (round 54, r54-mut-style: shell.ts:160)", () => {
  const k = kit();
  const glass = new THREE.MeshStandardMaterial();
  const boards = (o: object) => {
    let n = 0;
    glassWall(k, o, glass).traverse((x) => {
      if (x.userData.board === true) n += 1;
    });
    return n;
  };
  assert.ok(boards({ accent: "coral", variant: "archived" }) > 0, "the closed building's wall is boarded");
  assert.equal(boards({ accent: "coral" }), 0);
  assert.equal(boards({}), 0);
});

test("town detail: a tiny ball gets 6 × 4, a smooth sphere 7 × 5, a sphere that is light already keeps its own (round 54, r54-mut-style: town.ts:587, :592)", () => {
  const k = kit();
  const tiny = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10));
  const smooth = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10));
  const light = new THREE.SphereGeometry(1, 8, 6);
  const already = new THREE.Mesh(light);
  const g = new THREE.Group();
  g.add(tiny, smooth, already);
  townDetail(k, g, "bench");
  const segments = (m: THREE.Mesh) => {
    const p = (m.geometry as THREE.SphereGeometry).parameters;
    return [p.widthSegments, p.heightSegments];
  };
  assert.deepEqual(segments(tiny), [6, 4]);
  assert.deepEqual(segments(smooth), [7, 5]);
  assert.equal(already.geometry, light, "8 × 6 is light enough: kept");
});

test("staticPartsOf takes an object only when it has both the parts and takeParts (round 54, r54-mut-style: world-style index.ts:375)", () => {
  const node = new PartsNode();
  assert.equal(staticPartsOf(node), node);
  const partsOnly = Object.assign(new THREE.Object3D(), { staticParts: [] });
  assert.equal(staticPartsOf(partsOnly), null);
  const takeOnly = Object.assign(new THREE.Object3D(), { takeParts: () => undefined });
  assert.equal(staticPartsOf(takeOnly), null);
  assert.equal(staticPartsOf(new THREE.Object3D()), null);
});

test("a material asked for with a transparency is see-through at that opacity; one without stays opaque (round 54, r54-mut-style: kit.ts:204)", () => {
  const k = kit();
  const seeThrough = k.material("chalk", { transparent: 0.4 });
  assert.deepEqual([seeThrough.transparent, seeThrough.opacity, seeThrough.depthWrite], [true, 0.4, false]);
  const opaque = k.material("chalk");
  assert.deepEqual([opaque.transparent, opaque.opacity, opaque.depthWrite], [false, 1, true]);
});

test("a contact shadow draws before a lamp's pool (round 54, r54-mut-style: kit.ts:293)", () => {
  const k = kit();
  assert.equal(k.decal("shadow", 0.3, 0.3, 0.1).renderOrder, 1);
  assert.equal(k.decal("pool", 0.3, 0.3, 0.1).renderOrder, 2);
});

test("two lights whose sky differs only in green or blue are not the same light (round 54, r54-mut-style: daylight.ts:119)", () => {
  const a = toLight(manifest.lighting.day);
  assert.ok(sameLight(a, cloneLight(a)));
  for (const channel of ["g", "b"] as const) {
    const b = cloneLight(a);
    b.sky[channel] += 0.2;
    assert.equal(sameLight(a, b), false, channel);
  }
});

test("a moved parts node's world matrix follows on an update without force (round 54, r54-mut-style: partsNode.ts:101)", () => {
  const node = new PartsNode();
  node.position.set(1, 2, 3);
  node.updateWorldMatrix(false, false);
  assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(node.matrixWorld).toArray(), [1, 2, 3]);
});

test("the sun's shadow blurs 2.5 texels on the close 2048 map and 2 on the far 1024 one (round 54, r54-mut-style: environment.ts:62)", () => {
  const scene = new THREE.Scene();
  const renderer = { toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;
  const env = environment(scene, renderer, manifest.lighting, "day", () => {}, () => {}, () => {});
  const sun = scene.children.find((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight && o.castShadow);
  assert.ok(sun);
  env.setShadowReach(20);
  assert.deepEqual([sun.shadow.mapSize.x, sun.shadow.radius], [2048, 2.5]);
  env.setShadowReach(40);
  assert.deepEqual([sun.shadow.mapSize.x, sun.shadow.radius], [1024, 2]);
});
