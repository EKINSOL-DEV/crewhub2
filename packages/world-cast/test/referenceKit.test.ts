/* Round 61 (S4): the reference kit gives a part as data as the style's kit does, so a kit always has `piece` and the
   runtime asks no kit to make a mesh only to read it. The data is what the kit's own mesh of that part holds. */
import assert from "node:assert/strict";
import test from "node:test";
import { referenceKit, type FigurePart } from "../src/index.ts";

const PARTS: FigurePart[] = [
  { shape: "box", size: [0.3, 0.2, 0.1], position: [0.1, 0.2, 0.3], rotation: [10, 20, 30], radius: 0.02 },
  { shape: "cylinder", size: [0.05, 0.2, 0.08], position: [0, 0.4, 0], rotation: [0, 0, 90] },
  { shape: "cone", size: [0.1, 0.2, 0], position: [-0.1, 0, 0] },
  { shape: "sphere", size: [0.1, 0.2, 0.3], position: [0, 0.5, 0.2], rotation: [45, 0, 0] },
  { shape: "torus", size: [0.2, 0.03, 0], position: [0, 0.1, 0] },
  { shape: "wedge", size: [0.2, 0.1, 0.2], position: [0, 0.2, 0], sweep: 90 },
];

for (const part of PARTS)
  test(`a ${part.shape}: the piece holds what the part's mesh holds`, () => {
    const kit = referenceKit({});
    const mesh = kit.part(part, "cream");
    mesh.updateMatrix();
    const piece = kit.piece(part, "cream");
    assert.equal(piece.geometry, mesh.geometry);
    assert.equal(piece.material, mesh.material);
    assert.deepEqual(piece.position.toArray(), mesh.position.toArray());
    assert.deepEqual(piece.rotation.toArray(), mesh.rotation.toArray());
    assert.deepEqual(piece.scale.toArray(), mesh.scale.toArray());
    assert.deepEqual(piece.matrix.elements, mesh.matrix.elements);
    assert.equal(piece.castShadow, mesh.castShadow);
    assert.equal(piece.receiveShadow, mesh.receiveShadow);
  });
