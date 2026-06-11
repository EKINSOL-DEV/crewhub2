// v1 blueprint import (EKI-81): pure, tolerant parser from CrewHub v1's
// `custom_blueprints` JSON (grid of cells, prop ids like "desk-with-monitor")
// to v2 PlacedProps (room-local meters). Accepts the raw blueprint, the API
// row ({ blueprint: {...} }) and the DB row ({ blueprint_json: "..." }).
//
// Tolerance rules:
//   · unknown prop ids → nearest core prop by keyword, else 📦-marked crate
//   · interaction markers (work-point etc.) are dropped silently — they were
//     invisible in v1 too
//   · malformed placements are dropped with a warning, the rest survive
//   · everything is scaled to fit and clamped inside the room
import { clampToRoom, normalizeRot, type PlacedProp, type RoomDims } from "./placement";
import { FALLBACK_PROP_ID, matchPropId } from "./registry";

export type V1ParseResult =
  | { ok: true; props: PlacedProp[]; warnings: string[] }
  | { ok: false; error: string };

const DEFAULT_CELL_SIZE = 0.6;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Unwrap API/DB row shapes down to the blueprint object itself. */
function unwrap(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.blueprint_json === "string") {
    try {
      return unwrap(JSON.parse(raw.blueprint_json));
    } catch {
      return null;
    }
  }
  if (isRecord(raw.blueprint)) return raw.blueprint;
  return raw;
}

function isInteractionMarker(propId: string, type: unknown): boolean {
  if (type === "interaction") return true;
  return /(^|-)point(-|\d|$)|^sleep-corner$/.test(propId);
}

export function parseV1Blueprint(text: string, dims: RoomDims): V1ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That doesn't parse as JSON — paste the blueprint JSON itself." };
  }

  const bp = unwrap(raw);
  if (!bp) return { ok: false, error: "Expected a v1 blueprint object." };
  if (!Array.isArray(bp.placements)) {
    return { ok: false, error: "No placements array — this doesn't look like a v1 blueprint." };
  }

  const placements = bp.placements;
  const cell =
    typeof bp.cellSize === "number" && Number.isFinite(bp.cellSize) && bp.cellSize > 0
      ? bp.cellSize
      : DEFAULT_CELL_SIZE;

  // Grid dims: trust the blueprint, else infer from the placements.
  const coordMax = (key: "x" | "z") =>
    placements.reduce((m, p) => (isRecord(p) && typeof p[key] === "number" ? Math.max(m, p[key]) : m), 0);
  const gridDim = (v: unknown, key: "x" | "z") =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : coordMax(key) + 1;
  const gridW = gridDim(bp.gridWidth, "x");
  const gridD = gridDim(bp.gridDepth, "z");

  // Uniform fit: v1 rooms can be up to 24m across; squeeze (never stretch)
  // the whole arrangement into this room's usable floor.
  const usableW = dims.width - 1.2;
  const usableD = dims.depth - 1.2;
  const fit = Math.min(1, usableW / (gridW * cell), usableD / (gridD * cell));

  const props: PlacedProp[] = [];
  const warnings: string[] = [];
  const unknownIds = new Set<string>();
  let dropped = 0;

  placements.forEach((p, i) => {
    if (!isRecord(p) || typeof p.propId !== "string" || typeof p.x !== "number" || typeof p.z !== "number") {
      dropped++;
      return;
    }
    if (isInteractionMarker(p.propId, p.type)) return;

    // Footprint center in grid cells (span anchors are the top-left cell).
    const span = isRecord(p.span) ? p.span : undefined;
    const spanW = typeof span?.w === "number" && span.w > 0 ? span.w : 1;
    const spanD = typeof span?.d === "number" && span.d > 0 ? span.d : 1;
    const cx = p.x + (spanW - 1) / 2 + 0.5;
    const cz = p.z + (spanD - 1) / 2 + 0.5;

    // Grid → room-local meters (grid centered on the room center), then fit.
    const x = (cx * cell - (gridW * cell) / 2) * fit;
    const z = (cz * cell - (gridD * cell) / 2) * fit;

    const matched = matchPropId(p.propId);
    if (!matched) unknownIds.add(p.propId);

    const rot = typeof p.rotation === "number" ? normalizeRot((p.rotation * Math.PI) / 180) : 0;

    props.push(
      clampToRoom(
        {
          id: `v1-${i}`,
          propId: matched ?? FALLBACK_PROP_ID,
          x,
          z,
          rot,
          scale: 1,
          ...(matched ? {} : { marker: "📦" }),
        },
        dims,
      ),
    );
  });

  for (const id of unknownIds) warnings.push(`Unknown prop "${id}" → 📦 crate`);
  if (dropped > 0) warnings.push(`Dropped ${dropped} malformed placement${dropped === 1 ? "" : "s"}`);

  return { ok: true, props, warnings };
}
