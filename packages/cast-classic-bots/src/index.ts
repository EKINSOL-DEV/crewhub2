/* The classic bots: the soft Greenhouse robots as a cast. All data: the manifest and its colours in `cast.json`, the
   rig, parts, poses, motions and looks in `figure.json`. No code. */
import type { CastFactory, CastManifest, FigureSpec } from "@crewhub/world-cast";
import manifest from "../cast.json" with { type: "json" };
import figure from "../figure.json" with { type: "json" };

export const cast: CastFactory = { manifest: manifest as CastManifest, figure: figure as unknown as FigureSpec };
export default cast;
