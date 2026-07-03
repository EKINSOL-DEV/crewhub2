// R3F render smoke (M3 T5): PlacedBuildings renders one Pavilion + one
// room-edge outline per placed building, and tints that outline with the
// linked room's color (falling back to neutral when unlinked or the room
// was since deleted).
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import * as THREE from "three";
import type { Room } from "@/ipc/bindings";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

function room(over: Partial<Room> & { id: string; name: string }): Room {
  return {
    project_id: null,
    icon: null,
    color: "#22c55e",
    sort_order: 0,
    is_hq: false,
    style_json: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

const ROOMS: Room[] = [room({ id: "r1", name: "Engineering", color: "#22c55e" })];

vi.mock("@/stores/bindings", () => ({
  useBindingsStore: Object.assign(
    (selector: (s: { rooms: Room[] }) => unknown) => selector({ rooms: ROOMS }),
    { getState: () => ({ rooms: ROOMS }) },
  ),
}));

import { resetCampusEditsForTests, useCampusEdits } from "./store";
import { PlacedBuildings } from "./PlacedBuildings";

/** #rrggbb -> 0xrrggbb, matching how three.js normalizes `Color.set()` input. */
function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}

describe("PlacedBuildings smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
  });

  it("renders nothing with no placed buildings", async () => {
    const renderer = await ReactThreeTestRenderer.create(<PlacedBuildings />);
    expect(renderer.scene.findAllByType("Mesh")).toHaveLength(0);
    await renderer.unmount();
  });

  it("renders a Pavilion + a 4-mesh room-edge outline per placed building", async () => {
    useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 10, d: 8 }, null);
    useCampusEdits.getState().addBuilding({ x: -20, z: 20, w: 6, d: 5 }, "r1");

    const renderer = await ReactThreeTestRenderer.create(<PlacedBuildings />);
    const meshes = renderer.scene.findAllByType("Mesh");
    // Pavilion mesh counts from pavilion.smoke.test.tsx's formula (1+4+3 +
    // desks*4) plus 4 room-edge meshes per building.
    const building1Desks = 2 * 2; // 10x8 -> floor(8/3.5)=2 cols * floor(6/3)=2 rows
    const building2Desks = 1 * 1; // 6x5 -> floor(4/3.5)=1 col * floor(3/3)=1 row
    const expected = 8 + building1Desks * 4 + 4 + (8 + building2Desks * 4 + 4);
    expect(meshes.length).toBe(expected);
    await renderer.unmount();
  });

  it("tints the room edge with the linked room's color, neutral when unlinked", async () => {
    useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 10, d: 8 }, "r1");
    useCampusEdits.getState().addBuilding({ x: -20, z: 20, w: 6, d: 5 }, null);

    const renderer = await ReactThreeTestRenderer.create(<PlacedBuildings />);
    const materials = renderer.scene
      .findAllByType("MeshBasicMaterial")
      .map((m) => m.instance as unknown as THREE.MeshBasicMaterial);
    expect(materials.some((m) => m.color.getHex() === hex("#22c55e"))).toBe(true);
    expect(materials.some((m) => m.color.getHex() === hex("#9ca3af"))).toBe(true);
    await renderer.unmount();
  });

  it("falls back to neutral if the linked room no longer exists", async () => {
    useCampusEdits.getState().addBuilding({ x: 0, z: 20, w: 10, d: 8 }, "ghost-room");

    const renderer = await ReactThreeTestRenderer.create(<PlacedBuildings />);
    const materials = renderer.scene
      .findAllByType("MeshBasicMaterial")
      .map((m) => m.instance as unknown as THREE.MeshBasicMaterial);
    expect(materials.every((m) => m.color.getHex() === hex("#9ca3af"))).toBe(true);
    await renderer.unmount();
  });
});
