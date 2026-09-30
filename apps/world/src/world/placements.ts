/* The town document's placements inside the building templates. Pure: no Three.js, no DOM.

   A room of a building template is a world-engine layout with its own furniture. Build mode adds the document's
   placements to it, one at a time in document order, through the engine's own footprint rules
   (`WorldSimulation.placement`: in bounds, no overlap, the entrance and every approach cell reachable). A placement
   the engine refuses, or one whose room is not in the building now, is kept as a labelled error: it is never dropped
   silently. Door cells are guarded by a footprint-free marker prop whose approach is the door itself, so a placement
   can neither stand on a door nor wall one off.

   Props attached to a ticket or an agent take no footprint (plan 6.3); they ride on the work object or sit on the
   agent's desk, and are listed apart from the grid. */
import { WorldSimulation } from "@crewhub/world-engine";
import type { Cell, Definitions, PropDefinition, Rotation, WorldLayout, WorldProp } from "@crewhub/world-engine";
import type { PlacedProp, RoomKind, TownDocument } from "@crewhub/world-model";
import { BUILDING_CELL, interiorDefinitions, roomOf, type BuildingTemplate } from "./buildingTemplate.ts";

/** The template's own furniture, namespaced so it never meets a catalogue id. */
export const FIXED_PREFIX = "fixed:";
export const DOOR_MARKER = "fixed:door";

const DOOR_DEFINITION: PropDefinition = {
  id: DOOR_MARKER,
  label: "Door",
  footprint: { width: 1, depth: 1 },
  blocksMovement: false,
  tags: ["door"],
  approaches: [{ x: 0, z: 0 }],
};

/** Every engine record a room layout can hold: the catalogue's, the template furniture and the door marker. */
export function placementDefinitions(catalogueDefinitions: Definitions): Definitions {
  const fixed = Object.fromEntries(
    Object.entries(interiorDefinitions).map(([key, def]) => [`${FIXED_PREFIX}${key}`, { ...def, id: `${FIXED_PREFIX}${key}` }]),
  );
  return { ...catalogueDefinitions, ...fixed, [DOOR_MARKER]: DOOR_DEFINITION };
}

/** A room as build mode sees it: its grid, entrance, template furniture and door markers. */
export interface RoomSite {
  room: RoomKind;
  /** The room's north-west cell in building cells. */
  origin: Cell;
  layout: WorldLayout;
}

export function roomSite(template: BuildingTemplate, room: RoomKind): RoomSite | null {
  const found = roomOf(template, room);
  if (!found) return null;
  const fixed: WorldProp[] = found.layout.props.map((p) => ({ ...p, id: `fixed-${p.id}`, definitionId: `${FIXED_PREFIX}${p.definitionId}` }));
  const doors: WorldProp[] = [];
  const seen = new Set<string>();
  for (const door of template.doors)
    for (const side of [door.a, door.b])
      if (side.room === room && !seen.has(`${side.cell.x},${side.cell.z}`)) {
        seen.add(`${side.cell.x},${side.cell.z}`);
        doors.push({ id: `door-${door.id}`, definitionId: DOOR_MARKER, cell: { ...side.cell }, rotation: 0 });
      }
  return {
    room,
    origin: { ...found.origin },
    layout: { version: 1, grid: { ...found.layout.grid }, entrance: { ...found.layout.entrance }, props: [...fixed, ...doors] },
  };
}

export interface PlacementError {
  placement: PlacedProp;
  /** The room it was meant for, when that room exists now. */
  room: RoomKind | null;
  reason: string;
}

export interface RoomPlacements {
  site: RoomSite;
  /** The site's layout with every valid placement added: what the engine routes through. */
  layout: WorldLayout;
  placed: PlacedProp[];
  /** Changes whenever the room's placements change: phase 4's routes replan when it does. */
  revision: string;
}

export interface BuildingPlacements {
  rooms: Map<RoomKind, RoomPlacements>;
  errors: PlacementError[];
}

const toWorldProp = (p: PlacedProp): WorldProp => ({ id: p.id, definitionId: p.propId, cell: { ...p.cell }, rotation: p.rotation });

/** Engine refusals in words a person reads next to the ghost. */
export function placementWords(reason: string): string {
  if (reason === "Invalid prop identity or definition.") return "That cell is outside the room.";
  if (reason === "Props overlap or extend beyond the grid.") return "It overlaps something or sticks out of the room.";
  if (reason === "Keep workstation interaction cells reachable.") return "It would block a door or a place someone needs to reach.";
  if (reason === "Keep the entrance open.") return "It would block the door.";
  return reason;
}

const roomWords = (room: RoomKind) => room.replace("-", " ");

/**
 * The building's rooms with the document's grid placements applied in document order. Placements attached to a
 * ticket or an agent are not on the grid and are not listed here (see `riders`).
 */
