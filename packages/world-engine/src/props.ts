/**
 * The parts-JSON prop format (`crewhub-prop/1`): the import format for props made outside the app, for example by an
 * agent with the prop-builder skill. Headless: no renderer, no colours. Semantics (footprint, blocking, approaches)
 * drive the grid; parts are looks only and are checked to fit the footprint, never used for collision.
 *
 * The authoritative prose description is `skills/prop-builder/references/prop-format.md`; a drift test keeps the two
 * in step, so change both together.
 */
import type { Cell, PropDefinition } from "./index.ts";

export const PROP_FORMAT = "crewhub-prop/1";
export const PROP_SHAPES = ["box", "cylinder", "sphere", "cone", "torus"] as const;
/** Named materials only, never hex: the Greenhouse palette family plus the loops project colour names. */
export const PROP_MATERIALS = [
  "timber",
  "timber-light",
  "chalk",
  "cream",
  "paper",
  "sage",
  "moss",
  "leaf",
  "leaf-dark",
  "soil",
  "terracotta",
  "clay",
  "brass",
  "slate",
  "graphite",
  "glass",
  "lamp-glow",
  "coral",
  "tangerine",
  "circle",
  "mist",
  "ink",
] as const;
export const PROP_CATEGORIES = ["work", "rest", "gather", "storage", "greenery", "light", "decoration"] as const;

/** Every numeric limit of the format. World units are metres; one grid cell is `cellSize` wide. */
export const PROP_LIMITS = {
  cellSize: 0.6,
  footprintMin: 1,
  footprintMax: 6,
  partsMin: 1,
  partsMax: 64,
  nameMax: 40,
  descriptionMax: 200,
  tagsMax: 8,
  tagMax: 24,
  slugMax: 40,
  approachesMax: 8,
  sizeMin: 0.01,
  sizeMax: 3,
  /** Parts may stick out of the footprint by this much on each side (a leaf, a handle). */
  overhang: 0.1,
  heightMax: 3,
  positionMax: 5,
  rotationMax: 360,
  cornerRadiusMax: 0.5,
  /** Default rounded-box corner radius, as `Assets.box` in the world. */
  cornerRadiusDefault: 0.04,
  /** The parts together must have at least this volume (cubic metres), so a prop is never invisible. */
  minTotalVolume: 0.0005,
  /** Below this share of the footprint area covered by the parts' outline, the validator warns (not an error). */
  coverageWarning: 0.25,
} as const;

export type PropShape = (typeof PROP_SHAPES)[number];
export type PropMaterial = (typeof PROP_MATERIALS)[number];
export type PropCategory = (typeof PROP_CATEGORIES)[number];
export type Vec3 = [number, number, number];

export interface PropPart {
  shape: PropShape;
  /**
   * World units. box: [width x, height y, depth z]. cylinder: [radiusTop, height, radiusBottom] (one may be 0, not
   * both). cone: [radius, height, 0] (point up). sphere: [radiusX, radiusY, radiusZ] ([r, r, r] for a ball).
   * torus: [radius, tube, 0], lying flat (the hole looks up) before rotation, tube at most radius.
   * Unused components are 0.
   */
  size: Vec3;
  /** Centre of the part, world units, relative to the footprint centre on the floor (y up, floor y = 0). */
  position: Vec3;
  /** Degrees, XYZ order (as three.js Euler "XYZ"). Optional, default [0, 0, 0]. */
  rotation?: Vec3;
  material: PropMaterial;
  /** Rounded box corner radius, box only; default 0.04, clamped to a third of the smallest side. */
  radius?: number;
  /** Glow (lamps, screens). */
  emissive?: boolean;
}
export type PropProvenance = { kind: "ticket"; ticketKey: string } | { kind: "local" };
export interface PropModel {
  format: typeof PROP_FORMAT;
  /** `user:<kebab-slug>` for made props; `builtin:<slug>` reserved for shipped ones. */
  id: string;
  name: string;
  description: string;
  category: PropCategory;
  tags: string[];
  /** Semantics first: the engine's footprint in cells. Collision comes from this, never from parts. */
  footprint: { width: number; depth: number };
  blocksMovement: boolean;
  /** Interaction cells relative to the footprint's first cell (x along width, z along depth), may be just outside. */
  approaches: Cell[];
  parts: PropPart[];
  /** Where it came from once in the catalogue: a ticket key or "local". Optional in files. */
  provenance?: PropProvenance;
}
export interface PropIssue {
  /** Where, as `parts[3].size[1]`; `(root)` for the whole document. */
  path: string;
  message: string;
}
export type PropValidation =
  | { ok: true; value: PropModel; warnings: PropIssue[] }
  | { ok: false; errors: PropIssue[]; warnings: PropIssue[] };

