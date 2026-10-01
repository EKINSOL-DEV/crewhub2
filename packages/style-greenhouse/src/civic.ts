/* The town's landmarks: the post office, the town hall, the square and the café. Their small props (benches, planters,
   the fountain, café tables, parcels, the bus stop) are parts-JSON in ../models; the buildings and lots are too big for
   that format, so code assembles them from rounded boxes, roofs and those data props. Each landmark's static meshes are
   baked into one merged mesh per material, once per kit; plants (instanced leaves) and the fountain's water stay live.
   Origins: the footprint centre on the ground; the front faces +z. A building stands at the back of its footprint and
   leaves the front open as a forecourt (post office: 8 x 8 with z 1..4 open; town hall: 9 x 9 with z 1.5..4.5 open). */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { put, type Kit, type Swatch } from "./kit.ts";
import { lamp, plant } from "./furniture.ts";

/** A model by key from the style (a data prop or a code piece). */
export type Piece = (key: string) => THREE.Object3D;

/* ── Baking ──────────────────────────────────────────────────────────── */

interface Baked {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}
const bakedByKit = new WeakMap<Kit, Map<string, Baked[]>>();

/** Merges the static meshes under `root` per material; the geometries live in the kit, so they go with it. */
function bake(kit: Kit, name: string, root: THREE.Group): Baked[] {
  root.updateMatrixWorld(true);
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material)) return;
    const source = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const attribute of Object.keys(source.attributes)) if (!["position", "normal", "uv"].includes(attribute)) source.deleteAttribute(attribute);
    if (!source.attributes.uv) source.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(source.attributes.position!.count * 2), 2));
    if (!source.attributes.normal) source.computeVertexNormals();
    source.applyMatrix4(o.matrixWorld);
    const list = byMaterial.get(o.material) ?? [];
    list.push(source);
    byMaterial.set(o.material, list);
  });
  const baked: Baked[] = [];
  let i = 0;
  for (const [material, geometries] of byMaterial) {
    const geometry = kit.geometry(`civic:${name}:${i++}`, () => mergeGeometries(geometries, false) ?? new THREE.BufferGeometry());
    for (const g of geometries) g.dispose();
    baked.push({ geometry, material });
  }
  return baked;
}

/** The landmark `name`: its static part built and baked once per kit, its live part built fresh each time. */
function landmark(kit: Kit, name: string, build: (g: THREE.Group) => void, live?: (g: THREE.Group) => void): THREE.Group {
  let cache = bakedByKit.get(kit);
  if (!cache) bakedByKit.set(kit, (cache = new Map()));
  let baked = cache.get(name);
  if (!baked) {
    const source = new THREE.Group();
    build(source);
    baked = bake(kit, name, source);
    cache.set(name, baked);
  }
  const g = new THREE.Group();
  g.name = name;
  for (const { geometry, material } of baked) g.add(kit.mesh(geometry, material));
  live?.(g);
  return g;
}

/* ── Shapes ──────────────────────────────────────────────────────────── */

/** A triangular prism: a gable `span` wide along z and `rise` high, `length` long along x; its base sits on y = 0. */
function gable(kit: Kit, length: number, span: number, rise: number, color: Swatch): THREE.Mesh {
  const geometry = kit.geometry(`civic:gable:${length},${span},${rise}`, () => {
    const shape = new THREE.Shape();
    shape.moveTo(-span / 2, 0);
    shape.lineTo(span / 2, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false }).translate(0, 0, -length / 2).rotateY(Math.PI / 2);
  });
  return kit.mesh(geometry, kit.material(color));
}

/** A hipped roof: a four-sided pyramid over a `width` x `depth` rectangle, `rise` high, base on y = 0. */
function hip(kit: Kit, width: number, depth: number, rise: number, color: Swatch): THREE.Mesh {
  const geometry = kit.geometry(`civic:hip:${width},${depth},${rise}`, () =>
    new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0).scale(width, rise, depth),
  );
  return kit.mesh(geometry, kit.material(color));
}

interface RoofSpec {
  /** Along x, with the overhang. */
  length: number;
  /** Eave to eave along z. */
  span: number;
  rise: number;
  /** Eave height and the ridge's z. */
  y: number;
  z: number;
  color: Swatch;
  rows: Swatch;
  /** The wall width under it, for the gable ends; 0 for none. */
  gable?: { length: number; span: number; color: Swatch };
}

