/* The pure half of the figure runtime: seeding, colourways, waves and re-dressing a figure with a patch. No three.js,
   so it runs under `node --test` and the validator and the registry can use it. */
import type { CastRole, FigurePatch, FigureSpec, MotionWave } from "./index.ts";

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
  };
}
