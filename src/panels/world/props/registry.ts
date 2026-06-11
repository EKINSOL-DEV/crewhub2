// Static prop registry (EKI-81, Epic 20.1): pure data. Every prop is a small
// declarative part list — primitives + offsets + color *roles* — rendered by
// a single Prop3D component. Roles resolve against the live world palette, so
// props re-tint with the theme like everything else in the world.
//
// Visual DNA comes from v1's frontend/src/components/world3d/props/* (boxes,
// cylinders, spheres and cones in charming arrangements), rebuilt as data.
import { mixHex, shadeHex, type WorldPalette } from "../lib/theme-palette";

export type PropPrimitive = "box" | "cylinder" | "sphere" | "cone";

/** Named color slots; resolved per-theme by `propColors`. */
export type PropColorRole =
  | "accent" // the theme primary, straight up
  | "accentSoft" // accent washed toward the ground — rugs, book spines
  | "fabric" // upholstery — accent-leaning
  | "fabricDark"
  | "wood"
  | "woodDark"
  | "metal"
  | "metalDark"
  | "foliage"
  | "foliageLight"
  | "paper" // whiteboard face, coffee cup
  | "shade"; // lampshade — bright, accent-warmed

export interface PropPart {
  shape: PropPrimitive;
  /**
   * Shape-specific dimensions:
   * box [w, h, d] · cylinder [rTop, rBottom, h] · sphere [r] · cone [r, h]
   */
  size: readonly number[];
  /** Offset from the prop origin (floor center), [x, y, z]. */
  at: readonly [number, number, number];
  color: PropColorRole;
  /** Optional Y rotation in radians. */
  rotY?: number;
}

export interface PropDefinition {
  /** Namespaced id, e.g. "core:desk". */
  id: string;
  label: string;
  emoji: string;
  /** Rough footprint radius (world units, unscaled) — clamping & select ring. */
  radius: number;
  /** Tokens used to map v1 blueprint prop ids onto this prop. */
  keywords: readonly string[];
  parts: readonly PropPart[];
}

/** Resolve every color role from the live theme palette. Pure. */
export function propColors(p: WorldPalette): Record<PropColorRole, string> {
  const wood = mixHex("#9a7350", p.ground, 0.15);
  const fabric = mixHex(p.accent, p.ground, 0.3);
  return {
    accent: p.accent,
    accentSoft: mixHex(p.accent, p.ground, 0.55),
    fabric,
    fabricDark: shadeHex(fabric, -0.25),
    wood,
    woodDark: shadeHex(wood, -0.3),
    metal: mixHex(p.wall, p.text, 0.18),
    metalDark: shadeHex(p.wall, -0.25),
    foliage: "#4f9344",
    foliageLight: "#6fb35d",
    paper: shadeHex(p.text, 0.35),
    shade: mixHex(p.accent, "#fff6df", 0.55),
  };
}

// ── The core set ─────────────────────────────────────────────────────────────

const desk: PropDefinition = {
  id: "core:desk",
  label: "Desk",
  emoji: "🖥️",
  radius: 0.9,
  keywords: ["desk", "table", "workbench", "conference"],
  parts: [
    { shape: "box", size: [1.6, 0.08, 0.8], at: [0, 0.74, 0], color: "wood" },
    { shape: "box", size: [0.08, 0.7, 0.08], at: [-0.72, 0.35, -0.32], color: "woodDark" },
    { shape: "box", size: [0.08, 0.7, 0.08], at: [0.72, 0.35, -0.32], color: "woodDark" },
    { shape: "box", size: [0.08, 0.7, 0.08], at: [-0.72, 0.35, 0.32], color: "woodDark" },
    { shape: "box", size: [0.08, 0.7, 0.08], at: [0.72, 0.35, 0.32], color: "woodDark" },
    // Monitor on a little stand
    { shape: "box", size: [0.1, 0.1, 0.08], at: [0, 0.83, -0.18], color: "metalDark" },
    { shape: "box", size: [0.56, 0.36, 0.04], at: [0, 1.04, -0.2], color: "metalDark" },
    { shape: "box", size: [0.5, 0.3, 0.012], at: [0, 1.04, -0.176], color: "accentSoft" },
  ],
};

