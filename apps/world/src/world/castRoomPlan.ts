/* The casting room's plan (`/cast-preview`): one sample room, the same for every cast, with a place for every role, the
   states the whole cast can be put into, a loop to walk, the line a lead's workers follow it in and the "carry on"
   schedule that lets each figure go its own way. Pure: no three.js and no DOM, so it runs under `node --test`.
   Positions are room cells (floats; x.5 is a cell centre), x to the east, z to the south, like a building's. */
import type { CastRole, FigureActivity, FigureState } from "@crewhub/world-cast";
import type { PaletteName } from "@crewhub/world-style";

/** One cell in world units: a building's cell, so furniture and figures stand as they do in the world. */
export const ROOM_CELL = 0.6;
export const ROOM = { width: 14, depth: 10 } as const;
/** Figures and plants stand at the interiors' scale. */
export const FIGURE_SCALE = 0.62;

export interface Spot {
  x: number;
  z: number;
  /** The way a figure faces: radians about y, 0 looks south (towards the camera). */
  heading: number;
}

export interface CastMember {
  /** The agent key: seeds colourways and rhythms, the same on every load. */
  key: string;
  role: CastRole;
  name: string;
  accent: PaletteName | null;
  /** Where it stands or sits when it is not walking. */
  home: Spot;
  /** Follows the lead in "team" (the lead's own workers). */
  follows: boolean;
}

export interface Furnishing {
  /** A style model key. */
  key: string;
  x: number;
  z: number;
  rotation?: number;
  scale?: number;
  /** Lifted off the floor (wall pieces), world units. */
  y?: number;
  seed?: number;
}

/** The sample building's project colour: the lead's accent and every cast's project band, leaf or flower. */
export const ROOM_ACCENT: PaletteName = "coral";

/** A workdesk (2 x 1 cells) at this cell, turned so its seat is the cell north of it, as in a building. */
const desk = (x: number, z: number, key = "furniture.workdesk", width = 2, depth = 1): Furnishing => ({ key, x: x + width / 2, z: z + depth / 2, rotation: Math.PI });
const seat = (x: number, z: number): Spot => ({ x: x + 1.5, z: z - 0.5, heading: 0 });

/** Desks by the member that sits at them; the drone sets tickets down on these. */
export const DESKS: Record<string, { x: number; z: number }> = {
  "cast:worker-ada": { x: 1, z: 3 },
  "cast:worker-ben": { x: 4, z: 3 },
  "cast:design": { x: 7, z: 3 },
  "cast:analyst": { x: 10, z: 3 },
  "cast:worker-cy": { x: 5, z: 7 },
};
export const LEAD_DESK = { x: 9, z: 7 };
/** The desk the "At the desk" scene looks at closely: the first worker's. */
export const CLOSE_DESK = "cast:worker-ada";

/** Every role stands in the room; three workers, so colourways and the line behind the lead show. */
export const MEMBERS: readonly CastMember[] = [
  { key: "cast:lead", role: "lead", name: "Lead", accent: ROOM_ACCENT, home: seat(LEAD_DESK.x, LEAD_DESK.z), follows: false },
  { key: "cast:worker-ada", role: "worker", name: "Worker", accent: ROOM_ACCENT, home: seat(1, 3), follows: true },
  { key: "cast:worker-ben", role: "worker", name: "Worker", accent: ROOM_ACCENT, home: seat(4, 3), follows: true },
  { key: "cast:worker-cy", role: "worker", name: "Worker", accent: ROOM_ACCENT, home: seat(5, 7), follows: true },
  { key: "cast:design", role: "design", name: "Design", accent: ROOM_ACCENT, home: seat(7, 3), follows: false },
  { key: "cast:analyst", role: "analyst", name: "Analyst", accent: ROOM_ACCENT, home: seat(10, 3), follows: false },
  { key: "cast:unknown", role: "unknown", name: "Unknown", accent: ROOM_ACCENT, home: { x: 3.4, z: 7.1, heading: -0.5 }, follows: false },
  { key: "cast:postman", role: "postman", name: "Postman", accent: null, home: { x: 12.8, z: 7.7, heading: -0.3 }, follows: false },
  { key: "cast:operator", role: "operator", name: "Operator", accent: null, home: { x: 13.1, z: 0.8, heading: -0.4 }, follows: false },
];

