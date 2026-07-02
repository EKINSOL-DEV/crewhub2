// Character state machine + sim world (M1 T6). Rules 1-6 and the age-based
// WaitingForInput flip run on a hand-built open grid so pathfinding never
// muddies the state-machine assertions (grid.test.ts already covers A*
// itself). Rules 7 (desk overflow) and 8 (determinism) also run on the real
// campus grid, per the brief's "at least 2 integration tests" ask.
import { describe, expect, it } from "vitest";
import type { SessionStatus } from "@/ipc/bindings";
import { buildingDesks, type PlacedBuilding } from "@/game/build/edits";
import { campusBuildings, nearestEdgeDoor } from "@/game/world/campus/buildings";
import type { Building, Desk } from "@/game/world/campus/buildings";
import { campusLayout } from "@/game/world/campus/layout";
import type { Character } from "./characters";
import { buildNavGrid, type NavGrid } from "./grid";
import { createSim, WALK_SPEED, type Sim } from "./sim";

const SEED = 0xc0ffee;

function char(key: string, status: SessionStatus, over: Partial<Character> = {}): Character {
  return {
    key,
    name: key,
    status,
    activity: null,
    color: "#7dd3fc",
    isSubagent: false,
    parentKey: null,
    agentId: null,
    ...over,
  };
}

/** A single 4-desk pavilion on an obstacle-free grid, wide enough to include the (0, 34) spawn arm. */
function fakeWorld(): { grid: NavGrid; buildings: Building[] } {
  const size = 100;
  const grid: NavGrid = { size, cell: 1, blocked: new Uint8Array(size * size) };
  const desks: Desk[] = [
    { id: "d0", x: 2, z: 2, rot: Math.PI, plotIndex: 0 },
    { id: "d1", x: -2, z: 2, rot: Math.PI, plotIndex: 0 },
    { id: "d2", x: 2, z: -2, rot: 0, plotIndex: 0 },
    { id: "d3", x: -2, z: -2, rot: 0, plotIndex: 0 },
  ];
  const building: Building = { plotIndex: 0, rect: { x: 0, z: 0, w: 8, d: 8 }, desks, door: { x: 0, z: -4 } };
  return { grid, buildings: [building] };
}

function tickUntil(sim: Sim, dt: number, maxTicks: number, pred: () => boolean): void {
  for (let i = 0; i < maxTicks && !pred(); i++) sim.tick(dt);
}

/** A second 4-desk pavilion, positioned clear of `fakeWorld`'s. */
function secondFakeBuilding(): Building {
  const desks: Desk[] = [
    { id: "e0", x: 22, z: 2, rot: Math.PI, plotIndex: 1 },
    { id: "e1", x: 18, z: 2, rot: Math.PI, plotIndex: 1 },
    { id: "e2", x: 22, z: -2, rot: 0, plotIndex: 1 },
    { id: "e3", x: 18, z: -2, rot: 0, plotIndex: 1 },
  ];
  return { plotIndex: 1, rect: { x: 20, z: 0, w: 8, d: 8 }, desks, door: { x: 20, z: -4 } };
}

/** A player-built pavilion (4 desks) on the real campus grid, clear of the plaza/plots/path arms. */
function extraCampusBuilding(plotIndex: number): Building {
  const placed: PlacedBuilding = { id: "extra", x: 0, z: -20, w: 10, d: 8, roomId: null };
  const rect = { x: placed.x, z: placed.z, w: placed.w, d: placed.d };
  return { plotIndex, rect, desks: buildingDesks(placed), door: nearestEdgeDoor(rect) };
}

/** A single-desk pavilion — narrows updateWorld's "who can grab the one free desk" race down to two bots. */
function oneDeskWorld(): { grid: NavGrid; buildings: Building[] } {
  const size = 100;
  const grid: NavGrid = { size, cell: 1, blocked: new Uint8Array(size * size) };
  const desks: Desk[] = [{ id: "d0", x: 2, z: 2, rot: Math.PI, plotIndex: 0 }];
  const building: Building = { plotIndex: 0, rect: { x: 0, z: 0, w: 8, d: 8 }, desks, door: { x: 0, z: -4 } };
  return { grid, buildings: [building] };
}

