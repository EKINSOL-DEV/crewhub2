// Creator mode (EKI-83): pure logic for AI-generated props — no IO here.
// `buildCreatorPrompt` asks a headless model for exactly one JSON object;
// `parseCreatorProp` tolerantly turns whatever came back into a PropDefinition
// in the `creator:` namespace (parse-v1 rules: salvage what we can, warn about
// what we fixed, fail only when nothing renderable survives).
import type { PropColorRole, PropDefinition, PropPart, PropPrimitive } from "./registry";

export type CreatorParseResult =
  | { ok: true; def: PropDefinition; warnings: string[] }
  | { ok: false; error: string };

// Exhaustive role list — the Record keeps it in lockstep with PropColorRole.
const ROLE_FLAGS: Record<PropColorRole, true> = {
  accent: true,
  accentSoft: true,
  fabric: true,
  fabricDark: true,
  wood: true,
  woodDark: true,
  metal: true,
  metalDark: true,
  foliage: true,
  foliageLight: true,
  paper: true,
  shade: true,
};
export const COLOR_ROLES = Object.keys(ROLE_FLAGS) as readonly PropColorRole[];

export function isColorRole(v: unknown): v is PropColorRole {
  return typeof v === "string" && v in ROLE_FLAGS;
}

/** size entries per shape: box [w,h,d] · cylinder [rTop,rBottom,h] · sphere [r] · cone [r,h]. */
const SIZE_ARITY: Record<PropPrimitive, number> = { box: 3, cylinder: 3, sphere: 1, cone: 2 };

export const MAX_PARTS = 16;
export const SIZE_MAX = 4;
export const RADIUS_MIN = 0.3;
export const RADIUS_MAX = 2;
const DEFAULT_RADIUS = 0.8;
const LABEL_MAX = 40;
const SLUG_MAX = 24;

// ── Prompt ───────────────────────────────────────────────────────────────────

/** Compact prompt for a headless LLM run (often haiku — keep it tight). */
export function buildCreatorPrompt(description: string): string {
  return [
    "Design one small 3D prop for a cozy low-poly office world.",
    "Reply with EXACTLY ONE JSON object — no prose, no code fences:",
    '{ "label": string, "emoji": string (one emoji), "radius": number,',
    '  "parts": [{ "shape": "box"|"cylinder"|"sphere"|"cone", "size": number[],',
    '              "at": [x, y, z], "color": string, "rotY"?: number }] }',
    "size per shape: box [w,h,d] · cylinder [rTop,rBottom,h] · sphere [r] · cone [r,h].",
    '"at" is the part offset from the prop origin in meters, y up; y >= 0 sits on the floor.',
    `"color" must be one of: ${COLOR_ROLES.join(", ")}.`,
    `Limits: 1..${MAX_PARTS} parts; every size component in (0, ${SIZE_MAX}];`,
    `the whole prop should fit roughly within a 2.5m cube; radius ${RADIUS_MIN}..${RADIUS_MAX} (footprint).`,
    "Aim for toylike, low-poly desk-toy charm.",
    `Prop to design: ${description}`,
  ].join("\n");
}

// ── Small helpers ────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function isShape(v: unknown): v is PropPrimitive {
  return typeof v === "string" && v in SIZE_ARITY;
}

/** Lowercased label → kebab slug, max 24 chars, never empty. */
export function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
  return slug || "prop";
}

/** `creator:<slug>`, suffixed -2, -3, … until it dodges `existingIds`. */
function freeId(slug: string, existingIds: ReadonlySet<string>): string {
  const base = `creator:${slug}`;
  if (!existingIds.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!existingIds.has(id)) return id;
  }
}

/** Lowercased words of the label (length >= 3), deduped. */
function keywordsOf(label: string): string[] {
  const words = label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  return [...new Set(words)];
}

/** Marks, variation selectors and skin tones ride along with their base. */
function isExtender(cp: string): boolean {
  const n = cp.codePointAt(0) ?? 0;
  return n === 0xfe0e || n === 0xfe0f || (n >= 0x1f3fb && n <= 0x1f3ff) || /\p{M}/u.test(cp);
}

// First grapheme-ish chunk: a base code point plus extenders, carried through
// ZWJ joins (family emoji stay whole); no Intl.Segmenter in our lib target.
function firstGrapheme(s: string): string {
  const cps = [...s];
  let end = 0;
  while (end < cps.length) {
    end++; // base
    while (end < cps.length && isExtender(cps[end]!)) end++;
    if (cps[end] === "\u200D" && end + 1 < cps.length)
      end++; // ZWJ-joined, keep going
    else break;
  }
  return cps.slice(0, end).join("");
}