/** The room's furniture: four desks under the window, the lead's desk, one more desk, and a sofa corner. */
export const FURNITURE: readonly Furnishing[] = [
  ...Object.values(DESKS).map((d) => desk(d.x, d.z)),
  desk(LEAD_DESK.x, LEAD_DESK.z, "furniture.lead-desk", 3, 2),
  { key: "decor.rug-round", x: 2.3, z: 7.6 },
  { key: "furniture.lounge-sofa", x: 0.8, z: 7.6, rotation: Math.PI / 2 },
  { key: "furniture.coffee-table", x: 2.4, z: 7.7 },
  { key: "furniture.floor-lamp", x: 0.6, z: 6.4 },
  { key: "furniture.plant", x: 0.7, z: 9.3, scale: FIGURE_SCALE, seed: 3 },
  { key: "furniture.plant", x: 13.3, z: 9.3, scale: FIGURE_SCALE * 0.9, seed: 5 },
  { key: "furniture.mailbox", x: 13.5, z: 7.6, rotation: -Math.PI / 2 },
  { key: "furniture.bookshelf", x: 13.3, z: 3.2, rotation: -Math.PI / 2 },
];

export type PreviewStateId = "working" | "idle" | "done" | "blocked" | "waiting" | "attention" | "stale" | "proxy" | "walking" | "carrying";

const state = (activity: FigureActivity, flags: Partial<FigureState> = {}): FigureState => ({ activity, waiting: false, alert: false, proxy: false, carrying: false, ...flags });

/** The states the whole cast can be put into: every look the reducer's postures and signals lead to. */
export const PREVIEW_STATES: readonly { id: PreviewStateId; label: string; state: FigureState }[] = [
  { id: "working", label: "Working", state: state("working") },
  { id: "idle", label: "Idle", state: state("idle") },
  { id: "done", label: "Done", state: state("done") },
  { id: "blocked", label: "Blocked", state: state("blocked") },
  { id: "waiting", label: "Waiting on a person", state: state("idle", { waiting: true }) },
  { id: "attention", label: "Stalled, needs attention", state: state("idle", { alert: true }) },
  { id: "stale", label: "Stale snapshot", state: state("stale") },
  { id: "proxy", label: "Proxy (works elsewhere)", state: state("idle", { proxy: true }) },
  { id: "walking", label: "Walking", state: state("walking") },
  { id: "carrying", label: "Carrying", state: state("idle", { carrying: true }) },
];

export function previewState(id: PreviewStateId): FigureState {
  return PREVIEW_STATES.find((s) => s.id === id)!.state;
}

/** What the room plays: everyone at their place in one state, a loop, the lead with its workers in tow, or own ways. */
export type PreviewScene = "desks" | "at-desk" | "walk" | "team" | "carry-on";
export const PREVIEW_SCENES: readonly { id: PreviewScene; label: string; hint: string }[] = [
  { id: "desks", label: "At their places", hint: "The whole cast in the chosen state." },
  { id: "at-desk", label: "At the desk", hint: "One desk from close by: how the cast reaches its screen." },
  { id: "walk", label: "Walk", hint: "Every figure walks a loop round the room." },
  { id: "team", label: "Lead with workers in tow", hint: "The lead walks the loop; its workers follow in a line." },
  { id: "carry-on", label: "Carry on", hint: "Each figure goes its own way through the states; the postman does its round." },
];

/** The loop figures walk: the aisle between the desk rows, up the east side, along the window and back down. */
export const LOOP: readonly { x: number; z: number }[] = [
  { x: 0.6, z: 5.4 },
  { x: 12.3, z: 5.4 },
  { x: 12.3, z: 1.5 },
  { x: 0.6, z: 1.5 },
];
/** A scene starts this far in, so the lead's line is on the aisle at once (and under reduced motion, where it stays). */
export const SCENE_START = 4;
/** Cells per second: a figure at the interiors' scale walks about a metre a second. */
export const WALK_SPEED = 1.5;
/** The gap between the lead and each worker behind it, cells. */
export const FOLLOW_GAP = 1.15;

const legs = LOOP.map((from, i) => {
  const to = LOOP[(i + 1) % LOOP.length]!;
  return { from, to, length: Math.hypot(to.x - from.x, to.z - from.z) };
});
export const LOOP_LENGTH = legs.reduce((sum, leg) => sum + leg.length, 0);

