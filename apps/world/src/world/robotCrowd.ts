/* The far robots as a crowd: seen from the town a robot is a few pixels tall, and a hundred of them as full models
   are most of the town's draw calls. Each frame the crowd copies the parts of every far robot into one InstancedMesh
   per part and material (body, head, arm, foot, the blob under the feet...). Parts of one shape that differ only by
   colour (a sage, an apricot and a lead's soft project tint) share one batch, with the colour as an instance colour; a
   glowing part batches by its material and draws through the material's instanced twin, so the day-night drift's
   emissive strength reaches it without a batch per value (round 41). Style-agnostic, like instanceStatic: it works on
   whatever meshes the style's robot handle holds.

   A robot the crowd draws keeps its own meshes, on a layer the camera does not render: they still pose, walk and
   animate as before, and come back as they are when the robot is near again (the entered building). Parts the crowd
   cannot batch (a translucent proxy's own materials, a halo's shader) stay on the default layer and draw as before.
   Robots in buildings the camera cannot see are not copied at all.

   A figure's parts are data on its joints until it is drawn near (world-style's `FigurePiece`, @crewhub/world-cast,
   round 23): the crowd reads them so, in the order a traverse of the meshes would give (a joint's child joints, then
   its parts), with the joint's world matrix times the part's own, which is the matrix its mesh has or would have; a
   part that has a mesh keeps it on the hidden layer as before. */
import * as THREE from "three";
import { figurePiecesOf, type FigurePiece } from "@crewhub/world-style";
import { instancedMaterial } from "./instancedMaterial.ts";

/** The layer for a far robot's own meshes: neither the camera nor the shadow cameras draw it. */
const HIDDEN = 31;
const WHITE = new THREE.Color(1, 1, 1);

/** The mesh and every parent up to the robot's root are visible. */
function shown(mesh: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = mesh; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === root) return true;
  }
  return true;
}

interface Batch {
  mesh: THREE.InstancedMesh;
  /** Each instance takes its part's colour (a white copy of the material); false: the material is shared as it is. */
  tinted: boolean;
  count: number;
}

/** What the crowd copies: a mesh of the robot's own (its contact shadow, a halo, a step), or a part held as data on its joint. */
interface Piece {
  mesh: THREE.Mesh | null;
  part: FigurePiece | null;
  holder: THREE.Object3D | null;
}
const meshOf = (piece: Piece): THREE.Mesh | null => (piece.part ? piece.part.mesh : piece.mesh);
const materialOf = (piece: Piece): THREE.Material | THREE.Material[] => (piece.part ? piece.part.material : piece.mesh!.material);
const geometryOf = (piece: Piece): THREE.BufferGeometry => (piece.part ? piece.part.geometry : piece.mesh!.geometry);
/** A standard material with an emissive colour: it glows, and its strength follows the day-night drift. */
const glowing = (material: THREE.Material): boolean => {
  const m = material as THREE.MeshStandardMaterial;
  return m.isMeshStandardMaterial === true && (m.emissive.r !== 0 || m.emissive.g !== 0 || m.emissive.b !== 0);
};
const scratch = new THREE.Matrix4();
/** The piece's world matrix now: a mesh's own, or the joint's times the part's (what a matrix update gives the mesh). */
const matrixOf = (piece: Piece): THREE.Matrix4 => (piece.part ? scratch.multiplyMatrices(piece.holder!.matrixWorld, piece.part.matrix) : piece.mesh!.matrixWorld);

export class RobotCrowd {
  readonly group = new THREE.Group();
  #batches = new Map<string, Batch>();
  #pieces = new WeakMap<THREE.Object3D, Piece[]>();
  /** Each part's batch key, kept while its material, emissive colour and strength stay the same (a theme change
      recolours the emissive and so gets a new key): building the key string per part per frame was most of the copy. */
  #keys = new WeakMap<object, { material: THREE.Material | THREE.Material[]; r: number; g: number; b: number; i: number; key: string | null }>();
  /** Robots the crowd draws this frame and the last, by root object. */
  #claimed = new Set<THREE.Object3D>();
  #next = new Set<THREE.Object3D>();
  /** Robots at rest (far and still): the parts the crowd draws for each, worked out once, each with its world matrix
      then (a resting robot is not walked by the matrix pass, so it cannot move); `hidden` when the robot's own objects
      are out of the render walk altogether (every part is in a batch). */
  #resting = new Map<THREE.Object3D, { parts: { key: string; piece: Piece; matrix: THREE.Matrix4 }[]; hidden: boolean }>();

  constructor() {
    this.group.name = "robot-crowd";
    this.group.matrixAutoUpdate = false;
  }

