/* The walk runtime: turns movement intents (movement.ts) into NavSimulation destinations, runs errands and the
   postman's rounds, sets the detail levels and hands the renderer one interpolated position per walker. Pure
   TypeScript (no Three.js, no DOM); the renderer calls `update` on every new model and `tick` once per drawn frame.

   Detail levels: only the entered building's rooms are "full"; every other building is "offscreen", so its agents
   jump instead of routing. The town stays "full", so the postman and cross-building walks are visible. Under reduced
   motion everything is offscreen: every move is a jump. */
import type { Location } from "@crewhub/world-engine";
import type { AgentKey, Intent, RoomKind, WorldModel } from "@crewhub/world-model";
import { directorErrands, planIdle, planMovement, type Ambient, type ErrandReason, type Leg, type MovementIntent, type Place } from "./movement.ts";
import { FLOOR_RISE } from "./buildingTemplate.ts";
import type { TownPlan } from "./townPlan.ts";
import type { Bounds } from "./townLayout.ts";
import { isTownRoom, NavWorld, POST_OFFICE_CELL, POSTMAN_PRIORITY, TOWN_HALL_CELL, TOWN_ROOM } from "./navigation.ts";

export interface WalkOptions {
  entered: string | null;
  reducedMotion: boolean;
  ambient: Ambient;
  /** Where the buildings stand (townPlan.ts); without one, each building stands where the allocation would put it. */
  plan?: TownPlan;
  /** The paving walkers keep to, in world units; without it, the plan's streets, roads, civic paths and garden paths. */
  walkways?: readonly Bounds[];
}

/** What the renderer needs per walker, in world units. Reused objects: read them, do not keep them. */
export interface Walker {
  readonly key: string;
  x: number;
  /** Height of the ground under it: a lawn or the street. */
  y: number;
  z: number;
  /** Facing, radians about +y; 0 looks south (towards the home camera). */
  heading: number;
  /** Moving along a segment right now (the soft robots bob and lean). */
  walking: boolean;
  /** The building whose robot this is (its real location), or null for the postman. */
  building: string | null;
  /** On the way out of the snapshot: the robot stays until it is through the door. */
  leaving: boolean;
  /** Letters the postman carries. */
  carrying: number;
  /** At its own desk and not walking: the renderer uses the seat pose. */
  seated: boolean;
  /**
   * Standing at a piece of furniture on an errand (the meeting table, the planning table, the review pile): its
   * definition, its footprint's centre in building cells and its model's turn. The renderer turns the figure to it.
   */
  work: WorkSpot | null;
}

export type WorkSpot = NonNullable<ReturnType<NavWorld["standsAt"]>>;

interface Errand {
  reason: ErrandReason;
  legs: Leg[];
  index: number;
  /** Seconds left at the current stop; null while walking there. */
  dwell: number | null;
  /** The furniture stood at during the stop. */
  at: WorkSpot | null;
}
interface AgentState {
  key: AgentKey;
  building: string;
  room: RoomKind | null;
  errand: Errand | null;
  leaving: boolean;
}
interface Stop {
  deliveryId: string;
  toBuilding: string | null;
}
interface Postman {
  key: AgentKey;
  queue: Stop[];
  round: Stop[] | null;
  stop: number;
  dwell: number | null;
}

const POSTMAN_DWELL_S = 1.2;
const TOWN_HOME: Location = { room: TOWN_ROOM, cell: POST_OFFICE_CELL };

export class Walks {
  readonly nav = new NavWorld();
  #model: WorldModel | null = null;
  #options: WalkOptions = { entered: null, reducedMotion: false, ambient: "on" };
  #detailKey = "";
  #agents = new Map<AgentKey, AgentState>();
  #postman: Postman | null = null;
  #walkers = new Map<string, Walker>();
  #idleDone = new Set<string>();
  #idleCheck = 0;
  /** Milliseconds the last engine tick took (the dev overlay shows it). */
  tickMs = 0;
  /** True while any walker moves or waits on its way. */
  moving = false;

