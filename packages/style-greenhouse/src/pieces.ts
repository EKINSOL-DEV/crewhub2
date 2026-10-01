/* Greenhouse pieces that stretch or need code: the town ground, walls, floors, emblems, the civic buildings and the
   ticket decorations that renderers scale per instance. Moved from TownScene. Origins: a piece's footprint centre on
   the floor; walls run along x. */
import * as THREE from "three";
import type { EmblemName, ModelOptions } from "@crewhub/world-style";
import { put, type Kit, type Swatch } from "./kit.ts";
import { lamp, plant } from "./furniture.ts";
import { floorShader, glassMaterial, type FloorPattern } from "./shaders.ts";

type Size = { width: number; height: number; depth: number };
const size = (o: ModelOptions, fallback: Size): Size => o.size ?? fallback;
const accent = (o: ModelOptions): Swatch => o.accent ?? "no-project";

export function path(kit: Kit, o: ModelOptions): THREE.Object3D {
  const { width, depth } = size(o, { width: 1, height: 0.04, depth: 1 });
  const mesh = kit.box(width, 0.04, depth, "step", 0.015);
  mesh.position.y = 0.02;
  return mesh;
}

export function streetLamp(kit: Kit): THREE.Group {
  const g = lamp(kit);
  g.scale.setScalar(0.8);
  const outer = new THREE.Group();
  outer.add(g);
  return outer;
}

export function planting(kit: Kit, o: ModelOptions): THREE.Group {
  return plant(kit, o.seed ?? 0);
}

const FLOOR_PATTERNS: Record<string, FloorPattern> = { wood: "wood", tile: "tile", concrete: "concrete" };

/**
 * A room floor: the Greenhouse floor shader, UVs in 0.6 m cells. Variants: "wood" (warm planks), "tile" (light tiles),
 * "concrete" (grey-cream), "dim" (an empty or archived room's floor); none is the studio's cream cells.
 */
export function floor(kit: Kit, o: ModelOptions): THREE.Mesh {
  const { width, depth } = size(o, { width: 3, height: 0, depth: 3 });
  const geo = kit.geometry(`floor:${width},${depth}`, () => {
    const plane = new THREE.PlaneGeometry(width, depth);
    const uv = plane.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * width) / 0.6, (uv.getY(i) * depth) / 0.6);
    return plane.rotateX(-Math.PI / 2);
  });
  const pattern = (o.variant && FLOOR_PATTERNS[o.variant]) || "cells";
  const swatch = o.variant === "dim" ? "floor-dim" : pattern === "cells" ? "floor" : `floor-${pattern}`;
  const material = kit.material(swatch);
  if (!material.userData.floor) {
    floorShader(material, pattern);
    material.userData.floor = true;
  }
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** A small plaque on the floor where the room's label stands. */
export function roomSign(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.box(0.46, 0.035, 0.2, "timber-trim", 0.012), 0, 0.02, 0);
  put(g, kit.box(0.4, 0.01, 0.14, "cream", 0.004), 0, 0.042, 0);
  return g;
}

/** The loops `icon` as a small sculpture on a plinth. */
export function emblem(kit: Kit, icon: EmblemName, o: ModelOptions): THREE.Group {
  const color = accent(o);
  const g = new THREE.Group();
  put(g, kit.box(0.62, 0.3, 0.62, "emblem-plinth", 0.05), 0, 0.15, 0);
  const material = kit.material(color);
  const shape = (key: string, create: () => THREE.BufferGeometry, x: number, y: number, z: number) =>
    put(g, kit.mesh(kit.geometry(key, create), material), x, y, z);
  const top = 0.3;
  switch (icon) {
    case "home":
      put(g, kit.box(0.36, 0.26, 0.36, color, 0.03), 0, top + 0.13, 0);
      shape("emblem:roof", () => new THREE.ConeGeometry(0.34, 0.24, 4, 1).rotateY(Math.PI / 4), 0, top + 0.38, 0);
      break;
    case "inbox":
      put(g, kit.box(0.46, 0.06, 0.36, color, 0.02), 0, top + 0.03, 0);
      for (const [x, z, w, d] of [
        [0, -0.17, 0.46, 0.04],
        [0, 0.17, 0.46, 0.04],
        [-0.21, 0, 0.04, 0.36],
        [0.21, 0, 0.04, 0.36],
      ] as const)
        put(g, kit.box(w, 0.12, d, color, 0.01), x, top + 0.09, z);
      break;
    case "bot":
      put(g, kit.box(0.42, 0.32, 0.32, color, 0.08), 0, top + 0.18, 0);
      put(g, kit.box(0.32, 0.13, 0.03, "visor", 0.04), 0, top + 0.19, 0.165);
      for (const x of [-0.07, 0.07]) put(g, kit.box(0.04, 0.06, 0.02, "eye", 0.015), x, top + 0.19, 0.185);
      put(g, kit.sphere(0.045, color), 0, top + 0.43, 0);
      break;
    case "spark":
      shape("emblem:spark", () => new THREE.OctahedronGeometry(0.2), 0, top + 0.28, 0).scale.set(0.8, 1.5, 0.8);
      break;
    case "users":
      for (const [x, s] of [
        [-0.1, 1],
        [0.12, 0.85],
      ] as const) {
        put(g, kit.cylinder(0.08 * s, 0.12 * s, 0.22 * s, color), x, top + 0.11 * s, 0);
        put(g, kit.sphere(0.075 * s, color), x, top + 0.3 * s, 0);
      }
      break;
    case "star":
      shape("emblem:star", () => starGeometry(0.26, 0.11, 0.08), 0, top + 0.26, 0).rotation.y = Math.PI / 5;
      break;
    case "folder":
      put(g, kit.box(0.46, 0.34, 0.07, color, 0.02), 0, top + 0.17, 0);
      put(g, kit.box(0.18, 0.06, 0.07, color, 0.02), -0.14, top + 0.36, 0);
      break;
  }
  return g;
}

