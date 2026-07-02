import { describe, expect, it } from "vitest";
import { CAMPUS, campusLayout, insidePlaza, insidePlot, nearPath } from "./layout";

describe("campusLayout", () => {
  const layout = campusLayout();

  it("is deterministic", () => {
    expect(campusLayout()).toEqual(layout);
  });

  it("lays four path arms plus a plaza ring", () => {
    expect(layout.pathTiles.length).toBeGreaterThan(40);
  });

  it("reserves four building plots clear of paths and plaza", () => {
    expect(layout.plots).toHaveLength(4);
    for (const p of layout.plots) {
      expect(insidePlaza(p.x, p.z, 0)).toBe(false);
      expect(nearPath(p.x, p.z, 0)).toBe(false);
    }
  });

  it("scatters every kind, all inside bounds", () => {
    for (const placements of Object.values(layout.scatter)) {
      expect(placements.length).toBeGreaterThan(0);
      for (const p of placements) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(CAMPUS.half);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(CAMPUS.half);
      }
    }
  });

  it("keeps trees off the plaza, paths and plots", () => {
    const trees = [
      ...layout.scatter.treeDefault,
      ...layout.scatter.treeOak,
      ...layout.scatter.treeDetailed,
      ...layout.scatter.treeFat,
      ...layout.scatter.treePine,
    ];
    expect(trees.length).toBeGreaterThan(30);
    for (const t of trees) {
      expect(insidePlaza(t.x, t.z, 1)).toBe(false);
      expect(nearPath(t.x, t.z, 1)).toBe(false);
      expect(insidePlot(t.x, t.z, layout.plots, 0.5)).toBe(false);
    }
  });

  it("places plaza props: benches face the fountain, lanterns line the paths", () => {
    expect(layout.props.bench).toHaveLength(4);
    expect(layout.props.lantern.length).toBeGreaterThanOrEqual(8);
    expect(layout.props.banner).toHaveLength(4);
    expect(layout.props.hedge.length).toBeGreaterThan(4);
  });
});
