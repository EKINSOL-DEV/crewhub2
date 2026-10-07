/* Greenhouse furniture that needs code (a plant's leaves, the desk's screen glow, repeated books). Moved from
   apps/world/src/world/models.ts. Every model's origin is its footprint centre on the floor; its front faces +z. */
import * as THREE from "three";
import { put, type Kit } from "./kit.ts";

export function plant(kit: Kit, seed = 0): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.cylinder(0.21, 0.15, 0.34, "terracotta"), 0, 0.17, 0);
  put(g, kit.cylinder(0.19, 0.19, 0.035, "soil"), 0, 0.345, 0);
  put(g, kit.cylinder(0.02, 0.025, 0.7, "stem"), 0, 0.62, 0);
  // Plain leaves, not an InstancedMesh per plant: a renderer batches them across plants (merged in a building, instanced
  // in the town), where seven-leaf instancing cost a draw call and a shadow caster for every plant.
  const geometry = kit.geometry("leaf", () => new THREE.SphereGeometry(1, 10, 8));
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4 + seed * 0.7;
    const leaf = kit.mesh(geometry, kit.material("leaf-mid", { tint: i % 2 ? "leaf" : "leaf-dark" }));
    leaf.position.set(Math.sin(angle) * 0.16, 0.66 + (i % 3) * 0.14, Math.cos(angle) * 0.16);
    leaf.rotation.set(Math.cos(angle) * 0.55, angle, Math.sin(angle) * 0.55);
    leaf.scale.set(0.13, 0.4, 0.045);
    g.add(leaf);
  }
  return g;
}

const MUGS = ["bot-sage", "bot-apricot", "bot-lavender"];

export function desk(kit: Kit, seed = 0): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.box(1.7, 0.11, 1.06, "timber"), 0, 0.84, 0);
  put(g, kit.box(1.69, 0.025, 1.05, "timber-light"), 0, 0.904, 0);
  for (const x of [-0.68, 0.68]) for (const z of [-0.38, 0.38]) put(g, kit.cylinder(0.04, 0.035, 0.82, "slate"), x, 0.41, z);
  put(g, kit.box(0.85, 0.54, 0.055, "graphite"), 0, 1.24, -0.26);
  const screen = put(g, kit.box(0.76, 0.43, 0.01, "glass"), 0, 1.255, -0.223);
  screen.material = kit.material("glass", { glow: "screen-glow" });
  for (let i = 0; i < 4; i++)
    put(g, kit.box(0.26 + (i % 2) * 0.21, 0.023, 0.012, i === 0 ? "code-hi" : "code", 0.004), -0.095, 1.38 - i * 0.065, -0.209);
  put(g, kit.box(0.09, 0.17, 0.045, "slate"), 0, 0.98, -0.27);
  put(g, kit.box(0.34, 0.025, 0.22, "slate"), 0, 0.927, -0.27);
  put(g, kit.box(0.48, 0.027, 0.17, "paper"), 0, 0.938, 0.19);
  put(g, kit.cylinder(0.055, 0.05, 0.12, MUGS[Math.abs(seed) % 3]!), 0.61, 0.973, 0.07);
  put(g, kit.box(0.2, 0.035, 0.28, "desk-pad"), -0.56, 0.939, 0.11);
  const tinyPlant = plant(kit, seed);
  tinyPlant.scale.setScalar(0.38);
  put(g, tinyPlant, 0.61, 0.919, -0.31);
  return g;
}

export function bench(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.box(1.64, 0.12, 0.47, "bench-top"), 0, 0.49, 0);
  for (const x of [-0.59, 0.59]) put(g, kit.box(0.09, 0.48, 0.38, "moss"), x, 0.24, 0);
  put(g, kit.box(0.46, 0.06, 0.39, "cushion"), 0.28, 0.58, 0);
  return g;
}

export function lamp(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.cylinder(0.2, 0.2, 0.06, "lamp-base"), 0, 0.03, 0);
  put(g, kit.cylinder(0.027, 0.027, 1.63, "brass"), 0, 0.85, 0);
  put(g, kit.cylinder(0.12, 0.26, 0.33, "lamp-shade"), 0, 1.72, 0);
  const bulb = put(g, kit.sphere(0.08, "lamp-glow"), 0, 1.57, 0);
  bulb.material = kit.material("lamp-glow", { glow: 0.8 });
  return g;
}

