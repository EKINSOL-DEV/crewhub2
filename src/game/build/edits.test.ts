import { describe, expect, it } from "vitest";
import { campusLayout } from "@/game/world/campus/layout";
import {
  applyEdits,
  buildingDesks,
  canPlaceBuilding,
  canPlaceItem,
  EMPTY_EDITS,
  placedItemPlacements,
  ROT_STEP,
  snap,
  type CampusEdits,
  type PlacedBuilding,
  type PlacedItem,
} from "./edits";

const layout = campusLayout();

describe("snap", () => {
  it("rounds to the nearest 1-unit grid cell", () => {
    expect(snap(2.4)).toBe(2);
    expect(snap(2.6)).toBe(3);
    expect(snap(-2.6)).toBe(-3);
    expect(snap(0)).toBe(0);
  });
});

describe("canPlaceItem", () => {
  it("allows an open spot well clear of the plaza", () => {
    expect(canPlaceItem(EMPTY_EDITS, layout, 12, 12)).toBe(true);
  });

  it("rejects points outside the campus bounds", () => {
    expect(canPlaceItem(EMPTY_EDITS, layout, 40, 0)).toBe(false);
  });

  it("rejects points inside the plaza margin", () => {
    expect(canPlaceItem(EMPTY_EDITS, layout, 0, 0)).toBe(false);
  });

  it("rejects points within 1u of another placed item", () => {
    const item: PlacedItem = { id: "e0", kind: "bush", x: 10, z: 10, rot: 0 };
    const edits: CampusEdits = { ...EMPTY_EDITS, items: [item] };
    expect(canPlaceItem(edits, layout, 10.5, 10)).toBe(false);
    expect(canPlaceItem(edits, layout, 13, 13)).toBe(true);
  });

  it("rejects points inside a default building plot", () => {
    const plot = layout.plots[0]!;
    expect(canPlaceItem(EMPTY_EDITS, layout, plot.x, plot.z)).toBe(false);
  });

  it("rejects points inside a placed building", () => {
    const placed: PlacedBuilding = { id: "e0", x: 0, z: 30, w: 6, d: 5, roomId: null };
    const edits: CampusEdits = { ...EMPTY_EDITS, buildings: [placed] };
    expect(canPlaceItem(edits, layout, 0, 30)).toBe(false);
    expect(canPlaceItem(edits, layout, 10, 30)).toBe(true);
  });
});

describe("canPlaceBuilding", () => {
  it("allows a valid rect clear of everything", () => {
    expect(canPlaceBuilding(EMPTY_EDITS, layout, { x: 0, z: 30, w: 6, d: 5 })).toBe(true);
  });

  it("rejects rects smaller than the 6x5 minimum", () => {
    expect(canPlaceBuilding(EMPTY_EDITS, layout, { x: 0, z: 30, w: 5, d: 5 })).toBe(false);
  });

  it("rejects rects larger than the 20x16 maximum", () => {
    expect(canPlaceBuilding(EMPTY_EDITS, layout, { x: 0, z: 30, w: 21, d: 16 })).toBe(false);
  });

  it("rejects rects that fall outside the campus bounds", () => {
    expect(canPlaceBuilding(EMPTY_EDITS, layout, { x: 38, z: 0, w: 6, d: 5 })).toBe(false);
  });

  it("rejects rects overlapping the plaza margin", () => {
    expect(canPlaceBuilding(EMPTY_EDITS, layout, { x: 0, z: 0, w: 6, d: 5 })).toBe(false);
  });

  it("rejects rects overlapping a default plot", () => {
    const plot = layout.plots[0]!;
    expect(canPlaceBuilding(EMPTY_EDITS, layout, { x: plot.x, z: plot.z, w: 6, d: 5 })).toBe(false);
  });

  it("rejects rects overlapping another placed building", () => {
    const placed: PlacedBuilding = { id: "e0", x: 0, z: 30, w: 6, d: 5, roomId: null };
    const edits: CampusEdits = { ...EMPTY_EDITS, buildings: [placed] };
    expect(canPlaceBuilding(edits, layout, { x: 1, z: 30, w: 6, d: 5 })).toBe(false);
  });
});

