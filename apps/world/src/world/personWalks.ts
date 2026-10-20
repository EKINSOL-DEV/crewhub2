/* The person walk runtime (spec addendum "a person in the world"): the model says who carries which package into
   Done (`Building.visits`); this turns each visit into a figure's walk through the entered building: in by the front
   door, to the package on its rack or desk, pick it up, to the Done rack, put it down, out by the front door. The
   walks share the navigation world with the agents (walks.ts), so a person routes through the same doors and steps
   around the same figures. Pure TypeScript (no Three.js, no DOM); the renderer calls `update` on every new model and
   `tick` once per drawn frame, and draws the person where `persons()` says.

   The model's timing (source time) and this walk's (simulation time) are two clocks: the renderer holds the package
   in the person's hands until they put it down, whatever the model says meanwhile, and shows it on the Done rack as
   soon as they have, even when the model has not landed it yet. One person per building at a time: the next queued
   visit starts when the one before has left. Only the entered building walks (nothing is seen elsewhere); under
   reduced motion nobody walks and the model lands the package at once. */
import type { Location, NavActorSnapshot } from "@crewhub/world-engine";
import type { PersonVisit, WorldModel } from "@crewhub/world-model";
import { FLOOR_RISE } from "./buildingTemplate.ts";
import { isTownRoom, type NavWorld } from "./navigation.ts";

export interface PersonOptions {
  entered: string | null;
  reducedMotion: boolean;
}

/** Where the person is in their visit. */
export type PersonPhase = "to-package" | "to-rack" | "leaving";

/** What the renderer needs per person, in world units. Reused objects: read them, do not keep them. */
export interface PersonWalker {
  /** The visit's id (`PersonVisit.id`); also the navigation actor's id. */
  readonly id: string;
  visit: PersonVisit;
  building: string;
  x: number;
  y: number;
  z: number;
  /** Facing, radians about +y; 0 looks south. */
  heading: number;
  walking: boolean;
  phase: PersonPhase;
  /** The package is in their hands: the renderer draws it at the figure's carry anchor. */
  holding: boolean;
  /** They have put the package on the Done rack: the renderer draws it at its new slot from now on. */
  delivered: boolean;
}

interface PersonState {
  walker: PersonWalker;
  /** Seconds left at the current stop (the pickup, the drop); null while walking. */
  dwell: number | null;
}

/** How long a person stands at the package and at the rack, simulation seconds. */
export const PERSON_DWELL_S = 0.8;
/** People step around agents, not the other way round; the postman still has right of way. */
export const PERSON_PRIORITY = 5;

export class PersonWalks {
  readonly nav: NavWorld;
  #options: PersonOptions = { entered: null, reducedMotion: false };
  #model: WorldModel | null = null;
  /** The one person per building, by building slug. */
  #active = new Map<string, PersonState>();
  /** Visit ids already walked (or walking): a visit is walked once. */
  #started = new Set<string>();
  #snapshots = -1;
  /** True while a person walks or stands at a stop. */
  moving = false;
  #a = { x: 0, z: 0 };
  #b = { x: 0, z: 0 };

  constructor(nav: NavWorld) {
    this.nav = nav;
  }

