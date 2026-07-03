import { describe, expect, it } from "vitest";
import { campusBuildings } from "./buildings";
import { campusLayout } from "./layout";

describe("campusBuildings", () => {
  const buildings = campusBuildings(campusLayout().plots);

  it("builds one pavilion per plot with four desks each", () => {
    expect(buildings).toHaveLength(4);
    for (const b of buildings) {
      expect(b.desks).toHaveLength(4);
      // Desks sit inside their plot.
      for (const d of b.desks) {
        expect(Math.abs(d.x - b.rect.x)).toBeLessThan(b.rect.w / 2);
        expect(Math.abs(d.z - b.rect.z)).toBeLessThan(b.rect.d / 2);
      }
    }
  });

  it("gives every desk a unique id and each door faces the campus center", () => {
    const ids = new Set(buildings.flatMap((b) => b.desks.map((d) => d.id)));
    expect(ids.size).toBe(16);
    for (const b of buildings) {
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
});
