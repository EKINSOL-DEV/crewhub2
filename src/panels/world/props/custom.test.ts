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

import {
  addCustomDef,
  CREATOR_PROPS_KEY,
  parseStoredCustomProps,
  removeCustomDef,
  serializeCustomProps,
  useCustomProps,
} from "./custom";
import { FALLBACK_PROP_ID, resolveProp, type PropDefinition } from "./registry";
import { PERSIST_DEBOUNCE_MS } from "./store";

function def(over: Partial<PropDefinition> = {}): PropDefinition {
  return {
    id: "creator:duck",
    label: "Duck",
    emoji: "🦆",
    radius: 0.5,
    keywords: ["duck"],
    parts: [{ shape: "sphere", size: [0.3], at: [0, 0.3, 0], color: "shade" }],
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("custom prop folds", () => {
  it("addCustomDef adds (and replaces) without mutating", () => {
    const base: Record<string, PropDefinition> = {};
    const one = addCustomDef(base, def());
    expect(base).toEqual({});
    expect(one["creator:duck"]!.label).toBe("Duck");
    const replaced = addCustomDef(one, def({ label: "Bigger duck" }));
    expect(replaced["creator:duck"]!.label).toBe("Bigger duck");
    expect(Object.keys(replaced)).toHaveLength(1);
  });

  it("removeCustomDef drops by id, tolerates absent ids", () => {
    const one = addCustomDef({}, def());
    expect(removeCustomDef(one, "creator:duck")).toEqual({});
    expect(removeCustomDef(one, "creator:ghost")).toEqual(one);
  });
});

describe("custom prop persistence (pure round-trip)", () => {
  it("serialize → parse round-trips a definition", () => {
    const defs = addCustomDef({}, def());
    expect(parseStoredCustomProps(serializeCustomProps(defs))).toEqual(defs);
  });

  it("returns null for corrupt blobs", () => {
    for (const bad of ["not json {", '"hi"', "[1,2]", "{}", '{"v":99,"defs":[]}', '{"v":1,"defs":"nope"}']) {
      expect(parseStoredCustomProps(bad), bad).toBeNull();
    }
  });

  it("drops invalid defs but keeps the valid ones", () => {
    const blob = JSON.stringify({
      v: 1,
      defs: [def(), { id: "creator:broken" }, { ...def({ id: "creator:flat" }), parts: [] }, "junk"],
    });
    const parsed = parseStoredCustomProps(blob)!;
    expect(Object.keys(parsed)).toEqual(["creator:duck"]);
  });
});

describe("useCustomProps", () => {
  it("tolerates a corrupt persisted blob: starts empty, only fetches once", async () => {
    kv.set(CREATOR_PROPS_KEY, "garbage {");
    await useCustomProps.getState().init();
    expect(useCustomProps.getState().defs).toEqual({});
    const calls = getSetting.mock.calls.length;
    await useCustomProps.getState().init();
    expect(getSetting.mock.calls.length).toBe(calls);
  });

  it("addDef makes resolveProp return the custom def; removeDef falls back to the crate", () => {
    useCustomProps.getState().addDef(def());
    expect(resolveProp("creator:duck").label).toBe("Duck");
    useCustomProps.getState().removeDef("creator:duck");
    expect(resolveProp("creator:duck").id).toBe(FALLBACK_PROP_ID);
  });

  it("unknown ids still fall back to the crate", () => {
    expect(resolveProp("creator:nope").id).toBe(FALLBACK_PROP_ID);
    expect(resolveProp("core:desk").id).toBe("core:desk");
  });

  it("debounces persistence: rapid edits collapse into one KV write", async () => {
    setSetting.mockClear();
    const s = useCustomProps.getState();
    s.addDef(def());
    s.addDef(def({ id: "creator:duck-2" }));
    s.removeDef("creator:duck-2");
    expect(setSetting).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS + 10);
    expect(setSetting).toHaveBeenCalledTimes(1);
    const stored = parseStoredCustomProps(kv.get(CREATOR_PROPS_KEY)!)!;
    expect(Object.keys(stored)).toEqual(["creator:duck"]);
  });
});
