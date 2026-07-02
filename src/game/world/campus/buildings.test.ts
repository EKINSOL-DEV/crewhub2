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
    }
  });
});
