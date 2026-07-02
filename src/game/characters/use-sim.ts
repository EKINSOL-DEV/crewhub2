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
import { buildNavGrid } from "@/game/sim/grid";
import { createSim, type Sim } from "@/game/sim/sim";
import { toCharacters, type Character } from "@/game/sim/characters";
import { campusBuildings } from "@/game/world/campus/buildings";
import { campusLayout } from "@/game/world/campus/layout";

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

export function useSim(override?: Character[]): UseSimResult {
  useEffect(() => {
    void useSessionsStore.getState().init();
    void useBindingsStore.getState().init();
    void useAgentsStore.getState().init();
    void useProjectsStore.getState().load();
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

  const sim = useMemo(() => {
    const layout = campusLayout();
    const buildings = campusBuildings(layout.plots);
    const grid = buildNavGrid(layout, buildings);
    return createSim(grid, buildings, SIM_SEED);
  }, []);

  const characters = useMemo(
    () => override ?? toCharacters(views, { agents, nowMs }),
    [override, views, agents, nowMs],
  );

  const infoRef = useRef<Map<string, CharacterInfo>>(new Map());
  const keysRef = useRef<Set<string>>(new Set());
  const [version, setVersion] = useState(0);

  // The sim only cares about identity + status (that's what drives replan());
  // name/color drift alone shouldn't re-sync it, so key the effect narrowly.
  const syncKey = useMemo(() => characters.map((c) => `${c.key}:${c.status}`).join(","), [characters]);

  useEffect(() => {
    sim.sync(characters);
    infoRef.current = new Map(
      characters.map((c) => [c.key, { name: c.name, color: c.color, status: c.status }]),
    );

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