/** The spot `distance` cells along the loop (it wraps), facing the way of the walk. */
export function loopSpot(distance: number): Spot {
  let left = ((distance % LOOP_LENGTH) + LOOP_LENGTH) % LOOP_LENGTH;
  for (const leg of legs) {
    if (left <= leg.length) {
      const t = leg.length ? left / leg.length : 0;
      return { x: leg.from.x + (leg.to.x - leg.from.x) * t, z: leg.from.z + (leg.to.z - leg.from.z) * t, heading: Math.atan2(leg.to.x - leg.from.x, leg.to.z - leg.from.z) };
    }
    left -= leg.length;
  }
  return { ...LOOP[0]!, heading: 0 };
}

/**
 * Where a member is on the loop at `seconds`, or null when it keeps its place. "walk": everyone, spread evenly.
 * "team": the lead, with its workers behind it one gap apart. "carry-on": the postman on its round.
 */
export function walkSpot(scene: PreviewScene, member: CastMember, seconds: number): Spot | null {
  const walked = seconds * WALK_SPEED;
  if (scene === "walk") return loopSpot(walked - (MEMBERS.indexOf(member) * LOOP_LENGTH) / MEMBERS.length);
  if (scene === "team") {
    if (member.role === "lead") return loopSpot(walked);
    if (!member.follows) return null;
    const place = MEMBERS.filter((m) => m.follows).indexOf(member) + 1;
    return loopSpot(walked - place * FOLLOW_GAP);
  }
  if (scene === "carry-on" && member.role === "postman") return loopSpot(walked * 0.8);
  return null;
}

/** A member's place in the line-up across the aisle, clear of the desks, facing the camera side. */
export function lineUpSpot(member: CastMember): Spot {
  const first = LOOP[0]!.x + 0.4,
    last = LOOP[1]!.x + 0.2;
  return { x: first + (MEMBERS.indexOf(member) * (last - first)) / (MEMBERS.length - 1), z: LOOP[0]!.z, heading: 0 };
}

/**
 * Where a member stands and whether it walks there. On a loop: the loop. At their places: its desk or corner, except
 * in the states a desk would hide (a walk on the spot, something carried), which line the cast up across the aisle.
 */
export function memberSpot(scene: PreviewScene, chosen: PreviewStateId, member: CastMember, seconds: number): { spot: Spot; walking: boolean } {
  const walking = walkSpot(scene, member, seconds);
  if (walking) return { spot: walking, walking: true };
  if (scene === "desks" && (chosen === "walking" || chosen === "carrying")) return { spot: lineUpSpot(member), walking: false };
  return { spot: member.home, walking: false };
}

/** What the camera frames: the figures, tightly (the floor they stand on and a bit of wall), or the whole room. */
export type PreviewFraming = "figures" | "room";

/**
 * The floor a room's figures use in what it plays, in cells: every place a member stands or walks, with room for a
 * figure round it. The camera frames this in "figures".
 */
