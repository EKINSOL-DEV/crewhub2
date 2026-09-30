/* The one seam between the world's data and its presentation. Everything else in apps/world reads the WorldModel
   contract only (packages/world-model). The source is the scripted demo tonight; a future host source replaces
   `createDemoSource` and nothing else changes. */
import { useSyncExternalStore } from "react";
import { browserScheduler, createDemoSource, type DemoSource } from "@crewhub/demo";
import {
  describeWorld,
  emptyMemory,
  Projection,
  reduceWorld,
  type PlaybackControls,
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

class WorldRuntime {
  readonly source: DemoSource;
  readonly projection: Projection;
  #memory = emptyMemory();
  #roleOverrides: Record<string, RoleId> = {};
  #state: WorldState;
  #listeners = new Set<() => void>();
  #frame = 0;

  constructor() {
    // The script starts at the minute the page opened, so the copied chat's relative times read naturally.
    this.source = createDemoSource({ scheduler: browserScheduler(), epochMs: Math.floor(Date.now() / 60_000) * 60_000 });
    this.projection = new Projection(this.source);
    this.source.start((message) => this.projection.apply(message));
    this.projection.onChange(() => this.#schedule());
    globalThis.setInterval(() => {
      if (!document.hidden) this.#schedule();
    }, TIME_TICK_MS);
    this.#state = this.#reduce();
  }

  get state(): WorldState {
    return this.#state;
  }

  setRoleOverrides(overrides: Record<string, RoleId>) {
    this.#roleOverrides = overrides;
    this.#schedule();
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Coalesce a burst of applied messages into one reduction per animation frame. */
  #schedule() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#state = this.#reduce();
      for (const listener of this.#listeners) listener();
    });
  }

  #reduce(): WorldState {
    const result = reduceWorld(this.projection.facts, this.#memory, {
      now: this.source.now(),
      mode: this.source.mode,
      roleOverrides: this.#roleOverrides,
    });
    this.#memory = result.memory;
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
