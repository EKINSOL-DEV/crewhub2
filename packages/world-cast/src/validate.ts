/* Validators for the cast data formats: `cast.json` (crewhub-cast/1), `figure.json` (crewhub-figure/1) and a re-dress
   (crewhub-figure-patch/1). Pure and hand-written, like the prop validator: every problem is one line with its path. */
import { PROP_SHAPES } from "@crewhub/world-engine";
import type { CastManifest, FigurePatch, FigureSpec } from "./index.ts";
import { CAST_ROLES, FIGURE_ACTIVITIES, WORK_POSES } from "./names.ts";

export type CastValidation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const WAVES = ["sine", "bounce", "lift", "blink", "glance"];
const CHANNELS = ["rotation", "offset", "scale"].flatMap((c) => ["x", "y", "z"].map((axis) => `${c}.${axis}`));
const POSE_KEYS = [...FIGURE_ACTIVITIES, "waiting", "carrying"];
const MOTION_KEYS = [...FIGURE_ACTIVITIES, "waiting", "always"];
const LOOK_KEYS = [...FIGURE_ACTIVITIES, "waiting", "alert", "near", "hover", "selected"];
const PERCH_KEYS = [...WORK_POSES, "default"];
const PART_KEYS = ["id", "joint", "shape", "size", "position", "rotation", "radius", "sweep", "color", "glow", "roles", "activities", "waiting", "carrying", "detail"];
/** A step is plain shapes in a colour: it has no joints, roles or states. */
const STEP_PART_KEYS = ["shape", "size", "position", "rotation", "radius", "sweep", "color"];
/** A colour in cast data: a hex colour. Names resolve through the cast's colours and the style. */
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
/** The largest a figure part or offset may be, in world units: a figure is about one and a half units tall. */
const REACH = 4;

type Bag = Record<string, unknown>;
const isObject = (value: unknown): value is Bag => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;

class Report {
  readonly errors: string[] = [];
  error(path: string, message: string) {
    this.errors.push(`${path}: ${message}`);
  }
  vec3(value: unknown, path: string, limit = REACH): boolean {
    if (Array.isArray(value) && value.length === 3 && value.every((n) => isNumber(n) && Math.abs(n) <= limit)) return true;
    this.error(path, `must be three numbers within ±${limit}`);
    return false;
  }
  keys(value: Bag, allowed: readonly string[], path: string) {
    for (const key of Object.keys(value)) if (!allowed.includes(key)) this.error(`${path}.${key}`, `is not a known field (${allowed.join(", ")})`);
  }
  done<T>(value: unknown): CastValidation<T> {
    return this.errors.length ? { ok: false, errors: this.errors } : { ok: true, value: value as T };
  }
}

export function validateCastManifest(value: unknown): CastValidation<CastManifest> {
  const r = new Report();
  if (!isObject(value)) return { ok: false, errors: ["cast: must be an object"] };
  r.keys(value, ["format", "id", "name", "version", "description", "author", "extends", "colors", "budget"], "cast");
  if (value.format !== "crewhub-cast/1") r.error("cast.format", 'must be "crewhub-cast/1"');
  if (!isText(value.id) || !ID.test(value.id)) r.error("cast.id", "must be lowercase letters, digits and dashes");
  if (!isText(value.name)) r.error("cast.name", "must be a name");
  if (!isText(value.version) || !SEMVER.test(value.version)) r.error("cast.version", "must be a semver like 1.0.0");
  if (!isText(value.description)) r.error("cast.description", "must be one or two sentences");
  if ("author" in value && !isText(value.author)) r.error("cast.author", "must be text");
  if ("extends" in value && (!isText(value.extends) || !ID.test(value.extends) || value.extends === value.id)) r.error("cast.extends", "must be another cast's id");
  if (!isObject(value.colors)) r.error("cast.colors", "must be an object of colour names");
  else
    for (const [name, color] of Object.entries(value.colors)) {
      const path = `cast.colors.${name}`;
      if (!ID.test(name)) r.error(path, "a colour name is lowercase letters, digits and dashes");
      if (!isObject(color)) r.error(path, "must be { day, lamplight }");
      else for (const theme of ["day", "lamplight"]) if (!isText(color[theme]) || !HEX.test(color[theme])) r.error(`${path}.${theme}`, "must be a six-digit hex colour");
    }
  if (!isObject(value.budget)) r.error("cast.budget", "must be { nearTriangles, farTriangles, nearMeshes, farMeshes }");
  else
    for (const key of ["nearTriangles", "farTriangles", "nearMeshes", "farMeshes"]) {
      const n = value.budget[key];
      if (!isNumber(n) || n <= 0 || !Number.isInteger(n)) r.error(`cast.budget.${key}`, "must be a whole number above 0");
    }
  return r.done(value);
}

