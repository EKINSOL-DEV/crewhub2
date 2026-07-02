import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { collectMeshes } from "./collect-meshes";

describe("collectMeshes", () => {
  it("bakes nested transforms into cloned geometry", () => {
    const root = new THREE.Group();
    const holder = new THREE.Group();
    holder.position.set(0, 2, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial());
    holder.add(mesh);
    root.add(holder);

    const meshes = collectMeshes(root);

    expect(meshes).toHaveLength(1);
    const baked = meshes[0]!;
    baked.geometry.computeBoundingBox();
    // The 1×1×1 box sat at y=2 — baked geometry must span y ∈ [1.5, 2.5].
    expect(baked.geometry.boundingBox!.min.y).toBeCloseTo(1.5);
    expect(baked.geometry.boundingBox!.max.y).toBeCloseTo(2.5);
    // Original geometry untouched.
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.max.y).toBeCloseTo(0.5);
  });

  it("de-quantizes normalized int attributes before baking (KHR_mesh_quantization)", () => {
    // Regression: built GLBs store positions as normalized int16 with the
    // dequantize transform on the node. Baking the matrix into the int16
    // array clamps values at ±1 → the mesh collapses into a box.
    const root = new THREE.Group();
    const holder = new THREE.Group();
    holder.scale.set(3, 3, 3); // dequantize-style node scale
    const geometry = new THREE.BufferGeometry();
    // A quantized "line" of points at y = 0, 0.5, 1 (normalized int16).
    const q = new Int16Array([0, 0, 0, 0, 16383, 0, 0, 32767, 0]);
    geometry.setAttribute("position", new THREE.BufferAttribute(q, 3, true));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshToonMaterial());
    holder.add(mesh);
    root.add(holder);

    const baked = collectMeshes(root)[0]!;
    const pos = baked.geometry.getAttribute("position");

    // ×3 scale must survive: top point at y=3, NOT clamped at 1.
    expect(pos.getY(2)).toBeCloseTo(3, 3);
    expect(pos.getY(1)).toBeCloseTo(1.5, 3);
    expect(pos.array).toBeInstanceOf(Float32Array);
  });
});
