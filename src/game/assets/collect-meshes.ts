// Instancing prep (M0 T4): flatten a kit model into standalone meshes whose
// geometry has the model-local transform baked in. drei's <Merged> can then
// instance each sub-mesh (trunk, leaves, …) once per placement.
import * as THREE from "three";

/**
 * De-quantize a (possibly normalized-integer) attribute to plain float32.
 * The built GLBs use KHR_mesh_quantization (int16 positions, int8 normals);
 * baking a world matrix into those in place clamps every value at ±1 and
 * crushes the mesh into a box. getComponent() denormalizes on read.
 */
function toFloatAttribute(attr: THREE.BufferAttribute): THREE.BufferAttribute {
  if (!attr.normalized && attr.array instanceof Float32Array) {
    return attr.clone();
  }
  const out = new THREE.BufferAttribute(new Float32Array(attr.count * attr.itemSize), attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) {
      out.setComponent(i, c, attr.getComponent(i, c));
    }
  }
  return out;
}

export function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  root.updateWorldMatrix(true, true);
  const out: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = (obj.geometry as THREE.BufferGeometry).clone();
    const position = geometry.getAttribute("position");
    if (position instanceof THREE.BufferAttribute) {
      geometry.setAttribute("position", toFloatAttribute(position));
    }
    const normal = geometry.getAttribute("normal");
    if (normal instanceof THREE.BufferAttribute) {
      geometry.setAttribute("normal", toFloatAttribute(normal));
    }
    geometry.applyMatrix4(obj.matrixWorld);
    const mesh = new THREE.Mesh(geometry, obj.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.push(mesh);
  });
  return out;
}
