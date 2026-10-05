/* Greenhouse town pieces that stretch or need code: the ground, lawns, paving, hedges, flower beds, the pond, the
   bridge, fences and the lanterns. The trees, benches, signposts and other small street
   furniture are parts-JSON (../models/town.*.json). Origins: a piece's footprint centre on the ground it stands on;
   stretchable pieces run along x. Every repeated part uses the kit's shared geometry, so a renderer can instance it. */
import * as THREE from "three";
import type { ModelOptions } from "@crewhub/world-style";
import { put, type Kit, type Swatch } from "./kit.ts";
import { decalMaterial, GRASS_GOLDEN, GRASS_NIGHT, WATER_GLINT, grassShader, pavingShader, waterShader } from "./shaders.ts";

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

/**
 * The town ground as a floating diorama: grass on a soft turf lip, a band of topsoil, a paler layer line, deep earth
 * with a bevelled underside, a few rocks set into the sides and a soft contact shadow below. The grass top is at
 * y = 0.02; everything else hangs under it.
 */
export function ground(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 20, height: 0.5, depth: 20 });
  const g = new THREE.Group();
  put(g, slab(kit, width, 0.06, depth, shaded(kit, "grass", (m) => grassShader(m, 0.16))), 0, -0.01, 0);
  put(g, kit.box(width + 0.5, 0.3, depth + 0.5, "grass-edge", 0.14), 0, -0.135, 0);
  put(g, kit.box(width + 0.36, 0.72, depth + 0.36, "soil-top", 0.24), 0, -0.6, 0);
  put(g, kit.box(width + 0.44, 0.09, depth + 0.44, "soil-line", 0.04), 0, -0.97, 0);
  put(g, kit.box(width + 0.24, 1.3, depth + 0.24, "earth", 0.34), 0, -1.65, 0);
  put(g, kit.box(width - 0.6, 0.5, depth - 0.6, "earth-deep", 0.24), 0, -2.42, 0);
  // Rocks bedded in the sides, a few per side, in the topsoil and the deep earth.
  const sides: [number, number, number, number][] = [
    [0, -(depth + 0.3) / 2, width, 0],
    [0, (depth + 0.3) / 2, width, 0],
    [-(width + 0.3) / 2, 0, depth, Math.PI / 2],
    [(width + 0.3) / 2, 0, depth, Math.PI / 2],
  ];
  sides.forEach(([cx, cz, length, turn], side) => {
    const count = Math.round(length / 9);
    for (let i = 0; i < count; i++) {
      const n = (i * 7 + side * 13) % 11;
      const t = -length / 2 + ((i + 0.5) * length) / count + (n - 5) * 0.35;
      const rock = put(g, kit.sphere(1, n % 3 ? "rock" : "soil-line"), cx + (turn ? 0 : t), -0.55 - (n % 4) * 0.35, cz + (turn ? t : 0));
      rock.scale.set(0.32 + (n % 3) * 0.12, 0.2 + (n % 2) * 0.08, 0.26 + (n % 4) * 0.05);
      rock.rotation.y = turn + n;
      rock.castShadow = false;
    }
  });
  // The diorama's own soft shadow on whatever lies below it.
  const shadow = put(g, kit.decal("shadow", width / 2 - 1, depth / 2 - 1, 7), 0, -2.75, 0);
  shadow.renderOrder = 0;
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

/**
 * A crossing where two lanes meet: the cobbles carry on, framed by a border of darker setts, with a small rosette of
 * them in the middle. Stands on the ground like the lanes, a hair higher.
 */
export function crossing(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height, depth } = size(o, { width: 3.2, height: 0.045, depth: 3.2 });
  const g = new THREE.Group();
  const cobble = shaded(kit, "cobble", (m) => pavingShader(m, [0.42, 0.3], 0.05));
  const dark = shaded(kit, "cobble-dark", (m) => pavingShader(m, [0.26, 0.26], 0.06));
  const BORDER = 0.3;
  put(g, slab(kit, width - 2 * BORDER, height, depth - 2 * BORDER, cobble), 0, height / 2, 0);
  for (const side of [-1, 1]) {
    put(g, slab(kit, width, height + 0.004, BORDER, dark), 0, (height + 0.004) / 2, (side * (depth - BORDER)) / 2);
    put(g, slab(kit, BORDER, height + 0.004, depth - 2 * BORDER, dark), (side * (width - BORDER)) / 2, (height + 0.004) / 2, 0);
  }
  const rosette = put(g, kit.mesh(kit.geometry("town:disc", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 40)), dark), 0, height / 2 + 0.003, 0);
  rosette.scale.set(1.1, height, 1.1);
  rosette.castShadow = false;
  return g;
}

