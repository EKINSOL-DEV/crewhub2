/* The one seam between the world's data and its presentation. Everything else in apps/world reads the WorldModel
   contract only (packages/world-model). The source is the scripted demo tonight; a future host source replaces
   `createDemoSource` and nothing else changes. */
import { useSyncExternalStore } from "react";
import type { WorldSource } from "@crewhub/loops-client";
import {
  browserScheduler,
  createDemoSource,
  createStressSource,
  DEFAULT_SCENARIO,
  demoScenario,
  demoScenarios,
  parseScenarioId,
  parseStressSize,
  STRESS_FIXTURES,
  STRESS_SIZES,
  type DemoScenario,
  type DemoSource,
  type StressSize,
} from "@crewhub/demo";
import {
  describeWorld,
  emptyMemory,
  Projection,
  reduceWorld,
  type PlaybackControls,
  type PlaybackControls as Playback,
  type RoleId,
  type TextLine,
  type WorldModel,
} from "@crewhub/world-model";

export interface WorldState {
  model: WorldModel;
  text: TextLine[];
  playback: PlaybackControls | null;
}

/** Captions, speech marks and the posture debounce are timed against the source clock, so re-reduce this often. */
const TIME_TICK_MS = 1000;
/** While a ticket drone is in the air, re-reduce faster so the model lands the package on time at 16x. */
const FLIGHT_TICK_MS = 250;
/**
 * Under a heavy stream (the stress town at 16x) a reduction and what follows it (React, the scene's sync) cost several
 * milliseconds, many times a second. Reductions are spaced by this many times the last one's cost, so the pipeline
 * keeps to a small share of the main thread: no wait at 1x, a few frames at 16x. Never longer than REDUCE_GAP_MAX_MS.
 */
const REDUCE_GAP_PER_MS = 20;
const REDUCE_GAP_MAX_MS = 200;

const PARAMS = new URLSearchParams(globalThis.location?.search ?? "");

/**
 * `?stress=1` and `?stress=20` (dev builds only): the synthetic stress towns (12 buildings with 100 agents, or 20
 * buildings with 200 agents in four groups) through the same seam, with a frame-time overlay. Production builds
 * ignore the flag.
 */
export const STRESS_SIZE: StressSize | null = import.meta.env.DEV ? parseStressSize(PARAMS.get("stress")) : null;
export const STRESS = STRESS_SIZE !== null;

/** `?scenario=<id>`: which demo installation the world shows; the default storyline without it. */
export const SCENARIO: DemoScenario = demoScenario(parseScenarioId(PARAMS.get("scenario")));

/** The storage key of the town document on this page: one town per scenario and per stress fixture. */
export const TOWN_KEY = STRESS_SIZE === null ? SCENARIO.townKey : `crewhub-world.stress-${STRESS_SIZE}`;

export interface ScenarioChoice {
  id: string;
  name: string;
  summary: string;
  current: boolean;
  /** Where choosing it goes: this page with the scenario in the URL. */
  href: string;
}

/** The Demo chip's picker: every scenario, and in dev builds the stress fixtures. Choosing one reloads the page. */
export function scenarioChoices(): ScenarioChoice[] {
  const href = (set: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(PARAMS);
    params.delete("scenario");
    params.delete("stress");
    set(params);
    const query = params.toString();
    return `${globalThis.location?.pathname ?? "/"}${query ? `?${query}` : ""}`;
  };
  const choices: ScenarioChoice[] = demoScenarios().map((s) => ({
    id: s.id,
    name: s.name,
    summary: s.summary,
    current: !STRESS && s.id === SCENARIO.id,
    href: href((params) => s.id !== DEFAULT_SCENARIO && params.set("scenario", s.id)),
  }));
  if (import.meta.env.DEV)
    for (const size of STRESS_SIZES)
      choices.push({
        id: `stress-${size}`,
        name: `Stress ${size}`,
        summary: `${STRESS_FIXTURES[size].agents} agents`,
        current: STRESS_SIZE === size,
        href: href((params) => params.set("stress", String(size))),
      });
  return choices;
}

type Source = WorldSource & { readonly mode: "demo"; readonly playback: Playback };

class WorldRuntime {
  readonly source: Source;
  /** Source time at the first loop's start (ms): the day-night drift counts the time of day from it. */
  readonly epochMs: number;
  /** The chat dock's demo source: the world's own, or (stress fixture) a separate scripted demo for the dock only. */
  readonly chat: DemoSource;
  readonly projection: Projection;
  #memory = emptyMemory();
  #roleOverrides: Record<string, RoleId> = {};
  #state: WorldState;
  #listeners = new Set<() => void>();
  #frame = 0;
  #wait: ReturnType<typeof setTimeout> | 0 = 0;
  #lastReduce = 0;
  /** How long the last reduction took (ms). */
  #cost = 0;
  #inFlight = false;

  constructor() {
    // The script starts at the minute the page opened, so the copied chat's relative times read naturally.
    const epochMs = Math.floor(Date.now() / 60_000) * 60_000;
    this.epochMs = epochMs;
    const demo = createDemoSource({ scheduler: browserScheduler(), epochMs, scenario: SCENARIO.id });
    this.chat = demo;
    this.source = STRESS_SIZE !== null ? createStressSource({ scheduler: browserScheduler(), epochMs, size: STRESS_SIZE }) : demo;
    this.projection = new Projection(this.source);
    this.source.start((message) => this.projection.apply(message));
    this.projection.onChange(() => this.#schedule());
    globalThis.setInterval(() => {
      if (document.hidden) return;
      if (this.#inFlight || performance.now() - this.#lastReduce >= TIME_TICK_MS) this.#schedule();
    }, FLIGHT_TICK_MS);
    this.#state = this.#reduce();
  }

  get state(): WorldState {
    return this.#state;
  }

  /** The scripted demo behind the world, or null when the world runs the stress fixture. */
  get demo(): DemoSource | null {
    return this.source === this.chat ? this.chat : null;
  }

  setRoleOverrides(overrides: Record<string, RoleId>) {
    this.#roleOverrides = overrides;
    this.#schedule();
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Coalesce a burst of applied messages into one reduction per animation frame, spaced by the reductions' cost. */
  #schedule() {
    if (this.#frame || this.#wait) return;
    const wait = this.#lastReduce + Math.min(REDUCE_GAP_MAX_MS, this.#cost * REDUCE_GAP_PER_MS) - performance.now();
    if (wait > 0) {
      this.#wait = setTimeout(() => {
        this.#wait = 0;
        this.#schedule();
      }, wait);
      return;
    }
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#state = this.#reduce();
      for (const listener of this.#listeners) listener();
    });
  }

  #reduce(): WorldState {
    const started = performance.now();
    const result = reduceWorld(this.projection.facts, this.#memory, {
      now: this.source.now(),
      mode: this.source.mode,
      roleOverrides: this.#roleOverrides,
    });
    this.#memory = result.memory;
    this.#lastReduce = performance.now();
    this.#cost = this.#lastReduce - started;
    this.#inFlight = result.model.buildings.some((b) => b.objects.some((o) => o.transit));
    return { model: result.model, text: describeWorld(result.model), playback: this.source.playback };
  }
}

let runtime: WorldRuntime | null = null;
/** One runtime per page: StrictMode's double mount and every hook share it. */
export function worldRuntime(): WorldRuntime {
  runtime ??= new WorldRuntime();
  return runtime;
}

export function useWorld(): WorldState {
  const world = worldRuntime();
  return useSyncExternalStore(world.subscribe, () => world.state);
}
