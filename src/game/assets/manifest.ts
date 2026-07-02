// Logical asset ids → built files (M0 T3). The JSON is the single source of
// truth shared with scripts/assets/build-assets.mjs; this module is the typed
// face the app imports.
import raw from "./manifest.json";

export type ModelId = keyof (typeof raw)["models"];

export const MODEL_IDS = Object.keys(raw.models) as ModelId[];

export function modelUrl(id: ModelId): string {
  return `/assets/models/${id}.glb`;
}
