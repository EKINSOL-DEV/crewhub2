import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GridSpec, WorldProp } from "@crewhub/world-engine";
import { definitions, crew } from "./data";
import { haloMaterial } from "./shaders";

/** Shared geometry/material ownership keeps props small and disposal predictable. */
export class Assets {
  geometries = new Map<string, THREE.BufferGeometry>();
  materials = new Map<string, THREE.MeshStandardMaterial>();
  material(color: string, metalness = 0) {
    const key = color + metalness;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness });
      this.materials.set(key, m);
    }
    return m;
  }
  mesh(geo: THREE.BufferGeometry, material: THREE.Material) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  geometry(key: string, create: () => THREE.BufferGeometry) {
    let geo = this.geometries.get(key);
    if (!geo) {
      geo = create();
      this.geometries.set(key, geo);
    }
    return geo;
  }
  box(w: number, h: number, d: number, color: string, radius = 0.04) {
    return this.mesh(
      this.geometry(
        `box:${w},${h},${d},${radius}`,
        () =>
          new RoundedBoxGeometry(
            w,
            h,
            d,
            2,
            Math.min(radius, w / 3, h / 3, d / 3),
          ),
      ),
      this.material(color),
    );
  }
  sphere(r: number, color: string) {
    return this.mesh(
      this.geometry(`sphere:${r}`, () => new THREE.SphereGeometry(r, 12, 10)),
      this.material(color),
    );
  }
  cylinder(top: number, bottom: number, h: number, color: string) {
    return this.mesh(
      this.geometry(
        `cylinder:${top},${bottom},${h}`,
        () => new THREE.CylinderGeometry(top, bottom, h, 20),
      ),
      this.material(color),
    );
  }
  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}

function add<T extends THREE.Object3D>(
  group: THREE.Group,
  object: T,
  x: number,
  y: number,
  z: number,
): T {
  object.position.set(x, y, z);
  group.add(object);
  return object;
}

function plant(assets: Assets) {
  const g = new THREE.Group();
  add(g, assets.cylinder(0.21, 0.15, 0.34, "#d5b9a0"), 0, 0.17, 0);
  add(g, assets.cylinder(0.19, 0.19, 0.035, "#514c35"), 0, 0.345, 0);
  add(g, assets.cylinder(0.02, 0.025, 0.7, "#738463"), 0, 0.62, 0);
  const leaves = new THREE.InstancedMesh(
    assets.geometry("leaf", () => new THREE.SphereGeometry(1, 10, 8)),
    assets.material("#557a58"),
    7,
  );
  const matrix = new THREE.Object3D();
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4;
    matrix.position.set(
      Math.sin(angle) * 0.16,
      0.66 + (i % 3) * 0.14,
      Math.cos(angle) * 0.16,
    );
    matrix.rotation.set(Math.cos(angle) * 0.55, angle, Math.sin(angle) * 0.55);
    matrix.scale.set(0.13, 0.4, 0.045);
    matrix.updateMatrix();
    leaves.setMatrixAt(i, matrix.matrix);
    leaves.setColorAt(i, new THREE.Color(i % 2 ? "#7e9c61" : "#486e54"));
  }
  leaves.castShadow = true;
  g.add(leaves);
  return g;
}

function desk(assets: Assets, index: number) {
  const g = new THREE.Group();
  add(g, assets.box(1.7, 0.11, 1.06, "#bf9873"), 0, 0.84, 0);
  add(g, assets.box(1.69, 0.025, 1.05, "#d6b58e"), 0, 0.904, 0);
  for (const x of [-0.68, 0.68])
    for (const z of [-0.38, 0.38])
      add(g, assets.cylinder(0.04, 0.035, 0.82, "#455b4c"), x, 0.41, z);
  add(g, assets.box(0.85, 0.54, 0.055, "#34453e"), 0, 1.24, -0.26);
  const screen = add(
    g,
    assets.box(0.76, 0.43, 0.01, "#b8d8bd"),
    0,
    1.255,
    -0.223,
  );
  screen.material = new THREE.MeshStandardMaterial({
    color: "#b8d8bd",
    emissive: "#77977b",
    emissiveIntensity: 0.35,
    roughness: 1,
  });
  for (let i = 0; i < 4; i++)
    add(
      g,
      assets.box(
        0.26 + (i % 2) * 0.21,
        0.023,
        0.012,
        i === 0 ? "#ebedc4" : "#719c8b",
        0.004,
      ),
      -0.095,
      1.38 - i * 0.065,
      -0.209,
    );
  add(g, assets.box(0.09, 0.17, 0.045, "#455b4c"), 0, 0.98, -0.27);
  add(g, assets.box(0.34, 0.025, 0.22, "#455b4c"), 0, 0.927, -0.27);
  add(g, assets.box(0.48, 0.027, 0.17, "#e6dfcf"), 0, 0.938, 0.19);
  add(
    g,
    assets.cylinder(0.055, 0.05, 0.12, crew[index % 3]!.color),
    0.61,
    0.973,
    0.07,
  );
  add(g, assets.box(0.2, 0.035, 0.28, "#a4ae81"), -0.56, 0.939, 0.11);
  const tinyPlant = plant(assets);
  tinyPlant.scale.setScalar(0.38);
  add(g, tinyPlant, 0.61, 0.919, -0.31);
  return g;
}

