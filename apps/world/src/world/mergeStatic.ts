/* Static batching: a building's shell and furniture never move, so their meshes are baked into merged meshes.
   Style-agnostic: it works on whatever the style returned. Meshes that must stay pickable (room floors carry
   `userData.room`), moving parts (`userData.live`), instanced meshes and meshes with attributes of their own (a
   style's decals) are kept as they are.

   Plain opaque materials that differ only by colour (a chalk wall, a timber trim, a sage sill) merge into one mesh
   per look: each vertex carries its source material's index, and the merged material reads the colour from a palette
   of the source materials' own colour objects, so a theme change that re-colours them shows at once. Other materials
   (a style's shader, glass, a glowing window) merge per material, as before.

   A model that holds its parts as data (`StaticParts`, @crewhub/world-style) is read as data: each part joins its
   batch with the matrix its mesh would have had, and never becomes a mesh here. */
import * as THREE from "three";
import { staticPartsOf, type StaticPart, type StaticPartsHolder } from "@crewhub/world-style";

const MERGED = ["position", "normal", "uv"];
/** Colours per palette batch; a look with more starts another batch. */
const PALETTE = 32;
const MAPS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "lightMap", "alphaMap", "bumpMap", "displacementMap", "envMap"] as const;

interface Batch {
  sources: Source[];
  shadow: boolean;
  /** Palette batches: the source materials, by palette index. */
  palette: THREE.MeshStandardMaterial[] | null;
  material: THREE.Material;
}

/**
 * The look of a material without its colour, when it can join a palette batch: a plain, opaque, untextured standard
 * material with no glow of its own (glowing materials change their emissive with the theme) and no shader changes.
 */
function look(material: THREE.Material, castShadow: boolean): string | null {
  if (material.type !== "MeshStandardMaterial") return null;
  const m = material as THREE.MeshStandardMaterial;
  if (m.transparent || m.vertexColors || m.wireframe || m.alphaTest > 0 || m.emissive.getHex() !== 0) return null;
  // A shader hook that only changes the lighting (the style names it in `userData.lightHook`) comes along; any other
  // (a pattern) keeps the material to itself.
  const hook = lightHook(m);
  if (hook === undefined) return null;
  if (MAPS.some((name) => m[name])) return null;
  return [hook ? hookId(hook) : 0, m.roughness, m.metalness, m.side, m.flatShading, m.depthWrite, m.depthTest, m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.toneMapped, m.fog, castShadow].join("|");
}

type Hook = THREE.Material["onBeforeCompile"];
const hookIds = new WeakMap<Hook, number>();
let hooks = 0;
function hookId(hook: Hook): number {
  let id = hookIds.get(hook);
  if (id === undefined) hookIds.set(hook, (id = ++hooks));
  return id;
}
/** The material's lighting hook, null for none, undefined for a hook of another kind. */
function lightHook(m: THREE.Material): Hook | null | undefined {
  if (m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) return null;
  return m.onBeforeCompile === m.userData.lightHook ? m.onBeforeCompile : undefined;
}

