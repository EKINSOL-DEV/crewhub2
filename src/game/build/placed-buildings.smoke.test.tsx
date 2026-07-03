// R3F render smoke (M3 T5, project-based M5 T4): PlacedBuildings renders one
// Pavilion + one room-edge outline (+ a roof-plate color dot when linked)
// per placed building, tinting the outline with the linked project's color
// (falling back to neutral when unlinked or the project was since deleted).
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import * as THREE from "three";
import type { Project } from "@/ipc/bindings";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

function project(over: Partial<Project> & { id: string; name: string; folder_path: string }): Project {
  return {
    description: null,
    icon: null,
    color: "#22c55e",
    docs_path: null,
    status: "active",
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

const PROJECTS: Project[] = [project({ id: "p1", name: "Engineering", folder_path: "/work/eng" })];

import { resetCampusEditsForTests, useCampusEdits } from "./store";
import { resetProjectsForTests, useProjectsStore } from "@/stores/projects";
import { PlacedBuildings } from "./PlacedBuildings";

/** #rrggbb -> 0xrrggbb, matching how three.js normalizes `Color.set()` input. */
function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

describe("PlacedBuildings smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
    resetProjectsForTests();
  });

  it("renders nothing with no placed buildings", async () => {
    const renderer = await ReactThreeTestRenderer.create(<PlacedBuildings />);
    expect(renderer.scene.findAllByType("Mesh")).toHaveLength(0);
    await renderer.unmount();
  });

  it("renders a Pavilion + a 4-mesh room-edge outline per placed building", async () => {
    useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 10, d: 8 }, null);
    useCampusEdits.getState().addBuilding({ x: -20, z: 20, w: 6, d: 5 }, null);

    const renderer = await ReactThreeTestRenderer.create(<PlacedBuildings />);
    const meshes = renderer.scene.findAllByType("Mesh");
    // Pavilion mesh counts from pavilion.smoke.test.tsx's formula (1 slab +
    // 4 pillars structure — the beams were cut on user feedback — + walls
    // (3 full sides + 2 segments on the door-side wall, M5 T3) + desks*4)
    // plus 4 room-edge meshes per building. Both buildings stay unlinked, so
    // neither gets a RoofPlate mesh (see the next test).
    const WALL_MESHES = 5;
    const building1Desks = 2 * 2; // 10x8 -> floor(8/3.5)=2 cols * floor(6/3)=2 rows
    const building2Desks = 1 * 1; // 6x5 -> floor(4/3.5)=1 col * floor(3/3)=1 row
    const expected = 5 + WALL_MESHES + building1Desks * 4 + 4 + (5 + WALL_MESHES + building2Desks * 4 + 4);
    expect(meshes.length).toBe(expected);
    await renderer.unmount();
  });

  it("tints the room edge with the linked project's color, neutral when unlinked", async () => {
    useProjectsStore.setState({ projects: PROJECTS });
    const idA = useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 10, d: 8 }, null);
    useCampusEdits.getState().setBuildingProject(idA, "p1");
    useCampusEdits.getState().addBuilding({ x: -20, z: 20, w: 6, d: 5 }, null);

    const renderer = await ReactThreeTestRenderer.create(<PlacedBuildings />);
    const materials = renderer.scene
      .findAllByType("MeshBasicMaterial")
      .map((m) => m.instance as unknown as THREE.MeshBasicMaterial);
    expect(materials.some((m) => m.color.getHex() === hex("#22c55e"))).toBe(true);
    expect(materials.some((m) => m.color.getHex() === hex("#9ca3af"))).toBe(true);
    await renderer.unmount();
  });

  it("falls back to neutral if the linked project no longer exists", async () => {
    const id = useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 10, d: 8 }, null);
    useCampusEdits.getState().setBuildingProject(id, "ghost-project");

    const renderer = await ReactThreeTestRenderer.create(<PlacedBuildings />);
    const materials = renderer.scene
      .findAllByType("MeshBasicMaterial")
      .map((m) => m.instance as unknown as THREE.MeshBasicMaterial);
    expect(materials.every((m) => m.color.getHex() === hex("#9ca3af"))).toBe(true);
    await renderer.unmount();
  });

  it("adds one roof-plate mesh (the color dot) per linked building, none when unlinked", async () => {
    useProjectsStore.setState({ projects: PROJECTS });
    const idA = useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 10, d: 8 }, null);
    useCampusEdits.getState().addBuilding({ x: -20, z: 20, w: 6, d: 5 }, null); // stays unlinked

    const before = await ReactThreeTestRenderer.create(<PlacedBuildings />);
    const baseCount = before.scene.findAllByType("Mesh").length;
    await before.unmount();

    useCampusEdits.getState().setBuildingProject(idA, "p1");
    const after = await ReactThreeTestRenderer.create(<PlacedBuildings />);
    expect(after.scene.findAllByType("Mesh").length).toBe(baseCount + 1);
    await after.unmount();
  });
});
