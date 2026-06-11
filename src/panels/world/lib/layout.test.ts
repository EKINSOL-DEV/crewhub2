// Room grid layout math (EKI-62): pure, deterministic, no three.js.
import { describe, expect, it } from "vitest";
import type { Room } from "@/ipc/bindings";
import { LOBBY_ID, ROOM_SIZE, layoutWorld } from "./layout";

function room(id: string, over: Partial<Room> = {}): Room {
  return {
    id,
    project_id: null,
    name: `Room ${id}`,
    icon: null,
    color: null,
    sort_order: 0,
    is_hq: false,
    style_json: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

describe("layoutWorld", () => {
  it("always includes a lobby zone for unassigned bots, even with zero rooms", () => {
    const w = layoutWorld([]);
    expect(w.rooms.map((r) => r.id)).toEqual([LOBBY_ID]);
    expect(w.bounds.maxX).toBeGreaterThan(w.bounds.minX);
  });

  it("lays rooms on a square-ish grid with no overlaps", () => {
    const w = layoutWorld([...Array(8).keys()].map((i) => room(`r${i}`)));
    const placed = w.rooms.filter((r) => r.id !== LOBBY_ID);
    expect(placed).toHaveLength(8);
    for (const a of placed) {
      for (const b of placed) {
        if (a === b) continue;
        const apart =
          Math.abs(a.center[0] - b.center[0]) >= ROOM_SIZE ||
          Math.abs(a.center[1] - b.center[1]) >= ROOM_SIZE;
        expect(apart).toBe(true);
      }
    }
  });

  it("orders HQ first, then sort_order, then name", () => {
    const w = layoutWorld([
      room("b", { name: "Beta", sort_order: 1 }),
      room("hq", { name: "Zed HQ", is_hq: true, sort_order: 9 }),
      room("a", { name: "Alpha", sort_order: 1 }),
    ]);
    expect(w.rooms.filter((r) => r.id !== LOBBY_ID).map((r) => r.id)).toEqual(["hq", "a", "b"]);
  });

  it("keeps every room inside the world bounds", () => {
    const w = layoutWorld([...Array(5).keys()].map((i) => room(`r${i}`)));
    for (const r of w.rooms) {
      expect(r.center[0] - r.size / 2).toBeGreaterThanOrEqual(w.bounds.minX);
      expect(r.center[0] + r.size / 2).toBeLessThanOrEqual(w.bounds.maxX);
      expect(r.center[1] - r.size / 2).toBeGreaterThanOrEqual(w.bounds.minZ);
      expect(r.center[1] + r.size / 2).toBeLessThanOrEqual(w.bounds.maxZ);
    }
  });

  it("places the lobby south of (greater z than) all rooms", () => {
    const w = layoutWorld([room("a"), room("b")]);
    const lobby = w.rooms.find((r) => r.id === LOBBY_ID)!;
    for (const r of w.rooms) {
      if (r.id === LOBBY_ID) continue;
      expect(lobby.center[1]).toBeGreaterThan(r.center[1]);
    }
  });

  it("is deterministic for the same input", () => {
    const rs = [room("a"), room("b"), room("c")];
    expect(layoutWorld(rs)).toEqual(layoutWorld(rs));
  });
});