function colorName(r: Report, value: unknown, path: string) {
  if (!isText(value)) r.error(path, "must be a colour name");
  else if (value.startsWith("#")) r.error(path, "must be a colour name; hex colours live in cast.json");
}

function parts(r: Report, value: unknown, path: string, joints: ReadonlySet<string> | null, ids: Set<string>, keys: readonly string[] = PART_KEYS) {
  if (!Array.isArray(value)) return r.error(path, "must be a list of parts");
  value.forEach((part: unknown, i) => {
    const at = `${path}[${i}]`;
    if (!isObject(part)) return r.error(at, "must be an object");
    r.keys(part, keys, at);
    if (!PROP_SHAPES.includes(part.shape as (typeof PROP_SHAPES)[number])) r.error(`${at}.shape`, `must be one of ${PROP_SHAPES.join(", ")}`);
    if (r.vec3(part.size, `${at}.size`) && (part.size as number[]).some((n) => n < 0)) r.error(`${at}.size`, "must not be negative");
    r.vec3(part.position, `${at}.position`);
    if ("rotation" in part) r.vec3(part.rotation, `${at}.rotation`, 360);
    if ("radius" in part && (!isNumber(part.radius) || part.radius < 0)) r.error(`${at}.radius`, "must be a number, 0 or more");
    if ("sweep" in part && (!isNumber(part.sweep) || part.sweep <= 0 || part.sweep > 360)) r.error(`${at}.sweep`, "must be degrees, above 0 and at most 360");
    colorName(r, part.color, `${at}.color`);
    if ("glow" in part && !isNumber(part.glow)) colorName(r, part.glow, `${at}.glow`);
    if ("id" in part) {
      if (!isText(part.id) || !ID.test(part.id)) r.error(`${at}.id`, "must be lowercase letters, digits and dashes");
      else if (ids.has(part.id)) r.error(`${at}.id`, `"${part.id}" is used twice`);
      else ids.add(part.id);
    }
    if ("joint" in part && (!isText(part.joint) || (joints && !joints.has(part.joint)))) r.error(`${at}.joint`, "must be a joint of the figure");
    for (const [key, allowed] of [["roles", CAST_ROLES], ["activities", FIGURE_ACTIVITIES]] as const)
      if (key in part && !(Array.isArray(part[key]) && part[key].length && part[key].every((x) => (allowed as readonly unknown[]).includes(x))))
        r.error(`${at}.${key}`, `must be a list of ${allowed.join(", ")}`);
    for (const key of ["waiting", "carrying"]) if (key in part && typeof part[key] !== "boolean") r.error(`${at}.${key}`, "must be true or false");
    if ("detail" in part && part.detail !== "near") r.error(`${at}.detail`, 'must be "near"');
  });
}

function jointList(r: Report, value: unknown, path: string, known: Set<string>) {
  if (!Array.isArray(value)) return r.error(path, "must be a list of joints");
  value.forEach((joint: unknown, i) => {
    const at = `${path}[${i}]`;
    if (!isObject(joint)) return r.error(at, "must be an object");
    r.keys(joint, ["id", "parent", "position"], at);
    r.vec3(joint.position, `${at}.position`);
    // A parent is declared before its children, so a rig can never loop.
    if ("parent" in joint && (!isText(joint.parent) || !known.has(joint.parent))) r.error(`${at}.parent`, "must be a joint declared earlier (or left out for the root)");
    if (!isText(joint.id) || !ID.test(joint.id)) r.error(`${at}.id`, "must be lowercase letters, digits and dashes");
    else if (known.has(joint.id)) r.error(`${at}.id`, `"${joint.id}" is used twice`);
    else known.add(joint.id);
  });
}

