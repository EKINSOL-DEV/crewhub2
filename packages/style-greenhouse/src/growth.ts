/* Greenhouse pieces of a town that is still growing: the staked-out plot and its sign, the scaffolding round a building
   going up and the gate with a district's name. They stretch or carry words, so they are code; the lodge, the mail hut
   and the post box are parts-JSON (../models/town.*.json). Origins: the footprint centre on the ground. Repeated parts
   use the kit's shared geometry, so a renderer can instance or merge them. */
import * as THREE from "three";
import type { ModelOptions } from "@crewhub/world-style";
import { put, type Kit, type Swatch } from "./kit.ts";
import { lettering } from "./shell.ts";

type Size = { width: number; height: number; depth: number };
const size = (o: ModelOptions, fallback: Size): Size => o.size ?? fallback;

/** A thin bar from `a` to `b`: one shared unit box, stretched and turned. */
function bar(kit: Kit, g: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, thickness: number, color: Swatch): THREE.Mesh {
  const mesh = kit.mesh(kit.geometry("growth:bar", () => new THREE.BoxGeometry(1, 1, 1)), kit.material(color));
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.set(thickness, thickness, a.distanceTo(b));
  mesh.lookAt(b);
  g.add(mesh);
  return mesh;
}

/** Evenly spaced stops from -half to half, at most `step` apart, ends included. */
function stops(length: number, step: number): number[] {
  const count = Math.max(1, Math.ceil(length / step));
  return Array.from({ length: count + 1 }, (_, i) => -length / 2 + (i * length) / count);
}

/**
 * A plot staked out for a building that is not there yet, `width` by `depth`: timber stakes at the corners and along
 * the edges, a builder's string run between them with a ribbon tied on here and there, and the corner stakes capped
 * in coral. Sized to read from the town camera. The front edge (+z) is left open in the middle, where the garden path will come.
 */
export function stakedPlot(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 6, height: 0, depth: 6 });
  const g = new THREE.Group();
  const seed = o.seed ?? 0;
  const xs = stops(width, 2.6),
    zs = stops(depth, 2.6);
  // The perimeter, clockwise from the back-left corner.
  const ring: { x: number; z: number; corner: boolean }[] = [
    ...xs.slice(0, -1).map((x, i) => ({ x, z: -depth / 2, corner: i === 0 })),
    ...zs.slice(0, -1).map((z, i) => ({ x: width / 2, z, corner: i === 0 })),
    ...[...xs].reverse().slice(0, -1).map((x, i) => ({ x, z: depth / 2, corner: i === 0 })),
    ...[...zs].reverse().slice(0, -1).map((z, i) => ({ x: -width / 2, z, corner: i === 0 })),
  ];
  const top = (s: { corner: boolean }) => (s.corner ? 1.05 : 0.8);
  ring.forEach((s, i) => {
    const lean = (((i * 7 + seed) % 5) - 2) * 0.035;
    const stake = put(g, kit.box(s.corner ? 0.2 : 0.15, top(s) + 0.1, s.corner ? 0.2 : 0.15, "timber", 0.03), s.x, top(s) / 2 - 0.05, s.z);
    stake.rotation.set(lean, 0, -lean);
    if (s.corner) put(g, kit.box(0.24, 0.16, 0.24, "coral", 0.03), s.x, top(s) - 0.06, s.z);
    const next = ring[(i + 1) % ring.length]!;
    // The gate gap: no string across the middle of the front edge.
    const gate = s.z === depth / 2 && next.z === depth / 2 && Math.abs(s.x + next.x) < 2.7 && xs.length > 3;
    if (gate) return;
    const a = new THREE.Vector3(s.x, top(s) - 0.2, s.z),
      b = new THREE.Vector3(next.x, top(next) - 0.2, next.z);
    bar(kit, g, a, b, 0.05, "cream").castShadow = false;
    if ((i * 3 + seed) % 4 === 0) {
      const mid = a.clone().lerp(b, 0.4 + ((i + seed) % 3) * 0.1);
      const ribbon = put(g, kit.box(0.07, 0.34, 0.09, i % 2 ? "coral" : "tangerine", 0.012), mid.x, mid.y - 0.15, mid.z);
      ribbon.castShadow = false;
    }
  });
  return g;
}

