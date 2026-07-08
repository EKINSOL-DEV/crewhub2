// Character state machine + sim world (M1 T6) — pure TS, deterministic, no
// three.js, no clock, no RNG besides the seeded stream below. Turns
// Character[] snapshots into walking, sitting, waving robots the renderer
// (T7) can read straight off `Sim.world` every frame.
import type { SessionStatus } from "@/ipc/bindings";
import type { Motion } from "@/game/characters/pose";
import { HQ_RECT, type Building, type Desk } from "@/game/world/campus/buildings";
import type { Character } from "./characters";
import { findPath, type NavGrid } from "./grid";
import { hashCode, mulberry32 } from "./rand";

export const WALK_SPEED = 2.2; // units/s

/** Seconds per "tick" in SimCommand's holdTicks/durTicks (M7 T2): 100 ticks
 *  = 10s hold, 30 ticks = 3s emote. Ticks are just a friendlier unit for the
 *  command's caller — the sim itself only ever thinks in seconds. */
const TICK_SECONDS = 0.1;
/** How close (world units) an emote-resuming bot must be to its held desk's
 *  seat point to count as "never left" (M7 T2 fix round 1) — well under a
 *  full grid cell, generous slack above float noise from an untouched
 *  position. See tickOverride's emote-resume branch. */
const SEATED_RESUME_EPSILON = 0.3;

/**
 * Plaza ring outside HQ's walls (M6 T2; HQ regrown M9): HQ's footprint is
 * 18x14 (halves 9 and 7), so the farthest corner sits at sqrt(9^2+7^2) ≈
 * 11.4 — 12 clears it on every approach angle (see the door-lane math below
 * the ring helpers). WaitingForPermission and Working-overflow both wait
 * here now, visible from outside instead of hidden inside HQ's walls.
 */
const OUTSIDE_RING_RADIUS = 12;
/** Half-width of the "in front of a door" lane a ring point must clear (M6 T2). */
const DOOR_LANE_HALF_WIDTH = 1.5;
/** Angle nudge (rad) applied, repeatedly, to rotate a ring point off a door lane. */
const DOOR_LANE_ROTATE_STEP = 0.35;
/** Each door lane, seen from the ring, spans 2*asin(DOOR_LANE_HALF_WIDTH /
 *  OUTSIDE_RING_RADIUS) ≈ 2*asin(1.5/12) ≈ 14.4° of arc — comfortably under
 *  one DOOR_LANE_ROTATE_STEP (0.35rad ≈ 20.05°), so a single nudge always
 *  clears a lane it just entered; this bound is never actually exhausted. */
const DOOR_LANE_MAX_TRIES = 20;
const SESSION_WANDER_RADIUS = 12; // around the bot's current position
/** Crew rest inside HQ (M6 T2): a small disc around the origin, comfortably
 *  inside HQ's walls (halves 9 and 7) — "hanging out at headquarters". */
const CREW_WANDER_RADIUS = 3.5;
const DESK_SEAT_OFFSET = 0.8;
const WANDER_PAUSE_MIN = 2;
const WANDER_PAUSE_RANGE = 2; // pause is WANDER_PAUSE_MIN..+RANGE seconds
const THINK_FLIP_SECONDS = 4;
const WANDER_TARGET_TRIES = 8;
/** Wander targets this close to (or inside) a building rect are rejected (M5 T2). */
const WANDER_BUILDING_MARGIN = 1;

export interface SimBot {
  key: string;
  x: number;
  z: number;
  /** Radians; direction of travel while walking, or the seated desk's rot. */
  facing: number;
  motion: Motion;
  deskId: string | null;
  path: { x: number; z: number }[];
  /** Per-bot sim seconds — starts at 0, += dt every tick. Never wall-clock. */
  age: number;
}

export interface SimWorld {
  bots: Map<string, SimBot>;
  /** deskId -> owning bot key. */
  deskOwners: Map<string, string>;
}

/**
 * "Say the word" commands (M7 T2) — external inputs to a bot, same standing
 * as sync(): deterministic, no rng. `goto` overrides the bot's current
 * behavior to walk somewhere and hold; `emote` plays a motion in place. A
 * second command (of either kind) always replaces whichever is active.
 */
