/* Work places: where a figure works at a surface, as a cast's figure is told it (`WorkPlace`, @crewhub/world-cast).
   The furniture's place and turn come from the building template, the top's height, screen and free places from the
   style (`workSurfaces` in its manifest), and what the renderer itself sets on a top (a ticket, the desk lamp, a pile)
   is given as circles to keep clear. Nothing here knows a cast: a figure that sits on the top asks the place for a
   free spot of its own size. Pure: no three.js and no DOM. Lengths are world units, x to the east, z to the south. */
import type { WorkPlace, WorkPose } from "@crewhub/world-cast";
import type { ModelKey, WorkSurface } from "@crewhub/world-style";
import { BUILDING_CELL as CELL, interiorDefinitions } from "./buildingTemplate.ts";

/** The furniture a figure works at, by its definition: the work pose it is and the model that draws it. */
export const WORK_FURNITURE: Record<string, { pose: WorkPose; key: ModelKey }> = {
  workdesk: { pose: "desk", key: "furniture.workdesk" },
  "lead-desk": { pose: "lead-desk", key: "furniture.lead-desk" },
  "meeting-table": { pose: "meeting-table", key: "furniture.meeting-table" },
  "planning-table": { pose: "planning-table", key: "furniture.planning-table" },
  "review-pile": { pose: "review-table", key: "furniture.review-pile" },
};

export interface Circle {
  x: number;
  z: number;
  radius: number;
}

/** A work place with what the renderer needs besides: the way the figure faces there, and the spot a sitter took. */
export interface WorkAt {
  place: WorkPlace;
  /** Radians about y, 0 looks south: squarely towards the top. */
  heading: number;
  /** The free spot handed out on the top, in the frame the furniture was given in; null until a figure asks. */
  taken: Circle | null;
}

/**
 * The way from a building to the home camera, along the floor (a unit vector: it looks in from the south-east). A
 * figure that sits on a top takes, of the places free for it, the one where it shows its face to this side.
 */
export const HOME_VIEW: Readonly<{ x: number; z: number }> = { x: Math.SQRT1_2, z: Math.SQRT1_2 };

/** Places seen this much alike from the camera are the style's to rank: the earlier one is taken. */
const VIEW_TIE = 0.05;

/** How far apart the places along a clear table's edge are tried, beyond the sitter's own width. */
const SLIDE_MARGIN = 0.05;

/**
 * The work place of a figure standing at `stand` by a piece of furniture at `at` (its footprint's centre and its
 * model's turn about y). `occupied` is what stands on the top besides the model's own things. With `view` (the way to
 * the camera along the floor, `HOME_VIEW`), a sitter with more than one free place takes the one it is seen best at:
 * turned to its work there, it faces the camera most. Left out: the style's first free place.
 */