  /** A new world model (or new options): applies the intents of the change and the detail levels. */
  update(model: WorldModel, options: WalkOptions): void {
    const optionsChanged = options.entered !== this.#options.entered || options.reducedMotion !== this.#options.reducedMotion;
    this.#options = options;
    const sync = this.nav.sync(model.buildings, options.plan, options.walkways);
    for (const slug of sync.removed)
      for (const [key, state] of this.#agents) if (state.building === slug && !this.nav.sim.actor(key)) this.#agents.delete(key);
    this.#applyDetail(optionsChanged);
    const intents = planMovement(this.#model, model, options);
    this.#model = model;
    for (const intent of intents) this.#apply(intent);
    // Destinations into a rebuilt building point at cells that may have moved: aim again.
    for (const slug of sync.rebuilt)
      for (const state of this.#agents.values()) if (state.building === slug) this.#aim(state);
    this.#syncAgents(model);
    this.#syncPostman(model);
    this.#refreshWalkers();
  }

  walker(key: string): Walker | undefined {
    return this.#walkers.get(key);
  }
  walkers(): IterableIterator<Walker> {
    return this.#walkers.values();
  }
  /** The postman's walker, when the town has one. */
  postman(): Walker | undefined {
    return this.#postman ? this.#walkers.get(this.#postman.key) : undefined;
  }

  /** Advances the simulation by `seconds` (simulation time) at source time `now` (ms, for idle buckets). */
  tick(seconds: number, now: number): void {
    const started = globalThis.performance.now();
    if (seconds > 0) this.nav.sim.tick(seconds);
    this.#idle(now);
    for (const state of [...this.#agents.values()]) this.#advance(state, seconds);
    this.#advancePostman(seconds);
    this.#refreshWalkers();
    this.tickMs = globalThis.performance.now() - started;
  }

  /**
   * An accepted director intent: its agents walk only in the entered building, never under reduced motion (the
   * director's log still records it). A director walk replaces an idle errand but never a hand-over; any later
   * fact-driven move (desk, hand-over, switch, leave) replaces it. Returns how many agents set off.
   */
  direct(intent: Intent): number {
    const { entered, reducedMotion } = this.#options;
    if (reducedMotion || !entered) return 0;
    let started = 0;
    for (const errand of directorErrands(intent, entered)) {
      const state = this.#agents.get(errand.agent);
      if (!state || state.building !== entered || state.leaving || state.errand?.reason === "handover") continue;
      if (!this.nav.sim.actor(state.key)) continue;
      state.errand = { reason: "director", legs: errand.legs, index: 0, dwell: null, at: null };
      this.#aim(state);
      if (state.errand) started++;
    }
    if (started) this.#refreshWalkers();
    return started;
  }

  /** The director's kill switch: every director walk ends and its agent goes back to its desk. */
  endDirected(): void {
    for (const state of this.#agents.values())
      if (state.errand?.reason === "director") {
        state.errand = null;
        this.#aim(state);
      }
  }

  /** The current errand of an agent, if any (the text and tests read it). */
  errand(key: AgentKey): { reason: ErrandReason; leg: number } | null {
    const errand = this.#agents.get(key)?.errand;
    return errand ? { reason: errand.reason, leg: errand.index } : null;
  }

  /* ── Intents ──────────────────────────────────────────────────────────── */

  #apply(intent: MovementIntent): void {
    const sim = this.nav.sim;
    switch (intent.type) {
      case "spawn": {
        const state = this.#state(intent.agent, intent.building);
        state.errand = null;
        state.leaving = false;
        const home = this.#home(state);
        if (home) this.#put(state.key, home);
        this.#aim(state);
        return;
      }
      case "enter": {
        const state = this.#state(intent.agent, intent.building);
        state.errand = null;
        state.leaving = false;
        const start = intent.walk ? this.nav.front(intent.building) : this.#home(state);
        if (start) this.#put(state.key, start);
        this.#aim(state);
        return;
      }
      case "leave": {
        const state = this.#agents.get(intent.agent);
        if (!state) return;
        const front = this.nav.front(intent.building);
        if (!intent.walk || !front || !sim.actor(state.key)) {
          sim.removeActor(state.key);
          this.#agents.delete(state.key);
          return;
        }
        state.errand = null;
        state.leaving = true;
        sim.setDestination(state.key, front);
        return;
      }
      case "switch": {
        const state = this.#state(intent.agent, intent.to);
        state.errand = null;
        state.leaving = false;
        // From the old building's door along the town path; the old avatar stays behind as a proxy. Across districts
        // it takes the bus (not drawn): it steps off at the gate of the new district and walks on from there.
        const start = intent.walk ? (this.nav.arrival(intent.to, intent.from) ?? this.nav.front(intent.from)) : this.#home(state);
        if (start) this.#put(state.key, start);
        this.#aim(state);
        return;
      }
      case "desk": {
        const state = this.#agents.get(intent.agent);
        if (!state || state.leaving) return;
        state.errand = null;
        this.#aim(state);
        return;
      }
      case "errand": {
        const state = this.#agents.get(intent.agent);
        if (!state || state.leaving || state.building !== intent.building) return;
        state.errand = { reason: intent.reason, legs: intent.legs, index: 0, dwell: null, at: null };
        this.#aim(state);
        return;
      }
      case "deliver":
        this.#postman?.queue.push({ deliveryId: intent.deliveryId, toBuilding: intent.toBuilding });
        return;
    }
  }

  #state(key: AgentKey, building: string): AgentState {
    let state = this.#agents.get(key);
    if (!state) {
      state = { key, building, room: null, errand: null, leaving: false };
      this.#agents.set(key, state);
    }
    state.building = building;
    const placement = this.#model?.buildings.find((b) => b.slug === building)?.agents.find((a) => a.key === key);
    state.room = placement?.room ?? state.room;
    return state;
  }

  /** Adds the actor at `location`, or moves it there at once. */
  #put(id: string, location: Location, priority = 0): void {
    const sim = this.nav.sim;
    if (sim.actor(id)) sim.place(id, location);
    else sim.addActor({ id, priority, location });
  }

  #home(state: AgentState): Location | null {
    return this.nav.home(state.building, state.key, state.room);
  }

  /** Sets the destination the agent's state asks for: the current errand leg, else its desk. */
  #aim(state: AgentState): void {
    const sim = this.nav.sim;
    if (!sim.actor(state.key)) {
      const home = this.#home(state);
      if (!home) return;
      sim.addActor({ id: state.key, location: home });
    }
    if (state.leaving) {
      const front = this.nav.front(state.building);
      if (front) sim.setDestination(state.key, front);
      return;
    }
    const leg = state.errand?.legs[state.errand.index];
    const spot = leg ? this.#resolve(state, leg.place) : null;
    // A place that does not exist right now (no meeting room, nobody to visit): the errand is dropped.
    if (leg && !spot) state.errand = null;
    const target = spot ?? this.#home(state);
    if (!target) return;
    const result = sim.setDestination(state.key, target);
    if (!result.ok && state.errand) {
      // A spot that cannot be reached right now (taken by furniture): skip the errand.
      state.errand = null;
      const home = this.#home(state);
      if (home) sim.setDestination(state.key, home);
    }
  }

  #resolve(state: AgentState, place: Place): Location | null {
    if (place.kind === "desk") return this.#home(state);
    if (place.kind === "outside") return this.nav.front(state.building);
    if (place.kind === "gather") {
      const around = this.nav.around(state.building, "gather", "meeting");
      return around.length ? around[place.index % around.length]! : null;
    }
    const spots =
      place.kind === "beside"
        ? this.nav.beside(state.building, place.agent, this.#agents.get(place.agent)?.room ?? null)
        : this.nav.spots(state.building, place.tag, place.room ?? undefined);
    if (!spots.length) return null;
    // Spread agents over the spots of a tag deterministically.
    let h = 0;
    for (let i = 0; i < state.key.length; i++) h = (h * 31 + state.key.charCodeAt(i)) >>> 0;
    return spots[h % spots.length]!;
  }

  /** Agents of the model that the intents did not place yet (first sync after a rebuild), and gone ones. */
  #syncAgents(model: WorldModel): void {
    const real = new Set<AgentKey>();
    for (const b of model.buildings) {
      if (b.archived || !this.nav.entry(b.slug)) continue;
      for (const agent of b.agents) {
        if (agent.presence !== "real") continue;
        real.add(agent.key);
        const state = this.#agents.get(agent.key);
        if (!state) {
          this.#apply({ type: "spawn", agent: agent.key, building: b.slug });
        } else if (state.room !== agent.room && state.building === b.slug) {
          state.room = agent.room;
          if (!state.errand) this.#aim(state);
        }
      }
    }
    for (const [key, state] of this.#agents)
      if (!real.has(key) && !state.leaving) {
        this.nav.sim.removeActor(key);
        this.#agents.delete(key);
      }
  }

  /* ── Errands, departures, idle variety ────────────────────────────────── */

  #advance(state: AgentState, seconds: number): void {
    const actor = this.nav.sim.actor(state.key);
    if (!actor) {
      if (state.leaving) this.#agents.delete(state.key);
      return;
    }
    const settled = actor.status === "arrived" || actor.status === "unreachable" || actor.status === "idle";
    if (state.leaving) {
      if (settled) {
        this.nav.sim.removeActor(state.key);
        this.#agents.delete(state.key);
      }
      return;
    }
    const errand = state.errand;
    if (!errand || !settled) return;
    if (errand.dwell === null) {
      const place = errand.legs[errand.index]?.place;
      errand.dwell = (errand.legs[errand.index]?.dwellMs ?? 0) / 1000;
      const tag = place?.kind === "gather" ? "gather" : place?.kind === "spot" ? place.tag : null;
      errand.at = tag && actor.status === "arrived" ? this.nav.standsAt(actor.location, tag) : null;
    }
    errand.dwell -= seconds;
    if (errand.dwell > 0) return;
    errand.index++;
    errand.dwell = null;
    errand.at = null;
    if (errand.index >= errand.legs.length) state.errand = null;
    this.#aim(state);
  }

