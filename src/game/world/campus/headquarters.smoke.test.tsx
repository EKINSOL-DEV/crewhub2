// R3F render smoke (M6 T3): confirms Headquarters.tsx's static-structure
// mesh count and its separate, always-outside-any-frozen-group permanent
// plate. Same jsdom-can't-fetch-GLTF mock as campus-world.smoke.test.tsx —
// see that file's header for why useGLTF/Text/Billboard are stubbed
// (Headquarters doesn't use drei's <Merged>, so that stub is omitted here).
import { describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import * as THREE from "three";

vi.mock("@react-three/drei", async (importOriginal) => {
  const real = await importOriginal<typeof import("@react-three/drei")>();
  const fakeGltf = () => {
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
    return { scene };
  };
  const useGLTF = Object.assign(vi.fn(fakeGltf), { preload: vi.fn(), clear: vi.fn() });
  const Text = ({ children }: { children?: React.ReactNode }) => <group name={`plate:${String(children)}`} />;
  const Billboard = ({
    children,
    position,
  }: {
    children?: React.ReactNode;
    position?: [number, number, number];
  }) => <group position={position ?? [0, 0, 0]}>{children}</group>;
  return { ...real, useGLTF, Text, Billboard };
});

import { Headquarters, HeadquartersPlate } from "./Headquarters";
import { hqBuilding, type Building } from "./buildings";

describe("Headquarters smoke", () => {
  it("mounts the static structure with the documented mesh-count formula", async () => {
    const building = hqBuilding();
    const renderer = await ReactThreeTestRenderer.create(<Headquarters building={building} />);
    const meshes = renderer.scene.findAllByType("Mesh");
    // apron + slab (2) + 4 pillars (the beam ring was cut on user feedback)
    // + walls (4 sides x 2 segments, since every side carries its own door —
    // building.doors has one per wall) + steps (4 doors x 2 flanking meshes)
    // + podium (1) + 2 banners (1 mesh each, per the fake-GLTF mock above).
    // No prop pads anymore (M9 polish): the interactive Projects/Crew/
    // Workspace furniture moved off floor pads and onto the interior walls —
    // see HqProps.tsx, mounted separately by CampusWorld.
    const STRUCTURE = 2 + 4;
    const WALLS = 4 * 2;
    const STEPS = 4 * 2;
    const PODIUM = 1;
    const BANNERS = 2;
    expect(meshes.length).toBe(STRUCTURE + WALLS + STEPS + PODIUM + BANNERS);
    await renderer.unmount();
  });

  it("cuts a door gap on all four sides, not just the primary door (unlike Pavilion)", async () => {
    const full = hqBuilding();
    expect(full.doors).toHaveLength(4);
    // Building.doors is optional (exactOptionalPropertyTypes forbids
    // assigning it `undefined` explicitly) — omit the key entirely to
    // exercise Headquarters' `building.doors ?? [building.door]` fallback,
    // which leaves only the primary (south) door cut.
    const singleDoor: Building = {
      plotIndex: full.plotIndex,
      rect: full.rect,
      desks: full.desks,
      door: full.door,
      kind: "hq",
    };

    const fullRenderer = await ReactThreeTestRenderer.create(<Headquarters building={full} />);
    const fullCount = fullRenderer.scene.findAllByType("Mesh").length;
    await fullRenderer.unmount();

    const singleRenderer = await ReactThreeTestRenderer.create(<Headquarters building={singleDoor} />);
    const singleCount = singleRenderer.scene.findAllByType("Mesh").length;
    await singleRenderer.unmount();

    // All four doors: 4 sides x 2 wall segments + 4 doors x 2 steps = 16.
    // Primary door only: 3 solid sides (1 segment each) + 1 cut side (2
    // segments) = 5 wall meshes, plus that one door's 2 steps = 7. The
    // 9-mesh gap is exactly what cutting three extra doors adds.
    expect(fullCount - singleCount).toBe(9);
  });

  it("the permanent plate renders its own backdrop mesh and fixed label, independent of any project store", async () => {
    const renderer = await ReactThreeTestRenderer.create(<HeadquartersPlate position={[0, 5, 0]} />);
    expect(renderer.scene.findAllByType("Mesh")).toHaveLength(1);
    expect(renderer.scene.findAll((n) => n.props.name === "plate:🏛 Headquarters")).toHaveLength(1);
    await renderer.unmount();
  });
});