/**
 * The sign on a staked plot: a moss board in a timber frame on two posts, the words lettered in cream (`text`, a line
 * break for a second line), under a little slate roof, a sprig of leaves at one post's foot. Faces +z.
 */
export function plotSign(kit: Kit, o: ModelOptions): THREE.Group {
  const text = (o.text ?? "").trim() || " ";
  const g = new THREE.Group();
  const lines = text.split("\n").length;
  const width = Math.min(3.4, Math.max(1.8, 0.6 + Math.max(...text.split("\n").map((l) => l.length)) * 0.115)),
    height = 0.34 + lines * 0.3;
  const y = 1.0 + height / 2;
  for (const side of [-1, 1]) {
    const post = put(g, kit.box(0.11, y + height / 2 + 0.2, 0.11, "timber", 0.03), side * (width / 2 - 0.16), (y + height / 2 + 0.2) / 2, -0.07);
    post.rotation.z = side * -0.015;
  }
  put(g, kit.box(width + 0.1, height + 0.1, 0.07, "timber-trim", 0.03), 0, y, -0.01);
  put(g, kit.box(width, height, 0.06, o.accent ?? "moss", 0.02), 0, y, 0.01);
  const face = new THREE.Mesh(kit.geometry(`plot-sign:${width.toFixed(2)},${height.toFixed(2)}`, () => new THREE.PlaneGeometry(width - 0.1, height - 0.08)), lettering(kit, text, width - 0.1, height - 0.08));
  face.position.set(0, y, 0.043);
  g.add(face);
  const roof = put(g, kit.box(width + 0.36, 0.06, 0.34, "slate-roof", 0.02), 0, y + height / 2 + 0.16, 0.02);
  roof.rotation.x = 0.2;
  // A tuft and two flowers where the left post meets the grass.
  put(g, kit.sphere(1, "leaf"), -width / 2 + 0.02, 0.1, 0.12).scale.set(0.2, 0.13, 0.17);
  put(g, kit.sphere(1, "leaf-dark"), width / 2 - 0.3, 0.08, 0.1).scale.set(0.15, 0.1, 0.13);
  put(g, kit.sphere(0.045, "coral"), -width / 2 + 0.08, 0.2, 0.2);
  put(g, kit.sphere(0.04, "cream"), -width / 2 - 0.08, 0.17, 0.16);
  return g;
}

/**
 * Scaffolding round a building going up, `width` by `depth` on the ground and `height` tall: timber poles, ledgers at
 * every lift, plank decks along the front and the sides, a diagonal brace per bay, a ladder up the front and a sage
 * tarp over one bay. It stands just outside the footprint, so the building rises inside it.
 */
