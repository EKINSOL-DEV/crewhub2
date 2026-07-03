import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));

import { commands } from "@/ipc/bindings";
import { EDITS_SETTING_KEY, resetCampusEditsForTests, useCampusEdits } from "./store";

describe("useCampusEdits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
  });

  it("starts empty", () => {
    expect(useCampusEdits.getState().edits).toEqual({ items: [], buildings: [], removedDefaults: [] });
    expect(useCampusEdits.getState().version).toBe(0);
  });

  it("addItem snaps to the grid, appends the item and bumps version", () => {
    useCampusEdits.getState().addItem("bush", 10.6, 4.2, 0);
    const s = useCampusEdits.getState();
    expect(s.edits.items).toHaveLength(1);
    expect(s.edits.items[0]).toMatchObject({ kind: "bush", x: 11, z: 4, rot: 0 });
    expect(s.version).toBe(1);
    expect(commands.setSetting).toHaveBeenCalledWith(EDITS_SETTING_KEY, expect.any(String));
  });

  it("moveItem updates an existing item's position and bumps version", () => {
    useCampusEdits.getState().addItem("bush", 10, 4, 0);
    const id = useCampusEdits.getState().edits.items[0]!.id;
    useCampusEdits.getState().moveItem(id, 5.4, 5.6);
    const item = useCampusEdits.getState().edits.items.find((i) => i.id === id)!;
    expect(item.x).toBe(5);
    expect(item.z).toBe(6);
    expect(useCampusEdits.getState().version).toBe(2);
  });

  it("rotateItem advances rotation and removeItem drops it", () => {
    useCampusEdits.getState().addItem("bush", 10, 4, 0);
    const id = useCampusEdits.getState().edits.items[0]!.id;
    useCampusEdits.getState().rotateItem(id, 1);
    expect(useCampusEdits.getState().edits.items.find((i) => i.id === id)!.rot).not.toBe(0);
    useCampusEdits.getState().removeItem(id);
    expect(useCampusEdits.getState().edits.items.find((i) => i.id === id)).toBeUndefined();
  });

  it("addBuilding appends a snapped building, returns its id, and removeBuilding drops it", () => {
    const id = useCampusEdits.getState().addBuilding({ x: 10.4, z: 20.6, w: 6, d: 5 }, "room-1");
    const b = useCampusEdits.getState().edits.buildings[0]!;
    expect(b).toMatchObject({ x: 10, z: 21, w: 6, d: 5, roomId: "room-1" });
    expect(id).toBe(b.id);
    useCampusEdits.getState().removeBuilding(b.id);
    expect(useCampusEdits.getState().edits.buildings).toHaveLength(0);
  });

  it("setBuildingRoom updates only the targeted building's roomId and bumps version", () => {
    const idA = useCampusEdits.getState().addBuilding({ x: 10, z: 20, w: 6, d: 5 }, null);
    const idB = useCampusEdits.getState().addBuilding({ x: -10, z: 20, w: 6, d: 5 }, null);
    const before = useCampusEdits.getState().version;

    useCampusEdits.getState().setBuildingRoom(idA, "room-9");

    const buildings = useCampusEdits.getState().edits.buildings;
    expect(buildings.find((b) => b.id === idA)!.roomId).toBe("room-9");
    expect(buildings.find((b) => b.id === idB)!.roomId).toBeNull();
    expect(useCampusEdits.getState().version).toBe(before + 1);
  });

  it("assigns ids from a monotonic counter, not Date.now/Math.random", () => {
    useCampusEdits.getState().addItem("bush", 1, 1, 0);
    useCampusEdits.getState().addItem("bush", 2, 2, 0);
    const [a, b] = useCampusEdits.getState().edits.items;
    expect(a!.id).not.toBe(b!.id);
    expect(a!.id).toMatch(/^e\d+$/);
    expect(b!.id).toMatch(/^e\d+$/);
  });

  it("init loads persisted edits and the id counter from the settings KV", async () => {
    vi.mocked(commands.getSetting).mockResolvedValueOnce({
      status: "ok",
      data: JSON.stringify({
        v: 1,
        counter: 3,
        edits: {
          items: [{ id: "e0", kind: "bush", x: 1, z: 1, rot: 0 }],
          buildings: [],
          removedDefaults: [],
        },
      }),
    } as never);
    await useCampusEdits.getState().init();
    expect(useCampusEdits.getState().edits.items).toHaveLength(1);
    expect(useCampusEdits.getState().version).toBe(1);
    useCampusEdits.getState().addItem("bush", 5, 5, 0);
    expect(useCampusEdits.getState().edits.items[1]!.id).toBe("e3");
  });

  it("init tolerates junk JSON and falls back to empty edits", async () => {
    vi.mocked(commands.getSetting).mockResolvedValueOnce({ status: "ok", data: "not json{{{" } as never);
    await useCampusEdits.getState().init();
    expect(useCampusEdits.getState().edits).toEqual({ items: [], buildings: [], removedDefaults: [] });
  });

  it("init only fetches once", async () => {
    await useCampusEdits.getState().init();
    await useCampusEdits.getState().init();
    expect(commands.getSetting).toHaveBeenCalledTimes(1);
  });
});

