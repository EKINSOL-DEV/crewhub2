/* The pure half of the figure runtime: seeding, colourways, waves and re-dressing a figure with a patch. No three.js,
   so it runs under `node --test` and the validator and the registry can use it. */
import type { CastRole, FigureAnchors, FigurePatch, FigureSpec, MotionWave, Perch, PerchStep, WorkPlace, WorkPose } from "./index.ts";
import type { Vec3 } from "@crewhub/world-engine";

/** FNV-1a: the seed of an agent key (colourways, rhythms, sides). Stable across loads. */
export function hashKey(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** How long a blink's dip and a glance's swell last, in seconds, whatever the period. */
const BLINK = 0.11;
const GLANCE = 1.6;

/** A wave's value at `turns` periods into the motion (any real number), for a period of `period` seconds. */
export function wave(kind: MotionWave, turns: number, period: number): number {
  const into = turns - Math.floor(turns);
  switch (kind) {
    case "sine":
      return Math.sin(into * 2 * Math.PI);
    case "bounce":
      return Math.abs(Math.sin(into * 2 * Math.PI));
    case "lift":
      return Math.max(0, Math.sin(into * 2 * Math.PI));
    case "blink":
      return into * period < BLINK ? 1 : 0;
    case "glance": {
      const f = (into * period) / GLANCE;
      return f < 1 ? Math.sin(f * Math.PI) ** 2 : 0;
    }
  }
}

/**
 * The colour name a part draws in: `slot:<name>` through the figure's colourways (the lead's colour, a role's, else
 * one of `others` seeded by the agent key), `accent` and `soft:accent` as the project colour. Without a project, an
 * accent falls back to the seeded colour of the slot it stands in (of the figure's first slot for a bare `accent`).
 * The result is a name a `FigureKit` resolves.
 */
export function figureColor(spec: FigureSpec, color: string, options: { key: string; role: CastRole; accent: string | null }): string {
  const seeded = (slot: string | undefined): string => {
    const others = (slot !== undefined ? spec.colorways[slot] : Object.values(spec.colorways)[0])?.others ?? [];
    return others.length ? others[hashKey(options.key) % others.length]! : "stale";
  };
  const accented = (name: string, slot: string | undefined): string => {
    if (name === "accent") return options.accent ?? seeded(slot);
    if (name === "soft:accent") return options.accent ? `soft:${options.accent}` : seeded(slot);
    return name;
  };
  if (!color.startsWith("slot:")) return accented(color, undefined);
  const slot = color.slice("slot:".length);
  const way = spec.colorways[slot];
  if (!way) return seeded(undefined);
  const chosen = way.roles?.[options.role] ?? (options.role === "lead" ? way.lead : undefined);
  return chosen ? accented(chosen, slot) : seeded(slot);
}

/** Between a figure's eyes, figure units: its `eyes` anchor, else the centre line at four fifths of its height. */
export function figureEyes(anchors: FigureAnchors): Vec3 {
  return anchors.eyes ?? [0, anchors.height * 0.8, 0];
}

/** The perch a figure brings to a work pose: the pose's own, else its `default`; null for none (and for `floor`). */
export function perchFor(spec: Pick<FigureSpec, "perch">, pose: WorkPose): Exclude<Perch, { kind: "floor" }> | null {
  const perch = spec.perch?.[pose] ?? spec.perch?.default;
  return !perch || perch.kind === "floor" ? null : perch;
}

/** Where a figure is on its perch, in its own frame at the work place (figure units; the floor spot is the origin). */
export interface PerchPlacement {
  perch: Exclude<Perch, { kind: "floor" }>;
  /** Where its feet are: up on the step, or on the top. */
  feet: Vec3;
  /** Its turn about y from facing the surface squarely, radians: towards what it looks at. */
  turn: number;
  /** Its size up there (1: as it stands on the floor). */
  scale: number;
  /** The step it stands on, and where the step stands on the floor (x, z). */
  step: { spec: PerchStep; x: number; z: number } | null;
}

/**
 * Where the perch of `spec` puts a figure at a work place; null when it brings none there, or when it would sit on a
 * top that has no free place (it then stands on the floor). The step is seeded by the agent key.
 */
export function perchPlacement(spec: Pick<FigureSpec, "perch" | "anchors">, place: WorkPlace, key: string): PerchPlacement | null {
  const perch = perchFor(spec, place.pose);
  if (!perch) return null;
  const turnTo = (x: number, z: number) => Math.atan2(place.focus[0] / place.scale - x, place.focus[2] / place.scale - z);
  if (perch.kind === "step") {
    const step = perch.steps[hashKey(`${key}:perch`) % perch.steps.length];
    if (!step) return null;
    const z = Math.max(0, place.edge / place.scale - (perch.gap ?? spec.anchors.ground));
    return { perch, feet: [0, step.height, z], turn: turnTo(0, z), scale: perch.scale ?? 1, step: { spec: step, x: 0, z } };
  }
  const scale = perch.scale ?? 1;
  const spot = place.spot((perch.base ?? spec.anchors.ground) * scale * place.scale);
  if (!spot) return null;
  const x = spot.x / place.scale,
    z = spot.z / place.scale;
  return { perch, feet: [x, place.height / place.scale, z], turn: turnTo(x, z), scale, step: null };
}

/**
 * A base figure re-dressed by a patch (`extends`): parts dropped, recoloured and added, and the patch's poses,
 * motions, looks, colourways and anchors over the base's. The base is not changed.
 */
export function applyFigurePatch(base: FigureSpec, patch: FigurePatch): FigureSpec {
  const recolor = patch.recolor ?? {};
  const to = (color: string): string => {
    const soft = color.startsWith("soft:") ? "soft:" : "";
    const name = color.slice(soft.length);
    return soft + (recolor[name] ?? name);
  };
  const glow = <T extends number | string | undefined>(value: T): T => (typeof value === "string" ? (to(value) as T) : value);
  const removed = new Set(patch.remove ?? []);
  const parts = base.parts
    .filter((part) => !(part.id && removed.has(part.id)))
    .map((part) => ({ ...part, color: to(part.color), ...(part.glow !== undefined ? { glow: glow(part.glow) } : {}) }));
  const looks: NonNullable<FigureSpec["looks"]> = {};
  for (const [key, look] of Object.entries(base.looks ?? {})) {
    const recoloured: Record<string, { color?: string; glow?: number | string }> = {};
    for (const [id, change] of Object.entries(look.parts)) {
      if (removed.has(id)) continue;
      recoloured[id] = { ...change, ...(change.color !== undefined ? { color: to(change.color) } : {}), ...(change.glow !== undefined ? { glow: glow(change.glow) } : {}) };
    }
    looks[key as keyof typeof looks] = { parts: recoloured };
  }
  const colorways: FigureSpec["colorways"] = {};
  for (const [slot, way] of Object.entries(base.colorways)) {
    const roles: Partial<Record<CastRole, string>> = {};
    for (const [role, color] of Object.entries(way.roles ?? {})) roles[role as CastRole] = to(color);
    colorways[slot] = { ...(way.lead !== undefined ? { lead: to(way.lead) } : {}), ...(way.roles ? { roles } : {}), others: way.others.map(to) };
  }
  const halo = patch.halo ?? (base.halo !== undefined ? to(base.halo) : undefined);
  // The base's steps are recoloured like its parts; a pose the patch names is the patch's own.
  const perch: NonNullable<FigureSpec["perch"]> = {};
  for (const [pose, way] of Object.entries(base.perch ?? {}))
    perch[pose as keyof typeof perch] =
      way.kind !== "step" ? way : { ...way, steps: way.steps.map((step) => ({ ...step, parts: step.parts.map((part) => ({ ...part, color: to(part.color) })) })) };
  Object.assign(perch, patch.perch);
  return {
    format: "crewhub-figure/1",
    joints: [...base.joints, ...(patch.joints ?? [])],
    parts: [...parts, ...(patch.add ?? [])],
    poses: { ...base.poses, ...patch.poses },
    motions: { ...base.motions, ...patch.motions },
    looks: { ...looks, ...patch.looks },
    colorways: { ...colorways, ...patch.colorways },
    ...(halo !== undefined ? { halo } : {}),
    anchors: { ...base.anchors, ...patch.anchors },
    ...(Object.keys(perch).length ? { perch } : {}),
  };
}
