/* The sprouts: a bean on short legs with a growth on its head. The species is data (`cast.json`, `figure.json`); the
   only code is the postman's drift, a motion for one role, which the data cannot say. */
import type { CastFactory, CastManifest, FigureExtension, FigureSpec } from "@crewhub/world-cast";
import manifest from "../cast.json" with { type: "json" };
import figure from "../figure.json" with { type: "json" };

/** How high the postman rides under its seed head, and how fast it takes off (per second). */
const LIFT = 0.11;
const TAKE_OFF = 2.5;

/** On its rounds the postman's dandelion carries it: it leaves the ground and its feet paddle the air. */
const drift: FigureExtension = ({ options, joints, state }) => {
  if (options.role !== "postman") return;
  const carried = ["body", "foot-left", "foot-right"].flatMap((id) => joints.get(id) ?? []);
  let lift = 0;
  return {
    update(seconds) {
      // The walk moves these joints every frame, so the lift is added to a fresh pose and never piles up.
      lift = state().activity === "walking" ? Math.min(1, lift + seconds * TAKE_OFF) : 0;
      const rise = lift * lift * (3 - 2 * lift) * LIFT;
      if (rise) for (const joint of carried) joint.position.y += rise;
    },
  };
};

export const cast: CastFactory = { manifest: manifest as CastManifest, figure: figure as unknown as FigureSpec, extend: drift };
export default cast;
