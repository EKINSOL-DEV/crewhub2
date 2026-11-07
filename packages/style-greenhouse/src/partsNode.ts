/* A data model as one node holding its parts as data (the `StaticParts` convention of @crewhub/world-style), not a
   mesh per part: a town builds its models in the thousands, and three's Object3D (its uuid, its id property, three
   vectors, an Euler, a quaternion, two matrices, layers) was most of what the models cost before the first frame, for
   meshes the batchers took apart again at once. The batchers read `staticParts` and `rawChildren`; everyone else
   reads `children`, which first makes the parts into the meshes the style made before (`materialise`), in front of
   the node's other children, with their world matrices as an update of the node would have left them. Matrix updates
   from above (`updateMatrixWorld`, `updateWorldMatrix`) and `add` never materialise: a decal or a water sheet added
   to a model, or a dressing's matrix pass, leaves the parts as data. */
import * as THREE from "three";
import type { StaticPart, StaticPartsHolder } from "@crewhub/world-style";

export class PartsNode extends THREE.Group implements StaticPartsHolder {
  staticParts: StaticPart[];
  #raw: THREE.Object3D[];

  constructor(parts: StaticPart[] = []) {
    super();
    this.staticParts = parts;
    this.#raw = this.children;
    Object.defineProperty(this, "children", {
      configurable: true,
      enumerable: true,
      get: (): THREE.Object3D[] => {
        this.materialise();
        return this.#raw;
      },
      set: (value: THREE.Object3D[]) => {
        this.#raw = value;
      },
    });
  }

  get rawChildren(): readonly THREE.Object3D[] {
    return this.#raw;
  }

  takeParts(parts: Iterable<StaticPart>): void {
    const taken = new Set(parts);
    this.staticParts = this.staticParts.filter((part) => !taken.has(part));
  }

  /**
   * The parts as meshes, once, in front of the node's other children: the mesh the kit makes (shadows cast and
   * received), at the part's position, rotation and scale, its world matrix as the node's last update would have
   * left it (a model updated before it was looked at reads the same as one made of meshes).
   */
  materialise(): void {
    const parts = this.staticParts;
    if (parts.length === 0) return;
    this.staticParts = [];
    const meshes = parts.map((part) => {
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.castShadow = part.castShadow;
      mesh.receiveShadow = part.receiveShadow;
      mesh.position.copy(part.position);
      mesh.rotation.copy(part.rotation);
      mesh.scale.copy(part.scale);
      mesh.parent = this;
      mesh.updateMatrix();
      mesh.matrixWorld.multiplyMatrices(this.matrixWorld, mesh.matrix);
      mesh.matrixWorldNeedsUpdate = false;
      return mesh;
    });
    this.#raw = [...meshes, ...this.#raw];
  }

  override add(...objects: THREE.Object3D[]): this {
    for (const object of objects) {
      if (object === this || !object?.isObject3D) {
        super.add(object);
        continue;
      }
      object.removeFromParent();
      object.parent = this;
      this.#raw.push(object);
      object.dispatchEvent({ type: "added" });
      this.dispatchEvent({ type: "childadded", child: object });
    }
    return this;
  }

  /* three's own, over the raw children: a matrix update never materialises the parts. */
  override updateMatrixWorld(force?: boolean): void {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.matrixWorldAutoUpdate === true) {
        if (this.parent === null) this.matrixWorld.copy(this.matrix);
        else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = this.#raw;
    for (let i = 0, l = children.length; i < l; i++) children[i]!.updateMatrixWorld(force);
  }

  override updateWorldMatrix(updateParents: boolean, updateChildren: boolean, force = false): void {
    const parent = this.parent;
    if (updateParents === true && parent !== null) parent.updateWorldMatrix(true, false);
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.matrixWorldAutoUpdate === true) {
        if (this.parent === null) this.matrixWorld.copy(this.matrix);
        else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }
      this.matrixWorldNeedsUpdate = false;
      force = true;
    }
    if (updateChildren === true) {
      const children = this.#raw;
      for (let i = 0, l = children.length; i < l; i++) children[i]!.updateWorldMatrix(false, true, force);
    }
  }
}
