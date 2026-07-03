// use-sim R3F smoke (M3 T5): proves useSim actually wires build-mode edits
// into the sim, not just that the plumbing compiles. Fills every base desk
// with a Working bot (16 = 4 seeded buildings * 4 desks each), adds one more
// so it has to overflow onto the plaza ring (sim.ts's "17th+ concurrent
// worker" branch), then places a new pavilion through the *real* edits store
// and checks that overflowing bot claims a desk inside it. Desk-claim
// bookkeeping is exact and synchronous (sim.ts's sync()/replan()), so this
// is the cheapest assertion that's actually about the grid+buildings swap ->
// updateWorld -> replan wiring, without leaning on rendered
// position/pathfinding geometry.
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import type { MutableRefObject } from "react";
import type { Agent } from "@/ipc/bindings";
import type { Character } from "@/game/sim/characters";
import type { Sim } from "@/game/sim/sim";
import { resetCampusEditsForTests, useCampusEdits } from "@/game/build/store";

vi.mock("@/ipc/bindings", () => ({
  commands: {
    getSetting: vi.fn(async () => ({ status: "ok", data: null })),
    setSetting: vi.fn(async () => ({ status: "ok", data: null })),
  },
}));
vi.mock("@/stores/sessions", () => ({
  useSessionsView: () => [],
  useSessionsStore: { getState: () => ({ init: vi.fn() }) },
}));
vi.mock("@/stores/agents", () => ({
  useAgentsStore: Object.assign((selector: (s: { agents: Agent[] }) => unknown) => selector({ agents: [] }), {
    getState: () => ({ init: vi.fn() }),
  }),
}));
vi.mock("@/stores/bindings", () => ({
  useBindingsStore: { getState: () => ({ init: vi.fn() }) },
}));
vi.mock("@/stores/projects", () => ({
  useProjectsStore: { getState: () => ({ load: vi.fn() }) },
}));

import { useSim, type CharacterInfo } from "./use-sim";

function workingBot(i: number): Character {
  return {
    key: `bot-${i}`,
    name: `Bot ${i}`,
    status: "Working",
    activity: null,
    color: "#7dd3fc",
    isSubagent: false,
    parentKey: null,
    agentId: null,
  };
}

function Probe({ characters, onSim }: { characters: Character[]; onSim: (sim: Sim) => void }) {
  const { sim } = useSim(characters);
  onSim(sim);
  return null;
}

describe("useSim build-edits wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
  });

  it("seats an overflowing 17th worker once a new pavilion is placed", async () => {
    const characters = Array.from({ length: 17 }, (_, i) => workingBot(i));
    let sim: Sim | null = null;

    const renderer = await ReactThreeTestRenderer.create(
      <Probe characters={characters} onSim={(s) => (sim = s)} />,
    );
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(5, 0.1);
    });

    const overflow = sim!.world.bots.get("bot-16")!;
    expect(overflow.deskId).toBeNull(); // base pool (4 buildings * 4 desks = 16) is exactly full

    let newBuildingId = "";
    await ReactThreeTestRenderer.act(async () => {
      newBuildingId = useCampusEdits.getState().addBuilding({ x: 0, z: -35, w: 6, d: 5 }, null);
      await renderer.advanceFrames(1, 0.1);
    });

    const settled = sim!.world.bots.get("bot-16")!;
    expect(settled.deskId).toMatch(new RegExp(`^${newBuildingId}-desk-`));
    expect(sim!.world.deskOwners.get(settled.deskId!)).toBe("bot-16");

    await renderer.unmount();
  });

  it("does not touch the sim when edits stay empty (version-0 guard)", async () => {
    const characters = [workingBot(0)];
    let sim: Sim | null = null;
    const renderer = await ReactThreeTestRenderer.create(
      <Probe characters={characters} onSim={(s) => (sim = s)} />,
    );
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(5, 0.1);
    });

    // The single bot claimed the very first seeded desk — proves the sim is
    // running off the base building pool (not silently empty/broken) even
    // though no edit was ever made this test.
    expect(sim!.world.bots.get("bot-0")!.deskId).toBe("desk-0-0");

    await renderer.unmount();
  });
});

function InfoProbe({
  characters,
  onInfoRef,
}: {
  characters: Character[];
  onInfoRef: (ref: MutableRefObject<Map<string, CharacterInfo>>) => void;
}) {
  const { infoRef } = useSim(characters);
  onInfoRef(infoRef);
  return null;
}

describe("useSim infoRef sync (nameplate staleness)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
  });

  it("refreshes infoRef on a rename/recolor even though status stays the same", async () => {
    let infoRef: MutableRefObject<Map<string, CharacterInfo>> | null = null;
    const bot = workingBot(0);
    const renderer = await ReactThreeTestRenderer.create(
      <InfoProbe characters={[bot]} onInfoRef={(r) => (infoRef = r)} />,
    );
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(2, 0.1);
    });
    expect(infoRef!.current.get("bot-0")).toMatchObject({ name: "Bot 0", color: "#7dd3fc" });

    const renamed: Character = { ...bot, name: "Renamed Bot", color: "#f472b6" };
    await ReactThreeTestRenderer.act(async () => {
      await renderer.update(<InfoProbe characters={[renamed]} onInfoRef={(r) => (infoRef = r)} />);
      await renderer.advanceFrames(1, 0.1);
    });
    // Same status ("Working"), only name/color changed — the old narrow
    // `${key}:${status}` syncKey would have skipped this re-sync entirely.
    expect(infoRef!.current.get("bot-0")).toMatchObject({ name: "Renamed Bot", color: "#f472b6" });

    await renderer.unmount();
  });
});
