/* Greenhouse town pieces that stretch or need code: the ground, lawns, paving, hedges, flower beds, the pond, the
   bridge, fences and the lanterns with their pools of light. The trees, benches, signposts and other small street
   furniture are parts-JSON (../models/town.*.json). Origins: a piece's footprint centre on the ground it stands on;
   stretchable pieces run along x. Every repeated part uses the kit's shared geometry, so a renderer can instance it. */
import * as THREE from "three";
import type { ModelOptions, StyleTheme } from "@crewhub/world-style";
import { put, type Kit, type Swatch } from "./kit.ts";
import { grassShader, pavingShader, waterShader } from "./shaders.ts";

type Size = { width: number; height: number; depth: number };
const size = (o: ModelOptions, fallback: Size): Size => o.size ?? fallback;

/** A shared kit material with a shader applied once. */
function shaded(kit: Kit, name: Swatch, apply: (m: THREE.MeshStandardMaterial) => void): THREE.MeshStandardMaterial {
  const material = kit.material(name);
  if (!material.userData.town) {
    apply(material);
    material.userData.town = true;
  }
  return material;
}

/** A plain (square-edged) box from the kit's geometry cache: flat pieces need no bevel. */
function slab(kit: Kit, w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  const geometry = kit.geometry(`slab:${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`, () => new THREE.BoxGeometry(w, h, d));
  const mesh = kit.mesh(geometry, material);
  mesh.castShadow = false;
  return mesh;
}

/** The town ground: a thick diorama slab with grass on top, its top at y = 0.02. */
export function ground(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 20, height: 0.5, depth: 20 });
  const g = new THREE.Group();
  put(g, kit.box(width + 0.8, 1.1, depth + 0.8, "town-base", 0.3), 0, -0.62, 0);
  put(g, kit.box(width + 0.5, 0.22, depth + 0.5, "grass-edge", 0.08), 0, -0.1, 0);
  put(g, slab(kit, width, 0.06, depth, shaded(kit, "grass", (m) => grassShader(m, 0.16))), 0, -0.01, 0);
  return g;
}

/** A plot's lawn, raised a step above the street grass and a shade lighter; "meadow" for an empty plot. */
export function plot(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 6, height: 0.16, depth: 6 });
  const meadow = o.variant === "meadow";
  const g = new THREE.Group();
  put(g, kit.box(width, 0.15, depth, "grass-edge", 0.05), 0, 0.075, 0);
  const top = meadow ? shaded(kit, "grass-meadow", (m) => grassShader(m, 0.24)) : shaded(kit, "grass-lawn", (m) => grassShader(m, 0.1));
  put(g, slab(kit, width - 0.12, 0.03, depth - 0.12, top), 0, 0.155, 0);
  return g;
}

/** Paving laid over the ground: "cobble" for the lanes, "flag" (the default) for paths and forecourts. */
export function paving(kit: Kit, o: ModelOptions): THREE.Mesh {
  const { width, height, depth } = size(o, { width: 1, height: 0.04, depth: 1 });
  const cobble = o.variant === "cobble";
  const material = cobble
    ? shaded(kit, "cobble", (m) => pavingShader(m, [0.42, 0.3], 0.05))
    : shaded(kit, "flagstone", (m) => pavingShader(m, [0.95, 0.7], 0.03));
  const mesh = slab(kit, width, height, depth, material);
  mesh.position.y = height / 2;
  return mesh;
}

/** A clipped hedge: a soft block with a row of rounder tufts on top. */
export function hedge(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height, depth } = size(o, { width: 3, height: 0.6, depth: 0.7 });
  const g = new THREE.Group();
  put(g, kit.box(width, height, depth, "hedge", 0.16), 0, height / 2, 0);
  const tufts = Math.max(2, Math.round(width / 0.55));
  const seed = o.seed ?? 0;
  for (let i = 0; i < tufts; i++) {
    const t = put(g, kit.sphere(1, i % 3 === 1 ? "hedge" : "hedge-light"), -width / 2 + ((i + 0.5) * width) / tufts, height - 0.02, ((i * 7 + seed) % 3) * 0.06 - 0.06);
    const r = 0.27 + ((i * 13 + seed) % 5) * 0.012;
    t.scale.set(r * 1.1, r * 0.8, depth * 0.48);
  }
  return g;
}

