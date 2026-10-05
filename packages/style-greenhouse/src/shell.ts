/* The Greenhouse building shell, after the old Greenhouse room (main at 3a66363): tall chalk back walls with windows,
   the glass wall with slim green mullions, low rims at the front so the camera looks in, soft partitions with timber
   door frames, a cream slab with a bevelled lip that floats the building like the old diorama, and the project colour
   only as an accent (the entrance door, its awning, a thin trim on the slab, the flag). Origins: a piece's footprint
   centre at floor level (the slab's top); walls run along x. "archived" boards a piece up: planks, ivy, muted chalk. */
import * as THREE from "three";
import type { LifeSpot, ModelOptions } from "@crewhub/world-style";
import { put, type Kit, type Swatch } from "./kit.ts";

type Size = { width: number; height: number; depth: number };
const size = (o: ModelOptions, fallback: Size): Size => o.size ?? fallback;
const accent = (o: ModelOptions): Swatch => o.accent ?? "no-project";
const archived = (o: ModelOptions) => o.variant === "archived";

/** The slab's height above the lawn: the floor level of every building. Renderers read it from `userData.rise`. */
export const SLAB = 0.24;

/** Two planks nailed across an opening of `width` x `height`, centred on (x, y, z). */
function boardUp(kit: Kit, g: THREE.Object3D, width: number, height: number, x: number, y: number, z: number) {
  const length = Math.hypot(width, height) * 0.92;
  const tilt = Math.atan2(height, width);
  for (const [sign, dz] of [
    [1, 0],
    [-1, 0.012],
  ] as const) {
    const plank = put(g, kit.box(length, 0.09, 0.035, "plank", 0.012), x, y, z + dz);
    plank.rotation.z = sign * tilt * 0.8;
  }
}

/** Chalk pilasters at both ends of a tall wall: the corners and the wall's end at the front look finished. */
function pilasters(kit: Kit, g: THREE.Object3D, width: number, height: number, depth: number, chalk: Swatch) {
  for (const s of [-1, 1]) {
    put(g, kit.box(0.26, height + 0.06, depth + 0.1, chalk, 0.03), s * (width / 2 - 0.13), (height + 0.06) / 2, 0);
    put(g, kit.box(0.32, 0.06, depth + 0.16, "ledge", 0.02), s * (width / 2 - 0.13), height + 0.09, 0);
  }
}

/** An empty marker for the renderer's ambient life (world-style's LifeSpot convention). */
function lifeSpot(g: THREE.Object3D, life: LifeSpot, x: number, y: number, z: number) {
  const spot = new THREE.Object3D();
  spot.position.set(x, y, z);
  spot.userData.life = life;
  g.add(spot);
}

/** A group for small details that take shadows but cast none (cheaper shadow passes in a town of buildings). */
function small(parent: THREE.Object3D): THREE.Group {
  const g = new THREE.Group();
  g.userData.small = true;
  parent.add(g);
  return g;
}
/** A flat piece (slab, apron): it takes shadows but casts none. */
function flat<T extends THREE.Object3D>(model: T): T {
  model.traverse((m) => (m.castShadow = false));
  return model;
}
/** Turns off shadow casting under every `small` group of a finished model. */
function settle<T extends THREE.Object3D>(model: T): T {
  model.traverse((o) => {
    if (o.userData.small) o.traverse((m) => (m.castShadow = false));
  });
  return model;
}