export function scaffolding(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height, depth } = size(o, { width: 6, height: 3, depth: 5 });
  const g = new THREE.Group();
  const LIFT = 1.15,
    POLE = 0.09;
  const lifts = Math.max(1, Math.round(height / LIFT));
  const top = lifts * (height / lifts);
  const lift = top / lifts;
  const xs = stops(width, 2.4),
    zs = stops(depth, 2.4);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Poles round the footprint, a little taller than the top lift, every other one capped in cream.
  const poles: { x: number; z: number }[] = [...xs.flatMap((x) => [{ x, z: -depth / 2 }, { x, z: depth / 2 }]), ...zs.slice(1, -1).flatMap((z) => [{ x: -width / 2, z }, { x: width / 2, z }])];
  poles.forEach((p, i) => {
    const tall = top + 0.35 + (i % 3) * 0.12;
    put(g, kit.cylinder(POLE / 2, POLE / 2 + 0.01, tall, "timber"), p.x, tall / 2, p.z);
    if (i % 2 === 0) put(g, kit.box(0.12, 0.06, 0.12, "cream", 0.015), p.x, tall, p.z);
  });
  for (let l = 1; l <= lifts; l++) {
    const y = l * lift;
    // Ledgers on all four sides, and a guard rail on the front.
    for (const z of [-depth / 2, depth / 2]) bar(kit, g, v(-width / 2 - 0.15, y, z), v(width / 2 + 0.15, y, z), 0.07, "timber");
    for (const x of [-width / 2, width / 2]) bar(kit, g, v(x, y, -depth / 2 - 0.15), v(x, y, depth / 2 + 0.15), 0.07, "timber");
    bar(kit, g, v(-width / 2, y + 0.5, depth / 2), v(width / 2, y + 0.5, depth / 2), 0.05, "timber-light").castShadow = false;
    // Plank decks: two boards wide along the front, one along each side.
    for (let i = 0; i + 1 < xs.length; i++) {
      const a = xs[i]!,
        b = xs[i + 1]!;
      for (const [k, dz] of [0.14, -0.18].entries()) put(g, kit.box(b - a + 0.1, 0.05, 0.3, (i + k + l) % 2 ? "timber-light" : "plank", 0.012), (a + b) / 2, y + 0.06, depth / 2 - 0.08 + dz - 0.1);
    }
    for (const side of [-1, 1])
      for (let i = 0; i + 1 < zs.length; i++) {
        const a = zs[i]!,
          b = zs[i + 1]!;
        put(g, kit.box(0.34, 0.05, b - a + 0.06, (i + l) % 2 ? "plank" : "timber-light", 0.012), side * (width / 2 - 0.1), y + 0.06, (a + b) / 2);
      }
  }
  // A brace across every front bay, leaning the other way on each lift, and one on each side.
  for (let l = 0; l < lifts; l++)
    for (let i = 0; i + 1 < xs.length; i++) {
      const [a, b] = (i + l) % 2 ? [xs[i]!, xs[i + 1]!] : [xs[i + 1]!, xs[i]!];
      bar(kit, g, v(a, l * lift + 0.08, depth / 2 + 0.05), v(b, (l + 1) * lift - 0.04, depth / 2 + 0.05), 0.05, "timber-light").castShadow = false;
    }
  for (const side of [-1, 1]) bar(kit, g, v(side * (width / 2 + 0.05), 0.08, zs[0]!), v(side * (width / 2 + 0.05), lift - 0.04, zs[1]!), 0.05, "timber-light").castShadow = false;
  // The ladder leans on the first deck, right of the middle.
  const lx = xs[Math.min(xs.length - 1, Math.ceil(xs.length / 2))]! - 0.7;
  for (const dx of [-0.17, 0.17]) bar(kit, g, v(lx + dx, 0, depth / 2 + 0.75), v(lx + dx, lift + 0.5, depth / 2 + 0.12), 0.05, "timber-light");
  for (let r = 1; r <= 5; r++) {
    const t = r / 6;
    bar(kit, g, v(lx - 0.17, t * (lift + 0.5), depth / 2 + 0.75 - t * 0.63), v(lx + 0.17, t * (lift + 0.5), depth / 2 + 0.75 - t * 0.63), 0.04, "timber").castShadow = false;
  }
  // A tarp hung over the top-left bay, and a bucket and a stack of planks at the foot.
  const tarp = put(g, kit.box(Math.min(2.2, xs[1]! - xs[0]! - 0.2), lift * 0.8, 0.04, "sage", 0.02), (xs[0]! + xs[1]!) / 2, top - lift * 0.45 + 0.05, depth / 2 + 0.07);
  tarp.rotation.x = -0.05;
  put(g, kit.cylinder(0.14, 0.11, 0.24, "mist"), -width / 2 + 0.7, 0.12, depth / 2 + 0.6);
  for (let i = 0; i < 3; i++) put(g, kit.box(1.5, 0.06, 0.26, i % 2 ? "plank" : "timber-light", 0.012), width / 2 - 1.2, 0.03 + i * 0.065, depth / 2 + 0.7 + i * 0.03).rotation.y = 0.08 * (i - 1);
  return g;
}

/**
 * A district gate over a lane that runs along z, the opening `width` wide: two stone piers with timber posts, a beam
 * under a little slate roof, a name board in the district's colour (`accent`) lettered on both faces (`text`; a sprig
 * of leaves when the district has no name), a lantern hung either side and ivy on the piers.
 */
