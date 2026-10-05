/* The potlings: walking terracotta flowerpots. The whole cast is data (`cast.json`, `figure.json`); the generic figure
   runtime of `@crewhub/world-cast` draws it. */
import type { CastFactory, CastManifest, FigureSpec } from "@crewhub/world-cast";
import manifest from "../cast.json" with { type: "json" };
import figure from "../figure.json" with { type: "json" };

export const cast: CastFactory = { manifest: manifest as CastManifest, figure: figure as unknown as FigureSpec };
export default cast;
