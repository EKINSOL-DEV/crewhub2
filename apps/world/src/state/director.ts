/* The director runtime: the scripted feed from @crewhub/demo, the AI-presence settings and the plan log. It watches the
   world through the same runtime every view uses, sends each new model to the feed and plays the accepted intents
   through the intent player. No model call, no network; the settings only bound the script. */
import { useEffect, useSyncExternalStore } from "react";
import { createDirectorFeed, DEMO_SEED, demoPropTags, type FeedUsage, type PlanRecord } from "@crewhub/demo";
import { DEFAULT_PRESENCE, normalizePresence, type PresenceSettings, type Reachable, type WorldModel } from "@crewhub/world-model";
import { clearIntents, playIntent } from "../world/intentPlayer";
import { worldRuntime } from "./world";

const STORAGE_KEY = "crewhub.presence.v1";
const LOG_LIMIT = 40;

export function loadPresence(): PresenceSettings {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? normalizePresence(JSON.parse(raw)) : DEFAULT_PRESENCE;
  } catch {
    return DEFAULT_PRESENCE;
  }
}

function savePresence(settings: PresenceSettings) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can throw (private window, blocked site data); the settings then last for this page only.
  }
}

/* Tonight reachability is the demo prop catalogue: the town's interiors and their engine layouts are not merged yet.
   The walks layer replaces this with "an approach cell of a prop with this tag is reachable in the building's grid". */
const reachable: Reachable = (query) => (query.kind === "prop" ? demoPropTags(query.room).includes(query.tag) : true);

export interface DirectorState {
  settings: PresenceSettings;
  /** Newest first. */
  plans: readonly PlanRecord[];
  usage: FeedUsage;
}

class DirectorRuntime {
  #settings = loadPresence();
  #script = createDirectorFeed({ seed: DEMO_SEED, reachable, settings: this.#settings });
  #plans: readonly PlanRecord[] = [];
  #state: DirectorState;
  #listeners = new Set<() => void>();
  #started = false;

  constructor() {
    this.#state = this.#snapshot();
  }

  get state(): DirectorState {
    return this.#state;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Follows the world; idempotent, so StrictMode's double mount does not double the feed. */
  start() {
    if (this.#started) return;
    this.#started = true;
    const world = worldRuntime();
    world.subscribe(() => this.#onModel(world.state.model));
    this.#onModel(world.state.model);
  }

  update(patch: Partial<PresenceSettings>) {
    this.#settings = normalizePresence({ ...this.#settings, ...patch });
    savePresence(this.#settings);
    this.#script.setSettings(this.#settings);
    // The kill switch works at once: no more plans, and no intent keeps steering anyone.
    if (!this.#settings.directorEnabled) clearIntents();
    this.#publish();
  }

  #onModel(model: WorldModel) {
    const made = this.#script.step(model);
    for (const plan of made) for (const intent of plan.accepted) playIntent(intent, model);
    if (made.length > 0) this.#plans = [...made.reverse(), ...this.#plans].slice(0, LOG_LIMIT);
    // The usage counter also moves when nothing was planned (a cap lifting), so publish on every model.
    this.#publish();
  }

  #snapshot(): DirectorState {
    return { settings: this.#settings, plans: this.#plans, usage: this.#script.usage() };
  }

  #publish() {
    const next = this.#snapshot();
    const prev = this.#state;
    const same = prev.settings === next.settings && prev.plans === next.plans && JSON.stringify(prev.usage) === JSON.stringify(next.usage);
    if (same) return;
    this.#state = next;
    for (const listener of this.#listeners) listener();
  }
}

let runtime: DirectorRuntime | null = null;
export function directorRuntime(): DirectorRuntime {
  runtime ??= new DirectorRuntime();
  return runtime;
}

/** Mount once near the root: starts the feed, which then runs whether or not a panel is open. */
export function useDirectorFeed(): void {
  useEffect(() => directorRuntime().start(), []);
}

export function useDirector(): DirectorState {
  const director = directorRuntime();
  return useSyncExternalStore(director.subscribe, () => director.state);
}
