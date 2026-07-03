import { describe, expect, it } from "vitest";
import { campusBuildings, HQ_RECT, hqBuilding } from "./buildings";
import { campusLayout } from "./layout";

describe("hqBuilding", () => {
  const hq = hqBuilding();

  it("has plotIndex -1, no desks, and kind hq", () => {
    expect(hq.plotIndex).toBe(-1);
    expect(hq.desks).toEqual([]);
    expect(hq.kind).toBe("hq");
    expect(hq.rect).toEqual(HQ_RECT);
  });

  it("carries one door per wall — four midpoints", () => {
    expect(hq.doors).toHaveLength(4);
    const hw = HQ_RECT.w / 2;
    const hd = HQ_RECT.d / 2;
    expect(hq.doors).toEqual(
      expect.arrayContaining([
        { x: 0, z: hd },
        { x: 0, z: -hd },
        { x: hw, z: 0 },
        { x: -hw, z: 0 },
      ]),
    );
  });

  it("picks the south edge (+z) as the primary door — the face toward the default camera", () => {
    expect(hq.door).toEqual({ x: 0, z: HQ_RECT.d / 2 });
  });
});

describe("campusBuildings", () => {
  const buildings = campusBuildings(campusLayout().plots);
  // M6: HQ is prepended, so index 0 is now HQ and the four plot pavilions
  // shift to indices 1-4. `pavilions` isolates the plot buildings for the
  // assertions below that don't apply to the deskless HQ.
  const pavilions = buildings.filter((b) => b.kind !== "hq");

  it("prepends the permanent HQ building ahead of the plot pavilions", () => {
    expect(buildings).toHaveLength(5);
    expect(buildings[0]!.kind).toBe("hq");
    expect(buildings[0]!.rect).toEqual(HQ_RECT);
  });

  it("builds one pavilion per plot with four desks each", () => {
    expect(pavilions).toHaveLength(4);
    for (const b of pavilions) {
      expect(b.desks).toHaveLength(4);
      // Desks sit inside their plot.
      for (const d of b.desks) {
        expect(Math.abs(d.x - b.rect.x)).toBeLessThan(b.rect.w / 2);
        expect(Math.abs(d.z - b.rect.z)).toBeLessThan(b.rect.d / 2);
      }
    }
  });

  it("gives every desk a unique id and each pavilion's door faces the campus center", () => {
    const ids = new Set(pavilions.flatMap((b) => b.desks.map((d) => d.id)));
    expect(ids.size).toBe(16);
    for (const b of pavilions) {
      // Door is strictly closer to the origin than the plot center.
      expect(Math.hypot(b.door.x, b.door.z)).toBeLessThan(Math.hypot(b.rect.x, b.rect.z));
      // Door is the nearer of the two candidate edge midpoints.
      const xEdge = { x: b.rect.x - Math.sign(b.rect.x) * (b.rect.w / 2), z: b.rect.z };
      const zEdge = { x: b.rect.x, z: b.rect.z - Math.sign(b.rect.z) * (b.rect.d / 2) };
      const doorDist = Math.hypot(b.door.x, b.door.z);
      const otherEdgeDist =
        doorDist === Math.hypot(xEdge.x, xEdge.z)
          ? Math.hypot(zEdge.x, zEdge.z)
          : Math.hypot(xEdge.x, xEdge.z);
      expect(doorDist).toBeLessThanOrEqual(otherEdgeDist);
    }
  });

  it("defaults every plot's projectId to null when no plotProjects map is given", () => {
    for (const b of pavilions) expect(b.projectId).toBeNull();
  });

  it("leaves HQ's projectId unset — nobody works there, so no project links it", () => {
    expect(buildings[0]!.projectId).toBeUndefined();
  });

  it("assigns projectId from the plotProjects map, defaulting unmapped plots to null", () => {
    // Indices shift by one versus pre-M6: buildings[0] is HQ, so plot 0 is
    // buildings[1], plot 1 is buildings[2], etc.
    const withProjects = campusBuildings(campusLayout().plots, { 0: "proj-a", 2: "proj-b" });
    expect(withProjects[1]!.projectId).toBe("proj-a");
    expect(withProjects[2]!.projectId).toBeNull();
    expect(withProjects[3]!.projectId).toBe("proj-b");
    expect(withProjects[4]!.projectId).toBeNull();
  });
});
