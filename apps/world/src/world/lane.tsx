/* The one place that maps a loops lane status to the kit's chips. Words first (townLayout.laneWords), then the icon
   shape, then colour: a lane status is never shown by colour alone, and "done" only means the lane said so. */
import { Circle, CircleCheck, Contrast } from "lucide-react";
import type { Freshness, LaneStatus } from "@crewhub/world-model";
import { Chip } from "../components/primitives";
import { laneWords } from "./townLayout";

export function LaneChip({ status, freshness }: { status: LaneStatus; freshness: Freshness }) {
  const words = laneWords(status, freshness);
  if (freshness.stale || status === "unknown") return <Chip.Stalled title="The team snapshot is older than 5 minutes or missing">{words}</Chip.Stalled>;
  switch (status) {
    case "working":
      return <Chip.Status value="progress" label={words} icon={<Contrast className="icon" aria-hidden="true" />} />;
    case "blocked":
      return <Chip.Attention>{words}</Chip.Attention>;
    case "done":
      return <Chip.Status value="done" label={words} icon={<CircleCheck className="icon" aria-hidden="true" />} />;
    default:
      return <Chip.Status value="planned" label={words} icon={<Circle className="icon" aria-hidden="true" />} />;
  }
}