export type SimCommand =
  | { kind: "goto"; x: number; z: number; holdTicks?: number } // default 100 (10s)
  | { kind: "emote"; emote: "dance" | "spin" | "cheer" | "wave"; durTicks?: number }; // default 30 (3s)

export interface Sim {
  world: SimWorld;
  sync(characters: Character[]): void;
  tick(dt: number): void;
  updateWorld(grid: NavGrid, buildings: Building[]): void;
  command(key: string, cmd: SimCommand): void;
}

/** The emote half of SimCommand, pulled out for reuse below. */
type Emote = Extract<SimCommand, { kind: "emote" }>["emote"];

/**
 * A goto/emote command in flight for one bot (M7 T2). `null` on BotMeta means
 * "no override — follow normal status behavior", the only state before this
 * milestone. See `tickOverride` for the per-tick state machine both variants
 * run through.
 */
type Override =
  | { kind: "goto"; phase: "walk" | "hold"; holdSeconds: number; holdUntil: number }
  | { kind: "emote"; emote: Emote; startAge: number; endAge: number; startFacing: number };

/** Bookkeeping the renderer never sees — kept off SimBot to keep that type a clean wire contract. */
interface BotMeta {
  status: SessionStatus;
  agentId: string | null;
  /** Idle wander: bot.age at which the next leg (or first retry) may start. */
  pauseUntil: number;
  /** Desk-claim eligibility key (M5 T2), normalized to null; see `isMatched`. */
  groupKey: string | null;
  /** Active Sim.command() override (M7 T2), or null when none is running. */
  override: Override | null;
}

/** Local alias — same tiny seeded PRNG as campus/layout.ts; the sim must replay identically forever. */
const rng = mulberry32;

/** Local alias, same hash characters.ts uses — places a bot deterministically on a ring. */
const hashKey = hashCode;

/** A point on a ring around the plaza (world origin), angle hashed from the bot's key. */
function ringPoint(key: string, radius: number): { x: number; z: number } {
  const angle = (hashKey(key) % 360) * (Math.PI / 180);
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
}

/** True when (x, z) sits in the ±1.5u lane directly in front of a door: HQ's
 *  north/south doors sit on the z axis (x≈0), its east/west doors on the x
 *  axis (z≈0) — see `hqBuilding()`. Exported so sim.test.ts can verify the
 *  ring geometry directly, without the extra noise of grid-snapping a real
 *  pathfound position onto the nav grid's 1-unit cells. */
export function inDoorLane(x: number, z: number): boolean {
  return Math.abs(x) <= DOOR_LANE_HALF_WIDTH || Math.abs(z) <= DOOR_LANE_HALF_WIDTH;
}

/**
 * A point on the plaza ring outside HQ's walls (M6 T2), angle hashed from the
 * bot's key like `ringPoint` — but rotated off any door's approach lane in
 * fixed, deterministic steps, so a waiting/overflowing bot never plants
 * itself in (or hides behind) a doorway. The lane check depends only on
 * fixed world coordinates (HQ's doors never move), not on which buildings
 * happen to be passed in, so this is safe to use verbatim for both
 * WaitingForPermission and Working-overflow. Exported for the same direct-
 * geometry testing reason as `inDoorLane`.
 */
export function outsideRingPoint(key: string): { x: number; z: number } {
  const base = ringPoint(key, OUTSIDE_RING_RADIUS);
  if (!inDoorLane(base.x, base.z)) return base;
  let angle = (hashKey(key) % 360) * (Math.PI / 180);
  for (let i = 0; i < DOOR_LANE_MAX_TRIES; i++) {
    angle += DOOR_LANE_ROTATE_STEP;
    const point = { x: Math.sin(angle) * OUTSIDE_RING_RADIUS, z: Math.cos(angle) * OUTSIDE_RING_RADIUS };
    if (!inDoorLane(point.x, point.z)) return point;
  }
  return base; // unreachable given the lane geometry above, but never strand a bot
}

/**
 * New bots appear inside HQ (M6 T2), jittered clear of the 2-unit wall/props
 * band so they never spawn inside a wall. Nothing paths them out on purpose —
 * their first replan (in `sync`) just asks the nav grid for a route to
 * wherever their status sends them, and the grid's only way out of HQ is
 * through one of its four doors.
 */