const wearMaterials = new WeakMap<Kit, THREE.ShaderMaterial>();
function wearMaterial(kit: Kit): THREE.ShaderMaterial {
  let material = wearMaterials.get(kit);
  if (!material) {
    material = decalMaterial(kit.hex("path-wear"), 0.55, false);
    wearMaterials.set(kit, material);
  }
  return material;
}

/** A soft patch of worn ground (grass trodden bare), `width` by `depth`, lying flat. One shared geometry, scaled. */
export function wear(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 1, height: 0, depth: 1 });
  const geometry = kit.geometry("town:wear", () => {
    const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const shape = new Float32Array(plane.attributes.position!.count * 3);
    for (let i = 0; i < shape.length; i += 3) shape.set([0.45, 0.45, 0.55], i);
    plane.setAttribute("aShape", new THREE.BufferAttribute(shape, 3));
    return plane;
  });
  // In a group: renderers set the scale of what a model returns, which would undo the patch's own size.
  const g = new THREE.Group();
  const mesh = put(g, new THREE.Mesh(geometry, wearMaterial(kit)), 0, 0, 0);
  mesh.scale.set(width / 2, 1, depth / 2);
  mesh.renderOrder = 1;
  return g;
}

const fieldMaterials = new WeakMap<Kit, THREE.ShaderMaterial>();
function fieldMaterial(kit: Kit): THREE.ShaderMaterial {
  let material = fieldMaterials.get(kit);
  if (!material) {
    material = decalMaterial(kit.hex("grass-meadow"), 0.85, false);
    fieldMaterials.set(kit, material);
  }
  return material;
}

/**
 * A field in the open country, `width` by `depth`, lying flat on the grass: a soft-edged patch in the meadow's colour
 * (a hayfield, a meadow left to flower). One shared geometry, scaled, so every field in a region instances.
 */
export function field(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 20, height: 0, depth: 20 });
  const geometry = kit.geometry("town:field", () => {
    const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const shape = new Float32Array(plane.attributes.position!.count * 3);
    for (let i = 0; i < shape.length; i += 3) shape.set([0.86, 0.86, 0.14], i);
    plane.setAttribute("aShape", new THREE.BufferAttribute(shape, 3));
    return plane;
  });
  // In a group: renderers set the scale of what a model returns.
  const g = new THREE.Group();
  const mesh = put(g, new THREE.Mesh(geometry, fieldMaterial(kit)), 0, 0.003, 0);
  mesh.scale.set(width / 2, 1, depth / 2);
  mesh.renderOrder = 1;
  return g;
}

const puddleMaterials = new WeakMap<Kit, THREE.ShaderMaterial>();
function puddleMaterial(kit: Kit): THREE.ShaderMaterial {
  let material = puddleMaterials.get(kit);
  if (!material) {
    material = decalMaterial(kit.hex("water"), 0.42, false);
    puddleMaterials.set(kit, material);
  }
  return material;
}

/**
 * A rain puddle on the paving, `width` by `depth`: a soft film of sky-coloured water, and in it the lantern's warm
 * reflection (a light-pool decal, so it shows only in the evening, like the pools under the lanterns). The reflection
 * lies towards -x, where the renderer puts the lantern. One shared geometry each, scaled, so every puddle instances.
 */
export function puddle(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 1.2, height: 0, depth: 0.7 });
  const g = new THREE.Group();
  // A small core and a wide soft edge: an irregular-looking round film, not a tile.
  const geometry = kit.geometry("town:puddle", () => {
    const plane = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const shape = new Float32Array(plane.attributes.position!.count * 3);
    for (let i = 0; i < shape.length; i += 3) shape.set([0.3, 0.12, 0.7], i);
    plane.setAttribute("aShape", new THREE.BufferAttribute(shape, 3));
    return plane;
  });
  const film = put(g, new THREE.Mesh(geometry, puddleMaterial(kit)), 0, 0.006, 0);
  film.scale.set(width / 2, 1, depth / 2);
  film.renderOrder = 1;
  film.castShadow = false;
  const glint = put(g, kit.decal("pool", 0.05, 0.05, 0.3), -width * 0.15, 0.008, 0);
  glint.scale.set(width * 1.1, 1, depth * 0.9);
  return g;
}

