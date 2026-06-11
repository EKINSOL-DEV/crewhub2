import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const kv = new Map<string, string>();
const getSetting = vi.fn(async (key: string) => ({ status: "ok" as const, data: kv.get(key) ?? null }));
const setSetting = vi.fn(async (key: string, value: string) => {
  kv.set(key, value);
  return { status: "ok" as const, data: null };
});

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: (key: string) => getSetting(key),
    setSetting: (key: string, value: string) => setSetting(key, value),
  },
}));

import { parseStoredRoomProps, propsSettingKey, serializeRoomProps, type PlacedProp } from "./placement";
import { starterProps } from "./starter";
import { PERSIST_DEBOUNCE_MS, useWorldProps } from "./store";

const DIMS = { width: 10, depth: 10 };

function prop(over: Partial<PlacedProp> = {}): PlacedProp {
  return { id: "p1", propId: "core:plant", x: 1, z: 1, rot: 0, scale: 1, ...over };
}

beforeEach(() => {
  vi.useFakeTimers();
  kv.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useWorldProps", () => {
  it("falls back to the deterministic starter set when nothing is stored", async () => {
    await useWorldProps.getState().ensureLoaded("fresh-room", DIMS);
    expect(useWorldProps.getState().byRoom["fresh-room"]).toEqual(starterProps("fresh-room", DIMS));
  });

  it("loads persisted props from the settings KV and clamps them", async () => {
    kv.set(propsSettingKey("kept-room"), serializeRoomProps([prop({ x: 99 })]));
    await useWorldProps.getState().ensureLoaded("kept-room", DIMS);
    const loaded = useWorldProps.getState().byRoom["kept-room"]!;
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.x).toBeLessThanOrEqual(5);
  });

  it("only fetches once per room", async () => {
    const calls = getSetting.mock.calls.length;
    await useWorldProps.getState().ensureLoaded("once-room", DIMS);
    await useWorldProps.getState().ensureLoaded("once-room", DIMS);
    expect(getSetting.mock.calls.length).toBe(calls + 1);
  });

  it("debounces persistence: rapid edits collapse into one KV write", async () => {
    const s = useWorldProps.getState();
    s.setRoomProps("edit-room", [prop()]);
    s.setRoomProps("edit-room", [prop({ x: 2 })]);
    s.setRoomProps("edit-room", [prop({ x: 3 })]);
    expect(setSetting).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 10);
    expect(setSetting).toHaveBeenCalledTimes(1);
    const stored = parseStoredRoomProps(kv.get(propsSettingKey("edit-room"))!)!;
    expect(stored[0]!.x).toBe(3);
  });
});
