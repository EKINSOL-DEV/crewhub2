/* The director runtime: the scripted feed from @crewhub/demo, the AI-presence settings and the plan log. It watches the
   world through the same runtime every view uses, sends each new model to the feed and plays the accepted intents
   through the intent player. No model call, no network; the settings only bound the script.

   The feed runs on whatever model the world shows. In demo mode the demo's switch turns it on; in live mode its own
   opt-in does (`liveDirectorEnabled`, off by default, never implied by the demo's switch): the same script, its plans
   made from the live facts (who is idle in which building), its intents validated as in the demo, acting only on the
   world's own figures through the walk runtime. It never reads or writes crewhub-loops: the intent player and the walks
   are its only outlet, and the text view labels everything it does "scripted".

   A runtime is built from its config (state/runtimes.ts builds the page's one): the world it follows, the storage that
   keeps the AI-presence settings, the intent player, the navigation world and the building plan. */
import { createDirectorFeed, DEMO_SEED, type FeedUsage, type PlanRecord, type PropTags } from "@crewhub/demo";
import { DEFAULT_PRESENCE, effectivePresence, normalizePresence, type AgentKey, type Intent, type PresenceSettings, type Reachable, type WorldModel } from "@crewhub/world-model";
import type { BuildingPlan } from "../world/buildingTemplate.ts";
import { VISIT_TAGS } from "../world/movement.ts";
import type { NavWorld } from "../world/navigation.ts";
import { logPlans } from "./planLog.ts";
import type { WorldRuntime } from "./world.ts";

/** Where the AI-presence settings are kept in this browser. */
export const PRESENCE_KEY = "crewhub.presence.v1";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export interface DirectorState {
  settings: PresenceSettings;
  /** The mode of the last model seen, which decides which switch counts; "demo" before the first model. */
  mode: WorldModel["mode"];
  /** Whether the feed runs now: the switch of the current mode (`effectivePresence`). */
  enabled: boolean;
  /** Newest first. */
  plans: readonly PlanRecord[];
  usage: FeedUsage;
}

/** The navigation world's queries the director asks. */
export type DirectorNav = Pick<NavWorld, "home" | "reachableSpots" | "beside" | "canReach" | "around" | "tags" | "sync">;

export interface DirectorRuntimeConfig {
  /** The world the feed follows. */
  world: Pick<WorldRuntime, "state" | "subscribe">;
  /**
   * Where the settings are kept (`localStorage` in the page). Storage may throw (a private window, blocked site data),
   * or be null: the settings then last for this runtime only.
   */
  storage: () => Storage | null;
  /** The intent player (world/intentPlayer.ts): an accepted intent is played; the kill switch clears them all. */
  intents: { play(intent: Intent, model: WorldModel): void; clear(): void };
  /** Makes the director's own navigation world, the first time the director asks (it costs ~15 ms). */
  nav: () => DirectorNav;
  /** The building template in force now (the graph is synced with it). */
  buildingPlan: () => BuildingPlan;
}

class DirectorRuntime {
  readonly #config: DirectorRuntimeConfig;
  #navWorld: DirectorNav | null = null;
  /** The model the reach is asked about: the last one the director saw. */
  #current: WorldModel | null = null;
  #settings: PresenceSettings;
  #mode: WorldModel["mode"] = "demo";
  #script: ReturnType<typeof createDirectorFeed>;
  #plans: readonly PlanRecord[] = [];
  #state: DirectorState;
  #listeners = new Set<() => void>();
  #started = false;

  constructor(config: DirectorRuntimeConfig) {
    this.#config = config;
    this.#settings = this.#load();
    this.#script = createDirectorFeed({ seed: DEMO_SEED, reachable: this.#reachable, propTags: this.#propTags, settings: effectivePresence(this.#settings, this.#mode) });
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
    const world = this.#config.world;
    world.subscribe(() => this.#onModel(world.state.model));
    this.#onModel(world.state.model);
  }

  update(patch: Partial<PresenceSettings>) {
    this.#settings = normalizePresence({ ...this.#settings, ...patch });
    this.#save();
    this.#apply();
    this.#publish();
  }

  /* The settings in storage: read normalised; nothing stored, unreadable or a storage that throws reads the defaults. */
  #load(): PresenceSettings {
    try {
      const raw = this.#config.storage()?.getItem(PRESENCE_KEY);
      return raw ? normalizePresence(JSON.parse(raw)) : DEFAULT_PRESENCE;
    } catch {
      return DEFAULT_PRESENCE;
    }
  }