export function sofa(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.box(1.73, 0.3, 1.05, "sage", 0.13), 0, 0.34, 0);
  put(g, kit.box(1.73, 0.54, 0.25, "sage", 0.11), 0, 0.64, 0.39);
  for (const x of [-0.75, 0.75]) put(g, kit.box(0.22, 0.46, 1.07, "sage", 0.1), x, 0.49, 0);
  for (const x of [-0.36, 0.36]) put(g, kit.box(0.67, 0.15, 0.77, "sofa-cushion", 0.065), x, 0.53, -0.08);
  put(g, kit.box(0.37, 0.32, 0.12, "pillow", 0.06), -0.49, 0.72, 0.2).rotation.z = 0.22;
  for (const x of [-0.63, 0.63]) for (const z of [-0.33, 0.33]) put(g, kit.cylinder(0.04, 0.04, 0.23, "sofa-leg"), x, 0.115, z);
  return g;
}

export function table(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.cylinder(0.5, 0.5, 0.09, "table-top"), 0, 0.43, 0);
  put(g, kit.cylinder(0.2, 0.27, 0.4, "clay"), 0, 0.2, 0);
  put(g, kit.box(0.27, 0.035, 0.35, "book"), -0.08, 0.493, 0.03);
  put(g, kit.cylinder(0.065, 0.06, 0.12, "cup"), 0.21, 0.54, -0.08);
  return g;
}

export function shelf(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  for (const y of [0.15, 0.65, 1.15, 1.65]) put(g, kit.box(0.5, 0.055, 1.72, "shelf"), 0, y, 0);
  for (const z of [-0.81, 0.81]) put(g, kit.box(0.47, 1.7, 0.045, "shelf"), 0, 0.85, z);
  for (let i = 0; i < 9; i++)
    put(g, kit.box(0.32, 0.22 + (i % 2) * 0.1, 0.075, ["book-a", "book-b", "book-c"][i % 3]!), 0.02, i < 5 ? 0.805 : 1.3, -0.6 + (i % 5) * 0.15);
  return g;
}

/** A workstation that fits 2 x 1 interior cells: the Greenhouse desk at the interior scale. */
export function workdesk(kit: Kit, seed = 0): THREE.Group {
  const g = new THREE.Group();
  const d = desk(kit, seed);
  d.scale.setScalar(0.62);
  g.add(d);
  return g;
}

/** The lead's desk (3 x 2 cells) with its inbox tray on the right. */
export function leadDesk(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const d = desk(kit, 1);
  d.scale.setScalar(0.7);
  g.add(d);
  const tray = new THREE.Group();
  put(tray, kit.box(0.36, 0.03, 0.28, "timber-trim", 0.01), 0, 0, 0);
  for (const [x, z, w, dd] of [
    [0, -0.13, 0.36, 0.02],
    [0, 0.13, 0.36, 0.02],
    [-0.17, 0, 0.02, 0.28],
    [0.17, 0, 0.02, 0.28],
  ] as const)
    put(tray, kit.box(w, 0.06, dd, "timber-trim", 0.005), x, 0.03, z);
  put(g, tray, -0.45, 0.645, 0.18);
  return g;
}

/* ── The three-room building (spec addendum "three rooms per building") ──────────────────────────────────────────── */

/** The shelves of a status rack: the first shelf's top above the floor, and the rise from one shelf to the next. */
export const RACK_SHELF_TOP = 0.09;
export const RACK_SHELF_PITCH = 0.36;
const RACK_SHELVES = 4;

/**
 * A status rack of Administration: three cells wide and one deep (1.8 x 0.6 at the interior scale), four open timber
 * shelves on a slate frame, a sign board on top. The sign's words are a label of the view (a real text label, like a
 * room sign), never baked in. Boxes stand on the shelves: `RACK_SHELF_TOP + level * RACK_SHELF_PITCH`.
 */
export function statusRack(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const width = 1.68,
    depth = 0.46;
  const top = RACK_SHELF_TOP + (RACK_SHELVES - 1) * RACK_SHELF_PITCH;
  for (let i = 0; i < RACK_SHELVES; i++) {
    const y = RACK_SHELF_TOP + i * RACK_SHELF_PITCH;
    put(g, kit.box(width, 0.035, depth, i % 2 ? "timber-light" : "timber", 0.008), 0, y - 0.0175, 0);
  }
  // Four slate uprights and a back rail per shelf, so the rack reads as a frame from the home camera.
  for (const x of [-width / 2 + 0.03, width / 2 - 0.03]) for (const z of [-depth / 2 + 0.03, depth / 2 - 0.03]) put(g, kit.box(0.04, top + 0.2, 0.04, "slate", 0.008), x, (top + 0.2) / 2, z);
  for (let i = 1; i < RACK_SHELVES; i++) put(g, kit.box(width - 0.08, 0.025, 0.02, "slate", 0.004), 0, RACK_SHELF_TOP + i * RACK_SHELF_PITCH - 0.14, -depth / 2 + 0.05);
  // The sign board: a cream plaque on a timber rail across the top of the frame.
  put(g, kit.box(width + 0.04, 0.05, 0.05, "timber-trim", 0.01), 0, top + 0.22, -depth / 2 + 0.03);
  put(g, kit.box(0.74, 0.22, 0.03, "cream", 0.006), 0, top + 0.37, -depth / 2 + 0.03);
  put(g, kit.box(0.8, 0.26, 0.02, "timber-trim", 0.008), 0, top + 0.37, -depth / 2 + 0.005);
  // The view reads the shelf rise from the model, so a style with other shelves keeps the boxes on them.
  g.userData.shelfPitch = RACK_SHELF_PITCH;
  return g;
}