  #idle(now: number): void {
    const model = this.#model;
    // Once a second of source time; a seek back in time starts the clock again.
    if (!model || (now < this.#idleCheck && this.#idleCheck - now <= 1000)) return;
    this.#idleCheck = now + 1000;
    for (const errand of planIdle(model, now, this.#options, this.#idleDone)) {
      this.#idleDone.add(errand.id);
      const state = this.#agents.get(errand.agent);
      if (!state || state.errand || state.leaving) continue;
      const actor = this.nav.sim.actor(errand.agent);
      if (!actor || actor.status !== "arrived") continue;
      this.#apply(errand);
    }
    if (this.#idleDone.size > 2000) this.#idleDone.clear();
  }

  /* ── The postman ──────────────────────────────────────────────────────── */

  #syncPostman(model: WorldModel): void {
    const key = model.postOffice[0]?.key ?? null;
    if (this.#postman && this.#postman.key !== key) {
      this.nav.sim.removeActor(this.#postman.key);
      this.#walkers.delete(this.#postman.key);
      this.#postman = null;
    }
    if (!key) return;
    if (!this.#postman) {
      this.#postman = { key, queue: [], round: null, stop: 0, dwell: null };
      this.#put(key, TOWN_HOME, POSTMAN_PRIORITY);
      this.nav.sim.setDestination(key, TOWN_HOME);
    }
    // A new snapshot starts the round over: the letters it carried are history now.
    if (this.#lastSnapshots !== -1 && model.snapshots !== this.#lastSnapshots) {
      this.#postman.queue = [];
      this.#postman.round = null;
      this.#put(key, TOWN_HOME, POSTMAN_PRIORITY);
      this.nav.sim.setDestination(key, TOWN_HOME);
    }
    this.#lastSnapshots = model.snapshots;
  }
  #lastSnapshots = -1;

  #advancePostman(seconds: number): void {
    const p = this.#postman;
    if (!p) return;
    const actor = this.nav.sim.actor(p.key);
    if (!actor) return;
    const settled = actor.status === "arrived" || actor.status === "unreachable" || actor.status === "idle";
    if (!p.round) {
      if (!p.queue.length || !settled) return;
      // Several deliveries share one round, in plot order.
      const order = this.nav.slugs();
      p.round = p.queue.splice(0).sort((a, b) => rank(order, a.toBuilding) - rank(order, b.toBuilding));
      p.stop = 0;
      p.dwell = null;
      this.#aimPostman(p);
      return;
    }
    if (!settled) return;
    if (p.stop >= p.round.length) {
      p.round = null;
      return;
    }
    if (p.dwell === null) p.dwell = POSTMAN_DWELL_S;
    p.dwell -= seconds;
    if (p.dwell > 0) return;
    p.stop++;
    p.dwell = null;
    this.#aimPostman(p);
  }

  #aimPostman(p: Postman): void {
    const stop = p.round?.[p.stop];
    let target: Location = TOWN_HOME;
    if (stop) {
      const slug = stop.toBuilding;
      if (slug && this.nav.entry(slug)) {
        // Inside the shown building the letter goes to the lobby mailbox; elsewhere to the front door.
        const mailbox = slug === this.#options.entered && !this.#options.reducedMotion ? this.nav.spots(slug, "mail", "lobby")[0] : undefined;
        target = mailbox ?? this.nav.front(slug) ?? TOWN_HOME;
      } else target = { room: TOWN_ROOM, cell: TOWN_HALL_CELL };
    }
    this.nav.sim.setDestination(p.key, target);
  }

  /* ── Detail levels and the renderer's view ────────────────────────────── */

  #applyDetail(force: boolean): void {
    const ids = this.nav.graph.roomIds();
    const { entered, reducedMotion } = this.#options;
    const key = `${reducedMotion}|${entered}|${ids.join()}`;
    if (!force && key === this.#detailKey) return;
    this.#detailKey = key;
    const sim = this.nav.sim;
    if (reducedMotion) {
      sim.setDetail(ids, "offscreen");
      return;
    }
    const full = new Set([...ids.filter(isTownRoom), ...(entered ? this.nav.rooms(entered) : [])]);
    sim.setDetail(ids.filter((id) => !full.has(id)), "offscreen");
    sim.setDetail([...full], "full");
  }

  #a = { x: 0, z: 0 };
  #b = { x: 0, z: 0 };
  #refreshWalkers(): void {
    const seen = new Set<string>();
    let moving = false;
    const postmanKey = this.#postman?.key ?? null;
    for (const actor of this.nav.sim.snapshot().actors) {
      const state = this.#agents.get(actor.id);
      const postman = actor.id === postmanKey;
      if (!state && !postman) continue;
      seen.add(actor.id);
      let w = this.#walkers.get(actor.id);
      if (!w) {
        w = { key: actor.id, x: 0, y: 0, z: 0, heading: 0, walking: false, building: null, leaving: false, carrying: 0, seated: false, work: null };
        this.#walkers.set(actor.id, w);
      }
      const a = this.nav.toWorld(actor.location, this.#a);
      if (actor.next) {
        const b = this.nav.toWorld(actor.next, this.#b);
        const t = actor.progress;
        w.x = a.x + (b.x - a.x) * t;
        w.z = a.z + (b.z - a.z) * t;
        if (Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > 1e-6) w.heading = Math.atan2(b.x - a.x, b.z - a.z);
      } else {
        w.x = a.x;
        w.z = a.z;
      }
      // Inside a building the floor stands on the slab, above the lawn.
      w.y = this.nav.groundAt(w.x, w.z) + (isTownRoom(actor.location.room) ? 0 : FLOOR_RISE);
      w.walking = actor.next !== null;
      if (actor.status === "moving" || actor.status === "waiting") moving = true;
      w.building = state?.building ?? null;
      w.leaving = state?.leaving ?? false;
      w.carrying = postman && this.#postman?.round ? Math.max(0, this.#postman.round.length - this.#postman.stop) : 0;
      const home = state && !state.errand && !state.leaving ? this.#home(state) : null;
      w.seated =
        !w.walking &&
        !!home &&
        actor.location.room === home.room &&
        actor.location.cell.x === home.cell.x &&
        actor.location.cell.z === home.cell.z;
      if (w.seated) w.heading = 0;
      w.work = !w.walking && state?.errand?.dwell != null ? state.errand.at : null;
    }
    for (const key of [...this.#walkers.keys()]) if (!seen.has(key)) this.#walkers.delete(key);
    this.moving = moving || !!this.#postman?.round || [...this.#agents.values()].some((s) => s.errand !== null);
  }
}

function rank(order: string[], slug: string | null): number {
  const i = slug ? order.indexOf(slug) : -1;
  return i < 0 ? order.length : i;
}