/** A planted window box under a window on the wall's outer face (-z); an archived one holds only dry stems. */
function windowBox(kit: Kit, wall: THREE.Object3D, x: number, sill: number, face: number, width: number, dry: boolean, seed: number) {
  const g = small(wall);
  const z = face - 0.11;
  put(g, kit.box(width + 0.04, 0.16, 0.18, "terracotta", 0.03), x, sill - 0.12, z);
  for (const s of [-1, 1]) put(g, kit.box(0.04, 0.12, 0.08, "timber", 0.01), x + s * (width / 2 - 0.08), sill - 0.24, face - 0.04);
  const petals = ["petal", "coral"];
  const count = Math.round(width / 0.13);
  for (let i = 0; i < count; i++) {
    const px = x - width / 2 + 0.07 + (i * (width - 0.14)) / Math.max(1, count - 1);
    const lift = ((i * 7 + seed * 3) % 5) * 0.012;
    if (dry) {
      put(g, kit.box(0.015, 0.1, 0.015, "plank", 0.004), px, sill + 0.0, z);
      continue;
    }
    put(g, kit.sphere(0.07, "leaf"), px, sill - 0.01 + lift, z).scale.set(1, 0.8, 1);
    if (i % 2 === 0) put(g, kit.sphere(0.035, petals[(i / 2 + seed) % petals.length]!), px + 0.02, sill + 0.06 + lift, z - 0.04);
  }
}

/** The tall solid back wall (west): chalk with a skirt, a ledge on top and a few framed windows. */
export function tallWall(kit: Kit, o: ModelOptions, glass: THREE.Material): THREE.Group {
  const { width, height, depth } = size(o, { width: 4, height: 1.75, depth: 0.16 });
  const g = new THREE.Group();
  const chalk = archived(o) ? "chalk-dim" : "chalk";
  const windows = width >= 2.4 ? Math.max(1, Math.floor(width / 3.2)) : 0;
  const ww = 0.9,
    sill = 0.55,
    head = Math.min(height - 0.3, 1.35);
  let from = -width / 2;
  for (let i = 0; i < windows; i++) {
    const c = -width / 2 + ((i + 0.5) * width) / windows;
    const left = c - ww / 2,
      right = c + ww / 2;
    // The pier up to this window, then the panels under and over it.
    put(g, kit.box(left - from, height, depth, chalk, 0.02), (from + left) / 2, height / 2, 0);
    put(g, kit.box(ww, sill, depth, chalk, 0.02), c, sill / 2, 0);
    put(g, kit.box(ww, height - head, depth, chalk, 0.02), c, (height + head) / 2, 0);
    // A warm pane: pale glass by day, lit from inside in the evening (its glow follows the theme), with a patch of
    // window light on the floor below it inside (+z), a lamp-pool decal that only shows in lamplight.
    const pane = kit.geometry(`window-pane:${ww}`, () => new THREE.PlaneGeometry(ww - 0.04, head - sill - 0.04));
    put(g, new THREE.Mesh(pane, archived(o) ? glass : kit.material("window-lit", { glow: "window-light" })), c, (sill + head) / 2, 0);
    if (!archived(o)) {
      // Ambient life's window spot: a lit window glows here in lamplight, facing into the room (+z).
      lifeSpot(g, "window", c, (sill + head) / 2, depth / 2 + 0.01);
      const spill = kit.decal("pool", ww * 0.35, 0.22, 0.45);
      spill.position.set(c, 0.03, depth / 2 + 0.5);
      g.add(spill);
    }
    // Frame, a cross of glazing bars and a deep sill.
    put(g, kit.box(ww + 0.12, 0.05, depth + 0.1, "timber-trim", 0.015), c, sill, 0);
    put(g, kit.box(0.035, head - sill, depth * 0.5, "mullion", 0.01), c, (sill + head) / 2, 0);
    put(g, kit.box(ww, 0.03, depth * 0.5, "mullion", 0.01), c, sill + (head - sill) * 0.55, 0);
    if (archived(o)) for (const z of [depth / 2 + 0.03, -depth / 2 - 0.03]) boardUp(kit, g, ww, head - sill, c, (sill + head) / 2, z);
    windowBox(kit, g, c, sill, -depth / 2, ww, archived(o), i);
    from = right;
  }
  put(g, kit.box(width / 2 - from, height, depth, chalk, 0.02), (from + width / 2) / 2, height / 2, 0);
  for (const z of [depth / 2 + 0.012, -depth / 2 - 0.012]) put(g, kit.box(width, 0.13, 0.03, "ledge", 0.01), 0, 0.065, z);
  put(g, kit.box(width + 0.04, 0.07, depth + 0.08, "ledge", 0.02), 0, height + 0.035, 0);
  pilasters(kit, g, width, height, depth, chalk);
  return settle(g);
}

