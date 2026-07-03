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
vi.mock("@/stores/sessions", async () => {
  const { vi: vitest } = await import("vitest");
  type SessionView = import("@/stores/sessions").SessionView;
  return {
    // A vi.fn() (not a bare arrow) so the project-annotation tests below can
    // override its return value per-test via mockReturnValue — every other
    // test in this file relies on the default empty array.
    useSessionsView: vitest.fn((): SessionView[] => []),
    useSessionsStore: { getState: () => ({ init: vi.fn() }) },
  };
});
vi.mock("@/stores/agents", () => ({
  useAgentsStore: Object.assign((selector: (s: { agents: Agent[] }) => unknown) => selector({ agents: [] }), {
    getState: () => ({ init: vi.fn() }),
  }),
}));
vi.mock("@/stores/bindings", () => ({
  useBindingsStore: { getState: () => ({ init: vi.fn() }) },
}));
// A real zustand store (not a bare object stub) so tests can `.setState()`
// projects mid-test — the "effect fires once projects load" tests below
// need that, the same way `useCampusEdits`'s real store lets them call
// `addBuilding()` mid-test further down this file.
vi.mock("@/stores/projects", async () => {
  const { create } = await import("zustand");
  const { vi: vitest } = await import("vitest");
  type Project = import("@/ipc/bindings").Project;
  const useProjectsStore = create<{ projects: Project[]; load: () => void }>(() => ({
    projects: [],
    load: vitest.fn(),
  }));
  return { useProjectsStore };
});
// Spy on the real buildNavGrid (kept fully functional) so the biome-skip
// tests below can assert what `extras` each call site passed it, without
// reaching into useSim's internals.
vi.mock("@/game/sim/grid", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/game/sim/grid")>();
  return { ...real, buildNavGrid: vi.fn(real.buildNavGrid) };
});

import { useSim, type CharacterInfo } from "./use-sim";
import { buildNavGrid } from "@/game/sim/grid";
import { DEMO_GROUP } from "@/game/sim/demo";
import { biomeSkipFor } from "@/game/world/biome";
import { campusLayout } from "@/game/world/campus/layout";
import { resetGameEnvironmentForTests, useGameEnvironment } from "@/game/world/environments/store";
import { useSessionsView, type SessionView } from "@/stores/sessions";
import { useProjectsStore } from "@/stores/projects";
import type { Project } from "@/ipc/bindings";

// M5 T5: every test in this file passes its characters as `override` (the
// same `useSim` param demo scenes use to bypass the store join) — which
// means use-sim.ts's `isDemo` branch is live here too, stamping every
// building with `DEMO_GROUP` (see use-sim.ts's `withDemoGroupKeys`). Prior
// to M5 T2 any Working bot claimed any free desk in any building (one
// global pool); now a bot only ever claims a desk in a building sharing its
// `groupKey`, so these fixtures need the matching demo-style shared key to
// keep exercising that same "one shared pool" seating behavior.
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
    groupKey: DEMO_GROUP,
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