export function resolveBuildingPlacements(doc: TownDocument, slug: string, template: BuildingTemplate, definitions: Definitions): BuildingPlacements {
  const rooms = new Map<RoomKind, RoomPlacements>();
  const errors: PlacementError[] = [];
  for (const t of template.rooms) {
    const site = roomSite(template, t.kind);
    if (site) rooms.set(t.kind, { site, layout: site.layout, placed: [], revision: "" });
  }
  for (const p of doc.placements) {
    if ("town" in p.at || p.at.building !== slug || isRider(p)) continue;
    const room = rooms.get(p.at.room);
    if (!room) {
      errors.push({ placement: p, room: null, reason: `the ${roomWords(p.at.room)} is not in this building now` });
      continue;
    }
    if (!definitions[p.propId]) {
      errors.push({ placement: p, room: p.at.room, reason: `unknown prop ${p.propId}` });
      continue;
    }
    const result = check(room.layout, definitions, toWorldProp(p));
    if (!result.ok) {
      errors.push({ placement: p, room: p.at.room, reason: placementWords(result.reason) });
      continue;
    }
    room.layout = { ...room.layout, props: [...room.layout.props, toWorldProp(p)] };
    room.placed.push(p);
  }
  for (const room of rooms.values()) room.revision = room.placed.map((p) => `${p.id}@${p.cell.x},${p.cell.z},${p.rotation}`).join("|");
  return { rooms, errors };
}

function check(layout: WorldLayout, definitions: Definitions, prop: WorldProp): { ok: true } | { ok: false; reason: string } {
  let simulation: WorldSimulation;
  try {
    simulation = new WorldSimulation(layout, definitions, []);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "The room's layout is invalid." };
  }
  return simulation.placement(prop);
}

/** A prop that rides on a ticket or sits on an agent's desk: no footprint, not on the grid. */
export const isRider = (p: PlacedProp): boolean => p.attachment?.kind === "ticket" || p.attachment?.kind === "agent";

export interface Probe {
  /** The placement id when moving or turning a placed prop; a fresh id for a new one. */
  id: string;
  propId: string;
  room: RoomKind;
  cell: Cell;
  rotation: Rotation;
}

export type GhostCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether the ghost may stand here: the room's layout from the document (without the probe's own placement, so a
 * move is checked against everything else) and the engine's placement rules.
 */
export function checkGhost(doc: TownDocument, slug: string, template: BuildingTemplate, definitions: Definitions, probe: Probe): GhostCheck {
  if (!definitions[probe.propId]) return { ok: false, reason: `unknown prop ${probe.propId}` };
  const others = { ...doc, placements: doc.placements.filter((p) => p.id !== probe.id) };
  const room = resolveBuildingPlacements(others, slug, template, definitions).rooms.get(probe.room);
  if (!room) return { ok: false, reason: `the ${roomWords(probe.room)} is not in this building now` };
  const result = check(room.layout, definitions, { id: probe.id, definitionId: probe.propId, cell: probe.cell, rotation: probe.rotation });
  return result.ok ? result : { ok: false, reason: placementWords(result.reason) };
}

/** The room and room cell under a point in building cells (floats), or null outside every room. */
export function cellAt(template: BuildingTemplate, x: number, z: number): { room: RoomKind; cell: Cell } | null {
  for (const room of template.rooms) {
    const cx = Math.floor(x - room.origin.x),
      cz = Math.floor(z - room.origin.z);
    if (cx >= 0 && cz >= 0 && cx < room.layout.grid.width && cz < room.layout.grid.depth) return { room: room.kind, cell: { x: cx, z: cz } };
  }
  return null;
}

/** The cells a footprint covers when turned: width and depth swap on a quarter turn. */
export function turnedSize(def: Pick<PropDefinition, "footprint">, rotation: Rotation): { width: number; depth: number } {
  return rotation % 2 ? { width: def.footprint.depth, depth: def.footprint.width } : { ...def.footprint };
}

/**
 * Where a placed model stands: the centre of its turned footprint in room cells, and its turn about y in radians.
 * The engine turns a footprint so that its +x edge runs along +z after a quarter turn, which is three.js
 * `rotation.y = -π/2`.
 */
export function footprintPose(def: PropDefinition, cell: Cell, rotation: Rotation): { x: number; z: number; rotationY: number } {
  const size = turnedSize(def, rotation);
  return { x: cell.x + size.width / 2, z: cell.z + size.depth / 2, rotationY: -rotation * (Math.PI / 2) };
}

/** Room cells to building-local metres (the building group's frame). */
export function roomToLocal(site: Pick<RoomSite, "origin">, x: number, z: number): { x: number; z: number } {
  return { x: (site.origin.x + x) * BUILDING_CELL, z: (site.origin.z + z) * BUILDING_CELL };
}

/** The first free cell for `propId` in a room (row by row from its north-west corner), or null when it is full. */
export function freeCellIn(room: RoomPlacements, definitions: Definitions, propId: string, rotation: Rotation = 0): Cell | null {
  let simulation: WorldSimulation;
  try {
    simulation = new WorldSimulation(room.layout, definitions, []);
  } catch {
    return null;
  }
  const { width, depth } = room.layout.grid;
  for (let z = 0; z < depth; z++)
    for (let x = 0; x < width; x++)
      if (simulation.placement({ id: "free-cell-probe", definitionId: propId, cell: { x, z }, rotation }).ok) return { x, z };
  return null;
}
