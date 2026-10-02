/* The shared parts renderer (moved from apps/world/src/world/partsModel.ts): draws a validated crewhub-prop/1 model
   with the kit's shared geometry and materials. The style's own data models use it too. A model tagged
   `accent-<material>` draws the parts of that material in the caller's accent colour (a project colour on a flag). */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PROP_LIMITS, type PropModel, type PropPart } from "@crewhub/world-engine";
import type { PaletteName } from "@crewhub/world-style";
import type { Kit } from "./kit.ts";

const DEG = Math.PI / 180;
/* Small parts at full detail cost most of a room's triangles (a calendar's day squares, a plant's leaves) and read the
   same with less: a box whose bevel is a centimetre or less is a plain box, a small sphere or cylinder has fewer sides. */
const PLAIN_BEVEL = 0.012;
const SMALL_SPHERE = 0.05;
const SMALL_CYLINDER = 0.04;

function partMesh(kit: Kit, part: PropPart, color: string): THREE.Mesh {
  const [a, b, c] = part.size;
  let mesh: THREE.Mesh;
  switch (part.shape) {
    case "box": {
      const radius = part.radius ?? PROP_LIMITS.cornerRadiusDefault;
      mesh =
        Math.min(radius, a / 3, b / 3, c / 3) <= PLAIN_BEVEL
          ? kit.mesh(kit.geometry(`prop-plain-box:${a},${b},${c}`, () => new THREE.BoxGeometry(a, b, c)), kit.material(color))
          : kit.box(a, b, c, color, radius);
      break;
    }
    case "cylinder":
      mesh =
        Math.max(a, c) <= SMALL_CYLINDER
          ? kit.mesh(kit.geometry(`prop-small-cylinder:${a},${c},${b}`, () => new THREE.CylinderGeometry(a, c, b, 10)), kit.material(color))
          : kit.cylinder(a, c, b, color);
      break;
    case "cone":
      mesh = kit.cylinder(0, a, b, color);
      break;
    case "sphere":
      mesh = Math.max(a, b, c) <= SMALL_SPHERE ? kit.mesh(kit.geometry("prop-small-sphere", () => new THREE.SphereGeometry(1, 8, 6)), kit.material(color)) : kit.sphere(1, color);
      mesh.scale.set(a, b, c);
      break;
    case "torus":
      mesh = kit.mesh(
        kit.geometry(`prop-torus:${a},${b}`, () => new THREE.TorusGeometry(a, b, 10, 32).rotateX(Math.PI / 2)),
        kit.material(color),
      );
      break;
    case "wedge": {
      const sweep = part.sweep ?? 360;
      mesh = kit.mesh(kit.geometry(`prop-wedge:${a},${b},${c},${sweep}`, () => wedgeGeometry(a, c, b, sweep)), kit.material(color));
      break;
    }
  }
  if (part.emissive) mesh.material = kit.material(color, { glow: 0.6 });
  else if (part.material === "glass") mesh.material = kit.material(color, { transparent: 0.55 });
  mesh.position.set(...part.position);
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
  mesh.rotation.set(rx * DEG, ry * DEG, rz * DEG, "XYZ");
  return mesh;
}

/**
 * A slice of an upright cylinder or cone, `sweep` degrees wide, starting on +x and turning towards -z (as a positive
 * y rotation turns). three.js measures theta from +z towards +x, so the slice starts at theta 90°. Below a full turn
 * the two cut faces close it, so a slice of cake or a pie-chart piece reads solid.
 */
export function wedgeGeometry(top: number, bottom: number, height: number, sweep: number): THREE.BufferGeometry {
  const length = Math.min(sweep, 360) * DEG;
  const segments = Math.max(2, Math.ceil((32 * sweep) / 360));
  const side = new THREE.CylinderGeometry(top, bottom, height, segments, 1, false, Math.PI / 2, length);
  if (sweep >= 360) return side;
  const body = side.toNonIndexed();
  side.dispose();
  const h = height / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  // Each cut face is the quad axis-top, rim-top, rim-bottom, axis-bottom at angle a, its normal pointing out of the slice.
  for (const [a, out] of [[0, -1], [length, 1]] as const) {
    const dx = Math.cos(a),
      dz = -Math.sin(a);
    const n = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)).multiplyScalar(out);
    const quad = [
      new THREE.Vector3(0, h, 0),
      new THREE.Vector3(top * dx, h, top * dz),
      new THREE.Vector3(bottom * dx, -h, bottom * dz),
      new THREE.Vector3(0, -h, 0),
    ];
    for (const [i, j, k] of [[0, 1, 2], [0, 2, 3]] as const) {
      let tri = [quad[i]!, quad[j]!, quad[k]!];
      const face = new THREE.Vector3().subVectors(tri[1]!, tri[0]!).cross(new THREE.Vector3().subVectors(tri[2]!, tri[0]!));
      if (face.dot(n) < 0) tri = [tri[0]!, tri[2]!, tri[1]!];
      for (const v of tri) {
        positions.push(v.x, v.y, v.z);
        normals.push(n.x, n.y, n.z);
        uvs.push(0, 0);
      }
    }
  }
  const cuts = new THREE.BufferGeometry();
  cuts.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  cuts.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  cuts.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const merged = mergeGeometries([body, cuts]) ?? body;
  if (merged !== body) body.dispose();
  cuts.dispose();
  return merged;
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