/** The greenhouse glass wall (north): a chalk knee wall, tall panes between slim green mullions, a transom. */
export function glassWall(kit: Kit, o: ModelOptions, glass: THREE.Material): THREE.Group {
  const { width, height, depth } = size(o, { width: 4, height: 1.75, depth: 0.16 });
  const g = new THREE.Group();
  const knee = 0.26;
  const bays = Math.max(1, Math.round(width / 1.1));
  const bay = width / bays;
  put(g, kit.box(width, knee, depth, archived(o) ? "chalk-dim" : "chalk", 0.02), 0, knee / 2, 0);
  put(g, kit.box(width + 0.02, 0.05, depth + 0.06, "mullion", 0.015), 0, knee, 0);
  const pane = kit.geometry(`glass-pane:${bay.toFixed(3)},${height}`, () => new THREE.PlaneGeometry(bay - 0.05, height - knee - 0.08));
  const transom = knee + (height - knee) * 0.64;
  for (let i = 0; i < bays; i++) {
    const x = -width / 2 + (i + 0.5) * bay;
    put(g, new THREE.Mesh(pane, glass), x, (knee + height) / 2, 0);
    put(g, kit.box(0.045, height - knee, 0.09, "mullion", 0.01), x - bay / 2, (knee + height) / 2, 0);
    if (archived(o) && i % 2 === 0) for (const z of [0.07, -0.07]) boardUp(kit, g, bay, height - knee, x, (knee + height) / 2, z);
    // Every third bay is a window spot for ambient life, facing into the room (+z).
    else if (!archived(o) && i % 3 === 1) lifeSpot(g, "window", x, knee + (height - knee) * 0.45, depth / 2 + 0.01);
  }
  put(g, kit.box(0.045, height - knee, 0.09, "mullion", 0.01), width / 2, (knee + height) / 2, 0);
  put(g, kit.box(width, 0.035, 0.07, "mullion", 0.01), 0, transom, 0);
  put(g, kit.box(width + 0.06, 0.09, depth, "mullion", 0.02), 0, height - 0.02, 0);
  // A pale cap on the frame: from the town the glass wall's top catches the light like the chalk wall's ledge.
  put(g, kit.box(width + 0.08, 0.035, depth + 0.06, "cream", 0.012), 0, height + 0.04, 0);
  pilasters(kit, g, width, height, depth, archived(o) ? "chalk-dim" : "chalk");
  return g;
}

/** The low rim of the front walls (south, east): skirting height, so the camera looks into the rooms. */
export function rim(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height, depth } = size(o, { width: 2, height: 0.22, depth: 0.12 });
  const g = new THREE.Group();
  put(g, kit.box(width, height, depth, archived(o) ? "chalk-dim" : "chalk", 0.02), 0, height / 2, 0);
  // A timber coping: from the town the front walls draw the building's outline.
  put(g, kit.box(width + 0.02, 0.045, depth + 0.05, "coping", 0.012), 0, height + 0.0225, 0);
  // Square posts at both ends (the corners, and either side of a door), a little taller than the rim.
  for (const s of [-1, 1]) {
    put(g, kit.box(depth + 0.08, height + 0.12, depth + 0.08, archived(o) ? "chalk-dim" : "chalk", 0.02), s * (width / 2 - depth / 2), (height + 0.12) / 2, 0);
    put(g, kit.box(depth + 0.12, 0.04, depth + 0.12, "coping", 0.012), s * (width / 2 - depth / 2), height + 0.14, 0);
  }
  return g;
}

