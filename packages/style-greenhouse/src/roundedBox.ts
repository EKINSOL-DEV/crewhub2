/* A rounded box with exactly the positions, normals and UVs of three.js's `RoundedBoxGeometry`, built faster: the
   vertices are moved on the indexed box (each face's grid vertex once, not once per triangle corner), and the arc UVs
   are worked out inline instead of through `Vector3.angleTo`. The town builds hundreds of distinct boxes before its
   first frame, and the addon's per-corner work was the largest single cost of that. */
import * as THREE from "three";

const HALF_ARC = Math.PI / 4;
type Axis = 0 | 1 | 2;

/**
 * The addon's `getUv`: how far along a face's rounded edge, arc and flat middle together, a vertex lies. `n` is the
 * vertex normal, `face` and `sign` the face's axis and direction, `along` the UV's axis and `across` the axis that is
 * projected away.
 */
function arcUv(n: readonly number[], face: Axis, sign: number, along: Axis, across: Axis, radius: number, side: number): number {
  const arc = (2 * Math.PI * radius) / 4;
  const middle = Math.max(side - 2 * radius, 0);
  // The normal projected onto the plane across `across`, normalised (a zero vector stays zero, as in three.js).
  let tx = n[0]!,
    ty = n[1]!,
    tz = n[2]!;
  if (across === 0) tx = 0;
  else if (across === 1) ty = 0;
  else tz = 0;
  const length = Math.sqrt(tx * tx + ty * ty + tz * tz);
  const t = length ? [tx / length, ty / length, tz / length] : [0, 0, 0];
  // Vector3.angleTo against the unit face direction: half a right angle off the face when the projection is zero.
  const angle = length ? Math.acos(Math.min(1, Math.max(-1, t[face]! * sign))) : Math.PI / 2;
  const arcShare = (0.5 * arc) / (arc + middle);
  const ratio = 1 - angle / HALF_ARC;
  if (Math.sign(t[along]!) === 1) return ratio * arcShare;
  return middle / (arc + middle) + arcShare + arcShare * (1 - ratio);
}

/** The UV rules per face, in BoxGeometry's face order (+x, -x, +y, -y, +z, -z), as the addon writes them. */
const FACES: { face: Axis; sign: number; u: [Axis, Axis, boolean]; v: [Axis, Axis, boolean] }[] = [
  { face: 0, sign: 1, u: [2, 1, false], v: [1, 2, true] },
  { face: 0, sign: -1, u: [2, 1, true], v: [1, 2, true] },
  { face: 1, sign: 1, u: [0, 2, true], v: [2, 0, false] },
  { face: 1, sign: -1, u: [0, 2, true], v: [2, 0, true] },
  { face: 2, sign: 1, u: [0, 1, true], v: [1, 0, true] },
  { face: 2, sign: -1, u: [0, 1, false], v: [1, 0, true] },
];

/** Same arguments and result as `new RoundedBoxGeometry(width, height, depth, segments, radius)`, but indexed. */
export function roundedBoxGeometry(width: number, height: number, depth: number, segments: number, radius: number): THREE.BufferGeometry {
  const total = segments * 2 + 1;
  radius = Math.min(width / 2, height / 2, depth / 2, radius);
  const geometry = new THREE.BoxGeometry(1, 1, 1, total, total, total);
  if (total === 1) {
    geometry.scale(width, height, depth);
    return geometry;
  }
  const size = [width, height, depth];
  const box = [width / 2 - radius, height / 2 - radius, depth / 2 - radius];
  const positions = geometry.attributes.position!.array as Float32Array;
  const normals = geometry.attributes.normal!.array as Float32Array;
  const uvs = geometry.attributes.uv!.array as Float32Array;
  const perFace = (total + 1) * (total + 1);
  const half = 0.5 / total;
  const n = [0, 0, 0];
  for (let v = 0; v < positions.length / 3; v++) {
    const i = v * 3;
    const px = positions[i]!,
      py = positions[i + 1]!,
      pz = positions[i + 2]!;
    let nx = px - Math.sign(px) * half,
      ny = py - Math.sign(py) * half,
      nz = pz - Math.sign(pz) * half;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    positions[i] = box[0]! * Math.sign(px) + nx * radius;
    positions[i + 1] = box[1]! * Math.sign(py) + ny * radius;
    positions[i + 2] = box[2]! * Math.sign(pz) + nz * radius;
    normals[i] = nx;
    normals[i + 1] = ny;
    normals[i + 2] = nz;
    n[0] = nx;
    n[1] = ny;
    n[2] = nz;
    const rule = FACES[Math.floor(v / perFace)]!;
    const u = arcUv(n, rule.face, rule.sign, rule.u[0], rule.u[1], radius, size[rule.u[0]]!);
    const w = arcUv(n, rule.face, rule.sign, rule.v[0], rule.v[1], radius, size[rule.v[0]]!);
    uvs[v * 2] = rule.u[2] ? 1 - u : u;
    uvs[v * 2 + 1] = rule.v[2] ? 1 - w : w;
  }
  return geometry;
}