/** A pitched roof with its ridge along x: two slabs, rows of tiles, a ridge cap and chalk gables underneath. */
function pitched(g: THREE.Group, kit: Kit, r: RoofSpec) {
  const half = r.span / 2,
    slope = Math.hypot(half, r.rise),
    angle = Math.atan2(r.rise, half),
    thick = 0.14;
  if (r.gable) put(g, gable(kit, r.gable.length, r.gable.span, r.rise * (r.gable.span / r.span), r.gable.color), 0, r.y, r.z);
  for (const side of [1, -1]) {
    const nz = side * Math.sin(angle),
      ny = Math.cos(angle);
    const slab = put(g, kit.box(r.length, thick, slope + 0.08, r.color, 0.05), 0, r.y + r.rise / 2 + ny * thick * 0.5, r.z + (side * half) / 2 + nz * thick * 0.5);
    slab.rotation.x = side * angle;
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const row = put(
        g,
        kit.box(r.length + 0.02, 0.05, 0.07, r.rows, 0.02),
        0,
        r.y + r.rise * (1 - t) + ny * (thick + 0.02),
        r.z + side * half * t + nz * (thick + 0.02),
      );
      row.rotation.x = side * angle;
    }
    // A slightly heavier eave line.
    const eave = put(g, kit.box(r.length + 0.04, 0.09, 0.12, r.rows, 0.03), 0, r.y + ny * thick * 0.6, r.z + side * (half + 0.02));
    eave.rotation.x = side * angle;
  }
  const ridge = put(g, kit.cylinder(0.1, 0.1, r.length + 0.08, r.rows), 0, r.y + r.rise + 0.1, r.z);
  ridge.rotation.z = Math.PI / 2;
}

/* A chunky pixel font for the shop signs: 3 x 5 cells per letter. */
const FONT: Record<string, string[]> = {
  P: ["110", "101", "110", "100", "100"],
  O: ["010", "101", "101", "101", "010"],
  S: ["011", "100", "010", "001", "110"],
  T: ["111", "010", "010", "010", "010"],
  C: ["011", "100", "100", "100", "011"],
  A: ["010", "101", "111", "101", "101"],
  F: ["111", "100", "110", "100", "100"],
  E: ["111", "100", "110", "100", "111"],
};

/** `text` in raised letters on the xy plane, centred on the origin, `cell` per pixel. */
function letters(kit: Kit, text: string, cell: number, color: Swatch): THREE.Group {
  const g = new THREE.Group();
  const advance = cell * 4;
  const start = -((text.length * advance - cell) / 2);
  [...text].forEach((ch, i) => {
    const rows = FONT[ch];
    if (!rows) return;
    rows.forEach((row, y) => {
      let x = 0;
      while (x < 3) {
        if (row[x] !== "1") {
          x++;
          continue;
        }
        let end = x;
        while (end < 3 && row[end] === "1") end++;
        const w = (end - x) * cell;
        put(g, kit.box(w, cell, cell * 0.6, color, 0.012), start + i * advance + x * cell + w / 2, (2 - y) * cell, 0);
        x = end;
      }
    });
  });
  return g;
}

/** A framed window on a wall facing +z: the frame, a lit pane (it glows under lamplight) and a cross of mullions. */
function window_(g: THREE.Group, kit: Kit, x: number, y: number, z: number, w: number, h: number, frame: Swatch, arched = false) {
  put(g, kit.box(w + 0.16, h + 0.16, 0.08, frame, 0.03), x, y, z);
  put(g, kit.box(w, h, 0.08, "window", 0.02), x, y, z + 0.02).material = kit.material("window", { glow: 0.45 });
  if (arched) {
    const back = put(g, kit.cylinder(w / 2 + 0.08, w / 2 + 0.08, 0.08, frame), x, y + h / 2, z);
    back.rotation.x = Math.PI / 2;
    const pane = put(g, kit.cylinder(w / 2, w / 2, 0.08, "window"), x, y + h / 2, z + 0.02);
    pane.rotation.x = Math.PI / 2;
    pane.material = kit.material("window", { glow: 0.45 });
  }
  put(g, kit.box(0.04, h, 0.04, frame, 0.01), x, y, z + 0.07);
  put(g, kit.box(w, 0.04, 0.04, frame, 0.01), x, y + (arched ? h * 0.18 : 0), z + 0.07);
  put(g, kit.box(w + 0.26, 0.06, 0.18, "cream", 0.02), x, y - h / 2 - 0.1, z + 0.08);
}