const FLOWERS: Swatch[] = ["coral", "lamp-glow", "flower-lilac", "cream", "tangerine", "flower-pink", "flower-blue"];

/** A raised flower bed: a timber edge, dark soil, leaves and flowers in a few colours. */
export function flowerBed(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height, depth } = size(o, { width: 2, height: 0.2, depth: 0.8 });
  const g = new THREE.Group();
  put(g, kit.box(width, height, depth, "timber", 0.04), 0, height / 2, 0);
  put(g, slab(kit, width - 0.12, 0.02, depth - 0.12, kit.material("soil")), 0, height + 0.005, 0);
  const seed = o.seed ?? 0;
  const across = Math.max(1, Math.round(depth / 0.32)),
    along = Math.max(2, Math.round(width / 0.3));
  for (let i = 0; i < along; i++)
    for (let j = 0; j < across; j++) {
      const n = i * 7 + j * 3 + seed;
      const x = -width / 2 + ((i + 0.5) * width) / along + ((n % 3) - 1) * 0.04,
        z = -depth / 2 + ((j + 0.5) * depth) / across + (((n >> 1) % 3) - 1) * 0.04;
      const leaf = put(g, kit.sphere(1, n % 2 ? "leaf" : "leaf-dark"), x, height + 0.08, z);
      leaf.scale.set(0.13, 0.11, 0.13);
      const flower = put(g, kit.sphere(1, FLOWERS[(Math.abs(seed) + i + j * 2) % FLOWERS.length]!), x + 0.03, height + 0.2 + (n % 3) * 0.03, z - 0.02);
      flower.scale.setScalar(0.065);
    }
  return g;
}

/** The pond: still water in a stone rim, an ellipse of the given size, with a few stones on the bank. */
export function pond(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 6, height: 0.1, depth: 4 });
  const g = new THREE.Group();
  const disc = kit.geometry("town:disc", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 40));
  const rim = put(g, kit.mesh(disc, kit.material("water-edge")), 0, 0.05, 0);
  rim.scale.set(width + 0.5, 0.1, depth + 0.5);
  const water = put(g, kit.mesh(disc, shaded(kit, "water", waterShader)), 0, 0.075, 0);
  water.scale.set(width, 0.08, depth);
  water.castShadow = false;
  for (let i = 0; i < 9; i++) {
    const a = i * 0.71 + 0.3;
    const stone = put(g, kit.sphere(1, i % 3 ? "water-edge" : "clay"), (Math.cos(a) * (width + 0.5)) / 2, 0.1, (Math.sin(a) * (depth + 0.5)) / 2);
    stone.scale.set(0.2 + (i % 3) * 0.06, 0.1, 0.16);
  }
  return g;
}