/**
 * A soft partition between rooms: lower than the outer walls, in a quieter tone than the chalk outer walls (from the
 * town the rooms read as places, not as white lines), with a timber cap.
 */
export function partition(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height, depth } = size(o, { width: 2, height: 0.52, depth: 0.1 });
  const g = new THREE.Group();
  put(g, kit.box(width, height, depth, archived(o) ? "chalk-dim" : "partition", 0.02), 0, height / 2, 0);
  put(g, kit.box(width + 0.01, 0.035, depth + 0.035, "timber-trim", 0.012), 0, height + 0.0175, 0);
  return g;
}

/** A timber door frame around an opening `width` wide: two posts, a lintel and a threshold. */
export function doorFrame(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height } = size(o, { width: 1.2, height: 1.05, depth: 0.14 });
  const g = new THREE.Group();
  for (const x of [-width / 2, width / 2]) put(g, kit.box(0.08, height, 0.15, "timber-trim", 0.02), x, height / 2, 0);
  put(g, kit.box(width + 0.12, 0.08, 0.16, "timber-trim", 0.02), 0, height, 0);
  put(small(g), kit.box(width - 0.06, 0.012, 0.16, "timber-trim", 0.004), 0, 0.006, 0);
  return g;
}

/**
 * The front door, `width` wide in the south rim: a chalk portal with the door leaves in the project colour (open in
 * the day, shut and boarded when archived), a striped awning, two small lamps, a mat and two steps down to the lawn
 * (+z is outside).
 */
export function entrance(kit: Kit, o: ModelOptions): THREE.Group {
  const { width } = size(o, { width: 1.2, height: 1.5, depth: 0.16 });
  const g = new THREE.Group();
  const color = accent(o);
  const shut = archived(o);
  const high = 1.45;
  const chalk = shut ? "chalk-dim" : "chalk";
  for (const s of [-1, 1]) {
    put(g, kit.box(0.16, high, 0.2, chalk, 0.03), s * (width / 2 + 0.08), high / 2, 0);
    // A planter on the lawn either side of the steps: a clipped box shrub with a ring of flowers.
    const px = s * (width / 2 + 0.62);
    const planter = small(g);
    put(planter, kit.box(0.42, 0.34, 0.42, shut ? "chalk-dim" : "terracotta", 0.05), px, -SLAB + 0.17, 0.42);
    put(planter, kit.box(0.46, 0.04, 0.46, "clay", 0.015), px, -SLAB + 0.34, 0.42);
    put(planter, kit.sphere(0.2, shut ? "moss" : "leaf"), px, -SLAB + 0.5, 0.42).scale.set(1, 1.15, 1);
    if (!shut)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + s;
        put(planter, kit.sphere(0.04, i % 2 ? "petal" : "coral"), px + Math.cos(a) * 0.17, -SLAB + 0.4, 0.42 + Math.sin(a) * 0.17);
      }
  }
  put(g, kit.box(width + 0.5, 0.16, 0.24, chalk, 0.03), 0, high + 0.08, 0);
  // Door leaves: swung open into the lobby, or shut.
  const leaf = width / 2 - 0.02;
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * (width / 2 - 0.01), 0, -0.02);
    hinge.rotation.y = shut ? 0 : s * 1.25;
    put(hinge, kit.box(leaf, high - 0.08, 0.045, color, 0.015), -s * (leaf / 2), (high - 0.08) / 2 + 0.01, 0);
    put(hinge, kit.box(leaf * 0.55, 0.42, 0.05, "window", 0.01), -s * (leaf / 2), high * 0.66, 0);
    put(hinge, kit.box(0.025, 0.12, 0.06, "brass", 0.008), -s * (leaf - 0.07), high * 0.45, 0.01);
    g.add(hinge);
  }
  // The striped awning, sloping down towards the street, with a valance in the project colour.
  const awning = new THREE.Group();
  awning.position.set(0, high + 0.2, 0.1);
  awning.rotation.x = 0.42;
  const stripes = 7;
  const stripe = (width + 0.6) / stripes;
  for (let i = 0; i < stripes; i++)
    put(awning, kit.box(stripe, 0.025, 0.62, i % 2 ? "cream" : color, 0.008), -(width + 0.6) / 2 + (i + 0.5) * stripe, 0, 0.31);
  put(awning, kit.box(width + 0.62, 0.09, 0.02, color, 0.008), 0, -0.045, 0.62);
  g.add(awning);
  if (shut) boardUp(kit, g, width, high - 0.1, 0, high / 2, 0.06);
  // A mat inside, a coir doormat with a border on the top step, and two steps down to the lawn.
  const mat = small(g);
  put(mat, kit.box(width * 0.8, 0.012, 0.3, shut ? "plank" : "rug", 0.004), 0, 0.006, -0.25);
  put(mat, kit.box(width * 0.62, 0.014, 0.24, "timber", 0.004), 0, -SLAB / 2 + 0.008, 0.3);
  put(mat, kit.box(width * 0.54, 0.016, 0.17, shut ? "plank" : "timber-trim", 0.004), 0, -SLAB / 2 + 0.01, 0.3);
  put(mat, kit.box(width + 0.5, SLAB / 2, 0.32, "step", 0.02), 0, -SLAB * 0.75 + 0.002, 0.3);
  put(mat, kit.box(width + 0.8, 0.03, 0.34, "step", 0.01), 0, -SLAB + 0.015, 0.62);
  return settle(g);
}