/** Lays flagstones in staggered rows over a `w` x `d` rectangle centred on (x, z). */
function flagstones(g: THREE.Group, kit: Kit, x: number, z: number, w: number, d: number, colors: Swatch[], size = 0.9) {
  const rows = Math.max(1, Math.round(d / (size * 0.7)));
  const rowDepth = d / rows;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? size / 2 : 0;
    for (let left = -w / 2 - offset; left < w / 2 - 0.05; left += size) {
      const a = Math.max(left, -w / 2),
        b = Math.min(left + size, w / 2);
      if (b - a < 0.15) continue;
      const color = colors[(r * 7 + Math.round(left * 3)) % colors.length]!;
      put(g, kit.box(b - a - 0.05, 0.03, rowDepth - 0.05, color, 0.012), x + (a + b) / 2, 0.015, z - d / 2 + (r + 0.5) * rowDepth);
    }
  }
}

function placed(g: THREE.Group, piece: THREE.Object3D, x: number, y: number, z: number, turn = 0, scale = 1) {
  piece.rotation.y = turn;
  piece.scale.setScalar(scale);
  return put(g, piece, x, y, z);
}

/* ── The post office ─────────────────────────────────────────────────── */

const PO = { w: 7.2, d: 4.4, z: -1.6, h: 2.7, base: 0.2 };

/** A chalk house with a clay-tiled roof, a POST sign, a sage awning over the sorting window, a mail slot in the door and
 *  a timber loading step where the postman's cart stands among the parcels. */