describe("buildingDesks", () => {
  it("gives the minimum-size building exactly one desk", () => {
    const b: PlacedBuilding = { id: "e0", x: 0, z: 30, w: 6, d: 5, roomId: null };
    expect(buildingDesks(b)).toHaveLength(1);
  });

  it("caps the maximum-size building at eight desks", () => {
    const b: PlacedBuilding = { id: "e1", x: 0, z: 30, w: 20, d: 16, roomId: null };
    expect(buildingDesks(b)).toHaveLength(8);
  });

  it("ids desks off the building id and keeps them inside the rect", () => {
    const b: PlacedBuilding = { id: "e2", x: 5, z: 5, w: 10, d: 8, roomId: null };
    const desks = buildingDesks(b);
    for (const [i, d] of desks.entries()) {
      expect(d.id).toBe(`e2-desk-${i}`);
      expect(Math.abs(d.x - b.x)).toBeLessThan(b.w / 2);
      expect(Math.abs(d.z - b.z)).toBeLessThan(b.d / 2);
    }
  });
});

describe("ROT_STEP", () => {
  it("is 15 degrees — the single source of truth store.ts/BuildControls.tsx both import", () => {
    expect(ROT_STEP).toBeCloseTo(Math.PI / 12);
  });
});

describe("placedItemPlacements", () => {
  it("groups items by kind, scaled like seeded decor", () => {
    const items: PlacedItem[] = [
      { id: "e0", kind: "bush", x: 10, z: 10, rot: 1 },
      { id: "e1", kind: "bush", x: 2, z: 2, rot: 0 },
      { id: "e2", kind: "bench", x: 5, z: 5, rot: 0.5 },
    ];
    const placements = placedItemPlacements(items);
    expect(placements.bush).toEqual([
      { x: 10, z: 10, rot: 1, scale: 1.4 },
      { x: 2, z: 2, rot: 0, scale: 1.4 },
    ]);
    expect(placements.bench).toEqual([{ x: 5, z: 5, rot: 0.5, scale: 1.4 }]);
  });

  it("returns an empty object for no items", () => {
    expect(placedItemPlacements([])).toEqual({});
  });
});

describe("applyEdits", () => {
  it("merges placed items into placements by kind, scaled like seeded decor", () => {
    const item: PlacedItem = { id: "e0", kind: "bush", x: 10, z: 10, rot: 1 };
    const edits: CampusEdits = { ...EMPTY_EDITS, items: [item] };
    const { placements } = applyEdits(layout, [], edits);
    expect(placements.bush).toEqual([{ x: 10, z: 10, rot: 1, scale: 1.4 }]);
  });

  it("delegates item->placement mapping to placedItemPlacements (no drift)", () => {
    const items: PlacedItem[] = [
      { id: "e0", kind: "bush", x: 10, z: 10, rot: 1 },
      { id: "e1", kind: "lantern", x: 3, z: 4, rot: 0 },
    ];
    const edits: CampusEdits = { ...EMPTY_EDITS, items };
    const { placements } = applyEdits(layout, [], edits);
    expect(placements).toEqual(placedItemPlacements(items));
  });

  it("merges placed buildings after the base buildings, with desks and a door", () => {
    const placed: PlacedBuilding = { id: "e0", x: 0, z: 30, w: 6, d: 5, roomId: null };
    const edits: CampusEdits = { ...EMPTY_EDITS, buildings: [placed] };
    const base = [{ plotIndex: 0, rect: { x: 22, z: 22, w: 14, d: 12 }, desks: [], door: { x: 0, z: 0 } }];
    const { buildings } = applyEdits(layout, base, edits);
    expect(buildings).toHaveLength(2);
    expect(buildings[1]!.rect).toEqual({ x: 0, z: 30, w: 6, d: 5 });
    expect(buildings[1]!.desks).toHaveLength(1);
    expect(buildings[1]!.plotIndex).not.toBe(base[0]!.plotIndex);
    expect(Math.hypot(buildings[1]!.door.x, buildings[1]!.door.z)).toBeLessThan(
      Math.hypot(placed.x, placed.z),
    );
  });

  it("does not filter removedDefaults yet (M3 scope)", () => {
    const edits: CampusEdits = { ...EMPTY_EDITS, removedDefaults: ["desk-0-0"] };
    const base = [{ plotIndex: 0, rect: { x: 22, z: 22, w: 14, d: 12 }, desks: [], door: { x: 0, z: 0 } }];
    const { buildings } = applyEdits(layout, base, edits);
    expect(buildings).toHaveLength(1);
    expect(buildings[0]).toEqual(base[0]);
  });
});
