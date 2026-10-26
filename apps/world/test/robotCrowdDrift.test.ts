/* Round 41: a glowing far part under the day-night drift. The drift moves the emissive strength of the style's glowing
   materials in place a few times a second (the kit's setLight); the crowd's batch key carried that strength, so every
   value it passed made a new batch, an InstancedMesh with a cloned material, that `#batches` never dropped: about a
   thousand an hour in the demo with the potlings or the sprouts chosen. A glowing part now batches by its material and
   draws through the material's instanced twin, whose strength reads through to the source. */
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createCast, everyState, referenceKit } from "@crewhub/world-cast";
import { figurePiecesOf } from "@crewhub/world-style";
import { castRegistry } from "../src/world/cast.ts";
import { RobotCrowd } from "../src/world/robotCrowd.ts";

/** A far crowd of one cast's figures in every state that is not faded, and the glowing materials among their parts. */
function crowdOf(id: string) {
  const manifest = castRegistry.listCasts().find((m) => m.id === id)!;
  const cast = createCast(manifest, castRegistry.figureOf(id)!, referenceKit(manifest.colors));
  const root = new THREE.Group();
  const states = everyState().filter((s) => !s.proxy && s.activity !== "stale");
  const handles = states.map((state, i) => {
    const h = cast.figure({ key: `drift:${i}`, role: "worker", accent: i % 2 ? "coral" : null });
    h.object.position.set(i * 1.3, 0.02, 0);
    h.object.scale.setScalar(0.62);
    h.setDetail("far");
    h.setState(state);
    h.update(0.2);
    root.add(h.object);
    return h;
  });
  const crowd = new RobotCrowd();
  const frame = () => {
    root.updateMatrixWorld(true);
    crowd.begin();
    for (const h of handles) crowd.add(h.object, true);
    crowd.end();
  };
  const glowing = new Set<THREE.MeshStandardMaterial>();
  root.traverse((o) => {
    const holder = figurePiecesOf(o);
    if (!holder) return;
    for (const p of holder.figurePieces) {
      const m = p.material as THREE.MeshStandardMaterial;
      if (p.visible && m.isMeshStandardMaterial && m.emissive.getHex() !== 0) glowing.add(m);
    }
  });
  return { crowd, frame, glowing };
}
const batches = (crowd: RobotCrowd) => crowd.group.children as THREE.InstancedMesh[];
const drawn = (crowd: RobotCrowd) => batches(crowd).reduce((n, m) => n + m.count, 0);

for (const id of ["potlings", "sprouts"]) {
  test(`${id}: 200 emissive strengths of the drift make no new batch and no new material, and the batches glow with the source`, () => {
    const { crowd, frame, glowing } = crowdOf(id);
    assert.ok(glowing.size > 0, "the cast has glowing far parts");
    frame();
    frame();
    const before = batches(crowd).length,
      instances = drawn(crowd),
      materials = new Set(batches(crowd).map((m) => m.material));
    let clones = 0;
    const clone = THREE.MeshStandardMaterial.prototype.clone;
    THREE.MeshStandardMaterial.prototype.clone = function () {
      clones++;
      return clone.call(this);
    };
    try {
      for (let k = 0; k < 200; k++) {
        for (const m of glowing) m.emissiveIntensity = 0.3 + k * 0.01;
        frame();
      }
    } finally {
      THREE.MeshStandardMaterial.prototype.clone = clone;
    }
    assert.equal(batches(crowd).length, before, "batches");
    assert.equal(clones, 0, "materials cloned");
    assert.equal(drawn(crowd), instances, "instances drawn");
    assert.deepEqual(new Set(batches(crowd).map((m) => m.material)), materials, "the same batch materials");
    for (const m of batches(crowd)) {
      const material = m.material as THREE.MeshStandardMaterial;
      if (material.isMeshStandardMaterial && material.emissive.getHex() !== 0) assert.equal(material.emissiveIntensity, 0.3 + 199 * 0.01, "a glowing batch reads the strength from its source");
    }
  });
}

test("the classic bots: parts of one shape in different colours share a batch as before (no glowing far part)", () => {
  const { crowd, frame, glowing } = crowdOf("classic-bots");
  assert.equal(glowing.size, 0);
  frame();
  frame();
  for (const m of batches(crowd)) if (m.count > 1) assert.ok(m.instanceColor, "a shared batch carries its colours per instance");
});