export function postOffice(kit: Kit, piece: Piece): THREE.Group {
  const front = PO.z + PO.d / 2;
  const floor = PO.base;
  return landmark(
    kit,
    "post-office",
    (g) => {
      // Foundation, walls, skirting and the timber corners and fascia.
      put(g, kit.box(PO.w + 0.36, PO.base, PO.d + 0.36, "ledge", 0.04), 0, PO.base / 2, PO.z);
      put(g, kit.box(PO.w, PO.h, PO.d, "chalk", 0.04), 0, floor + PO.h / 2, PO.z);
      put(g, kit.box(PO.w + 0.05, 0.3, PO.d + 0.05, "skirt", 0.03), 0, floor + 0.15, PO.z);
      for (const x of [-PO.w / 2, PO.w / 2]) for (const z of [PO.z - PO.d / 2, front]) put(g, kit.box(0.26, PO.h, 0.26, "timber-trim", 0.04), x, floor + PO.h / 2, z);
      put(g, kit.box(PO.w + 0.2, 0.18, PO.d + 0.2, "timber-trim", 0.04), 0, floor + PO.h + 0.02, PO.z);
      pitched(g, kit, {
        length: PO.w + 0.7,
        span: PO.d + 0.8,
        rise: 1.5,
        y: floor + PO.h + 0.08,
        z: PO.z,
        color: "roof",
        rows: "roof-dark",
        gable: { length: PO.w, span: PO.d, color: "chalk" },
      });
      // A chimney on the back slope.
      put(g, kit.box(0.5, 1.3, 0.5, "terracotta", 0.05), -2.3, floor + PO.h + 1.2, PO.z - 0.9);
      put(g, kit.box(0.62, 0.12, 0.62, "slate", 0.04), -2.3, floor + PO.h + 1.9, PO.z - 0.9);

      // The door: moss green, a lit pane, a brass mail slot and knob, a stone step.
      const doorX = -1.2;
      put(g, kit.box(1.2, 2.0, 0.1, "timber-trim", 0.03), doorX, floor + 1.0, front + 0.02);
      put(g, kit.box(0.98, 1.86, 0.1, "moss", 0.03), doorX, floor + 0.93, front + 0.05);
      put(g, kit.box(0.56, 0.5, 0.06, "window", 0.02), doorX, floor + 1.45, front + 0.09).material = kit.material("window", { glow: 0.45 });
      put(g, kit.box(0.4, 0.07, 0.05, "brass", 0.015), doorX, floor + 0.92, front + 0.11);
      put(g, kit.sphere(0.05, "brass"), doorX + 0.34, floor + 0.95, front + 0.13);
      put(g, kit.box(1.5, 0.14, 0.55, "step", 0.03), doorX, 0.07, front + 0.3);
      // A little hood over the door.
      const hood = put(g, kit.box(1.5, 0.08, 0.6, "sage", 0.03), doorX, floor + 2.17, front + 0.28);
      hood.rotation.x = 0.35;
      for (const x of [doorX - 0.68, doorX + 0.68]) put(g, kit.box(0.06, 0.32, 0.06, "timber-trim", 0.02), x, floor + 2.0, front + 0.5);

      // The POST sign stands on the front slope of the roof, above the door, where the town camera sees it.
      const signY = floor + PO.h + 0.78,
        signZ = front - 0.25;
      for (const x of [doorX - 0.7, doorX + 0.7]) put(g, kit.box(0.08, 0.5, 0.08, "timber-trim", 0.02), x, signY - 0.3, signZ - 0.05);
      put(g, kit.box(2.0, 0.72, 0.1, "timber-trim", 0.04), doorX, signY, signZ);
      put(g, kit.box(1.86, 0.58, 0.06, "moss", 0.03), doorX, signY, signZ + 0.04);
      put(g, letters(kit, "POST", 0.095, "cream"), doorX, signY, signZ + 0.1);
      // A window left of the door, with a flower box.
      window_(g, kit, -2.75, floor + 1.35, front + 0.02, 0.9, 1.0, "timber-trim");
      put(g, kit.box(1.1, 0.2, 0.22, "timber", 0.04), -2.75, floor + 0.62, front + 0.16);
      for (let i = 0; i < 5; i++) put(g, kit.sphere(0.09, i % 2 ? "leaf" : "leaf-dark"), -3.15 + i * 0.2, floor + 0.78, front + 0.17);
      for (let i = 0; i < 4; i++) put(g, kit.sphere(0.05, i % 2 ? "coral" : "cream"), -3.05 + i * 0.2, floor + 0.86, front + 0.25);

      // The sorting window: wide and lit, a timber counter in front, letters waiting on it.
      const sortX = 1.75;
      window_(g, kit, sortX, floor + 1.4, front + 0.02, 1.9, 1.05, "timber-trim");
      put(g, kit.box(2.3, 0.08, 0.5, "timber", 0.03), sortX, floor + 0.78, front + 0.24);
      for (const x of [sortX - 1.0, sortX + 1.0]) put(g, kit.box(0.08, 0.3, 0.08, "timber-trim", 0.02), x, floor + 0.62, front + 0.42);
      for (let i = 0; i < 3; i++) put(g, kit.box(0.26, 0.02, 0.18, i === 1 ? "paper" : "cream", 0.006), sortX - 0.6 + i * 0.33, floor + 0.83 + i * 0.003, front + 0.24).rotation.y = (i - 1) * 0.25;
      // The striped sage awning over it, with a scalloped edge.
      const stripes = 7,
        awningW = 2.5;
      for (let i = 0; i < stripes; i++) {
        const stripe = put(g, kit.box(awningW / stripes + 0.005, 0.06, 0.95, i % 2 ? "cream" : "sage", 0.02), sortX - awningW / 2 + (i + 0.5) * (awningW / stripes), floor + 2.12, front + 0.42);
        stripe.rotation.x = 0.42;
      }
      for (let i = 0; i < stripes; i++) {
        const scallop = put(g, kit.sphere(awningW / stripes / 2, i % 2 ? "cream" : "sage"), sortX - awningW / 2 + (i + 0.5) * (awningW / stripes), floor + 1.92, front + 0.86);
        scallop.scale.set(1, 0.7, 0.25);
      }
      // Side windows.
      for (const side of [-1, 1]) {
        const w = new THREE.Group();
        window_(w, kit, 0, 0, 0, 0.9, 0.95, "timber-trim");
        w.rotation.y = side * (Math.PI / 2);
        put(g, w, side * (PO.w / 2 + 0.02), floor + 1.4, PO.z);
      }

      // The loading step: a timber deck in front of the sorting window, with the postman's cart and parcels.
      put(g, kit.box(2.3, 0.3, 1.2, "timber", 0.04), 2.3, 0.15, front + 0.62);
      for (let i = 0; i < 4; i++) put(g, kit.box(2.32, 0.012, 0.02, "timber-trim", 0.005), 2.3, 0.305, front + 0.17 + i * 0.3);
      put(g, kit.box(0.7, 0.15, 0.36, "timber", 0.03), 1.35, 0.075, front + 1.36);
      placed(g, piece("cart"), 2.75, 0.3, front + 0.66, -0.3, 1.1);
      placed(g, piece("civic.parcel-stack"), 3.65, 0, front + 0.5, -0.5, 0.95);
      placed(g, piece("crate"), 1.75, 0.3, front + 0.5, 0.2, 0.9);
      placed(g, piece("mailbox"), -3.05, 0, front + 1.15, 0, 1.3);

      // The forecourt: flagstones from the door, open for the postman.
      flagstones(g, kit, -0.2, front + 1.9 - 0.15, 6.6, 2.9, ["step", "clay", "step", "paper"]);
      placed(g, piece("civic.notice-board"), -3.2, 0, front + 2.2, 0.45, 0.85);
    },
    (g) => {
      // Plants flank the window and the door's left side; the ground right of the door is the postman's.
      for (const x of [-3.65, -1.95]) placed(g, plant(kit, x > -3 ? 2 : 5), x, 0, front + 0.3, 0, 0.75);
    },
  );
}

