/* The shared parts renderer (moved from apps/world/src/world/partsModel.ts): draws a validated crewhub-prop/1 model
   with the kit's shared geometry and materials. The style's own data models use it too. A model tagged
   `accent-<material>` draws the parts of that material in the caller's accent colour (a project colour on a flag). */
import * as THREE from "three";
import { PROP_LIMITS, type PropModel, type PropPart } from "@crewhub/world-engine";
import type { PaletteName } from "@crewhub/world-style";
import type { Kit } from "./kit.ts";

const DEG = Math.PI / 180;

function partMesh(kit: Kit, part: PropPart, color: string): THREE.Mesh {
  const [a, b, c] = part.size;
  let mesh: THREE.Mesh;
  switch (part.shape) {
    case "box":
      mesh = kit.box(a, b, c, color, part.radius ?? PROP_LIMITS.cornerRadiusDefault);
      break;
    case "cylinder":
      mesh = kit.cylinder(a, c, b, color);
      break;
    case "cone":
      mesh = kit.cylinder(0, a, b, color);
      break;
    case "sphere":
      mesh = kit.sphere(1, color);
      mesh.scale.set(a, b, c);
      break;
    case "torus":
      mesh = kit.mesh(
        kit.geometry(`prop-torus:${a},${b}`, () => new THREE.TorusGeometry(a, b, 10, 32).rotateX(Math.PI / 2)),
        kit.material(color),
      );
      break;
  }
  if (part.emissive) mesh.material = kit.material(color, { glow: 0.6 });
  else if (part.material === "glass") mesh.material = kit.material(color, { transparent: 0.55 });
  mesh.position.set(...part.position);
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
  mesh.rotation.set(rx * DEG, ry * DEG, rz * DEG, "XYZ");
  return mesh;
}

/** The group's origin is the footprint centre on the floor; the front faces +z. Pass only validated models. */
export function partsModel(model: PropModel, kit: Kit, accent: PaletteName | null = null): THREE.Group {
  const g = new THREE.Group();
  g.name = model.id;
  const accented = model.tags.find((t) => t.startsWith("accent-"))?.slice("accent-".length) ?? null;
  for (const part of model.parts) {
    const color = accent && part.material === accented ? accent : part.material;
    g.add(partMesh(kit, part, color));
  }
  return g;
}