/** A white copy of `source` that takes each vertex's colour from `palette` (the source materials' live colours). */
function paletteMaterial(source: THREE.MeshStandardMaterial, palette: THREE.MeshStandardMaterial[]): THREE.MeshStandardMaterial {
  const material = source.clone();
  material.color.set(1, 1, 1);
  const colors = palette.map((m) => m.color);
  // The uniform array has a fixed size per program: pad it, so batches share a few programs.
  while (colors.length < PALETTE) colors.push(colors[0]!);
  const hook = lightHook(source);
  material.onBeforeCompile = (shader, renderer) => {
    hook?.call(material, shader, renderer);
    shader.uniforms.uPalette = { value: colors };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float aSwatch;\nuniform vec3 uPalette[${PALETTE}];\nvarying vec3 vSwatch;`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSwatch = uPalette[int(aSwatch + 0.5)];");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSwatch;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vSwatch;");
  };
  const key = `merge-palette-${PALETTE}-${hook ? hookId(hook) : 0}`;
  material.customProgramCacheKey = () => key;
  return material;
}

/**
 * Disposes `material` with `geometry`. A function of its own on purpose: a closure made inside `mergeStatic` would
 * share that call's scope and keep every source mesh and geometry of the merge alive for as long as the listener.
 */
function disposeWith(geometry: THREE.BufferGeometry, material: THREE.Material) {
  geometry.addEventListener("dispose", () => material.dispose());
}

/** After its upload the GPU holds the vertex data: the JS copy is let go (the docs' `onUpload` pattern). */
function release(this: THREE.BufferAttribute) {
  (this as unknown as { array: null }).array = null;
}

/**
 * Replaces the static meshes under `root` with merged meshes; returns the geometries it created (to dispose).
 * Disposing a palette batch's geometry also disposes the material made for it.
 *
 * The merged geometries keep their bounds but let their vertex data go once it is on the GPU, which is most of a
 * town's memory: nothing reads it again. `keepData` keeps it, for meshes that are picked (raycast) under `root`.
 * A palette batch carries no uv at all: its materials have no map.
 */
export function mergeStatic(root: THREE.Group, options: { keepData?: boolean } = {}): THREE.BufferGeometry[] {
  const steps = mergeStaticSteps(root, options);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

/** Source meshes a step of `mergeStaticSteps` writes before it yields. */
const MERGE_CHUNK = 150;

/** What is batched: a static mesh, or a part a model holds as data, each with the world matrix its mesh has or would have. */
export interface Piece {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrixWorld: THREE.Matrix4;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  /** What `mergeStatic` can bake: not live, not a room's pick target, no attributes of a style's own (a decal's shape). */
  mergeable: boolean;
  /** The mesh, or the holder and the part it came from. */
  mesh: THREE.Mesh | null;
  holder: StaticPartsHolder | null;
  part: StaticPart | null;
}

/** Only position, normal and uv: what a batch can take (a style's own attributes, a decal's shape, keep their mesh). */
const plainGeometry = (geometry: THREE.BufferGeometry) => Object.keys(geometry.attributes).every((name) => MERGED.includes(name));
/** Already merged, its vertex data on the GPU only: it stays as it is. */
const uploaded = (geometry: THREE.BufferGeometry) => !geometry.attributes.position?.array;

/**
 * The pieces under `root` in traversal order (a node, then its parts as data, then its children), without making a
 * mesh of any part: every plain mesh (not instanced, not with a material list) and every part, `all`; or only what
 * `mergeStatic` takes (`mergeable`, and the vertex data not yet on the GPU only). `root.updateMatrixWorld(true)`
 * first: a part's world matrix is its holder's times its own, as an update gives a mesh.
 */
export function staticPieces(root: THREE.Object3D, all = false): Piece[] {
  const pieces: Piece[] = [];
  const visit = (o: THREE.Object3D) => {
    const holder = staticPartsOf(o);
    if (holder) {
      for (const part of holder.staticParts) {
        const mergeable = plainGeometry(part.geometry);
        if (all || (mergeable && !uploaded(part.geometry))) pieces.push({ geometry: part.geometry, material: part.material, matrixWorld: new THREE.Matrix4().multiplyMatrices(holder.matrixWorld, part.matrix), castShadow: part.castShadow, receiveShadow: part.receiveShadow, renderOrder: 0, mergeable, mesh: null, holder, part });
      }
    } else if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && !Array.isArray(o.material)) {
      const mergeable = !o.userData.room && !o.userData.live && plainGeometry(o.geometry);
      if (all || (mergeable && !uploaded(o.geometry))) pieces.push({ geometry: o.geometry, material: o.material, matrixWorld: o.matrixWorld, castShadow: o.castShadow, receiveShadow: o.receiveShadow, renderOrder: o.renderOrder, mergeable, mesh: o, holder: null, part: null });
    }
    for (const child of holder ? holder.rawChildren : o.children) visit(child);
  };
  visit(root);
  return pieces;
}

/** A piece's shadow flag, written back to its mesh or its part. */
export function setCastShadow(piece: Piece, value: boolean) {
  piece.castShadow = value;
  if (piece.mesh) piece.mesh.castShadow = value;
  else if (piece.part) piece.part.castShadow = value;
}

/** A source mesh's place in its batch: its geometry, its transform into the root's space, its palette index. */
interface Source {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  swatch: number;
}

/** An index past this needs 32 bits (three's own rule for `setIndex`, PRIMITIVE_RESTART_FIXED_INDEX included). */
const UINT16_MAX_INDEX = 65535;

/* Scratch for the writes; used between two yields only, so two merges in steps (a dressing, an interior) can share it. */
const vertex = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();

/**
 * `mergeStatic` in steps, for a build spread over frames or idle time: the sources are gathered and batched first
 * (no vertex is touched), then each batch's arrays are allocated once and the sources are written into them
 * `MERGE_CHUNK` at a time, with a yield between; the result is the return value. The tree is unchanged until every
 * source is batched (nothing is taken out before). Each vertex is read from its source and written once, transformed
 * on the way (its position by the source's matrix, its normal by the normal matrix, as `applyMatrix4` does), instead of
 * a copy per source and then a copy per batch (`mergeGeometries`), which was most of the merge's time and garbage.
 */
export function* mergeStaticSteps(root: THREE.Group, options: { keepData?: boolean } = {}): Generator<void, THREE.BufferGeometry[]> {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const batches = new Map<unknown, Batch[]>();
  // Live meshes (a style's moving parts, `userData.live`) keep their own transforms; a mesh already merged, its vertex
  // data on the GPU only, stays as it is (staticPieces).
  const pieces = staticPieces(root);
  for (const o of pieces) {
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld);
    const material = o.material;
    const key = look(material, o.castShadow);
    const list = batches.get(key ?? material) ?? [];
    batches.set(key ?? material, list);
    let batch: Batch;
    let swatch = 0;
    if (key) {
      const standard = material as THREE.MeshStandardMaterial;
      batch = list.find((b) => b.palette!.includes(standard) || b.palette!.length < PALETTE) ?? list[list.push({ sources: [], shadow: o.castShadow, palette: [], material }) - 1]!;
      swatch = batch.palette!.indexOf(standard);
      if (swatch < 0) swatch = batch.palette!.push(standard) - 1;
    } else {
      if (!list.length) list.push({ sources: [], shadow: false, palette: null, material });
      batch = list[0]!;
      batch.shadow ||= o.castShadow;
    }
    batch.sources.push({ geometry: o.geometry, matrix, swatch });
  }
  yield;
  removeBaked(root, pieces);
  const created: THREE.BufferGeometry[] = [];
  let written = 0;
  for (const list of batches.values())
    for (const { sources, shadow, palette, material } of list) {
      yield;
      // The batch's arrays, sized once. Indexed throughout: a style's geometry shares its vertices between faces, so
      // transforming and uploading it costs a third of a non-indexed copy (the merge of an interior is the bulk of
      // entering a building). A palette batch has no map (see `look`), so nothing reads its uv: none is made, a
      // quarter of every vertex on the GPU and in the JS copy a hidden mesh (a wall's inside variant, an interior not
      // yet entered) keeps until its upload.
      let vertices = 0;
      let indices = 0;
      for (const { geometry } of sources) {
        const count = geometry.attributes.position!.count;
        vertices += count;
        indices += geometry.index ? geometry.index.count : count;
      }
      const position = new Float32Array(vertices * 3);
      const normal = new Float32Array(vertices * 3);
      const uv = palette ? null : new Float32Array(vertices * 2);
      const swatches = palette ? new Uint8Array(vertices) : null;
      const index = vertices > UINT16_MAX_INDEX ? new Uint32Array(indices) : new Uint16Array(indices);
      let vertexAt = 0;
      let indexAt = 0;
      for (const source of sources) {
        if (written > 0 && written % MERGE_CHUNK === 0) yield;
        written++;
        const { geometry, matrix, swatch } = source;
        const sourcePosition = geometry.attributes.position!;
        const count = sourcePosition.count;
        // A geometry without normals (none of the styles' as yet) gets them worked out as before: on a copy, before
        // the transform, so a non-uniform scale shades the same as it did.
        const sourceNormal = geometry.attributes.normal ?? computedNormals(geometry);
        normalMatrix.getNormalMatrix(matrix);
        if (plain(sourcePosition) && plain(sourceNormal)) transformPlain(sourcePosition.array, sourceNormal.array, count, matrix, normalMatrix, position, normal, vertexAt * 3);
        else
          for (let i = 0; i < count; i++) {
            const at = (vertexAt + i) * 3;
            vertex.fromBufferAttribute(sourcePosition, i).applyMatrix4(matrix);
            position[at] = vertex.x;
            position[at + 1] = vertex.y;
            position[at + 2] = vertex.z;
            vertex.fromBufferAttribute(sourceNormal, i).applyNormalMatrix(normalMatrix);
            normal[at] = vertex.x;
            normal[at + 1] = vertex.y;
            normal[at + 2] = vertex.z;
          }
        const sourceUv = geometry.attributes.uv;
        if (uv && sourceUv) {
          if (plain(sourceUv) && sourceUv.itemSize === 2) uv.set(sourceUv.array as ArrayLike<number>, vertexAt * 2);
          else
            for (let i = 0; i < count; i++) {
              uv[(vertexAt + i) * 2] = sourceUv.getX(i);
              uv[(vertexAt + i) * 2 + 1] = sourceUv.getY(i);
            }
        }
        swatches?.fill(swatch, vertexAt, vertexAt + count);
        const sourceIndex = geometry.index;
        if (sourceIndex) {
          const from = sourceIndex.array;
          for (let i = 0; i < sourceIndex.count; i++) index[indexAt + i] = from[i]! + vertexAt;
        } else for (let i = 0; i < count; i++) index[indexAt + i] = vertexAt + i;
        indexAt += sourceIndex ? sourceIndex.count : count;
        vertexAt += count;
      }
      if (!vertices) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
      geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
      if (uv) geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      // One byte a vertex: the palette index, read as a float by the shader.
      if (swatches) geometry.setAttribute("aSwatch", new THREE.BufferAttribute(swatches, 1));
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      if (!options.keepData) for (const attribute of Object.values(geometry.attributes)) (attribute as THREE.BufferAttribute).onUpload(release);
      let drawn = material;
      if (palette) {
        drawn = paletteMaterial(material as THREE.MeshStandardMaterial, palette);
        disposeWith(geometry, drawn);
      }
      const mesh = new THREE.Mesh(geometry, drawn);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      root.add(mesh);
      created.push(geometry);
    }
  return created;
}

/** A plain attribute: its own typed array, one value per component (not interleaved, not normalized). */
function plain(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): attribute is THREE.BufferAttribute {
  return attribute instanceof THREE.BufferAttribute && !attribute.normalized;
}

/**
 * `count` positions and normals of a plain source written to `position` and `normal` from `at`, transformed. The same
 * arithmetic, in the same order, as `Vector3.applyMatrix4` and `Vector3.applyNormalMatrix` (`applyMatrix3`, then
 * `normalize`: a divide by the length, or by 1 for a zero normal), so the result is the one those give, to the bit, at
 * a fraction of the calls per vertex (a town is a million of them).
 */
function transformPlain(from: ArrayLike<number>, fromNormal: ArrayLike<number>, count: number, matrix: THREE.Matrix4, normalMatrix: THREE.Matrix3, position: Float32Array, normal: Float32Array, at: number) {
  const e = matrix.elements;
  const n = normalMatrix.elements;
  for (let i = 0; i < count * 3; i += 3) {
    const x = from[i]!, y = from[i + 1]!, z = from[i + 2]!;
    const w = 1 / (e[3]! * x + e[7]! * y + e[11]! * z + e[15]!);
    position[at + i] = (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) * w;
    position[at + i + 1] = (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) * w;
    position[at + i + 2] = (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) * w;
    const nx = fromNormal[i]!, ny = fromNormal[i + 1]!, nz = fromNormal[i + 2]!;
    const tx = n[0]! * nx + n[3]! * ny + n[6]! * nz;
    const ty = n[1]! * nx + n[4]! * ny + n[7]! * nz;
    const tz = n[2]! * nx + n[5]! * ny + n[8]! * nz;
    const scale = 1 / (Math.sqrt(tx * tx + ty * ty + tz * tz) || 1);
    normal[at + i] = tx * scale;
    normal[at + i + 1] = ty * scale;
    normal[at + i + 2] = tz * scale;
  }
}

/** The vertex normals of a geometry that has none, worked out on a copy of its positions and index (its own is left alone). */
function computedNormals(geometry: THREE.BufferGeometry): THREE.BufferAttribute {
  const copy = new THREE.BufferGeometry();
  copy.setAttribute("position", geometry.attributes.position!.clone());
  if (geometry.index) copy.setIndex(geometry.index.clone());
  copy.computeVertexNormals();
  return copy.attributes.normal as THREE.BufferAttribute;
}

/**
 * Takes baked pieces out of the tree (a mesh from its parent, a part from its holder), then the groups they leave
 * empty (a style model's wrappers, a holder with nothing left): the renderer walks and updates every node each frame,
 * and the town has thousands of them. Groups with an animation hook stay.
 */
export function removeBaked(root: THREE.Object3D, pieces: readonly (Piece | THREE.Object3D)[]) {
  const parents = new Set<THREE.Object3D>();
  const taken = new Map<StaticPartsHolder, StaticPart[]>();
  const meshes: THREE.Object3D[] = [];
  for (const piece of pieces) {
    const mesh = piece instanceof THREE.Object3D ? piece : piece.mesh;
    if (mesh) meshes.push(mesh);
    else if (!(piece instanceof THREE.Object3D) && piece.holder && piece.part) {
      const list = taken.get(piece.holder) ?? [];
      list.push(piece.part);
      taken.set(piece.holder, list);
    }
  }
  // The parts first: a mesh taken out of a holder reads the holder's children, which would make meshes of parts
  // still there, and those parts were batched a moment ago.
  for (const [holder, parts] of taken) {
    holder.takeParts(parts);
    parents.add(holder);
  }
  for (const mesh of meshes) {
    if (mesh.parent) parents.add(mesh.parent);
    mesh.removeFromParent();
  }
  // Emptiness read without materialising a holder's parts (its `children` would make meshes of what is left).
  const empty = (node: THREE.Object3D) => {
    const holder = staticPartsOf(node);
    return holder ? holder.staticParts.length === 0 && holder.rawChildren.length === 0 : node.children.length === 0;
  };
  for (let node of parents) {
    while (node !== root && empty(node) && (node.type === "Group" || node.type === "Object3D") && !node.userData.animate && node.parent) {
      const parent: THREE.Object3D = node.parent;
      node.removeFromParent();
      node = parent;
    }
  }
}
