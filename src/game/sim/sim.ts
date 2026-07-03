// Character state machine + sim world (M1 T6) — pure TS, deterministic, no
// three.js, no clock, no RNG besides the seeded stream below. Turns
// Character[] snapshots into walking, sitting, waving robots the renderer
// (T7) can read straight off `Sim.world` every frame.
import type { SessionStatus } from "@/ipc/bindings";
import type { Motion } from "@/game/characters/pose";
import type { Building, Desk } from "@/game/world/campus/buildings";
import type { Character } from "./characters";
import { findPath, type NavGrid } from "./grid";
import { hashCode, mulberry32 } from "./rand";

export const WALK_SPEED = 2.2; // units/s

const PERMISSION_RING_RADIUS = 11;
const OVERFLOW_RING_RADIUS = 8; // just outside the plaza's fountain — "any free plaza spot"
const SESSION_WANDER_RADIUS = 12; // around the bot's current position
const CREW_WANDER_RADIUS = 9; // around the plaza (world origin)
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

export interface Sim {
  world: SimWorld;
  sync(characters: Character[]): void;
  tick(dt: number): void;
  updateWorld(grid: NavGrid, buildings: Building[]): void;
}

/** Bookkeeping the renderer never sees — kept off SimBot to keep that type a clean wire contract. */
interface BotMeta {
  status: SessionStatus;
  agentId: string | null;
  /** Idle wander: bot.age at which the next leg (or first retry) may start. */
  pauseUntil: number;
  /** Desk-claim eligibility key (M5 T2), normalized to null; see `isMatched`. */
  groupKey: string | null;
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

/** Spawn near the campus edge path arm at (0, 34), jittered so new bots don't stack. */
function spawnPoint(rand: () => number): { x: number; z: number } {
  return { x: (rand() - 0.5) * 4, z: 34 + (rand() - 0.5) * 4 };
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

  /** Pick a reachable seeded wander target and return the path to it, or null after a few misses. */
  function pickWanderPath(bot: SimBot, isCrew: boolean): { x: number; z: number }[] | null {
    const maxRadius = isCrew ? CREW_WANDER_RADIUS : SESSION_WANDER_RADIUS;
    // Crew wander around the plaza (world origin); sessions wander around their current spot.
    const centerX = isCrew ? 0 : bot.x;
    const centerZ = isCrew ? 0 : bot.z;
    for (let i = 0; i < WANDER_TARGET_TRIES; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = rand() * maxRadius;
      const target = { x: centerX + Math.sin(angle) * radius, z: centerZ + Math.cos(angle) * radius };
      // M5 T2: no wanderer (Idle, or an unmatched Working/WaitingForInput
      // bot borrowing the wander loop below) ever paths *into* a room —
      // matched/seated bots reach their desk via pathToDesk, never this fn.
      if (insideAnyBuildingRect(target.x, target.z, buildings, WANDER_BUILDING_MARGIN)) continue;
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
          // at the plaza edge instead of crashing. Overflow always stays at
          // the plaza, even for a matched bot; only unmatched bots wander.
          pathOrTeleport(bot, ringPoint(bot.key, OVERFLOW_RING_RADIUS));
        }
        break;
      }
      case "WaitingForPermission":
        // Desk (if any) stays reserved — a session mid-approval hasn't ended,
        // it's just stepped away to wave. Freed only when sync() drops it.
        // Unchanged for matched *and* unmatched bots (an unmatched bot never
        // holds a desk to begin with).
        pathOrTeleport(bot, ringPoint(bot.key, PERMISSION_RING_RADIUS));
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
      const path = pickWanderPath(bot, m.agentId !== null);
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
        releaseIfGroupMismatch(existing, groupKey);
        replan(existing, m, c.status);
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

  function tick(dt: number): void {
    for (const [key, bot] of world.bots) {
      const m = meta.get(key)!;
      bot.age += dt;
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
      replan(bot, m, m.status);
    }
  }

  return { world, sync, tick, updateWorld };
}