/* ── The town hall ───────────────────────────────────────────────────── */

const TH = { w: 8.4, d: 3.8, z: -2.5, h: 2.9, podium: 0.48 };

/** A chalk civic hall on a stepped podium: a pediment on four columns, tall arched windows that glow in lamplight, a
 *  slate hipped roof, a clock cupola with a flag, and planters and lanterns by the steps. */
export function townHall(kit: Kit, piece: Piece): THREE.Group {
  const top = TH.podium,
    facade = TH.z + TH.d / 2;
  const roofY = top + TH.h + 0.22;
  return landmark(
    kit,
    "town-hall",
    (g) => {
      // The podium and its steps.
      put(g, kit.box(TH.w + 0.6, TH.podium, 5.3, "ledge", 0.05), 0, TH.podium / 2, -2.0);
      put(g, kit.box(TH.w + 0.7, 0.06, 5.4, "cream", 0.03), 0, TH.podium - 0.02, -2.0);
      for (let i = 0; i < 3; i++)
        put(g, kit.box(4.6 + i * 0.3, TH.podium - i * 0.16, 0.32, "step", 0.03), 0, (TH.podium - i * 0.16) / 2, 0.75 + i * 0.3);
      // The hall, its plinth band, pilasters and cornice.
      put(g, kit.box(TH.w, TH.h, TH.d, "chalk", 0.04), 0, top + TH.h / 2, TH.z);
      put(g, kit.box(TH.w + 0.06, 0.32, TH.d + 0.06, "skirt", 0.03), 0, top + 0.16, TH.z);
      for (const x of [-TH.w / 2, -2.25, 2.25, TH.w / 2]) put(g, kit.box(0.3, TH.h, 0.12, "cream", 0.03), x, top + TH.h / 2, facade + 0.04);
      put(g, kit.box(TH.w + 0.3, 0.24, TH.d + 0.3, "cream", 0.05), 0, top + TH.h + 0.1, TH.z);
      put(g, hip(kit, TH.w + 0.5, TH.d + 0.5, 1.4, "slate-roof"), 0, roofY, TH.z);

      // Tall arched windows in the wings, and on the sides.
      for (const x of [-3.3, 3.3]) window_(g, kit, x, top + 1.35, facade + 0.02, 0.62, 1.35, "cream", true);
      for (const side of [-1, 1])
        for (const z of [TH.z - 0.9, TH.z + 0.9]) {
          const w = new THREE.Group();
          window_(w, kit, 0, 0, 0, 0.62, 1.35, "cream", true);
          w.rotation.y = side * (Math.PI / 2);
          put(g, w, side * (TH.w / 2 + 0.02), top + 1.35, z);
        }

      // The portico: four columns, an entablature and a pediment.
      const porticoZ = facade + 0.62;
      for (const x of [-1.6, -0.55, 0.55, 1.6]) {
        put(g, kit.box(0.44, 0.14, 0.44, "cream", 0.03), x, top + 0.07, porticoZ);
        put(g, kit.cylinder(0.15, 0.18, TH.h - 0.3, "cream"), x, top + TH.h / 2, porticoZ);
        put(g, kit.box(0.44, 0.16, 0.44, "cream", 0.03), x, top + TH.h - 0.08, porticoZ);
      }
      put(g, kit.box(4.2, 0.34, 1.6, "cream", 0.04), 0, top + TH.h + 0.1, facade + 0.5);
      put(g, gable(kit, 1.5, 4.3, 0.95, "chalk"), 0, top + TH.h + 0.27, facade + 0.5).rotation.y = Math.PI / 2;
      for (const side of [1, -1]) {
        const angle = Math.atan2(0.95, 2.15);
        const slab = put(g, kit.box(2.45, 0.12, 1.7, "slate-roof", 0.04), (side * 2.15) / 2, top + TH.h + 0.27 + 0.95 / 2 + 0.06, facade + 0.5);
        slab.rotation.z = -side * angle;
      }
      // The tympanum's medallion.
      put(g, kit.cylinder(0.28, 0.28, 0.06, "sage"), 0, top + TH.h + 0.62, facade + 1.27).rotation.x = Math.PI / 2;
      put(g, kit.cylinder(0.16, 0.16, 0.07, "brass"), 0, top + TH.h + 0.62, facade + 1.3).rotation.x = Math.PI / 2;

      // The double door under the portico with a lit fanlight.
      put(g, kit.box(1.5, 2.15, 0.1, "cream", 0.03), 0, top + 1.07, facade + 0.03);
      for (const x of [-0.33, 0.33]) {
        put(g, kit.box(0.6, 1.95, 0.1, "timber", 0.03), x, top + 0.98, facade + 0.07);
        put(g, kit.box(0.42, 0.7, 0.03, "timber-trim", 0.02), x, top + 1.3, facade + 0.12);
        put(g, kit.box(0.42, 0.6, 0.03, "timber-trim", 0.02), x, top + 0.5, facade + 0.12);
        put(g, kit.sphere(0.045, "brass"), x - Math.sign(x) * 0.22, top + 0.95, facade + 0.15);
      }
      const fan = put(g, kit.cylinder(0.55, 0.55, 0.06, "window"), 0, top + 2.0, facade + 0.06);
      fan.rotation.x = Math.PI / 2;
      fan.scale.set(1, 1, 0.55);
      fan.material = kit.material("window", { glow: 0.45 });

      // The clock cupola on the roof ridge, its dome, finial and flag.
      const cy = roofY + 1.45;
      put(g, kit.box(1.3, 1.6, 1.3, "chalk", 0.04), 0, cy - 0.25, TH.z);
      put(g, kit.box(1.45, 0.14, 1.45, "cream", 0.04), 0, cy + 0.6, TH.z);
      for (const [x, z, turn] of [
        [0, 0.66, 0],
        [0.66, 0, Math.PI / 2],
        [-0.66, 0, -Math.PI / 2],
      ] as const) {
        const face = new THREE.Group();
        put(face, kit.cylinder(0.4, 0.4, 0.05, "cream"), 0, 0, 0).rotation.x = Math.PI / 2;
        put(face, kit.mesh(kit.geometry("civic:clock-rim", () => new THREE.TorusGeometry(0.4, 0.04, 8, 28)), kit.material("brass")), 0, 0, 0.02);
        put(face, kit.box(0.04, 0.26, 0.02, "graphite", 0.008), 0, 0.1, 0.04);
        put(face, kit.box(0.2, 0.04, 0.02, "graphite", 0.008), 0.08, 0, 0.045);
        for (let i = 0; i < 4; i++) put(face, kit.box(0.04, 0.04, 0.02, "slate", 0.008), Math.sin((i * Math.PI) / 2) * 0.31, Math.cos((i * Math.PI) / 2) * 0.31, 0.03);
        face.rotation.y = turn;
        put(g, face, x, cy, TH.z + z);
      }
      for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) put(g, kit.box(0.14, 0.7, 0.14, "cream", 0.03), x, cy + 1.02, TH.z + z);
      put(g, kit.sphere(0.2, "brass"), 0, cy + 1.0, TH.z).scale.set(1, 1.15, 1);
      put(g, kit.box(1.3, 0.12, 1.3, "cream", 0.04), 0, cy + 1.42, TH.z);
      put(g, kit.sphere(0.62, "dome"), 0, cy + 1.48, TH.z).scale.set(1, 0.85, 1);
      put(g, kit.sphere(0.09, "brass"), 0, cy + 2.05, TH.z);
      put(g, kit.cylinder(0.025, 0.025, 1.1, "pole"), 0, cy + 2.55, TH.z);
      put(g, kit.box(0.62, 0.38, 0.03, "coral", 0.012), 0.33, cy + 2.88, TH.z);

      // Planters and lanterns flanking the steps; the forecourt stays open for the hall's visitors.
      for (const side of [-1, 1]) {
        placed(g, piece("civic.planter"), side * 3.1, 0, 0.95, 0, 0.9);
        placed(g, lamp(kit), side * 2.35, 0, 1.25, 0, 0.95);
      }
      flagstones(g, kit, 0, 3.0, 5.4, 2.9, ["step", "paper", "step", "clay"]);
    },
    (g) => {
      for (const side of [-1, 1]) placed(g, plant(kit, side + 3), side * 1.95, top, 0.15, 0, 0.75);
    },
  );
}