/**
 * The building's slab under one room-sized rectangle: a cream block with a bevelled lip just under the floor, a thin
 * project-colour trim beneath the lip and a darker skirting line at the foot. `size` is the floor's size; the slab
 * reaches a little past it.
 */
export function slab(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 4, height: SLAB, depth: 4 });
  const g = new THREE.Group();
  const reach = 0.22;
  // A warm side under a cream lip: the building's footprint reads crisply against the lawn.
  put(g, kit.box(width + reach * 2, SLAB - 0.05, depth + reach * 2, "slab-side", 0.05), 0, -(SLAB + 0.05) / 2, 0);
  put(g, kit.box(width + reach * 2 + 0.06, 0.06, depth + reach * 2 + 0.06, archived(o) ? "chalk-dim" : "cream", 0.03), 0, -0.03, 0);
  // A thin trim under the lip in a soft tint of the project colour: an accent, never a ribbon (the colour reads from
  // the town through the awning, the door, the flag and the name sign).
  put(g, kit.box(width + reach * 2 + 0.02, 0.022, depth + reach * 2 + 0.02, archived(o) ? "plank" : `soft:${accent(o)}`, 0.008), 0, -0.075, 0);
  put(g, kit.box(width + reach * 2 + 0.03, 0.04, depth + reach * 2 + 0.03, "ledge", 0.015), 0, -SLAB + 0.02, 0);
  g.userData.rise = SLAB;
  // Flat: its shadow is a sliver under the lip; the walls standing on it cast the ones that read.
  return flat(g);
}

/** The truck's loading apron on the lawn in front of dispatch: a pale pad with a kerb and painted bay lines. */
export function apron(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, depth } = size(o, { width: 2.4, height: 0.04, depth: 2.6 });
  const g = new THREE.Group();
  put(g, kit.box(width, 0.035, depth, "floor-concrete", 0.012), 0, 0.0175 - SLAB, 0);
  for (const s of [-1, 1]) put(g, kit.box(0.05, 0.012, depth - 0.3, "cream", 0.004), s * (width / 2 - 0.2), 0.04 - SLAB, 0.1);
  put(g, kit.box(width + 0.08, 0.06, 0.08, "step", 0.02), 0, 0.03 - SLAB, -depth / 2 + 0.02);
  return flat(g);
}