/** A clipped hedge: a soft block with a row of rounder tufts on top. */
export function hedge(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height, depth } = size(o, { width: 3, height: 0.6, depth: 0.7 });
  const g = new THREE.Group();
  put(g, kit.box(width, height, depth, "hedge", 0.16), 0, height / 2, 0);
  const tufts = Math.max(2, Math.round(width / 0.55));
  const dome = kit.geometry("town:dome", () => new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2 + 0.2));
  const seed = o.seed ?? 0;
  for (let i = 0; i < tufts; i++) {
    // Domes, not spheres: a tuft's lower half is inside the hedge's box.
    const t = put(g, kit.mesh(dome, kit.material(i % 3 === 1 ? "hedge" : "hedge-light")), -width / 2 + ((i + 0.5) * width) / tufts, height - 0.02, ((i * 7 + seed) % 3) * 0.06 - 0.06);
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

/** A flat outline on the ground, `w` along x by `d` along z: a stadium (round ends) or, cut, a plain rectangle. */
function outline(w: number, d: number, cut: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const r = cut ? 0 : d / 2,
    x = w / 2 - r;
  shape.moveTo(-x, -d / 2);
  shape.lineTo(x, -d / 2);
  if (r) shape.absarc(x, 0, r, -Math.PI / 2, Math.PI / 2, false);
  else shape.lineTo(x, d / 2);
  shape.lineTo(-x, d / 2);
  if (r) shape.absarc(-x, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return new THREE.ShapeGeometry(shape, 6).rotateX(-Math.PI / 2);
}

/**
 * A stretch of stream, `width` along x by `depth` across: still water on a pale stony bank. Stretches overlap at their
 * round ends into a meander (the water is shaded in world space, so the seams do not show); `variant: "cut"` has
 * square ends for where the stream meets the diorama's edge, and `variant: "fall"` is the little waterfall that spills
 * over that edge, hanging down the side of the ground.
 */
export function stream(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 6, height: 0, depth: 1.6 });
  const g = new THREE.Group();
  const water = shaded(kit, "water", waterShader);
  if (o.variant === "fall") {
    const sheet = put(g, kit.mesh(kit.geometry(`town:fall:${depth.toFixed(2)}`, () => new THREE.PlaneGeometry(depth, 1.05).rotateY(Math.PI / 2)), water), 0, -0.47, 0);
    sheet.castShadow = false;
    const foam = put(g, kit.sphere(1, "cream"), 0.05, -0.98, 0);
    foam.scale.set(0.12, 0.08, depth * 0.45);
    foam.castShadow = false;
    return g;
  }
  const cut = o.variant === "cut";
  const key = `${width.toFixed(2)},${depth.toFixed(2)},${cut}`;
  const bank = put(g, kit.mesh(kit.geometry(`town:bank:${key}`, () => outline(width + (cut ? 0 : 0.5), depth + 0.5, cut)), kit.material("water-edge")), 0, 0.03, 0);
  bank.receiveShadow = true;
  bank.castShadow = false;
  const surface = put(g, kit.mesh(kit.geometry(`town:stream:${key}`, () => outline(width, depth, cut)), water), 0, 0.05, 0);
  surface.receiveShadow = true;
  surface.castShadow = false;
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
 * A street lantern: an iron post and a glass head that glows (softly by day, warmly in lamplight). Its pool of light
 * on the ground is the style's lamp-pool decal (LIGHT_POOLS).
 */
export function lantern(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.cylinder(0.14, 0.18, 0.2, "lantern-iron"), 0, 0.1, 0);
  put(g, kit.cylinder(0.05, 0.065, 1.9, "lantern-iron"), 0, 1.1, 0);
  put(g, kit.cylinder(0.1, 0.1, 0.06, "lantern-iron"), 0, 2.07, 0);
  const glass = put(g, kit.box(0.3, 0.4, 0.3, "lantern-glass", 0.04), 0, 2.3, 0);
  glass.material = lanternGlass(kit);
  glass.castShadow = false;
  put(g, kit.cylinder(0.025, 0.25, 0.18, "lantern-iron"), 0, 2.59, 0);
  put(g, kit.sphere(0.05, "brass"), 0, 2.7, 0);
  return g;
}