function poses(r: Report, value: unknown, path: string, joints: ReadonlySet<string> | null) {
  if (!isObject(value)) return r.error(path, "must be an object of poses");
  r.keys(value, POSE_KEYS, path);
  for (const [key, pose] of Object.entries(value)) {
    if (!isObject(pose)) {
      r.error(`${path}.${key}`, "must be an object of joints");
      continue;
    }
    jointPoses(r, pose, `${path}.${key}`, joints);
  }
}

/** One still pose: joints → { rotation, offset, scale }. */
function jointPoses(r: Report, pose: Bag, path: string, joints: ReadonlySet<string> | null) {
  for (const [joint, change] of Object.entries(pose)) {
    const at = `${path}.${joint}`;
    if (joints && !joints.has(joint)) r.error(at, "is not a joint of the figure");
    if (!isObject(change)) {
      r.error(at, "must be { rotation, offset, scale }");
      continue;
    }
    r.keys(change, ["rotation", "offset", "scale"], at);
    if ("rotation" in change) r.vec3(change.rotation, `${at}.rotation`, 360);
    if ("offset" in change) r.vec3(change.offset, `${at}.offset`);
    if ("scale" in change && r.vec3(change.scale, `${at}.scale`) && (change.scale as number[]).some((n) => n <= 0)) r.error(`${at}.scale`, "must be above 0");
  }
}

/** The perches of a figure: per work pose or `default`, a step of its own, the top itself, or the floor. */
function perches(r: Report, value: unknown, path: string, joints: ReadonlySet<string> | null, slots: Bag | null) {
  if (!isObject(value)) return r.error(path, "must be an object of perches per work pose");
  r.keys(value, PERCH_KEYS, path);
  for (const [pose, perch] of Object.entries(value)) {
    const at = `${path}.${pose}`;
    if (!isObject(perch) || !["floor", "step", "surface"].includes(perch.kind as string)) {
      r.error(`${at}.kind`, 'must be "floor", "step" or "surface"');
      continue;
    }
    r.keys(perch, perch.kind === "step" ? ["kind", "steps", "gap", "pose"] : perch.kind === "surface" ? ["kind", "base", "pose"] : ["kind"], at);
    if ("pose" in perch) {
      if (!isObject(perch.pose)) r.error(`${at}.pose`, "must be an object of joints");
      else jointPoses(r, perch.pose, `${at}.pose`, joints);
    }
    if ("base" in perch && (!isNumber(perch.base) || perch.base <= 0 || perch.base > REACH)) r.error(`${at}.base`, `must be a radius above 0 and at most ${REACH}`);
    if (perch.kind !== "step") continue;
    if ("gap" in perch && (!isNumber(perch.gap) || perch.gap < 0 || perch.gap > REACH)) r.error(`${at}.gap`, `must be a number from 0 to ${REACH}`);
    if (!Array.isArray(perch.steps) || !perch.steps.length) {
      r.error(`${at}.steps`, "must list at least one step");
      continue;
    }
    const ids = new Set<string>();
    perch.steps.forEach((step: unknown, i) => {
      const s = `${at}.steps[${i}]`;
      if (!isObject(step)) return r.error(s, "must be { id, height, parts }");
      r.keys(step, ["id", "height", "parts"], s);
      if (!isText(step.id) || !ID.test(step.id)) r.error(`${s}.id`, "must be lowercase letters, digits and dashes");
      else if (ids.has(step.id)) r.error(`${s}.id`, `"${step.id}" is used twice`);
      else ids.add(step.id);
      if (!isNumber(step.height) || step.height <= 0 || step.height > REACH) r.error(`${s}.height`, `must be a number above 0 and at most ${REACH}`);
      parts(r, step.parts, `${s}.parts`, null, new Set(), STEP_PART_KEYS);
      if (Array.isArray(step.parts)) {
        if (!step.parts.length) r.error(`${s}.parts`, "must list at least one part");
        step.parts.forEach((part: unknown, j) => {
          const color = isObject(part) && typeof part.color === "string" ? part.color : "";
          if (slots && color.startsWith("slot:") && !(color.slice(5) in slots)) r.error(`${s}.parts[${j}].color`, `"${color}" names no colourway slot`);
        });
      }
    });
  }
}