describe("useSim biome skip (M4 debt sweep — sky-biome invisible walls)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
    resetGameEnvironmentForTests();
  });

  it("passes the sky biome's skip list into buildNavGrid, even with no build edits", async () => {
    useGameEnvironment.setState({ id: "sky" });
    const renderer = await ReactThreeTestRenderer.create(
      <Probe characters={[workingBot(0)]} onSim={() => {}} />,
    );
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(3, 0.1);
    });

    const skySkip = biomeSkipFor("sky");
    expect(skySkip.length).toBeGreaterThan(0); // sanity: sky really does skip some kinds

    // The base-sim creation call passes no extras at all; the biome-aware
    // effect (which must fire even though editsVersion is still 0 here) is
    // the one that passes skipKinds.
    const skyCall = vi.mocked(buildNavGrid).mock.calls.find((c) => c[2]?.skipKinds !== undefined);
    expect(skyCall?.[2]?.skipKinds).toEqual(skySkip);

    await renderer.unmount();
  });

  it("passes no skipKinds on the default campus environment", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <Probe characters={[workingBot(0)]} onSim={() => {}} />,
    );
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(3, 0.1);
    });

    // Matches the "version-0 guard" test above: no edits + no biome skip
    // means the biome-aware effect never fires, so buildNavGrid is only
    // ever called once, for the base sim, with no extras.
    expect(vi.mocked(buildNavGrid).mock.calls).toEqual([[expect.anything(), expect.anything()]]);

    await renderer.unmount();
  });

  // Fix round 1 (review finding): the original guard was
  // `editsVersion === 0 && biomeSkip.length === 0` — true again once you
  // leave sky for campus (or island) with zero build edits throughout, so
  // the effect wrongly skipped re-deriving the grid. The live sim was left
  // stuck with sky's unblocked cells even though campus renders real trees
  // over them — an invisible-wall bug in reverse (a robot could walk
  // straight through a tree it can now see).
  it("re-applies the full block list when leaving a skip biome, even with zero build edits throughout", async () => {
    useGameEnvironment.setState({ id: "sky" });
    const renderer = await ReactThreeTestRenderer.create(
      <Probe characters={[workingBot(0)]} onSim={() => {}} />,
    );
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(3, 0.1);
    });

    await ReactThreeTestRenderer.act(async () => {
      useGameEnvironment.setState({ id: "campus" });
      await renderer.advanceFrames(3, 0.1);
    });

    const calls = vi.mocked(buildNavGrid).mock.calls;
    const results = vi.mocked(buildNavGrid).mock.results;
    const lastIdx = calls.length - 1;
    // The campus switch must have fired a fresh call with no skip list —
    // proves the guard didn't just skip the transition.
    expect(calls[lastIdx]?.[2]?.skipKinds).toEqual([]);

    // And the grid it actually produced blocks a real seeded pine cell
    // again (the reviewer's exact repro), not just "was called".
    const pine = campusLayout().scatter.treePine[0]!;
    const lastGrid = results[lastIdx]!.value as ReturnType<typeof buildNavGrid>;
    const cx = Math.floor(pine.x + lastGrid.size / 2);
    const cz = Math.floor(pine.z + lastGrid.size / 2);
    expect(lastGrid.blocked[cz * lastGrid.size + cx]).toBe(1);

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

function RealProbe({ onSim }: { onSim: (sim: Sim) => void }) {
  const { sim } = useSim();
  onSim(sim);
  return null;
}