/**
 * The huddle: a small round table on the floor where the agents gather (it replaces the meeting room). Two cells
 * square; places all round it. Its top is a work surface in the manifest (`furniture.huddle-table`).
 */
export function huddleTable(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.cylinder(0.2, 0.26, 0.04, "sage"), 0, 0.02, 0);
  put(g, kit.cylinder(0.05, 0.07, 0.46, "sage"), 0, 0.27, 0);
  put(g, kit.cylinder(0.52, 0.52, 0.02, "timber"), 0, 0.5, 0);
  put(g, kit.cylinder(0.5, 0.5, 0.025, "timber-light"), 0, 0.52, 0);
  // A jug of flowers in the middle and a few notes: the table is in use.
  put(g, kit.cylinder(0.045, 0.035, 0.11, "cup"), 0, 0.585, 0);
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4;
    const bloom = put(g, kit.sphere(0.03, ["blossom", "blossom-deep", "blossom-white"][i]!), Math.sin(a) * 0.035, 0.66 + (i % 2) * 0.02, Math.cos(a) * 0.035);
    bloom.castShadow = false;
  }
  put(g, kit.box(0.14, 0.01, 0.1, "paper", 0.003), 0.26, 0.535, -0.12).rotation.y = 0.5;
  put(g, kit.box(0.14, 0.01, 0.1, "paper", 0.003), -0.22, 0.535, 0.2).rotation.y = -0.3;
  return g;
}

/**
 * Administration's archive counter: a chalk counter with a timber top, a ledger and a small brass bell. The archived
 * count stands over it as a label of the view. Two cells wide, one deep; its front faces +z.
 */
export function archiveCounter(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.box(1.1, 0.5, 0.42, "chalk", 0.025), 0, 0.25, 0);
  put(g, kit.box(1.18, 0.045, 0.5, "timber", 0.012), 0, 0.52, 0);
  put(g, kit.box(1.1, 0.03, 0.02, "timber-trim", 0.006), 0, 0.3, 0.2);
  // A ledger open on the top, a stack of filed cards, the bell.
  put(g, kit.box(0.3, 0.02, 0.22, "book-a", 0.004), -0.25, 0.552, 0.03).rotation.y = 0.12;
  put(g, kit.box(0.26, 0.012, 0.19, "paper", 0.003), -0.25, 0.568, 0.03).rotation.y = 0.12;
  for (let i = 0; i < 3; i++) put(g, kit.box(0.2, 0.05, 0.14, ["book-b", "book-c", "book-a"][i]!, 0.006), 0.22 + i * 0.015, 0.567 + i * 0.05, -0.08);
  put(g, kit.cylinder(0.035, 0.045, 0.03, "brass"), 0.42, 0.557, 0.1);
  put(g, kit.sphere(0.035, "brass"), 0.42, 0.6, 0.1);
  return g;
}

/**
 * The window in the lead's office's east wall, onto the floor: a timber frame with four panes standing on the
 * partition, so the lead sees the floor and the floor sees the lead. Hangs on a partition like the small art pieces
 * (its origin is its footprint centre at floor level; its face is +z).
 */
