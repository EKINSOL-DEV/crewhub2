/* The minimal prop editor's model (plan 6.2): a crewhub-prop/1 draft edited by adding primitives and moving, turning
   and sizing them on a grid, with named materials only. Pure; the editor card (components/PropEditor.tsx) renders
   it and saves through world-engine's `validatePropModel`, the same code as the prop:validate CLI. Zero cost: no
   model path. */
import { PROP_FORMAT, PROP_LIMITS, type PropModel, type PropPart, type PropShape, type Vec3 } from "@crewhub/world-engine";

/** Moves and sizes snap to 5 cm; turns snap to 15 degrees. */
export const EDITOR_STEP = 0.05;
export const TURN_STEP = 15;

/** Rounds to the step without floating dust (0.15, never 0.15000000000000002). */
export function snap(value: number, step = EDITOR_STEP): number {
  if (!Number.isFinite(value)) return 0;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  return Number((Math.round(value / step) * step).toFixed(decimals)) || 0;
}

const snapVec = (v: Vec3, step: number): Vec3 => [snap(v[0], step), snap(v[1], step), snap(v[2], step)];

/** Snaps position and size to the grid and the turn to its step. Sizes keep their unused components at 0. */
export function snapPart(part: PropPart): PropPart {
  const size = snapVec(part.size, EDITOR_STEP);
  const next: PropPart = { ...part, size, position: snapVec(part.position, EDITOR_STEP) };
  if (part.rotation) next.rotation = snapVec(part.rotation, TURN_STEP);
  return next;
}

/** A new primitive standing on the floor at the footprint centre, small enough for a one-cell footprint. */
export function newPart(shape: PropShape): PropPart {
  switch (shape) {
    case "box":
      return { shape, size: [0.3, 0.3, 0.3], position: [0, 0.15, 0], material: "timber" };
    case "cylinder":
      return { shape, size: [0.15, 0.3, 0.15], position: [0, 0.15, 0], material: "clay" };
    case "sphere":
      return { shape, size: [0.15, 0.15, 0.15], position: [0, 0.15, 0], material: "sage" };
    case "cone":
      return { shape, size: [0.15, 0.3, 0], position: [0, 0.15, 0], material: "leaf" };
    case "torus":
      return { shape, size: [0.15, 0.05, 0], position: [0, 0.05, 0], material: "brass" };
    case "wedge":
      return { shape, size: [0.15, 0.1, 0.15], position: [0, 0.05, 0], material: "cream", sweep: 90 };
  }
}

/** Which size components a shape uses, and what they are called, for the editor's fields. */
export const SIZE_FIELDS: Record<PropShape, readonly (string | null)[]> = {
  box: ["width", "height", "depth"],
  cylinder: ["top radius", "height", "bottom radius"],
  sphere: ["radius x", "radius y", "radius z"],
  cone: ["radius", "height", null],
  torus: ["radius", "tube", null],
  wedge: ["top radius", "height", "bottom radius"],
};

/** `user:<slug>` from a name; `user:prop` when the name has no letters or digits. */
export function propIdFor(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROP_LIMITS.slugMax)
    .replace(/-+$/, "");
  return `user:${slug || "prop"}`;
}

export function blankProp(): PropModel {
  return {
    format: PROP_FORMAT,
    id: "user:new-prop",
    name: "New prop",
    description: "Made in the prop editor.",
    category: "decoration",
    tags: [],
    footprint: { width: 1, depth: 1 },
    blocksMovement: true,
    approaches: [],
    parts: [newPart("box")],
    provenance: { kind: "local" },
  };
}

/**
 * The draft as it will be saved: a new prop takes its id from its name (an edited prop keeps its id, so its
 * placements keep pointing at it), and a prop made or imported here is local.
 */
export function draftToModel(draft: PropModel, keepId: string | null): PropModel {
  return { ...draft, id: keepId ?? propIdFor(draft.name), provenance: { kind: "local" }, parts: draft.parts.map(snapPart) };
}
