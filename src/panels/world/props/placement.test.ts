import { describe, expect, it } from "vitest";
import {
  clampScale,
  clampToRoom,
  editProp,
  normalizeRot,
  parseStoredRoomProps,
  propsSettingKey,
  removeProp,
  ROT_STEP,
  rotateProp,
  SCALE_MAX,
  SCALE_MIN,
  scaleProp,
  serializeRoomProps,
  type PlacedProp,
} from "./placement";

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

describe("clampScale", () => {
  it("clamps into [SCALE_MIN, SCALE_MAX]", () => {
    expect(clampScale(0.01)).toBe(SCALE_MIN);
    expect(clampScale(50)).toBe(SCALE_MAX);
    expect(clampScale(1.2)).toBe(1.2);
  });
  it("falls back to 1 for garbage", () => {
    expect(clampScale(Number.NaN)).toBe(1);
  });
});

describe("normalizeRot", () => {
  it("wraps into (-π, π]", () => {
    expect(normalizeRot(0)).toBe(0);
    expect(normalizeRot(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normalizeRot(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2);
  });
  it("rotation step divides a quarter turn evenly", () => {
    expect((Math.PI / 2) % ROT_STEP).toBeCloseTo(0);
  });
});

describe("editor steps", () => {
  it("rotateProp steps by ROT_STEP and wraps", () => {
    expect(rotateProp(prop(), 1).rot).toBeCloseTo(ROT_STEP);
    expect(rotateProp(prop(), -1).rot).toBeCloseTo(-ROT_STEP);
    let p = prop({ rot: Math.PI - ROT_STEP / 2 });
    p = rotateProp(p, 1);
    expect(p.rot).toBeLessThanOrEqual(Math.PI);
  });

  it("scaleProp steps multiplicatively within clamps", () => {
    expect(scaleProp(prop(), 1).scale).toBeCloseTo(1.1);
    expect(scaleProp(prop({ scale: SCALE_MAX }), 1).scale).toBe(SCALE_MAX);
    expect(scaleProp(prop({ scale: SCALE_MIN }), -1).scale).toBe(SCALE_MIN);
  });

  it("editProp patches only the matching instance", () => {
    const list = [prop(), prop({ id: "p2" })];
    const out = editProp(list, "p2", (p) => ({ ...p, x: 9 }));
    expect(out[0]!.x).toBe(0);
    expect(out[1]!.x).toBe(9);
    expect(editProp(list, "nope", (p) => ({ ...p, x: 9 }))).toEqual(list);
  });

  it("removeProp drops the matching instance", () => {
    const list = [prop(), prop({ id: "p2" })];
    expect(removeProp(list, "p1").map((p) => p.id)).toEqual(["p2"]);
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
    expect(out[0]!.scale).toBe(SCALE_MAX);
    expect(Math.abs(out[0]!.rot)).toBeLessThanOrEqual(Math.PI);
  });
});
