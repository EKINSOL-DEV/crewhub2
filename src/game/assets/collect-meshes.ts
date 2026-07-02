// Instancing prep (M0 T4): flatten a kit model into standalone meshes whose
// geometry has the model-local transform baked in. drei's <Merged> can then
// instance each sub-mesh (trunk, leaves, …) once per placement.
import * as THREE from "three";

export function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  root.updateWorldMatrix(true, true);
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = (obj.geometry as THREE.BufferGeometry).clone();
    geometry.applyMatrix4(obj.matrixWorld);
    const mesh = new THREE.Mesh(geometry, obj.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.push(mesh);
  });
  return out;
}