function fakeProject(overrides: Partial<Project>): Project {
  return {
    id: "proj-1",
    name: "Foo",
    description: null,
    icon: null,
    color: null,
    folder_path: "/repo/foo",
    docs_path: null,
    status: "active",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

function fakeSessionView(overrides: { key: string; projectPath: string }): SessionView {
  return {
    key: overrides.key,
    meta: {
      id: { provider: "claude-code", id: overrides.key },
      origin: "Managed",
      project_path: overrides.projectPath,
      model: null,
      status: "Working",
      activity_detail: null,
      parent: null,
      team: null,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 },
      git_branch: null,
      last_activity_ms: Date.now(),
    },
    binding: null,
    agent: null,
    room: null,
    displayName: overrides.key,
  };
}

describe("useSim project-room groupKey annotation (M5 T5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
    useProjectsStore.setState({ projects: [] });
    vi.mocked(useSessionsView).mockReturnValue([]);
  });

  it("joins a session's project_path through plotProjects -> projects store -> groupKey so it claims a desk in its linked pavilion", async () => {
    useProjectsStore.setState({ projects: [fakeProject({ id: "proj-1", folder_path: "/repo/foo/" })] });
    useCampusEdits.getState().setPlotProject(0, "proj-1");
    // Trailing-slash mismatch vs. the store's folder_path is deliberate —
    // normalizeFolder must reconcile both sides of the join, not just
    // happen to line up because the fixture strings already match.
    vi.mocked(useSessionsView).mockReturnValue([
      fakeSessionView({ key: "sess-a", projectPath: "/repo/foo" }),
    ]);

    let sim: Sim | null = null;
    const renderer = await ReactThreeTestRenderer.create(<RealProbe onSim={(s) => (sim = s)} />);
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(5, 0.1);
    });

    expect(sim!.world.bots.get("sess-a")!.deskId).toMatch(/^desk-0-/);

    await renderer.unmount();
  });

  // This guard class (a stale annotation surviving a state transition
  // instead of re-deriving) has burned us twice before, in the M4 biome-exit
  // bug ("re-applies the full block list when leaving a skip biome" above) —
  // pinning the M5 analogue: unlinking a pavilion must release any bot
  // that was only seated because of that link, not leave it claiming a desk
  // in a room it no longer belongs to.
  it("releases a bot's desk when its pavilion is unlinked from its project (link -> unlink)", async () => {
    useProjectsStore.setState({ projects: [fakeProject({ id: "proj-1", folder_path: "/repo/foo" })] });
    useCampusEdits.getState().setPlotProject(0, "proj-1");
    vi.mocked(useSessionsView).mockReturnValue([
      fakeSessionView({ key: "sess-a", projectPath: "/repo/foo" }),
    ]);

    let sim: Sim | null = null;
    const renderer = await ReactThreeTestRenderer.create(<RealProbe onSim={(s) => (sim = s)} />);
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(5, 0.1);
    });
    expect(sim!.world.bots.get("sess-a")!.deskId).toMatch(/^desk-0-/);

    const callsBeforeUnlink = vi.mocked(buildNavGrid).mock.calls.length;
    await ReactThreeTestRenderer.act(async () => {
      useCampusEdits.getState().setPlotProject(0, null);
      await renderer.advanceFrames(5, 0.1);
    });

    // The effect actually re-fired (fresh grid/buildings from the update
    // effect), not just "the bot happened to still read as unmatched".
    expect(vi.mocked(buildNavGrid).mock.calls.length).toBeGreaterThan(callsBeforeUnlink);
    expect(sim!.world.bots.get("sess-a")!.deskId).toBeNull();

    await renderer.unmount();
  });

  it("leaves a session's bot unmatched (never claims a desk) when its project has no plot link", async () => {
    useProjectsStore.setState({ projects: [fakeProject({ id: "proj-1", folder_path: "/repo/foo" })] });
    // No setPlotProject call — proj-1 is registered but not linked to any pavilion.
    vi.mocked(useSessionsView).mockReturnValue([
      fakeSessionView({ key: "sess-a", projectPath: "/repo/foo" }),
    ]);

    let sim: Sim | null = null;
    const renderer = await ReactThreeTestRenderer.create(<RealProbe onSim={(s) => (sim = s)} />);
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(20, 0.1);
    });

    expect(sim!.world.bots.get("sess-a")!.deskId).toBeNull();

    await renderer.unmount();
  });

  it("demo override: annotates every building (including one linked to a real project) with DEMO_GROUP, ignoring project joins entirely", async () => {
    // Plot 0 is linked to a real project that no demo bot's groupKey could
    // ever match — proving demo mode doesn't consult plotProjects at all,
    // rather than merely "happening" to also match by coincidence.
    useCampusEdits.getState().setPlotProject(0, "some-real-project-not-in-any-store");
    const bots = Array.from({ length: 16 }, (_, i) => workingBot(i)); // 4 buildings * 4 desks

    let sim: Sim | null = null;
    const renderer = await ReactThreeTestRenderer.create(
      <Probe characters={bots} onSim={(s) => (sim = s)} />,
    );
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(5, 0.1);
    });

    for (const bot of bots) {
      expect(sim!.world.bots.get(bot.key)!.deskId).not.toBeNull();
    }
    // Specifically the linked plot's desks, not just "16 desks somewhere":
    const seatedInLinkedPlot = [...sim!.world.bots.values()].filter((b) => b.deskId?.startsWith("desk-0-"));
    expect(seatedInLinkedPlot).toHaveLength(4);

    await renderer.unmount();
  });
});

