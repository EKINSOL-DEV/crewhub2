/* The overgrown bots: the classic bots re-dressed (`extends` in `cast.json`). The whole cast is the colours in
   `cast.json` and the patch in `figure.json`; the rig, the poses and the motion are the classic bots'. No code. */
import type { CastFactory, CastManifest, FigurePatch } from "@crewhub/world-cast";
import manifest from "../cast.json" with { type: "json" };
import figure from "../figure.json" with { type: "json" };

export const cast: CastFactory = { manifest: manifest as CastManifest, figure: figure as unknown as FigurePatch };
export default cast;
