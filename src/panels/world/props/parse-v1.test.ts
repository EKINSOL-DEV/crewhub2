import { describe, expect, it } from "vitest";
import { EDGE_MARGIN } from "./placement";
import { parseV1Blueprint } from "./parse-v1";

const DIMS = { width: 10, depth: 10 };

/** A small, realistic v1 blueprint (custom_blueprints.blueprint_json shape). */
function blueprint(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "bp-1",
    name: "Cozy office",
    gridWidth: 12,
    gridDepth: 12,
    cellSize: 0.6,
    placements: [
      { propId: "desk-with-monitor", x: 2, z: 2, type: "furniture", rotation: 90, span: { w: 2, d: 1 } },
      { propId: "office-chair", x: 3, z: 4 },
      { propId: "plant-large", x: 9, z: 9, type: "decoration" },
      { propId: "work-point-1", x: 3, z: 3, type: "interaction", interactionType: "work" },
    ],
    doorPositions: [{ x: 5, z: 0, facing: "north" }],
    walkableCenter: { x: 5, z: 5 },
    interactionPoints: { work: [{ x: 3, z: 3 }], coffee: [], sleep: [] },
    ...over,
  };
}

function okProps(text: string) {
  const res = parseV1Blueprint(text, DIMS);
  if (!res.ok) throw new Error(`expected ok, got: ${res.error}`);
  return res;
}

describe("parseV1Blueprint", () => {
  it("maps known v1 prop ids onto core props with grid→room coordinates", () => {
    const { props, warnings } = okProps(JSON.stringify(blueprint()));
    expect(props.map((p) => p.propId)).toEqual(["core:desk", "core:chair", "core:plant"]);
    expect(warnings).toEqual([]);
    // All inside the room, unique ids
    const hw = DIMS.width / 2 - EDGE_MARGIN;
    for (const p of props) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(hw);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(hw);
    }
    expect(new Set(props.map((p) => p.id)).size).toBe(props.length);
  });

  it("converts v1 rotation degrees to radians", () => {
    const { props } = okProps(JSON.stringify(blueprint()));
    expect(props[0]!.rot).toBeCloseTo(Math.PI / 2);
    expect(props[1]!.rot).toBe(0);
  });

  it("skips interaction markers", () => {
    const { props } = okProps(JSON.stringify(blueprint()));
    expect(props.some((p) => p.propId.includes("point"))).toBe(false);
    expect(props).toHaveLength(3);
  });

  it("falls back to a 📦-marked crate for unknown prop ids, with a warning", () => {
    const bp = blueprint({
      placements: [{ propId: "satellite-dish", x: 1, z: 1 }],
    });
    const { props, warnings } = okProps(JSON.stringify(bp));
    expect(props).toHaveLength(1);
    expect(props[0]!.propId).toBe("core:crate");
    expect(props[0]!.marker).toBe("📦");
    expect(warnings.join(" ")).toContain("satellite-dish");
  });

  it("clamps out-of-bounds placements into the room", () => {
    const bp = blueprint({
      gridWidth: 40,
      gridDepth: 40,
      cellSize: 2, // 80×80 v1 room squeezed into 10×10
      placements: [{ propId: "plant", x: 39, z: 0 }],
    });
    const { props } = okProps(JSON.stringify(bp));
    expect(Math.abs(props[0]!.x)).toBeLessThanOrEqual(DIMS.width / 2 - EDGE_MARGIN);
    expect(Math.abs(props[0]!.z)).toBeLessThanOrEqual(DIMS.depth / 2 - EDGE_MARGIN);
  });

  it("accepts the API row wrapper ({ blueprint: {...} })", () => {
    const { props } = okProps(JSON.stringify({ id: "row", blueprint: blueprint() }));
    expect(props).toHaveLength(3);
  });

  it("accepts the DB row wrapper ({ blueprint_json: '...' })", () => {
    const { props } = okProps(JSON.stringify({ blueprint_json: JSON.stringify(blueprint()) }));
    expect(props).toHaveLength(3);
  });

  it("tolerates missing grid dims by inferring them from placements", () => {
    const bp = blueprint({ gridWidth: undefined, gridDepth: undefined });
    const { props } = okProps(JSON.stringify(bp));
    expect(props).toHaveLength(3);
  });

  it("drops malformed placements with a warning but keeps the rest", () => {
    const bp = blueprint({
      placements: [{ propId: "plant", x: 1, z: 1 }, { propId: "desk" }, "garbage", null],
    });
    const { props, warnings } = okProps(JSON.stringify(bp));
    expect(props).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("rejects non-JSON input", () => {
    const res = parseV1Blueprint("not json {", DIMS);
    expect(res.ok).toBe(false);
  });

  it("rejects JSON that is not a blueprint", () => {
    for (const bad of ['"hi"', "[1,2]", "{}", '{"placements": "nope"}']) {
      const res = parseV1Blueprint(bad, DIMS);
      expect(res.ok, bad).toBe(false);
    }
  });

  it("accepts an empty placements list (valid, just empty)", () => {
    const { props } = okProps(JSON.stringify(blueprint({ placements: [] })));
    expect(props).toEqual([]);
  });
});