export function districtGate(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height } = size(o, { width: 4.2, height: 3.3, depth: 0.6 });
  const text = (o.text ?? "").trim();
  const g = new THREE.Group();
  const half = width / 2 + 0.3;
  for (const side of [-1, 1]) {
    const x = side * half;
    put(g, kit.box(0.72, 0.9, 0.72, "ledge", 0.06), x, 0.45, 0);
    put(g, kit.box(0.82, 0.1, 0.82, "cream", 0.03), x, 0.93, 0);
    put(g, kit.box(0.3, height - 0.9, 0.3, "timber", 0.04), x, 0.9 + (height - 0.9) / 2, 0);
    // A knee brace up to the beam, and a lantern hanging from an arm on the outside.
    const brace = put(g, kit.box(0.12, 0.9, 0.12, "timber-trim", 0.03), x - side * 0.36, height - 0.52, 0);
    brace.rotation.z = side * 0.75;
    put(g, kit.box(0.5, 0.07, 0.07, "lantern-iron", 0.02), x + side * 0.36, height - 0.72, 0);
    put(g, kit.box(0.03, 0.2, 0.03, "lantern-iron", 0.01), x + side * 0.54, height - 0.84, 0);
    const glass = put(g, kit.box(0.2, 0.26, 0.2, "lantern-glass", 0.03), x + side * 0.54, height - 1.06, 0);
    glass.material = kit.material("lantern-glass", { glow: "lantern-light" });
    glass.castShadow = false;
    put(g, kit.cylinder(0.02, 0.16, 0.1, "lantern-iron"), x + side * 0.54, height - 0.89, 0);
    // Ivy climbing the pier and the post.
    for (let i = 0; i < 6; i++) {
      const leaf = put(g, kit.sphere(1, i % 2 ? "leaf" : "leaf-dark"), x + side * (0.3 - (i % 3) * 0.1), 0.25 + i * 0.3, (i % 2 ? 0.3 : -0.26) * (i > 3 ? 0.6 : 1.2));
      leaf.scale.set(0.2 - i * 0.012, 0.17, 0.2 - i * 0.012);
    }
  }
  // The beam, the roof over it and its ridge.
  put(g, kit.box(half * 2 + 0.9, 0.24, 0.26, "timber", 0.05), 0, height - 0.1, 0);
  for (const side of [-1, 1]) {
    const slab = put(g, kit.box(half * 2 + 1.3, 0.07, 0.56, "slate-roof", 0.02), 0, height + 0.2, side * 0.22);
    slab.rotation.x = side * 0.62;
  }
  put(g, kit.box(half * 2 + 1.34, 0.08, 0.1, "cream", 0.03), 0, height + 0.38, 0);
  // The name board hangs under the beam on two straps.
  const board = Math.min(width - 0.5, Math.max(1.7, 0.7 + text.length * 0.13)),
    tall = 0.5;
  const y = height - 0.6;
  for (const side of [-1, 1]) put(g, kit.box(0.05, 0.2, 0.05, "brass", 0.012), side * (board / 2 - 0.2), height - 0.28, 0);
  put(g, kit.box(board + 0.1, tall + 0.1, 0.07, "timber-trim", 0.03), 0, y, 0);
  put(g, kit.box(board, tall, 0.1, o.accent ?? "sage", 0.02), 0, y, 0);
  if (text) {
    const geometry = kit.geometry(`gate-face:${board.toFixed(2)}`, () => new THREE.PlaneGeometry(board - 0.1, tall - 0.06));
    for (const side of [-1, 1]) {
      const face = new THREE.Mesh(geometry, lettering(kit, text, board - 0.1, tall - 0.06));
      face.position.set(0, y, side * 0.053);
      if (side < 0) face.rotation.y = Math.PI;
      g.add(face);
    }
  } else
    for (const side of [-1, 1])
      for (const [dx, tilt] of [
        [-0.16, 0.5],
        [0, 0],
        [0.16, -0.5],
      ] as const) {
        const leaf = put(g, kit.sphere(1, "cream"), dx, y + (dx ? -0.02 : 0.04), side * 0.055);
        leaf.scale.set(0.06, 0.15, 0.02);
        leaf.rotation.z = tilt;
      }
  return g;
}