  /** A new world model (or new options): starts, ends and aborts visits. Call after the navigation world was synced. */
  update(model: WorldModel, options: PersonOptions): void {
    const before = this.#options;
    this.#options = options;
    this.#model = model;
    if (this.#snapshots !== -1 && model.snapshots !== this.#snapshots) {
      // A seek or a new loop: whoever was in a building is gone, and the visits start over.
      this.#clear();
      this.#started.clear();
    }
    this.#snapshots = model.snapshots;
    if (options.reducedMotion) this.#clear();
    else if (options.entered !== before.entered) for (const slug of [...this.#active.keys()]) if (slug !== options.entered) this.#remove(slug);
    for (const [slug, state] of this.#active) {
      const told = model.buildings.find((b) => b.slug === slug)?.visits.some((v) => v.id === state.walker.id) ?? false;
      // A visit the model no longer tells (the package moved again) before the pickup: the person leaves empty-handed.
      // Once the package is in their hands they finish the carry: the model has landed it on the Done rack anyway.
      if (!told && state.walker.phase === "to-package") this.#leave(slug, state);
    }
    this.#start();
    if (this.#started.size > 2000) this.#started.clear();
  }

  /** Every person in the world right now. */
  persons(): IterableIterator<PersonWalker> {
    return [...this.#active.values()].map((s) => s.walker)[Symbol.iterator]();
  }
  /** The person in one building, if any. */
  person(slug: string): PersonWalker | undefined {
    return this.#active.get(slug)?.walker;
  }

  /** Advances the people by `seconds` of simulation time (the shared simulation itself is ticked by the agents' walks). */
  tick(seconds: number): void {
    const sim = this.nav.sim;
    let moving = false;
    for (const [slug, state] of [...this.#active]) {
      const w = state.walker;
      const actor = sim.actor(w.id);
      if (!actor) {
        this.#active.delete(slug);
        continue;
      }
      this.#place(w, actor);
      const settled = actor.status === "arrived" || actor.status === "unreachable" || actor.status === "idle";
      if (!settled) {
        moving = true;
        continue;
      }
      if (w.phase === "leaving") {
        sim.removeActor(w.id);
        this.#active.delete(slug);
        continue;
      }
      moving = true;
      state.dwell = (state.dwell ?? PERSON_DWELL_S) - seconds;
      if (state.dwell > 0) continue;
      state.dwell = null;
      if (w.phase === "to-package") {
        w.holding = true;
        w.phase = "to-rack";
        this.#aim(w, this.#rackSpot(slug));
      } else {
        w.holding = false;
        w.delivered = true;
        this.#leave(slug, state);
      }
    }
    this.moving = moving;
    // The next person comes in once the building is free.
    if (!moving) this.#start();
  }

  /* ── Starting and ending visits ────────────────────────────────────────── */

  #start(): void {
    const { entered, reducedMotion } = this.#options;
    const model = this.#model;
    if (!entered || reducedMotion || !model || this.#active.has(entered)) return;
    const building = model.buildings.find((b) => b.slug === entered);
    if (!building || building.archived) return;
    const next = building.visits.find((v) => v.phase !== "landed" && !this.#started.has(v.id));
    if (!next) return;
    const front = this.nav.front(entered);
    if (!front) return;
    this.#started.add(next.id);
    const sim = this.nav.sim;
    if (sim.actor(next.id)) sim.removeActor(next.id);
    sim.addActor({ id: next.id, priority: PERSON_PRIORITY, location: front });
    const walker: PersonWalker = { id: next.id, visit: next, building: entered, x: 0, y: 0, z: 0, heading: 0, walking: false, phase: "to-package", holding: false, delivered: false };
    const state: PersonState = { walker, dwell: null };
    this.#active.set(entered, state);
    this.#aim(walker, this.#packageSpot(entered, next));
    const actor = sim.actor(next.id);
    if (actor) this.#place(walker, actor);
  }

  #leave(slug: string, state: PersonState): void {
    const w = state.walker;
    w.holding = false;
    w.phase = "leaving";
    state.dwell = null;
    this.#aim(w, this.nav.front(slug));
  }

  #remove(slug: string): void {
    const state = this.#active.get(slug);
    if (!state) return;
    this.nav.sim.removeActor(state.walker.id);
    this.#active.delete(slug);
  }

  #clear(): void {
    for (const slug of [...this.#active.keys()]) this.#remove(slug);
  }

  /* ── Places ────────────────────────────────────────────────────────────── */

  /** Where the package stands: beside the desk that holds it, or at the approach of its rack (its pile in the classic building). */
  #packageSpot(slug: string, visit: PersonVisit): Location | null {
    const { room, deskOf } = visit.from;
    if (deskOf) {
      const beside = this.nav.beside(slug, deskOf, room);
      if (beside.length) return beside[0]!;
    }
    // The lead's inbox tray stands on the lead's desk; every status room has a rack or a pile tagged with its kind.
    const tag = room === "lead-office" ? "inbox" : room;
    const spots = this.nav.spots(slug, tag, room);
    return spots[0] ?? this.nav.lobby(slug);
  }

  /** The approach of the Done rack (Dispatch's pile in the classic building). */
  #rackSpot(slug: string): Location | null {
    return this.nav.spots(slug, "dispatch", "dispatch")[0] ?? this.nav.lobby(slug);
  }

  #aim(w: PersonWalker, target: Location | null): void {
    const sim = this.nav.sim;
    if (!sim.actor(w.id)) return;
    // Nowhere to go (a building without the place): the person stands where they are and the visit moves on.
    sim.setDestination(w.id, target ?? sim.actor(w.id)!.location);
  }

  #place(w: PersonWalker, actor: NavActorSnapshot): void {
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
    w.y = this.nav.groundAt(w.x, w.z) + (isTownRoom(actor.location.room) ? 0 : FLOOR_RISE);
    w.walking = actor.next !== null;
  }
}