/** A little arched timber footbridge along z: deck boards on an arch, posts and rails either side. */
export function bridge(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height, depth } = size(o, { width: 1.6, height: 0.5, depth: 6 });
  const g = new THREE.Group();
  const boards = Math.max(6, Math.round(depth / 0.32));
  const arch = (t: number) => 0.1 + Math.sin(t * Math.PI) * height;
  for (let i = 0; i < boards; i++) {
    const t = (i + 0.5) / boards;
    const z = -depth / 2 + t * depth;
    const slope = Math.atan((Math.cos(t * Math.PI) * Math.PI * height) / depth);
    const board = put(g, kit.box(width, 0.07, (depth / boards) * 1.04, i % 2 ? "timber-light" : "timber", 0.015), 0, arch(t), z);
    board.rotation.x = -slope;
  }
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.05);
    const posts = 5;
    let previous: THREE.Vector3 | null = null;
    for (let i = 0; i < posts; i++) {
      const t = 0.04 + (i / (posts - 1)) * 0.92;
      const z = -depth / 2 + t * depth,
        y = arch(t);
      put(g, kit.box(0.08, 0.5, 0.08, "timber", 0.02), x, y + 0.25, z);
      const top = new THREE.Vector3(x, y + 0.48, z);
      if (previous) {
        const mid = previous.clone().add(top).multiplyScalar(0.5);
        const length = previous.distanceTo(top);
        const rail = put(g, kit.box(0.07, 0.06, length + 0.06, "timber-light", 0.02), mid.x, mid.y, mid.z);
        rail.rotation.x = -Math.atan2(top.y - previous.y, top.z - previous.z);
      }
      previous = top;
    }
  }
  return g;
}

/** A low picket fence along x: posts with two rails. */
export function fence(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height } = size(o, { width: 3, height: 0.5, depth: 0.1 });
  const g = new THREE.Group();
  const posts = Math.max(2, Math.round(width / 0.32) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -width / 2 + (i * width) / (posts - 1);
    const tall = i % 4 === 0;
    put(g, kit.box(0.06, tall ? height + 0.08 : height, 0.05, "cream", 0.015), x, (tall ? height + 0.08 : height) / 2, 0);
  }
  for (const y of [height * 0.35, height * 0.8]) put(g, kit.box(width, 0.05, 0.035, "cream", 0.012), 0, y, -0.035);
  return g;
}

/**
 * A street lantern: an iron post, a glass head that glows (softly by day, warmly in lamplight) and, under it, a pool
 * of warm light on the ground (shown in lamplight only).
 */
export function lantern(kit: Kit, pool: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.cylinder(0.14, 0.18, 0.2, "lantern-iron"), 0, 0.1, 0);
  put(g, kit.cylinder(0.05, 0.065, 1.9, "lantern-iron"), 0, 1.1, 0);
  put(g, kit.cylinder(0.1, 0.1, 0.06, "lantern-iron"), 0, 2.07, 0);
  const glass = put(g, kit.box(0.3, 0.4, 0.3, "lantern-glass", 0.04), 0, 2.3, 0);
  glass.material = lanternGlass(kit);
  glass.castShadow = false;
  put(g, kit.cylinder(0.025, 0.25, 0.18, "lantern-iron"), 0, 2.59, 0);
  put(g, kit.sphere(0.05, "brass"), 0, 2.7, 0);
  const light = put(g, new THREE.Mesh(kit.geometry("town:pool", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), pool), 0, 0.07, 0);
  light.scale.set(6, 1, 6);
  light.renderOrder = 2;
  return g;
}

function lanternGlass(kit: Kit): THREE.MeshStandardMaterial {
  return kit.material("lantern-glass", { glow: "lantern-light" });
}

/** The pool of light under a lantern: an additive radial decal, cheap enough for every lantern in town. */
export function poolMaterial(kit: Kit): THREE.MeshBasicMaterial {
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.min(1, Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2));
      const v = Math.round(255 * Math.pow(1 - d, 2.2));
      data.set([v, v, v, 255], (y * N + x) * 4);
    }
  const texture = new THREE.DataTexture(data, N, N);
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({
    color: kit.hex("lantern-pool"),
    alphaMap: texture,
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  material.userData.dispose = () => texture.dispose();
  return material;
}

/** The town's look per theme: lanterns glow brighter and their pools show in lamplight. */
export function townTheme(kit: Kit, pool: THREE.MeshBasicMaterial, theme: StyleTheme) {
  const lamplight = theme === "lamplight";
  lanternGlass(kit).emissiveIntensity = lamplight ? 2.4 : 0.5;
  pool.color.set(kit.hex("lantern-pool"));
  pool.visible = lamplight;
}
