import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { updateMatrices } from "../src/world/matrixPass.ts";

/** A scene with a static group of parts and a moving robot with an arm. */
function town() {
  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false;
  const plot = new THREE.Group();
  plot.position.set(10, 0, 0);
  for (let i = 0; i < 4; i++) {
    const part = new THREE.Object3D();
    part.position.set(i, 0, 0);
    plot.add(part);
  }
  const robot = new THREE.Group();
  const arm = new THREE.Object3D();
  arm.position.set(0, 1, 0);
  robot.add(arm);
  plot.add(robot);
  scene.add(plot);
  return { scene, plot, robot, arm };
}

const worldX = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).x;

test("the matrix pass composes everything once, then only what moved, and children follow their parent", () => {
  const { scene, plot, robot, arm } = town();
  assert.equal(updateMatrices(scene), 8, "the first pass composes all eight objects");
  assert.equal(worldX(plot.children[3]!), 13);
  assert.equal(updateMatrices(scene), 0, "nothing moved: nothing composed");
  robot.position.x = 2;
  arm.rotation.z = 0.5;
  assert.equal(updateMatrices(scene), 2, "the robot and its arm");
  assert.equal(worldX(arm), 12);
  // A lift moves the plot: only it is composed, and every child's world matrix follows.
  plot.position.x = 20;
  assert.equal(updateMatrices(scene), 1);
  assert.equal(worldX(plot.children[3]!), 23);
  assert.equal(worldX(arm), 22);
  // Scale and a matrix written by hand (matrixAutoUpdate off) are seen too.
  plot.children[0]!.scale.setScalar(2);
  assert.equal(updateMatrices(scene), 1);
  const manual = plot.children[1]!;
  manual.matrixAutoUpdate = false;
  manual.matrix.makeTranslation(5, 0, 0);
  manual.matrixWorldNeedsUpdate = true;
  updateMatrices(scene);
  assert.equal(worldX(manual), 25);
});

test("the matrix pass gives the same world matrices as three's own pass", () => {
  const a = town(),
    b = town();
  for (const t of [a, b]) {
    t.plot.rotation.y = 0.7;
    t.robot.position.set(1, 0, 2);
    t.arm.scale.set(1, 2, 1);
  }
  updateMatrices(a.scene);
  b.scene.matrixWorldAutoUpdate = true;
  b.scene.updateMatrixWorld();
  const flat = (s: THREE.Scene) => {
    const all: number[] = [];
    s.traverse((o) => all.push(...o.matrixWorld.elements));
    return all;
  };
  const x = flat(a.scene),
    y = flat(b.scene);
  x.forEach((v, i) => assert.ok(Math.abs(v - y[i]!) < 1e-12));
});