const chair: PropDefinition = {
  id: "core:chair",
  label: "Chair",
  emoji: "🪑",
  radius: 0.4,
  keywords: ["chair", "stool", "seat"],
  parts: [
    { shape: "box", size: [0.46, 0.07, 0.46], at: [0, 0.45, 0], color: "fabric" },
    { shape: "box", size: [0.46, 0.5, 0.07], at: [0, 0.72, -0.2], color: "fabric" },
    { shape: "box", size: [0.05, 0.45, 0.05], at: [-0.18, 0.22, -0.18], color: "metalDark" },
    { shape: "box", size: [0.05, 0.45, 0.05], at: [0.18, 0.22, -0.18], color: "metalDark" },
    { shape: "box", size: [0.05, 0.45, 0.05], at: [-0.18, 0.22, 0.18], color: "metalDark" },
    { shape: "box", size: [0.05, 0.45, 0.05], at: [0.18, 0.22, 0.18], color: "metalDark" },
  ],
};

const plant: PropDefinition = {
  id: "core:plant",
  label: "Plant",
  emoji: "🪴",
  radius: 0.35,
  keywords: ["plant", "flower", "tree", "pot"],
  parts: [
    { shape: "cylinder", size: [0.2, 0.16, 0.3], at: [0, 0.15, 0], color: "woodDark" },
    { shape: "cylinder", size: [0.22, 0.22, 0.04], at: [0, 0.31, 0], color: "wood" },
    { shape: "cylinder", size: [0.03, 0.04, 0.16], at: [0, 0.38, 0], color: "foliage" },
    { shape: "sphere", size: [0.24], at: [0, 0.6, 0], color: "foliage" },
    { shape: "sphere", size: [0.16], at: [0.11, 0.53, 0.08], color: "foliageLight" },
    { shape: "sphere", size: [0.15], at: [-0.09, 0.51, -0.07], color: "foliageLight" },
  ],
};

const bookshelf: PropDefinition = {
  id: "core:bookshelf",
  label: "Bookshelf",
  emoji: "📚",
  radius: 0.6,
  keywords: ["bookshelf", "shelf", "filing", "cabinet", "locker", "wardrobe", "books"],
  parts: [
    { shape: "box", size: [1.0, 1.8, 0.32], at: [0, 0.9, 0], color: "wood" },
    // Three inset shelves of "books" (color blocks)
    { shape: "box", size: [0.86, 0.4, 0.26], at: [0, 1.5, 0.05], color: "accentSoft" },
    { shape: "box", size: [0.86, 0.4, 0.26], at: [0, 0.95, 0.05], color: "fabric" },
    { shape: "box", size: [0.86, 0.4, 0.26], at: [0, 0.4, 0.05], color: "accent" },
    // Shelf boards
    { shape: "box", size: [1.0, 0.05, 0.34], at: [0, 1.22, 0.01], color: "woodDark" },
    { shape: "box", size: [1.0, 0.05, 0.34], at: [0, 0.67, 0.01], color: "woodDark" },
  ],
};

const lamp: PropDefinition = {
  id: "core:lamp",
  label: "Floor lamp",
  emoji: "💡",
  radius: 0.3,
  keywords: ["lamp", "light", "lantern"],
  parts: [
    { shape: "cylinder", size: [0.16, 0.2, 0.05], at: [0, 0.025, 0], color: "metalDark" },
    { shape: "cylinder", size: [0.025, 0.025, 1.35], at: [0, 0.72, 0], color: "metal" },
    { shape: "cone", size: [0.24, 0.3], at: [0, 1.5, 0], color: "shade" },
  ],
};

const rug: PropDefinition = {
  id: "core:rug",
  label: "Rug",
  emoji: "🧶",
  radius: 1.0,
  keywords: ["rug", "carpet", "mat"],
  parts: [
    { shape: "cylinder", size: [1.0, 1.0, 0.03], at: [0, 0.018, 0], color: "accentSoft" },
    { shape: "cylinder", size: [0.66, 0.66, 0.032], at: [0, 0.02, 0], color: "fabric" },
  ],
};

const coffee: PropDefinition = {
  id: "core:coffee",
  label: "Coffee machine",
  emoji: "☕",
  radius: 0.45,
  keywords: ["coffee", "vending", "fridge", "microwave", "kitchen", "espresso", "water", "cooler"],
  parts: [
    // Little stand so the machine sits at counter height
    { shape: "box", size: [0.6, 0.55, 0.5], at: [0, 0.275, 0], color: "woodDark" },
    { shape: "box", size: [0.5, 0.62, 0.4], at: [0, 0.86, 0], color: "metalDark" },
    { shape: "box", size: [0.42, 0.5, 0.02], at: [0, 0.88, 0.2], color: "metal" },
    { shape: "cylinder", size: [0.05, 0.045, 0.09], at: [0, 0.62, 0.16], color: "paper" },
    { shape: "cylinder", size: [0.02, 0.02, 0.015], at: [-0.1, 1.0, 0.21], color: "accent" },
    { shape: "cylinder", size: [0.02, 0.02, 0.015], at: [0.1, 1.0, 0.21], color: "foliageLight" },
  ],
};