export function workPlace(
  pose: WorkPose,
  surface: WorkSurface,
  at: { x: number; z: number; rotation: number },
  stand: { x: number; z: number },
  scale: number,
  occupied: readonly Circle[] = [],
  view?: { x: number; z: number },
): WorkAt {
  const cos = Math.cos(at.rotation),
    sin = Math.sin(at.rotation);
  /** World to the model's own space, and back. */
  const toModel = (x: number, z: number) => ({ x: (x - at.x) * cos - (z - at.z) * sin, z: (x - at.x) * sin + (z - at.z) * cos });
  const toWorld = (x: number, z: number) => ({ x: at.x + x * cos + z * sin, z: at.z - x * sin + z * cos });
  const [halfX, halfZ] = surface.half;
  const local = toModel(stand.x, stand.z);
  // The figure faces the top squarely: across the edge it stands nearest to.
  const alongZ = Math.abs(local.z) - halfZ >= Math.abs(local.x) - halfX;
  const face = alongZ ? { x: 0, z: local.z > 0 ? -1 : 1 } : { x: local.x > 0 ? -1 : 1, z: 0 };
  const facing = { x: face.x * cos + face.z * sin, z: -face.x * sin + face.z * cos };
  const heading = Math.atan2(facing.x, facing.z);
  /** A world point in the standing figure's frame (+z the way it faces). */
  const toFigure = (x: number, z: number) => ({ x: (x - stand.x) * facing.z - (z - stand.z) * facing.x, z: (x - stand.x) * facing.x + (z - stand.z) * facing.z });
  // A screen is looked at in its middle; a table along its middle line, at the point nearest the figure.
  const spine = { x: Math.max(0, halfX - halfZ), z: Math.max(0, halfZ - halfX) };
  const focus = surface.screen
    ? toWorld(surface.screen[0], surface.screen[2])
    : toWorld(Math.max(-spine.x, Math.min(spine.x, local.x)), Math.max(-spine.z, Math.min(spine.z, local.z)));
  const seen = toFigure(focus.x, focus.z);
  const blocked = occupied.map((c) => ({ ...toModel(c.x, c.z), radius: c.radius }));
  /** How squarely a sitter at a model place, turned to what it looks at, faces the camera: 1 full face, -1 its back. */
  const shown = (x: number, z: number) => {
    if (!view) return 0;
    const from = toWorld(x, z);
    const length = Math.hypot(focus.x - from.x, focus.z - from.z);
    return length < 1e-6 ? 0 : ((focus.x - from.x) * view.x + (focus.z - from.z) * view.z) / length;
  };
  const result: WorkAt = {
    heading,
    taken: null,
    place: {
      pose,
      scale,
      height: surface.height,
      edge: (alongZ ? Math.abs(local.z) - halfZ : Math.abs(local.x) - halfX),
      focus: [seen.x, surface.screen ? surface.screen[1] : surface.height, seen.z],
      ...(surface.screen ? { screen: [sin * facing.z - cos * facing.x, sin * facing.x + cos * facing.z] as [number, number] } : {}),
      spot(radius) {
        const clear = (x: number, z: number) => blocked.every((c) => Math.hypot(c.x - x, c.z - z) >= c.radius + radius);
        let found: { x: number; z: number } | undefined;
        if (surface.spots) {
          // The style's places that are wide enough and clear, best first; the camera's side wins when one shows more.
          for (const s of surface.spots) {
            if (s.radius < radius - 1e-6 || !clear(s.x, s.z)) continue;
            if (!found || shown(s.x, s.z) > shown(found.x, found.z) + VIEW_TIE) found = s;
          }
        }
        else if (radius <= halfX && radius <= halfZ) {
          // A clear top: on its edge where the figure stands, else a little along it to either side.
          const near = { x: Math.max(radius - halfX, Math.min(halfX - radius, local.x)), z: Math.max(radius - halfZ, Math.min(halfZ - radius, local.z)) };
          const step = radius * 2 + SLIDE_MARGIN;
          for (const k of [0, 1, -1, 2, -2]) {
            const x = alongZ ? near.x + k * step : near.x,
              z = alongZ ? near.z : near.z + k * step;
            if (Math.abs(x) > halfX - radius + 1e-6 || Math.abs(z) > halfZ - radius + 1e-6 || !clear(x, z)) continue;
            found = { x, z };
            break;
          }
        }
        if (!found) return null;
        const world = toWorld(found.x, found.z);
        result.taken = { ...world, radius };
        return toFigure(world.x, world.z);
      },
    },
  };
  return result;
}

/** What the renderer sets on a desk top, as circles in cells from the desk's centre: its ticket stack and its lamp. */
export function deskClutter(definitionId: string): Circle[] {
  const lead = definitionId === "lead-desk";
  return [
    { x: lead ? -0.5 : 0.35, z: 0, radius: 0.14 },
    { x: lead ? -1.1 : -0.7, z: 0.2, radius: 0.12 },
    ...(lead ? [{ x: 0.75, z: 0, radius: 0.3 }] : []),
  ];
}

/**
 * One work place of every pose, as the building template lays its furniture out (a desk with its seat to the north,
 * a place on the long side of a table, seen from the home camera): what the cast contract checks every figure against.
 */
export function templateWorkPlaces(surfaces: Partial<Record<ModelKey, WorkSurface>>, scale: number): WorkPlace[] {
  const places: WorkPlace[] = [];
  for (const [id, { pose, key }] of Object.entries(WORK_FURNITURE)) {
    const surface = surfaces[key];
    const definition = interiorDefinitions[id];
    if (!surface || !definition) continue;
    const { width, depth } = definition.footprint;
    const desk = pose === "desk" || pose === "lead-desk";
    // The meeting table has places all round it; the others are stood at from their approach cell.
    const approach = pose === "meeting-table" ? { x: 1, z: -1 } : (definition.approaches[0] ?? { x: 0, z: -1 });
    const stand = { x: (approach.x + 0.5 - width / 2) * CELL, z: (approach.z + 0.5 - depth / 2) * CELL };
    const occupied = desk ? deskClutter(id).map((c) => ({ x: c.x * CELL, z: c.z * CELL, radius: c.radius * CELL })) : [];
    places.push(workPlace(pose, surface, { x: 0, z: 0, rotation: desk ? Math.PI : 0 }, stand, scale, occupied, HOME_VIEW).place);
  }
  return places;
}