describe("createSim", () => {
  it("seats a new Working character: paths in, sits at the desk's seat point, faces the desk", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working")]);

    const bot = sim.world.bots.get("a")!;
    expect(bot.deskId).not.toBeNull();
    expect(bot.path.length).toBeGreaterThan(0); // spawns far from the desk — should have to walk

    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);

    const desk = buildings[0]!.desks.find((d) => d.id === bot.deskId)!;
    const wantX = desk.x - Math.sin(desk.rot) * 0.8;
    const wantZ = desk.z - Math.cos(desk.rot) * 0.8;
    expect(bot.x).toBeCloseTo(wantX, 5);
    expect(bot.z).toBeCloseTo(wantZ, 5);
    expect(bot.facing).toBeCloseTo(desk.rot, 5);
    expect(bot.motion).toBe("sit-type");
    expect(sim.world.deskOwners.get(bot.deskId!)).toBe("a");
  });

  it("keeps the same desk across repeated syncs while Working (stable assignment)", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working")]);
    const deskId = sim.world.bots.get("a")!.deskId;
    for (let i = 0; i < 5; i++) sim.sync([char("a", "Working")]);
    expect(sim.world.bots.get("a")!.deskId).toBe(deskId);
  });

  it("walks a WaitingForPermission character to the plaza ring (radius 11) and raises its hand", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "WaitingForPermission")]);
    const bot = sim.world.bots.get("a")!;

    tickUntil(sim, 0.5, 500, () => bot.motion === "raise-hand");

    expect(bot.path).toHaveLength(0);
    expect(Math.hypot(bot.x, bot.z)).toBeCloseTo(11, 0); // within a cell of the ring
    expect(bot.motion).toBe("raise-hand");
  });

  it("a Working->WaitingForPermission bot keeps its desk reserved (freed only on removal)", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working")]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    const deskId = bot.deskId!;

    sim.sync([char("a", "WaitingForPermission")]);
    expect(bot.deskId).toBe(deskId); // still "owns" it — the session hasn't ended
    expect(sim.world.deskOwners.get(deskId)).toBe("a");
    expect(bot.path.length).toBeGreaterThan(0); // walks away from the desk toward the plaza

    tickUntil(sim, 0.5, 500, () => bot.motion === "raise-hand");
    expect(sim.world.deskOwners.get(deskId)).toBe("a"); // still reserved while waving

    sim.sync([]); // session ends
    expect(sim.world.deskOwners.has(deskId)).toBe(false);
    expect(sim.world.bots.has("a")).toBe(false);
  });

  it("WaitingForInput alternates stand/think roughly every 4s of age", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "WaitingForInput")]);
    const bot = sim.world.bots.get("a")!;

    const motions: string[] = [];
    for (let i = 0; i < 8; i++) {
      sim.tick(1);
      motions.push(bot.motion);
    }
    // age 1,2,3 -> stand; age 4..7 -> think; age 8 -> stand.
    expect(motions).toEqual(["stand", "stand", "stand", "think", "think", "think", "think", "stand"]);
  });

  it("a Working->WaitingForInput bot returns to (and stays at) its desk", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working")]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    const [seatX, seatZ] = [bot.x, bot.z];

    sim.sync([char("a", "WaitingForInput")]);
    tickUntil(sim, 0.5, 500, () => bot.path.length === 0);

    // "Near" not "at": the retarget path re-quantizes onto the nav grid's
    // 1-unit cells, so allow up to a cell diagonal of drift from the seat.
    expect(Math.hypot(bot.x - seatX, bot.z - seatZ)).toBeLessThan(1.5);
    expect(["stand", "think"]).toContain(bot.motion);
  });

  it("an Idle session character wanders: walks, pauses, and moves over time", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Idle")]);
    const bot = sim.world.bots.get("a")!;
    const start = { x: bot.x, z: bot.z };

    const seenMotions = new Set<string>();
    for (let i = 0; i < 60; i++) {
      sim.tick(1);
      seenMotions.add(bot.motion);
    }

    expect(seenMotions.has("walk")).toBe(true);
    expect(seenMotions.has("stand")).toBe(true);
    expect(bot.x !== start.x || bot.z !== start.z).toBe(true);
  });

  it("an Idle session character's wander legs stay within radius 12 of where they were planned", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Idle")]);
    const bot = sim.world.bots.get("a")!;

    const dt = 0.1;
    const tolerance = 1; // grid-snap slack, same as the radius-9 crew test below
    let sawNewPath = false;
    for (let i = 0; i < 600; i++) {
      // 60 sim-seconds
      const from = { x: bot.x, z: bot.z };
      const hadPath = bot.path.length > 0;
      sim.tick(dt);
      // A path that went empty -> non-empty this tick was just planned from
      // `from` (advance() never touches an already-empty path in the same
      // tick it's replanned, so bot.x/z hasn't moved yet).
      if (!hadPath && bot.path.length > 0) {
        sawNewPath = true;
        for (const wp of bot.path) {
          expect(Math.hypot(wp.x - from.x, wp.z - from.z)).toBeLessThanOrEqual(12 + tolerance);
        }
      }
    }
    expect(sawNewPath).toBe(true); // sanity: the loop actually exercised replanning
  });

  it("an Idle session character pauses 2-4s between wander legs", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Idle")]);
    const bot = sim.world.bots.get("a")!;

    const dt = 0.1;
    const tolerance = dt; // one tick of slack
    let sawFirstWalk = false;
    let inPause = false;
    let standTicks = 0;
    const pauses: number[] = [];
    for (let i = 0; i < 600; i++) {
      // 60 sim-seconds
      sim.tick(dt);
      if (bot.motion === "walk") {
        sawFirstWalk = true;
        if (inPause) {
          pauses.push(standTicks * dt);
          inPause = false;
          standTicks = 0;
        }
      } else if (bot.motion === "stand" && sawFirstWalk) {
        // Skip the leading stand streak (if any) before the first walk —
        // it's not a pause "between" legs, and the very first Idle leg
        // starts with pauseUntil == age (no wait) per replan().
        inPause = true;
        standTicks++;
      }
    }

    expect(pauses.length).toBeGreaterThan(0); // sanity: saw at least one completed pause
    for (const pause of pauses) {
      expect(pause).toBeGreaterThanOrEqual(2 - tolerance);
      expect(pause).toBeLessThanOrEqual(4 + tolerance);
    }
  });

  it("an Idle crew character (agentId set) only wanders within radius 9 of the plaza", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Idle", { agentId: "agent-1" })]);
    const bot = sim.world.bots.get("a")!;

    // Warm up well past the spawn -> plaza leg (spawns ~34 units out, at
    // 2.2 u/s that's ~16s even with a detour) before sampling the
    // steady-state wander loop, which is the part the radius rule governs.
    for (let i = 0; i < 400; i++) sim.tick(0.5);

    for (let i = 0; i < 200; i++) {
      sim.tick(0.25);
      expect(Math.hypot(bot.x, bot.z)).toBeLessThan(9 + 1.5); // +cell-snap slack
    }
  });

  it("removes a bot (and frees its desk) when its character drops out of sync", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working"), char("b", "Idle")]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    const deskId = bot.deskId!;

    sim.sync([char("b", "Idle")]);

    expect(sim.world.bots.has("a")).toBe(false);
    expect(sim.world.bots.has("b")).toBe(true);
    expect(sim.world.deskOwners.has(deskId)).toBe(false);
  });

  it("never throws and picks a fresh key without crashing on an empty sync", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    expect(() => sim.sync([])).not.toThrow();
    expect(() => sim.tick(1)).not.toThrow();
  });
});

