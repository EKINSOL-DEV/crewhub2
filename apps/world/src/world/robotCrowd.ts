/* The far robots as a crowd: seen from the town a robot is a few pixels tall, and a hundred of them as full models
   are most of the town's draw calls. Each frame the crowd copies the parts of every far robot into one InstancedMesh
   per part and material (body, head, arm, foot, the blob under the feet...). Parts of one shape that differ only by
   colour (a sage, an apricot and a lead's soft project tint) share one batch, with the colour as an instance colour.
   Style-agnostic, like instanceStatic: it works on whatever meshes the style's robot handle holds.

   A robot the crowd draws keeps its own meshes, on a layer the camera does not render: they still pose, walk and
   animate as before, and come back as they are when the robot is near again (the entered building). Parts the crowd
   cannot batch (a translucent proxy's own materials, a halo's shader) stay on the default layer and draw as before.
   Robots in buildings the camera cannot see are not copied at all. */
import * as THREE from "three";

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

export class RobotCrowd {
  readonly group = new THREE.Group();
  #batches = new Map<string, Batch>();
  #parts = new WeakMap<THREE.Object3D, THREE.Mesh[]>();
  /** Robots the crowd draws this frame and the last, by root object. */
  #claimed = new Set<THREE.Object3D>();
  #next = new Set<THREE.Object3D>();

  constructor() {
    this.group.name = "robot-crowd";
    this.group.matrixAutoUpdate = false;
  }

  begin() {
    for (const batch of this.#batches.values()) batch.count = 0;
  }

  /** A far robot: drawn by the crowd. `seen` false (its building is off screen) skips the per-frame copy. */
  add(robot: THREE.Object3D, seen: boolean) {
    this.#next.add(robot);
    const parts = this.#partsOf(robot);
    const fresh = !this.#claimed.has(robot);
    if (!seen) {
      // Off screen: hide what the crowd would draw, so the robot costs nothing until it is seen again.
      if (fresh) for (const mesh of parts) if (this.#key(mesh)) mesh.layers.set(HIDDEN);
      return;
    }
    robot.updateWorldMatrix(true, true);
    for (const mesh of parts) {
      const key = shown(mesh, robot) ? this.#key(mesh) : null;
      if (!key) {
        // A part the crowd cannot batch (or a hidden one) draws, or hides, as the robot says.
        mesh.layers.set(0);
        continue;
      }
      mesh.layers.set(HIDDEN);
      const batch = this.#batch(key, mesh);
      batch.mesh.setMatrixAt(batch.count, mesh.matrixWorld);
      if (batch.tinted) batch.mesh.setColorAt(batch.count, (mesh.material as THREE.MeshStandardMaterial).color);
      batch.count++;
    }
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
    for (const mesh of this.#partsOf(robot)) mesh.layers.set(0);
  }

  #partsOf(robot: THREE.Object3D): THREE.Mesh[] {
    let parts = this.#parts.get(robot);
    if (!parts) {
      parts = [];
      robot.traverse((o) => {
        if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) parts!.push(o);
      });
      this.#parts.set(robot, parts);
    }
    return parts;
  }

  /**
   * The batch a part goes into, or null when it cannot be batched. A plain opaque standard material batches by its
   * look without the colour (the colour rides each instance); a style's ground decal (`userData.decal`, whose shader
   * reads the instance matrix) batches by its own material. Anything else draws on its own.
   */
  #key(mesh: THREE.Mesh): string | null {
    const material = mesh.material;
    if (Array.isArray(material)) return null;
    if (mesh.userData.decal) return `${mesh.geometry.uuid}|${material.uuid}`;
    if (!(material instanceof THREE.MeshStandardMaterial) || material.type !== "MeshStandardMaterial") return null;
    if (material.transparent || material.map || material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return null;
    return `${mesh.geometry.uuid}|${material.roughness}|${material.metalness}|${material.emissive.getHexString()}|${material.emissiveIntensity}|${material.side}`;
  }

  #batch(key: string, mesh: THREE.Mesh): Batch {
    let batch = this.#batches.get(key);
    if (batch && batch.count < batch.mesh.instanceMatrix.count) return batch;
    const capacity = batch ? batch.mesh.instanceMatrix.count * 2 : 16;
    const source = mesh.material as THREE.Material;
    const tinted = !mesh.userData.decal;
    let material = batch?.mesh.material as THREE.Material | undefined;
    if (!material) {
      if (tinted) {
        // White, so the instance colour is the part's colour.
        const white = (source as THREE.MeshStandardMaterial).clone();
        white.color.copy(WHITE);
        material = white;
      } else material = source;
    }
    const instanced = new THREE.InstancedMesh(mesh.geometry, material, capacity);
    instanced.frustumCulled = false;
    instanced.castShadow = false;
    instanced.receiveShadow = mesh.receiveShadow;
    instanced.renderOrder = mesh.renderOrder;
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