export function officeWindow(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const width = 1.16,
    height = 0.74,
    base = 0.5;
  put(g, kit.box(width, 0.06, 0.12, "timber", 0.012), 0, base + 0.03, 0);
  for (const x of [-width / 2 + 0.03, width / 2 - 0.03]) put(g, kit.box(0.06, height, 0.08, "timber", 0.01), x, base + height / 2, 0);
  put(g, kit.box(width, 0.06, 0.1, "timber", 0.012), 0, base + height - 0.03, 0);
  put(g, kit.box(0.04, height - 0.12, 0.06, "timber-trim", 0.008), 0, base + height / 2, 0);
  put(g, kit.box(width - 0.12, 0.04, 0.06, "timber-trim", 0.008), 0, base + height / 2, 0);
  const pane = put(g, kit.box(width - 0.12, height - 0.12, 0.012, "glass", 0.002), 0, base + height / 2, 0);
  pane.material = kit.material("glass", { transparent: 0.35 });
  pane.castShadow = false;
  // A small plant on the sill, on the office side.
  const pot = plant(kit, 3);
  pot.scale.setScalar(0.22);
  put(g, pot, width / 2 - 0.2, base + 0.06, 0.1);
  return g;
}

/** A desk by role (addendum "three rooms"): the analyst's screens, the designer's drawing table. */
export type DeskRole = "analyst" | "design";

/**
 * A workstation of the floor, by its zone: the plain desk (`workdesk`), with a second screen and a chart stand for the
 * analyst, or a small drawing board on trestles beside it for the designer. The footprint stays 2 x 1: what is added
 * stands on the desk's top or within its cells.
 */
export function roleDesk(kit: Kit, role: DeskRole, seed = 0): THREE.Group {
  const g = workdesk(kit, seed);
  // The desk's own frame, at its scale: the seat is at +z, the camera at -z, the top at 0.565; the lamp stands at
  // (+0.42, -0.12), the ticket stack at (-0.21, 0), the pad at (-0.35, +0.07), the mug and the plant at +0.38.
  if (role === "analyst") {
    // A second monitor at the desk's east end, turned to the seat, and a chart on a stand before the screens.
    const monitor = new THREE.Group();
    put(monitor, kit.box(0.28, 0.21, 0.03, "graphite"), 0, 0.105, 0);
    const screen = put(monitor, kit.box(0.25, 0.17, 0.008, "glass"), 0, 0.115, 0.017);
    screen.material = kit.material("glass", { glow: "screen-glow" });
    for (let i = 0; i < 3; i++) put(monitor, kit.box(0.06 + i * 0.04, 0.012, 0.004, i ? "code" : "code-hi", 0.001), -0.07 + i * 0.02, 0.165 - i * 0.035, 0.022);
    put(monitor, kit.box(0.04, 0.06, 0.03, "slate"), 0, -0.03, -0.005);
    put(monitor, kit.box(0.14, 0.012, 0.09, "slate"), 0, -0.06, -0.005);
    monitor.rotation.y = 0.5;
    put(g, monitor, -0.44, 0.63, -0.12);
    const chart = put(g, kit.box(0.1, 0.075, 0.005, "paper", 0.001), 0.1, 0.63, -0.02);
    chart.rotation.set(0.35, 0.15, 0);
    for (let i = 0; i < 4; i++) put(chart, kit.box(0.012, 0.02 + i * 0.01, 0.003, ["sage", "coral", "tangerine", "circle"][i]!, 0.001), -0.03 + i * 0.018, -0.025 + (0.02 + i * 0.01) / 2, 0.003);
  } else {
    // A drawing board on two trestles, leaning on the desk's far side and tilted to the camera: a sketch, three
    // colour swatches and a cup of pencils on its ledge.
    const board = new THREE.Group();
    for (const x of [-0.18, 0.18]) put(board, kit.box(0.03, 0.72, 0.2, "timber", 0.006), x, 0.36, 0);
    const tilt = -0.42;
    const top = put(board, kit.box(0.5, 0.025, 0.36, "timber-light", 0.006), 0, 0.75, 0);
    top.rotation.x = tilt;
    const sheet = put(board, kit.box(0.36, 0.006, 0.26, "paper", 0.002), 0, 0.766, -0.004);
    sheet.rotation.x = tilt;
    put(sheet, kit.box(0.2, 0.004, 0.004, "ink", 0.001), -0.03, 0.004, -0.04).rotation.y = 0.4;
    put(sheet, kit.box(0.14, 0.004, 0.004, "ink", 0.001), 0.05, 0.004, 0.03).rotation.y = -0.7;
    for (let i = 0; i < 3; i++) put(sheet, kit.box(0.045, 0.004, 0.045, ["coral", "sage", "tangerine"][i]!, 0.001), -0.1 + i * 0.1, 0.004, 0.09);
    const ledge = put(board, kit.box(0.5, 0.02, 0.03, "timber", 0.004), 0, 0.675, -0.17);
    ledge.rotation.x = tilt;
    put(board, kit.cylinder(0.025, 0.022, 0.07, "clay"), 0.2, 0.725, -0.15);
    put(g, board, 0.1, 0, -0.38);
  }
  return g;
}
