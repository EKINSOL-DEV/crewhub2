/* The sprouts: a bean on short legs with a growth on its head. The species is data (`cast.json`, `figure.json`); the
   only code is the postman's drift, a motion for one role, which the data cannot say. */
import type { CastFactory, CastManifest, FigureExtension, FigureSpec } from "@crewhub/world-cast";
import manifest from "../cast.json" with { type: "json" };
import figure from "../figure.json" with { type: "json" };

/** How high the postman rides under its seed head, and how fast it takes off and lands (per second). */
const LIFT = 0.11;
const TAKE_OFF = 2.5;
const LAND = 3;

/** On its rounds the postman's dandelion carries it: it leaves the ground and its feet paddle the air. */
const drift: FigureExtension = ({ options, joints, state }) => {
  if (options.role !== "postman") return;
  const carried = ["body", "foot-left", "foot-right"].flatMap((id) => joints.get(id) ?? []);
  /** The height each joint was left at and the rise in it, to tell a joint the runtime posed afresh from one it left alone. */
  const left = carried.map(() => Number.NaN);
  let lift = 0;
  let risen = 0;
  return {
    update(seconds) {
      // It sets down as gently as it took off: the walk ends on the ground, not with a drop.
      lift = state().activity === "walking" ? Math.min(1, lift + seconds * TAKE_OFF) : Math.max(0, lift - seconds * LAND);
      const rise = lift * lift * (3 - 2 * lift) * LIFT;
      for (let i = 0; i < carried.length; i++) {
        const position = carried[i]!.position;
        // The walk writes these joints every frame; standing, the runtime may leave them, with the last rise still in.
        if (position.y === left[i]) position.y -= risen;
        position.y += rise;
        left[i] = position.y;
      }
      risen = rise;
    },
    setState(next) {
      // An echo and a stale figure stand still, on the ground (the runtime has just posed them there).
      if (next.proxy || next.activity === "stale") lift = 0;
    },
  };
};

export const cast: CastFactory = { manifest: manifest as CastManifest, figure: figure as unknown as FigureSpec, extend: drift };
export default cast;