export function propModel(
  prop: WorldProp,
  assets: Assets,
  grid: GridSpec,
): THREE.Group {
  const g = new THREE.Group();
  if (prop.definitionId === "plant") g.add(plant(assets));
  if (prop.definitionId === "desk")
    g.add(
      desk(
        assets,
        prop.id.includes("pip") ? 1 : prop.id.includes("orbit") ? 2 : 0,
      ),
    );
  if (prop.definitionId === "bench") {
    add(g, assets.box(1.64, 0.12, 0.47, "#caa37a"), 0, 0.49, 0);
    for (const x of [-0.59, 0.59])
      add(g, assets.box(0.09, 0.48, 0.38, "#49634f"), x, 0.24, 0);
    add(g, assets.box(0.46, 0.06, 0.39, "#b1ba94"), 0.28, 0.58, 0);
  }
  if (prop.definitionId === "lamp") {
    add(g, assets.cylinder(0.2, 0.2, 0.06, "#4c614e"), 0, 0.03, 0);
    add(g, assets.cylinder(0.027, 0.027, 1.63, "#a38f61"), 0, 0.85, 0);
    add(g, assets.cylinder(0.12, 0.26, 0.33, "#eee0b7"), 0, 1.72, 0);
    add(g, assets.sphere(0.08, "#fff6ce"), 0, 1.57, 0);
  }
  if (prop.definitionId === "sofa") {
    add(g, assets.box(1.73, 0.3, 1.05, "#a5b38e", 0.13), 0, 0.34, 0);
    add(g, assets.box(1.73, 0.54, 0.25, "#a5b38e", 0.11), 0, 0.64, 0.39);
    for (const x of [-0.75, 0.75])
      add(g, assets.box(0.22, 0.46, 1.07, "#a5b38e", 0.1), x, 0.49, 0);
    for (const x of [-0.36, 0.36])
      add(g, assets.box(0.67, 0.15, 0.77, "#c0c5a5", 0.065), x, 0.53, -0.08);
    const pillow = add(
      g,
      assets.box(0.37, 0.32, 0.12, "#e1bc89", 0.06),
      -0.49,
      0.72,
      0.2,
    );
    pillow.rotation.z = 0.22;
    for (const x of [-0.63, 0.63])
      for (const z of [-0.33, 0.33])
        add(g, assets.cylinder(0.04, 0.04, 0.23, "#5a6950"), x, 0.115, z);
  }
  if (prop.definitionId === "table") {
    add(g, assets.cylinder(0.5, 0.5, 0.09, "#cfb896"), 0, 0.43, 0);
    add(g, assets.cylinder(0.2, 0.27, 0.4, "#e0d4ba"), 0, 0.2, 0);
    add(g, assets.box(0.27, 0.035, 0.35, "#768e7c"), -0.08, 0.493, 0.03);
    add(g, assets.cylinder(0.065, 0.06, 0.12, "#f5ead4"), 0.21, 0.54, -0.08);
  }
  if (prop.definitionId === "shelf") {
    for (const y of [0.15, 0.65, 1.15, 1.65])
      add(g, assets.box(0.5, 0.055, 1.72, "#bca27e"), 0, y, 0);
    for (const z of [-0.81, 0.81])
      add(g, assets.box(0.47, 1.7, 0.045, "#bca27e"), 0, 0.85, z);
    for (let i = 0; i < 9; i++)
      add(
        g,
        assets.box(
          0.32,
          0.22 + (i % 2) * 0.1,
          0.075,
          ["#8da184", "#d3b48b", "#b49782"][i % 3]!,
        ),
        0.02,
        i < 5 ? 0.805 : 1.3,
        -0.6 + (i % 5) * 0.15,
      );
  }
  const d = definitions[prop.definitionId]!.footprint;
  const w = prop.rotation % 2 ? d.depth : d.width,
    depth = prop.rotation % 2 ? d.width : d.depth;
  g.position.set(
    (prop.cell.x + w / 2 - grid.width / 2) * grid.cellSize,
    0.025,
    (prop.cell.z + depth / 2 - grid.depth / 2) * grid.cellSize,
  );
  g.rotation.y = (-prop.rotation * Math.PI) / 2;
  g.traverse((object) => {
    object.userData.propId = prop.id;
  });
  return g;
}

