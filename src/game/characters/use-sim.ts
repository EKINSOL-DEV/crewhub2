// Sim bridge (M1 T7): joins the store world into `Character[]`, builds the
// campus nav grid + `Sim` once, and ticks it at a fixed 10 Hz off useFrame.
// `Characters.tsx` reads positions/motion straight off `sim.world.bots` every
// frame (those objects mutate in place) — this hook only tracks bot *set*
// churn (added/removed) so the JSX list knows when to re-render.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { SessionStatus } from "@/ipc/bindings";
import { useAgentsStore } from "@/stores/agents";
import { useBindingsStore } from "@/stores/bindings";
import { useProjectsStore } from "@/stores/projects";
import { useSessionsStore, useSessionsView } from "@/stores/sessions";
import { applyEdits } from "@/game/build/edits";
import { useCampusEdits } from "@/game/build/store";
import { useFlavorTicker } from "@/game/flavor/use-flavor-ticker";
import { buildNavGrid } from "@/game/sim/grid";
import { createSim, type Sim } from "@/game/sim/sim";
import { toCharacters, type Character } from "@/game/sim/characters";
import { biomeSkipFor } from "@/game/world/biome";
import { campusBuildings } from "@/game/world/campus/buildings";
import { campusLayout } from "@/game/world/campus/layout";
import { useGameEnvironment } from "@/game/world/environments/store";

/** Same seed forever — the sim must replay identically across sessions. */
const SIM_SEED = 0x51d0;
const TICK_S = 0.1;

/** What the renderer needs about a bot beyond `SimBot`'s wire shape (T6 keeps that clean). */
export interface CharacterInfo {
  name: string;
  color: string;
  status: SessionStatus;
}

export interface UseSimResult {
  sim: Sim;
  /** Bumps only when bots are added/removed after a sync — the JSX list's re-render cue. */
  version: number;
  /** key -> name/color/status, refreshed on every sync; read imperatively (never in render). */
  infoRef: MutableRefObject<Map<string, CharacterInfo>>;
}

/** Demo fast-forward: open mid-life (robots seated/raising hands), not at spawn. */
const DEMO_WARMUP_TICKS = 300; // 30s of sim time, deterministic, <10ms of work

