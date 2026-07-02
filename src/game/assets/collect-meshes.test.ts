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
});