const whiteboard: PropDefinition = {
  id: "core:whiteboard",
  label: "Whiteboard",
  emoji: "📝",
  radius: 0.8,
  keywords: ["whiteboard", "board", "notice", "painting", "projector", "screen", "monitor", "clock"],
  parts: [
    { shape: "box", size: [1.5, 0.9, 0.05], at: [0, 1.15, 0], color: "metal" },
    { shape: "box", size: [1.4, 0.8, 0.02], at: [0, 1.15, 0.025], color: "paper" },
    // Scribbles
    { shape: "box", size: [0.6, 0.04, 0.012], at: [-0.25, 1.4, 0.04], color: "accent" },
    { shape: "box", size: [0.45, 0.04, 0.012], at: [-0.32, 1.28, 0.04], color: "fabricDark" },
    { shape: "box", size: [0.3, 0.3, 0.012], at: [0.4, 1.2, 0.04], color: "accentSoft" },
    // Tray + legs
    { shape: "box", size: [1.2, 0.04, 0.1], at: [0, 0.68, 0.05], color: "metalDark" },
    { shape: "box", size: [0.05, 0.7, 0.05], at: [-0.6, 0.35, 0], color: "metalDark" },
    { shape: "box", size: [0.05, 0.7, 0.05], at: [0.6, 0.35, 0], color: "metalDark" },
  ],
};

const couch: PropDefinition = {
  id: "core:couch",
  label: "Couch",
  emoji: "🛋️",
  radius: 1.0,
  keywords: ["couch", "sofa", "bed", "bunk", "bench", "lounge"],
  parts: [
    { shape: "box", size: [1.8, 0.32, 0.8], at: [0, 0.28, 0], color: "fabric" },
    { shape: "box", size: [1.8, 0.5, 0.22], at: [0, 0.62, -0.29], color: "fabric" },
    { shape: "box", size: [0.22, 0.3, 0.8], at: [-0.79, 0.55, 0], color: "fabricDark" },
    { shape: "box", size: [0.22, 0.3, 0.8], at: [0.79, 0.55, 0], color: "fabricDark" },
    // Seat cushions
    { shape: "box", size: [0.8, 0.1, 0.66], at: [-0.42, 0.48, 0.04], color: "fabricDark" },
    { shape: "box", size: [0.8, 0.1, 0.66], at: [0.42, 0.48, 0.04], color: "fabricDark" },
    { shape: "box", size: [1.7, 0.12, 0.7], at: [0, 0.1, 0], color: "woodDark" },
  ],
};

const crate: PropDefinition = {
  id: "core:crate",
  label: "Crate",
  emoji: "📦",
  radius: 0.45,
  keywords: ["crate", "box", "storage"],
  parts: [
    { shape: "box", size: [0.62, 0.62, 0.62], at: [0, 0.31, 0], color: "wood" },
    { shape: "box", size: [0.66, 0.08, 0.66], at: [0, 0.06, 0], color: "woodDark" },
    { shape: "box", size: [0.66, 0.08, 0.66], at: [0, 0.58, 0], color: "woodDark" },
    { shape: "box", size: [0.08, 0.64, 0.66], at: [0, 0.31, 0], color: "woodDark" },
  ],
};

export const PROP_LIST: readonly PropDefinition[] = [
  desk,
  chair,
  plant,
  bookshelf,
  lamp,
  rug,
  coffee,
  whiteboard,
  couch,
  crate,
];

export const CORE_PROPS: Readonly<Record<string, PropDefinition>> = Object.fromEntries(
  PROP_LIST.map((d) => [d.id, d]),
);

/** Unknown prop ids render as this (with a 📦 marker overhead). */
export const FALLBACK_PROP_ID = "core:crate";

/** Look up a definition; unknown ids fall back to the crate. */
export function resolveProp(propId: string): PropDefinition {
  return CORE_PROPS[propId] ?? CORE_PROPS[FALLBACK_PROP_ID]!;
}

/**
 * Map a v1 blueprint prop id ("desk-with-monitor", "lamp-floor", …) onto the
 * nearest core prop by keyword overlap. Earlier tokens weigh more (the v1 ids
 * lead with the noun), so "desk-with-monitor" lands on the desk, not the
 * whiteboard. Returns null when nothing overlaps.
 */
export function matchPropId(v1Id: string): string | null {
  const tokens = v1Id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const def of PROP_LIST) {
    let score = 0;
    tokens.forEach((tok, i) => {
      if (def.keywords.includes(tok)) score += tokens.length - i;
    });
    if (score > bestScore) {
      bestScore = score;
      best = def.id;
    }
  }
  return best;
}