/** Dispatch's loading door, `width` wide in the south rim: a frame, a half-rolled shutter and two dock bumpers. */
export function loadingDoor(kit: Kit, o: ModelOptions): THREE.Group {
  const { width } = size(o, { width: 1.8, height: 1.2, depth: 0.16 });
  const g = new THREE.Group();
  const high = 1.15;
  const shut = archived(o);
  for (const s of [-1, 1]) {
    put(g, kit.box(0.12, high, 0.18, shut ? "chalk-dim" : "chalk", 0.025), s * (width / 2 + 0.04), high / 2, 0);
    put(g, kit.box(0.1, 0.16, 0.08, "graphite", 0.03), s * (width / 2 - 0.12), -0.1, 0.12);
  }
  put(g, kit.box(width + 0.3, 0.14, 0.2, shut ? "chalk-dim" : "chalk", 0.03), 0, high + 0.07, 0);
  // The shutter: rolled up in the day, down when archived.
  const down = shut ? high - 0.05 : 0.3;
  put(g, kit.box(width - 0.04, down, 0.04, "sage", 0.01), 0, high - down / 2, 0.02);
  for (let i = 1; i < Math.floor(down / 0.1); i++) put(g, kit.box(width - 0.06, 0.012, 0.05, "mullion", 0.004), 0, high - i * 0.1, 0.02);
  put(g, kit.cylinder(0.08, 0.08, width - 0.04, "sage"), 0, high - 0.02, 0.06).rotation.z = Math.PI / 2;
  put(small(g), kit.box(width, 0.02, 0.18, "plank", 0.006), 0, -0.01, 0.1);
  return settle(g);
}

/** Ivy climbing a wall `width` wide up to `height`: soft leaf clusters on its face (+z), denser at the foot. */
export function ivy(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height } = size(o, { width: 1.5, height: 1.2, depth: 0.1 });
  const g = new THREE.Group();
  let seed = (o.seed ?? 1) * 9301 + 49297;
  const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const clusters = Math.max(8, Math.round(width * height * 26));
  const colours = ["leaf", "leaf-dark", "moss"];
  for (let i = 0; i < clusters; i++) {
    const x = (random() - 0.5) * width;
    const y = Math.pow(random(), 1.7) * height;
    const r = 0.08 + random() * 0.09;
    const leaf = put(g, kit.sphere(0.1, colours[i % 3]!), x, y + r, 0.02 + random() * 0.03);
    leaf.scale.set(r * 10, r * 9, r * 4);
  }
  return g;
}

/** A small timber board hanging from a bracket: "closed". The origin is the bracket's top. */
export function closedSign(kit: Kit): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-0.16, 0.16]) put(g, kit.box(0.012, 0.16, 0.012, "pole", 0.004), x, -0.08, 0);
  put(g, kit.box(0.5, 0.2, 0.035, "timber", 0.02), 0, -0.25, 0);
  put(g, kit.box(0.44, 0.14, 0.012, "cream", 0.008), 0, -0.25, 0.02);
  // "CLOSED", lettered as five short strokes and a bar: the board reads as a sign without a texture.
  for (let i = 0; i < 6; i++) put(g, kit.box(0.035, 0.07, 0.008, "circle", 0.004), -0.15 + i * 0.06, -0.25, 0.028);
  put(g, kit.box(0.4, 0.014, 0.008, "circle", 0.003), 0, -0.3, 0.028);
  return g;
}

/** The flag on its pole at the building's north-west corner; an archived project's flag hangs at half-mast. */
export function flag(kit: Kit, o: ModelOptions): THREE.Group {
  const g = new THREE.Group();
  const high = 3.1;
  put(g, kit.box(0.26, 0.12, 0.26, "chalk", 0.04), 0, 0.06, 0);
  put(g, kit.cylinder(0.028, 0.035, high, "pole"), 0, high / 2, 0);
  put(g, kit.sphere(0.06, "brass"), 0, high + 0.04, 0);
  // Half-mast still clears the tall walls at the corner.
  const y = archived(o) ? high * 0.7 : high - 0.34;
  // Two panels at a slight angle: the cloth catches the wind.
  const cloth = accent(o);
  put(g, kit.box(0.46, 0.5, 0.025, cloth, 0.01), 0.25, y, 0).rotation.y = -0.12;
  put(g, kit.box(0.42, 0.48, 0.025, cloth, 0.01), 0.68, y - 0.02, -0.08).rotation.y = 0.2;
  return g;
}