function lanternGlass(kit: Kit): THREE.MeshStandardMaterial {
  return kit.material("lantern-glass", { glow: "lantern-light" });
}

/**
 * String lights along x: two slim iron poles and a sagging wire of small warm bulbs, unlit by day and glowing in
 * lamplight. One wire geometry and one bulb geometry, so a renderer instances every string in town together.
 */
/**
 * Bunting along x: two slim timber poles and a sagging line of little triangular flags in turn coral, cream, tangerine
 * and sage, catching a little sideways twist each. One flag geometry per colour, so every string in town instances.
 */
export function bunting(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height } = size(o, { width: 8, height: 3.4, depth: 0.1 });
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    put(g, kit.cylinder(0.04, 0.05, height, "timber"), (side * width) / 2, height / 2, 0);
    put(g, kit.sphere(0.06, "brass"), (side * width) / 2, height + 0.04, 0);
  }
  const sag = 0.3 + width * 0.03;
  const at = (t: number) => new THREE.Vector3(-width / 2 + t * width, height - 0.1 - sag * 4 * t * (1 - t), 0);
  const wire = kit.geometry("town:wire", () => new THREE.BoxGeometry(1, 0.016, 0.016));
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const p = at(i / steps),
      q = at((i + 1) / steps);
    const piece = put(g, kit.mesh(wire, kit.material("cream")), (p.x + q.x) / 2, (p.y + q.y) / 2, 0);
    piece.scale.x = p.distanceTo(q) + 0.01;
    piece.rotation.z = Math.atan2(q.y - p.y, q.x - p.x);
    piece.castShadow = false;
  }
  // A flat downward triangle, 0.3 wide and 0.34 long, both faces drawn.
  const flag = kit.geometry("town:flag", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.15, 0, 0, 0.15, 0, 0, 0, -0.34, 0, 0.15, 0, 0, -0.15, 0, 0, 0, -0.34, 0], 3));
    geometry.computeVertexNormals();
    return geometry;
  });
  const colours: Swatch[] = ["coral", "cream", "tangerine", "sage"];
  const flags = Math.max(4, Math.round(width / 0.42));
  const seed = o.seed ?? 0;
  for (let i = 1; i < flags; i++) {
    const p = at(i / flags);
    const mesh = put(g, kit.mesh(flag, kit.material(colours[(i + seed) % colours.length]!)), p.x, p.y, 0);
    mesh.rotation.y = (((i * 7 + seed) % 5) - 2) * 0.12;
    mesh.castShadow = false;
  }
  return g;
}

export function stringLights(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height } = size(o, { width: 8, height: 2.7, depth: 0.1 });
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    put(g, kit.cylinder(0.035, 0.045, height, "lantern-iron"), (side * width) / 2, height / 2, 0);
    put(g, kit.sphere(0.06, "brass"), (side * width) / 2, height + 0.04, 0);
  }
  const sag = 0.35 + width * 0.02;
  const at = (t: number) => new THREE.Vector3(-width / 2 + t * width, height - 0.08 - sag * 4 * t * (1 - t), 0);
  const wire = kit.geometry("town:wire", () => new THREE.BoxGeometry(1, 0.016, 0.016));
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const p = at(i / steps),
      q = at((i + 1) / steps);
    const piece = put(g, kit.mesh(wire, kit.material("lantern-iron")), (p.x + q.x) / 2, (p.y + q.y) / 2, 0);
    piece.scale.x = p.distanceTo(q) + 0.01;
    piece.rotation.z = Math.atan2(q.y - p.y, q.x - p.x);
    piece.castShadow = false;
  }
  const bulbs = Math.max(4, Math.round(width / 0.55));
  for (let i = 1; i < bulbs; i++) {
    const p = at(i / bulbs);
    const bulb = put(g, kit.mesh(kit.geometry("town:bulb", () => new THREE.SphereGeometry(1, 8, 6)), bulbMaterial(kit)), p.x, p.y - 0.07, 0);
    bulb.scale.set(0.055, 0.07, 0.055);
    bulb.castShadow = false;
  }
  return g;
}

function bulbMaterial(kit: Kit): THREE.MeshStandardMaterial {
  return kit.material("lamp-glow", { glow: "lantern-light" });
}

