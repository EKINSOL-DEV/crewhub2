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
}

/** Bookkeeping the renderer never sees — kept off SimBot to keep that type a clean wire contract. */
interface BotMeta {
  status: SessionStatus;
  agentId: string | null;
  /** Idle wander: bot.age at which the next leg (or first retry) may start. */
  pauseUntil: number;
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

export function createSim(grid: NavGrid, buildings: Building[], seed: number): Sim {
  const rand = rng(seed);
  const world: SimWorld = { bots: new Map(), deskOwners: new Map() };
  const meta = new Map<string, BotMeta>();
  const deskList: DeskEntry[] = buildings.flatMap((building) =>
    building.desks.map((desk) => ({ desk, building })),
  );

  const deskById = (id: string): DeskEntry | undefined => deskList.find((e) => e.desk.id === id);
  const findFreeDesk = (): DeskEntry | undefined => deskList.find((e) => !world.deskOwners.has(e.desk.id));

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
      const path = findPath(grid, { x: bot.x, z: bot.z }, target);
      if (path.length > 0) return path;
    }
    return null;
  }

  /** Re-derive a bot's path/desk from a (possibly newly seen) status. Called on creation and status change. */
  function replan(bot: SimBot, m: BotMeta, status: SessionStatus): void {
    switch (status) {
      case "Working": {
        // A desk assigned earlier stays assigned for the life of the session
        // (see the status-change note below) — only look for a free one the
        // first time a bot goes to work.
        const entry = bot.deskId ? deskById(bot.deskId) : findFreeDesk();
        if (entry) {
          if (!bot.deskId) {
            bot.deskId = entry.desk.id;
            world.deskOwners.set(entry.desk.id, bot.key);
          }
          bot.path = pathToDesk({ x: bot.x, z: bot.z }, entry);
        } else {
          // Desks exhausted (17th+ concurrent worker) — sit at the plaza edge instead of crashing.
          pathOrTeleport(bot, ringPoint(bot.key, OVERFLOW_RING_RADIUS));
        }
        break;
      }
      case "WaitingForPermission":
        // Desk (if any) stays reserved — a session mid-approval hasn't ended,
        // it's just stepped away to wave. Freed only when sync() drops it.
        pathOrTeleport(bot, ringPoint(bot.key, PERMISSION_RING_RADIUS));
        break;
      case "WaitingForInput": {
        const entry = bot.deskId ? deskById(bot.deskId) : undefined;
        bot.path = entry ? findPath(grid, { x: bot.x, z: bot.z }, deskSeat(entry.desk)) : [];
        break;
      }
      case "Idle":
        bot.path = [];
        m.pauseUntil = bot.age; // wander starts on the very next tick
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
      case "Idle": {
        if (bot.age < m.pauseUntil) {
          bot.motion = "stand";
          break;
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
        break;
      }
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
        const m: BotMeta = { status: c.status, agentId: c.agentId, pauseUntil: 0 };
        world.bots.set(c.key, bot);
        meta.set(c.key, m);
        replan(bot, m, c.status);
        continue;
      }
      const m = meta.get(c.key)!;
      m.agentId = c.agentId;
      if (m.status !== c.status) {
        m.status = c.status;
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
      if (wasMoving && m.status === "Idle") {
        m.pauseUntil = bot.age + WANDER_PAUSE_MIN + rand() * WANDER_PAUSE_RANGE;
      }
      settle(bot, m);
    }
  }

  return { world, sync, tick };
}