/* ── The town square ─────────────────────────────────────────────────── */

/** A 10 x 10 paved square: rings and spokes around a fountain, flower beds with little trees at the corners, benches
 *  facing the water and lanterns on the diagonals. The water ripples (a `userData.animate`, still under reduced motion). */
export function square(kit: Kit, piece: Piece): THREE.Group {
  return landmark(
    kit,
    "civic.square",
    (g) => {
      put(g, kit.box(10.2, 0.08, 10.2, "ledge", 0.04), 0, 0.04, 0);
      put(g, kit.box(9.8, 0.04, 9.8, "step", 0.02), 0, 0.09, 0);
      put(g, kit.cylinder(4.3, 4.3, 0.03, "clay"), 0, 0.12, 0);
      for (const [r, tube] of [
        [4.3, 0.09],
        [2.45, 0.07],
      ] as const)
        put(g, kit.mesh(kit.geometry(`civic:ring:${r}`, () => new THREE.TorusGeometry(r, tube, 6, 64).rotateX(Math.PI / 2)), kit.material("cream")), 0, 0.12, 0).scale.y = 0.4;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const spoke = put(g, kit.box(1.8, 0.02, 0.07, "cream", 0.01), Math.cos(a) * 3.38, 0.135, Math.sin(a) * 3.38);
        spoke.rotation.y = -a;
      }
      // Paths in from the four sides.
      for (const a of [0, Math.PI / 2]) {
        const path = put(g, kit.box(9.6, 0.02, 1.3, "paper", 0.01), 0, 0.12, 0);
        path.rotation.y = a;
      }
      put(g, kit.cylinder(2.4, 2.4, 0.035, "paper"), 0, 0.125, 0);
      placed(g, piece("civic.fountain"), 0, 0.14, 0);
      for (const x of [-3.85, 3.85]) for (const z of [-3.85, 3.85]) placed(g, piece("civic.flower-bed"), x, 0.11, z, x * z > 0 ? 0 : 1.3);
      for (const [x, z, turn] of [
        [0, -3.0, 0],
        [-3.0, 0, Math.PI / 2],
        [3.0, 0, -Math.PI / 2],
        [-1.75, 2.45, Math.PI * 0.8],
        [1.75, 2.45, -Math.PI * 0.8],
      ] as const)
        placed(g, piece("civic.park-bench"), x, 0.12, z, turn);
      for (const [x, z] of [
        [-2.55, -2.55],
        [2.55, -2.55],
        [-2.55, 2.55],
        [2.55, 2.55],
      ] as const)
        placed(g, lamp(kit), x, 0.12, z, 0, 1.05);
    },
    (g) => fountainWater(g, kit, 0.14),
  );
}