describe("useSim HQ groupKey defensive annotation (M6 T5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
    useProjectsStore.setState({ projects: [] });
    vi.mocked(useSessionsView).mockReturnValue([]);
  });

  it("keeps HQ's groupKey null even with a corrupt plotProjects[-1] entry", async () => {
    // plotProjects is keyed by real plot index (0-3) in normal use — HQ is
    // prepended by campusBuildings() outside the `plots.map()` loop that
    // reads plotProjects, so a "-1" key is dead data today. This pins the
    // defensive kind==="hq" guard in withProjectGroupKeys anyway: even
    // handed a project link under that bogus key, HQ must never resolve to
    // a real groupKey (there are no desks in it to seat anyone at, but a
    // stray groupKey would still be a lurking foot-gun for future code that
    // assumes any building with a groupKey has claimable desks).
    useProjectsStore.setState({ projects: [fakeProject({ id: "proj-1", folder_path: "/repo/foo" })] });
    useCampusEdits.setState((s) => ({
      edits: { ...s.edits, plotProjects: { ...s.edits.plotProjects, [-1]: "proj-1" } },
    }));

    const renderer = await ReactThreeTestRenderer.create(<RealProbe onSim={() => {}} />);
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(3, 0.1);
    });

    // The update effect's call passes the annotated buildings as its 2nd
    // arg — find the one carrying HQ and check its groupKey directly,
    // rather than inferring it indirectly through seating (HQ has no desks
    // to seat anyone at either way).
    const calls = vi.mocked(buildNavGrid).mock.calls;
    const hqCall = calls.find((c) => c[1].some((b) => b.kind === "hq"));
    const hq = hqCall?.[1].find((b) => b.kind === "hq");
    expect(hq).toBeDefined();
    expect(hq?.groupKey ?? null).toBeNull();

    await renderer.unmount();
  });
});

describe("useSim: effect fires on projects load even at editsVersion 0 (M5 T5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCampusEditsForTests();
    useProjectsStore.setState({ projects: [] });
    vi.mocked(useSessionsView).mockReturnValue([]);
  });

  it("re-derives groupKeys once the projects store loads, even though a directly-seeded plotProjects link never bumped editsVersion", async () => {
    // Simulates state arriving out of the normal setPlotProject() path (e.g.
    // a persisted blob loaded before the projects store has anything to
    // join against) — plotProjects has a link, but version stays 0.
    useCampusEdits.setState((s) => ({ edits: { ...s.edits, plotProjects: { 0: "proj-1" } } }));
    expect(useCampusEdits.getState().version).toBe(0);
    vi.mocked(useSessionsView).mockReturnValue([
      fakeSessionView({ key: "sess-a", projectPath: "/repo/foo" }),
    ]);

    let sim: Sim | null = null;
    const renderer = await ReactThreeTestRenderer.create(<RealProbe onSim={(s) => (sim = s)} />);
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(3, 0.1);
    });
    // Projects store hasn't loaded yet: folderByProjectId is empty, so the
    // link can't resolve to a folder — the bot stays unmatched for now.
    expect(sim!.world.bots.get("sess-a")!.deskId).toBeNull();

    // Projects load (async, after mount) — this bumps neither editsVersion
    // nor biomeSkip, so only the hasProjectLinks branch can explain a
    // re-derive here.
    await ReactThreeTestRenderer.act(async () => {
      useProjectsStore.setState({ projects: [fakeProject({ id: "proj-1", folder_path: "/repo/foo" })] });
      await renderer.advanceFrames(1, 0.1);
    });

    expect(sim!.world.bots.get("sess-a")!.deskId).toMatch(/^desk-0-/);

    await renderer.unmount();
  });

  it("stays silent (no extra buildNavGrid call) when projects load but nothing is linked", async () => {
    const renderer = await ReactThreeTestRenderer.create(<RealProbe onSim={() => {}} />);
    await ReactThreeTestRenderer.act(async () => {
      await renderer.advanceFrames(3, 0.1);
    });

    await ReactThreeTestRenderer.act(async () => {
      useProjectsStore.setState({ projects: [fakeProject({ id: "proj-1", folder_path: "/repo/foo" })] });
      await renderer.advanceFrames(1, 0.1);
    });

    // Same invariant as the "passes no skipKinds" test: with zero edits,
    // zero project links, and zero biome skip, buildNavGrid is only ever
    // called once — for the base sim's mount, never from the update effect.
    expect(vi.mocked(buildNavGrid).mock.calls).toEqual([[expect.anything(), expect.anything()]]);

    await renderer.unmount();
  });
});
