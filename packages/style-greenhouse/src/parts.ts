/* The shared parts renderer (moved from apps/world/src/world/partsModel.ts): draws a validated crewhub-prop/1 model
   with the kit's shared geometry and materials. The style's own data models use it too. A model tagged
   `accent-<material>` draws the parts of that material in the caller's accent colour (a project colour on a flag); a
   look (looks.ts) may swap part materials for other swatches. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PROP_LIMITS, type PropModel, type PropPart } from "@crewhub/world-engine";
import type { PaletteName, StaticPart } from "@crewhub/world-style";
import type { Kit } from "./kit.ts";
import { PartsNode } from "./partsNode.ts";

const DEG = Math.PI / 180;
/* Small parts at full detail cost most of a room's triangles (a calendar's day squares, a plant's leaves) and read the
   same with less: a box whose bevel is a centimetre or less is a plain box, a small sphere or cylinder has fewer sides. */
const PLAIN_BEVEL = 0.012;
const SMALL_SPHERE = 0.05;
const SMALL_CYLINDER = 0.04;

/** The shape of a part: the kit's shared geometry and material for it, and the scale a sphere part takes. */
function partShape(kit: Kit, part: Pick<PropPart, "shape" | "size" | "radius" | "sweep"> & Partial<Pick<PropPart, "emissive" | "material">>, color: string): { geometry: THREE.BufferGeometry; material: THREE.Material; scale: readonly [number, number, number] | null } {
  const [a, b, c] = part.size;
  let geometry: THREE.BufferGeometry;
  let scale: readonly [number, number, number] | null = null;
  switch (part.shape) {
    case "box": {
      const radius = part.radius ?? PROP_LIMITS.cornerRadiusDefault;
      geometry = Math.min(radius, a / 3, b / 3, c / 3) <= PLAIN_BEVEL ? kit.geometry(`prop-plain-box:${a},${b},${c}`, () => new THREE.BoxGeometry(a, b, c)) : kit.boxGeometry(a, b, c, radius);
      break;
    }
    case "cylinder":
      geometry = Math.max(a, c) <= SMALL_CYLINDER ? kit.geometry(`prop-small-cylinder:${a},${c},${b}`, () => new THREE.CylinderGeometry(a, c, b, 10)) : kit.cylinderGeometry(a, c, b);
      break;
    case "cone":
      geometry = kit.cylinderGeometry(0, a, b);
      break;
    case "sphere":
      geometry = Math.max(a, b, c) <= SMALL_SPHERE ? kit.geometry("prop-small-sphere", () => new THREE.SphereGeometry(1, 8, 6)) : kit.sphereGeometry(1);
      scale = [a, b, c];
      break;
    case "torus":
      geometry = kit.geometry(`prop-torus:${a},${b}`, () => new THREE.TorusGeometry(a, b, 10, 32).rotateX(Math.PI / 2));
      break;
    case "wedge": {
      const sweep = part.sweep ?? 360;
      geometry = kit.geometry(`prop-wedge:${a},${b},${c},${sweep}`, () => wedgeGeometry(a, c, b, sweep));
      break;
    }
  }
  // The plain material is made (and kept by the kit) before a glow or glass takes its place, as it always was.
  let material: THREE.Material = kit.material(color);
  if (part.emissive) material = kit.material(color, { glow: 0.6 });
  else if (part.material === "glass") material = kit.material(color, { transparent: 0.55 });
  return { geometry, material, scale };
}

/** A part as a mesh (the figure kits draw their figures this way). */
export function partMesh(kit: Kit, part: Pick<PropPart, "shape" | "size" | "position" | "rotation" | "radius" | "sweep"> & Partial<Pick<PropPart, "emissive" | "material">>, color: string): THREE.Mesh {
  const { geometry, material, scale } = partShape(kit, part, color);
  const mesh = kit.mesh(geometry, material);
  if (scale) mesh.scale.set(...scale);
  mesh.position.set(...part.position);
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
  mesh.rotation.set(rx * DEG, ry * DEG, rz * DEG, "XYZ");
  return mesh;
}

/**
 * A part as data (`StaticPart`): the same geometry, material, position, rotation and scale `partMesh` gives its mesh,
 * and the matrix that mesh would compose from them, so a batcher reading the part draws what the mesh would have.
 */
export function staticPart(kit: Kit, part: Pick<PropPart, "shape" | "size" | "position" | "rotation" | "radius" | "sweep"> & Partial<Pick<PropPart, "emissive" | "material">>, color: string): StaticPart {
  const { geometry, material, scale } = partShape(kit, part, color);
  const position = new THREE.Vector3(...part.position);
  const [rx, ry, rz] = part.rotation ?? [0, 0, 0];
  const rotation = new THREE.Euler(rx * DEG, ry * DEG, rz * DEG, "XYZ");
  const size = scale ? new THREE.Vector3(...scale) : new THREE.Vector3(1, 1, 1);
  const matrix = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), size);
  return { geometry, material, position, rotation, scale: size, matrix, castShadow: true, receiveShadow: true };
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

/**
 * The model's origin is the footprint centre on the floor; the front faces +z. Pass only validated models. The node
 * holds its parts as data (`StaticParts`, world-style): read `children` or draw it and they are meshes.
 */
export function partsModel(model: PropModel, kit: Kit, accent: PaletteName | null = null, swap: Record<string, string> | null = null): PartsNode {
  const accented = model.tags.find((t) => t.startsWith("accent-"))?.slice("accent-".length) ?? null;
  const parts: StaticPart[] = [];
  for (const part of model.parts) {
    // A look may swap materials for swatches of its own (blossom for leaves); the caller's accent still wins.
    const color = accent && part.material === accented ? accent : (swap?.[part.material] ?? part.material);
    parts.push(staticPart(kit, part, color));
  }
  // The parts as data, not a mesh each (partsNode.ts): the batchers read them, anyone else gets the meshes.
  const g = new PartsNode(parts);
  g.name = model.id;
  return g;
}
