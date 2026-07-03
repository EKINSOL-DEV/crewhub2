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
import { createSim, insideAnyBuildingRect, WALK_SPEED, type Sim } from "./sim";

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

/**
 * A single 4-desk pavilion on an obstacle-free grid, wide enough to include
 * the (0, 34) spawn arm. Defaults its `groupKey` to "g1" (M5 T2) — most
 * pre-M5 tests just need a Working/WaitingForInput char sharing that key to
 * keep claiming a desk under the new project-scoped matching rule.
 */
function fakeWorld(groupKey: string | null = "g1"): { grid: NavGrid; buildings: Building[] } {
  const size = 100;
  const grid: NavGrid = { size, cell: 1, blocked: new Uint8Array(size * size) };
  const desks: Desk[] = [
    { id: "d0", x: 2, z: 2, rot: Math.PI, plotIndex: 0 },
    { id: "d1", x: -2, z: 2, rot: Math.PI, plotIndex: 0 },
    { id: "d2", x: 2, z: -2, rot: 0, plotIndex: 0 },
    { id: "d3", x: -2, z: -2, rot: 0, plotIndex: 0 },
  ];
  const building: Building = {
    plotIndex: 0,
    rect: { x: 0, z: 0, w: 8, d: 8 },
    desks,
    door: { x: 0, z: -4 },
    groupKey,
  };
  return { grid, buildings: [building] };
}

function tickUntil(sim: Sim, dt: number, maxTicks: number, pred: () => boolean): void {
  for (let i = 0; i < maxTicks && !pred(); i++) sim.tick(dt);
}

/** A second 4-desk pavilion, positioned clear of `fakeWorld`'s. Defaults to a *different* group ("g2") than `fakeWorld`'s "g1". */
function secondFakeBuilding(groupKey: string | null = "g2"): Building {
  const desks: Desk[] = [
    { id: "e0", x: 22, z: 2, rot: Math.PI, plotIndex: 1 },
    { id: "e1", x: 18, z: 2, rot: Math.PI, plotIndex: 1 },
    { id: "e2", x: 22, z: -2, rot: 0, plotIndex: 1 },
    { id: "e3", x: 18, z: -2, rot: 0, plotIndex: 1 },
  ];
  return { plotIndex: 1, rect: { x: 20, z: 0, w: 8, d: 8 }, desks, door: { x: 20, z: -4 }, groupKey };
}

/** A player-built pavilion (4 desks) on the real campus grid, clear of the plaza/plots/path arms. */
function extraCampusBuilding(plotIndex: number, groupKey: string | null = "campus"): Building {
  const placed: PlacedBuilding = { id: "extra", x: 0, z: -20, w: 10, d: 8, roomId: null };
  const rect = { x: placed.x, z: placed.z, w: placed.w, d: placed.d };
  return { plotIndex, rect, desks: buildingDesks(placed), door: nearestEdgeDoor(rect), groupKey };
}

/** A single-desk pavilion — narrows updateWorld's "who can grab the one free desk" race down to two bots. */
function oneDeskWorld(groupKey: string | null = "g1"): { grid: NavGrid; buildings: Building[] } {
  const size = 100;
  const grid: NavGrid = { size, cell: 1, blocked: new Uint8Array(size * size) };
  const desks: Desk[] = [{ id: "d0", x: 2, z: 2, rot: Math.PI, plotIndex: 0 }];
  const building: Building = {
    plotIndex: 0,
    rect: { x: 0, z: 0, w: 8, d: 8 },
    desks,
    door: { x: 0, z: -4 },
    groupKey,
  };
  return { grid, buildings: [building] };
}