export const PROP_ID_PATTERN = /^(user|builtin):[a-z0-9]+(-[a-z0-9]+)*$/;
export const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TICKET_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const L = PROP_LIMITS;
const EPSILON = 1e-6;
const MODEL_KEYS = [
  "format",
  "id",
  "name",
  "description",
  "category",
  "tags",
  "footprint",
  "blocksMovement",
  "approaches",
  "parts",
  "provenance",
] as const;
const PART_KEYS = ["shape", "size", "position", "rotation", "material", "radius", "emissive"] as const;

type Record_ = Record<string, unknown>;
const isObject = (v: unknown): v is Record_ => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const join = (base: string, key: string | number) =>
  typeof key === "number" ? `${base}[${key}]` : base ? `${base}.${key}` : key;
const quote = (values: readonly string[]) => values.map((v) => `"${v}"`).join(", ");

/** Which size components a shape uses; the others must be 0. */
const usedAxes = (shape: PropShape): readonly boolean[] =>
  shape === "cone" || shape === "torus" ? [true, true, false] : [true, true, true];

/** Row-major 3x3 rotation matrix for three.js Euler "XYZ" in degrees (R = Rx * Ry * Rz). */
export function rotationMatrix(rotation: Vec3): number[] {
  const [a, b, c] = rotation.map((d) => (d * Math.PI) / 180) as Vec3;
  const ca = Math.cos(a),
    sa = Math.sin(a),
    cb = Math.cos(b),
    sb = Math.sin(b),
    cc = Math.cos(c),
    sc = Math.sin(c);
  return [
    cb * cc,
    -cb * sc,
    sb,
    ca * sc + sa * sb * cc,
    ca * cc - sa * sb * sc,
    -sa * cb,
    sa * sc - ca * sb * cc,
    sa * cc + ca * sb * sc,
    ca * cb,
  ];
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Exact axis-aligned bounds of a part after rotation, in the prop's frame. */
export function partBounds(part: Pick<PropPart, "shape" | "size" | "position" | "rotation">): Bounds {
  const m = rotationMatrix(part.rotation ?? [0, 0, 0]);
  const [s0, s1, s2] = part.size;
  const min: Vec3 = [...part.position],
    max: Vec3 = [...part.position];
  for (let i = 0; i < 3; i++) {
    const rx = m[i * 3]!,
      ry = m[i * 3 + 1]!,
      rz = m[i * 3 + 2]!;
    // ry is the part's own up axis seen along world axis i; a circle across that axis spans sqrt(1 - ry^2).
    const across = Math.sqrt(Math.max(0, 1 - ry * ry));
    let lo: number, hi: number;
    switch (part.shape) {
      case "box":
        hi = (Math.abs(rx) * s0 + Math.abs(ry) * s1 + Math.abs(rz) * s2) / 2;
        lo = -hi;
        break;
      case "sphere":
        hi = Math.hypot(rx * s0, ry * s1, rz * s2);
        lo = -hi;
        break;
      case "cylinder":
      case "cone": {
        // Two end discs: the top (radius s0, or a point for a cone) at +height/2, the bottom at -height/2.
        const top = part.shape === "cone" ? 0 : s0,
          bottom = part.shape === "cone" ? s0 : s2,
          end = (ry * s1) / 2;
        hi = Math.max(end + top * across, -end + bottom * across);
        lo = Math.min(end - top * across, -end - bottom * across);
        break;
      }
      case "torus":
        hi = s0 * across + s1;
        lo = -hi;
        break;
    }
    min[i] = min[i]! + lo;
    max[i] = max[i]! + hi;
  }
  return { min, max };
}

function partVolume(part: PropPart): number {
  const [a, b, c] = part.size;
  switch (part.shape) {
    case "box":
      return a * b * c;
    case "sphere":
      return (4 / 3) * Math.PI * a * b * c;
    case "cylinder":
      return (Math.PI * b * (a * a + a * c + c * c)) / 3;
    case "cone":
      return (Math.PI * b * a * a) / 3;
    case "torus":
      return 2 * Math.PI * Math.PI * a * b * b;
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Strict validation of an imported prop. Unknown keys are errors (a prop file is an import format). Returns every
 * error with a precise path, plus warnings that do not block import.
 */
export function validatePropModel(value: unknown): PropValidation {
  const errors: PropIssue[] = [];
  const warnings: PropIssue[] = [];
  const error = (path: string, message: string) => errors.push({ path: path || "(root)", message });
  const unknownKeys = (obj: Record_, allowed: readonly string[], path: string) => {
    for (const key of Object.keys(obj))
      if (!allowed.includes(key)) error(join(path, key), `unknown key (allowed: ${allowed.join(", ")})`);
  };
  const integer = (v: unknown, path: string, min: number, max: number) => {
    if (!Number.isInteger(v)) error(path, "must be an integer");
    else if ((v as number) < min || (v as number) > max) error(path, `must be between ${min} and ${max}`);
  };
  const string = (v: unknown, path: string, min: number, max: number): v is string => {
    if (typeof v !== "string") {
      error(path, "must be a string");
      return false;
    }
    if (v.trim().length < min || v.length > max)
      error(path, min > 0 ? `must be ${min} to ${max} characters` : `must be at most ${max} characters`);
    return true;
  };
  const vec3 = (v: unknown, path: string, check: (n: number, p: string, i: number) => void): v is Vec3 => {
    if (!Array.isArray(v) || v.length !== 3) {
      error(path, "must be an array of three numbers");
      return false;
    }
    let ok = true;
    v.forEach((n, i) => {
      if (!isNumber(n)) {
        error(join(path, i), "must be a finite number");
        ok = false;
      } else check(n, join(path, i), i);
    });
    return ok;
  };

  if (!isObject(value)) {
    error("", "a prop must be a JSON object");
    return { ok: false, errors, warnings };
  }
  unknownKeys(value, MODEL_KEYS, "");
  for (const key of MODEL_KEYS)
    if (key !== "provenance" && !(key in value)) error(key, "is required");

  if ("format" in value && value.format !== PROP_FORMAT) error("format", `must be "${PROP_FORMAT}"`);
  if ("id" in value && typeof value.id !== "string") error("id", "must be a string");
  else if (typeof value.id === "string") {
    const slug = value.id.slice(value.id.indexOf(":") + 1);
    if (!PROP_ID_PATTERN.test(value.id))
      error("id", 'must be "user:<kebab-slug>" (lowercase letters, digits and single hyphens), or "builtin:<slug>"');
    else if (slug.length > L.slugMax) error("id", `slug must be at most ${L.slugMax} characters`);
  }
  if ("name" in value) string(value.name, "name", 1, L.nameMax);
  if ("description" in value) string(value.description, "description", 0, L.descriptionMax);
  if ("category" in value && !PROP_CATEGORIES.includes(value.category as PropCategory))
    error("category", `must be one of ${quote(PROP_CATEGORIES)}`);
  if ("tags" in value) {
    if (!Array.isArray(value.tags)) error("tags", "must be an array of strings");
    else {
      if (value.tags.length > L.tagsMax) error("tags", `must have at most ${L.tagsMax} tags`);
      const seen = new Set<string>();
      value.tags.forEach((tag, i) => {
        const path = join("tags", i);
        if (typeof tag !== "string" || !TAG_PATTERN.test(tag) || tag.length > L.tagMax)
          error(path, `must be a kebab-case string of at most ${L.tagMax} characters`);
        else if (seen.has(tag)) error(path, `duplicate tag "${tag}"`);
        else seen.add(tag);
      });
    }
  }

  let footprint: { width: number; depth: number } | null = null;
  if ("footprint" in value) {
    const f = value.footprint;
    if (!isObject(f)) error("footprint", "must be an object { width, depth }");
    else {
      unknownKeys(f, ["width", "depth"], "footprint");
      const before = errors.length;
      integer(f.width, "footprint.width", L.footprintMin, L.footprintMax);
      integer(f.depth, "footprint.depth", L.footprintMin, L.footprintMax);
      if (errors.length === before) footprint = { width: f.width as number, depth: f.depth as number };
    }
  }
  if ("blocksMovement" in value && typeof value.blocksMovement !== "boolean")
    error("blocksMovement", "must be true or false");

  if ("approaches" in value) {
    if (!Array.isArray(value.approaches)) error("approaches", "must be an array of { x, z } cells");
    else {
      if (value.approaches.length > L.approachesMax)
        error("approaches", `must have at most ${L.approachesMax} cells`);
      const seen = new Set<string>();
      value.approaches.forEach((c, i) => {
        const path = join("approaches", i);
        if (!isObject(c)) return error(path, "must be an object { x, z }");
        unknownKeys(c, ["x", "z"], path);
        if (!Number.isInteger(c.x) || !Number.isInteger(c.z)) return error(path, "x and z must be integers");
        const x = c.x as number,
          z = c.z as number;
        if (seen.has(`${x},${z}`)) return error(path, "duplicate approach cell");
        seen.add(`${x},${z}`);
        if (!footprint) return;
        if (x < -1 || z < -1 || x > footprint.width || z > footprint.depth)
          error(path, `must be inside the footprint or one cell around it (x -1..${footprint.width}, z -1..${footprint.depth})`);
        else if (value.blocksMovement === true && x >= 0 && z >= 0 && x < footprint.width && z < footprint.depth)
          error(path, "is inside a blocking footprint, so nobody can stand there; put it one cell outside");
      });
    }
  }

  const validParts: PropPart[] = [];
  if ("parts" in value) {
    if (!Array.isArray(value.parts)) error("parts", "must be an array");
    else {
      if (value.parts.length < L.partsMin || value.parts.length > L.partsMax)
        error("parts", `must have ${L.partsMin} to ${L.partsMax} parts`);
      value.parts.forEach((p, i) => {
        const part = validatePart(p, join("parts", i));
        if (part) validParts.push(part);
      });
    }
  }

  function validatePart(p: unknown, path: string): PropPart | null {
    if (!isObject(p)) {
      error(path, "must be an object");
      return null;
    }
    const before = errors.length;
    unknownKeys(p, PART_KEYS, path);
    for (const key of ["shape", "size", "position", "material"])
      if (!(key in p)) error(join(path, key), "is required");
    const shape = PROP_SHAPES.includes(p.shape as PropShape) ? (p.shape as PropShape) : null;
    if ("shape" in p && !shape) error(join(path, "shape"), `must be one of ${quote(PROP_SHAPES)}`);
    if ("material" in p && !PROP_MATERIALS.includes(p.material as PropMaterial))
      error(join(path, "material"), `must be one of the named materials (${quote(PROP_MATERIALS)}); hex colours are not allowed`);
    if ("size" in p && shape) {
      const used = usedAxes(shape);
      vec3(p.size, join(path, "size"), (n, at, i) => {
        // A cylinder radius may be 0 (a point); every other used size is at least sizeMin.
        const min = shape === "cylinder" && i !== 1 ? 0 : L.sizeMin;
        if (!used[i]) {
          if (n !== 0) error(at, `must be 0 (unused for ${shape})`);
        } else if (n < min || n > L.sizeMax) error(at, `must be between ${min} and ${L.sizeMax}`);
      });
      if (Array.isArray(p.size) && isNumber(p.size[0]) && isNumber(p.size[2]) && isNumber(p.size[1])) {
        if (shape === "cylinder" && Math.max(p.size[0], p.size[2]) < L.sizeMin)
          error(join(path, "size"), `a cylinder needs radiusTop or radiusBottom of at least ${L.sizeMin}`);
        if (shape === "torus" && p.size[1] > p.size[0]) error(join(path, "size[1]"), "tube must be at most the radius (size[0])");
      }
    }
    if ("position" in p)
      vec3(p.position, join(path, "position"), (n, at) => {
        if (Math.abs(n) > L.positionMax) error(at, `must be between -${L.positionMax} and ${L.positionMax}`);
      });
    if ("rotation" in p)
      vec3(p.rotation, join(path, "rotation"), (n, at) => {
        if (Math.abs(n) > L.rotationMax) error(at, `must be between -${L.rotationMax} and ${L.rotationMax} degrees`);
      });
    if ("radius" in p) {
      if (shape && shape !== "box") error(join(path, "radius"), "is only allowed on a box");
      else if (!isNumber(p.radius) || p.radius < 0 || p.radius > L.cornerRadiusMax)
        error(join(path, "radius"), `must be between 0 and ${L.cornerRadiusMax}`);
    }
    if ("emissive" in p && typeof p.emissive !== "boolean") error(join(path, "emissive"), "must be true or false");
    if (errors.length !== before) return null;

    const part = p as unknown as PropPart;
    if (footprint) {
      const b = partBounds(part);
      const hx = (footprint.width * L.cellSize) / 2 + L.overhang,
        hz = (footprint.depth * L.cellSize) / 2 + L.overhang;
      const fmt = (b0: number, b1: number) => `${round(b0)}..${round(b1)}`;
      if (b.max[1] <= 0) error(path, `is fully below the floor (y ${fmt(b.min[1], b.max[1])})`);
      else if (b.min[1] < -EPSILON)
        error(join(path, "position[1]"), `part reaches below the floor (bottom at y ${round(b.min[1])}); the floor is y = 0`);
      if (b.max[1] > L.heightMax + EPSILON)
        error(join(path, "position[1]"), `part reaches above ${L.heightMax} (top at y ${round(b.max[1])})`);
      if (b.min[0] < -hx - EPSILON || b.max[0] > hx + EPSILON)
        error(join(path, "position[0]"), `part spans x ${fmt(b.min[0], b.max[0])}, outside the footprint's ±${round(hx)} (width ${footprint.width} cells × ${L.cellSize} / 2 + ${L.overhang} overhang)`);
      if (b.min[2] < -hz - EPSILON || b.max[2] > hz + EPSILON)
        error(join(path, "position[2]"), `part spans z ${fmt(b.min[2], b.max[2])}, outside the footprint's ±${round(hz)} (depth ${footprint.depth} cells × ${L.cellSize} / 2 + ${L.overhang} overhang)`);
    }
    return part;
  }

  if ("provenance" in value) {
    const pv = value.provenance;
    if (!isObject(pv)) error("provenance", 'must be { "kind": "local" } or { "kind": "ticket", "ticketKey": "…" }');
    else if (pv.kind === "local") unknownKeys(pv, ["kind"], "provenance");
    else if (pv.kind === "ticket") {
      unknownKeys(pv, ["kind", "ticketKey"], "provenance");
      if (typeof pv.ticketKey !== "string" || !TICKET_KEY_PATTERN.test(pv.ticketKey))
        error("provenance.ticketKey", "must be a ticket key such as CREW-12");
    } else error("provenance.kind", 'must be "ticket" or "local"');
  }

  const allPartsValid = Array.isArray(value.parts) && validParts.length === value.parts.length;
  if (allPartsValid && validParts.length) {
    const volume = validParts.reduce((sum, p) => sum + partVolume(p), 0);
    if (volume < L.minTotalVolume)
      error("parts", `are too small to see: total volume ${volume.toExponential(2)} m³, needs at least ${L.minTotalVolume}`);
    if (footprint) {
      const hx = (footprint.width * L.cellSize) / 2,
        hz = (footprint.depth * L.cellSize) / 2;
      let x0 = Infinity,
        x1 = -Infinity,
        z0 = Infinity,
        z1 = -Infinity;
      for (const p of validParts) {
        const b = partBounds(p);
        x0 = Math.min(x0, b.min[0]);
        x1 = Math.max(x1, b.max[0]);
        z0 = Math.min(z0, b.min[2]);
        z1 = Math.max(z1, b.max[2]);
      }
      const covered =
        (Math.max(0, Math.min(x1, hx) - Math.max(x0, -hx)) * Math.max(0, Math.min(z1, hz) - Math.max(z0, -hz))) /
        (4 * hx * hz);
      if (covered < L.coverageWarning)
        warnings.push({
          path: "footprint",
          message: `the parts' outline covers only ${Math.round(covered * 100)}% of the ${footprint.width}×${footprint.depth} footprint (warning below ${L.coverageWarning * 100}%); shrink the footprint or widen the model`,
        });
    }
  }

  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, value: structuredClone(value) as unknown as PropModel, warnings };
}

/** The engine record: footprint, blocking, tags (category first) and approaches. Geometry never enters it. */
export function toPropDefinition(model: PropModel): PropDefinition {
  return {
    id: model.id,
    label: model.name,
    footprint: { width: model.footprint.width, depth: model.footprint.depth },
    blocksMovement: model.blocksMovement,
    tags: [model.category, ...model.tags.filter((t) => t !== model.category)],
    approaches: model.approaches.map((c) => ({ x: c.x, z: c.z })),
  };
}
