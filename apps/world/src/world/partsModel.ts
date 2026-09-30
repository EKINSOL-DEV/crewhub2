import * as THREE from "three";
import type { GridSpec, PropModel, PropPart, WorldProp } from "@crewhub/world-engine";
import { PROP_LIMITS } from "@crewhub/world-engine";
import type { Assets } from "./models";
import { propMaterialColors } from "./data";

const DEG = Math.PI / 180;

/** Glow and glass need their own look; they live in the shared pool so `assets.dispose()` frees them. */
function specialMaterial(assets: Assets, part: PropPart): THREE.MeshStandardMaterial | null {
  const color = propMaterialColors[part.material];
  const kind = part.emissive ? "glow" : part.material === "glass" ? "glass" : null;
  if (!kind) return null;
  const key = `prop-${kind}:${color}`;
  let m = assets.materials.get(key);
  if (!m) {
    m =
      kind === "glow"
        ? new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 1 })
        : new THREE.MeshStandardMaterial({ color, roughness: 0.15, transparent: true, opacity: 0.55 });
    assets.materials.set(key, m);
  }
  return m;
}

function partMesh(assets: Assets, part: PropPart): THREE.Mesh {
  const color = propMaterialColors[part.material];
  const [a, b, c] = part.size;
  let mesh: THREE.Mesh;
  switch (part.shape) {
    case "box":
      mesh = assets.box(a, b, c, color, part.radius ?? PROP_LIMITS.cornerRadiusDefault);
      break;
    case "cylinder":
      mesh = assets.cylinder(a, c, b, color);
      break;
    case "cone":
      mesh = assets.cylinder(0, a, b, color);
      break;
    case "sphere":
      mesh = assets.sphere(1, color);
      mesh.scale.set(a, b, c);
      break;
    case "torus":
      mesh = assets.mesh(
        assets.geometry(`prop-torus:${a},${b}`, () => new THREE.TorusGeometry(a, b, 10, 32).rotateX(Math.PI / 2)),
        assets.material(color),
      );
      break;
  }
  const special = specialMaterial(assets, part);
  if (special) mesh.material = special;
  mesh.position.set(...part.position);
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
  mesh.rotation.set(rx * DEG, ry * DEG, rz * DEG, "XYZ");
  return mesh;
}

/**
 * Draws a validated crewhub-prop/1 model in the Greenhouse style with the shared `Assets` pool. The group's origin is
 * the footprint centre on the floor; the front of the prop faces +z. Pass only models that passed `validatePropModel`.
 */
export function partsModel(model: PropModel, assets: Assets): THREE.Group {
  const g = new THREE.Group();
  g.name = model.id;
  for (const part of model.parts) g.add(partMesh(assets, part));
  return g;
}

/** The same model placed on a room grid, matching `propModel`'s placement and rotation of built-in props. */
export function placedPartsModel(
  prop: WorldProp,
  model: PropModel,
  assets: Assets,
  grid: GridSpec,
): THREE.Group {
  const g = partsModel(model, assets);
  const { width, depth } = model.footprint;
  const w = prop.rotation % 2 ? depth : width,
    d = prop.rotation % 2 ? width : depth;
  g.position.set(
    (prop.cell.x + w / 2 - grid.width / 2) * grid.cellSize,
    0.025,
    (prop.cell.z + d / 2 - grid.depth / 2) * grid.cellSize,
  );
  g.rotation.y = (-prop.rotation * Math.PI) / 2;
  g.traverse((object) => {
    object.userData.propId = prop.id;
  });
  return g;
}
