/* Greenhouse furniture that needs code (instanced leaves, the desk's screen glow, repeated books). Moved from
   apps/world/src/world/models.ts. Every model's origin is its footprint centre on the floor; its front faces +z. */
import * as THREE from "three";
import { put, type Kit } from "./kit.ts";

export function plant(kit: Kit, seed = 0): THREE.Group {
  const g = new THREE.Group();
  put(g, kit.cylinder(0.21, 0.15, 0.34, "terracotta"), 0, 0.17, 0);
  put(g, kit.cylinder(0.19, 0.19, 0.035, "soil"), 0, 0.345, 0);
  put(g, kit.cylinder(0.02, 0.025, 0.7, "stem"), 0, 0.62, 0);
  const leaves = new THREE.InstancedMesh(
    kit.geometry("leaf", () => new THREE.SphereGeometry(1, 10, 8)),
    kit.material("leaf-mid"),
    7,
  );
  const matrix = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4 + seed * 0.7;
    matrix.position.set(Math.sin(angle) * 0.16, 0.66 + (i % 3) * 0.14, Math.cos(angle) * 0.16);
    matrix.rotation.set(Math.cos(angle) * 0.55, angle, Math.sin(angle) * 0.55);
    matrix.scale.set(0.13, 0.4, 0.045);
    matrix.updateMatrix();
    leaves.setMatrixAt(i, matrix.matrix);
    leaves.setColorAt(i, color.set(kit.hex(i % 2 ? "leaf" : "leaf-dark")));
  }
  leaves.castShadow = true;
  g.add(leaves);
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
  d.scale.setScalar(0.95);
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
  put(g, tray, -0.52, 0.895, 0.2);
  return g;
}
