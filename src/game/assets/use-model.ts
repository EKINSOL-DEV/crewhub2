// Model loading (M0 T4): drei useGLTF (meshopt decoding built in) + clone +
// toonify. Each call site gets its own clone — materials are shared via the
// cached gradient map, geometry via the GLTF cache.
import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type * as THREE from "three";
import { toonify } from "@/game/engine/toon";
import { MODEL_IDS, modelUrl, type ModelId } from "./manifest";

export function useModel(id: ModelId): THREE.Group {
  const gltf = useGLTF(modelUrl(id));
  return useMemo(() => {
    const scene = gltf.scene.clone(true) as THREE.Group;
    toonify(scene);
    return scene;
  }, [gltf.scene]);
}

/** Kick off background loads for everything in the manifest. */
export function preloadModels(): void {
  for (const id of MODEL_IDS) useGLTF.preload(modelUrl(id));
}