export function figureArea(play: Pick<RoomPlay, "state" | "scene">): { minX: number; maxX: number; minZ: number; maxZ: number } {
  if (play.scene === "at-desk") {
    // One desk with its seat, and a little floor round them.
    const desk = DESKS[CLOSE_DESK]!;
    return { minX: desk.x + 0.1, maxX: desk.x + 2.3, minZ: desk.z - 0.9, maxZ: desk.z + 0.9 };
  }
  const area = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const lap = LOOP_LENGTH / WALK_SPEED;
  for (const member of MEMBERS)
    for (let seconds = 0; seconds <= lap * 1.25; seconds += 0.5) {
      const { spot, walking } = memberSpot(play.scene, play.state, member, seconds);
      area.minX = Math.min(area.minX, spot.x);
      area.maxX = Math.max(area.maxX, spot.x);
      area.minZ = Math.min(area.minZ, spot.z);
      area.maxZ = Math.max(area.maxZ, spot.z);
      if (!walking) break;
    }
  const pad = 0.7;
  return { minX: Math.max(0, area.minX - pad), maxX: Math.min(ROOM.width, area.maxX + pad), minZ: Math.max(0, area.minZ - pad), maxZ: Math.min(ROOM.depth, area.maxZ + pad) };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** What "carry on" draws from: mostly work and rest, now and then a block, a question or a stall. */
const OWN_WAYS: readonly FigureState[] = [
  state("working"),
  state("working"),
  state("working"),
  state("idle"),
  state("idle"),
  state("done"),
  state("blocked"),
  state("idle", { waiting: true }),
  state("working", { alert: true }),
];

/**
 * A member's state in "carry on" at `seconds`: each holds a state for its own 4 to 8 seconds and then draws the next,
 * seeded by its key, so the room never changes in step and looks the same on every load.
 */
export function carryOnState(member: CastMember, seconds: number): FigureState {
  const seed = hash(member.key);
  const hold = 4 + (seed % 41) / 10;
  const turn = Math.floor((seconds + (seed % 97) / 10) / hold);
  return OWN_WAYS[hash(`${member.key}:${turn}`) % OWN_WAYS.length]!;
}

/** The state a member shows: walking on the loop wins; "carry on" draws its own; else the chosen state. */
export function memberState(scene: PreviewScene, chosen: FigureState, member: CastMember, seconds: number): FigureState {
  if (walkSpot(scene, member, seconds)) {
    // The postman on its round carries its letters; a walk in the chosen state keeps that state's signals.
    if (scene === "carry-on") return state("walking", { carrying: true });
    return { ...chosen, activity: "walking" };
  }
  if (scene === "carry-on") return carryOnState(member, seconds);
  return chosen;
}

/** The casting room's light: the theme's own day or lamplight, or the day theme's dusk (a phase of the drift). */
export type PreviewLight = "day" | "dusk" | "lamplight";
export const PREVIEW_LIGHTS: readonly { id: PreviewLight; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "dusk", label: "Dusk" },
  { id: "lamplight", label: "Lamplight" },
];
/** The drift phase of the day theme's dusk (the style's stops: dusk sits at 0.62 of a day). */
export const DUSK_PHASE = 0.62;

/** One room of the page: which of the shown casts stands in it and what it plays. */
export interface RoomPlay {
  /** Index into the shown casts. */
  cast: number;
  state: PreviewStateId;
  scene: PreviewScene;
  /** What sets this room apart from its neighbours, for its title; null when the cast's name says it all. */
  note: string | null;
}

const label = (id: PreviewStateId) => PREVIEW_STATES.find((s) => s.id === id)!.label;
/** What a cast's extra rooms play at town distance, next to the chosen state: the states a viewer must tell apart. */
const FAR_PLAYS: readonly { state: PreviewStateId; scene: PreviewScene; note: string }[] = [
  { state: "blocked", scene: "desks", note: label("blocked") },
  { state: "working", scene: "walk", note: "Walking" },
  { state: "idle", scene: "desks", note: label("idle") },
  { state: "waiting", scene: "desks", note: label("waiting") },
  { state: "attention", scene: "desks", note: label("attention") },
];

/**
 * The rooms of a view and how many stand in a row. Near: one room per shown cast (two to a row side by side), all in
 * the chosen state. At town distance a room is a few dozen pixels, so each cast gets a block of rooms instead: the
 * chosen state and the states to tell apart from it (five more for one cast, two more per cast side by side).
 */
export function roomPlays(casts: number, chosen: PreviewStateId, scene: PreviewScene, far: boolean): { plays: RoomPlay[]; columns: number } {
  const own = (cast: number): RoomPlay => ({ cast, state: chosen, scene, note: far ? (scene === "desks" ? label(chosen) : PREVIEW_SCENES.find((s) => s.id === scene)!.label) : null });
  if (!far) return { plays: Array.from({ length: casts }, (_, cast) => own(cast)), columns: casts > 1 ? 2 : 1 };
  const extra = casts > 1 ? 2 : FAR_PLAYS.length;
  const plays = Array.from({ length: casts }, (_, cast) => [own(cast), ...FAR_PLAYS.slice(0, extra).map((play) => ({ cast, ...play }))]).flat();
  return { plays, columns: 3 };
}

/** A room's origin in cells: the rooms stand in a grid with a walkway between them. */
export const ROOM_GAP = 3;
export function roomOrigin(index: number, columns: number): { x: number; z: number } {
  return { x: (index % columns) * (ROOM.width + ROOM_GAP), z: Math.floor(index / columns) * (ROOM.depth + ROOM_GAP) };
}
