// M1 T8: demoCharacters covers every status the sim can render, with a
// resting-crew entry, so `?demo` is a reliable smoke test without live data.
import { describe, expect, it } from "vitest";
import { campusBuildings, HQ_RECT, type Building } from "@/game/world/campus/buildings";
import { campusLayout } from "@/game/world/campus/layout";
import { buildNavGrid } from "./grid";
import { createSim } from "./sim";
import { DEMO_GROUP, demoCharacters } from "./demo";

describe("demoCharacters", () => {
  it("returns exactly six characters", () => {
    expect(demoCharacters(0)).toHaveLength(6);
  });

  it("covers every status the brief calls for", () => {
    const statuses = demoCharacters(0).map((c) => c.status);
    expect(statuses.filter((s) => s === "Working")).toHaveLength(2);
    expect(statuses.filter((s) => s === "WaitingForPermission")).toHaveLength(1);
    expect(statuses.filter((s) => s === "WaitingForInput")).toHaveLength(1);
    expect(statuses.filter((s) => s === "Idle")).toHaveLength(2);
  });

  it("gives the resting crew entry an agentId and Idle status", () => {
    const crew = demoCharacters(0).find((c) => c.agentId !== null);
    expect(crew).toBeDefined();
    expect(crew!.agentId).toBe("demo-crew");
    expect(crew!.status).toBe("Idle");
  });

  it("has unique keys", () => {
    const keys = demoCharacters(0).map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is deterministic", () => {
    expect(demoCharacters(123)).toEqual(demoCharacters(123));
  });

  // M5 T5: every demo character shares DEMO_GROUP so use-sim.ts's demo
  // override (which stamps DEMO_GROUP on every building, ignoring real
  // project links entirely) actually seats them — see use-sim.test.tsx's
  // "demo override" test for the sim-level proof.
  it("gives every character the shared DEMO_GROUP so the sim's project-room matching still seats them", () => {
    for (const c of demoCharacters(0)) {
      expect(c.groupKey).toBe(DEMO_GROUP);
    }
  });
});

// M6 T5: T2's spawnPoint() puts every new bot inside HQ, unconditionally —
// demo bots are no exception. use-sim.ts's DEMO_WARMUP_TICKS fast-forwards a
// demo mount past that spawn-and-conga-line moment before the player ever
// sees it; this mirrors that warmup directly against the real sim (rather
// than through the React hook) to pin two things at once: Working demo bots
// still settle at real desks (M6 didn't regress the M5 seating story), and
// the one resting crew bot (Lovelace, agentId set, Idle) ends up inside
// HQ_RECT — not still mid-walk from a spawn point that, pre-M6, would have
// been out on the bare plaza.
describe("demo warmup settles bots inside the world (M6 T5)", () => {
  const SEED = 0x51d0;
  const TICK_S = 0.1;
  const WARMUP_TICKS = 300; // matches use-sim.ts's DEMO_WARMUP_TICKS

  function demoWorld(): { grid: ReturnType<typeof buildNavGrid>; buildings: Building[] } {
    const layout = campusLayout();
    // Mirrors use-sim.ts's withDemoGroupKeys: every building (HQ included)
    // shares demoCharacters()' DEMO_GROUP so the sim's project-scoped desk
    // matching seats them, exactly as the real demo mount does.
    const buildings = campusBuildings(layout.plots).map((b) => ({ ...b, groupKey: DEMO_GROUP }));
    return { grid: buildNavGrid(layout, buildings), buildings };
  }

  it("seats every Working demo bot at a real desk and rests the demo crew bot inside HQ", () => {
    const { grid, buildings } = demoWorld();
    const sim = createSim(grid, buildings, SEED);
    const characters = demoCharacters(0);
    sim.sync(characters);
    for (let i = 0; i < WARMUP_TICKS; i++) sim.tick(TICK_S);

    for (const c of characters.filter((ch) => ch.status === "Working")) {
      expect(sim.world.bots.get(c.key)!.deskId).toMatch(/^desk-/);
    }

    const crew = characters.find((c) => c.agentId !== null)!;
    const crewBot = sim.world.bots.get(crew.key)!;
    expect(Math.abs(crewBot.x)).toBeLessThan(HQ_RECT.w / 2);
    expect(Math.abs(crewBot.z)).toBeLessThan(HQ_RECT.d / 2);
  });
});
