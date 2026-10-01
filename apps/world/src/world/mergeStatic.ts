/* Static batching: a building's shell and furniture never move, so their meshes are baked into merged meshes.
   Style-agnostic: it works on whatever the style returned. Meshes that must stay pickable (room floors carry
   `userData.room`), moving parts (`userData.live`), instanced meshes and meshes with attributes of their own (a
   style's decals) are kept as they are.

   Plain opaque materials that differ only by colour (a chalk wall, a timber trim, a sage sill) merge into one mesh
   per look: each vertex carries its source material's index, and the merged material reads the colour from a palette
   of the source materials' own colour objects, so a theme change that re-colours them shows at once. Other materials
   (a style's shader, glass, a glowing window) merge per material, as before. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const MERGED = ["position", "normal", "uv"];
/** Colours per palette batch; a look with more starts another batch. */
const PALETTE = 32;
const MAPS = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "aoMap", "lightMap", "alphaMap", "bumpMap", "displacementMap", "envMap"] as const;

interface Batch {
  geometries: THREE.BufferGeometry[];
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
 */
export function mergeStatic(root: THREE.Group, options: { keepData?: boolean } = {}): THREE.BufferGeometry[] {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const batches = new Map<unknown, Batch[]>();
  const merged: THREE.Mesh[] = [];
  root.traverse((o) => {
    // Live meshes (a style's moving parts, `userData.live`) keep their own transforms.
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material) || o.userData.room || o.userData.live) return;
    if (Object.keys(o.geometry.attributes).some((name) => !MERGED.includes(name))) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld);
    const source = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!source.attributes.uv) source.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(source.attributes.position!.count * 2), 2));
    if (!source.attributes.normal) source.computeVertexNormals();
    source.applyMatrix4(matrix);
    const material = o.material as THREE.Material;
    const key = look(material, o.castShadow);
    const list = batches.get(key ?? material) ?? [];
    batches.set(key ?? material, list);
    if (key) {
      const standard = material as THREE.MeshStandardMaterial;
      let batch = list.find((b) => b.palette!.includes(standard) || b.palette!.length < PALETTE);
      if (!batch) list.push((batch = { geometries: [], shadow: o.castShadow, palette: [], material }));
      let index = batch.palette!.indexOf(standard);
      if (index < 0) index = batch.palette!.push(standard) - 1;
      // One byte a vertex: the palette index, read as a float by the shader.
      source.setAttribute("aSwatch", new THREE.BufferAttribute(new Uint8Array(source.attributes.position!.count).fill(index), 1));
      batch.geometries.push(source);
    } else {
      if (!list.length) list.push({ geometries: [], shadow: false, palette: null, material });
      list[0]!.geometries.push(source);
      list[0]!.shadow ||= o.castShadow;
    }
    merged.push(o);
  });
  removeBaked(root, merged);
  const created: THREE.BufferGeometry[] = [];
  for (const list of batches.values())
    for (const { geometries, shadow, palette, material } of list) {
      const geometry = mergeGeometries(geometries, false);
      for (const g of geometries) g.dispose();
      if (!geometry) continue;
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

/**
 * Takes baked meshes out of the tree, then the groups they leave empty (a style model's wrappers): the renderer walks
 * and updates every node each frame, and the town has thousands of them. Groups with an animation hook stay.
 */
export function removeBaked(root: THREE.Object3D, meshes: readonly THREE.Object3D[]) {
  const parents = new Set<THREE.Object3D>();
  for (const mesh of meshes) {
    if (mesh.parent) parents.add(mesh.parent);
    mesh.removeFromParent();
  }
  for (let node of parents) {
    while (node !== root && node.children.length === 0 && (node.type === "Group" || node.type === "Object3D") && !node.userData.animate && node.parent) {
      const parent: THREE.Object3D = node.parent;
      node.removeFromParent();
      node = parent;
    }
  }
}
