/* The shader programs an object will need, made ready before the frame that first draws it.

   A building's interior is built ahead in idle time (buildingView.ts `prepareInterior`) and kept hidden until the
   building is entered; the frame of the enter then paid for what the hidden meshes' materials still lacked: the
   programs their parameters had not been seen in yet (three compiles and links them on first use), and for every
   program drawn for the first time the read-back of its uniform and attribute locations (three's `onFirstUse`: a
   synchronous call into the GPU process per uniform). `warmPrograms` does both ahead, in idle time: three's
   `compileAsync` (parallel where the context has KHR_parallel_shader_compile; it walks hidden objects too), then one
   `getUniforms()` per program once it is linked. Nothing about a material changes: the same parameters, the same
   shader text, the same programs, from the same cache; only earlier. */
import type * as THREE from "three";

/** A compiled program as three keeps it (`WebGLProgram`): the locations are read on the first call. */
export interface WarmableProgram {
  getUniforms(): unknown;
}

/* Tried and dropped (round 23): reading the locations of the programs already linked while the town's first
   compileAsync waits for the rest. At 4x the GPU has linked everything by the time the CPU has written the last
   program, so the reads only lengthened the wait; unthrottled the GPU is still linking, and every location query then
   stalls behind the links (three times the cost of the same reads in the first frame). The first frame reads them. */

/** What three keeps per material (`WebGLProperties`, typed unknown there): the program it currently draws with. */
export interface MaterialProperties {
  currentProgram?: WarmableProgram | null | undefined;
}

/** The part of a `WebGLRenderer` the warm uses. */
export interface ProgramWarmer {
  compileAsync(object: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Promise<unknown>;
  properties: { get(material: THREE.Material): unknown };
}

/** Every material under `object`, hidden objects included (three's `compile` walks them too), each once. */
export function materialsOf(object: THREE.Object3D): THREE.Material[] {
  const seen = new Set<THREE.Material>();
  object.traverse((o) => {
    const material = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const m of Array.isArray(material) ? material : [material]) seen.add(m);
  });
  return [...seen];
}

/**
 * Compiles the programs `object` needs under `camera` in `scene` and reads their locations; resolves with the number
 * of programs touched. `alive` is asked after the compile (the object may be gone by then: nothing is read for it).
 * A failed compile (a lost context) is a warm that did nothing.
 */
export async function warmPrograms(renderer: ProgramWarmer, object: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene, alive: () => boolean = () => true): Promise<number> {
  await renderer.compileAsync(object, camera, scene).catch(() => undefined);
  if (!alive()) return 0;
  const programs = new Set<WarmableProgram>();
  for (const material of materialsOf(object)) {
    const program = (renderer.properties.get(material) as MaterialProperties | undefined)?.currentProgram;
    if (program) programs.add(program);
  }
  for (const program of programs) program.getUniforms();
  return programs.size;
}