/** The fountain's water over the `civic.fountain` prop standing at height `base`: a basin and a bowl surface, a curtain
 *  falling from the bowl, rings rippling out and a bubbling jet on top. It animates through `userData.animate` on `g`;
 *  renderers skip that under reduced motion, so the water then stands still. */
export function fountainWater(g: THREE.Group, kit: Kit, base = 0) {
  const water = kit.material("water", { glow: 0.12, transparent: 0.82 });
  const sheet = kit.material("water", { glow: 0.2, transparent: 0.38 });
  const surface = (r: number, y: number) => put(g, kit.mesh(kit.geometry(`civic:water:${r}`, () => new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2)), water), 0, y, 0);
  surface(1.46, base + 0.555);
  surface(0.58, base + 1.605);
  const curtain = put(
    g,
    kit.mesh(kit.geometry("civic:water-curtain", () => new THREE.CylinderGeometry(0.67, 0.86, 1.0, 32, 1, true)), sheet),
    0,
    base + 1.06,
    0,
  );
  curtain.castShadow = false;
  const rings = [0, 1, 2].map(() => {
    const ring = kit.mesh(kit.geometry("civic:ripple", () => new THREE.TorusGeometry(1, 0.025, 4, 48).rotateX(Math.PI / 2)), kit.material("cream", { transparent: 0.6 }));
    ring.castShadow = false;
    return put(g, ring, 0, base + 0.565, 0);
  });
  const drops = [0, 1, 2].map((i) => {
    const drop = put(g, kit.mesh(kit.geometry("civic:drop", () => new THREE.SphereGeometry(0.07, 10, 8)), water), 0, base + 2.1 + i * 0.12, 0);
    drop.castShadow = false;
    return drop;
  });
  let t = 0;
  const step = (seconds: number) => {
    t += seconds;
    rings.forEach((ring, i) => {
      const phase = (t * 0.32 + i / rings.length) % 1;
      ring.scale.set(0.95 + phase * 0.45, 1, 0.95 + phase * 0.45);
    });
    drops.forEach((drop, i) => {
      const s = 1 + 0.25 * Math.sin(t * 5 + i * 2.1);
      drop.scale.set(s, s, s);
      drop.position.y = base + 2.08 + i * 0.11 + 0.03 * Math.sin(t * 4 + i);
    });
    curtain.rotation.y = t * 0.4;
  };
  step(0);
  g.userData.animate = step;
}

/* ── The café ────────────────────────────────────────────────────────── */

