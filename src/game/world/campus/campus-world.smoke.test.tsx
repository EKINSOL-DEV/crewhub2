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
import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

import { CampusWorld } from "./CampusWorld";
import { campusLayout } from "./layout";
import { resetCampusEditsForTests, useCampusEdits } from "@/game/build/store";
import { resetProjectsForTests, useProjectsStore } from "@/stores/projects";
import { BIOMES } from "@/game/world/biome";

describe("CampusWorld smoke", () => {
  beforeEach(() => {
    resetCampusEditsForTests();
    resetProjectsForTests();
  });

  it("mounts terrain and one mesh per decor/prop placement into a scene graph", async () => {
    const renderer = await ReactThreeTestRenderer.create(<CampusWorld />);
    const scene = renderer.scene;
    const meshes = scene.findAllByType("Mesh");
    const layout = campusLayout();
    const totalPlacements =
      layout.pathTiles.length +
      Object.values(layout.scatter).reduce((n, arr) => n + arr.length, 0) +
      Object.values(layout.props).reduce((n, arr) => n + arr.length, 0);
    // 5 terrain meshes (apron + grass + 2 path strips + plaza plate) + one
    // stamped mesh per placement (see Merged stub above) + Fountain (1
    // mocked-model mesh + 1 water disc) + CloudPuffs (7 puffs * 3 spheres) +
    // Pavilions (M1 T1, walls M5 T3): each pavilion = 1 slab + 4 pillars +
    // 3 beams + walls (3 full sides + 2 segments on the door-side wall) +
    // 4 desks × (1 top + 2 legs + 1 screen) = 29 meshes; 4 pavilions = 116.
    // Player-placed decor (M3 T4) renders through the same InstancedModel
    // path, grouped by kind — with the default EMPTY_EDITS state (no
    // player edits) that group renders nothing, so the formula below is
    // untouched; the next test proves placed decor DOES add meshes.
    const TERRAIN_MESHES = 5;
    const FOUNTAIN_MESHES = 2;
    const CLOUD_MESHES = 7 * 3;
    const PAVILION_MESHES = 4 * 29;
    expect(meshes.length).toBe(
      totalPlacements + TERRAIN_MESHES + FOUNTAIN_MESHES + CLOUD_MESHES + PAVILION_MESHES,
    );
    await renderer.unmount();
  });

  it("adds exactly one mesh per placed item on top of the base scene", async () => {
    const before = await ReactThreeTestRenderer.create(<CampusWorld />);
    const baseCount = before.scene.findAllByType("Mesh").length;
    await before.unmount();

    useCampusEdits.getState().addItem("bush", 10, 10, 0);
    useCampusEdits.getState().addItem("lantern", -10, -10, 0);

    const after = await ReactThreeTestRenderer.create(<CampusWorld />);
    expect(after.scene.findAllByType("Mesh").length).toBe(baseCount + 2);
    await after.unmount();
  });

  it.each(["desert", "island", "sky"] as const)(
    "mounts the %s biome without a campus regression",
    async (id) => {
      const renderer = await ReactThreeTestRenderer.create(<CampusWorld biome={BIOMES[id]} />);
      // Not an exact count (skip lists change the total) — just proves the
      // biome mounts a real, non-trivial scene through the same code path.
      expect(renderer.scene.findAllByType("Mesh").length).toBeGreaterThan(100);
      await renderer.unmount();
    },
  );

  it("adds one roof-plate mesh (the color dot) per base pavilion linked to a project, none when unlinked", async () => {
    const before = await ReactThreeTestRenderer.create(<CampusWorld />);
    const baseCount = before.scene.findAllByType("Mesh").length;
    await before.unmount();

    // RoofPlate's own Text suspends forever in jsdom (no font can load) —
    // per the M1 lesson, that's fine: its Suspense boundary just keeps
    // showing its null fallback, contributing zero meshes, so only the
    // color-dot mesh shows up in this count.
    useProjectsStore.setState({
      projects: [
        {
          id: "proj-1",
          name: "Acme",
          description: null,
          icon: "🚀",
          color: "#22c55e",
          folder_path: "/work/acme",
          docs_path: null,
          status: "active",
          created_at: 0,
          updated_at: 0,
        },
      ],
    });
    useCampusEdits.getState().setPlotProject(0, "proj-1");

    const after = await ReactThreeTestRenderer.create(<CampusWorld />);
    expect(after.scene.findAllByType("Mesh").length).toBe(baseCount + 1);
    await after.unmount();
  });
});