function motions(r: Report, value: unknown, path: string, joints: ReadonlySet<string> | null) {
  if (!isObject(value)) return r.error(path, "must be an object of motions");
  r.keys(value, MOTION_KEYS, path);
  for (const [key, list] of Object.entries(value)) {
    if (!Array.isArray(list)) {
      r.error(`${path}.${key}`, "must be a list of motions");
      continue;
    }
    list.forEach((motion: unknown, i) => {
      const at = `${path}.${key}[${i}]`;
      if (!isObject(motion)) return r.error(at, "must be an object");
      r.keys(motion, ["joint", "channel", "wave", "amplitude", "period", "phase", "seeded", "sided", "rests"], at);
      if (!isText(motion.joint) || (joints && !joints.has(motion.joint))) r.error(`${at}.joint`, "must be a joint of the figure");
      if (!CHANNELS.includes(motion.channel as string)) r.error(`${at}.channel`, `must be one of ${CHANNELS.join(", ")}`);
      if (!WAVES.includes(motion.wave as string)) r.error(`${at}.wave`, `must be one of ${WAVES.join(", ")}`);
      if (!isNumber(motion.amplitude) || Math.abs(motion.amplitude) > 360) r.error(`${at}.amplitude`, "must be a number");
      if (!isNumber(motion.period) || motion.period < 0.1) r.error(`${at}.period`, "must be seconds, 0.1 or more");
      if ("phase" in motion && !isNumber(motion.phase)) r.error(`${at}.phase`, "must be a number of periods");
      for (const flag of ["seeded", "sided", "rests"]) if (flag in motion && typeof motion[flag] !== "boolean") r.error(`${at}.${flag}`, "must be true or false");
    });
  }
}

function looks(r: Report, value: unknown, path: string, ids: ReadonlySet<string> | null) {
  if (!isObject(value)) return r.error(path, "must be an object of looks");
  r.keys(value, LOOK_KEYS, path);
  for (const [key, look] of Object.entries(value)) {
    const at = `${path}.${key}`;
    if (!isObject(look) || !isObject(look.parts)) {
      r.error(at, "must be { parts }");
      continue;
    }
    for (const [id, change] of Object.entries(look.parts)) {
      if (ids && !ids.has(id)) r.error(`${at}.parts.${id}`, "is not a part id of the figure");
      if (!isObject(change)) {
        r.error(`${at}.parts.${id}`, "must be { color, glow }");
        continue;
      }
      r.keys(change, ["color", "glow"], `${at}.parts.${id}`);
      if ("color" in change) colorName(r, change.color, `${at}.parts.${id}.color`);
      if ("glow" in change && !isNumber(change.glow)) colorName(r, change.glow, `${at}.parts.${id}.glow`);
    }
  }
}

function colorways(r: Report, value: unknown, path: string) {
  if (!isObject(value)) return r.error(path, "must be an object of colourway slots");
  for (const [slot, way] of Object.entries(value)) {
    const at = `${path}.${slot}`;
    if (!isObject(way)) {
      r.error(at, "must be { lead, roles, others }");
      continue;
    }
    r.keys(way, ["lead", "roles", "others"], at);
    if ("lead" in way) colorName(r, way.lead, `${at}.lead`);
    if ("roles" in way) {
      if (!isObject(way.roles)) r.error(`${at}.roles`, "must be an object of roles");
      else
        for (const [role, color] of Object.entries(way.roles)) {
          if (!(CAST_ROLES as readonly string[]).includes(role)) r.error(`${at}.roles.${role}`, "is not a role");
          colorName(r, color, `${at}.roles.${role}`);
        }
    }
    if (!Array.isArray(way.others) || !way.others.length) r.error(`${at}.others`, "must list at least one colour");
    else way.others.forEach((color: unknown, i) => (color === "accent" || color === "soft:accent" ? r.error(`${at}.others[${i}]`, "must be a colour name, not the accent") : colorName(r, color, `${at}.others[${i}]`)));
  }
}