/** A little kiosk café (5 x 4): a lit counter under a striped awning, a CAFE sign, a terrace with two parasol tables,
 *  a menu board and a planter. */
export function cafe(kit: Kit, piece: Piece): THREE.Group {
  const K = { w: 3.0, d: 1.3, z: -1.25, h: 2.05 };
  const front = K.z + K.d / 2;
  return landmark(
    kit,
    "civic.cafe",
    (g) => {
      // The terrace.
      put(g, kit.box(5.0, 0.08, 4.0, "ledge", 0.03), 0, 0.04, 0);
      flagstones(g, kit, 0, 0.0, 4.8, 3.8, ["clay", "paper", "step", "terracotta"], 0.7);
      // The kiosk.
      put(g, kit.box(K.w, K.h, K.d, "chalk", 0.04), 0, 0.08 + K.h / 2, K.z);
      put(g, kit.box(K.w + 0.05, 0.26, K.d + 0.05, "sage", 0.03), 0, 0.08 + 0.13, K.z);
      for (const x of [-K.w / 2, K.w / 2]) put(g, kit.box(0.2, K.h, 0.2, "timber-trim", 0.04), x, 0.08 + K.h / 2, front);
      put(g, kit.box(K.w + 0.16, 0.16, K.d + 0.16, "timber-trim", 0.04), 0, 0.08 + K.h, K.z);
      pitched(g, kit, {
        length: K.w + 0.5,
        span: K.d + 0.6,
        rise: 0.8,
        y: 0.08 + K.h + 0.08,
        z: K.z,
        color: "roof",
        rows: "roof-dark",
        gable: { length: K.w, span: K.d, color: "chalk" },
      });
      // The counter window, lit, with the coffee machine and cups behind a timber counter.
      window_(g, kit, 0, 1.3, front + 0.02, 2.1, 0.85, "timber-trim");
      put(g, kit.box(2.5, 0.08, 0.42, "timber", 0.03), 0, 0.84, front + 0.2);
      put(g, kit.box(2.4, 0.74, 0.1, "timber-light", 0.03), 0, 0.45, front + 0.06);
      for (let i = 0; i < 5; i++) put(g, kit.box(0.025, 0.6, 0.02, "timber", 0.008), -0.96 + i * 0.48, 0.45, front + 0.12);
      placed(g, piece("furniture.coffee-machine"), -0.65, 0.88, front + 0.17, 0, 0.7);
      for (const x of [0.1, 0.28, 0.46]) put(g, kit.cylinder(0.045, 0.04, 0.08, "cream"), x, 0.92, front + 0.24);
      // A glass cake dome.
      put(g, kit.cylinder(0.16, 0.16, 0.02, "cream"), 0.85, 0.89, front + 0.22);
      put(g, kit.cylinder(0.1, 0.1, 0.08, "terracotta"), 0.85, 0.94, front + 0.22);
      put(g, kit.sphere(0.15, "glass"), 0.85, 0.93, front + 0.22).material = kit.material("glass", { transparent: 0.45 });
      // The striped awning with its scalloped edge.
      const stripes = 9,
        awningW = 3.1;
      for (let i = 0; i < stripes; i++) {
        const stripe = put(g, kit.box(awningW / stripes + 0.005, 0.06, 1.0, i % 2 ? "cream" : "sage", 0.02), -awningW / 2 + (i + 0.5) * (awningW / stripes), 1.98, front + 0.45);
        stripe.rotation.x = 0.4;
      }
      for (let i = 0; i < stripes; i++) {
        const scallop = put(g, kit.sphere(awningW / stripes / 2, i % 2 ? "cream" : "sage"), -awningW / 2 + (i + 0.5) * (awningW / stripes), 1.77, front + 0.91);
        scallop.scale.set(1, 0.7, 0.25);
      }
      // The CAFE sign on the roof front.
      put(g, kit.box(1.62, 0.52, 0.1, "timber-trim", 0.04), 0, 2.52, front + 0.18);
      put(g, kit.box(1.48, 0.4, 0.06, "moss", 0.03), 0, 2.52, front + 0.22);
      put(g, letters(kit, "CAFE", 0.065, "cream"), 0, 2.52, front + 0.27);
      // The terrace: two tables, the menu board, a planter.
      placed(g, piece("civic.cafe-table"), -1.4, 0.08, 1.15, 0.4);
      placed(g, piece("civic.cafe-table"), 1.4, 0.08, 1.15, -0.3);
      placed(g, piece("civic.menu-board"), -2.0, 0.08, -0.25, 0.5);
      placed(g, piece("civic.planter"), 2.0, 0.08, -1.25, 0, 0.7);
    },
  );
}