/** Strip markdown fences if present, else slice from the first `{` to the last `}`. */
function extractJson(text: string): string | null {
  const fenced = /```[a-z]*\s*([\s\S]*?)```/i.exec(text);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start !== -1 && end > start ? body.slice(start, end + 1) : null;
}

// ── Part parsing ─────────────────────────────────────────────────────────────

function parsePart(raw: unknown, i: number, warnings: string[]): PropPart | null {
  const tag = `Part ${i + 1}`;
  if (!isRecord(raw)) {
    warnings.push(`${tag}: not an object — dropped`);
    return null;
  }
  if (!isShape(raw.shape)) {
    warnings.push(`${tag}: unknown shape ${JSON.stringify(raw.shape)} — dropped`);
    return null;
  }
  const shape = raw.shape;

  // size: positive finite numbers only; wrong arity is salvaged by
  // truncating/padding with the last value, an unsalvageable size drops the part.
  const nums = Array.isArray(raw.size)
    ? raw.size.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0)
    : [];
  if (nums.length === 0) {
    warnings.push(`${tag}: unusable size — dropped`);
    return null;
  }
  const arity = SIZE_ARITY[shape];
  if (nums.length !== arity) {
    warnings.push(`${tag}: ${shape} size needs ${arity} number${arity === 1 ? "" : "s"} — adjusted`);
    while (nums.length < arity) nums.push(nums[nums.length - 1]!);
    nums.length = arity;
  }
  const size = nums.map((n) => Math.min(n, SIZE_MAX));

  // at: 3 finite numbers, y >= 0 (floor), |x|,|z| <= 2.
  let at: [number, number, number] = [0, 0, 0];
  const a = raw.at;
  if (
    Array.isArray(a) &&
    a.length >= 3 &&
    a.slice(0, 3).every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    at = [clamp(a[0] as number, -2, 2), Math.max(0, a[1] as number), clamp(a[2] as number, -2, 2)];
  } else {
    warnings.push(`${tag}: bad "at" → [0, 0, 0]`);
  }

  let color: PropColorRole = "accent";
  if (isColorRole(raw.color)) color = raw.color;
  else warnings.push(`${tag}: unknown color ${JSON.stringify(raw.color)} → accent`);

  const rotY = typeof raw.rotY === "number" && Number.isFinite(raw.rotY) ? raw.rotY : undefined;
  return { shape, size, at, color, ...(rotY === undefined ? {} : { rotY }) };
}

// ── The parser ───────────────────────────────────────────────────────────────

/**
 * Parse a model response into a PropDefinition. Tolerant: fences and prose are
 * stripped, fixable fields are fixed with a warning; only missing/empty parts
 * (or unparseable JSON) fail outright.
 */
export function parseCreatorProp(text: string, existingIds: ReadonlySet<string>): CreatorParseResult {
  const json = extractJson(text);
  if (!json) return { ok: false, error: "No JSON object in the response — try again." };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "The response isn't valid JSON — try again." };
  }
  if (!isRecord(raw)) return { ok: false, error: "Expected a JSON object describing the prop." };

  const warnings: string[] = [];

  let label = typeof raw.label === "string" ? raw.label.trim().slice(0, LABEL_MAX).trim() : "";
  if (!label) {
    label = "Mystery prop";
    warnings.push('No usable label → "Mystery prop"');
  }

  let emoji = typeof raw.emoji === "string" ? firstGrapheme(raw.emoji.trim()) : "";
  if (!emoji) {
    emoji = "✨";
    warnings.push("No usable emoji → ✨");
  }

  if (!Array.isArray(raw.parts) || raw.parts.length === 0) {
    return { ok: false, error: "Expected a non-empty parts array." };
  }
  let parts = raw.parts.map((p, i) => parsePart(p, i, warnings)).filter((p): p is PropPart => p !== null);
  if (parts.length === 0) return { ok: false, error: "No usable parts survived parsing." };
  if (parts.length > MAX_PARTS) {
    warnings.push(`${parts.length} parts → keeping the first ${MAX_PARTS}`);
    parts = parts.slice(0, MAX_PARTS);
  }

  let radius = DEFAULT_RADIUS;
  if (typeof raw.radius === "number" && Number.isFinite(raw.radius)) {
    radius = clamp(raw.radius, RADIUS_MIN, RADIUS_MAX);
  } else {
    warnings.push(`No usable radius → ${DEFAULT_RADIUS}`);
  }

  const id = freeId(slugify(label), existingIds);
  return { ok: true, def: { id, label, emoji, radius, keywords: keywordsOf(label), parts }, warnings };
}
