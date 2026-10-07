/* The director runtime: the scripted feed from @crewhub/demo, the AI-presence settings and the plan log. It watches the
   world through the same runtime every view uses, sends each new model to the feed and plays the accepted intents
   through the intent player. No model call, no network; the settings only bound the script. */
import { useEffect, useSyncExternalStore } from "react";
import { createDirectorFeed, DEMO_SEED, type FeedUsage, type PlanRecord, type PropTags } from "@crewhub/demo";
import { DEFAULT_PRESENCE, normalizePresence, type AgentKey, type PresenceSettings, type Reachable, type WorldModel } from "@crewhub/world-model";
import { clearIntents, playIntent } from "../world/intentPlayer";
import { VISIT_TAGS } from "../world/movement";
import { NavWorld } from "../world/navigation";
import { buildingPlanNow } from "./buildingPlan";
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

/* Reachability is the navigation world's: the building templates' rooms, props and doors, kept in step with every
   model. A prop tag is reachable in a room when one of its approach cells can be reached from the agent's seat; a
   visit needs a free cell beside the target's seat, a gather a place around the meeting table. The director's own
   copy of the graph holds no walkers, so other agents never make a prop "unreachable". */
const nav = new NavWorld();
let current: WorldModel | null = null;

function roomOf(slug: string, key: AgentKey) {
  return current?.buildings.find((b) => b.slug === slug)?.agents.find((a) => a.key === key && a.presence === "real")?.room ?? null;
}

const reachable: Reachable = (query) => {
  const from = nav.home(query.building, query.agent, roomOf(query.building, query.agent));
  if (!from) return false;
  switch (query.kind) {
    case "prop":
      return nav.reachableSpots(query.building, query.tag, query.room, from).length > 0;
    case "agent":
      return nav.beside(query.building, query.target, roomOf(query.building, query.target)).some((cell) => nav.canReach(from, cell));
    case "room":
      return nav.around(query.building, "gather", query.room).some((cell) => nav.canReach(from, cell));
  }
};

/** The tags the script may choose in a room: visitable props (not desks) with an approach reachable from the lobby. */
const propTags: PropTags = (slug, room) => nav.tags(slug, room).filter((tag) => VISIT_TAGS.includes(tag) && nav.reachableSpots(slug, tag, room).length > 0);

export interface DirectorState {
  settings: PresenceSettings;
  /** Newest first. */
  plans: readonly PlanRecord[];
  usage: FeedUsage;
}

class DirectorRuntime {
  #settings = loadPresence();
  #script = createDirectorFeed({ seed: DEMO_SEED, reachable, propTags, settings: this.#settings });
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
    current = model;
    // Only the director asks; a switched-off director costs no graph work.
    if (this.#settings.directorEnabled) nav.sync(model.buildings, undefined, undefined, buildingPlanNow());
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