/** A stretchable band around a ticket: straps (blocked), tape (held), the milestone band. */
export function band(kit: Kit, o: ModelOptions, color: Swatch): THREE.Group {
  const { width, height, depth } = size(o, { width: 0.3, height: 0.2, depth: 0.25 });
  const g = new THREE.Group();
  put(g, kit.box(width, height, depth, color, 0.004), 0, height / 2, 0);
  return g;
}

/** Two dark straps crossing a ticket: blocked. */
export function straps(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height, depth } = size(o, { width: 0.3, height: 0.2, depth: 0.25 });
  const g = new THREE.Group();
  for (const x of [-width * 0.25, width * 0.25]) put(g, kit.box(0.03, height + 0.01, depth + 0.012, "strap", 0.004), x, height / 2, 0);
  put(g, kit.box(width + 0.012, height * 0.25, depth + 0.012, "strap", 0.004), 0, height / 2, 0);
  return g;
}

export function sticker(kit: Kit, o: ModelOptions): THREE.Object3D {
  if (o.variant === "star") {
    const star = kit.mesh(kit.geometry("sticker:star", () => starGeometry(0.045, 0.02, 0.01).rotateX(-Math.PI / 2)), kit.material("brass", { glow: 0.25 }));
    star.position.y = 0.006;
    return star;
  }
  const mesh = kit.box(0.05, 0.01, 0.05, accent(o), 0.004);
  mesh.position.y = 0.005;
  return mesh;
}

export function speech(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.sphere(0.07, "speech"), 0, 0.09, 0).scale.set(1.3, 0.85, 0.6);
  const tail = put(g, kit.mesh(kit.geometry("speech:tail", () => new THREE.ConeGeometry(0.025, 0.06, 8)), kit.material("speech")), -0.04, 0.03, 0);
  tail.rotation.z = Math.PI + 0.4;
  return g;
}

export function sparkle(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  const material = kit.material("sparkle", { glow: 0.9 });
  const geo = kit.geometry("sparkle", () => new THREE.OctahedronGeometry(0.05));
  for (const [x, y, s] of [
    [0, 0.12, 1],
    [0.1, 0.05, 0.6],
    [-0.09, 0.07, 0.7],
  ] as const) {
    const m = put(g, new THREE.Mesh(geo, material), x, y, 0);
    m.scale.set(0.4 * s, 1.2 * s, 0.4 * s);
  }
  return g;
}

/** A thin frame around a room floor: the keyboard focus. */
export function focusRing(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 3, height: 0, depth: 3 });
  const g = new THREE.Group();
  const t = 0.07;
  const material = kit.material("focus-ring", { glow: 0.6 });
  for (const [x, z, w, d] of [
    [0, -depth / 2, width, t],
    [0, depth / 2, width, t],
    [-width / 2, 0, t, depth],
    [width / 2, 0, t, depth],
  ] as const) {
    const m = new THREE.Mesh(kit.geometry(`ring:${w},${d}`, () => new THREE.BoxGeometry(w, 0.02, d)), material);
    put(g, m, x, 0.02, z);
  }
  return g;
}

function starGeometry(outer: number, inner: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer,
      angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(angle) * r,
      y = Math.sin(angle) * r;
    if (i) shape.lineTo(x, y);
    else shape.moveTo(x, y);
  }
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}

export function glass(kit: Kit): THREE.ShaderMaterial {
  return glassMaterial(kit.hex("window"), 0.32);
}

/** A soft blob contact shadow under a slab of `size` (a building on its lawn): the old diorama's grounding. */
export function contactShadow(kit: Kit, o: ModelOptions): THREE.Mesh {
  const { width, depth } = size(o, { width: 4, height: 0, depth: 4 });
  return kit.decal("shadow", width / 2, depth / 2, Math.min(width, depth) * 0.08 + 0.4);
}
