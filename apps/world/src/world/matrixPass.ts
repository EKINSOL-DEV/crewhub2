/* Matrix updates for what moved. three's own pass (`scene.updateMatrixWorld()`, run by every render) composes the local
   matrix of every object with `matrixAutoUpdate` and, because composing marks the world matrix stale, multiplies every
   world matrix too: thousands of static town and building parts, every drawn frame. This pass does the same walk but
   composes an object only when its position, rotation or scale changed since the last compose, and multiplies its
   world matrix only when it or an ancestor changed (or someone marked `matrixWorldNeedsUpdate`).

   Nothing has to be declared static or moving: a lift, a wall swap, a walking robot, the windmill's sails or the
   fountain move as before, because whatever writes a position, a rotation or a scale is seen on the next frame. Code
   that writes `matrix` itself keeps working the three way: `matrixAutoUpdate = false` and `matrixWorldNeedsUpdate`.
   TownScene turns three's pass off for its scene (`matrixWorldAutoUpdate = false`) and runs this before each render. */
import * as THREE from "three";

/** The transform an object's matrix was last composed from (position, quaternion, scale), kept on the object itself:
    a WeakMap lookup per object per frame cost more than the compose it saves. */
type Tracked = THREE.Object3D & { __composed?: Float64Array; __rest?: boolean };

/**
 * Puts a subtree to rest, or wakes it. A resting subtree is not walked at all (a far figure that neither walks nor
 * changes: two hundred of them are most of the scene's objects), unless an ancestor moved. Whoever rests it knows
 * nothing inside changes; waking it brings everything up to date on the next pass, as for any other object.
 */
export function restMatrices(root: THREE.Object3D, rest: boolean) {
  (root as Tracked).__rest = rest;
}

/** Brings every world matrix under `root` up to date, recomputing only what moved. Returns the matrices composed. */
export function updateMatrices(root: THREE.Object3D): number {
  return visit(root, false);
}

function visit(o: THREE.Object3D, parentChanged: boolean): number {
  if ((o as Tracked).__rest === true && !parentChanged) return 0;
  let count = 0;
  let changed = parentChanged || o.matrixWorldNeedsUpdate;
  if (o.matrixAutoUpdate && (o.pivot !== null || moved(o))) {
    o.updateMatrix();
    count++;
    changed = true;
  }
  if (changed) {
    if (o.matrixWorldAutoUpdate) {
      if (o.parent === null) o.matrixWorld.copy(o.matrix);
      else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
    }
    o.matrixWorldNeedsUpdate = false;
  }
  const children = o.children;
  for (let i = 0, n = children.length; i < n; i++) count += visit(children[i]!, changed);
  return count;
}

/** True (and remembered) when the object's position, rotation or scale differs from its last compose. */
function moved(o: THREE.Object3D): boolean {
  const p = o.position,
    q = o.quaternion,
    s = o.scale;
  let last = (o as Tracked).__composed;
  if (!last) {
    (o as Tracked).__composed = last = new Float64Array(10);
    last.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z]);
    return true;
  }
  if (last[0] === p.x && last[1] === p.y && last[2] === p.z && last[3] === q.x && last[4] === q.y && last[5] === q.z && last[6] === q.w && last[7] === s.x && last[8] === s.y && last[9] === s.z)
    return false;
  last[0] = p.x;
  last[1] = p.y;
  last[2] = p.z;
  last[3] = q.x;
  last[4] = q.y;
  last[5] = q.z;
  last[6] = q.w;
  last[7] = s.x;
  last[8] = s.y;
  last[9] = s.z;
  return true;
}
