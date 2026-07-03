// R3F render smoke (M3 T5, walls added M5 T3): confirms Pavilion.tsx is still
// fully parametric off `Building.rect` — no dimension hardcoded to the
// seeded 14x12 campus plots — by rendering player-built-shaped pavilions and
// checking the mesh-count formula from campus-world.smoke.test.tsx still
// holds: 1 slab + 4 pillars + WALL_MESHES + desks * (1 top + 2 legs
// + 1 screen). WALL_MESHES is 3 full-length walls (one per non-door side)
// plus 2 segments on the door-side wall split by its gap — true for every
// size in [6,20]x[5,16] (the placeable range), since the 2.2-unit door gap
// never comes close to swallowing a whole wall (minimum span is 5).
import { describe, expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { buildingDesks } from "@/game/build/edits";
import { nearestEdgeDoor, type Building } from "./buildings";
import type { Rect } from "./layout";
import { Pavilion } from "./Pavilion";

const WALL_MESHES = 3 + 2; // 3 full sides + 2 segments on the door side

describe("Pavilion parametric smoke", () => {
  it("scales pillar/beam/wall/desk mesh count off an arbitrary rect, not the seeded 14x12 plots", async () => {
    const rect: Rect = { x: 0, z: 0, w: 10, d: 8 };
    const desks = buildingDesks({ id: "t", x: rect.x, z: rect.z, w: rect.w, d: rect.d, roomId: null });
    expect(desks).toHaveLength(4); // floor((10-2)/3.5)=2 cols * floor((8-2)/3)=2 rows
    const building: Building = { plotIndex: 0, rect, desks, door: nearestEdgeDoor(rect) };

    const renderer = await ReactThreeTestRenderer.create(<Pavilion building={building} />);
    const meshes = renderer.scene.findAllByType("Mesh");
    const STRUCTURE_MESHES = 1 + 4 + WALL_MESHES; // slab + 4 pillars + walls (beams cut on user feedback)
    const DESK_MESHES = desks.length * 4; // top + 2 legs + screen
    expect(meshes.length).toBe(STRUCTURE_MESHES + DESK_MESHES);
    await renderer.unmount();
  });

  it("holds for a different rect too (6x5, the minimum placeable size)", async () => {
    const rect: Rect = { x: 5, z: -12, w: 6, d: 5 };
    const desks = buildingDesks({ id: "t2", x: rect.x, z: rect.z, w: rect.w, d: rect.d, roomId: null });
    const building: Building = { plotIndex: 0, rect, desks, door: nearestEdgeDoor(rect) };

    const renderer = await ReactThreeTestRenderer.create(<Pavilion building={building} />);
    const meshes = renderer.scene.findAllByType("Mesh");
    expect(meshes.length).toBe(1 + 4 + WALL_MESHES + desks.length * 4);
    await renderer.unmount();
  });

  it("holds at the maximum placeable size too (20x16)", async () => {
    const rect: Rect = { x: -10, z: 30, w: 20, d: 16 };
    const desks = buildingDesks({ id: "t3", x: rect.x, z: rect.z, w: rect.w, d: rect.d, roomId: null });
    const building: Building = { plotIndex: 0, rect, desks, door: nearestEdgeDoor(rect) };

    const renderer = await ReactThreeTestRenderer.create(<Pavilion building={building} />);
    const meshes = renderer.scene.findAllByType("Mesh");
    expect(meshes.length).toBe(1 + 4 + WALL_MESHES + desks.length * 4);
    await renderer.unmount();
  });
});