  begin() {
    for (const batch of this.#batches.values()) batch.count = 0;
  }

  /**
   * A far robot: drawn by the crowd. `seen` false (its building is off screen) skips the per-frame copy. `resting`
   * (it neither moves nor changes until the caller says otherwise) draws it from what the first resting frame found,
   * and takes its own objects out of the renderer's walk when the crowd draws every part of it.
   */
  add(robot: THREE.Object3D, seen: boolean, resting = false) {
    this.#next.add(robot);
    const pieces = this.#piecesOf(robot);
    const fresh = !this.#claimed.has(robot);
    let rest = this.#resting.get(robot);
    if (rest && (!resting || !seen)) {
      this.#wake(robot);
      rest = undefined;
    }
    if (rest) {
      for (const { key, piece, matrix } of rest.parts) {
        const batch = this.#batch(key, piece);
        batch.mesh.setMatrixAt(batch.count, matrix);
        if (batch.tinted) batch.mesh.setColorAt(batch.count, (materialOf(piece) as THREE.MeshStandardMaterial).color);
        batch.count++;
      }
      return;
    }
    if (!seen) {
      // Off screen: hide what the crowd would draw, so the robot costs nothing until it is seen again.
      if (fresh) for (const piece of pieces) if (this.#key(piece)) meshOf(piece)?.layers.set(HIDDEN);
      return;
    }
    // The robot's world matrices are current: TownScene's matrix pass (matrixPass.ts) runs just before the crowd.
    const drawn: { key: string; piece: Piece; matrix: THREE.Matrix4 }[] | null = resting ? [] : null;
    let own = false;
    for (const piece of pieces) {
      const visible = piece.part ? piece.part.visible && shown(piece.holder!, robot) : shown(piece.mesh!, robot);
      const key = visible ? this.#key(piece) : null;
      if (!key) {
        // A part the crowd cannot batch (or a hidden one) draws, or hides, as the robot says.
        meshOf(piece)?.layers.set(0);
        if (visible) own = true;
        continue;
      }
      meshOf(piece)?.layers.set(HIDDEN);
      const batch = this.#batch(key, piece);
      const matrix = matrixOf(piece);
      batch.mesh.setMatrixAt(batch.count, matrix);
      if (batch.tinted) batch.mesh.setColorAt(batch.count, (materialOf(piece) as THREE.MeshStandardMaterial).color);
      batch.count++;
      drawn?.push({ key, piece, matrix: matrix.clone() });
    }
    if (drawn && robot.visible) {
      // Nothing of its own left to draw (no translucent proxy, no halo): the renderer need not walk it.
      this.#resting.set(robot, { parts: drawn, hidden: !own });
      if (!own) robot.visible = false;
    }
  }

  #wake(robot: THREE.Object3D) {
    const rest = this.#resting.get(robot);
    if (!rest) return;
    this.#resting.delete(robot);
    if (rest.hidden) robot.visible = true;
  }

  /** Uploads the frame's instances and gives robots that are near again their own meshes back. */
  end() {
    for (const robot of this.#claimed) if (!this.#next.has(robot)) this.#release(robot);
    [this.#claimed, this.#next] = [this.#next, this.#claimed];
    this.#next.clear();
    for (const batch of this.#batches.values()) {
      const mesh = batch.mesh;
      mesh.count = batch.count;
      mesh.visible = batch.count > 0;
      if (!batch.count) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  #release(robot: THREE.Object3D) {
    this.#wake(robot);
    for (const piece of this.#piecesOf(robot)) meshOf(piece)?.layers.set(0);
  }

  /**
   * The robot's pieces, once, in the order a traverse of its meshes gives: a node, its children in order, and the
   * parts a joint holds as data after its child joints (where the meshes it makes of them go). A part's mesh, made
   * later, is the part's: it is read through the piece, never counted twice.
   */
  #piecesOf(robot: THREE.Object3D): Piece[] {
    let pieces = this.#pieces.get(robot);
    if (!pieces) {
      const out: Piece[] = [];
      const visit = (o: THREE.Object3D) => {
        if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) out.push({ mesh: o, part: null, holder: null });
        const holder = figurePiecesOf(o);
        for (const child of o.children) if (!holder || !holder.figurePieces.some((p) => p.mesh === child)) visit(child);
        if (holder) for (const part of holder.figurePieces) out.push({ mesh: null, part, holder });
      };
      visit(robot);
      this.#pieces.set(robot, (pieces = out));
    }
    return pieces;
  }

  /**
   * The batch a part goes into, or null when it cannot be batched. A plain opaque standard material batches by its
   * look without the colour (the colour rides each instance); a style's ground decal (`userData.decal`, whose shader
   * reads the instance matrix) batches by its own material. Anything else draws on its own.
   */
  #key(piece: Piece): string | null {
    const material = materialOf(piece);
    const cached = this.#keys.get(piece.part ?? piece.mesh!);
    const e = (material as THREE.MeshStandardMaterial).emissive,
      i = (material as THREE.MeshStandardMaterial).emissiveIntensity ?? 0;
    const r = e?.r ?? 0,
      g = e?.g ?? 0,
      b = e?.b ?? 0;
    if (cached && cached.material === material && cached.r === r && cached.g === g && cached.b === b && cached.i === i) return cached.key;
    const key = this.#makeKey(piece);
    this.#keys.set(piece.part ?? piece.mesh!, { material, r, g, b, i, key });
    return key;
  }

  #makeKey(piece: Piece): string | null {
    const material = materialOf(piece);
    if (Array.isArray(material)) return null;
    const geometry = geometryOf(piece);
    if (piece.mesh?.userData.decal) return `${geometry.uuid}|${material.uuid}`;
    if (!(material instanceof THREE.MeshStandardMaterial) || material.type !== "MeshStandardMaterial") return null;
    // A shader hook that only changes the lighting (the style names it in `userData.lightHook`) batches; any other
    // hook (a pattern) draws on its own.
    const hook = material.onBeforeCompile;
    if (material.transparent || material.map || (hook !== THREE.Material.prototype.onBeforeCompile && hook !== material.userData.lightHook)) return null;
    // A glowing part (an emissive colour) batches by its own material and draws through that material's instanced twin,
    // which reads the emissive strength from the source. The day-night drift moves that strength in place a few times a
    // second (the kit's setLight), and a key that carried it made a new batch, with a cloned material and an InstancedMesh
    // that `#batches` never drops, for every value it passed (round 41: about a thousand an hour with the potlings or
    // the sprouts chosen). Parts of one shape and one glowing material have one colour anyway, so no instance colour is
    // missed. A black emissive adds nothing to a frame whatever its strength, so the key of a plain part leaves both out.
    if (glowing(material)) return `${geometry.uuid}|${material.uuid}`;
    return `${geometry.uuid}|${material.roughness}|${material.metalness}|${material.side}`;
  }

  #batch(key: string, piece: Piece): Batch {
    let batch = this.#batches.get(key);
    if (batch && batch.count < batch.mesh.instanceMatrix.count) return batch;
    const capacity = batch ? batch.mesh.instanceMatrix.count * 2 : 16;
    const source = materialOf(piece) as THREE.Material;
    // A decal and a glowing part share their source's twin (the near robots draw the source itself); the rest draw a white copy.
    const tinted = !piece.mesh?.userData.decal && !glowing(source);
    let material = batch?.mesh.material as THREE.Material | undefined;
    if (!material) {
      if (tinted) {
        // White, so the instance colour is the part's colour.
        const white = (source as THREE.MeshStandardMaterial).clone();
        white.color.copy(WHITE);
        white.onBeforeCompile = source.onBeforeCompile;
        material = white;
      } else material = instancedMaterial(source);
    }
    const instanced = new THREE.InstancedMesh(geometryOf(piece), material, capacity);
    instanced.frustumCulled = false;
    instanced.castShadow = false;
    instanced.receiveShadow = piece.part ? piece.part.receiveShadow : piece.mesh!.receiveShadow;
    instanced.renderOrder = piece.mesh?.renderOrder ?? 0;
    instanced.matrixAutoUpdate = false;
    instanced.count = 0;
    if (batch) {
      // Keep what this frame copied so far.
      instanced.instanceMatrix.array.set(batch.mesh.instanceMatrix.array);
      if (batch.mesh.instanceColor) {
        instanced.setColorAt(0, WHITE);
        instanced.instanceColor!.array.set(batch.mesh.instanceColor.array);
      }
      batch.mesh.removeFromParent();
      batch.mesh.dispose();
    }
    batch = { mesh: instanced, tinted, count: batch?.count ?? 0 };
    this.#batches.set(key, batch);
    this.group.add(instanced);
    return batch;
  }

  dispose() {
    for (const robot of [...this.#resting.keys()]) this.#wake(robot);
    for (const robot of this.#claimed) this.#release(robot);
    this.#claimed.clear();
    for (const batch of this.#batches.values()) {
      batch.mesh.dispose();
      if (batch.tinted) (batch.mesh.material as THREE.Material).dispose();
    }
    this.#batches.clear();
    this.group.removeFromParent();
  }
}