  #save() {
    try {
      this.#config.storage()?.setItem(PRESENCE_KEY, JSON.stringify(this.#settings));
    } catch {
      // The settings then last for this page only.
    }
  }

  /*
   * Reachability is the navigation world's: the building templates' rooms, props and doors, kept in step with every
   * model. A prop tag is reachable in a room when one of its approach cells can be reached from the agent's seat; a
   * visit needs a free cell beside the target's seat, a gather a place around the meeting table. The director's own
   * copy of the graph holds no walkers, so other agents never make a prop "unreachable". It is built the first time the
   * director asks (the first sync with the director on, or a query): a `NavWorld` lays out the standalone town room in
   * its constructor, ~15 ms, which at start would stand on the road to the first frame for a director that is off by
   * default.
   */
  #nav(): DirectorNav {
    return (this.#navWorld ??= this.#config.nav());
  }

  #roomOf(slug: string, key: AgentKey) {
    return this.#current?.buildings.find((b) => b.slug === slug)?.agents.find((a) => a.key === key && a.presence === "real")?.room ?? null;
  }

  #reachable: Reachable = (query) => {
    const nav = this.#nav();
    const from = nav.home(query.building, query.agent, this.#roomOf(query.building, query.agent));
    if (!from) return false;
    switch (query.kind) {
      case "prop":
        return nav.reachableSpots(query.building, query.tag, query.room, from).length > 0;
      case "agent":
        return nav.beside(query.building, query.target, this.#roomOf(query.building, query.target)).some((cell) => nav.canReach(from, cell));
      case "room":
        return nav.around(query.building, "gather", query.room).some((cell) => nav.canReach(from, cell));
    }
  };

  /** The tags the script may choose in a room: visitable props (not desks) with an approach reachable from the lobby. */
  #propTags: PropTags = (slug, room) => {
    const nav = this.#nav();
    return nav.tags(slug, room).filter((tag) => VISIT_TAGS.includes(tag) && nav.reachableSpots(slug, tag, room).length > 0);
  };

  /** The feed's switch is the current mode's; off, the kill switch works at once: no more plans, no intent keeps steering anyone. */
  #apply() {
    this.#script.setSettings(effectivePresence(this.#settings, this.#mode));
    if (!this.#enabled()) this.#config.intents.clear();
  }

  #enabled(): boolean {
    return effectivePresence(this.#settings, this.#mode).directorEnabled;
  }

  #onModel(model: WorldModel) {
    this.#current = model;
    if (model.mode !== this.#mode) {
      // The source is decided before mount, so this is the first model; still, a mode is never trusted to stay.
      this.#mode = model.mode;
      this.#apply();
    }
    // Only the director asks; a switched-off director costs no graph work.
    if (this.#enabled()) this.#nav().sync(model.buildings, undefined, undefined, this.#config.buildingPlan());
    const made = this.#script.step(model);
    for (const plan of made) for (const intent of plan.accepted) this.#config.intents.play(intent, model);
    this.#plans = logPlans(this.#plans, made);
    // The usage counter also moves when nothing was planned (a cap lifting), so publish on every model.
    this.#publish();
  }

  #snapshot(): DirectorState {
    return { settings: this.#settings, mode: this.#mode, enabled: this.#enabled(), plans: this.#plans, usage: this.#script.usage() };
  }

  /** Publishes only what is new: other settings, mode, switch or plans (by identity), or another usage (by value). */
  #publish() {
    const next = this.#snapshot();
    const prev = this.#state;
    if (prev.settings === next.settings && prev.mode === next.mode && prev.enabled === next.enabled && prev.plans === next.plans && JSON.stringify(prev.usage) === JSON.stringify(next.usage)) return;
    this.#state = next;
    for (const listener of this.#listeners) listener();
  }
}

export type { DirectorRuntime };

export function createDirectorRuntime(config: DirectorRuntimeConfig): DirectorRuntime {
  return new DirectorRuntime(config);
}
