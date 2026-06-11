// Theme-aware world palette (Epic 20 beauty pass): pure mapping from the
// active theme's CSS variables (src/theme/themes.ts expands every theme into
// hex vars on :root) to the handful of colors the 3D world paints with.
// Unreadable/missing/non-hex vars fall back to the classic hardcoded look —
// the world must never go black because a theme forgot a variable.

export type CssVarReader = (name: string) => string | null;

export interface WorldPalette {
  /** Canvas clear color. */
  sky: string;
  /** Fog color — always equals sky so the horizon dissolves cleanly. */
  fog: string;
  /** The big ground slab. */
  ground: string;
  /** Lobby strip floor. */
  lobby: string;
  /** Wall segments. */
  wall: string;
  /** Room floor fallbacks (rooms without an explicit color), cycled. */
  floors: string[];
  /** HQ floor — leans harder into the theme accent. */
  hqFloor: string;
  /** Floor grid lines (cell / section). */
  grid: string;
  gridSection: string;
  /** Nameplates / wall text + their outline. */
  text: string;
  textOutline: string;
}

/** The pre-Epic-20 hardcoded look — also the no-theme fallback. */
export const WORLD_PALETTE_FALLBACK: WorldPalette = {
  sky: "#15171e",
  fog: "#15171e",
  ground: "#22252e",
  lobby: "#2e3340",
  wall: "#565e72",
  floors: ["#3b4254", "#41495e", "#374055", "#454058", "#3d4a52"],
  hqFloor: "#4d4458",
  grid: "#2c303c",
  gridSection: "#3a4254",
  text: "#e7eaf2",
  textOutline: "#1a1d24",
};

// ── Tiny pure hex utilities ──────────────────────────────────────────────────

export function isHexColor(v: string | null | undefined): v is string {
  return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

function toRgb(hex: string): [number, number, number] {
  let h = hex.trim().slice(1);
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Channel-wise mix of two hex colors; `t` clamped to 0..1. */
export function mixHex(a: string, b: string, t: number): string {
  const tt = Math.min(1, Math.max(0, t));
  const ra = toRgb(a);
  const rb = toRgb(b);
  return toHex([ra[0] + (rb[0] - ra[0]) * tt, ra[1] + (rb[1] - ra[1]) * tt, ra[2] + (rb[2] - ra[2]) * tt]);
}

/** Shade toward black (t<0) or white (t>0). */
export function shadeHex(hex: string, t: number): string {
  return t < 0 ? mixHex(hex, "#000000", -t) : mixHex(hex, "#ffffff", t);
}

// ── The mapping ──────────────────────────────────────────────────────────────

function readHex(read: CssVarReader, name: string): string | null {
  const v = read(name);
  return isHexColor(v) ? v.trim() : null;
}

/**
 * Derive the world palette from theme vars. Every surface degrades
 * independently: a theme that only defines `--background` still tints the
 * sky while floors keep their fallback.
 */
export function worldPaletteFrom(read: CssVarReader): WorldPalette {
  const bg = readHex(read, "--background");
  const card = readHex(read, "--card");
  const border = readHex(read, "--border");
  const primary = readHex(read, "--primary");
  const fg = readHex(read, "--foreground");

  const f = WORLD_PALETTE_FALLBACK;
  const sky = bg ? shadeHex(bg, -0.35) : f.sky;
  const ground = bg && fg ? mixHex(shadeHex(bg, -0.12), fg, 0.04) : f.ground;
  const floorBase = card ?? bg;

  return {
    sky,
    fog: sky,
    ground,
    lobby: bg && fg ? mixHex(bg, fg, 0.08) : f.lobby,
    wall: border && fg ? mixHex(border, fg, 0.12) : (border ?? f.wall),
    // Five gentle variations: card nudged toward the accent by varying
    // amounts — neighbors stay distinguishable, all clearly one family.
    floors:
      floorBase && primary
        ? [0.08, 0.16, 0.04, 0.2, 0.12].map((t) => mixHex(floorBase, primary, t))
        : f.floors,
    hqFloor: floorBase && primary ? mixHex(floorBase, primary, 0.34) : f.hqFloor,
    grid: bg && fg ? mixHex(ground, fg, 0.07) : f.grid,
    gridSection: bg && primary ? mixHex(ground, primary, 0.22) : f.gridSection,
    text: fg ?? f.text,
    textOutline: bg ? shadeHex(bg, -0.45) : f.textOutline,
  };
}
