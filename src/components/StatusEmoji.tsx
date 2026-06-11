// Status Critters (D-M2-6): Working 🔨 wiggles, WaitingForPermission 🙋
// bounces ("look at me"). Animation is disabled under prefers-reduced-motion
// both in JS (static variant) and CSS (belt-and-suspenders).
import "./critters.css";
import type { SessionStatus } from "@/ipc/bindings";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "./use-reduced-motion";

export interface Critter {
  emoji: string;
  label: string;
  anim?: "wiggle" | "bounce";
}

export const STATUS_CRITTERS: Record<SessionStatus, Critter> = {
  Working: { emoji: "🔨", label: "working", anim: "wiggle" },
  WaitingForInput: { emoji: "💬", label: "waiting for input" },
  WaitingForPermission: { emoji: "🙋", label: "waiting for permission", anim: "bounce" },
  Idle: { emoji: "😴", label: "idle" },
  Ended: { emoji: "🪦", label: "ended" },
};

export function statusCritter(status: SessionStatus): string {
  return STATUS_CRITTERS[status].emoji;
}

/** Tool Chips (D-M2-6): per-tool emoji, shared by chat tool cards and the activity feed. */
export function toolEmoji(tool: string): string {
  if (tool.startsWith("mcp__crewhub")) return "🏠";
  switch (tool) {
    case "Read":
      return "📖";
    case "Edit":
    case "Write":
      return "✏️";
    case "Bash":
      return "💻";
    case "Grep":
    case "Glob":
      return "🔎";
    case "WebFetch":
      return "🌐";
    default:
      return "🛠️";
  }
}

export function StatusEmoji({
  status,
  title,
  className,
}: {
  status: SessionStatus;
  title?: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const critter = STATUS_CRITTERS[status];
  return (
    <span
      data-testid="status-emoji"
      data-status={status}
      role="img"
      title={title ?? critter.label}
      aria-label={critter.label}
      className={cn(!reduced && critter.anim ? `ch-anim-${critter.anim}` : undefined, className)}
    >
      {critter.emoji}
    </span>
  );
}
