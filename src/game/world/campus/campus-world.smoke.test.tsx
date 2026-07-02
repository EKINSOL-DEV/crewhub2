// R3F render smoke (M0 T9): @react-three/test-renderer builds the three.js
// scene graph without a real WebGL context, so this runs under jsdom.
//
// useGLTF cannot fetch in jsdom — mock it to return a tiny toon model.
// <Merged> instances by imperatively writing into an InstancedMesh's buffer
// on layout effect; under the headless test renderer (no GL, no rAF) that
// never shows up in the scene graph, so no InstancedMesh nodes appear at
// all. Stub it here with the same render-prop contract but each Part
// renders a plain <mesh> instead of an instance, and assert on Mesh counts
// instead — layout, hierarchy and the rest of drei are still the real thing.
import { describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import * as THREE from "three";
import type { ComponentType } from "react";

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  const fakeGltf = () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    return { scene };
  };
  const useGLTF = Object.assign(vi.fn(fakeGltf), { preload: vi.fn(), clear: vi.fn() });
  const Merged = ({
    meshes,
    children,
  }: {
    meshes: THREE.Mesh[];
    children: (...parts: ComponentType[]) => React.ReactNode;
  }) => {
    const Parts = meshes.map(
      (mesh) =>
        function Part() {
          return <mesh geometry={mesh.geometry} material={mesh.material} />;
        },
    );
    return <>{children(...Parts)}</>;
  };
  return { ...real, useGLTF, Merged };
});

import { CampusWorld } from "./CampusWorld";
import { campusLayout } from "./layout";

describe("CampusWorld smoke", () => {
  it("mounts terrain and one mesh per decor/prop placement into a scene graph", async () => {
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);
    const scene = renderer.scene;
    const meshes = scene.findAllByType("Mesh");
    const layout = campusLayout();
    const totalPlacements =
      layout.pathTiles.length +
      Object.values(layout.scatter).reduce((n, arr) => n + arr.length, 0) +
      Object.values(layout.props).reduce((n, arr) => n + arr.length, 0);
    // 2 terrain planes + one stamped mesh per placement (see Merged stub above).
    expect(meshes.length).toBe(totalPlacements + 2);
    await renderer.unmount();
  });
});