describe("versionByKind (M4 debt sweep — per-kind edit versions)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
  });

  it("starts empty", () => {
    expect(useCampusEdits.getState().versionByKind).toEqual({});
  });

  it("addItem bumps only the placed item's kind", () => {
    useCampusEdits.getState().addItem("bush", 1, 1, 0);
    expect(useCampusEdits.getState().versionByKind).toEqual({ bush: 1 });
    useCampusEdits.getState().addItem("bench", 2, 2, 0);
    expect(useCampusEdits.getState().versionByKind).toEqual({ bush: 1, bench: 1 });
    useCampusEdits.getState().addItem("bush", 3, 3, 0);
    expect(useCampusEdits.getState().versionByKind).toEqual({ bush: 2, bench: 1 });
  });

  it("moveItem/rotateItem/removeItem all bump only that item's kind, leaving other kinds untouched", () => {
    useCampusEdits.getState().addItem("bush", 1, 1, 0);
    useCampusEdits.getState().addItem("bench", 2, 2, 0);
    const bushId = useCampusEdits.getState().edits.items[0]!.id;
    const before = useCampusEdits.getState().versionByKind;
    expect(before).toEqual({ bush: 1, bench: 1 });

    useCampusEdits.getState().moveItem(bushId, 5, 5);
    expect(useCampusEdits.getState().versionByKind).toEqual({ bush: 2, bench: 1 });

    useCampusEdits.getState().rotateItem(bushId, 1);
    expect(useCampusEdits.getState().versionByKind).toEqual({ bush: 3, bench: 1 });

    useCampusEdits.getState().removeItem(bushId);
    expect(useCampusEdits.getState().versionByKind).toEqual({ bush: 4, bench: 1 });
  });

  it("still bumps the global version on every item mutation (nav-grid re-derive still fires)", () => {
    useCampusEdits.getState().addItem("bush", 1, 1, 0);
    const before = useCampusEdits.getState().version;
    const id = useCampusEdits.getState().edits.items[0]!.id;
    useCampusEdits.getState().moveItem(id, 2, 2);
    expect(useCampusEdits.getState().version).toBe(before + 1);
  });

  it("building mutations bump only the global version, never versionByKind", () => {
    const id = useCampusEdits.getState().addBuilding({ x: 10, z: 20, w: 6, d: 5 }, null);
    expect(useCampusEdits.getState().versionByKind).toEqual({});
    useCampusEdits.getState().setBuildingRoom(id, "room-1");
    expect(useCampusEdits.getState().versionByKind).toEqual({});
    useCampusEdits.getState().removeBuilding(id);
    expect(useCampusEdits.getState().versionByKind).toEqual({});
  });
});