describe("Sim.updateWorld", () => {
  it("doesn't move any bot's position at the swap tick, even though every path/desk is re-planned", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working"), char("b", "Idle"), char("c", "WaitingForPermission")]);
    for (let i = 0; i < 20; i++) sim.tick(0.3);

    const before = new Map([...sim.world.bots].map(([k, b]) => [k, { x: b.x, z: b.z }]));
    sim.updateWorld(grid, buildings); // same grid/buildings — still exercises the full re-plan path
    const after = new Map([...sim.world.bots].map(([k, b]) => [k, { x: b.x, z: b.z }]));

    expect(after).toEqual(before);
  });

  it("releases a removed building's desk and re-seats its sitter at another building's free desk", () => {
    const { grid, buildings } = fakeWorld(); // one 4-desk building at the origin
    const second = secondFakeBuilding();
    const sim = createSim(grid, [...buildings, second], SEED);
    sim.sync([char("a", "Working")]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    const oldDeskId = bot.deskId!;
    expect(buildings[0]!.desks.some((d) => d.id === oldDeskId)).toBe(true); // seated in the first building

    sim.updateWorld(grid, [second]); // first building (and its desk) is gone
    expect(sim.world.deskOwners.has(oldDeskId)).toBe(false);
    expect(bot.deskId).not.toBe(oldDeskId);

    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    expect(bot.deskId).not.toBeNull();
    expect(second.desks.some((d) => d.id === bot.deskId)).toBe(true);
    expect(sim.world.deskOwners.get(bot.deskId!)).toBe("a");
  });

  it("sends a Working bot to the overflow ring when updateWorld leaves no desks at all", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working")]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    expect(bot.deskId).not.toBeNull();

    sim.updateWorld(grid, []); // every building gone
    expect(sim.world.deskOwners.size).toBe(0);
    expect(bot.deskId).toBeNull();

    tickUntil(sim, 0.5, 500, () => bot.path.length === 0);
    expect(bot.deskId).toBeNull();
    expect(bot.motion).toBe("sit-type"); // overflow still reads as "seated" at the plaza edge
    expect(Math.hypot(bot.x, bot.z)).toBeCloseTo(8, 0);
  });

  it("keeps a WaitingForInput bot's desk claim across a no-op updateWorld (that branch only ever reads deskId, never re-requests)", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working")]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    const deskId = bot.deskId!;

    sim.sync([char("a", "WaitingForInput")]);
    tickUntil(sim, 0.5, 500, () => bot.path.length === 0);
    expect(bot.deskId).toBe(deskId); // still holds it while thinking

    sim.updateWorld(grid, buildings); // identical grid/buildings — a no-op edit
    expect(bot.deskId).toBe(deskId);
    expect(sim.world.deskOwners.get(deskId)).toBe("a");
  });

  it("releases a WaitingForInput bot's desk claim only when the edit actually removes it, then lets it re-contend once back to Working", () => {
    const { grid, buildings } = fakeWorld(); // one 4-desk building
    const second = secondFakeBuilding();
    const sim = createSim(grid, [...buildings, second], SEED);
    sim.sync([char("a", "Working")]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    const oldDeskId = bot.deskId!;
    expect(buildings[0]!.desks.some((d) => d.id === oldDeskId)).toBe(true); // seated in the first building

    sim.sync([char("a", "WaitingForInput")]);
    tickUntil(sim, 0.5, 500, () => bot.path.length === 0);
    expect(bot.deskId).toBe(oldDeskId); // still holds it while thinking

    sim.updateWorld(grid, [second]); // first building (and the held desk) is gone
    expect(bot.deskId).toBeNull();
    expect(sim.world.deskOwners.size).toBe(0);

    sim.sync([char("a", "Working")]); // back to work — re-contends fresh
    expect(bot.deskId).not.toBeNull();
    expect(second.desks.some((d) => d.id === bot.deskId)).toBe(true);
    expect(sim.world.deskOwners.get(bot.deskId!)).toBe("a");
  });

  it("doesn't let a deskless bot's replan race a still-held claim into a ghost double-seat", () => {
    const { grid, buildings } = oneDeskWorld(); // exactly one desk: "d0"
    const sim = createSim(grid, buildings, SEED);

    // "y" appears first in the array (inserted into world.bots first, no
    // desk); "x" appears second and grabs the only desk.
    sim.sync([char("y", "Idle"), char("x", "Working")]);
    const x = sim.world.bots.get("x")!;
    const y = sim.world.bots.get("y")!;
    tickUntil(sim, 0.5, 500, () => x.motion === "sit-type" && x.path.length === 0);
    expect(x.deskId).toBe("d0");

    sim.sync([char("y", "Working"), char("x", "Working")]); // flip y to Working too — overflow, no desk
    expect(y.deskId).toBeNull();

    sim.updateWorld(grid, buildings); // identical grid/buildings — a no-op edit

    // If a deskless bot's replan ran before every surviving claim was
    // restored, "y" (iterated first) could grab "d0" out from under "x"
    // (iterated second) — both would then read deskId "d0" while
    // deskOwners can only point at one of them.
    expect(x.deskId).toBe("d0");
    expect(sim.world.deskOwners.get("d0")).toBe("x");
    expect(y.deskId).toBeNull();

    tickUntil(sim, 0.5, 500, () => y.path.length === 0);
    expect(y.motion).toBe("sit-type"); // still overflow, seated at the plaza edge
    expect(Math.hypot(y.x, y.z)).toBeCloseTo(8, 0);
  });
});