describe("createSim", () => {
  it("seats a new Working character: paths in, sits at the desk's seat point, faces the desk", () => {
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working", { groupKey: "g1" })]);

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
    sim.sync([char("a", "Working", { groupKey: "g1" })]);
    const deskId = sim.world.bots.get("a")!.deskId;
    for (let i = 0; i < 5; i++) sim.sync([char("a", "Working", { groupKey: "g1" })]);
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
    sim.sync([char("a", "Working", { groupKey: "g1" })]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    const deskId = bot.deskId!;

    sim.sync([char("a", "WaitingForPermission", { groupKey: "g1" })]);
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
    // Matched (groupKey "g1" shares fakeWorld()'s default) — M5 T2: an
    // *unmatched* WaitingForInput bot now borrows the wander loop instead
    // (see the dedicated "unmatched bot never claims a desk" test below), so
    // this in-place stand/think assertion needs a matching group to hold.
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "WaitingForInput", { groupKey: "g1" })]);
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
    sim.sync([char("a", "Working", { groupKey: "g1" })]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    const [seatX, seatZ] = [bot.x, bot.z];

    sim.sync([char("a", "WaitingForInput", { groupKey: "g1" })]);
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
    sim.sync([char("a", "Working", { groupKey: "g1" }), char("b", "Idle")]);
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
    sim.sync([
      char("a", "Working", { groupKey: "g1" }),
      char("b", "Idle"),
      char("c", "WaitingForPermission"),
    ]);
    for (let i = 0; i < 20; i++) sim.tick(0.3);

    const before = new Map([...sim.world.bots].map(([k, b]) => [k, { x: b.x, z: b.z }]));
    sim.updateWorld(grid, buildings); // same grid/buildings — still exercises the full re-plan path
    const after = new Map([...sim.world.bots].map(([k, b]) => [k, { x: b.x, z: b.z }]));

    expect(after).toEqual(before);
  });

  it("releases a removed building's desk and re-seats its sitter at another building's free desk", () => {
    // M5 T2: desk pools are project-scoped now, so this cross-building
    // re-seat only happens when both buildings share the sitter's group
    // (a multi-room project) — `secondFakeBuilding("g1")` instead of its
    // default "g2". The dedicated "own building only" test below covers the
    // *disjoint*-group case this used to (accidentally) also exercise.
    const { grid, buildings } = fakeWorld(); // one 4-desk building at the origin, groupKey "g1"
    const second = secondFakeBuilding("g1");
    const sim = createSim(grid, [...buildings, second], SEED);
    sim.sync([char("a", "Working", { groupKey: "g1" })]);
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

  it("sends a Working bot to the overflow ring when updateWorld empties its room's desks (still matched)", () => {
    // M5 T2: emptying *every* building (old test) makes the bot unmatched
    // (no building shares its group anymore) — per the new contract that's
    // a wander case, not overflow. Keep a same-group, desk-less building
    // instead so the bot stays "matched" with a full (empty) pool, which is
    // exactly the overflow contract ("their room's desks are all taken").
    const { grid, buildings } = fakeWorld();
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working", { groupKey: "g1" })]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    expect(bot.deskId).not.toBeNull();

    const emptyBuilding: Building = { ...buildings[0]!, desks: [] };
    sim.updateWorld(grid, [emptyBuilding]); // same room, zero desks
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
    sim.sync([char("a", "Working", { groupKey: "g1" })]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    const deskId = bot.deskId!;

    sim.sync([char("a", "WaitingForInput", { groupKey: "g1" })]);
    tickUntil(sim, 0.5, 500, () => bot.path.length === 0);
    expect(bot.deskId).toBe(deskId); // still holds it while thinking

    sim.updateWorld(grid, buildings); // identical grid/buildings — a no-op edit
    expect(bot.deskId).toBe(deskId);
    expect(sim.world.deskOwners.get(deskId)).toBe("a");
  });

  it("releases a WaitingForInput bot's desk claim only when the edit actually removes it, then lets it re-contend once back to Working", () => {
    const { grid, buildings } = fakeWorld(); // one 4-desk building, groupKey "g1"
    const second = secondFakeBuilding("g1"); // same group — a second room of the same project
    const sim = createSim(grid, [...buildings, second], SEED);
    sim.sync([char("a", "Working", { groupKey: "g1" })]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 500, () => bot.motion === "sit-type" && bot.path.length === 0);
    const oldDeskId = bot.deskId!;
    expect(buildings[0]!.desks.some((d) => d.id === oldDeskId)).toBe(true); // seated in the first building

    sim.sync([char("a", "WaitingForInput", { groupKey: "g1" })]);
    tickUntil(sim, 0.5, 500, () => bot.path.length === 0);
    expect(bot.deskId).toBe(oldDeskId); // still holds it while thinking

    sim.updateWorld(grid, [second]); // first building (and the held desk) is gone
    expect(bot.deskId).toBeNull();
    expect(sim.world.deskOwners.size).toBe(0);

    sim.sync([char("a", "Working", { groupKey: "g1" })]); // back to work — re-contends fresh
    expect(bot.deskId).not.toBeNull();
    expect(second.desks.some((d) => d.id === bot.deskId)).toBe(true);
    expect(sim.world.deskOwners.get(bot.deskId!)).toBe("a");
  });

  it("doesn't let a deskless bot's replan race a still-held claim into a ghost double-seat", () => {
    const { grid, buildings } = oneDeskWorld(); // exactly one desk: "d0"
    const sim = createSim(grid, buildings, SEED);

    // "y" appears first in the array (inserted into world.bots first, no
    // desk); "x" appears second and grabs the only desk. Both share the
    // building's group ("g1") — they're contending for the same one desk.
    sim.sync([char("y", "Idle"), char("x", "Working", { groupKey: "g1" })]);
    const x = sim.world.bots.get("x")!;
    const y = sim.world.bots.get("y")!;
    tickUntil(sim, 0.5, 500, () => x.motion === "sit-type" && x.path.length === 0);
    expect(x.deskId).toBe("d0");

    sim.sync([char("y", "Working", { groupKey: "g1" }), char("x", "Working", { groupKey: "g1" })]); // flip y to Working too — overflow, no desk
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
  // M5 T2: real campusBuildings() doesn't set groupKey (use-sim/T5 does
  // that at the React boundary) — annotate all 4 plots into one shared
  // "campus" group here so these desk-pool integration tests keep exercising
  // "many Working bots, one shared pool" like they did pre-M5.
  const buildings = campusBuildings(layout.plots).map((b) => ({ ...b, groupKey: "campus" }));
  const grid = buildNavGrid(layout, buildings);

  it("seats a Working character at one of the 16 real desks", () => {
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working", { groupKey: "campus" })]);
    const bot = sim.world.bots.get("a")!;
    tickUntil(sim, 0.5, 800, () => bot.motion === "sit-type" && bot.path.length === 0);

    expect(bot.deskId).not.toBeNull();
    const allDeskIds = buildings.flatMap((b) => b.desks.map((d) => d.id));
    expect(allDeskIds).toContain(bot.deskId);
  });

  it("sends the 17th simultaneous Working character to the plaza edge instead of crashing", () => {
    const sim = createSim(grid, buildings, SEED);
    const characters = Array.from({ length: 17 }, (_, i) => char(`w${i}`, "Working", { groupKey: "campus" }));
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
    const characters = Array.from({ length: 17 }, (_, i) => char(`w${i}`, "Working", { groupKey: "campus" }));
    sim.sync(characters);
    tickUntil(sim, 0.5, 1200, () => characters.every((c) => sim.world.bots.get(c.key)!.path.length === 0));
    expect(sim.world.deskOwners.size).toBe(16);

    const extra = extraCampusBuilding(buildings.length); // groupKey defaults to "campus"
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
        char("a", "Working", { groupKey: "campus" }),
        char("b", "WaitingForPermission"),
        char("c", "Idle"),
        char("d", "Idle", { agentId: "agent-1" }),
        char("f", "Working"), // unmatched (no groupKey) — exercises the M5 outside-wander branch too
      ]);
      for (let i = 0; i < 20; i++) sim.tick(0.37);
      sim.sync([
        char("a", "Idle"),
        char("c", "Idle"),
        char("d", "Idle", { agentId: "agent-1" }),
        char("f", "Working"),
      ]);
      for (let i = 0; i < 30; i++) sim.tick(0.29);
      sim.sync([char("c", "Idle"), char("e", "Working", { groupKey: "campus" }), char("f", "Working")]);
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
    const extra = extraCampusBuilding(buildings.length); // groupKey defaults to "campus"
    const newBuildings = [...buildings, extra];
    const newGrid = buildNavGrid(layout, newBuildings);

    const script = (sim: Sim): void => {
      sim.sync([
        char("a", "Working", { groupKey: "campus" }),
        char("b", "WaitingForPermission"),
        char("c", "Idle"),
        char("d", "Idle", { agentId: "agent-1" }),
        char("f", "Working"), // unmatched — M5 outside-wander branch
      ]);
      for (let i = 0; i < 20; i++) sim.tick(0.37);
      sim.updateWorld(newGrid, newBuildings);
      for (let i = 0; i < 30; i++) sim.tick(0.29);
      sim.sync([
        char("a", "Idle"),
        char("c", "Idle"),
        char("d", "Idle", { agentId: "agent-1" }),
        char("e", "Working", { groupKey: "campus" }),
        char("f", "Working"),
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

describe("Sim — M5 T2 project rooms (groupKey desk-pool matching)", () => {
  it("a matched bot only ever sits in its own project's building, never the other project's", () => {
    const { grid, buildings } = fakeWorld("A");
    const second = secondFakeBuilding("B");
    const sim = createSim(grid, [...buildings, second], SEED);
    sim.sync([char("a", "Working", { groupKey: "A" }), char("b", "Working", { groupKey: "B" })]);
    const botA = sim.world.bots.get("a")!;
    const botB = sim.world.bots.get("b")!;
    tickUntil(
      sim,
      0.5,
      800,
      () =>
        botA.motion === "sit-type" &&
        botA.path.length === 0 &&
        botB.motion === "sit-type" &&
        botB.path.length === 0,
    );

    expect(buildings[0]!.desks.some((d) => d.id === botA.deskId)).toBe(true);
    expect(second.desks.some((d) => d.id === botA.deskId)).toBe(false);
    expect(second.desks.some((d) => d.id === botB.deskId)).toBe(true);
    expect(buildings[0]!.desks.some((d) => d.id === botB.deskId)).toBe(false);
  });

  it("an unmatched (null groupKey) Working bot never claims a desk, and every wander-leg endpoint stays outside every building rect", () => {
    const { grid, buildings } = fakeWorld("A");
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working")]); // no groupKey override -> null -> unmatched
    const bot = sim.world.bots.get("a")!;

    const dt = 0.1;
    let sawWanderLeg = false;
    for (let i = 0; i < 600; i++) {
      // 60 sim-seconds
      const hadPath = bot.path.length > 0;
      sim.tick(dt);
      expect(bot.deskId).toBeNull(); // never claims a desk, any tick
      // A path that went empty -> non-empty this tick was just planned —
      // check every waypoint of that fresh leg, same pattern as the
      // existing Idle-radius test above.
      if (!hadPath && bot.path.length > 0) {
        sawWanderLeg = true;
        for (const wp of bot.path) {
          // margin -0.5: a shrunk rect, so only a clear, >0.5-unit
          // intrusion counts as a violation — tolerates grid-snap slack.
          expect(insideAnyBuildingRect(wp.x, wp.z, buildings, -0.5)).toBe(false);
        }
      }
    }
    expect(sawWanderLeg).toBe(true); // sanity: the loop actually exercised outside-wandering
    expect(sim.world.deskOwners.size).toBe(0);
  });

  it("a bot whose groupKey matches no building is unmatched too: never claims a desk, wanders instead of squatting", () => {
    const { grid, buildings } = fakeWorld("A");
    const sim = createSim(grid, buildings, SEED);
    sim.sync([char("a", "Working", { groupKey: "ghost-project" })]); // no building carries this group
    const bot = sim.world.bots.get("a")!;

    tickUntil(sim, 0.5, 400, () => bot.path.length > 0); // let a wander leg start
    expect(bot.path.length).toBeGreaterThan(0);
    expect(bot.deskId).toBeNull();
    expect(sim.world.deskOwners.size).toBe(0);
  });

  it("a matched project's Working bots overflow at the plaza once their own room's desks are full — never wander outside", () => {
    const { grid, buildings } = fakeWorld("A"); // 4 desks, group "A"
    const sim = createSim(grid, buildings, SEED);
    const characters = Array.from({ length: 5 }, (_, i) => char(`w${i}`, "Working", { groupKey: "A" }));
    sim.sync(characters);
    tickUntil(sim, 0.5, 800, () => characters.every((c) => sim.world.bots.get(c.key)!.path.length === 0));

    const seated = characters.filter((c) => sim.world.bots.get(c.key)!.deskId !== null);
    const overflow = characters.filter((c) => sim.world.bots.get(c.key)!.deskId === null);
    expect(seated).toHaveLength(4);
    expect(overflow).toHaveLength(1);
    const overflowBot = sim.world.bots.get(overflow[0]!.key)!;
    expect(overflowBot.motion).toBe("sit-type"); // overflow ring reads as seated, not a wanderer
    // "Near" not "at": the ring target re-quantizes onto the nav grid's
    // 1-unit cells (same cell-snap slack as the WaitingForInput desk-return
    // test above), so allow just over half a cell of drift from radius 8.
    expect(Math.abs(Math.hypot(overflowBot.x, overflowBot.z) - 8)).toBeLessThan(1);
  });

  it("updateWorld relinking a building's group releases the old holder's desk (who then wanders) while an untouched building's claim survives (M3 invariant)", () => {
    const { grid, buildings } = fakeWorld("A"); // building at the origin, group "A"
    const second = secondFakeBuilding("B"); // building at (20, 0), group "B" — untouched by the edit below
    const sim = createSim(grid, [...buildings, second], SEED);
    sim.sync([char("a", "Working", { groupKey: "A" }), char("b", "Working", { groupKey: "B" })]);
    const botA = sim.world.bots.get("a")!;
    const botB = sim.world.bots.get("b")!;
    tickUntil(sim, 0.5, 800, () => botA.path.length === 0 && botB.path.length === 0);
    const aDeskId = botA.deskId!;
    const bDeskId = botB.deskId!;
    expect(buildings[0]!.desks.some((d) => d.id === aDeskId)).toBe(true);
    expect(second.desks.some((d) => d.id === bDeskId)).toBe(true);
    const bBefore = { x: botB.x, z: botB.z };

    const relinked: Building = { ...buildings[0]!, groupKey: "C" }; // same building, project changed A -> C
    sim.updateWorld(grid, [relinked, second]); // "second" (group B) is untouched by this edit

    // A's holder is released: no building anywhere still carries group "A".
    expect(sim.world.deskOwners.has(aDeskId)).toBe(false);
    expect(botA.deskId).toBeNull();
    // B's holder is unaffected — M3 invariant: untouched building's claim survives, no teleport.
    expect(sim.world.deskOwners.get(bDeskId)).toBe("b");
    expect(botB.deskId).toBe(bDeskId);
    expect(botB.x).toBe(bBefore.x);
    expect(botB.z).toBe(bBefore.z);

    // "a" is now unmatched (no building shares group "A") — wanders instead of
    // re-contending. It starts the leg from its old (in-room) desk spot, so
    // check the wander *targets*, not its current position, same pattern as
    // the null-groupKey wander test above.
    tickUntil(sim, 0.5, 300, () => botA.path.length > 0);
    expect(botA.deskId).toBeNull();
    expect(botA.path.length).toBeGreaterThan(0);
    for (const wp of botA.path) {
      expect(insideAnyBuildingRect(wp.x, wp.z, [relinked, second], -0.5)).toBe(false);
    }
  });
});

describe("WALK_SPEED", () => {
  it("is the contract's fixed 2.2 units/s", () => {
    expect(WALK_SPEED).toBe(2.2);
  });
});
