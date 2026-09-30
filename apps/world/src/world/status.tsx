/* The one place that maps a session state to the design system's chips. Labels come from `statusLabel`. */
import { Circle, CircleCheck, Contrast } from "lucide-react";
import type { ReactNode } from "react";
import type { SessionStatus } from "@crewhub/protocol";
import { Chip } from "../components/primitives";
import { statusLabel } from "./data";

export const statusIcon = {
  working: <Contrast className="icon" />,
  done: <CircleCheck className="icon" />,
  idle: <Circle className="icon" />,
} as const;

/** The chip for a session. While disconnected every state is a last known one: a stalled chip. */
export function sessionChip(
  status: SessionStatus,
  disconnected = false,
): ReactNode {
  const label = statusLabel[status];
  if (disconnected)
    return <Chip.Stalled>{`Last known: ${label}`}</Chip.Stalled>;
  switch (status) {
    case "working":
      return (
        <Chip.Status value="progress" label={label} icon={statusIcon.working} />
      );
    case "needs-input":
      return <Chip.Attention>{label}</Chip.Attention>;
    case "completed":
      return <Chip.Status value="done" label={label} icon={statusIcon.done} />;
    case "idle":
      return (
        <Chip.Status value="planned" label={label} icon={statusIcon.idle} />
      );
    default:
      return <Chip.Stalled>{label}</Chip.Stalled>;
  }
}