/** The town's colours per theme: the worn paths. */
export function townTheme(kit: Kit) {
  wearMaterial(kit).uniforms.uColor!.value.set(kit.hex("path-wear"));
  puddleMaterial(kit).uniforms.uColor!.value.set(kit.hex("water"));
  fieldMaterial(kit).uniforms.uColor!.value.set(kit.hex("grass-meadow"));
}

/**
 * The town's lamps follow the evening (0 by day, 1 in lamplight or late in the drift): lantern heads and string-light
 * bulbs glow softly by day and warmly in the evening, and the landmarks' windows (art-civic's lit window and greenhouse
 * glass materials) shine brighter.
 */
export function townLight(kit: Kit, evening: number) {
  const e = THREE.MathUtils.clamp(evening, 0, 1);
  const lerp = (day: number, night: number) => day + (night - day) * e;
  // The lawns' warm evening patches belong to the dark lawns of lamplight; on the daylight lawns they would turn olive.
  GRASS_NIGHT.value = kit.theme === "lamplight" ? e : e * 0.25;
  WATER_GLINT.uGlint.value = THREE.MathUtils.smoothstep(e, 0.3, 0.9);
  WATER_GLINT.uGlintColor.value.set(kit.hex("lantern-light"));
  // The light theme's low sun (dawn and dusk, still there in its gentle evening) gets the golden lawns.
  GRASS_GOLDEN.value = kit.theme === "lamplight" ? 0 : THREE.MathUtils.smoothstep(e, 0.05, 0.35);
  lanternGlass(kit).emissiveIntensity = lerp(0.5, 1.25);
  bulbMaterial(kit).emissiveIntensity = lerp(0.35, 2.2);
  kit.material("window", { glow: 0.45 }).emissiveIntensity = lerp(0.45, 1.15);
  kit.material("window", { glow: 0.3, transparent: 0.42 }).emissiveIntensity = lerp(0.3, 1.5);
}

export function disposeTown(kit: Kit) {
  wearMaterials.get(kit)?.dispose();
  wearMaterials.delete(kit);
  puddleMaterials.get(kit)?.dispose();
  puddleMaterials.delete(kit);
  fieldMaterials.get(kit)?.dispose();
  fieldMaterials.delete(kit);
}

/** Small town pieces whose shadows nobody sees from the town camera; they skip the shadow pass. */
const SHADOWLESS = new Set([
  "town.string-lights",
  "town.bunting",
  "town.grass",
  "town.tall-grass",
  "town.flowers",
  "town.wildflowers",
  "town.flower-bed",
  "town.lily",
  "town.rock",
  "town.mailbox",
  "town.bike-rack",
  "town.fence",
  "town.veg-bed",
  "town.picnic-blanket",
  "town.sandpit",
  "town.bush",
  "town.hedge",
  "ground",
]);

/**
 * The town's level of detail. Dressing is drawn thousands of times, so its round parts swap the kit's smooth spheres
 * (12 × 10) and cylinders (20 sides) for lighter ones (8 × 6, 10 sides), still soft under the toon materials, and the
 * small pieces cast no shadow. Shared geometry stays shared, so instancing is unchanged.
 */
/** Model-space radius under which a ball is tiny. */
const TINY = 0.09;

export function townDetail(kit: Kit, object: THREE.Object3D, key: string) {
  const shadow = !SHADOWLESS.has(key);
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!shadow) o.castShadow = false;
    const g = o.geometry;
    if (g instanceof THREE.SphereGeometry && g.parameters.thetaLength === Math.PI && g.parameters.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) < TINY) {
      // Flower heads, fruit and berries: a few pixels across, so a 6 × 4 ball (36 triangles, not 80) reads the same.
      const r = g.parameters.radius;
      o.geometry = kit.geometry(`sphere-tiny:${r}`, () => new THREE.SphereGeometry(r, 6, 4));
    } else if (g instanceof THREE.SphereGeometry && g.parameters.widthSegments > 8) {
      const r = g.parameters.radius;
      o.geometry = kit.geometry(`sphere-low:${r}`, () => new THREE.SphereGeometry(r, 7, 5));
    } else if (g instanceof THREE.CylinderGeometry && g.parameters.radialSegments > 10) {
      const { radiusTop, radiusBottom, height } = g.parameters;
      o.geometry = kit.geometry(`cylinder-low:${radiusTop},${radiusBottom},${height}`, () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 10));
    }
  });
}
