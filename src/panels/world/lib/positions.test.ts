// Home-slot assignment + subagent clustering math (EKI-62/66).
import { describe, expect, it } from "vitest";
import type { WorldBot } from "./bots";
import { CLUSTER_RADIUS, assignHomes, roomInnerBounds } from "./positions";
import { LOBBY_ID, layoutWorld, type WorldZone } from "./layout";

function bot(key: string, over: Partial<WorldBot> = {}): WorldBot {
  return {
    key,
    id: { provider: "claude", id: key },
    name: key,
    status: "Working",
    activity: null,
    color: "#aabbcc",
    roomId: LOBBY_ID,
    parentKey: null,
    isSubagent: false,
    agentId: null,
    ...over,
  };
}

const world = layoutWorld([
  {
    id: "r1",
    project_id: null,
    name: "Den",
    icon: null,
    color: null,
    sort_order: 0,
    is_hq: false,
    style_json: null,
    created_at: 0,
    updated_at: 0,
  },
]);
const den: WorldZone = world.rooms.find((r) => r.id === "r1")!;

describe("assignHomes", () => {
  it("keeps every bot inside its room's inner bounds", () => {
    const bots = [...Array(9).keys()].map((i) => bot(`b${i}`, { roomId: "r1" }));
    const homes = assignHomes(bots, world);
    const b = roomInnerBounds(den);
    for (const [, [x, z]] of homes) {
      expect(x).toBeGreaterThanOrEqual(b.minX);
      expect(x).toBeLessThanOrEqual(b.maxX);
      expect(z).toBeGreaterThanOrEqual(b.minZ);
      expect(z).toBeLessThanOrEqual(b.maxZ);
    }
  });

  it("spaces bots in the same room apart (no two share a slot)", () => {
    const bots = [...Array(6).keys()].map((i) => bot(`b${i}`, { roomId: "r1" }));
    const homes = assignHomes(bots, world);
    const pts = bots.map((b) => homes.get(b.key)!);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const [ax, az] = pts[i]!;
        const [bx, bz] = pts[j]!;
        expect(Math.hypot(ax - bx, az - bz)).toBeGreaterThan(0.5);
      }
    }
  });

  it("clusters subagents within CLUSTER_RADIUS of their parent", () => {
    const parent = bot("p", { roomId: "r1" });
    const kids = [...Array(3).keys()].map((i) =>
      bot(`c${i}`, { roomId: "r1", parentKey: "p", isSubagent: true }),
    );
    const homes = assignHomes([parent, ...kids], world);
    const [px, pz] = homes.get("p")!;
    for (const k of kids) {
      const [x, z] = homes.get(k.key)!;
      const d = Math.hypot(x - px, z - pz);
      expect(d).toBeGreaterThan(0.1); // not on top of the parent
      expect(d).toBeLessThanOrEqual(CLUSTER_RADIUS + 1e-9);
    }
  });

  it("parks orphan subagents like normal bots (parent gone)", () => {
    const orphan = bot("c", { roomId: "r1", parentKey: "ghost", isSubagent: true });
    const homes = assignHomes([orphan], world);
    expect(homes.get("c")).toBeDefined();
  });

  it("falls back to the lobby for unknown room ids", () => {
    const lost = bot("x", { roomId: "no-such-room" });
    const homes = assignHomes([lost], world);
    const lobby = world.rooms.find((r) => r.id === LOBBY_ID)!;
    const b = roomInnerBounds(lobby);
    const [x, z] = homes.get("x")!;
    expect(x).toBeGreaterThanOrEqual(b.minX);
    expect(x).toBeLessThanOrEqual(b.maxX);
    expect(z).toBeGreaterThanOrEqual(b.minZ);
    expect(z).toBeLessThanOrEqual(b.maxZ);
  });

  it("is deterministic and order-stable by key", () => {
    const a = assignHomes([bot("b1", { roomId: "r1" }), bot("b2", { roomId: "r1" })], world);
    const b = assignHomes([bot("b2", { roomId: "r1" }), bot("b1", { roomId: "r1" })], world);
    expect(a.get("b1")).toEqual(b.get("b1"));
    expect(a.get("b2")).toEqual(b.get("b2"));
  });
});
