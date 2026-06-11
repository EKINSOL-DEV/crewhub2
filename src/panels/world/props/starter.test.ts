import { describe, expect, it } from "vitest";
import { EDGE_MARGIN } from "./placement";
import { CORE_PROPS } from "./registry";
import { starterProps } from "./starter";

const DIMS = { width: 10, depth: 10 };

describe("starterProps", () => {
  it("is deterministic per room id", () => {
    expect(starterProps("room-a", DIMS)).toEqual(starterProps("room-a", DIMS));
  });

  it("yields between 2 and 4 props", () => {
    for (const id of ["a", "b", "c", "room-1", "room-2", "0f3acd", "hq"]) {
      const n = starterProps(id, DIMS).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it("varies between rooms (some pair of many differs)", () => {
    const sets = ["a", "b", "c", "d", "e", "f"].map((id) => JSON.stringify(starterProps(id, DIMS)));
    expect(new Set(sets).size).toBeGreaterThan(1);
  });

  it("only places registered core props, inside the room, at subtle scale", () => {
    for (const roomId of ["x", "y", "zz-top"]) {
      const props = starterProps(roomId, DIMS);
      const ids = new Set<string>();
      for (const p of props) {
        expect(CORE_PROPS[p.propId], p.propId).toBeDefined();
        expect(Math.abs(p.x)).toBeLessThanOrEqual(DIMS.width / 2 - EDGE_MARGIN);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(DIMS.depth / 2 - EDGE_MARGIN);
        expect(p.scale).toBe(1);
        expect(p.marker).toBeUndefined();
        expect(ids.has(p.id)).toBe(false); // unique instance ids
        ids.add(p.id);
      }
      // No duplicate prop kinds in one starter room — keeps it tasteful.
      const kinds = props.map((p) => p.propId);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });
});