export interface BotModel {
  group: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  arms: THREE.Group[];
  feet: THREE.Mesh[];
  eyes: THREE.Mesh[];
  halo: THREE.ShaderMaterial;
  antenna: THREE.Mesh;
}
export function botModel(
  assets: Assets,
  color: string,
  id: string,
  variant: number,
): BotModel {
  const group = new THREE.Group(),
    body = new THREE.Group(),
    head = new THREE.Group();
  const halo = haloMaterial(color);
  const ring = new THREE.Mesh(
    assets.geometry("halo", () => new THREE.PlaneGeometry(1.45, 1.45)),
    halo,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);
  group.add(body);
  body.position.y = 0.12;
  add(body, assets.box(0.5, 0.43, 0.36, color, 0.1), 0, 0.46, 0);
  add(body, assets.box(0.25, 0.15, 0.025, "#eff0dd", 0.035), 0, 0.49, 0.18);
  add(
    body,
    assets.cylinder(0.035, 0.035, 0.026, "#547563"),
    0,
    0.49,
    0.204,
  ).rotation.x = Math.PI / 2;
  head.position.y = 0.92;
  body.add(head);
  add(head, assets.box(0.68, 0.52, 0.52, color, 0.13), 0, 0, 0);
  add(head, assets.box(0.54, 0.25, 0.05, "#283f36", 0.09), 0, 0.005, 0.265);
  const eyes = [-0.13, 0.13].map((x) =>
    add(head, assets.box(0.07, 0.1, 0.028, "#efffdc", 0.03), x, 0.015, 0.298),
  );
  add(head, assets.cylinder(0.018, 0.018, 0.19, "#5a7160"), 0, 0.335, 0);
  const antenna = add(head, assets.sphere(0.075, "#f1dd94"), 0, 0.435, 0);
  for (const x of [-0.355, 0.355])
    add(
      head,
      assets.cylinder(0.09, 0.09, 0.065, "#e3e4c9"),
      x,
      -0.01,
      0,
    ).rotation.z = Math.PI / 2;
  const arms = [-1, 1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.32, 0.6, 0);
    body.add(arm);
    add(arm, assets.box(0.12, 0.29, 0.15, color, 0.06), 0, -0.11, 0);
    add(arm, assets.sphere(0.079, "#e8e7cd"), 0, -0.24, 0.015);
    return arm;
  });
  const feet = [-0.16, 0.16].map((x) =>
    add(group, assets.box(0.19, 0.14, 0.29, "#4e6657", 0.065), x, 0.12, 0.065),
  );
  if (variant === 1) {
    const petal = add(head, assets.sphere(0.1, "#f1d990"), 0.27, 0.22, 0.14);
    petal.scale.set(1, 0.35, 1);
  }
  if (variant === 2) {
    add(body, assets.box(0.32, 0.07, 0.37, "#ede5c7", 0.02), 0, 0.68, 0.01);
  }
  group.traverse((o) => {
    o.userData.agentId = id;
  });
  return { group, body, head, arms, feet, eyes, halo, antenna };
}

/** Disposes unique materials allocated outside the shared pool. */
export function disposeExtraMaterials(group: THREE.Object3D, assets: Assets) {
  const shared = new Set<THREE.Material>(assets.materials.values()),
    disposed = new Set<THREE.Material>();
  group.traverse((o) => {
    if (o instanceof THREE.Mesh)
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        if (!shared.has(m) && !disposed.has(m)) {
          m.dispose();
          disposed.add(m);
        }
  });
}