describe("createSim — real campus grid (integration)", () => {
  const layout = campusLayout();
  const buildings = campusBuildings(layout.plots);
  const grid = buildNavGrid(layout, buildings);

  it("seats a Working character at one of the 16 real desks", () => {
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working")]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 800, () => bot.motion === "sit-type" && bot.path.length === 0);

    expect(bot.deskId).not.toBeNull();
    const allDeskIds = buildings.flatMap((b) => b.desks.map((d) => d.id));
    expect(allDeskIds).toContain(bot.deskId);
  });

  it("sends the 17th simultaneous Working character to the plaza edge instead of crashing", () => {
    const sim = createSim(grid, buildings, SEED);
    const characters = Array.from({ length: 17 }, (_, i) => char(`w${i}`, "Working"));
    expect(() => sim.sync(characters)).not.toThrow();

    tickUntil(sim, 0.5, 1200, () =>
      characters.every((c) => {
        const bot = sim.world.bots.get(c.key)!;
        return bot.path.length === 0;
      }),
    );

    const withDesk = characters.filter((c) => sim.world.bots.get(c.key)!.deskId !== null);
    const overflow = characters.filter((c) => sim.world.bots.get(c.key)!.deskId === null);
    expect(withDesk).toHaveLength(16);
    expect(overflow).toHaveLength(1);
    expect(sim.world.deskOwners.size).toBe(16);

    const overflowBot = sim.world.bots.get(overflow[0]!.key)!;
    expect(overflowBot.motion).toBe("sit-type");
    expect(Math.hypot(overflowBot.x, overflowBot.z)).toBeCloseTo(8, 0);
  });

  it("updateWorld with an extra building gives the 17th (overflow) Working bot a real desk", () => {
    const sim = createSim(grid, buildings, SEED);
    const characters = Array.from({ length: 17 }, (_, i) => char(`w${i}`, "Working"));
    sim.sync(characters);
    tickUntil(sim, 0.5, 1200, () => characters.every((c) => sim.world.bots.get(c.key)!.path.length === 0));
    expect(sim.world.deskOwners.size).toBe(16);

    const extra = extraCampusBuilding(buildings.length);
    const newBuildings = [...buildings, extra];
    const newGrid = buildNavGrid(layout, newBuildings);
    sim.updateWorld(newGrid, newBuildings);

    tickUntil(sim, 0.5, 1200, () => characters.every((c) => sim.world.bots.get(c.key)!.path.length === 0));

    expect(sim.world.deskOwners.size).toBe(17);
    for (const c of characters) {
      expect(sim.world.bots.get(c.key)!.deskId).not.toBeNull();
    }
  });

  it("is deterministic: identical seed + identical sync/tick sequence ⇒ identical worlds", () => {
    const script = (sim: Sim): void => {
      sim.sync([
        char("a", "Working"),
        char("b", "WaitingForPermission"),
        char("c", "Idle"),
        char("d", "Idle", { agentId: "agent-1" }),
      ]);
      for (let i = 0; i < 20; i++) sim.tick(0.37);
      sim.sync([char("a", "Idle"), char("c", "Idle"), char("d", "Idle", { agentId: "agent-1" })]);
      for (let i = 0; i < 30; i++) sim.tick(0.29);
      sim.sync([char("c", "Idle"), char("e", "Working")]);
      for (let i = 0; i < 20; i++) sim.tick(0.5);
    };

    const snapshot = (sim: Sim): unknown => ({
      bots: [...sim.world.bots.entries()].sort(([k1], [k2]) => k1.localeCompare(k2)),
      deskOwners: [...sim.world.deskOwners.entries()].sort(([k1], [k2]) => k1.localeCompare(k2)),
    });

    const simA = createSim(grid, buildings, SEED);
    const simB = createSim(grid, buildings, SEED);
    script(simA);
    script(simB);

    expect(snapshot(simA)).toEqual(snapshot(simB));
  });

  it("is deterministic across updateWorld: identical seed + identical sync/tick/updateWorld sequence ⇒ identical worlds", () => {
    const extra = extraCampusBuilding(buildings.length);
    const newBuildings = [...buildings, extra];
    const newGrid = buildNavGrid(layout, newBuildings);

    const script = (sim: Sim): void => {
      sim.sync([
        char("a", "Working"),
        char("b", "WaitingForPermission"),
        char("c", "Idle"),
        char("d", "Idle", { agentId: "agent-1" }),
      ]);
      for (let i = 0; i < 20; i++) sim.tick(0.37);
      sim.updateWorld(newGrid, newBuildings);
      for (let i = 0; i < 30; i++) sim.tick(0.29);
      sim.sync([
        char("a", "Idle"),
        char("c", "Idle"),
        char("d", "Idle", { agentId: "agent-1" }),
        char("e", "Working"),
      ]);
      for (let i = 0; i < 20; i++) sim.tick(0.5);
    };

    const snapshot = (sim: Sim): unknown => ({
      bots: [...sim.world.bots.entries()].sort(([k1], [k2]) => k1.localeCompare(k2)),
      deskOwners: [...sim.world.deskOwners.entries()].sort(([k1], [k2]) => k1.localeCompare(k2)),
    });

    const simA = createSim(grid, buildings, SEED);
    const simB = createSim(grid, buildings, SEED);
    script(simA);
    script(simB);

    expect(snapshot(simA)).toEqual(snapshot(simB));
  });
});

describe("WALK_SPEED", () => {
  it("is the contract's fixed 2.2 units/s", () => {
    expect(WALK_SPEED).toBe(2.2);
  });
});
