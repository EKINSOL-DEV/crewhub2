/* The world runtime: the one seam between the world's data and its presentation. Everything else in apps/world reads the
   WorldModel contract only (packages/world-model). A runtime is built from its config (state/page.ts builds the page's
   one): its WorldSource (three adapters: the scripted demo, the stress fixture, the live host `createHostSource`), its
   frame clock and the outlets that keep what is said beside the model. It reads no page, no environment and no store
   of its own, so a node test builds one over `createDemoSource` with a manual scheduler and a fake clock. */
import { createHostSource, type ChatLine, type ChatThreadFact, type ConnectionStatus, type HostSourceOptions, type WorldSource } from "@crewhub/loops-client";
import { createDemoSource, createStressSource, type DemoSource, type Scheduler, type ScenarioId, type StressSize } from "@crewhub/demo";
import {
  describeWorld,
  emptyMemory,
  Projection,
  reduceWorld,
  type PlaybackControls,
  type PlaybackControls as Playback,
  type RoleId,
  type TextLine,
  type TownZoning,
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

/** The page's clock for the runtime: wall time, animation frames, timers and whether the page is hidden. */
export interface FrameClock {
  /** Wall time in ms (the cost of a reduction is measured with it). */
  now(): number;
  /** Runs `fn` on the next animation frame. */
  frame(fn: () => void): void;
  /** Runs `fn` once after `ms`. */
  after(ms: number, fn: () => void): void;
  /** Runs `fn` every `ms`. */
  every(ms: number, fn: () => void): void;
  /** The page is hidden: the time ticks skip their reduction. */
  hidden(): boolean;
}

/** The browser's frame clock. */
export function browserFrameClock(): FrameClock {
  return {
    now: () => performance.now(),
    frame: (fn) => void requestAnimationFrame(fn),
    after: (ms, fn) => void setTimeout(fn, ms),
    every: (ms, fn) => void globalThis.setInterval(fn, ms),
    hidden: () => globalThis.document?.hidden ?? false,
  };
}

/** Where the runtime hands what it keeps beside the model. */
export interface WorldOutlets {
  /** An agent's line to the person (round 12): a bubble over its figure, never in the model. */
  said(line: ChatLine): void;
  /** The chat threads' facts (round 24): kept for the card, never in the model. */
  threads(threads: readonly ChatThreadFact[]): void;
  /** The live stream came (back) up: the town is read again (round 22). */
  hostConnected(): void;
  /** The first snapshot arrived: a mark for the tools that time the start (tools/timeworld.mjs). */
  firstSnapshot(): void;
}

export interface WorldRuntimeConfig {
  /** The adapter the world runs on (`worldSources`). */
  source: WorldSource;
  /** The chat dock's demo source; the world's own source when they are the same object. Null in live mode. */
  chat: DemoSource | null;
  /** Source time at the first loop's start (ms). */
  epochMs: number;
  clock: FrameClock;
  /** `?buildings=N` (dev): the model shows only the first N buildings; NaN for all. */
  buildingLimit: number;
  outlets: WorldOutlets;
}

/** What `worldSources` needs of the page (state/page.ts's PageConfig). */
export interface SourcePage {
  live: boolean;
  scenarioId: ScenarioId;
  stressSize: StressSize | null;
}

type DemoLike = WorldSource & { readonly mode: "demo"; readonly playback: Playback };

/**
 * The three adapters of the world's seam: the live host (with the snapshot main.tsx read ahead, if it did, and the
 * host's town revisions), the stress fixture (its chat dock a separate scripted demo), or the scenario's demo, which
 * is also the dock's.
 */
export function worldSources(page: SourcePage, options: { scheduler: Scheduler; epochMs: number; firstSnapshot?: HostSourceOptions["firstSnapshot"]; onTown?: (rev: number) => void }): { source: WorldSource; chat: DemoSource | null } {
  if (page.live) {
    const { firstSnapshot, onTown } = options;
    return { source: createHostSource({ ...(firstSnapshot ? { firstSnapshot } : {}), ...(onTown ? { onTown } : {}) }), chat: null };
  }
  const demo = createDemoSource({ scheduler: options.scheduler, epochMs: options.epochMs, scenario: page.scenarioId });
  const source: DemoLike = page.stressSize !== null ? createStressSource({ scheduler: options.scheduler, epochMs: options.epochMs, size: page.stressSize }) : demo;
  return { source, chat: demo };
}

class WorldRuntime {
  readonly source: WorldSource;
  /** Source time at the first loop's start (ms): the day-night drift counts the time of day from it. */
  readonly epochMs: number;
  /**
   * The chat dock's demo source: the world's own, or (stress fixture) a separate scripted demo for the dock only. Null in
   * live mode: the dock then shows the sign-in link (the chat is phase 2).
   */
  readonly chat: DemoSource | null;
  /** The live source's standing with its host; null for the demo, which is always there. */
  readonly connection: ConnectionStatus | null;
  readonly projection: Projection;
  readonly #clock: FrameClock;
  readonly #buildingLimit: number;
  #memory = emptyMemory();
  #roleOverrides: Record<string, RoleId> = {};
  #zoning: TownZoning = {};
  #zoningSignature = "{}";
  #reducedMotion = false;
  #state: WorldState;
  #listeners = new Set<() => void>();
  #frame = false;
  #wait = false;
  #lastReduce = 0;
  /** How long the last reduction took (ms). */
  #cost = 0;
  #inFlight = false;

  constructor(config: WorldRuntimeConfig) {
    const { source, chat, clock, outlets } = config;
    this.source = source;
    this.chat = chat;
    this.epochMs = config.epochMs;
    this.#clock = clock;
    this.#buildingLimit = config.buildingLimit;
    this.connection = this.source.connection ?? null;
    // Every time the stream comes (back) up the town is read again (round 22): the host tells open tabs only, so a
    // `town` message sent while this tab reconnected (loops' 300 s end, a host restart) would otherwise be missed.
    if (this.connection) {
      const connection = this.connection;
      let was = connection.state();
      connection.onChange(() => {
        const now = connection.state();
        if (now === "live" && was !== "live") outlets.hostConnected();
        was = now;
      });
    }
    this.projection = new Projection(this.source);
    let firstSnapshot = true;
    this.source.start((message) => {
      if (firstSnapshot && message.type === "snapshot") {
        firstSnapshot = false;
        outlets.firstSnapshot();
      }
      if (message.type === "chat") {
        outlets.said(message.chat);
        return;
      }
      if (message.type === "threads") {
        outlets.threads(message.threads);
        return;
      }
      this.projection.apply(message);
    });
    this.projection.onChange(() => this.#schedule());
    clock.every(FLIGHT_TICK_MS, () => {
      if (clock.hidden()) return;
      if (this.#inFlight || clock.now() - this.#lastReduce >= TIME_TICK_MS) this.#schedule();
    });
    this.#state = this.#reduce();
  }

  get state(): WorldState {
    return this.#state;
  }

  /** The scripted demo behind the world, or null when the world runs the stress fixture or the live host. */
  get demo(): DemoSource | null {
    return this.chat !== null && this.source === this.chat ? this.chat : null;
  }

  setRoleOverrides(overrides: Record<string, RoleId>) {
    this.#roleOverrides = overrides;
    this.#schedule();
  }

  /** The town document's zones and manual assignments; the reducer resolves every building's zone with them. */
  setZoning(zoning: TownZoning) {
    const signature = JSON.stringify(zoning);
    if (signature === this.#zoningSignature) return;
    this.#zoningSignature = signature;
    this.#zoning = zoning;
    this.#schedule();
  }

  /** The viewer prefers reduced motion: a person's package lands at once instead of being carried (the reducer's call). */
  setReducedMotion(on: boolean) {
    if (on === this.#reducedMotion) return;
    this.#reducedMotion = on;
    this.#schedule();
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /**
   * Coalesce a burst of applied messages into one reduction per animation frame, spaced by the reductions' cost: the
   * next one waits REDUCE_GAP_PER_MS times the last one's cost after it, at most REDUCE_GAP_MAX_MS.
   */
  #schedule() {
    if (this.#frame || this.#wait) return;
    const wait = this.#lastReduce + Math.min(REDUCE_GAP_MAX_MS, this.#cost * REDUCE_GAP_PER_MS) - this.#clock.now();
    if (wait > 0) {
      this.#wait = true;
      this.#clock.after(wait, () => {
        this.#wait = false;
        this.#schedule();
      });
      return;
    }
    this.#frame = true;
    this.#clock.frame(() => {
      this.#frame = false;
      this.#state = this.#reduce();
      for (const listener of this.#listeners) listener();
    });
  }

  #reduce(): WorldState {
    const started = this.#clock.now();
    const result = reduceWorld(this.projection.facts, this.#memory, {
      now: this.source.now(),
      mode: this.source.mode,
      roleOverrides: this.#roleOverrides,
      zoning: this.#zoning,
      reducedMotion: this.#reducedMotion,
    });
    this.#memory = result.memory;
    this.#lastReduce = this.#clock.now();
    this.#cost = this.#lastReduce - started;
    this.#inFlight = result.model.buildings.some((b) => b.objects.some((o) => o.transit));
    const model = Number.isNaN(this.#buildingLimit) ? result.model : { ...result.model, buildings: result.model.buildings.slice(0, this.#buildingLimit) };
    return { model, text: describeWorld(model), playback: this.source.playback };
  }
}

export type { WorldRuntime };

export function createWorldRuntime(config: WorldRuntimeConfig): WorldRuntime {
  return new WorldRuntime(config);
}