/** Planks over an opening `width` wide (archived buildings). */
export function planks(kit: Kit, o: ModelOptions): THREE.Group {
  const { width, height } = size(o, { width: 1.3, height: 0.4, depth: 0.05 });
  const g = new THREE.Group();
  boardUp(kit, g, width, height, 0, height / 2, 0);
  return g;
}

/**
 * A wall lamp: a small lantern on a bracket, mounted on a door's post at `y` above the floor, facing the street (+z).
 * The style adds its warm pool on the ground in front (LIGHT_POOLS).
 */
export function wallLamp(kit: Kit, o: ModelOptions): THREE.Group {
  const g = new THREE.Group();
  const y = 1.05;
  put(g, kit.box(0.09, 0.14, 0.03, "lamp-base", 0.01), 0, y, 0.015);
  put(g, kit.box(0.025, 0.025, 0.14, "lamp-base", 0.008), 0, y + 0.04, 0.09);
  put(g, kit.box(0.11, 0.025, 0.11, "lamp-base", 0.008), 0, y + 0.03, 0.17);
  put(g, kit.mesh(kit.geometry("wall-lamp:glass", () => new THREE.CylinderGeometry(0.055, 0.05, 0.14, 10)), kit.material("lamp-glow", { glow: archived(o) ? 0.05 : 0.9 })), 0, y - 0.04, 0.17);
  put(g, kit.cylinder(0.01, 0.065, 0.05, "lamp-base"), 0, y + 0.06, 0.17);
  g.traverse((m) => (m.castShadow = false));
  return g;
}

/** Heights (m) of the far-detail stand-ins, by class. */
const FAR_HEIGHT: Record<string, number> = { desk: 0.56, table: 0.5, shelf: 1.0, sofa: 0.42, plant: 0.7, crate: 0.42, rug: 0.012, board: 0.9 };

/**
 * The far-detail stand-in of a piece of furniture, `size` its footprint: a few plain boxes in the piece's main colours,
 * so a building seen from the town looks furnished. Variants: desk, table, shelf, sofa, plant, crate, rug, board.
 */
export function silhouette(kit: Kit, o: ModelOptions): THREE.Group {
  const { width: w, depth: d } = size(o, { width: 0.6, height: 0, depth: 0.6 });
  const kind = o.variant ?? "crate";
  const h = FAR_HEIGHT[kind] ?? 0.4;
  const g = new THREE.Group();
  const box = (bw: number, bh: number, bd: number, color: Swatch, x = 0, y = bh / 2, z = 0) => put(g, kit.box(bw, bh, bd, color, 0.01), x, y, z);
  switch (kind) {
    case "desk":
      box(w - 0.1, 0.05, d - 0.12, "timber", 0, h - 0.025);
      // Soft tones, not black: from the town a row of desks reads as furniture, not as dark marks.
      box(w - 0.2, h - 0.05, 0.05, "timber-trim", 0, (h - 0.05) / 2, d / 2 - 0.12);
      box(0.36, 0.24, 0.04, "far-screen", 0, h + 0.12, -d / 2 + 0.16);
      break;
    case "table":
      box(w - 0.12, 0.06, d - 0.12, "timber", 0, h - 0.03);
      box(Math.max(0.1, w - 0.6), h - 0.06, 0.08, "timber-trim", 0, (h - 0.06) / 2);
      break;
    case "shelf":
      box(w - 0.1, h, d - 0.25, "timber");
      box(w - 0.2, 0.18, d - 0.22, "sage", 0, h * 0.72);
      box(w - 0.2, 0.18, d - 0.22, "clay", 0, h * 0.35);
      break;
    case "sofa":
      box(w - 0.1, 0.24, d - 0.12, "sage", 0, 0.16);
      box(w - 0.1, h - 0.1, 0.12, "sage", 0, (h + 0.1) / 2, -d / 2 + 0.12);
      break;
    case "plant":
      box(0.24, 0.22, 0.24, "clay");
      put(g, kit.mesh(kit.geometry("far-leaf", () => new THREE.IcosahedronGeometry(0.24, 0)), kit.material("leaf")), 0, 0.46, 0).scale.set(1, 1.2, 1);
      break;
    case "rug":
      box(w - 0.1, h, d - 0.1, "rug", 0, 0.006);
      break;
    case "board":
      box(w - 0.15, 0.6, 0.04, "clay", 0, h - 0.3);
      break;
    default:
      box(w - 0.12, h, d - 0.12, "clay");
  }
  // Seen from the town only the taller pieces (desks, shelves, sofas, plants) cast a shadow worth its draw call.
  if (h <= 0.3) g.traverse((m) => (m.castShadow = false));
  return g;
}