function anchors(r: Report, value: unknown, path: string, partial: boolean) {
  if (!isObject(value)) return r.error(path, "must be { label, carry, ground, height }");
  r.keys(value, ["label", "carry", "ground", "height", "eyes"], path);
  for (const key of ["label", "carry"]) if (!partial || key in value) r.vec3(value[key], `${path}.${key}`);
  if ("eyes" in value) r.vec3(value.eyes, `${path}.eyes`);
  for (const key of ["ground", "height"]) {
    const n = value[key];
    if ((!partial || key in value) && (!isNumber(n) || n <= 0 || n > REACH)) r.error(`${path}.${key}`, `must be a number above 0 and at most ${REACH}`);
  }
}

export function validateFigure(value: unknown): CastValidation<FigureSpec> {
  const r = new Report();
  if (!isObject(value)) return { ok: false, errors: ["figure: must be an object"] };
  r.keys(value, ["format", "joints", "parts", "poses", "motions", "looks", "colorways", "halo", "anchors", "perch"], "figure");
  if (value.format !== "crewhub-figure/1") r.error("figure.format", 'must be "crewhub-figure/1"');
  const joints = new Set(["root"]);
  jointList(r, value.joints, "figure.joints", joints);
  const ids = new Set<string>();
  parts(r, value.parts, "figure.parts", joints, ids);
  // The root is the renderer's to place and turn: poses and motions move the joints under it.
  const movable = new Set([...joints].filter((id) => id !== "root"));
  poses(r, value.poses, "figure.poses", movable);
  motions(r, value.motions, "figure.motions", movable);
  if ("looks" in value) looks(r, value.looks, "figure.looks", ids);
  colorways(r, value.colorways, "figure.colorways");
  if ("halo" in value) colorName(r, value.halo, "figure.halo");
  anchors(r, value.anchors, "figure.anchors", false);
  if ("perch" in value) perches(r, value.perch, "figure.perch", movable, isObject(value.colorways) ? value.colorways : null);
  if (isObject(value.colorways) && Array.isArray(value.parts))
    value.parts.forEach((part: unknown, i) => {
      const color = isObject(part) && typeof part.color === "string" ? part.color : "";
      if (color.startsWith("slot:") && !(color.slice(5) in (value.colorways as Bag))) r.error(`figure.parts[${i}].color`, `"${color}" names no colourway slot`);
    });
  return r.done(value);
}

/** A patch is checked on its own shape; whether its joints and part ids exist is checked on the patched figure. */
export function validateFigurePatch(value: unknown): CastValidation<FigurePatch> {
  const r = new Report();
  if (!isObject(value)) return { ok: false, errors: ["patch: must be an object"] };
  r.keys(value, ["format", "recolor", "remove", "add", "joints", "poses", "motions", "looks", "colorways", "halo", "anchors", "perch"], "patch");
  if (value.format !== "crewhub-figure-patch/1") r.error("patch.format", 'must be "crewhub-figure-patch/1"');
  if ("recolor" in value) {
    if (!isObject(value.recolor)) r.error("patch.recolor", "must be an object of colour names");
    else for (const [from, to] of Object.entries(value.recolor)) colorName(r, to, `patch.recolor.${from}`);
  }
  if ("remove" in value && !(Array.isArray(value.remove) && value.remove.every(isText))) r.error("patch.remove", "must be a list of part ids");
  if ("add" in value) parts(r, value.add, "patch.add", null, new Set());
  if ("joints" in value) {
    if (!Array.isArray(value.joints)) r.error("patch.joints", "must be a list of joints");
    else
      value.joints.forEach((joint: unknown, i) => {
        if (!isObject(joint) || !isText(joint.id) || !ID.test(joint.id)) r.error(`patch.joints[${i}].id`, "must be lowercase letters, digits and dashes");
        else r.vec3(joint.position, `patch.joints[${i}].position`);
      });
  }
  if ("poses" in value) poses(r, value.poses, "patch.poses", null);
  if ("motions" in value) motions(r, value.motions, "patch.motions", null);
  if ("looks" in value) looks(r, value.looks, "patch.looks", null);
  if ("colorways" in value) colorways(r, value.colorways, "patch.colorways");
  if ("halo" in value) colorName(r, value.halo, "patch.halo");
  if ("anchors" in value) anchors(r, value.anchors, "patch.anchors", true);
  if ("perch" in value) perches(r, value.perch, "patch.perch", null, null);
  return r.done(value);
}
