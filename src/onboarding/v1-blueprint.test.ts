// Ported from panels/world/props/{placement,parse-v1}.test.ts (M4 T6 — the
// switch): same coverage, minus the placement-editor cases (rotate/scale/
// edit/remove) that died with the deleted 3D editor UI.
import { describe, expect, it } from "vitest";
import {
  clampToRoom,
  EDGE_MARGIN,
  normalizeRot,
  parseStoredRoomProps,
  parseV1Blueprint,
  propsSettingKey,
  serializeRoomProps,
  type PlacedProp,
} from "./v1-blueprint";

const DIMS = { width: 10, depth: 10 };

function prop(over: Partial<PlacedProp> = {}): PlacedProp {
  return { id: "p1", propId: "core:plant", x: 0, z: 0, rot: 0, scale: 1, ...over };
}

describe("clampToRoom", () => {
  it("keeps in-bounds props untouched", () => {
    const p = prop({ x: 2.5, z: -3 });
    expect(clampToRoom(p, DIMS)).toEqual(p);
  });

  it("clamps out-of-bounds coordinates inside the walls", () => {
    const p = clampToRoom(prop({ x: 99, z: -99 }), DIMS);
    expect(p.x).toBeLessThanOrEqual(5);
    expect(p.x).toBeGreaterThan(3.5); // hugs the wall it overflowed
    expect(p.z).toBeGreaterThanOrEqual(-5);
  });

  it("coerces non-finite coordinates to the center", () => {
    const p = clampToRoom(prop({ x: Number.NaN, z: Number.POSITIVE_INFINITY }), DIMS);
    expect(p.x).toBe(0);
    expect(Number.isFinite(p.z)).toBe(true);
  });
});

describe("normalizeRot", () => {
  it("wraps into (-π, π]", () => {
    expect(normalizeRot(0)).toBe(0);
    expect(normalizeRot(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normalizeRot(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
  });
});

describe("persistence round-trip", () => {
  it("settings key is namespaced per room", () => {
    expect(propsSettingKey("r42")).toBe("world.props:r42");
  });

  it("serialize → parse round-trips", () => {
    const props = [prop(), prop({ id: "p2", propId: "core:couch", x: 1, z: 2, rot: 0.5, scale: 1.5 })];
    expect(parseStoredRoomProps(serializeRoomProps(props))).toEqual(props);
  });

  it("round-trips the unknown-prop marker", () => {
    const props = [prop({ propId: "mod:weird", marker: "📦" })];
    expect(parseStoredRoomProps(serializeRoomProps(props))![0]!.marker).toBe("📦");
  });

  it("rejects garbage and wrong shapes", () => {
    expect(parseStoredRoomProps("not json")).toBeNull();
    expect(parseStoredRoomProps("null")).toBeNull();
    expect(parseStoredRoomProps('{"v":99,"props":[]}')).toBeNull();
    expect(parseStoredRoomProps('{"v":1}')).toBeNull();
  });

  it("drops invalid entries but keeps valid ones", () => {
    const text = JSON.stringify({
      v: 1,
      props: [
        { id: "ok", propId: "core:desk", x: 1, z: 1, rot: 0, scale: 1 },
        { id: "bad", propId: 7, x: 1, z: 1, rot: 0, scale: 1 },
        { propId: "core:lamp", x: 0, z: 0, rot: 0, scale: 1 }, // missing id
        "nonsense",
      ],
    });
    const out = parseStoredRoomProps(text);
    expect(out).toHaveLength(1);
    expect(out![0]!.id).toBe("ok");
  });

  it("sanitizes numbers on parse (scale/rot clamped, coords finite)", () => {
    const text = JSON.stringify({
      v: 1,
      props: [{ id: "p", propId: "core:desk", x: 1, z: 1, rot: 99, scale: 999 }],
    });
    const out = parseStoredRoomProps(text)!;
    expect(out[0]!.scale).toBe(2); // SCALE_MAX
    expect(Math.abs(out[0]!.rot)).toBeLessThanOrEqual(Math.PI);
  });
});

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