function spawnPoint(rand: () => number): { x: number; z: number } {
  const hw = HQ_RECT.w / 2 - 2; // 7
  const hd = HQ_RECT.d / 2 - 2; // 5
  return { x: (rand() - 0.5) * 2 * hw, z: (rand() - 0.5) * 2 * hd };
}

/** Seat point + facing for a desk: 0.8 units off-center on the "-facing" side, looking at the desk. */
function deskSeat(desk: Desk): { x: number; z: number; facing: number } {
  return {
    x: desk.x - Math.sin(desk.rot) * DESK_SEAT_OFFSET,
    z: desk.z - Math.cos(desk.rot) * DESK_SEAT_OFFSET,
    facing: desk.rot,
  };
}

interface DeskEntry {
  desk: Desk;
  building: Building;
}

/**
 * True when (x, z) is inside — or within `margin` units of — any building's
 * footprint rect (M5 T2). Used to keep wander targets for unmatched bots
 * (and every Idle/crew wanderer, matched or not — Idle never holds a desk)
 * out of rooms they have no business standing in.
 */
export function insideAnyBuildingRect(x: number, z: number, buildings: Building[], margin: number): boolean {
  for (const b of buildings) {
    const { x: bx, z: bz, w, d } = b.rect;
    if (Math.abs(x - bx) <= w / 2 + margin && Math.abs(z - bz) <= d / 2 + margin) return true;
  }
  return false;
}