export function useSim(override?: Character[]): UseSimResult {
  useEffect(() => {
    void useSessionsStore.getState().init();
    void useBindingsStore.getState().init();
    void useAgentsStore.getState().init();
    void useProjectsStore.getState().load();
    void useCampusEdits.getState().init();
    void useGameEnvironment.getState().init();
  }, []);

  const views = useSessionsView();
  const agents = useAgentsStore((s) => s.agents);

  // Same slow-prune pattern as WorldPanel (EKI-110): Date.now() is fine
  // here, this is React land feeding the pure sim, not the sim itself.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Seeded layout + base four buildings, held once — edits are layered on
  // top below, never baked in here, so `sim` (built off just the base) only
  // has to be created once for the component's whole lifetime.
  const campus = useMemo(() => {
    const layout = campusLayout();
    const buildings = campusBuildings(layout.plots);
    return { layout, buildings };
  }, []);

  const sim = useMemo(() => {
    const grid = buildNavGrid(campus.layout, campus.buildings);
    return createSim(grid, campus.buildings, SIM_SEED);
  }, [campus]);

  // Build-mode edits (M3 T5): a placed pavilion or piece of decor changes
  // what robots can walk through and where they can sit, so re-derive the
  // nav grid + building pool and hand them to the once-built sim via
  // updateWorld() — never a fresh createSim(), that would respawn everyone.
  // `editsVersion` starts at 0 and only becomes >0 once the store has
  // actually loaded/mutated (see build/store.ts).
  //
  // Sky-biome invisible walls (M4 debt sweep): buildNavGrid blocks every
  // BLOCKING_SCATTER kind regardless of biome, but sky doesn't *render*
  // rockLarge/treePine/treeDetailed (biome.ts's `skip`) — a robot would
  // path around a wall it can't see. `skipKinds` (grid.ts) fixes the
  // blocking; the base `sim` above is still built ignorant of biome (it's
  // created once, before we'd know which environment is even active), so
  // this effect is what actually applies the current biome's skip list —
  // including on first mount, if the player starts on a non-campus biome.
  // That's why the guard below can no longer be "skip when editsVersion===0":
  // a fresh sky-biome mount has editsVersion 0 too, and still needs this to
  // run once to unblock its skipped kinds. Run whenever either is true; skip
  // only the genuinely redundant case (no edits AND no biome skip), which is
  // the original campus-mount guard.
  const edits = useCampusEdits((s) => s.edits);
  const editsVersion = useCampusEdits((s) => s.version);
  const envId = useGameEnvironment((s) => s.id);
  const biomeSkip = biomeSkipFor(envId);
  useEffect(() => {
    if (editsVersion === 0 && biomeSkip.length === 0) return;
    const { buildings: allBuildings } = applyEdits(campus.layout, campus.buildings, edits);
    const grid = buildNavGrid(campus.layout, allBuildings, {
      items: edits.items.map((i) => ({ x: i.x, z: i.z })),
      skipKinds: biomeSkip,
    });
    sim.updateWorld(grid, allBuildings);
  }, [sim, campus, edits, editsVersion, biomeSkip]);

  const characters = useMemo(
    () => override ?? toCharacters(views, { agents, nowMs }),
    [override, views, agents, nowMs],
  );

  // M4 T2: the ticker needs live Character[] (agentId, activity) — which
  // Characters.tsx never sees, it only reads the sim-derived x/z/facing/info
  // — so it's wired here rather than threading a second prop through the
  // renderer. Demo scenes (`override` set) skip it: there's no session
  // behind a demo bot to think about.
  useFlavorTicker(characters, override === undefined);

  const infoRef = useRef<Map<string, CharacterInfo>>(new Map());
  const keysRef = useRef<Set<string>>(new Set());
  const [version, setVersion] = useState(0);

  // The sim only cares about identity + status (that's what drives replan()),
  // but this same effect also rebuilds `infoRef` (name/color/status for the
  // renderer's nameplates) — so a rename/recolor with no status change must
  // still re-run it, or `infoRef` goes stale and the nameplate keeps
  // showing the old name. Status-only churn dominates in practice, so this
  // stays cheap even with name/color folded in.
  const syncKey = useMemo(
    () => characters.map((c) => `${c.key}:${c.status}:${c.name}:${c.color}`).join(","),
    [characters],
  );

  const warmedRef = useRef(false);
  useEffect(() => {
    sim.sync(characters);
    infoRef.current = new Map(
      characters.map((c) => [c.key, { name: c.name, color: c.color, status: c.status }]),
    );
    // Demo scenes open on arrived robots instead of a spawn-point conga line.
    if (override && !warmedRef.current) {
      warmedRef.current = true;
      for (let i = 0; i < DEMO_WARMUP_TICKS; i++) sim.tick(TICK_S);
    }

    const keys = new Set(sim.world.bots.keys());
    const changed = keys.size !== keysRef.current.size || [...keys].some((k) => !keysRef.current.has(k));
    if (changed) {
      keysRef.current = keys;
      setVersion((v) => v + 1);
    }
    // `characters` is intentionally not a dep — `syncKey` already captures
    // every change that should re-sync the sim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, syncKey]);

  const accRef = useRef(0);
  useFrame((_state, delta) => {
    // Tab-back frame spikes shouldn't fast-forward the sim for minutes.
    accRef.current += Math.min(delta, 0.25);
    while (accRef.current >= TICK_S) {
      sim.tick(TICK_S);
      accRef.current -= TICK_S;
    }
  });

  return { sim, version, infoRef };
}