const painted = new Map<string, THREE.MeshStandardMaterial>();

/**
 * The lettering of a painted sign: the words in cream on a transparent canvas, one material per text, theme colour and
 * board size. A line break in `text` starts a second line (the staked plot's sign).
 */
export function lettering(kit: Kit, text: string, width: number, height: number): THREE.MeshStandardMaterial {
  const ink = kit.hex("cream", "day");
  const key = `${text}|${ink}|${width.toFixed(2)}|${height.toFixed(2)}`;
  let material = painted.get(key);
  if (!material) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * 320);
    canvas.height = Math.round(height * 320);
    const ctx = canvas.getContext("2d")!;
    const lines = text.split("\n");
    let size = (canvas.height * 0.62) / lines.length;
    const font = (px: number) => `600 ${px}px Georgia, "Times New Roman", serif`;
    ctx.font = font(size);
    // Shrink long names to fit the board, with a margin.
    const room = canvas.width * 0.88;
    const measured = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (measured > room) size *= room / measured;
    ctx.font = font(size);
    ctx.fillStyle = ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height * (0.54 + (i - (lines.length - 1) / 2) * (0.84 / lines.length))));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: 0.35, roughness: 0.8 });
    painted.set(key, material);
  }
  return material;
}

/** Disposes the painted lettering (the style's dispose). */
export function disposeLettering() {
  for (const material of painted.values()) {
    material.map?.dispose();
    material.dispose();
  }
  painted.clear();
}

/**
 * A painted name board that stands on the front door's lintel (origin: the doorway's centre at floor level, the street
 * at +z): a board in the project colour with a timber frame and the name lettered in cream.
 */
export function nameSign(kit: Kit, o: ModelOptions): THREE.Group {
  const text = (o.text ?? "").trim() || " ";
  const g = new THREE.Group();
  const width = Math.min(2.2, Math.max(1.3, 0.55 + text.length * 0.075));
  const height = 0.36;
  const y = 1.62 + height / 2 + 0.06;
  put(g, kit.box(width + 0.08, height + 0.08, 0.06, "timber-trim", 0.02), 0, y, -0.02);
  put(g, kit.box(width, height, 0.05, accent(o), 0.015), 0, y, 0.0);
  for (const s of [-1, 1]) put(g, kit.box(0.05, 0.08, 0.05, "timber-trim", 0.01), s * (width / 2 - 0.15), 1.66, -0.02);
  const face = new THREE.Mesh(kit.geometry(`name-face:${width.toFixed(2)}`, () => new THREE.PlaneGeometry(width - 0.06, height - 0.04)), lettering(kit, text, width - 0.06, height - 0.04));
  face.position.set(0, y, 0.027);
  g.add(face);
  return g;
}