export function createSim(grid: NavGrid, buildings: Building[], seed: number): Sim {
  const rand = rng(seed);
  const world: SimWorld = { bots: new Map(), deskOwners: new Map() };
  const meta = new Map<string, BotMeta>();
  // `grid`/`buildings` are reassigned wholesale by updateWorld() below, so every
  // helper that closes over them (deskById, pathToDesk, pickWanderPath, ...)
  // reads the current world on its next call — no bot re-plan logic to duplicate.
  let deskList: DeskEntry[] = buildings.flatMap((building) =>
    building.desks.map((desk) => ({ desk, building })),
  );

  const deskById = (id: string): DeskEntry | undefined => deskList.find((e) => e.desk.id === id);
  /** Only a building sharing the bot's groupKey is ever a candidate — no squatting in unlinked/other rooms. */
  const findFreeDesk = (groupKey: string | null): DeskEntry | undefined =>
    groupKey === null
      ? undefined
      : deskList.find((e) => (e.building.groupKey ?? null) === groupKey && !world.deskOwners.has(e.desk.id));
  /** "Matched" = has a real desk pool to claim from at all (room may still be full — that's overflow, not wander). */
  const isMatched = (groupKey: string | null): boolean =>
    groupKey !== null && buildings.some((b) => (b.groupKey ?? null) === groupKey);

  /** Path from `from` all the way to a desk's seat, routed via the building's door. */
  function pathToDesk(from: { x: number; z: number }, entry: DeskEntry): { x: number; z: number }[] {
    const toDoor = findPath(grid, from, entry.building.door);
    const toSeat = findPath(grid, entry.building.door, deskSeat(entry.desk));
    return [...toDoor, ...toSeat];
  }

  /** Send a bot toward a ring spot; if the grid can't route there, just place it (never throw). */
  function pathOrTeleport(bot: SimBot, target: { x: number; z: number }): void {
    const path = findPath(grid, { x: bot.x, z: bot.z }, target);
    if (path.length > 0) {
      bot.path = path;
    } else {
      bot.x = target.x;
      bot.z = target.z;
      bot.path = [];
    }
  }

  /** The building a crew bot calls home: the first room whose project link
   *  matches its group key (same matching desks use). Null for unassigned
   *  crew — they rest at HQ instead (M6 T2 default). */
  function homeBuilding(groupKey: string | null): Building | null {
    if (!isMatched(groupKey)) return null;
    return buildings.find((b) => b.kind !== "hq" && (b.groupKey ?? null) === groupKey) ?? null;
  }

  /** Pick a reachable seeded wander target and return the path to it, or null after a few misses. */
  function pickWanderPath(bot: SimBot, m: BotMeta): { x: number; z: number }[] | null {
    const isCrew = m.agentId !== null;
    // Assigned crew rests in its OWN room (live feedback 2026-07-04: "hij is
    // toegewezen aan de CrewHub room" — resting at HQ read as a bug);
    // unassigned crew keeps the HQ rest disc (M6 T2); sessions wander around
    // their current spot.
    const home = isCrew ? homeBuilding(m.groupKey) : null;
    const maxRadius = home
      ? Math.max(1, Math.min(home.rect.w, home.rect.d) / 2 - 2)
      : isCrew
        ? CREW_WANDER_RADIUS
        : SESSION_WANDER_RADIUS;
    const centerX = home ? home.rect.x : isCrew ? 0 : bot.x;
    const centerZ = home ? home.rect.z : isCrew ? 0 : bot.z;
    // Crew belongs inside its rest building (its home room, or HQ) — exempt
    // that ONE building from the M5 "stay out of every building" wander rule
    // so the rest disc inside its walls isn't rejected on every try. Session
    // bots keep the full exclusion, HQ included, same as any other room they
    // have no business entering.
    const restId = home ?? null;
    const wanderBuildings = isCrew
      ? buildings.filter((b) => (restId ? b !== restId : b.kind !== "hq"))
      : buildings;
    for (let i = 0; i < WANDER_TARGET_TRIES; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = rand() * maxRadius;
      const target = { x: centerX + Math.sin(angle) * radius, z: centerZ + Math.cos(angle) * radius };
      // M5 T2: no wanderer (Idle, or an unmatched Working/WaitingForInput
      // bot borrowing the wander loop below) ever paths *into* a room —
      // matched/seated bots reach their desk via pathToDesk, never this fn.
      if (insideAnyBuildingRect(target.x, target.z, wanderBuildings, WANDER_BUILDING_MARGIN)) continue;
      const path = findPath(grid, { x: bot.x, z: bot.z }, target);
      if (path.length > 0) return path;
    }
    return null;
  }

  /** Idle wander, and the outside-wander borrowed by unmatched Working/WaitingForInput bots — starts next tick. */
  function startWander(bot: SimBot, m: BotMeta): void {
    bot.path = [];
    m.pauseUntil = bot.age;
  }

  /** True while `m` should run the wander loop instead of its status's normal desk/ring behavior. */
  function isWanderer(m: BotMeta): boolean {
    if (m.status === "Idle") return true;
    if (m.status === "Working" || m.status === "WaitingForInput") return !isMatched(m.groupKey);
    return false;
  }

  /** Drop a held desk when it no longer belongs to the bot's (possibly just-changed) group. */
  function releaseIfGroupMismatch(bot: SimBot, groupKey: string | null): void {
    if (!bot.deskId) return;
    const entry = deskById(bot.deskId);
    if (!entry || groupKey === null || (entry.building.groupKey ?? null) !== groupKey) {
      world.deskOwners.delete(bot.deskId);
      bot.deskId = null;
    }
  }

  /** Re-derive a bot's path/desk from a (possibly newly seen) status. Called on creation and status change. */
  function replan(bot: SimBot, m: BotMeta, status: SessionStatus): void {
    switch (status) {
      case "Working": {
        if (!isMatched(m.groupKey)) {
          // No room to work in (null groupKey, or no building shares it) —
          // borrow the wander loop; the status bulb still reads "Working".
          startWander(bot, m);
          break;
        }
        // A desk assigned earlier stays assigned for the life of the session
        // (see the status-change note below) — only look for a free one the
        // first time a bot goes to work.
        const entry = bot.deskId ? deskById(bot.deskId) : findFreeDesk(m.groupKey);
        if (entry) {
          if (!bot.deskId) {
            bot.deskId = entry.desk.id;
            world.deskOwners.set(entry.desk.id, bot.key);
          }
          bot.path = pathToDesk({ x: bot.x, z: bot.z }, entry);
        } else {
          // Desks exhausted (17th+ concurrent worker in this project) — sit
          // on the plaza ring outside HQ instead of crashing. Overflow always
          // waits there, even for a matched bot; only unmatched bots wander.
          pathOrTeleport(bot, outsideRingPoint(bot.key));
        }
        break;
      }
      case "WaitingForPermission":
        // Desk (if any) stays reserved — a session mid-approval hasn't ended,
        // it's just stepped away to wave. Freed only when sync() drops it.
        // Unchanged for matched *and* unmatched bots (an unmatched bot never
        // holds a desk to begin with).
        pathOrTeleport(bot, outsideRingPoint(bot.key));
        break;
      case "WaitingForInput": {
        if (!isMatched(m.groupKey)) {
          startWander(bot, m);
          break;
        }
        const entry = bot.deskId ? deskById(bot.deskId) : undefined;
        bot.path = entry ? findPath(grid, { x: bot.x, z: bot.z }, deskSeat(entry.desk)) : [];
        break;
      }
      case "Idle":
        // Idle never claims a desk regardless of groupKey — always the
        // wander loop, matched or not.
        startWander(bot, m);
        break;
      case "Ended":
      default:
        // toCharacters() already drops Ended sessions before they reach sync();
        // if one ever slips through, just let the bot stand where it is.
        bot.path = [];
    }
  }

  /** Advance a bot along its path by dt seconds, may consume several waypoints at once. */
  function advance(bot: SimBot, dt: number): void {
    let remaining = dt * WALK_SPEED;
    while (remaining > 0 && bot.path.length > 0) {
      const next = bot.path[0]!;
      const dx = next.x - bot.x;
      const dz = next.z - bot.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= remaining) {
        bot.x = next.x;
        bot.z = next.z;
        if (dist > 0) bot.facing = Math.atan2(dx, dz);
        bot.path.shift();
        remaining -= dist;
      } else {
        const frac = remaining / dist;
        bot.x += dx * frac;
        bot.z += dz * frac;
        bot.facing = Math.atan2(dx, dz);
        remaining = 0;
      }
    }
  }

  /** Set motion (and, for seated bots, snap position/facing) once a bot's path is empty. */
  function settle(bot: SimBot, m: BotMeta): void {
    // Idle always, and an unmatched Working/WaitingForInput bot: same wander
    // loop as Idle — walk a leg, pause, repeat — regardless of the status
    // bulb it still shows.
    if (isWanderer(m)) {
      if (bot.age < m.pauseUntil) {
        bot.motion = "stand";
        return;
      }
      const path = pickWanderPath(bot, m);
      if (path) {
        bot.path = path;
        bot.motion = "walk";
        const first = path[0]!;
        bot.facing = Math.atan2(first.x - bot.x, first.z - bot.z);
      } else {
        // No reachable target this attempt — stand and retry shortly rather than spinning every tick.
        bot.motion = "stand";
        m.pauseUntil = bot.age + WANDER_PAUSE_MIN + rand() * WANDER_PAUSE_RANGE;
      }
      return;
    }

    switch (m.status) {
      case "Working": {
        bot.motion = "sit-type";
        const entry = bot.deskId ? deskById(bot.deskId) : undefined;
        if (entry) {
          const seat = deskSeat(entry.desk);
          bot.x = seat.x;
          bot.z = seat.z;
          bot.facing = seat.facing;
        }
        break;
      }
      case "WaitingForPermission":
        bot.motion = "raise-hand";
        break;
      case "WaitingForInput":
        bot.motion = Math.floor(bot.age / THINK_FLIP_SECONDS) % 2 === 0 ? "stand" : "think";
        break;
      default:
        bot.motion = "stand";
    }
  }

  function sync(characters: Character[]): void {
    const seen = new Set<string>();
    for (const c of characters) {
      seen.add(c.key);
      const existing = world.bots.get(c.key);
      if (!existing) {
        const spawn = spawnPoint(rand);
        const bot: SimBot = {
          key: c.key,
          x: spawn.x,
          z: spawn.z,
          facing: 0,
          motion: "stand",
          deskId: null,
          path: [],
          age: 0,
        };
        const m: BotMeta = {
          status: c.status,
          agentId: c.agentId,
          pauseUntil: 0,
          groupKey: c.groupKey ?? null,
          override: null,
        };
        world.bots.set(c.key, bot);
        meta.set(c.key, m);
        replan(bot, m, c.status);
        continue;
      }
      const m = meta.get(c.key)!;
      m.agentId = c.agentId;
      const groupKey = c.groupKey ?? null;
      // M5 T2: a session's linked project changing (rare) is handled exactly
      // like a status change — release a now-mismatched desk, then replan.
      if (m.status !== c.status || m.groupKey !== groupKey) {
        m.status = c.status;
        m.groupKey = groupKey;
        // M7 T2: a status change mid-command is recorded (above) but its
        // desk release + replan wait — a running goto/emote wins until it
        // completes; tickOverride() applies the recorded status then. The
        // one exception, "the bot disappearing from sync", isn't handled
        // here at all — the removal loop below deletes it unconditionally,
        // override or not.
        if (!m.override) {
          releaseIfGroupMismatch(existing, groupKey);
          replan(existing, m, c.status);
        }
      }
    }

    for (const key of Array.from(world.bots.keys())) {
      if (seen.has(key)) continue;
      const bot = world.bots.get(key)!;
      if (bot.deskId) world.deskOwners.delete(bot.deskId);
      world.bots.delete(key);
      meta.delete(key);
    }
  }

  /**
   * Per-tick state machine for an active Sim.command() override (M7 T2).
   * `goto`: walk (advance() drives it, same as any other path) until the
   * path empties, then hold in place for holdSeconds. `emote`: hold the
   * emote's Motion in place for its duration; `spin` additionally drives
   * bot.facing itself (2 full turns over the duration) — pose() only draws
   * the arm silhouette, it has no yaw of its own to spin with. Either kind,
   * once done, clears the override and applies whatever status/groupKey
   * sync() recorded while it was running — same replan() a live status
   * change triggers outside an override.
   */
  function tickOverride(bot: SimBot, m: BotMeta, dt: number): void {
    const ov = m.override!;
    if (ov.kind === "goto" && ov.phase === "walk") {
      advance(bot, dt);
      if (bot.path.length > 0) {
        bot.motion = "walk";
        return;
      }
      ov.phase = "hold";
      ov.holdUntil = bot.age + ov.holdSeconds;
      bot.motion = "stand";
      return;
    }

    const done = ov.kind === "goto" ? bot.age >= ov.holdUntil : bot.age >= ov.endAge;
    if (!done) {
      if (ov.kind === "goto") {
        bot.motion = "stand";
      } else {
        if (ov.emote === "spin") {
          const span = ov.endAge - ov.startAge;
          const progress = span > 0 ? (bot.age - ov.startAge) / span : 1;
          bot.facing = ov.startFacing + progress * Math.PI * 4; // 2 full turns
        }
        bot.motion = ov.emote;
      }
      return;
    }

    m.override = null;
    releaseIfGroupMismatch(bot, m.groupKey);
    // An emote never moves the bot — if it's still sitting exactly where its
    // (still-held, post-release-check) desk claim seats it, settle() alone
    // restores the right seated motion in place. Skip replan()'s pathToDesk,
    // which routes through the door unconditionally (correct for a goto,
    // which really did walk away, but a needless "walk out and back" detour
    // for a bot that never left its seat). A bot that moved during the
    // override (goto) or lost its seat (deskId null, or too far from it —
    // e.g. an unseated status like WaitingForPermission/Idle) still falls
    // through to the normal replan() below.
    if (ov.kind === "emote" && bot.deskId) {
      const entry = deskById(bot.deskId);
      if (entry) {
        const seat = deskSeat(entry.desk);
        if (Math.hypot(bot.x - seat.x, bot.z - seat.z) <= SEATED_RESUME_EPSILON) {
          settle(bot, m);
          return;
        }
      }
    }
    replan(bot, m, m.status);
  }

  function tick(dt: number): void {
    for (const [key, bot] of world.bots) {
      const m = meta.get(key)!;
      bot.age += dt;

      if (m.override) {
        tickOverride(bot, m, dt);
        continue;
      }

      const wasMoving = bot.path.length > 0;
      if (wasMoving) advance(bot, dt);
      if (bot.path.length > 0) {
        bot.motion = "walk";
        continue;
      }
      // A wander leg just finished — rest before picking the next one.
      if (wasMoving && isWanderer(m)) {
        m.pauseUntil = bot.age + WANDER_PAUSE_MIN + rand() * WANDER_PAUSE_RANGE;
      }
      settle(bot, m);
    }
  }

  /**
   * External command entry point (M7 T2) — same standing as sync(): a
   * deterministic input, no rng. Unknown/departed keys are a silent no-op
   * (a bot can leave between a caller deciding to command it and the call
   * landing). A second command of either kind always replaces whichever
   * override is active, by simply overwriting bot.path/motion and
   * m.override below — nothing needs to explicitly "cancel" the old one.
   */
  function command(key: string, cmd: SimCommand): void {
    const bot = world.bots.get(key);
    const m = meta.get(key);
    if (!bot || !m) return;

    if (cmd.kind === "goto") {
      const holdSeconds = (cmd.holdTicks ?? 100) * TICK_SECONDS;
      const path = findPath(grid, { x: bot.x, z: bot.z }, { x: cmd.x, z: cmd.z });
      if (path.length > 0) {
        bot.path = path;
        bot.motion = "walk";
        m.override = { kind: "goto", phase: "walk", holdSeconds, holdUntil: 0 };
      } else {
        // Ungrantable point (off-grid, or an isolated pocket the nav grid
        // can't route to) — same "never strand a bot" fallback pathOrTeleport
        // uses elsewhere: land there anyway and hold.
        bot.x = cmd.x;
        bot.z = cmd.z;
        bot.path = [];
        bot.motion = "stand";
        m.override = { kind: "goto", phase: "hold", holdSeconds, holdUntil: bot.age + holdSeconds };
      }
      return;
    }

    const durSeconds = (cmd.durTicks ?? 30) * TICK_SECONDS;
    bot.path = [];
    bot.motion = cmd.emote;
    m.override = {
      kind: "emote",
      emote: cmd.emote,
      startAge: bot.age,
      endAge: bot.age + durSeconds,
      startFacing: bot.facing,
    };
  }

  /**
   * Swap in a new grid + buildings without respawning anyone: a desk
   * reservation survives the edit iff its desk still exists in the new pool
   * (a removed building's desk goes free instead, and a previously-
   * overflowing bot may now win one from the new pool); every bot then
   * re-plans from its current (x, z) via the same per-status `replan` that
   * sync() uses on a status change. Claims must be resolved *before* that
   * replan pass — WaitingForPermission/WaitingForInput's branches only ever
   * *read* bot.deskId, they never re-request one, so nulling every deskId
   * unconditionally here would silently strip a still-valid reservation
   * from a bot that's mid-wave or mid-think (see the "stays reserved" note
   * on WaitingForPermission above).
   *
   * Two full passes, not one interleaved loop: if a deskless bot's replan
   * (pass 2) ran before every surviving claim was back in deskOwners, its
   * findFreeDesk() could grab a desk a not-yet-visited bot still holds —
   * both bots would then think they own it (one via the untouched
   * bot.deskId this pass never got to, the other via the fresh grab),
   * while deskOwners.get(desk) can only point at one of them. Restoring
   * every claim first closes that race. Nobody teleports here — replan
   * only ever assigns a path or a stable desk seat; walking is left to
   * tick().
   *
   * M5 T2 addendum: a desk id surviving the edit isn't enough on its own —
   * if the edit relinked its building to a different project, the id is
   * technically still in `deskList` but the holder no longer belongs there.
   * Pass 1 below compares the desk's (possibly new) building groupKey
   * against the holder's groupKey, not just desk existence, before
   * restoring the claim.
   */
  function updateWorld(newGrid: NavGrid, newBuildings: Building[]): void {
    grid = newGrid;
    buildings = newBuildings;
    deskList = newBuildings.flatMap((building) => building.desks.map((desk) => ({ desk, building })));
    world.deskOwners.clear();

    // Pass 1: restore every surviving, still-matching claim before anyone can contend for a desk.
    for (const [key, bot] of world.bots) {
      const m = meta.get(key)!;
      const entry = bot.deskId ? deskById(bot.deskId) : undefined;
      if (entry && (entry.building.groupKey ?? null) === m.groupKey) {
        world.deskOwners.set(bot.deskId!, key); // desk survived the edit, still in-group — keep the claim
      } else {
        bot.deskId = null; // desk removed, or its building's group no longer matches — release
      }
    }

    // Pass 2: now that deskOwners reflects every retained claim, replan freely.
    for (const [key, bot] of world.bots) {
      bot.path = [];
      const m = meta.get(key)!;
      // M7 T2: a grid/building edit invalidates whatever a running goto/emote
      // assumed about the world (its path, its hold point) — drop it rather
      // than let a stale override fight this fresh replan next tick.
      m.override = null;
      replan(bot, m, m.status);
    }
  }

  return { world, sync, tick, updateWorld, command };
}
